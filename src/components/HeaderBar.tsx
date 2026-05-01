/* HeaderBar — 신문 메스트헤드 풍. 좌측 wordmark + 중앙 라이브 메타 + 우측 진행 게이지·Export.
 * Pentagram-스타일 정보 건축: 모노톤 + 1 액센트, 작은 메타 라벨(uppercase/tracking),
 * 진행 게이지는 fill 대신 underline 형태로 절제. 발화자 식별색만 유지. */
"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { MAX_SESSION_DURATION_MS, MAX_SESSION_TOKENS } from "@/lib/constants";

const STATUS_DOT: Record<SessionView["status"], string> = {
  setup: "bg-zinc-500",
  running: "bg-blue-400",
  idle: "bg-emerald-400",
  paused: "bg-amber-400",
  stopped: "bg-zinc-600",
};

const STATUS_LABEL: Record<SessionView["status"], string> = {
  setup: "STANDBY",
  running: "ON AIR",
  idle: "USER TURN",
  paused: "PAUSED",
  stopped: "ENDED",
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
    <header className="flex shrink-0 items-stretch border-b border-zinc-800/80 bg-zinc-950">
      <div className="flex items-baseline gap-3 border-r border-zinc-800/80 px-6 py-3">
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-zinc-50">
          Agora
        </h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          multi-agent debate
        </span>
      </div>

      <div className="flex flex-1 items-center gap-6 px-6 py-2">
        <Meta label="Status">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[view.status]} ${
              view.status === "running" ? "animate-pulse" : ""
            }`}
          />
          <span className="font-mono text-[11px] tracking-wider text-zinc-200">
            {STATUS_LABEL[view.status]}
          </span>
        </Meta>

        <Meta label="Round">
          <span className="font-mono text-[13px] tabular-nums text-zinc-100">
            {String(view.turn).padStart(2, "0")}
          </span>
        </Meta>

        {showRotation && (
          <Meta label="Floor">
            <div className="flex items-center gap-1.5 text-[11px]">
              {order.map((id, i) => (
                <span key={id} className="flex items-center gap-1.5">
                  <span
                    className={`${AGENT_TONE[id]} ${
                      id === view.activeSpeaker ? "font-semibold" : "opacity-50"
                    }`}
                  >
                    {AGENT_LABEL[id]}
                  </span>
                  {i < order.length - 1 && (
                    <span className="text-zinc-700">·</span>
                  )}
                </span>
              ))}
            </div>
          </Meta>
        )}
      </div>

      <div className="flex items-center gap-5 border-l border-zinc-800/80 px-6 py-2">
        <TokenGauge value={view.sessionTokens} pct={pct} />
        {view.sessionStartTs !== null && view.status !== "stopped" && (
          <ElapsedTimer startTs={view.sessionStartTs} />
        )}
        {view.sessionId && view.status !== "setup" && (
          <a
            href={`/api/export?id=${view.sessionId}`}
            className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Export ↓
          </a>
        )}
      </div>
    </header>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        {label}
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function TokenGauge({ value, pct }: { value: number; pct: number }) {
  const danger = pct >= 90;
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        Tokens
      </span>
      <div
        role="progressbar"
        aria-label="세션 토큰 사용량"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={MAX_SESSION_TOKENS}
        aria-valuetext={`${value.toLocaleString()} / ${MAX_SESSION_TOKENS.toLocaleString()} (${pct}%)`}
        className="relative h-3 w-32 border-b border-zinc-800"
      >
        <div
          className={`absolute bottom-0 left-0 h-full border-b-2 ${
            danger ? "border-red-400" : "border-zinc-300"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[11px] tabular-nums ${danger ? "text-red-300" : "text-zinc-300"}`}
      >
        {Math.round(value / 1000)}k/{Math.round(MAX_SESSION_TOKENS / 1000)}k
      </span>
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
  const danger = pct >= 90;
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
        Elapsed
      </span>
      <div
        role="progressbar"
        aria-label="세션 경과 시간"
        aria-valuenow={Math.floor(elapsed / 1000)}
        aria-valuemin={0}
        aria-valuemax={Math.floor(MAX_SESSION_DURATION_MS / 1000)}
        aria-valuetext={`${mm}:${ss} / ${totalMm}:00`}
        className="relative h-3 w-20 border-b border-zinc-800"
      >
        <div
          className={`absolute bottom-0 left-0 h-full border-b-2 ${
            danger ? "border-red-400" : "border-emerald-400/70"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[11px] tabular-nums ${danger ? "text-red-300" : "text-zinc-300"}`}
      >
        {mm}:{ss}
      </span>
    </div>
  );
}
