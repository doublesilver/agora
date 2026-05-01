/* AgentStrip — 방송 cue sheet (huashu-design ⑤ After 적용).
 * Cue / Speaker / Phase / Tokens·Elapsed 4-column row + streaming row 하단
 * 그라데이션 progress bar. */
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
  claude: "text-orange-300",
  codex: "text-emerald-300",
  gemini: "text-blue-300",
};

const STREAM_GRADIENT: Record<AgentId, string> = {
  claude: "via-orange-400/80",
  codex: "via-emerald-400/80",
  gemini: "via-blue-400/80",
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "STANDBY",
  thinking: "THINKING",
  streaming: "STREAMING",
  passed: "PASSED",
  timeout: "TIMEOUT",
  error: "ERROR",
};

const PHASE_TONE: Record<AgentPhase, string> = {
  idle: "text-zinc-600",
  thinking: "text-amber-300",
  streaming: "",
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
    <div className="flex shrink-0 flex-col bg-zinc-950 text-[11px]">
      {/* Cue sheet header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 pb-1.5 pt-2">
        <span className="w-12 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Cue
        </span>
        <span className="w-20 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Speaker
        </span>
        <span className="flex-1 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Phase
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Tokens · Elapsed
        </span>
      </div>

      {enabled.map((cfg, i) => {
        const id = cfg.id;
        const stats = view.agentStats[id];
        const phase = stats?.phase ?? "idle";
        const isActive = view.activeSpeaker === id;
        const streaming = phase === "streaming";
        const cueNumber = String(enabled.length - i).padStart(2, "0");
        const tokens =
          stats && (stats.inputTokens > 0 || stats.outputTokens > 0)
            ? `${(stats.inputTokens + stats.outputTokens).toLocaleString()} tok`
            : "—";
        const elapsed =
          stats?.startedAt && stats?.endedAt
            ? `${Math.max(0, Math.round((stats.endedAt - stats.startedAt) / 1000))}s`
            : streaming && stats?.startedAt
              ? "live"
              : "—";

        return (
          <div key={id} className="relative">
            <div className="flex items-center gap-3 border-b border-zinc-800/60 px-6 py-1.5 hover:bg-zinc-900/40">
              <span
                className={`w-12 font-mono text-[11px] tabular-nums ${
                  streaming || isActive ? "text-zinc-200" : "text-zinc-600"
                }`}
              >
                CUE {cueNumber}
              </span>
              <div className={`flex w-20 items-center gap-1.5 ${ACCENT[id]}`}>
                <span className="text-[10px]" aria-hidden="true">
                  ●
                </span>
                <span className="font-mono text-[11px] font-semibold tracking-wide">
                  {LABEL[id]}
                </span>
              </div>
              <span
                className={`flex-1 font-mono text-[10px] tracking-[0.25em] ${
                  streaming ? ACCENT[id] : PHASE_TONE[phase]
                }`}
              >
                {PHASE_LABEL[phase]}
                {phase === "streaming" &&
                  stats?.firstTokenAt &&
                  stats?.startedAt && (
                    <span className="ml-2 text-zinc-600">
                      ttft{" "}
                      {((stats.firstTokenAt - stats.startedAt) / 1000).toFixed(
                        1,
                      )}
                      s
                    </span>
                  )}
                {phase === "thinking" && stats?.startedAt && (
                  <ThinkingTimer startedAt={stats.startedAt} />
                )}
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">
                {tokens} · {elapsed}
              </span>
            </div>
            {streaming && (
              <div
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-px overflow-hidden"
              >
                <div
                  className={`streambar h-full w-1/3 bg-gradient-to-r from-transparent ${STREAM_GRADIENT[id]} to-transparent`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThinkingTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <span className="ml-2 text-zinc-600">{secs}s</span>;
}
