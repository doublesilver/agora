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
}
