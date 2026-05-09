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

const ACCENT: Record<AgentId, string> = {
  claude: "#C84A2C",
  codex: "#2D7A4F",
  gemini: "#3F6CB6",
};

const DEMO_PRESETS: { label: string; text: string }[] = [
  {
    label: "📋 요구사항 정리",
    text: "[프로젝트 이름]의 1차 요구사항 문서를 작성해줘. 핵심 기능·우선순위·수용 기준에 합의된 안과 그 근거가 필요해.",
  },
  {
    label: "🧭 의사결정 비교",
    text: "[A안 vs B안] 두 옵션을 비교 평가해줘. 각각의 트레이드오프·리스크·전제 조건을 함께 정리하고, 1순위 추천과 그 이유를 제시해.",
  },
  {
    label: "✍️ 글 다듬기",
    text: "다음 글의 명확성·구조·톤을 개선해줘. 변경한 부분과 그 이유를 함께 보여줘.\n\n[여기에 글 붙여넣기]",
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
    "토론 주제를 입력하세요. (좌측 프리셋을 클릭하면 예시가 들어옵니다)",
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
                  ? "↵ 시작 · ⇧↵ 줄바꿈"
                  : enabledCount < 2
                    ? "// 활성 에이전트 < 2 — ⚙에서 활성화"
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
                // ⚙ 설정에서 AI 에이전트 2개 이상 활성화 필요
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
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="text-[14px] leading-none"
                  style={{ color: c.enabled ? ACCENT[c.id] : undefined }}
                >
                  ●
                </span>
                <span className="font-bold">{LABEL[c.id]}</span>
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
