/* LeftPanel — 인증/모드/시스템 프롬프트/세션 시작 + 진행 중 컨트롤. */
"use client";

import { useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import { ROLE_SEEDS } from "@/lib/agents/role-seeds";
import type { AgentId } from "@/lib/agents/types";

const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex (OpenAI)",
  gemini: "Gemini",
};

interface Props {
  configs: AgentConfig[];
  setConfigs: (next: AgentConfig[]) => void;
  view: SessionView;
  onStart: (prompt: string) => void;
  onSetSystemPrompt: (id: AgentId, prompt: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function LeftPanel(props: Props) {
  const { configs, setConfigs, view } = props;
  const [userPrompt, setUserPrompt] = useState(
    "서바이벌 게임의 에너지 시스템을 설계해줘.",
  );
  const enabledCount = configs.filter((c) => c.enabled).length;
  const isSetup = view.status === "setup";
  const isRunning =
    view.status === "running" ||
    view.status === "idle" ||
    view.status === "paused";
  const canStart = isSetup && enabledCount >= 2 && userPrompt.trim().length > 0;

  function patch(id: AgentId, partial: Partial<AgentConfig>) {
    setConfigs(configs.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  }

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Agora</h1>
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
          {view.status}
        </span>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          AI 에이전트
        </h2>
        {configs.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-3"
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.enabled}
                disabled={!isSetup}
                onChange={(e) => patch(c.id, { enabled: e.target.checked })}
              />
              <span className="font-medium">{AGENT_LABELS[c.id]}</span>
              <select
                value={c.mode}
                disabled={!isSetup}
                onChange={(e) =>
                  patch(c.id, { mode: e.target.value as AgentConfig["mode"] })
                }
                className="ml-auto rounded bg-zinc-800 px-2 py-0.5 text-xs"
              >
                <option value="api">API</option>
                <option value="cli">CLI</option>
              </select>
            </label>
            {c.mode === "api" && (
              <input
                type="password"
                placeholder="API 키"
                disabled={!isSetup}
                value={c.apiKey}
                onChange={(e) => patch(c.id, { apiKey: e.target.value })}
                className="rounded bg-zinc-800 px-2 py-1 text-xs"
              />
            )}
            {c.mode === "cli" && (
              <p className="text-[11px] text-zinc-500">
                CLI 모드: 사용자 머신의 인증된 <code>{c.id}</code> CLI를 spawn.
              </p>
            )}
            <details className="text-[11px] text-zinc-400">
              <summary className="cursor-pointer select-none">
                역할 메모 (시스템 프롬프트)
              </summary>
              <textarea
                value={c.systemPrompt}
                onChange={(e) => {
                  patch(c.id, { systemPrompt: e.target.value });
                  if (isRunning) props.onSetSystemPrompt(c.id, e.target.value);
                }}
                className="mt-1 h-24 w-full resize-none rounded bg-zinc-800 p-2 text-xs text-zinc-200"
              />
              <button
                type="button"
                onClick={() => {
                  patch(c.id, { systemPrompt: ROLE_SEEDS[c.id] });
                  if (isRunning)
                    props.onSetSystemPrompt(c.id, ROLE_SEEDS[c.id]);
                }}
                className="mt-1 text-[11px] text-zinc-400 underline hover:text-zinc-200"
              >
                ↺ Reset to default
              </button>
            </details>
          </div>
        ))}
      </section>

      {isSetup && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            토론 주제
          </h2>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="h-20 resize-none rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
          />
          <button
            type="button"
            disabled={!canStart}
            onClick={() => props.onStart(userPrompt)}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            세션 시작 ({enabledCount}/3 활성)
          </button>
          {enabledCount < 2 && (
            <p className="text-[11px] text-zinc-500">2개 이상 활성화 필요.</p>
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
              className="rounded bg-zinc-800 px-3 py-2 text-sm"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={props.onResume}
              className="rounded bg-green-700 px-3 py-2 text-sm"
            >
              ▶ Resume
            </button>
          )}
          <button
            onClick={props.onStop}
            className="rounded bg-red-800 px-3 py-2 text-sm"
          >
            ⏹ Stop
          </button>
        </section>
      )}

      {view.status === "stopped" && (
        <section className="flex flex-col gap-2">
          <p className="text-xs text-zinc-400">
            종료 사유: {view.endReason ?? "—"}
          </p>
          <button
            onClick={props.onReset}
            className="rounded bg-zinc-800 px-3 py-2 text-sm"
          >
            새 세션 시작
          </button>
        </section>
      )}
    </aside>
  );
}
