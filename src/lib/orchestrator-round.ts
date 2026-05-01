/* 라운드 실행 — 화자 회전 + 직렬 호출 + speakOnce 단위 처리.
 * AGENTS.md A3 직렬 라운드 알고리즘. */
import type { AgentAdapter, SpeakInput, SpeakResult } from "./agents/types";
import { PASS_INSTRUCTION, PASS_TOKEN } from "./agents/types";
import { AGENT_FIRST_TOKEN_TIMEOUT_MS, MAX_SESSION_TOKENS } from "./constants";
import { type SessionState, anySignal, emitEvent } from "./session-store";
import { streamSpeakerTokens } from "./orchestrator-stream";

const now = (): number => Date.now();

function rotate<T>(arr: T[], shift: number): T[] {
  if (arr.length === 0) return [];
  const k = ((shift % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

type GuardedSpeak =
  | { kind: "pass" }
  | {
      kind: "speak";
      stream: AsyncIterable<string>;
      usage?: () => Promise<{ inputTokens: number; outputTokens: number }>;
    }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

async function callSpeakerGuarded(
  speaker: AgentAdapter,
  input: SpeakInput,
  timeoutMs: number,
): Promise<GuardedSpeak> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<GuardedSpeak>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });
  try {
    const result = await Promise.race<SpeakResult | GuardedSpeak>([
      speaker.speak(input),
      timeoutPromise,
    ]);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    return result as GuardedSpeak;
  } catch (err) {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    return { kind: "error", message: (err as Error)?.message ?? String(err) };
  }
}

/** 발화자 1명 처리. 발화하면 true, PASS/timeout/error면 false. */
async function speakOnce(
  state: SessionState,
  speaker: AgentAdapter,
): Promise<boolean> {
  const signal = anySignal([
    state.roundAbort.signal,
    state.sessionAbort.signal,
  ]);
  const baseSystem = state.systemPrompts.get(speaker.id) ?? "";
  const systemPrompt = `${baseSystem}\n\n${PASS_INSTRUCTION}`;
  const input: SpeakInput = {
    transcript: state.transcript.snapshot(),
    systemPrompt,
    signal,
  };

  const result = await callSpeakerGuarded(
    speaker,
    input,
    AGENT_FIRST_TOKEN_TIMEOUT_MS,
  );

  if (result.kind === "pass") {
    emitEvent(state, {
      type: "agent_pass",
      agentId: speaker.id,
      turn: state.turn,
      ts: now(),
    });
    return false;
  }
  if (result.kind === "timeout") {
    emitEvent(state, {
      type: "agent_timeout",
      agentId: speaker.id,
      turn: state.turn,
      timeoutMs: AGENT_FIRST_TOKEN_TIMEOUT_MS,
      ts: now(),
    });
    return false;
  }
  if (result.kind === "error") {
    emitEvent(state, {
      type: "agent_error",
      agentId: speaker.id,
      turn: state.turn,
      message: result.message.slice(0, 500),
      ts: now(),
    });
    return false;
  }

  emitEvent(state, {
    type: "agent_start",
    agentId: speaker.id,
    turn: state.turn,
    ts: now(),
    model: speaker.model,
  });

  const fullText = await streamSpeakerTokens(state, speaker, result.stream);

  const interrupted =
    state.roundAbort.signal.aborted || state.sessionAbort.signal.aborted;

  // 응답 trim 후 정확히 PASS면 발언 아닌 PASS로 처리.
  if (fullText.trim() === PASS_TOKEN) {
    emitEvent(state, {
      type: "agent_pass",
      agentId: speaker.id,
      turn: state.turn,
      ts: now(),
    });
    return false;
  }

  emitEvent(state, {
    type: "agent_end",
    agentId: speaker.id,
    turn: state.turn,
    fullText,
    interrupted,
    ts: now(),
  });
  if (fullText.length > 0) {
    state.transcript.push({
      role: speaker.id,
      text: fullText,
      ts: now(),
      turn: state.turn,
    });
  }

  if (result.usage) {
    try {
      const u = await result.usage();
      state.sessionTokens += u.inputTokens + u.outputTokens;
      emitEvent(state, {
        type: "usage",
        agentId: speaker.id,
        turn: state.turn,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        sessionTotal: state.sessionTokens,
        ts: now(),
      });
    } catch {
      // usage 실패는 비치명.
    }
  }

  return true;
}

/** 한 라운드 = 화자 회전 순서대로 직렬 호출. anySpeak 반환. */
export async function runRound(state: SessionState): Promise<boolean> {
  state.roundAbort = new AbortController();
  const speakerOrder = rotate(state.agents, state.turn);
  let anySpeak = false;

  for (const speaker of speakerOrder) {
    if (state.sessionAbort.signal.aborted) break;
    if (state.roundAbort.signal.aborted) break;

    const spoke = await speakOnce(state, speaker);
    if (spoke) anySpeak = true;

    if (state.sessionTokens >= MAX_SESSION_TOKENS) break;
  }

  return anySpeak;
}
