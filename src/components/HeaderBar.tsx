/* HeaderBar — Forum Masthead (Brutalist · 시안 C 적용).
 * AGORA::FORUM 64px + utility bar + topic with highlighter. */
"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { MAX_SESSION_DURATION_MS, MAX_SESSION_TOKENS } from "@/lib/constants";

const STATUS_LABEL: Record<SessionView["status"], string> = {
  setup: "STANDBY",
  running: "LIVE",
  idle: "USER TURN",
  paused: "PAUSED",
  stopped: "ENDED",
};

const STATUS_TONE: Record<SessionView["status"], string> = {
  setup: "text-ink3",
  running: "text-ink",
  idle: "text-ink",
  paused: "text-ink2",
  stopped: "text-ink3",
};

const AGENT_LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

interface Props {
  view: SessionView;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function HeaderBar({ view }: Props) {
  const tokenMax = view.limits?.maxSessionTokens ?? MAX_SESSION_TOKENS;
  const durationMax =
    view.limits?.maxSessionDurationMs ?? MAX_SESSION_DURATION_MS;
  const pct = Math.min(100, Math.round((view.sessionTokens / tokenMax) * 100));
  return (
    <header className="border-b-2 border-ink bg-paper">
      {/* Top utility bar */}
      <div className="flex items-center justify-between border-b border-ink px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
        <span>AGORA/FORUM · v0.4.1</span>
        <span className="text-ink2">
          //{" "}
          {view.sessionId ? `sid:${view.sessionId.slice(0, 6)}` : "no session"}{" "}
          · status: {view.status}
        </span>
        {view.sessionStartTs !== null && view.status !== "stopped" ? (
          <ServerTime startTs={view.sessionStartTs} durationMax={durationMax} />
        ) : (
          <span className="text-ink3">— —</span>
        )}
      </div>

      {/* Wordmark + meta grid */}
      <div className="grid grid-cols-[1fr_360px] border-b border-ink">
        <div className="border-r border-ink px-4 py-3">
          <h1 className="font-mono text-[44px] font-extrabold uppercase leading-[0.92] tracking-[-0.04em] text-ink">
            AGORA<span className="text-ink3">::</span>FORUM
          </h1>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink2">
            사용자가 끼어들 수 있는 멀티 AI 토론 — N=
            {view.agents.length || 0} AGENTS · ROUND {pad2(view.turn)} ·{" "}
            <span className={STATUS_TONE[view.status]}>
              {STATUS_LABEL[view.status]}
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-1.5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink3">
            // FLOOR
          </span>
          <div className="font-mono text-[14px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
            {view.activeSpeaker ? (
              <span className="bf-highlight">
                {AGENT_LABEL[view.activeSpeaker]} ON FLOOR
              </span>
            ) : view.status === "stopped" ? (
              <span>SESSION ENDED · {view.endReason ?? "—"}</span>
            ) : view.status === "idle" ? (
              <span className="bf-highlight">USER TURN — INTERRUPT NOW</span>
            ) : (
              <span className="text-ink2">— STANDBY —</span>
            )}
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink3">
            <span>
              TOK {view.sessionTokens.toLocaleString()}/
              {tokenMax.toLocaleString()}{" "}
              <span className={pct >= 90 ? "text-ink" : ""}>({pct}%)</span>
            </span>
            {view.sessionId && view.status !== "setup" && (
              <a
                href={`/api/export?id=${view.sessionId}`}
                className="border border-ink bg-paper px-2 py-0.5 text-ink hover:bg-ink hover:text-paper"
              >
                ↓ EXPORT.MD
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function ServerTime({
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
  const totalSec = Math.floor(elapsed / 1000);
  const hh = pad2(Math.floor(totalSec / 3600));
  const mm = pad2(Math.floor((totalSec % 3600) / 60));
  const ss = pad2(totalSec % 60);
  const totalMm = Math.floor(durationMax / 60000);
  const danger = elapsed >= durationMax * 0.9;
  return (
    <span className={danger ? "text-ink" : "text-ink2"}>
      ELAPSED {hh}:{mm}:{ss} / {pad2(totalMm)}:00
    </span>
  );
}
