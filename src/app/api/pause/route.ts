/* POST /api/pause — 라운드 경계에서 정지. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { pause } from "@/lib/orchestrator";

export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const state = getSession(sessionId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  pause(state);
  return NextResponse.json({ ok: true });
}
