/* LeftPanel — 인증/모드/시스템 프롬프트/세션 시작 + 진행 중 컨트롤. */
"use client";

import { useEffect, useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import { ROLE_SEEDS } from "@/lib/agents/role-seeds";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "@/lib/client/friendly-error";
import { exportConfig, importConfig } from "@/lib/client/config-io";

type AuthPhase = "idle" | "checking" | "valid" | "invalid";
interface AuthState {
  phase: AuthPhase;
  detail?: string;
  error?: string;
}

const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex (OpenAI)",
  gemini: "Gemini",
};

const AGENT_PERSONA: Record<AgentId, string> = {
  claude: "구조화·요약·검토",
  codex: "구현·구체화",
  gemini: "대안·반례·검증",
};

const AGENT_ACCENT: Record<AgentId, string> = {
  claude: "text-orange-300",
  codex: "text-emerald-300",
  gemini: "text-blue-300",
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
}
type CliStatus = Record<AgentId, CliCheck> | null;

interface Props {
  configs: AgentConfig[];
  setConfigs: (next: AgentConfig[]) => void;
  referenceDoc: string;
  setReferenceDoc: (next: string) => void;
  summarizerId: AgentId | null;
  setSummarizerId: (next: AgentId | null) => void;
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
  const [authStates, setAuthStates] = useState<
    Partial<Record<AgentId, AuthState>>
  >({});
  const [showAgentsModal, setShowAgentsModal] = useState(false);

