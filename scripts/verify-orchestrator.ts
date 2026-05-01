/* 오케스트레이터 검증 — fake 어댑터 위에서 시나리오 9개. */
import {
  createSessionState,
  intervene,
  pause,
  resume,
  runSession,
  setSystemPrompt,
  stop,
} from "../src/lib/orchestrator";
import type { OrchestratorEvent } from "../src/lib/session-store";
import { createFakeAdapter } from "../src/lib/agents/fake";
import type {
  AgentAdapter,
  AgentId,
  SpeakInput,
  SpeakResult,
} from "../src/lib/agents/types";
import {
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_TOKENS,
} from "../src/lib/constants";

function collect(state: ReturnType<typeof createSessionState>) {
  const events: OrchestratorEvent[] = [];
  state.listeners.add((e) => events.push(e));
  return events;
}

function summarize(events: OrchestratorEvent[]): string {
  const counts: Record<string, number> = {};
  let endReason: string | undefined;
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === "session_end") endReason = e.reason;
  }
  return `events=${events.length} types=${JSON.stringify(counts)} end=${endReason ?? "?"}`;
}

async function scenario_normal() {
  console.log("\n=== 1. 정상 라운드 (fake 2개, passProb=0.3) ===");
  const claude = createFakeAdapter("claude", {
    passProbability: 0.3,
    tokenDelayMs: 5,
  });
  const codex = createFakeAdapter("codex", {
    passProbability: 0.3,
    tokenDelayMs: 5,
  });
  const state = createSessionState({
    id: "t1",
    agents: [claude, codex],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "design a survival energy system",
  });
  const events = collect(state);
  setTimeout(() => stop(state), 2_000); // 2초 후 STOP
  await runSession(state);
  console.log(summarize(events));
}

async function scenario_interrupt() {
  console.log("\n=== 2. 인터럽트 (라운드 중간 메시지 끼어들기) ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 50,
  });
  const b = createFakeAdapter("codex", {
    passProbability: 0,
    tokenDelayMs: 50,
  });
  const state = createSessionState({
    id: "t2",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  setTimeout(
    () => intervene(state, "stop talking about that", "interrupt"),
    200,
  );
  setTimeout(() => stop(state), 1_500);
  await runSession(state);
  const interrupted = events.some(
    (e) => e.type === "agent_end" && e.interrupted === true,
  );
  console.log(summarize(events), "interrupted=", interrupted);
}

async function scenario_timeout() {
  console.log("\n=== 3. 타임아웃 (응답 안 하는 어댑터) ===");
  const slow: AgentAdapter = {
    id: "claude",
    mode: "api",
    speak: (_input: SpeakInput) =>
      new Promise<SpeakResult>(() => {
        /* never resolve */
      }),
  };
  const ok = createFakeAdapter("codex", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const state = createSessionState({
    id: "t3",
    agents: [slow, ok],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  // 짧은 타임아웃을 위해 patch — 진짜 30s 기다리면 너무 김. 대신 patched env 변수로...
  // 검증 단순화: STOP을 일찍 걸어 timeout 검증은 별도 short test로
  setTimeout(() => stop(state), 800);
  await runSession(state);
  console.log(
    summarize(events),
    "(실제 30s timeout 검증은 dev 시 환경변수 패치 필요)",
  );
}

async function scenario_error() {
  console.log("\n=== 4. 에러 어댑터 ===");
  const broken: AgentAdapter = {
    id: "claude",
    mode: "api",
    speak: async () => {
      throw new Error("simulated SDK failure");
    },
  };
  const ok = createFakeAdapter("codex", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const state = createSessionState({
    id: "t4",
    agents: [broken, ok],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  setTimeout(() => stop(state), 500);
  await runSession(state);
  const errors = events.filter((e) => e.type === "agent_error");
  console.log(summarize(events), "errors=", errors.length);
}

async function scenario_pause_resume() {
  console.log("\n=== 5. PAUSE → RESUME ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const b = createFakeAdapter("codex", { passProbability: 0, tokenDelayMs: 5 });
  const state = createSessionState({
    id: "t5",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  setTimeout(() => pause(state), 200);
  setTimeout(() => resume(state), 600);
  setTimeout(() => stop(state), 1_200);
  await runSession(state);
  const statusVals = events
    .filter((e) => e.type === "status")
    .map((e) => (e as Extract<OrchestratorEvent, { type: "status" }>).value);
  console.log(summarize(events), "statusFlow=", statusVals);
}

async function scenario_hotswap() {
  console.log("\n=== 6. 시스템 프롬프트 핫스왑 ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const b = createFakeAdapter("codex", { passProbability: 0, tokenDelayMs: 5 });
  const state = createSessionState({
    id: "t6",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  setTimeout(() => setSystemPrompt(state, "claude", "new persona"), 200);
  setTimeout(() => stop(state), 800);
  await runSession(state);
  const hotswaps = events.filter((e) => e.type === "system_prompt_change");
  console.log(summarize(events), "hotswaps=", hotswaps.length);
}

async function scenario_paused_stop() {
  console.log("\n=== 7. PAUSE 중 STOP — session_end 단일 emit 검증 ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const b = createFakeAdapter("codex", { passProbability: 0, tokenDelayMs: 5 });
  const state = createSessionState({
    id: "t7",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  const events = collect(state);
  setTimeout(() => pause(state), 200);
  setTimeout(() => stop(state), 600); // paused 중 stop
  await runSession(state);
  const ends = events.filter((e) => e.type === "session_end");
  console.log(summarize(events), "session_end_count=", ends.length);
}

async function scenario_budget_cap() {
  console.log("\n=== 8. 토큰 예산 캡 도달 (state.sessionTokens 직접 조작) ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const b = createFakeAdapter("codex", { passProbability: 0, tokenDelayMs: 5 });
  const state = createSessionState({
    id: "t8",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  // 첫 라운드 가드에서 budget_exceeded 즉시 emit.
  state.sessionTokens = MAX_SESSION_TOKENS;
  const events = collect(state);
  await runSession(state);
  console.log(summarize(events));
}

async function scenario_time_cap() {
  console.log("\n=== 9. 시간 캡 도달 (startedAt 과거로 조작) ===");
  const a = createFakeAdapter("claude", {
    passProbability: 0,
    tokenDelayMs: 5,
  });
  const b = createFakeAdapter("codex", { passProbability: 0, tokenDelayMs: 5 });
  const state = createSessionState({
    id: "t9",
    agents: [a, b],
    agentSpecs: [],
    systemPrompts: {},
    userPrompt: "test",
  });
  state.startedAt = Date.now() - MAX_SESSION_DURATION_MS - 1000;
  const events = collect(state);
  await runSession(state);
  console.log(summarize(events));
}

async function main() {
  await scenario_normal();
  await scenario_interrupt();
  await scenario_timeout();
  await scenario_error();
  await scenario_pause_resume();
  await scenario_hotswap();
  await scenario_paused_stop();
  await scenario_budget_cap();
  await scenario_time_cap();
  console.log("\n[verify-orchestrator] 모든 시나리오 종료");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
