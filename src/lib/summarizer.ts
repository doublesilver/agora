/* 종료 시 최종 산출물(final artifact) 생성 — API 모드 3종 + CLI 모드 3종 모두 지원.
 * speak() 우회: PASS 규약·라운드 시그널 없이 transcript 스냅샷을 한 번만 압축한다.
 * 실시간 요약(rolling)은 호출 비용·UX 노이즈 균형이 맞지 않아 1차 제출 범위에서 제외. */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { AgentId, TranscriptEvent } from "./agents/types";
import { serializeTranscript } from "./agents/adapter-helpers";
import { resolveCliBin, runCliOneshot } from "./agents/cli-stream";
import { emitEvent, type SessionState } from "./session-store";

const now = (): number => Date.now();

/** API 모드 단발 호출 타임아웃. 라운드 첫 토큰 60s보다 약간 짧게. */
const API_TIMEOUT_MS = 45_000;
/** CLI 모드 단발 호출 타임아웃. cold-start 25~40s 흡수용으로 더 길게. */
const CLI_TIMEOUT_MS = 90_000;

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

async function callClaudeApi(
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

async function callGptApi(
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

async function callGeminiApi(
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

/** CLI 모드 — 1st-party CLI를 단발 호출. 시스템 프롬프트는 user 프롬프트 앞에 inline.
 * Claude/Gemini는 -p 플래그, Codex는 exec 서브커맨드. 출력은 stdout plain text. */
async function callClaudeCli(
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const prompt = `${systemPrompt}\n\n---\n\n${userText}`;
  return runCliOneshot(
    resolveCliBin("claude"),
    ["-p", prompt],
    signal,
    CLI_TIMEOUT_MS,
  );
}

async function callCodexCli(
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const prompt = `${systemPrompt}\n\n---\n\n${userText}`;
  return runCliOneshot(
    resolveCliBin("codex"),
    ["exec", "--skip-git-repo-check", "--sandbox", "read-only", prompt],
    signal,
    CLI_TIMEOUT_MS,
  );
}

async function callGeminiCli(
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const prompt = `${systemPrompt}\n\n---\n\n${userText}`;
  return runCliOneshot(
    resolveCliBin("gemini"),
    ["-p", prompt, "-y", "-m", "gemini-2.5-flash"],
    signal,
    CLI_TIMEOUT_MS,
  );
}

async function callSummarizer(
  spec: SpecLookup,
  systemPrompt: string,
  userText: string,
  externalAbort?: AbortSignal,
): Promise<string> {
  const ac = new AbortController();
  const timeoutMs = spec.mode === "api" ? API_TIMEOUT_MS : CLI_TIMEOUT_MS;
  const timeout = setTimeout(() => ac.abort("summarize-timeout"), timeoutMs);
  // 사용자 STOP/세션 abort 시 timeout 끝까지 매달리지 않게 합성.
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
    if (spec.mode === "api") {
      if (!spec.apiKey) {
        throw new Error("summarizer: apiKey 누락 — 요약 담당 키 확인.");
      }
      switch (spec.summarizerId) {
        case "claude":
          return await callClaudeApi(
            spec.apiKey,
            systemPrompt,
            userText,
            ac.signal,
          );
        case "codex":
          return await callGptApi(
            spec.apiKey,
            systemPrompt,
            userText,
            ac.signal,
          );
        case "gemini":
          return await callGeminiApi(
            spec.apiKey,
            systemPrompt,
            userText,
            ac.signal,
          );
      }
    } else {
      switch (spec.summarizerId) {
        case "claude":
          return await callClaudeCli(systemPrompt, userText, ac.signal);
        case "codex":
          return await callCodexCli(systemPrompt, userText, ac.signal);
        case "gemini":
          return await callGeminiCli(systemPrompt, userText, ac.signal);
      }
    }
    throw new Error(`summarizer: 지원 안 된 id ${spec.summarizerId}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runFinalArtifact(state: SessionState): Promise<void> {
  const spec = findSpec(state);
  if (!spec) return;
  const transcript = state.transcript.snapshot();
  if (transcript.length < 2) return;

  // 사용자가 "결과 보려고 STOP"을 누른 시나리오에서는 sessionAbort가 fire된
  // 직후 호출이 시작된다. sessionAbort를 합성하면 즉시 throw → summary_error만
  // 남고 final_artifact가 안 뜬다. 그래서 자체 timeout만 적용해 산출물을
  // 끝까지 기다린다 (API 45s, CLI 90s).
  try {
    const text = await callSummarizer(
      spec,
      FINAL_INSTRUCTION,
      transcriptText(transcript),
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
