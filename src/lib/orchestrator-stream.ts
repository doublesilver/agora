/* 토큰 스트림 소비 — 첫 토큰 race + 토큰 루프 + 에러 수습.
 * agent_end / agent_timeout / agent_error는 모두 이 함수가 단독으로 emit한다.
 * speakOnce는 transcript push와 usage만 책임 — 이중 emit 방지. */
import type { AgentAdapter } from "./agents/types";
import { AGENT_FIRST_TOKEN_TIMEOUT_MS } from "./constants";
import { type SessionState, emitEvent } from "./session-store";

const now = (): number => Date.now();

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted/i.test(err.message ?? ""))
  );
}

export interface StreamResult {
  fullText: string;
  /** agent_error로 종료된 경우 true — speakOnce가 transcript push·usage 모두 skip. */
  errored: boolean;
}

export async function streamSpeakerTokens(
  state: SessionState,
  speaker: AgentAdapter,
  stream: AsyncIterable<string>,
): Promise<StreamResult> {
  let fullText = "";

  const emitEnd = (interrupted: boolean): void => {
    emitEvent(state, {
      type: "agent_end",
      agentId: speaker.id,
      turn: state.turn,
      fullText,
      interrupted,
      ts: now(),
    });
  };

  // STOP 시점에 stream이 이미 만들어졌어도 토큰을 흘리지 않게 가드.
  if (state.sessionAbort.signal.aborted) {
    emitEnd(true);
    return { fullText: "", errored: false };
  }

  const iter = stream[Symbol.asyncIterator]();
  try {
    const abortPromise = new Promise<{ kind: "aborted" }>((resolve) => {
      if (state.sessionAbort.signal.aborted) {
        resolve({ kind: "aborted" });
        return;
      }
      state.sessionAbort.signal.addEventListener(
        "abort",
        () => resolve({ kind: "aborted" }),
        { once: true },
      );
    });

    const firstChunkRace = await Promise.race<{
      kind: "first" | "done" | "timeout" | "aborted";
      value?: string;
    }>([
      (async () => {
        const r = await iter.next();
        if (r.done) return { kind: "done" as const };
        return { kind: "first" as const, value: r.value };
      })(),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ kind: "timeout" as const }),
          AGENT_FIRST_TOKEN_TIMEOUT_MS,
        ),
      ),
      abortPromise,
    ]);

    if (firstChunkRace.kind === "aborted") {
      emitEnd(true);
      return { fullText: "", errored: false };
    }

    if (firstChunkRace.kind === "timeout") {
      // 발화자 강제 중단 + 이번 라운드의 이 발화자만 timeout 처리.
      state.roundAbort.abort("first-token-timeout");
      emitEvent(state, {
        type: "agent_timeout",
        agentId: speaker.id,
        turn: state.turn,
        timeoutMs: AGENT_FIRST_TOKEN_TIMEOUT_MS,
        ts: now(),
      });
      emitEnd(true);
      return { fullText: "", errored: false };
    }

    if (firstChunkRace.kind === "first" && firstChunkRace.value) {
      if (state.sessionAbort.signal.aborted) {
        emitEnd(true);
        return { fullText: "", errored: false };
      }
      fullText += firstChunkRace.value;
      emitEvent(state, {
        type: "token",
        agentId: speaker.id,
        turn: state.turn,
        text: firstChunkRace.value,
        ts: now(),
      });
    }

    while (true) {
      if (state.sessionAbort.signal.aborted) break;
      if (state.roundAbort.signal.aborted) break;
      if (now() - state.startedAt >= state.limits.maxSessionDurationMs) {
        state.sessionAbort.abort("time");
        break;
      }
      const r = await iter.next();
      if (r.done) break;
      if (state.sessionAbort.signal.aborted) break;
      fullText += r.value;
      emitEvent(state, {
        type: "token",
        agentId: speaker.id,
        turn: state.turn,
        text: r.value,
        ts: now(),
      });
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
      // agent_error로 종료 — agent_end는 emit하지 않는다(이중 noise 방지).
      return { fullText: "", errored: true };
    }
    // AbortError는 정상 인터럽트 흐름.
  }

  // 정상 종료(또는 abort로 끊김) — 한 번만 agent_end emit.
  const interrupted =
    state.roundAbort.signal.aborted || state.sessionAbort.signal.aborted;
  emitEnd(interrupted);
  return { fullText, errored: false };
}
