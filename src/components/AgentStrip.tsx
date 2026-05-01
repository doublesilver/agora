/* AgentStrip — 활성 에이전트 실시간 활동 표시. ChatView 위에 고정. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, AgentPhase, SessionView } from "@/lib/client/types";

const THEME: Record<
  string,
  { bg: string; ring: string; emoji: string; label: string }
> = {
  claude: {
    bg: "bg-orange-950/50",
    ring: "ring-orange-800",
    emoji: "🟠",
    label: "Claude",
  },
  codex: {
    bg: "bg-emerald-950/50",
    ring: "ring-emerald-800",
    emoji: "🟢",
    label: "Codex",
  },
  gemini: {
    bg: "bg-gradient-to-br from-blue-950/50 to-purple-950/50",
    ring: "ring-blue-800",
    emoji: "✨",
    label: "Gemini",
  },
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "대기",
  thinking: "생각 중…",
  streaming: "전송 중",
  passed: "이번 라운드 PASS",
  timeout: "응답 시간 초과",
  error: "에러",
};

const PHASE_TONE: Record<AgentPhase, string> = {
  idle: "text-zinc-500",
  thinking: "text-amber-300 animate-pulse",
  streaming: "text-emerald-300",
  passed: "text-zinc-400",
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
    <div className="flex shrink-0 gap-2 border-b border-zinc-800 bg-zinc-950 px-6 py-3 text-xs">
      {enabled.map((cfg) => {
        const id = cfg.id;
        const stats = view.agentStats[id];
        const phase = stats?.phase ?? "idle";
        const isActive = view.activeSpeaker === id;
        const t = THEME[id];
        const modeLabel =
          cfg.mode === "api"
            ? "🔑 API"
            : id === "codex"
              ? "🖥 CLI · sandbox=read-only"
              : "🖥 CLI";
        return (
          <div
            key={id}
            className={`flex flex-1 items-center gap-2 rounded-md ${t.bg} px-3 py-2 ring-1 ${
              isActive ? "ring-2 ring-amber-500" : t.ring
            } transition-all`}
          >
            <Dot phase={phase} active={isActive} />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span>{t.emoji}</span>
                <span className="font-medium text-zinc-200">{t.label}</span>
                <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                  {modeLabel}
                </span>
                {stats?.lastTurn !== null && stats?.lastTurn !== undefined && (
                  <span className="text-[10px] text-zinc-500">
                    라운드 {stats.lastTurn}
                  </span>
                )}
                {stats?.model && (
                  <span className="text-[10px] text-zinc-600">
                    · {stats.model}
                  </span>
                )}
              </div>
              <div className={`text-[11px] ${PHASE_TONE[phase]}`}>
                {PHASE_LABEL[phase]}
                {phase === "streaming" &&
                  stats &&
                  stats.firstTokenAt &&
                  stats.startedAt && (
                    <span className="ml-1 text-zinc-500">
                      · TTFT{" "}
                      {((stats.firstTokenAt - stats.startedAt) / 1000).toFixed(
                        1,
                      )}
                      s
                    </span>
                  )}
                {phase === "thinking" && stats?.startedAt && (
                  <ThinkingTimer startedAt={stats.startedAt} />
                )}
              </div>
            </div>
            {stats && (stats.inputTokens > 0 || stats.outputTokens > 0) && (
              <div className="ml-auto text-[10px] tabular-nums text-zinc-500">
                in {stats.inputTokens} · out {stats.outputTokens}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dot({ phase, active }: { phase: AgentPhase; active: boolean }) {
  let classes = "h-2.5 w-2.5 rounded-full ";
  if (phase === "thinking") classes += "bg-amber-400 animate-pulse";
  else if (phase === "streaming") classes += "bg-emerald-400";
  else if (phase === "passed") classes += "bg-zinc-600";
  else if (phase === "timeout") classes += "bg-red-500";
  else if (phase === "error") classes += "bg-red-600";
  else classes += active ? "bg-amber-400 animate-pulse" : "bg-zinc-700";
  return <span className={classes} />;
}

function ThinkingTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <span className="ml-1 text-zinc-500">· {secs}s</span>;
}
