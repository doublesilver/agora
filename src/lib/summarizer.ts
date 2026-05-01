/* 요약 담당 에이전트 단발 호출 — rolling/final 두 모드.
 * speak() 우회: PASS 규약·라운드 시그널 없이 transcript 스냅샷을 한 번만 압축한다.
 * 1차 구현 범위: API 모드 3종(Claude/GPT/Gemini). CLI 모드는 silent skip + 에러 이벤트 X. */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { AgentId, TranscriptEvent } from "./agents/types";
import { serializeTranscript } from "./agents/adapter-helpers";
import { emitEvent, type SessionState } from "./session-store";

const now = (): number => Date.now();

/** 단발 호출 타임아웃 — 라운드 첫 토큰 60s보다 약간 짧게. 요약은 빠르게 끊어준다. */
const SUMMARIZE_TIMEOUT_MS = 45_000;

const ROLLING_INSTRUCTION = `You are the SCRIBE of an ongoing multi-agent debate.
Read the transcript and write a SHORT live summary (Korean, 4–8 bullet points or under 600 characters):
- 토론이 지금 어디까지 와 있는지
- 합의된 점 / 아직 갈리는 점
- 다음 라운드에서 다뤄야 할 핵심 질문 1~2개

규칙: 새로운 의견을 추가하지 말 것. 이미 transcript에 있는 내용만 정리. 간결한 markdown bullets.`;

const FINAL_INSTRUCTION = `You are the SCRIBE producing the FINAL artifact of the debate.
Korean markdown only. 4 sections, in this exact order:

## 결론
2~4문장으로 핵심 결론. 합의된 방향 + 가장 강한 근거.

## 핵심 논점
- 라운드를 거치며 부딪힌 주요 논점들 (3~6개 bullet)

## 미해결
- 시간/정보 부족으로 결론 못 내린 항목 (없으면 "없음")

## 액션 아이템
- 다음 단계로 가져갈 구체 작업 (없으면 "없음")

규칙: transcript에 없는 새 정보를 만들지 말 것. 간결, 단정형. 헤더 4개 모두 반드시 포함.`;

interface SpecLookup {
  summarizerId: AgentId;
  apiKey?: string;
  mode: "api" | "cli";
}

function findSpec(state: SessionState): SpecLookup | null {
  if (!state.summarizerId) return null;
  const spec = state.agentSpecs.find((s) => s.id === state.summarizerId);
  if (!spec) return null;
  return { summarizerId: spec.id, apiKey: spec.apiKey, mode: spec.mode };
}

function transcriptText(events: TranscriptEvent[]): string {
  return serializeTranscript(events);
}

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create(
    {
      model: "claude-opus-4-7",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
    },
    { signal },
  );
  const block = res.content.find((c) => c.type === "text");
  return block && block.type === "text" ? block.text : "";
}

async function callGpt(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create(
    {
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_completion_tokens: 1024,
    },
    { signal },
  );
  return res.choices[0]?.message?.content ?? "";
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    config: { systemInstruction: systemPrompt, abortSignal: signal },
    contents: [{ role: "user", parts: [{ text: userText }] }],
  });
  return res.text ?? "";
}

async function callSummarizer(
  spec: SpecLookup,
  systemPrompt: string,
  userText: string,
  externalAbort?: AbortSignal,
): Promise<string> {
  if (spec.mode !== "api") {
    throw new Error(
      "summarizer: CLI 모드 요약은 1차 구현 범위 외. API 모드 어댑터를 요약 담당으로 선택하세요.",
    );
  }
  if (!spec.apiKey) {
    throw new Error(
      "summarizer: apiKey 누락 — 요약 담당 에이전트의 키를 확인.",
    );
  }
  const ac = new AbortController();
  const timeout = setTimeout(
    () => ac.abort("summarize-timeout"),
    SUMMARIZE_TIMEOUT_MS,
  );
  // 사용자 STOP/세션 abort 시 SUMMARIZE_TIMEOUT_MS 끝까지 매달리지 않게 합성.
  // 미합성 시 STOP 후 UI가 최대 45s "running" 상태로 hang.
  if (externalAbort) {
    if (externalAbort.aborted) ac.abort(externalAbort.reason);
    else
      externalAbort.addEventListener(
        "abort",
        () => ac.abort(externalAbort.reason),
        { once: true },
      );
  }
  try {
    switch (spec.summarizerId) {
      case "claude":
        return await callClaude(spec.apiKey, systemPrompt, userText, ac.signal);
      case "codex":
        return await callGpt(spec.apiKey, systemPrompt, userText, ac.signal);
      case "gemini":
        return await callGemini(spec.apiKey, systemPrompt, userText, ac.signal);
      default:
        throw new Error(`summarizer: 지원 안 된 id ${spec.summarizerId}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function runRollingSummary(state: SessionState): Promise<void> {
  // AGORA_FAKE=1 백업 시연에서는 어댑터가 fake echo이므로 요약도 실호출하지 않는다.
  // 키가 잘못 들어가 있어도 fake 모드 일관성을 깨뜨리지 않게 silent skip.
  if (process.env.AGORA_FAKE === "1") return;
  const spec = findSpec(state);
  if (!spec) return;
  const transcript = state.transcript.snapshot();
  if (transcript.length < 2) return; // 사용자 메시지 1개뿐이면 요약할 게 없음.

  try {
    const text = await callSummarizer(
      spec,
      ROLLING_INSTRUCTION,
      transcriptText(transcript),
      state.sessionAbort.signal,
    );
    if (!text.trim()) return;
    state.lastSummaryText = text;
    emitEvent(state, {
      type: "summary_update",
      text,
      atTurn: state.turn,
      summarizerId: spec.summarizerId,
      ts: now(),
    });
  } catch (err) {
    emitEvent(state, {
      type: "summary_error",
      stage: "rolling",
      message: ((err as Error)?.message ?? String(err)).slice(0, 300),
      ts: now(),
    });
  }
}

export async function runFinalArtifact(state: SessionState): Promise<void> {
  if (process.env.AGORA_FAKE === "1") return;
  const spec = findSpec(state);
  if (!spec) return;
  const transcript = state.transcript.snapshot();
  if (transcript.length < 2) return;

  try {
    const text = await callSummarizer(
      spec,
      FINAL_INSTRUCTION,
      transcriptText(transcript),
      state.sessionAbort.signal,
    );
    if (!text.trim()) return;
    emitEvent(state, {
      type: "final_artifact",
      text,
      summarizerId: spec.summarizerId,
      ts: now(),
    });
  } catch (err) {
    emitEvent(state, {
      type: "summary_error",
      stage: "final",
      message: ((err as Error)?.message ?? String(err)).slice(0, 300),
      ts: now(),
    });
  }
}
