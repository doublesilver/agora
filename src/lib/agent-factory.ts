/* 어댑터 팩토리 — 클라가 보낸 spec → AgentAdapter 인스턴스.
 * spec.mode + spec.id로 실어댑터 분기. (Fake echo 어댑터는 verify 스크립트
 * 전용으로 src/lib/agents/fake.ts에 남아있고 production 진입점에선 사용하지 않는다.)
 */
import type { AgentAdapter, AgentId, AgentMode } from "./agents/types";
import { createClaudeApiAdapter } from "./agents/claude-api";
import { createGptApiAdapter } from "./agents/gpt-api";
import { createGeminiApiAdapter } from "./agents/gemini-api";
import { createClaudeCliAdapter } from "./agents/claude-cli";
import { createCodexCliAdapter } from "./agents/codex-cli";
import { createGeminiCliAdapter } from "./agents/gemini-cli";
import { resolveCliBin, warmupCli } from "./agents/cli-stream";

export interface AgentSpec {
  id: AgentId;
  mode: AgentMode;
  apiKey?: string; // API 모드일 때 클라 sessionStorage 값. 서버 디스크 미저장.
  /** 사용자가 ⚙ 설정에서 선택한 모델 ID. 미지정 시 어댑터 default 사용. */
  model?: string;
}

export function createAdapter(spec: AgentSpec): AgentAdapter {
  if (spec.mode === "api") {
    if (!spec.apiKey) {
      throw new Error(
        `agent-factory: ${spec.id}/api 모드에 apiKey 누락. UI에서 키 입력 또는 CLI 모드 선택.`,
      );
    }
    switch (spec.id) {
      case "claude":
        return createClaudeApiAdapter({
          apiKey: spec.apiKey,
          model: spec.model,
        });
      case "codex":
        return createGptApiAdapter({ apiKey: spec.apiKey, model: spec.model });
      case "gemini":
        return createGeminiApiAdapter({
          apiKey: spec.apiKey,
          model: spec.model,
        });
    }
  }

  if (spec.mode === "cli") {
    // 세션 시작 시 백그라운드 워밍업으로 첫 실제 spawn의 cold-start 비용 일부 흡수.
    switch (spec.id) {
      case "claude":
        warmupCli(resolveCliBin("claude"));
        return createClaudeCliAdapter();
      case "codex":
        warmupCli(resolveCliBin("codex"));
        return createCodexCliAdapter();
      case "gemini":
        warmupCli(resolveCliBin("gemini"));
        return createGeminiCliAdapter();
    }
  }

  // 도달 불가, 타입 안전.
  throw new Error(`agent-factory: 지원하지 않는 spec ${JSON.stringify(spec)}`);
}
