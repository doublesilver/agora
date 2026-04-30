/* 어댑터 팩토리 — 클라가 보낸 spec → AgentAdapter 인스턴스.
 * M5 단계: 모두 fake로 폴백. M3에서 실어댑터로 분기 추가.
 */
import type { AgentAdapter, AgentId, AgentMode } from "./agents/types";
import { createFakeAdapter } from "./agents/fake";

export interface AgentSpec {
  id: AgentId;
  mode: AgentMode;
  apiKey?: string; // API 모드일 때 클라 sessionStorage 값. 서버 디스크 미저장.
}

export function createAdapter(spec: AgentSpec): AgentAdapter {
  // TODO M3: spec.mode === 'api' && spec.id === 'claude' → claude-api 등으로 분기.
  // 현재는 모든 spec을 fake로 매핑.
  return createFakeAdapter(spec.id);
}
