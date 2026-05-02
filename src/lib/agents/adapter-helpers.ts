/* 어댑터 공통 — transcript 직렬화 + 시스템 프롬프트 augment.
 * 모든 어댑터(claude/codex/gemini × api/cli)가 같은 직렬화·프롬프트 augmentation을
 * 거쳐서 들어가야 화자 attribution과 PASS 규약이 일관되게 작동한다. */
import type { AgentId, TranscriptEvent } from "./types";
import { PASS_INSTRUCTION } from "./types";

/** transcript 직렬화 시 [USER]/[CLAUDE]/[CODEX]/[GEMINI] prefix를 붙여
 * 다음 발언자가 "누가 무슨 말을 했는지" 명확히 인지하게 한다. summarizer가
 * 5섹션 산출물에서 발언자 attribution을 만들 때도 이 prefix를 그대로 가져간다. */
const ROLE_LABEL: Record<string, string> = {
  user: "USER",
  claude: "CLAUDE",
  codex: "CODEX",
  gemini: "GEMINI",
};

export function serializeTranscript(transcript: TranscriptEvent[]): string {
  return transcript
    .map((e) => `[${ROLE_LABEL[e.role] ?? e.role.toUpperCase()}] ${e.text}`)
    .join("\n\n");
}

/** 어댑터가 받는 SpeakInput.systemPrompt 위에 (1) "다른 화자를 사칭하지 말 것"
 * 규칙과 (2) PASS_INSTRUCTION을 augmentation. 사용자 시스템 프롬프트가 비어
 * 있어도 토론 진행이 되도록 fallback 역할도 한다. */
export function buildSystemPrompt(agentId: AgentId, base: string): string {
  return [
    base,
    "",
    `You are speaking AS ${agentId.toUpperCase()} in a multi-agent debate. Other speakers (USER and other agents) appear in the transcript with [LABEL] prefixes; do NOT impersonate them.`,
    PASS_INSTRUCTION,
  ].join("\n");
}
