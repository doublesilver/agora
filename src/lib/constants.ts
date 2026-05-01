/* AGENTS.md A3/A8 캡 상수 단일 출처. */

export const MAX_TURNS = 30;
export const MAX_SESSION_TOKENS = 50_000;
export const MAX_SESSION_DURATION_MS = 5 * 60_000;
export const AGENT_FIRST_TOKEN_TIMEOUT_MS = 60_000; // CLI cold start(~25s) + 추론 latency 흡수
export const MAX_CONSECUTIVE_PASS = 2;
/** 한 어댑터가 N회 연속 agent_error 시 그 라운드부터 호출 skip하고
 * 모든 활성 어댑터가 streak 초과면 자동 STOP. 키 잘못/잔액 부족 등 회복 불가
 * 사유로 ActivityLog가 도배되는 worst case 차단. */
export const MAX_AGENT_ERROR_STREAK = 3;
