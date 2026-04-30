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
  const adapters = body.agents.map(createAdapter);
  const state = createSessionState({
    id: sessionId,
    agents: adapters,
    systemPrompts: (body.systemPrompts ?? {}) as Record<
      "claude" | "codex" | "gemini",
      string
    >,
    userPrompt: body.userPrompt,
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
