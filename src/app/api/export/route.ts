/* GET /api/export?id=... — Markdown 첨부 다운로드. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session-store";
import { transcriptToMarkdown } from "@/lib/markdown-export";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response("missing id", { status: 400 });
  const state = getSession(id);
  if (!state) return new Response("not found", { status: 404 });

  const md = transcriptToMarkdown(state.transcript, id, state.eventLog);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="agora-${id}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
