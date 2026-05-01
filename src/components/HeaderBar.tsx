/* HeaderBar — 상태 뱃지 + 라운드 + 다음 발언자 프리뷰 + 시간 경과 + 토큰 예산 + Export. */
"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { MAX_SESSION_DURATION_MS, MAX_SESSION_TOKENS } from "@/lib/constants";

const STATUS_TONE: Record<SessionView["status"], string> = {
  setup: "bg-zinc-700 text-zinc-200",
  running: "bg-blue-700 text-blue-50",
  idle: "bg-emerald-700 text-emerald-50",
  paused: "bg-amber-700 text-amber-50",
  stopped: "bg-zinc-800 text-zinc-400",
};

const STATUS_LABEL: Record<SessionView["status"], string> = {
  setup: "● 준비 중",
  running: "● 토론 중",
  idle: "🤔 사용자 차례",
  paused: "⏸ 일시정지",
  stopped: "⏹ 종료됨",
};

const AGENT_LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const AGENT_TONE: Record<AgentId, string> = {
  claude: "text-orange-300",
  codex: "text-emerald-300",
  gemini: "text-blue-300",
};

function rotate<T>(arr: T[], shift: number): T[] {
  if (arr.length === 0) return [];
  const k = ((shift % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

interface Props {
  view: SessionView;
}

export function HeaderBar({ view }: Props) {
  const pct = Math.min(
    100,
    Math.round((view.sessionTokens / MAX_SESSION_TOKENS) * 100),
  );
  const showRotation =
    view.agents.length > 0 &&
    (view.status === "running" ||
      view.status === "idle" ||
      view.status === "paused");
  const order = showRotation ? rotate(view.agents, view.turn) : [];

  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-zinc-800/80 bg-zinc-950 px-6 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 shadow-[0_0_8px_rgba(96,165,250,0.55)]" />
        <span className="bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-base font-semibold tracking-tight text-transparent">
          Agora
        </span>
      </div>
      <span
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide ${STATUS_TONE[view.status]}`}
      >
        {STATUS_LABEL[view.status]}
      </span>
      <div className="text-xs text-zinc-400 tabular-nums">
        round <span className="text-zinc-200">{view.turn}</span>
      </div>
      {showRotation && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="text-zinc-500">발언권:</span>
          {order.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              <span
                className={`${AGENT_TONE[id]} ${id === view.activeSpeaker ? "font-semibold underline underline-offset-2" : ""}`}
              >
                {AGENT_LABEL[id]}
              </span>
              {i < order.length - 1 && <span className="text-zinc-600">→</span>}
            </span>
          ))}
        </div>
      )}
      <div className="ml-2 flex flex-1 items-center gap-2 text-xs text-zinc-300">
        <span className="whitespace-nowrap">tokens</span>
        <div
          role="progressbar"
          aria-label="세션 토큰 사용량"
          aria-valuenow={view.sessionTokens}
          aria-valuemin={0}
          aria-valuemax={MAX_SESSION_TOKENS}
          aria-valuetext={`${view.sessionTokens.toLocaleString()} / ${MAX_SESSION_TOKENS.toLocaleString()} (${pct}%)`}
          className="h-1.5 w-40 overflow-hidden rounded bg-zinc-800"
        >
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
      {view.sessionStartTs !== null && view.status !== "stopped" && (
        <ElapsedTimer startTs={view.sessionStartTs} />
      )}
      {view.sessionId && view.status !== "setup" && (
        <a
          href={`/api/export?id=${view.sessionId}`}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
        >
          📥 Export
        </a>
      )}
    </div>
  );
}

function ElapsedTimer({ startTs }: { startTs: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Date.now() - startTs;
  const pct = Math.min(
    100,
    Math.round((elapsed / MAX_SESSION_DURATION_MS) * 100),
  );
  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const totalMm = Math.floor(MAX_SESSION_DURATION_MS / 60000);
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <span aria-hidden="true">⏱</span>
      <div
        role="progressbar"
        aria-label="세션 경과 시간"
        aria-valuenow={Math.floor(elapsed / 1000)}
        aria-valuemin={0}
        aria-valuemax={Math.floor(MAX_SESSION_DURATION_MS / 1000)}
        aria-valuetext={`${mm}:${ss} / ${totalMm}:00`}
        className="h-1.5 w-20 overflow-hidden rounded bg-zinc-800"
      >
        <div
          className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">
        {mm}:{ss} / {totalMm}:00
      </span>
    </div>
  );
}
