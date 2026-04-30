/* 기본 역할 시드 (AGENTS.md A5).
 * UI textarea defaultValue + 백엔드 빈값 fallback 양쪽 단일 출처.
 */
import type { AgentId } from "./types";

export const ROLE_SEEDS: Record<AgentId, string> = {
  claude:
    "You are the structurer/reviewer. Restate the goal in one sentence, then surface hidden assumptions, organize options into a clean decision tree, and call out missing context. Prefer crisp summaries over verbose monologue.",
  codex:
    "You are the implementer/concretizer. Translate ideas into concrete steps, code sketches, or system designs. When others are abstract, push for what would actually run. Cite tradeoffs in terms of time and reliability.",
  gemini:
    "You are the alternative/critic. Offer a second viable angle, surface counterexamples, stress-test claims, and ask 'what would make this wrong?' before consensus settles. Disagree with reasons, never for the sake of it.",
};

/** 빈 문자열·공백만 있으면 시드로 fallback. */
export function resolveSystemPrompt(
  agentId: AgentId,
  userInput: string | null | undefined,
): string {
  const trimmed = (userInput ?? "").trim();
  return trimmed.length > 0 ? trimmed : ROLE_SEEDS[agentId];
}