  async function checkApiKey(id: AgentId, apiKey: string) {
    setAuthStates((prev) => ({ ...prev, [id]: { phase: "checking" } }));
    try {
      const res = await fetch("/api/auth-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, apiKey }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        detail?: string;
        error?: string;
      };
      if (data.ok) {
        setAuthStates((prev) => ({
          ...prev,
          [id]: { phase: "valid", detail: data.detail },
        }));
      } else {
        setAuthStates((prev) => ({
          ...prev,
          [id]: { phase: "invalid", error: data.error ?? "검증 실패" },
        }));
      }
    } catch (err) {
      setAuthStates((prev) => ({
        ...prev,
        [id]: {
          phase: "invalid",
          error: (err as Error).message ?? String(err),
        },
      }));
    }
  }

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
    if ("apiKey" in partial) {
      // 키 변경 시 검증 인디케이터 idle로 리셋.
      setAuthStates((prev) => ({ ...prev, [id]: { phase: "idle" } }));
    }
    setConfigs(configs.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  }

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Agora</h1>
        <div className="flex items-center gap-2">
          {isSetup && (
            <>
              <button
                type="button"
                onClick={() => exportConfig(configs, props.referenceDoc)}
                className="text-[10px] text-zinc-500 underline hover:text-zinc-300"
                title="현재 설정을 JSON으로 다운로드 (API 키는 제외)"
              >
                💾 내보내기
              </button>
              <label className="cursor-pointer text-[10px] text-zinc-500 underline hover:text-zinc-300">
                📂 가져오기
                <input
                  type="file"
                  aria-label="설정 JSON 파일 업로드"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const text = await f.text();
                      const merged = importConfig(text, configs);
                      setConfigs(merged.configs);
                      if (merged.referenceDoc !== undefined) {
                        props.setReferenceDoc(merged.referenceDoc);
                      }
                    } catch (err) {
                      alert(
                        `설정 파일을 읽지 못했습니다: ${(err as Error).message}`,
                      );
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </>
          )}
          <span
            tabIndex={-1}
            aria-label={`현재 상태: ${view.status}`}
            className="cursor-default select-none rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
          >
            {view.status}
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setShowAgentsModal(true)}
          className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700 hover:bg-zinc-800"
        >
          <span className="font-medium">🤖 AI 에이전트 설정</span>
          <span className="text-xs text-zinc-500">
            {enabledCount}/3 활성 · 클릭해서 수정
          </span>
        </button>
        <AgentsSummaryRow
          configs={configs}
          authStates={authStates}
          cliStatus={cliStatus}
        />
      </section>

      {showAgentsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAgentsModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agents-modal-title"
            className="flex max-h-[85vh] w-[460px] flex-col overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="agents-modal-title"
                className="text-base font-semibold tracking-tight"
              >
                🤖 AI 에이전트 설정
              </h2>
              <button
                type="button"
                onClick={() => setShowAgentsModal(false)}
                className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-[11px] text-zinc-500">
              한 번 인증/설정하면 토론 중에도 닫아둘 수 있어요. 진행 중에는 역할
              메모만 핫스왑 가능.
            </p>
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
                      onChange={(e) =>
                        patch(c.id, { enabled: e.target.checked })
                      }
                    />
                    <span className={`font-medium ${AGENT_ACCENT[c.id]}`}>
                      {AGENT_LABELS[c.id]}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {AGENT_PERSONA[c.id]}
                    </span>
                    <select
                      value={c.mode}
                      disabled={!isSetup}
                      onChange={(e) =>
                        patch(c.id, {
                          mode: e.target.value as AgentConfig["mode"],
                        })
                      }
                      className="ml-auto rounded bg-zinc-800 px-2 py-0.5 text-xs"
                    >
                      <option value="api">API</option>
                      <option value="cli">CLI</option>
                    </select>
                  </label>
                  {c.mode === "api" && (
                    <>
                      <input
                        type="password"
                        placeholder="API 키"
                        disabled={!isSetup}
                        value={c.apiKey}
                        onChange={(e) =>
                          patch(c.id, { apiKey: e.target.value })
                        }
                        className="rounded bg-zinc-800 px-2 py-1 text-xs"
                      />
                      <ApiKeyVerify
                        state={authStates[c.id]}
                        hasKey={c.apiKey.trim().length > 0}
                        disabled={!isSetup}
                        onCheck={() => checkApiKey(c.id, c.apiKey)}
                      />
                    </>
                  )}
                  {c.mode === "cli" && (
                    <CliStatusBlock
                      check={cliStatus?.[c.id]}
                      loading={cliLoading}
                    />
                  )}
                  <details className="text-[11px] text-zinc-400">
                    <summary className="cursor-pointer select-none">
                      역할 메모 (시스템 프롬프트)
                    </summary>
                    <textarea
                      aria-label={`${AGENT_LABELS[c.id]} 역할 메모 (시스템 프롬프트)`}
                      value={c.systemPrompt}
                      onChange={(e) => {
                        patch(c.id, { systemPrompt: e.target.value });
                        if (isRunning)
                          props.onSetSystemPrompt(c.id, e.target.value);
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
                      ↺ 기본값으로 되돌리기
                    </button>
                  </details>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}

      {isSetup && (
        <ReferenceDocSection
          referenceDoc={props.referenceDoc}
          setReferenceDoc={props.setReferenceDoc}
        />
      )}

      {!isSetup && props.referenceDoc.trim().length > 0 && (
        <p className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-500 ring-1 ring-zinc-800">
          📎 참고 문서 {props.referenceDoc.trim().length.toLocaleString()}자
          적용 중
        </p>
      )}

      {isSetup && (
        <SummarizerSection
          configs={configs}
          authStates={authStates}
          cliStatus={cliStatus}
          summarizerId={props.summarizerId}
          setSummarizerId={props.setSummarizerId}
        />
      )}

      {!isSetup && props.summarizerId && (
        <p className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-500 ring-1 ring-zinc-800">
          📝 요약 담당:{" "}
          <span className="text-zinc-300">
            {AGENT_LABELS[props.summarizerId]}
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
              AI를 2개 이상 활성화해주세요.
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
    </aside>
  );
}

const END_REASON_LABEL: Record<string, string> = {
  user_stop: "사용자 STOP",
  max_turns: "최대 턴 도달",
  budget_exceeded: "토큰 예산 도달",
  time_exceeded: "시간 캡 도달",
};

function SummarizerSection({
  configs,
  authStates,
  cliStatus,
  summarizerId,
  setSummarizerId,
}: {
  configs: AgentConfig[];
  authStates: Partial<Record<AgentId, AuthState>>;
  cliStatus: CliStatus;
  summarizerId: AgentId | null;
  setSummarizerId: (next: AgentId | null) => void;
}) {
  // API 모드: 키 입력된 후보. CLI 모드: cli-status가 found=true인 후보.
  const candidates = configs.filter((c) => {
    if (!c.enabled) return false;
    if (c.mode === "api") return c.apiKey.trim().length > 0;
    return cliStatus?.[c.id]?.found === true;
  });
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          📝 결과 정리 담당
        </h2>
        {summarizerId && (
          <button
            type="button"
            onClick={() => setSummarizerId(null)}
            className="text-[10px] text-zinc-500 underline hover:text-zinc-300"
          >
            끄기
          </button>
        )}
      </div>
      {candidates.length === 0 ? (
        <p className="rounded bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-500 ring-1 ring-zinc-800">
          API 키 입력 또는 CLI 설치된 활성 에이전트가 1개 이상 필요합니다.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => {
            const selected = summarizerId === c.id;
            const ok =
              c.mode === "api"
                ? authStates[c.id]?.phase === "valid"
                : cliStatus?.[c.id]?.found === true;
            const modeIcon = c.mode === "api" ? "🔑" : "🖥";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSummarizerId(selected ? null : c.id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1 ${
                  selected
                    ? "bg-blue-700/40 text-blue-100 ring-blue-500"
                    : "bg-zinc-900 text-zinc-300 ring-zinc-800 hover:ring-zinc-600"
                }`}
              >
                <span>{selected ? "🟦" : "⬜"}</span>
                <span>{modeIcon}</span>
                <span>{AGENT_LABELS[c.id]}</span>
                {ok && <span className="text-emerald-300">🟢</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-zinc-600 leading-snug">
        토론 종료 시 결론·핵심 논점·미해결·액션 아이템 4섹션 산출물을
        생성합니다. API 모드는 SDK 단발 호출, CLI 모드는 1st-party CLI를 한 번
        spawn해서 사용합니다 (CLI는 cold-start 25~40s).
      </p>
    </section>
  );
}

function SessionSummaryCard({ view }: { view: SessionView }) {
  const agentMsgs = view.messages.filter((m) => m.role !== "user");
  const userMsgs = view.messages.filter((m) => m.role === "user");
  const byAgent: Record<string, number> = {};
  for (const m of agentMsgs) {
    byAgent[m.role] = (byAgent[m.role] ?? 0) + 1;
  }
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
              {AGENT_LABELS[top[0] as AgentId] ?? top[0]}
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

const AGENT_LABEL_SHORT: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

function AgentsSummaryRow({
  configs,
  authStates,
  cliStatus,
}: {
  configs: AgentConfig[];
  authStates: Partial<Record<AgentId, AuthState>>;
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
              ⚪ {AGENT_LABEL_SHORT[c.id]} (비활성)
            </span>
          );
        }
        const modeIcon = c.mode === "api" ? "🔑" : "🖥";
        let dot = "⚪";
        if (c.mode === "api") {
          const phase = authStates[c.id]?.phase;
          dot = phase === "valid" ? "🟢" : phase === "invalid" ? "🔴" : "⚪";
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

function ApiKeyVerify({
  state,
  hasKey,
  disabled,
  onCheck,
}: {
  state: AuthState | undefined;
  hasKey: boolean;
  disabled: boolean;
  onCheck: () => void;
}) {
  const phase = state?.phase ?? "idle";
  if (phase === "idle") {
    const blocked = !hasKey || disabled;
    return (
      <button
        type="button"
        onClick={onCheck}
        disabled={blocked}
        title={
          !hasKey
            ? "API 키를 먼저 입력하세요"
            : disabled
              ? "세션 진행 중에는 변경할 수 없습니다"
              : "키 검증"
        }
        aria-label={!hasKey ? "API 키 입력 후 검증 가능" : "API 키 검증"}
        className="self-start rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        🔍 키 검증
      </button>
    );
  }
  if (phase === "checking") {
    return (
      <span className="self-start text-[11px] text-amber-300">⏳ 검증 중…</span>
    );
  }
  if (phase === "valid") {
    return (
      <details className="rounded bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-200 ring-1 ring-emerald-900/60">
        <summary className="cursor-pointer select-none font-medium">
          🟢 인증 성공
        </summary>
        {state?.detail && (
          <p className="mt-1 font-mono text-[10px] leading-snug text-emerald-300/80">
            {state.detail}
          </p>
        )}
        <button
          type="button"
          onClick={onCheck}
          className="mt-1 text-[10px] text-emerald-300/80 underline hover:text-emerald-200"
        >
          다시 검증
        </button>
      </details>
    );
  }
  // invalid
  const fe = friendlyError(state?.error ?? "");
  return (
    <details className="rounded bg-red-950/40 px-2 py-1 text-[11px] text-red-200 ring-1 ring-red-900/60">
      <summary className="cursor-pointer select-none font-medium">
        🔴 {fe.title}
      </summary>
      {fe.hint && (
        <p className="mt-1 leading-snug text-red-300/90">{fe.hint}</p>
      )}
      <p className="mt-1 font-mono text-[10px] leading-snug text-red-400/70">
        {fe.raw}
      </p>
      <button
        type="button"
        onClick={onCheck}
        className="mt-1 text-[10px] text-red-300/80 underline hover:text-red-200"
      >
        다시 시도
      </button>
    </details>
  );
}

function ReferenceDocSection({
  referenceDoc,
  setReferenceDoc,
}: {
  referenceDoc: string;
  setReferenceDoc: (next: string) => void;
}) {
  const charCount = referenceDoc.length;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          참고 문서 (선택)
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {charCount > 0 && <span>{charCount.toLocaleString()}자</span>}
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => setReferenceDoc("")}
              className="text-zinc-500 underline hover:text-zinc-300"
            >
              비우기
            </button>
          )}
        </div>
      </div>
      <textarea
        aria-label="참고 문서 (모든 에이전트의 시스템 프롬프트 앞에 prepend)"
        value={referenceDoc}
        onChange={(e) => setReferenceDoc(e.target.value)}
        placeholder={
          "토론 시작 전 모든 AI에게 함께 보여줄 문서. 직접 타이핑·붙여넣기 가능.\n\n예: 게임 기획서·요구사항·기존 시스템 설명 등."
        }
        className="h-28 resize-y rounded border border-zinc-800 bg-zinc-900 p-2 text-xs leading-snug"
      />
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700">
        📎 .md / .txt 파일 첨부
        <input
          type="file"
          aria-label="참고 문서 .md 또는 .txt 파일 첨부"
          accept=".md,.markdown,.txt"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await f.text();
              setReferenceDoc(text);
            } catch {
              // 읽기 실패는 무시 — 사용자가 알 수 있도록 placeholder 그대로.
            } finally {
              e.target.value = "";
            }
          }}
        />
      </label>
      <p className="text-[10px] text-zinc-600 leading-relaxed">
        세션 시작 시 모든 에이전트의 시스템 프롬프트 앞에 prepend 됩니다. 진행
        중에는 변경 불가 — 새 세션부터 적용.
      </p>
    </section>
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
        <div className="font-medium">🟢 {check.id} CLI 사용 가능</div>
        <div className="font-mono text-[10px] text-emerald-300/80">
          {check.path ? `${check.path} · ` : ""}
          {check.version}
        </div>
        <div className="text-[10px] text-emerald-300/70">
          검증 근거: <span className="font-mono">which {check.id}</span> +{" "}
          <span className="font-mono">{check.id} --version</span> 응답 확인
        </div>
        <div className="text-[10px] text-emerald-300/60">
          본인 구독·OAuth 인증을 그대로 활용. 라운드 시작 시 인증이 실패하면
          빨간 에러로 표시됩니다.
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded bg-red-950/40 p-2 text-[11px] text-red-200 ring-1 ring-red-900/60">
      <div className="font-medium">🔴 {check.id} CLI 미설치 또는 PATH 누락</div>
      <details className="text-red-300/80">
        <summary className="cursor-pointer select-none">
          💡 설치·로그인 방법
        </summary>
        <div className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-red-300/90">
          {check.hint}
        </div>
      </details>
      <div className="text-[10px] text-red-300/60">
        설치 후 위의 ↻ 새로고침. 또는 API 모드로 전환하세요.
      </div>
    </div>
  );
}
