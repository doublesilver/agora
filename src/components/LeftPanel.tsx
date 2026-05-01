/* LeftPanel — 본질 컨트롤만 노출 (wordmark · 토론 주제 · 세션 시작 ·
 * 진행 컨트롤 · 종료 카드 · 좌하단 ⚙ 설정 트리거).
 * 인증·역할 메모·요약 담당·참고 문서·import/export 등은 SettingsModal로 이전. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";

const AGENT_LABEL_SHORT: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
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
    // 좌패널 칩 요약에서 CLI 가용성 표시용. 페이지 마운트 시 1회.
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
    <aside className="flex h-full w-[420px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-sm text-zinc-200">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Agora</h1>
          <span
            tabIndex={-1}
            aria-label={`현재 상태: ${view.status}`}
            className="cursor-default select-none rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
          >
            {view.status}
          </span>
        </header>

        <AgentsSummaryRow configs={configs} cliStatus={cliStatus} />

        {!isSetup && props.summarizerId && (
          <p className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-500 ring-1 ring-zinc-800">
            📝 결과 정리:{" "}
            <span className="text-zinc-300">
              {AGENT_LABEL_SHORT[props.summarizerId]}
            </span>
          </p>
        )}

        {isSetup && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              토론 주제
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setUserPrompt(p.text)}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
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
                  ? "Enter로 시작 · Shift+Enter 줄바꿈"
                  : enabledCount < 2
                    ? "활성 AI 2개 + 토론 주제 입력 필요"
                    : "토론 주제를 입력하세요 · Shift+Enter 줄바꿈"
              }
              className="h-20 resize-none rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
            />
            <button
              type="button"
              disabled={!canStart}
              onClick={() => props.onStart(userPrompt)}
              title={
                canStart
                  ? "세션 시작"
                  : enabledCount < 2
                    ? "AI 2개 이상 활성화 필요"
                    : "토론 주제 입력 필요"
              }
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:opacity-60 disabled:shadow-none"
            >
              세션 시작
            </button>
            {enabledCount < 2 && (
              <p className="text-[11px] text-zinc-500">
                AI를 2개 이상 활성화해주세요. 좌하단 ⚙ 설정.
              </p>
            )}
          </section>
        )}

        {isRunning && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              컨트롤
            </h2>
            {view.status !== "paused" ? (
              <button
                onClick={props.onPause}
                className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
              >
                ⏸ 일시정지
              </button>
            ) : (
              <button
                onClick={props.onResume}
                className="rounded bg-green-700 px-3 py-2 text-sm hover:bg-green-600"
              >
                ▶ 재개
              </button>
            )}
            <button
              onClick={props.onStop}
              className="rounded bg-red-800 px-3 py-2 text-sm hover:bg-red-700"
            >
              ⏹ 종료
            </button>
          </section>
        )}

        {view.status === "stopped" && (
          <section className="flex flex-col gap-3">
            <SessionSummaryCard view={view} />
            <button
              onClick={props.onReset}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500"
            >
              🆕 새 세션 시작
            </button>
          </section>
        )}
      </div>

      <footer className="shrink-0 border-t border-zinc-800/80 p-3">
        <button
          type="button"
          onClick={props.onOpenSettings}
          aria-label="설정 열기"
          title="설정 (AI 에이전트, 결과 정리, 참고 문서, 외관, 한도, 백업)"
          className="flex w-full items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50"
        >
          <span className="text-lg">⚙</span>
          <span className="flex-1 text-left font-medium">설정</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {enabledCount}/3 active
          </span>
        </button>
      </footer>
    </aside>
  );
}

const END_REASON_LABEL: Record<string, string> = {
  user_stop: "사용자 STOP",
  max_turns: "최대 턴 도달",
  budget_exceeded: "토큰 예산 도달",
  time_exceeded: "시간 캡 도달",
};

function SessionSummaryCard({ view }: { view: SessionView }) {
  const agentMsgs = view.messages.filter((m) => m.role !== "user");
  const userMsgs = view.messages.filter((m) => m.role === "user");
  const byAgent: Record<string, number> = {};
  for (const m of agentMsgs) byAgent[m.role] = (byAgent[m.role] ?? 0) + 1;
  const top = Object.entries(byAgent).sort((a, b) => b[1] - a[1])[0];
  const reason = view.endReason
    ? (END_REASON_LABEL[view.endReason] ?? view.endReason)
    : "—";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-sm font-medium text-zinc-100">✅ 세션 완료</div>
      <p className="mt-1 text-[11px] text-zinc-400">
        종료 사유: <span className="text-zinc-200">{reason}</span>
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-[11px] text-zinc-400">
        <li>
          🌀 라운드 <span className="text-zinc-100">{view.turn}</span>
        </li>
        <li>
          💬 발언 <span className="text-zinc-100">{agentMsgs.length}</span>건 ·
          사용자 <span className="text-zinc-100">{userMsgs.length}</span>건
        </li>
        <li>
          🎟 토큰{" "}
          <span className="text-zinc-100">
            {view.sessionTokens.toLocaleString()}
          </span>
        </li>
        {top && (
          <li>
            🏆 최다 발언:{" "}
            <span className="text-zinc-100">
              {AGENT_LABEL_SHORT[top[0] as AgentId] ?? top[0]}
            </span>{" "}
            ({top[1]}회)
          </li>
        )}
      </ul>
      {view.sessionId && (
        <a
          href={`/api/export?id=${view.sessionId}`}
          className="mt-3 block rounded bg-zinc-800 px-3 py-2 text-center text-xs hover:bg-zinc-700"
        >
          📥 transcript markdown 다운로드
        </a>
      )}
    </div>
  );
}

function AgentsSummaryRow({
  configs,
  cliStatus,
}: {
  configs: AgentConfig[];
  cliStatus: CliStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {configs.map((c) => {
        if (!c.enabled) {
          return (
            <span
              key={c.id}
              className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-600 ring-1 ring-zinc-800"
            >
              ⚪ {AGENT_LABEL_SHORT[c.id]}
            </span>
          );
        }
        const modeIcon = c.mode === "api" ? "🔑" : "🖥";
        let dot = "⚪";
        if (c.mode === "api") {
          dot = c.apiKey.trim().length > 0 ? "🟡" : "⚪";
        } else {
          const check = cliStatus?.[c.id];
          dot = check === undefined ? "⚪" : check.found ? "🟢" : "🔴";
        }
        return (
          <span
            key={c.id}
            className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-800"
          >
            {dot} {modeIcon} {AGENT_LABEL_SHORT[c.id]}
          </span>
        );
      })}
    </div>
  );
}
