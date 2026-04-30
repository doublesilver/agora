/* LeftPanel — 인증/모드/시스템 프롬프트/세션 시작 + 진행 중 컨트롤. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import { ROLE_SEEDS } from "@/lib/agents/role-seeds";
import type { AgentId } from "@/lib/agents/types";

const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex (OpenAI)",
  gemini: "Gemini",
};

interface CliCheck {
  id: AgentId;
  found: boolean;
  version?: string;
  path?: string;
  hint: string;
}
type CliStatus = Record<AgentId, CliCheck> | null;

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
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);
  const [cliLoading, setCliLoading] = useState(false);

  async function refreshCliStatus() {
    setCliLoading(true);
    try {
      const res = await fetch("/api/cli-status");
      const data = (await res.json()) as CliStatus;
      setCliStatus(data);
    } catch {
      setCliStatus(null);
    } finally {
      setCliLoading(false);
    }
  }

  useEffect(() => {
    refreshCliStatus();
  }, []);
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
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            AI 에이전트
          </h2>
          <button
            type="button"
            onClick={refreshCliStatus}
            disabled={cliLoading}
            className="text-[11px] text-zinc-400 underline disabled:opacity-50 hover:text-zinc-200"
          >
            {cliLoading ? "확인 중…" : "↻ CLI 상태 새로고침"}
          </button>
        </div>
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
              <CliStatusBlock check={cliStatus?.[c.id]} loading={cliLoading} />
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

function CliStatusBlock({
  check,
  loading,
}: {
  check?: CliCheck;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-[11px] text-zinc-500">CLI 상태 확인 중…</p>;
  }
  if (!check) {
    return (
      <p className="text-[11px] text-zinc-500">
        CLI 상태를 알 수 없음. 위의 ↻ 버튼으로 새로고침.
      </p>
    );
  }
  if (check.found) {
    return (
      <div className="flex flex-col gap-1 rounded bg-emerald-950/40 p-2 text-[11px] text-emerald-200 ring-1 ring-emerald-900/60">
        <div className="font-medium">✓ {check.id} CLI 사용 가능</div>
        <div className="font-mono text-emerald-300/80">
          {check.path ? `${check.path} · ` : ""}
          {check.version}
        </div>
        <div className="text-emerald-300/60">
          본인 구독·OAuth 인증을 그대로 활용. 라운드 시작 시 인증 실패면 빨간
          에러로 surface.
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded bg-red-950/40 p-2 text-[11px] text-red-200 ring-1 ring-red-900/60">
      <div className="font-medium">✗ {check.id} CLI 미설치</div>
      <details className="text-red-300/80">
        <summary className="cursor-pointer select-none">
          설치·로그인 방법
        </summary>
        <div className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-red-300/90">
          {check.hint}
        </div>
      </details>
      <div className="text-red-300/60">
        설치 후 위의 ↻ 새로고침. 또는 API 모드로 전환.
      </div>
    </div>
  );
}
