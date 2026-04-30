/* 오케스트레이터 — AGENTS.md A3/A6/A7/A8 직렬 라운드 알고리즘. */
import type {
  AgentAdapter,
  AgentId,
  SpeakInput,
  SpeakResult,
} from "./agents/types";
import { PASS_INSTRUCTION, PASS_TOKEN } from "./agents/types";
import { resolveSystemPrompt } from "./agents/role-seeds";
import {
  AGENT_FIRST_TOKEN_TIMEOUT_MS,
  MAX_CONSECUTIVE_PASS,
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_TOKENS,
  MAX_TURNS,
} from "./constants";
import {
  Notifier,
  type SessionState,
  anySignal,
  emitEvent,
  type InterveneMode,
} from "./session-store";
import { Transcript } from "./transcript";

const now = (): number => Date.now();

interface CreateSessionOptions {
  id: string;
  agents: AgentAdapter[];
  systemPrompts: Partial<Record<AgentId, string>>;
  userPrompt: string;
}

export function createSessionState(opts: CreateSessionOptions): SessionState {
  const systemPrompts = new Map<AgentId, string>();
  for (const agent of opts.agents) {
    systemPrompts.set(
      agent.id,
      resolveSystemPrompt(agent.id, opts.systemPrompts[agent.id]),
    );
  }

  const transcript = new Transcript();
  transcript.push({ role: "user", text: opts.userPrompt, ts: now() });

  return {
    id: opts.id,
    agents: opts.agents,
    systemPrompts,
    transcript,
    userQueue: [],
    turn: 0,
    consecutivePass: 0,
    status: "running",
    sessionAbort: new AbortController(),
    roundAbort: new AbortController(),
    sessionTokens: 0,
    startedAt: now(),
    notifier: new Notifier(),
    listeners: new Set(),
    closers: [],
  };
}

/** 외부 트리거. */
export function intervene(
  state: SessionState,
  text: string,
  mode: InterveneMode,
): void {
  state.userQueue.push({ text, mode });
  if (mode === "interrupt") {
    state.roundAbort.abort("interrupt");
  }
  state.notifier.notify();
}

export function pause(state: SessionState): void {
  if (state.status === "running" || state.status === "idle") {
    state.status = "paused";
    emitEvent(state, { type: "status", value: "paused", ts: now() });
    state.notifier.notify();
  }
}

export function resume(state: SessionState): void {
  if (state.status === "paused" || state.status === "idle") {
    state.status = "running";
    emitEvent(state, { type: "status", value: "running", ts: now() });
    state.notifier.notify();
  }
}

export function stop(state: SessionState): void {
  state.sessionAbort.abort("stop");
  state.notifier.notify();
}

export function setSystemPrompt(
  state: SessionState,
  agentId: AgentId,
  prompt: string,
): void {
  const resolved = resolveSystemPrompt(agentId, prompt);
  state.systemPrompts.set(agentId, resolved);
  emitEvent(state, {
    type: "system_prompt_change",
    agentId,
    prompt: resolved,
    ts: now(),
  });
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted/i.test(err.message ?? ""))
  );
}

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

