/* LeftPanel — Brutalist Forum 사이드 (시안 C 적용).
 * 좌측 모노 톤 컨트롤: status · roster summary · 토론 주제 · 시작 · 컨트롤 ·
 * ⚙ 설정 footer. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";

const LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const INITIAL: Record<AgentId, string> = {
  claude: "C",
  codex: "X",
  gemini: "G",
};

const ACCENT: Record<AgentId, string> = {
  claude: "#C84A2C",
  codex: "#2D7A4F",
  gemini: "#3F6CB6",
};

const DEMO_PRESETS: { label: string; text: string }[] = [
  {
    label: "🎮 서바이벌 에너지",
    text: "서바이벌 게임의 에너지 시스템을 설계해줘. 회복·소모·UI 표현·밸런스 핀에 합의된 1차 안과 근거가 필요해.",
  },
  {
    label: "⚔️ MMO 길드전 매칭",
    text: "MMO 길드전의 매칭·점수·보상 시스템을 설계해줘. 인원 비대칭과 실력 차이를 어떻게 흡수할지 함께 논의해줘.",
  },
  {
    label: "🎲 리듬 게임 채보",
    text: "리듬 게임의 채보 자동 난이도 조정 시스템을 설계해줘. 곡 분석·플레이어 스킬 추정·실시간 보정 메커니즘.",
  },
];

interface CliCheck {
  id: AgentId;
  found: boolean;
  version?: string;
  path?: string;
  hint: string;
  overridden?: boolean;
}
type CliStatus = Record<AgentId, CliCheck> | null;

interface Props {
  configs: AgentConfig[];
  view: SessionView;
  summarizerId: AgentId | null;
  onStart: (prompt: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
}

export function LeftPanel(props: Props) {
  const { configs, view } = props;
  const [userPrompt, setUserPrompt] = useState(
    "서바이벌 게임의 에너지 시스템을 설계해줘.",
  );
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);

  useEffect(() => {
    fetch("/api/cli-status")
      .then((r) => r.json())
      .then((d) => setCliStatus(d as CliStatus))
      .catch(() => setCliStatus(null));
  }, []);

  const enabledCount = configs.filter((c) => c.enabled).length;
  const isSetup = view.status === "setup";
  const isRunning =
    view.status === "running" ||
    view.status === "idle" ||
    view.status === "paused";
  const canStart = isSetup && enabledCount >= 2 && userPrompt.trim().length > 0;

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r-2 border-ink bg-paper font-mono text-[12px] text-ink">
      {/* Top utility bar */}
      <div className="flex items-center justify-between border-b border-ink px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] text-ink2">
        <span>// SIDEBAR</span>
        <span className="bf-highlight px-1 text-ink">{view.status}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        <RosterSummary configs={configs} cliStatus={cliStatus} />

        {!isSetup && props.summarizerId && (
          <div className="border border-ink bg-paper2 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-ink2">
            // SUMMARIZER →{" "}
            <span className="font-bold text-ink">
              {LABEL[props.summarizerId]}
            </span>
          </div>
        )}

        {isSetup && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink2">
              / TOPIC
            </h2>
            <div className="flex flex-wrap gap-1">
              {DEMO_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setUserPrompt(p.text)}
                  className="border border-ink bg-paper px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ink2 hover:bg-ink hover:text-paper"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (canStart) props.onStart(userPrompt);
                }
              }}
              aria-label="토론 주제"
              placeholder={
                canStart
                  ? "↵ START · ⇧↵ NEWLINE"
                  : enabledCount < 2
                    ? "// ACTIVE_AGENTS<2 — set in ⚙"
                    : "// 토론 주제를 한 줄로"
              }
              className="h-20 resize-none border border-ink bg-paper p-2 text-[12px] leading-relaxed text-ink outline-none placeholder:text-ink3"
            />
            <button
              type="button"
              data-shortcut-target="start-session"
              disabled={!canStart}
              onClick={() => props.onStart(userPrompt)}
              title={
                canStart
                  ? "세션 시작"
                  : enabledCount < 2
                    ? "AI 2개 이상 활성화 필요"
                    : "토론 주제 입력 필요"
              }
              className="border-2 border-ink bg-ink px-3 py-2 text-[12px] font-bold uppercase tracking-[0.2em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-ink3"
            >
              ▶ START SESSION
            </button>
            {enabledCount < 2 && (
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink3">
                // ACTIVATE ≥2 AGENTS via ⚙ SETTINGS
              </p>
            )}
          </section>
        )}

        {isRunning && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink2">
              / CONTROL
            </h2>
            {view.status !== "paused" ? (
              <button
                onClick={props.onPause}
                className="border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
              >
                ‖ PAUSE
              </button>
            ) : (
              <button
                onClick={props.onResume}
                className="border-2 border-ink bg-highlight px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
              >
                ▶ RESUME
              </button>
            )}
            <button
              onClick={props.onStop}
              className="border-2 border-ink bg-ink px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-paper hover:bg-paper hover:text-ink"
            >
              ■ STOP SESSION
            </button>
          </section>
        )}

        {view.status === "stopped" && (
          <section className="flex flex-col gap-2">
            <SessionSummaryCard view={view} />
            <button
              onClick={props.onReset}
              className="border-2 border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
            >
              ⟳ NEW SESSION
            </button>
          </section>
        )}
      </div>

      <footer className="shrink-0 border-t-2 border-ink p-2">
        <button
          type="button"
          onClick={props.onOpenSettings}
          aria-label="설정 열기"
          title="설정 (AI 에이전트, 결과 정리, 참고 문서, 외관, 한도, 백업)"
          className="flex w-full items-center justify-between border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
        >
          <span className="flex items-center gap-2">
            <span>⚙</span>
            <span>SETTINGS</span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] opacity-70">
            {enabledCount}/3 ACTIVE
          </span>
        </button>
      </footer>
    </aside>
  );
}

