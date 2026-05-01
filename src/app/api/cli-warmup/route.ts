/* POST /api/cli-warmup — 페이지 로드 시 CLI binary 페이지캐시 워밍업.
 * 사용자가 prompt 작성하는 동안 백그라운드에서 binary 디스크 IO·Node 모듈 로드 흡수.
 * 효과는 첫 세션 시작 시 5~10s 절감 (이후 OS 페이지캐시에 잔존).
 * 입력: { ids?: AgentId[] }  (없으면 전체)
 * 출력: { warmed: AgentId[] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { warmupCli } from "@/lib/agents/cli-stream";
import type { AgentId } from "@/lib/agents/types";

const COMMANDS: Record<AgentId, string> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
};

export async function POST(req: Request) {
  let ids: AgentId[] | undefined;
  try {
    const body = (await req.json()) as { ids?: AgentId[] };
    ids = body.ids;
  } catch {
    // 빈 body 허용 — 전체 워밍업.
  }
  const targets: AgentId[] = ids?.length ? ids : ["claude", "codex", "gemini"];
  for (const id of targets) {
    warmupCli(COMMANDS[id]);
  }
  return NextResponse.json({ warmed: targets });
}
