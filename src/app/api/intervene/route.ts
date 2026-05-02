/* POST /api/intervene — 사용자 메시지. mode: 'interrupt' | 'queue'.
 * interrupt는 진행 중 라운드를 즉시 끊고 새 라운드 시작, queue는 다음 라운드 반영.
 * 차별화 포인트(사용자가 토론에 함께 참여)의 직접 진입점. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { intervene } from "@/lib/orchestrator";

interface InterveneRequest {
  sessionId: string;
  text: string;
  mode: "interrupt" | "queue";
}

export async function POST(req: Request) {
  let body: InterveneRequest;
  try {
    body = (await req.json()) as InterveneRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const state = getSession(body.sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  // 8KB 캡 — 거대 페이로드를 transcript에 push해 메모리 폭주를 유도하는 것 차단.
  if (body.text.length > 8_000) {
    return NextResponse.json({ error: "text_too_long" }, { status: 413 });
  }
  const mode = body.mode === "interrupt" ? "interrupt" : "queue";
  intervene(state, body.text, mode);
  return NextResponse.json({ ok: true });
}
