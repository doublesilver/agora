/* 토큰 스트림 소비 — 첫 토큰 race + 토큰 루프 + 에러 수습. */
import type { AgentAdapter } from "./agents/types";
import {
  AGENT_FIRST_TOKEN_TIMEOUT_MS,
  MAX_SESSION_DURATION_MS,
} from "./constants";
import { type SessionState, emitEvent } from "./session-store";

const now = (): number => Date.now();

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted/i.test(err.message ?? ""))
  );
}

/** 첫 토큰 race + 토큰 루프 + 에러 수습. fullText 반환. */
export async function streamSpeakerTokens(
  state: SessionState,
  speaker: AgentAdapter,
  stream: AsyncIterable<string>,
): Promise<string> {
  let fullText = "";
  // STOP 시점에 이미 stream이 만들어졌어도 토큰을 단 한 개도 흘리지 않게 가드.
  if (state.sessionAbort.signal.aborted) return "";
  const iter = stream[Symbol.asyncIterator]();
  try {
    // 첫 토큰 도착 전까지 AGENT_FIRST_TOKEN_TIMEOUT_MS 캡. 늦으면 round abort + timeout.
    // sessionAbort가 fire되면 race도 즉시 종료되도록 race 슬롯을 추가.
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
      return "";
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
      // 빈 agent_end로 streaming bubble 정리 → UI가 timeout 메시지로 마킹.
      emitEvent(state, {
        type: "agent_end",
        agentId: speaker.id,
        turn: state.turn,
        fullText: "",
        interrupted: true,
        ts: now(),
      });
      return "";
    }

    if (firstChunkRace.kind === "first" && firstChunkRace.value) {
      // 첫 토큰 도착과 STOP이 겹친 race window 추가 가드.
      if (state.sessionAbort.signal.aborted) return "";
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
      if (now() - state.startedAt >= MAX_SESSION_DURATION_MS) {
        state.sessionAbort.abort("time");
        break;
      }
      const r = await iter.next();
      if (r.done) break;
      // iter.next() 도중 STOP이 fire됐을 수 있으므로 emit 전에 한 번 더 가드.
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
    }
  }
  return fullText;
}
