/* 오케스트레이터 entry — AGENTS.md A3/A6/A7/A8 직렬 라운드 알고리즘. */
import type { AgentAdapter, AgentId } from "./agents/types";
import type { AgentSpec } from "./agent-factory";
import { resolveSystemPrompt } from "./agents/role-seeds";
import {
  MAX_CONSECUTIVE_PASS,
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_TOKENS,
  MAX_TURNS,
} from "./constants";
import {
  Notifier,
  type SessionLimits,
  type SessionState,
  emitEvent,
  type InterveneMode,
} from "./session-store";
import { Transcript } from "./transcript";
import { runRound } from "./orchestrator-round";
import { runFinalArtifact } from "./summarizer";

const now = (): number => Date.now();

interface CreateSessionOptions {
  id: string;
  agents: AgentAdapter[];
  agentSpecs: AgentSpec[];
  systemPrompts: Partial<Record<AgentId, string>>;
  userPrompt: string;
  summarizerId?: AgentId;
  /** 사용자 override. 미지정·잘못된 값은 constants default로 fallback. */
  limits?: Partial<SessionLimits>;
}

/** 안전 범위 [min, max]로 clamp. 사용자가 비정상 값을 보내도 시스템은 보호. */
function clampLimits(input?: Partial<SessionLimits>): SessionLimits {
  const turns = Number(input?.maxTurns);
  const tokens = Number(input?.maxSessionTokens);
  const ms = Number(input?.maxSessionDurationMs);
  return {
    maxTurns:
      Number.isFinite(turns) && turns >= 1 && turns <= 200
        ? Math.floor(turns)
        : MAX_TURNS,
    maxSessionTokens:
      Number.isFinite(tokens) && tokens >= 1_000 && tokens <= 1_000_000
        ? Math.floor(tokens)
        : MAX_SESSION_TOKENS,
    maxSessionDurationMs:
      Number.isFinite(ms) && ms >= 30_000 && ms <= 60 * 60_000
        ? Math.floor(ms)
        : MAX_SESSION_DURATION_MS,
  };
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
    agentSpecs: opts.agentSpecs,
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
    eventLog: [],
    closers: [],
    summarizerId: opts.summarizerId,
    errorStreak: new Map(),
    limits: clampLimits(opts.limits),
  };
}

/** 외부 트리거 — 인터럽트는 roundAbort fire, queue는 다음 라운드 반영. */
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

type SessionEndReason =
  | "user_stop"
  | "max_turns"
  | "budget_exceeded"
  | "time_exceeded";

/** 매 라운드 시작 전 가드. 종료 사유 반환 시 세션 종료.
 * state.limits는 사용자 override가 적용된 값(constants default fallback). */
function checkSessionGate(state: SessionState): SessionEndReason | null {
  if (state.sessionAbort.signal.aborted) return "user_stop";
  if (state.turn >= state.limits.maxTurns) return "max_turns";
  if (state.sessionTokens >= state.limits.maxSessionTokens)
    return "budget_exceeded";
  if (now() - state.startedAt >= state.limits.maxSessionDurationMs)
    return "time_exceeded";
  return null;
}

/** paused 상태 유지 시 깨어날 때까지 대기. true 반환 시 세션 abort 발생. */
async function waitWhilePaused(state: SessionState): Promise<boolean> {
  while (state.status === "paused") {
    await Promise.race([
      state.notifier.wait(),
      abortPromise(state.sessionAbort.signal),
    ]);
    if (state.sessionAbort.signal.aborted) return true;
  }
  return false;
}

function drainUserQueue(state: SessionState): void {
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
}

/** consecutivePass 누적 + idle 진입 조건 충족 시 사용자 입력 대기. true 반환 시 세션 abort. */
async function maybeEnterIdle(
  state: SessionState,
  anySpeak: boolean,
): Promise<boolean> {
  state.consecutivePass = anySpeak ? 0 : state.consecutivePass + 1;

  if (
    state.consecutivePass < MAX_CONSECUTIVE_PASS ||
    state.userQueue.length > 0 ||
    state.roundAbort.signal.aborted ||
    state.sessionAbort.signal.aborted
  ) {
    return false;
  }

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
  if (state.sessionAbort.signal.aborted) return true;
  if (state.status === "idle") {
    state.status = "running";
    emitEvent(state, { type: "status", value: "running", ts: now() });
  }
  return false;
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
    limits: state.limits,
    ts: now(),
  });
  emitEvent(state, { type: "status", value: "running", ts: now() });

  // session_end는 한 번만 emit. paused/idle 중 STOP 경로에서 중복 가능성 방지.
  let ended = false;
  const endOnce = (reason: SessionEndReason): void => {
    if (ended) return;
    ended = true;
    emitEvent(state, { type: "session_end", reason, ts: now() });
  };

  let endReason: SessionEndReason | null = null;

  while (true) {
    const reason = checkSessionGate(state);
    if (reason) {
      endReason = reason;
      break;
    }

    if (await waitWhilePaused(state)) {
      endReason = "user_stop";
      break;
    }

    drainUserQueue(state);

    const anySpeak = await runRound(state);

    if (await maybeEnterIdle(state, anySpeak)) {
      endReason = "user_stop";
      break;
    }

    state.turn += 1;
  }

  // 종료 사유 emit 직전에 final 산출물 생성 — UI가 stopped 상태로 들어가기 전에
  // 마지막 결과 카드가 final_artifact 이벤트를 통해 도착하도록.
  if (state.summarizerId) {
    try {
      await runFinalArtifact(state);
    } catch (err) {
      console.error("[session] final artifact error:", err);
    }
  }
  if (endReason) endOnce(endReason);

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
