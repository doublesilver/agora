/* POST /api/system-prompt — 시스템 프롬프트 핫스왑. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { setSystemPrompt } from "@/lib/orchestrator";
import type { AgentId } from "@/lib/agents/types";

interface PromptRequest {
  sessionId: string;
  agentId: AgentId;
  prompt: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as PromptRequest;
  const state = getSession(body.sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!body.agentId)
    return NextResponse.json({ error: "missing_agentId" }, { status: 400 });
  const prompt = body.prompt ?? "";
  if (typeof prompt !== "string" || prompt.length > 32_000) {
    return NextResponse.json({ error: "prompt_too_long" }, { status: 413 });
  }
  setSystemPrompt(state, body.agentId, prompt);
  return NextResponse.json({ ok: true });
}
