/* POST /api/session — 세션 시작.
 * 입력: { agents: AgentSpec[], systemPrompts: Record<AgentId,string>, userPrompt: string }
 * 출력: { sessionId }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdapter, type AgentSpec } from "@/lib/agent-factory";
import { createSessionState, runSession } from "@/lib/orchestrator";
import { setSession } from "@/lib/session-store";
import { JsonlLogger } from "@/lib/logger";

interface SessionRequest {
  agents: AgentSpec[];
  systemPrompts?: Partial<Record<string, string>>;
  userPrompt: string;
  /** 요약 담당 에이전트 id — 활성 어댑터 중 하나여야 함. 미지정·미일치면 요약 비활성. */
  summarizerId?: "claude" | "codex" | "gemini";
  /** 세션 한도 override — SettingsModal LimitsPane에서 사용자 변경 시 클라가 보냄.
   * 미지정·잘못된 값은 server에서 constants default로 fallback (clampLimits). */
  limits?: {
    maxTurns?: number;
    maxSessionTokens?: number;
    maxSessionDurationMs?: number;
  };
}

export async function POST(req: Request) {
  let body: SessionRequest;
  try {
    body = (await req.json()) as SessionRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.agents) || body.agents.length < 2) {
    return NextResponse.json(
      { error: "need_at_least_2_agents" },
      { status: 400 },
    );
  }
  if (!body.userPrompt || typeof body.userPrompt !== "string") {
    return NextResponse.json({ error: "missing_user_prompt" }, { status: 400 });
  }

  const sessionId = randomUUID();
  let adapters;
  try {
    adapters = body.agents.map(createAdapter);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          (err as Error)?.message ??
          "어댑터 생성 실패 — 인증 정보를 확인하세요.",
      },
      { status: 400 },
    );
  }
  // 결과 정리 담당은 활성 에이전트 중 1명. API 모드는 키 검사만, CLI 모드는
  // 클라이언트가 cli-status를 거쳐 후보 노출 — 서버는 활성 여부만 확인.
  const summarizerId =
    body.summarizerId &&
    body.agents.some((a) => {
      if (a.id !== body.summarizerId) return false;
      if (a.mode === "api") return !!a.apiKey;
      return a.mode === "cli";
    })
      ? body.summarizerId
      : undefined;
  const state = createSessionState({
    id: sessionId,
    agents: adapters,
    agentSpecs: body.agents,
    systemPrompts: (body.systemPrompts ?? {}) as Record<
      "claude" | "codex" | "gemini",
      string
    >,
    userPrompt: body.userPrompt,
    summarizerId,
    limits: body.limits,
  });

  const logger = new JsonlLogger(sessionId);
  state.listeners.add((e) => logger.log(e));
  state.closers.push(() => logger.close());

  setSession(sessionId, state);

  // Fire-and-forget — runSession은 SSE 클라가 구독한 동안 진행.
  runSession(state).catch((err) => {
    console.error(`[session ${sessionId}] runSession error:`, err);
  });

  return NextResponse.json({ sessionId });
}
