/* POST /api/intervene — 사용자 메시지. mode: 'interrupt' | 'queue'. */
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
  const body = (await req.json()) as InterveneRequest;
  const state = getSession(body.sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  const mode = body.mode === "interrupt" ? "interrupt" : "queue";
  intervene(state, body.text, mode);
  return NextResponse.json({ ok: true });
}
