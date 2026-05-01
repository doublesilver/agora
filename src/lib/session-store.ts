/* 세션 상태 저장 + 외부 이벤트 알림. AGENTS.md A6/A7/A8 정합. */
import type { AgentAdapter, AgentId } from "./agents/types";
import type { AgentSpec } from "./agent-factory";
import { Transcript } from "./transcript";

export type SessionStatus = "running" | "idle" | "paused" | "stopped";

export type InterveneMode = "interrupt" | "queue";

export interface SessionLimits {
  maxTurns: number;
  maxSessionTokens: number;
  maxSessionDurationMs: number;
}

export type OrchestratorEvent =
  | {
      type: "session_start";
      sessionId: string;
      agents: { id: AgentId; mode: AgentAdapter["mode"] }[];
      systemPrompts: Record<string, string>;
      userPrompt: string;
      limits: SessionLimits;
      ts: number;
    }
  | {
      type: "agent_start";
      agentId: AgentId;
      turn: number;
      ts: number;
      model?: string;
    }
  | { type: "token"; agentId: AgentId; turn: number; text: string; ts: number }
  | {
      type: "agent_end";
      agentId: AgentId;
      turn: number;
      fullText: string;
      interrupted: boolean;
      ts: number;
    }
  | { type: "agent_pass"; agentId: AgentId; turn: number; ts: number }
  | {
      type: "agent_timeout";
      agentId: AgentId;
      turn: number;
      timeoutMs: number;
      ts: number;
    }
  | {
      type: "agent_error";
      agentId: AgentId;
      turn: number;
      message: string;
      ts: number;
    }
  | { type: "user_message"; text: string; mode: InterveneMode; ts: number }
  | {
      type: "system_prompt_change";
      agentId: AgentId;
      prompt: string;
      ts: number;
    }
  | { type: "status"; value: SessionStatus; ts: number }
  | {
      type: "usage";
      agentId: AgentId;
      turn: number;
      inputTokens: number;
      outputTokens: number;
      sessionTotal: number;
      ts: number;
    }
  | {
      type: "session_end";
      reason: "user_stop" | "max_turns" | "budget_exceeded" | "time_exceeded";
      ts: number;
    }
  | {
      type: "final_artifact";
      text: string;
      summarizerId: AgentId;
      ts: number;
    }
  | {
      type: "summary_error";
      stage: "final";
      message: string;
      ts: number;
    };

export type EventListener = (event: OrchestratorEvent) => void;

/** Promise 기반 외부 이벤트 알림자 — paused/idle 대기 시 사용. */
export class Notifier {
  private resolvers: Array<() => void> = [];
  notify(): void {
    const pending = this.resolvers;
    this.resolvers = [];
    for (const r of pending) r();
  }
  wait(): Promise<void> {
    return new Promise<void>((resolve) => this.resolvers.push(resolve));
  }
}

export interface SessionState {
  id: string;
  agents: AgentAdapter[];
  /** 어댑터 생성에 사용된 spec — summarizer가 같은 인증·모드로 단발 호출 시 재사용. */
  agentSpecs: AgentSpec[];
  systemPrompts: Map<AgentId, string>;
  transcript: Transcript;
  userQueue: { text: string; mode: InterveneMode }[];
  turn: number;
  consecutivePass: number;
  status: SessionStatus;
  sessionAbort: AbortController;
  /** 라운드별로 새로 만들어 교체. interrupt에서 fire. */
  roundAbort: AbortController;
  sessionTokens: number;
  startedAt: number;
  notifier: Notifier;
  listeners: Set<EventListener>;
  /** 누적 이벤트 — SSE 신규 구독자에게 replay하여 race로 인한 손실 방지. */
  eventLog: OrchestratorEvent[];
  /** 종료 후 정리 시 호출. JSONL 로거가 등록. */
  closers: Array<() => void | Promise<void>>;
  /** 요약 담당 에이전트 id — 미설정 시 final 산출물 비활성. */
  summarizerId?: AgentId;
  /** 어댑터별 연속 에러 카운트 — 회복 불가 사유(401/잔액 부족 등) 도배 차단용.
   * 정상 발화·PASS 시 0으로 reset. MAX_AGENT_ERROR_STREAK 초과 시 라운드 skip. */
  errorStreak: Map<AgentId, number>;
  /** 세션 한도 — 사용자가 SettingsModal에서 변경 가능. 미지정 시 constants
   * default. 모든 가드(checkSessionGate / 시간 캡 재검사 / 토큰 캡 break)가
   * 이 값을 사용한다. */
  limits: SessionLimits;
}

const sessions = new Map<string, SessionState>();

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

export function setSession(id: string, state: SessionState): void {
  sessions.set(id, state);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function emitEvent(state: SessionState, event: OrchestratorEvent): void {
  state.eventLog.push(event);
  for (const l of state.listeners) {
    try {
      l(event);
    } catch (err) {
      // 리스너 에러는 다른 리스너 막지 않음.
      console.error("[session] listener error:", err);
    }
  }
}

/** AbortSignal 여러 개 합성 — 어느 하나라도 abort되면 결과 시그널도 abort. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  // node 20+에 AbortSignal.any 존재. 타입 호환 위해 직접 구성.
  const ac = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}