export async function runSession(state: SessionState): Promise<void> {
  emitEvent(state, {
    type: "session_start",
    sessionId: state.id,
    agents: state.agents.map((a) => ({ id: a.id, mode: a.mode })),
    systemPrompts: Object.fromEntries(state.systemPrompts.entries()) as Record<
      string,
      string
    >,
    userPrompt: state.transcript.snapshot()[0]?.text ?? "",
    ts: now(),
  });
  emitEvent(state, { type: "status", value: "running", ts: now() });

  outer: while (true) {
    if (state.sessionAbort.signal.aborted) {
      emitEvent(state, { type: "session_end", reason: "user_stop", ts: now() });
      break;
    }
    if (state.turn >= MAX_TURNS) {
      emitEvent(state, { type: "session_end", reason: "max_turns", ts: now() });
      break;
    }
    if (state.sessionTokens >= MAX_SESSION_TOKENS) {
      emitEvent(state, {
        type: "session_end",
        reason: "budget_exceeded",
        ts: now(),
      });
      break;
    }
    if (now() - state.startedAt >= MAX_SESSION_DURATION_MS) {
      emitEvent(state, {
        type: "session_end",
        reason: "time_exceeded",
        ts: now(),
      });
      break;
    }

    while (state.status === "paused") {
      await Promise.race([
        state.notifier.wait(),
        abortPromise(state.sessionAbort.signal),
      ]);
      if (state.sessionAbort.signal.aborted) break outer;
    }

    while (state.userQueue.length > 0) {
      const msg = state.userQueue.shift()!;
      state.transcript.push({ role: "user", text: msg.text, ts: now() });
      emitEvent(state, {
        type: "user_message",
        text: msg.text,
        mode: msg.mode,
        ts: now(),
      });
    }

    state.roundAbort = new AbortController();
    const speakerOrder = rotate(state.agents, state.turn);
    let anySpeak = false;

    for (const speaker of speakerOrder) {
      if (state.sessionAbort.signal.aborted) break;
      if (state.roundAbort.signal.aborted) break;

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
        continue;
      }
      if (result.kind === "timeout") {
        emitEvent(state, {
          type: "agent_timeout",
          agentId: speaker.id,
          turn: state.turn,
          timeoutMs: AGENT_FIRST_TOKEN_TIMEOUT_MS,
          ts: now(),
        });
        continue;
      }
      if (result.kind === "error") {
        emitEvent(state, {
          type: "agent_error",
          agentId: speaker.id,
          turn: state.turn,
          message: result.message.slice(0, 500),
          ts: now(),
        });
        continue;
      }

      // speak
      emitEvent(state, {
        type: "agent_start",
        agentId: speaker.id,
        turn: state.turn,
        ts: now(),
      });
      let fullText = "";
      try {
        for await (const chunk of result.stream) {
          fullText += chunk;
          emitEvent(state, {
            type: "token",
            agentId: speaker.id,
            turn: state.turn,
            text: chunk,
            ts: now(),
          });
          if (state.sessionAbort.signal.aborted) break;
          // 시간 캡 청크 단위 체크
          if (now() - state.startedAt >= MAX_SESSION_DURATION_MS) {
            state.sessionAbort.abort("time");
            break;
          }
        }
      } catch (err) {
        if (!isAbortError(err)) {
          emitEvent(state, {
            type: "agent_error",
            agentId: speaker.id,
            turn: state.turn,
            message: (err as Error)?.message ?? String(err),
            ts: now(),
          });
        }
      }
      const interrupted = state.roundAbort.signal.aborted;

      // 응답 trim 후 정확히 PASS면 발언 아닌 PASS로 처리
      if (fullText.trim() === PASS_TOKEN) {
        emitEvent(state, {
          type: "agent_pass",
          agentId: speaker.id,
          turn: state.turn,
          ts: now(),
        });
      } else {
        anySpeak = true;
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
          if (state.sessionTokens >= MAX_SESSION_TOKENS) {
            // 다음 라운드 가드에서 budget_exceeded 처리되도록 break.
            break;
          }
        } catch {
          // usage 실패는 비치명.
        }
      }
    }

    state.consecutivePass = anySpeak ? 0 : state.consecutivePass + 1;

    if (
      state.consecutivePass >= MAX_CONSECUTIVE_PASS &&
      state.userQueue.length === 0 &&
      !state.roundAbort.signal.aborted &&
      !state.sessionAbort.signal.aborted
    ) {
      state.status = "idle";
      emitEvent(state, { type: "status", value: "idle", ts: now() });
      while (
        state.status === "idle" &&
        state.userQueue.length === 0 &&
        !state.sessionAbort.signal.aborted
      ) {
        await Promise.race([
          state.notifier.wait(),
          abortPromise(state.sessionAbort.signal),
        ]);
      }
      state.consecutivePass = 0;
      if (state.status === "idle") {
        state.status = "running";
        emitEvent(state, { type: "status", value: "running", ts: now() });
      }
    }

    state.turn += 1;
  }

  state.status = "stopped";
  emitEvent(state, { type: "status", value: "stopped", ts: now() });

  for (const close of state.closers) {
    try {
      await close();
    } catch (err) {
      console.error("[session] closer error:", err);
    }
  }
}

function abortPromise(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