const END_REASON_LABEL: Record<string, string> = {
  user_stop: "USER STOP",
  max_turns: "MAX TURNS",
  budget_exceeded: "BUDGET",
  time_exceeded: "TIME CAP",
};

function SessionSummaryCard({ view }: { view: SessionView }) {
  const agentMsgs = view.messages.filter((m) => m.role !== "user");
  const userMsgs = view.messages.filter((m) => m.role === "user");
  const reason = view.endReason
    ? (END_REASON_LABEL[view.endReason] ?? view.endReason.toUpperCase())
    : "—";

  return (
    <div className="border-2 border-ink bg-paper2">
      <div className="border-b border-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
        ✓ SESSION COMPLETE
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          <tr className="border-b border-ink/30">
            <th className="px-3 py-1 text-left text-ink2">END</th>
            <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">
              {reason}
            </td>
          </tr>
          <tr className="border-b border-ink/30">
            <th className="px-3 py-1 text-left text-ink2">ROUNDS</th>
            <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">
              {view.turn}
            </td>
          </tr>
          <tr className="border-b border-ink/30">
            <th className="px-3 py-1 text-left text-ink2">AGENT TURNS</th>
            <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">
              {agentMsgs.length}
            </td>
          </tr>
          <tr className="border-b border-ink/30">
            <th className="px-3 py-1 text-left text-ink2">USER INTERRUPTS</th>
            <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">
              {userMsgs.length}
            </td>
          </tr>
          <tr>
            <th className="px-3 py-1 text-left text-ink2">TOKENS</th>
            <td className="px-3 py-1 text-right font-bold tabular-nums text-ink">
              {view.sessionTokens.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
      {view.sessionId && (
        <a
          href={`/api/export?id=${view.sessionId}`}
          className="block border-t border-ink bg-ink px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-paper hover:bg-paper hover:text-ink"
        >
          ↓ DOWNLOAD MARKDOWN
        </a>
      )}
    </div>
  );
}

function RosterSummary({
  configs,
  cliStatus,
}: {
  configs: AgentConfig[];
  cliStatus: CliStatus;
}) {
  return (
    <div className="border border-ink bg-paper">
      <div className="border-b border-ink bg-ink px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-paper">
        $ ROSTER
      </div>
      <div className="divide-y divide-ink/30">
        {configs.map((c) => {
          let statusLabel = "OFF";
          if (c.enabled) {
            if (c.mode === "api") {
              statusLabel = c.apiKey.trim().length > 0 ? "READY" : "NO KEY";
            } else {
              const check = cliStatus?.[c.id];
              statusLabel =
                check === undefined ? "—" : check.found ? "LIVE" : "MISS";
            }
          }
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between px-2.5 py-1 text-[11px] ${
                c.enabled ? "" : "opacity-50"
              }`}
            >
              <span>
                <span
                  className="font-bold"
                  style={{ color: c.enabled ? ACCENT[c.id] : undefined }}
                >
                  [{INITIAL[c.id]}]
                </span>{" "}
                <span className="font-bold">{LABEL[c.id]}</span>{" "}
                <span className="text-ink3">@{c.mode}</span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.18em] text-ink2">
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
