/* POST /api/stop — 세션 통째 종료. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { stop } from "@/lib/orchestrator";

export async function POST(req: Request) {
  let sessionId: string;
  try {
    ({ sessionId } = (await req.json()) as { sessionId: string });
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const state = getSession(sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  stop(state);
  return NextResponse.json({ ok: true });
}
