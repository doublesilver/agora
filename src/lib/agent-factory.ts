/* 어댑터 팩토리 — 클라가 보낸 spec → AgentAdapter 인스턴스.
 * M3: spec.mode + spec.id로 실어댑터 분기. fake는 환경변수 AGORA_FAKE=1일 때 강제 옵션.
 */
import type { AgentAdapter, AgentId, AgentMode } from "./agents/types";
import { createFakeAdapter } from "./agents/fake";
import { createClaudeApiAdapter } from "./agents/claude-api";
import { createGptApiAdapter } from "./agents/gpt-api";
import { createGeminiApiAdapter } from "./agents/gemini-api";
import { createClaudeCliAdapter } from "./agents/claude-cli";
import { createCodexCliAdapter } from "./agents/codex-cli";
import { createGeminiCliAdapter } from "./agents/gemini-cli";

export interface AgentSpec {
  id: AgentId;
  mode: AgentMode;
  apiKey?: string; // API 모드일 때 클라 sessionStorage 값. 서버 디스크 미저장.
}

export function createAdapter(spec: AgentSpec): AgentAdapter {
  // 시연·테스트용 강제 fake 모드
  if (process.env.AGORA_FAKE === "1") {
    return createFakeAdapter(spec.id);
  }

  if (spec.mode === "api") {
    if (!spec.apiKey) {
      throw new Error(
        `agent-factory: ${spec.id}/api 모드에 apiKey 누락. UI에서 키 입력 또는 CLI 모드 선택.`,
      );
    }
    switch (spec.id) {
      case "claude":
        return createClaudeApiAdapter({ apiKey: spec.apiKey });
      case "codex":
        return createGptApiAdapter({ apiKey: spec.apiKey });
      case "gemini":
        return createGeminiApiAdapter({ apiKey: spec.apiKey });
    }
  }

  if (spec.mode === "cli") {
    switch (spec.id) {
      case "claude":
        return createClaudeCliAdapter();
      case "codex":
        return createCodexCliAdapter();
      case "gemini":
        return createGeminiCliAdapter();
    }
  }

  // 도달 불가, 타입 안전.
  throw new Error(`agent-factory: 지원하지 않는 spec ${JSON.stringify(spec)}`);
}
