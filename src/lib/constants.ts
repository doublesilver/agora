/* AGENTS.md A3/A8 캡 상수 단일 출처. */

export const MAX_TURNS = 30;
/** 시연 + 결과 산출물까지 끝까지 도달하도록 100k로 잡음. 한 라운드(3 에이전트)
 * 평균 6~12k이라 6~12라운드 이상 가능. budget_exceeded는 안전 net 역할만. */
export const MAX_SESSION_TOKENS = 100_000;
export const MAX_SESSION_DURATION_MS = 5 * 60_000;
export const AGENT_FIRST_TOKEN_TIMEOUT_MS = 60_000; // CLI cold start(~25s) + 추론 latency 흡수
export const MAX_CONSECUTIVE_PASS = 2;
/** 한 어댑터가 N회 연속 agent_error 시 그 라운드부터 호출 skip하고
 * 모든 활성 어댑터가 streak 초과면 자동 STOP. 키 잘못/잔액 부족 등 회복 불가
 * 사유로 ActivityLog가 도배되는 worst case 차단. */
export const MAX_AGENT_ERROR_STREAK = 3;
