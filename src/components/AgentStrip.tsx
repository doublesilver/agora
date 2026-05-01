/* AgentStrip — 활성 에이전트 실시간 활동 인디케이터.
 * 카드 풍 대신 얇은 메타 라인 — HeaderBar 메스트헤드 톤과 일관. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, AgentPhase, SessionView } from "@/lib/client/types";

const LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const ACCENT: Record<string, string> = {
  claude: "text-orange-300",
  codex: "text-emerald-300",
  gemini: "text-blue-300",
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "idle",
  thinking: "thinking",
  streaming: "streaming",
  passed: "pass",
  timeout: "timeout",
  error: "error",
};

const PHASE_TONE: Record<AgentPhase, string> = {
  idle: "text-zinc-600",
  thinking: "text-amber-300",
  streaming: "text-emerald-300",
  passed: "text-zinc-500",
  timeout: "text-red-300",
  error: "text-red-400",
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
    <div className="flex shrink-0 items-center gap-6 border-b border-zinc-800/80 bg-zinc-950 px-6 py-1.5 text-[11px]">
      {enabled.map((cfg, i) => {
        const id = cfg.id;
        const stats = view.agentStats[id];
        const phase = stats?.phase ?? "idle";
        const isActive = view.activeSpeaker === id;
        return (
          <div key={id} className="flex items-center gap-2.5">
            {i > 0 && <span className="text-zinc-800">·</span>}
            <Dot phase={phase} active={isActive} />
            <span className={`font-medium ${ACCENT[id]}`}>{LABEL[id]}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-600">
              {cfg.mode}
            </span>
            <span
              className={`font-mono uppercase tracking-wider ${PHASE_TONE[phase]}`}
            >
              {PHASE_LABEL[phase]}
              {phase === "streaming" &&
                stats?.firstTokenAt &&
                stats?.startedAt && (
                  <span className="ml-1 text-zinc-600">
                    {((stats.firstTokenAt - stats.startedAt) / 1000).toFixed(1)}
                    s
                  </span>
                )}
              {phase === "thinking" && stats?.startedAt && (
                <ThinkingTimer startedAt={stats.startedAt} />
              )}
            </span>
            {stats && (stats.inputTokens > 0 || stats.outputTokens > 0) && (
              <span className="font-mono tabular-nums text-zinc-600">
                {stats.inputTokens}↓ {stats.outputTokens}↑
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dot({ phase, active }: { phase: AgentPhase; active: boolean }) {
  let cls = "h-1.5 w-1.5 rounded-full ";
  if (phase === "thinking") cls += "bg-amber-400 animate-pulse";
  else if (phase === "streaming") cls += "bg-emerald-400";
  else if (phase === "passed") cls += "bg-zinc-600";
  else if (phase === "timeout") cls += "bg-red-500";
  else if (phase === "error") cls += "bg-red-600";
  else cls += active ? "bg-amber-400 animate-pulse" : "bg-zinc-700";
  return <span className={cls} aria-hidden="true" />;
}

function ThinkingTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <span className="ml-1 text-zinc-600">{secs}s</span>;
}
