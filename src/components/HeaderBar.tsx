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
    <header className="border-b-[3px] border-ink bg-paper">
      {/* Top utility bar — brutal: bg-ink, paper text */}
      <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-paper">
        <span>AGORA/FORUM · v0.4.1-rc</span>
        <span className="text-paper2">
          //{" "}
          {view.sessionId ? `sid:${view.sessionId.slice(0, 8)}` : "no session"}{" "}
          · status:{" "}
          <span className="bg-highlight px-1 text-ink">{view.status}</span>
        </span>
        {view.sessionStartTs !== null && view.status !== "stopped" ? (
          <ServerTime startTs={view.sessionStartTs} durationMax={durationMax} />
        ) : (
          <span className="text-paper2">— STANDBY —</span>
        )}
      </div>

      {/* Wordmark + meta grid */}
      <div className="grid grid-cols-[1fr_400px] border-b-2 border-ink">
        <div className="border-r-2 border-ink px-5 py-5">
          <h1 className="font-mono text-[72px] font-black uppercase leading-[0.86] tracking-[-0.05em] text-ink">
            AGORA<span className="text-ink3">::</span>FORUM
          </h1>
          <div className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink2">
            {view.status === "setup" ? (
              <span className="text-ink3">// AWAITING AUTH · ROSTER → ⚙</span>
            ) : (
              <>
                N=
                <span className="text-ink">{view.agents.length} AGENTS</span> ·
                ROUND <span className="text-ink">{pad2(view.turn)}</span> ·{" "}
                <span
                  className={`bg-highlight px-1 ${STATUS_TONE[view.status]}`}
                >
                  {STATUS_LABEL[view.status]}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 bg-paper2 px-5 py-4">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink3">
            // FLOOR
          </span>
          <div className="font-mono text-[18px] font-black leading-[1.15] tracking-[-0.02em] text-ink">
            {view.activeSpeaker ? (
              <span className="bg-highlight px-1">
                ◉ {AGENT_LABEL[view.activeSpeaker]} · ON FLOOR
              </span>
            ) : view.status === "stopped" ? (
              <span className="bg-ink px-1 text-paper">
                ‖ ENDED · {view.endReason ?? "—"}
              </span>
            ) : view.status === "idle" ? (
              <span className="bg-highlight px-1">
                ※ USER TURN — INTERRUPT NOW
              </span>
            ) : (
              <span className="text-ink2">— STANDBY —</span>
            )}
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink2">
            <span>
              TOK{" "}
              <span className="text-ink">
                {view.sessionTokens.toLocaleString()}
              </span>
              /{tokenMax.toLocaleString()}{" "}
              <span className={pct >= 90 ? "bg-ink px-1 text-paper" : ""}>
                ({pct}%)
              </span>
            </span>
            {view.sessionId && view.status !== "setup" && (
              <a
                href={`/api/export?id=${view.sessionId}`}
                className="border-2 border-ink bg-paper px-3 py-1 text-ink hover:bg-ink hover:text-paper"
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
