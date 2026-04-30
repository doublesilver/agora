/* HeaderBar — 상태 뱃지 + 라운드 + 토큰 예산 진행률 + Export. */
"use client";

import type { SessionView } from "@/lib/client/types";
import { MAX_SESSION_TOKENS } from "@/lib/constants";

const STATUS_TONE: Record<SessionView["status"], string> = {
  setup: "bg-zinc-700 text-zinc-200",
  running: "bg-blue-700 text-blue-50",
  idle: "bg-emerald-700 text-emerald-50",
  paused: "bg-amber-700 text-amber-50",
  stopped: "bg-zinc-800 text-zinc-400",
};

const STATUS_LABEL: Record<SessionView["status"], string> = {
  setup: "● Setup",
  running: "● Running",
  idle: "● Idle (사용자 차례)",
  paused: "● Paused",
  stopped: "● Stopped",
};

interface Props {
  view: SessionView;
}

export function HeaderBar({ view }: Props) {
  const pct = Math.min(
    100,
    Math.round((view.sessionTokens / MAX_SESSION_TOKENS) * 100),
  );
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-6 py-2 text-sm">
      <div className="font-semibold tracking-tight">Agora</div>
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[view.status]}`}
      >
        {STATUS_LABEL[view.status]}
      </span>
      <div className="text-xs text-zinc-400">round {view.turn}</div>
      <div className="ml-2 flex flex-1 items-center gap-2 text-xs text-zinc-400">
        <span className="whitespace-nowrap">tokens</span>
        <div className="h-1.5 w-40 overflow-hidden rounded bg-zinc-800">
          <div
            className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums">
          {view.sessionTokens.toLocaleString()} /{" "}
          {MAX_SESSION_TOKENS.toLocaleString()}
        </span>
      </div>
      {view.sessionId && view.status !== "setup" && (
        <a
          href={`/api/export?id=${view.sessionId}`}
          className="rounded bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700"
        >
          Export Markdown
        </a>
      )}
    </div>
  );
}
