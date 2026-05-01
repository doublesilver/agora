/* 클라 사이드 SSE 이벤트 + 세션 상태 타입. 서버 OrchestratorEvent와 동일 형식. */
import type {
  OrchestratorEvent,
  SessionStatus,
  InterveneMode,
} from "@/lib/session-store";
import type { AgentId, AgentMode } from "@/lib/agents/types";

export type {
  OrchestratorEvent,
  SessionStatus,
  InterveneMode,
  AgentId,
  AgentMode,
};

export interface AgentConfig {
  id: AgentId;
  enabled: boolean;
  mode: AgentMode;
  apiKey: string;
  systemPrompt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | AgentId;
  text: string;
  turn?: number;
  ts: number;
  interrupted?: boolean;
  passed?: boolean;
  streaming?: boolean;
  /** user 역할일 때만 set — 'interrupt'면 ⚡ 강조. */
  mode?: InterveneMode;
}

export type AgentPhase =
  | "idle"
  | "thinking"
  | "streaming"
  | "passed"
  | "timeout"
  | "error";

export interface AgentRuntimeStats {
  phase: AgentPhase;
  lastTurn: number | null;
  inputTokens: number;
  outputTokens: number;
  startedAt: number | null;
  firstTokenAt: number | null;
  endedAt: number | null;
  /** 마지막 발언에 사용된 모델 라벨 (API 어댑터에서 server agent_start 이벤트로 전달). */
  model?: string;
}

/** 활동 로그 항목 — 우측/하단 사이드패널 라이브 피드. token 이벤트는 제외. */
export interface ActivityEntry {
  id: string;
  ts: number;
  tone: "info" | "warn" | "error" | "pass" | "system";
  text: string;
}

export interface SessionLiveSummary {
  text: string;
  atTurn: number;
  summarizerId: AgentId;
  ts: number;
}

export interface SessionFinalArtifact {
  text: string;
  summarizerId: AgentId;
  ts: number;
}

export interface SessionView {
  sessionId: string | null;
  status: SessionStatus | "setup";
  turn: number;
  sessionTokens: number;
  messages: ChatMessage[];
  /** 라운드별 PASS 표시용. agentId → 마지막 PASS 라운드. */
  passedRecent: Partial<Record<AgentId, number>>;
  errorRecent: { agentId: AgentId; message: string; turn: number } | null;
  endReason: string | null;
  /** 현재 발언자 — 직렬 라운드의 핫스팟 표시. */
  activeSpeaker: AgentId | null;
  /** 세션 시작 시 활성 에이전트 — 다음 발언자 프리뷰 + 활동 로그용. */
  agents: AgentId[];
  /** 세션 시작 시각 (ms) — 시간 경과 인디케이터용. */
  sessionStartTs: number | null;
  /** 에이전트별 누적 통계 — 사이드바·헤더 인디케이터에 사용. */
  agentStats: Partial<Record<AgentId, AgentRuntimeStats>>;
  /** 메타 이벤트 라이브 피드 (최근 30개, token 제외). */
  activityLog: ActivityEntry[];
  /** 실시간 요약 — 라운드 종료 후 갱신, 인터럽트 직후도 갱신. */
  liveSummary: SessionLiveSummary | null;
  /** 종료 시 산출물 — 결론/논점/미해결/액션. */
  finalArtifact: SessionFinalArtifact | null;
  /** 요약 도중 마지막 에러 — 슬림 카드에 노출. */
  summaryError: {
    stage: "rolling" | "final";
    message: string;
    ts: number;
  } | null;
}
