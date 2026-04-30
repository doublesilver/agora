/* 어댑터 공통 — transcript 직렬화 + 시스템 프롬프트 augment. */
import type { AgentId, TranscriptEvent } from "./types";
import { PASS_INSTRUCTION, PASS_TOKEN } from "./types";

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

/** 어댑터가 받는 SpeakInput.systemPrompt 위에 PASS 규약을 한 번 더 명시 + 화자 식별 강조. */
export function buildSystemPrompt(agentId: AgentId, base: string): string {
  return [
    base,
    "",
    `You are speaking AS ${agentId.toUpperCase()} in a multi-agent debate. Other speakers (USER and other agents) appear in the transcript with [LABEL] prefixes; do NOT impersonate them.`,
    PASS_INSTRUCTION,
  ].join("\n");
}

/** 응답이 PASS 토큰뿐이면 true. */
export function isPassResponse(text: string): boolean {
  return text.trim() === PASS_TOKEN;
}

export { PASS_TOKEN };
