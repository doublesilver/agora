/* GET /api/stream?sessionId=... — Server-Sent Events 스트리밍. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSession, type OrchestratorEvent } from "@/lib/session-store";

const KEEPALIVE_MS = 30_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("missing sessionId", { status: 400 });
  }
  const state = getSession(sessionId);
  if (!state) {
    return new Response("session not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: OrchestratorEvent) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        } catch {
          // 클라 disconnect 후 enqueue 실패 — 무시.
        }
      };

      // 누적 이벤트 replay — POST→listener 등록 사이의 race window에서 발생한 이벤트
      // (session_start, agent_start 등) 손실 방지.
      let alreadyEnded = false;
      for (const ev of state.eventLog) {
        send(ev);
        if (ev.type === "session_end") alreadyEnded = true;
      }
      if (state.eventLog.length === 0) {
        // 아직 첫 이벤트도 없을 때 status snapshot 한 번.
        send({ type: "status", value: state.status, ts: Date.now() });
      }
      if (alreadyEnded) {
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }, 100);
        return;
      }

      const listener = (e: OrchestratorEvent) => {
        send(e);
        if (e.type === "session_end") {
          // 세션 끝 마킹 후 컨트롤러 닫기.
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              /* noop */
            }
          }, 100);
        }
      };
      state.listeners.add(listener);
      unsubscribe = () => state.listeners.delete(listener);

      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          /* noop */
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
