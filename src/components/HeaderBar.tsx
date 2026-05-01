/* HeaderBar — 신문 메스트헤드 (huashu-design 디자인 시안 ② After 적용).
 * Noto Serif KR 'Agora' wordmark + double border + ON AIR ping + Section A
 * 하단줄. 발화자 식별색만 유지, 나머지는 zinc 단색. */
"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { MAX_SESSION_DURATION_MS, MAX_SESSION_TOKENS } from "@/lib/constants";

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

const STATUS_LABEL: Record<SessionView["status"], string> = {
  setup: "STANDBY",
  running: "ON AIR",
  idle: "USER TURN",
  paused: "PAUSED",
  stopped: "OFF AIR",
};

const STATUS_DOT: Record<SessionView["status"], string> = {
  setup: "bg-zinc-500",
  running: "bg-red-500",
  idle: "bg-emerald-400",
  paused: "bg-amber-400",
  stopped: "bg-zinc-600",
};

const STATUS_TEXT: Record<SessionView["status"], string> = {
  setup: "text-zinc-400",
  running: "text-red-400",
  idle: "text-emerald-300",
  paused: "text-amber-300",
  stopped: "text-zinc-500",
};

function rotate<T>(arr: T[], shift: number): T[] {
  if (arr.length === 0) return [];
  const k = ((shift % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

interface Props {
  view: SessionView;
}

const SECTION_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const SECTION_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatToday(): string {
  const d = new Date();
  return `${SECTION_DAY_LABELS[d.getDay()]}, ${SECTION_MONTH_LABELS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function HeaderBar({ view }: Props) {
  const tokenMax = view.limits?.maxSessionTokens ?? MAX_SESSION_TOKENS;
  const durationMax =
    view.limits?.maxSessionDurationMs ?? MAX_SESSION_DURATION_MS;
  const pct = Math.min(100, Math.round((view.sessionTokens / tokenMax) * 100));
  const showRotation =
    view.agents.length > 0 &&
    (view.status === "running" ||
      view.status === "idle" ||
      view.status === "paused");
  const order = showRotation ? rotate(view.agents, view.turn) : [];
  const today = formatToday();
  const activeSpeaker =
    order.find((id) => id === view.activeSpeaker) ?? order[0];

  return (
    <header className="flex shrink-0 flex-col bg-zinc-950 px-6 pb-2 pt-4 text-sm">
      {/* Double rule masthead */}
      <div className="flex items-center justify-between border-y-[3px] border-double border-zinc-700 py-3">
        <div className="flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <h1
              className="text-2xl tracking-[-0.02em] text-zinc-50"
              style={{ fontFamily: '"Noto Serif KR", serif', fontWeight: 600 }}
            >
              Agora
            </h1>
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500">
              Daily
            </span>
          </div>

          <div className="flex items-center gap-3 border-l border-zinc-800 pl-5">
            <span className="relative flex h-2 w-2">
              {view.status === "running" && (
                <span
                  className={`onair-ping absolute inline-flex h-full w-full rounded-full ${STATUS_DOT[view.status]}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${STATUS_DOT[view.status]}`}
                aria-hidden="true"
              />
            </span>
            <span
              className={`font-mono text-[10px] font-semibold uppercase tracking-[0.3em] ${STATUS_TEXT[view.status]}`}
            >
              {STATUS_LABEL[view.status]}
            </span>
            {view.sessionStartTs !== null && view.status !== "stopped" && (
              <>
                <span className="h-px w-14 bg-gradient-to-r from-red-500/70 to-transparent" />
                <ElapsedTimecode
                  startTs={view.sessionStartTs}
                  durationMax={durationMax}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Meta label="Round">
            <span className="font-mono text-[13px] font-semibold tabular-nums text-zinc-100">
              {String(view.turn).padStart(2, "0")}
            </span>
          </Meta>
          {showRotation && activeSpeaker && (
            <Meta label="Floor">
              <span
                className={`font-mono text-[12px] ${AGENT_TONE[activeSpeaker]}`}
              >
                {AGENT_LABEL[activeSpeaker]}
              </span>
            </Meta>
          )}
          <Meta label="Tok">
            <span
              className={`font-mono text-[12px] tabular-nums ${pct >= 90 ? "text-red-300" : "text-zinc-300"}`}
            >
              {view.sessionTokens.toLocaleString()}
            </span>
          </Meta>
          {view.sessionId && view.status !== "setup" && (
            <a
              href={`/api/export?id=${view.sessionId}`}
              className="rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800/60"
            >
              Export
            </a>
          )}
        </div>
      </div>

      {/* Section line — newspaper-style */}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Section A · Live Discourse
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          {today}
        </span>
      </div>

      {/* SR-only progress bars (시각은 아래 streambar/timecode·tok 라벨이 담당) */}
      <span
        role="progressbar"
        aria-label="세션 토큰 사용량"
        aria-valuenow={view.sessionTokens}
        aria-valuemin={0}
        aria-valuemax={tokenMax}
        aria-valuetext={`${view.sessionTokens.toLocaleString()} / ${tokenMax.toLocaleString()} (${pct}%)`}
        className="sr-only"
      />
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
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function ElapsedTimecode({
  startTs,
  durationMax,
}: {
  startTs: number;
  durationMax: number;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Date.now() - startTs;
  const pct = Math.min(100, Math.round((elapsed / durationMax) * 100));
  const totalSec = Math.floor(elapsed / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  const danger = pct >= 90;
  const totalMm = Math.floor(durationMax / 60000);
  return (
    <span
      role="progressbar"
      aria-label="세션 경과 시간"
      aria-valuenow={totalSec}
      aria-valuemin={0}
      aria-valuemax={Math.floor(durationMax / 1000)}
      aria-valuetext={`${hh}:${mm}:${ss} / ${totalMm}:00`}
      className={`font-mono text-[11px] tabular-nums ${danger ? "text-red-300" : "text-zinc-300"}`}
    >
      {hh}:{mm}:{ss}
    </span>
  );
}
