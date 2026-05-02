/* AgentStrip — Forum Roster (시안 C BFAgentRegistry 적용).
 * $ ROSTER 헤더 + 에이전트 inline status + USER row.
 * 발화 중인 에이전트는 highlight 배경 + LiveElapsed로 토큰 도착 후 경과 시간을
 * 1s 간격으로 갱신해 사용자에게 "지금 누가 얼마나 말하고 있는지" 직접 노출. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, AgentPhase, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";

const LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const ACCENT: Record<AgentId, string> = {
  claude: "#C84A2C",
  codex: "#2D7A4F",
  gemini: "#3F6CB6",
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "○ STANDBY",
  thinking: "◍ THINKING",
  streaming: "◉ SPEAKING",
  passed: "✓ PASS",
  timeout: "‖ TIMEOUT",
  error: "‖ ERROR",
};

interface Props {
  view: SessionView;
  configs: AgentConfig[];
}

export function AgentStrip({ view, configs }: Props) {
  if (view.status === "setup") return null;
  const enabled = configs.filter((c) => c.enabled);
  if (enabled.length === 0) return null;

  return (
    <div className="grid shrink-0 grid-cols-[120px_repeat(3,1fr)_220px] border-b border-ink bg-paper font-mono text-[11px] text-ink">
      <div className="border-r border-ink bg-ink px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-paper">
        $ ROSTER
      </div>
      {enabled.map((cfg) => {
        const id = cfg.id;
        const stats = view.agentStats[id];
        const phase = stats?.phase ?? "idle";
        const isLive = view.activeSpeaker === id;
        return (
          <div
            key={id}
            className="flex items-center justify-between border-r border-ink px-3 py-2"
            style={isLive ? { background: "var(--highlight)" } : undefined}
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                style={{ color: ACCENT[id] }}
                className="text-[14px] leading-none"
              >
                ●
              </span>
              <span className="font-bold">{LABEL[id]}</span>
              <span className="text-ink3">@{cfg.mode}</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em]">
              {PHASE_LABEL[phase]}
              {isLive && stats?.startedAt ? (
                <LiveElapsed startedAt={stats.startedAt} />
              ) : null}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink3">
          USER
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink">
          {view.status === "idle"
            ? "● USER TURN"
            : view.status === "paused"
              ? "‖ PAUSED"
              : "● ON-CALL"}
        </span>
      </div>
    </div>
  );
}

/** 발화 시작 시점부터 경과 시간을 1s 간격으로 갱신 표시. */
function LiveElapsed({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <span className="ml-1 text-ink2">{elapsed}s</span>;
}
