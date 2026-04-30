/* AGENTS.md A3/A8 캡 상수 단일 출처. */

export const MAX_TURNS = 30;
export const MAX_SESSION_TOKENS = 50_000;
export const MAX_SESSION_DURATION_MS = 5 * 60_000;
export const AGENT_FIRST_TOKEN_TIMEOUT_MS = 60_000; // CLI cold start(~25s) + 추론 latency 흡수
export const MAX_CONSECUTIVE_PASS = 2;
