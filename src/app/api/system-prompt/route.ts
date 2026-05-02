/* POST /api/system-prompt — 시스템 프롬프트 핫스왑.
 * 진행 중에도 어댑터별 시스템 프롬프트를 갈아끼울 수 있다(A7). 다음 라운드부터
 * 새 프롬프트로 호출되며 system_prompt_change 이벤트가 SSE+JSONL에 기록된다. */
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
  let body: PromptRequest;
  try {
    body = (await req.json()) as PromptRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const state = getSession(body.sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!body.agentId)
    return NextResponse.json({ error: "missing_agentId" }, { status: 400 });
  const prompt = body.prompt ?? "";
  // 32KB 캡 — 시스템 프롬프트는 라운드마다 어댑터에 전달돼 transcript와 곱해지므로
  // 거대 프롬프트는 토큰 캡 도달을 가속한다. 사용자 입력 길이 가드.
  if (typeof prompt !== "string" || prompt.length > 32_000) {
    return NextResponse.json({ error: "prompt_too_long" }, { status: 413 });
  }
  setSystemPrompt(state, body.agentId, prompt);
  return NextResponse.json({ ok: true });
}
