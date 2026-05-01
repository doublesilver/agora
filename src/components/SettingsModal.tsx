/* SettingsModal — 좌측 카테고리 nav + 우측 content panel.
 * 기존 LeftPanel 안에 흩어져있던 AI 에이전트 모달·결과 정리 담당·참고 문서·
 * 설정 import/export를 한 곳에 모으고 외관·한도·정보 카테고리를 추가했다. */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentConfig, SessionView } from "@/lib/client/types";
import { ROLE_SEEDS } from "@/lib/agents/role-seeds";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "@/lib/client/friendly-error";
import { exportConfig, importConfig } from "@/lib/client/config-io";
import {
  AGENT_FIRST_TOKEN_TIMEOUT_MS,
  MAX_AGENT_ERROR_STREAK,
  MAX_CONSECUTIVE_PASS,
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_TOKENS,
  MAX_TURNS,
} from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// shared types & helpers (LeftPanel에서 가져온 라벨·아이콘·검증 인디케이터)

type AuthPhase = "idle" | "checking" | "valid" | "invalid";
interface AuthState {
  phase: AuthPhase;
  detail?: string;
  error?: string;
}

interface CliCheck {
  id: AgentId;
  found: boolean;
  version?: string;
  path?: string;
  hint: string;
  overridden?: boolean;
}
type CliStatus = Record<AgentId, CliCheck> | null;

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

// ─────────────────────────────────────────────────────────────────────────────
// 외관 설정 — localStorage 영속

export type FontSize = "S" | "M" | "L";
export type Density = "compact" | "cozy";

const FONT_SIZE_PX: Record<FontSize, string> = {
  S: "13px",
  M: "14px",
  L: "15px",
};

interface Appearance {
  fontSize: FontSize;
  density: Density;
  showInput: boolean;
}

const APPEARANCE_DEFAULT: Appearance = {
  fontSize: "M",
  density: "cozy",
  showInput: true,
};

const APPEARANCE_KEY = "agora.appearance.v1";

function readAppearance(): Appearance {
  if (typeof window === "undefined") return APPEARANCE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return APPEARANCE_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      fontSize:
        parsed.fontSize === "S" || parsed.fontSize === "L"
          ? parsed.fontSize
          : "M",
      density: parsed.density === "compact" ? "compact" : "cozy",
      showInput: parsed.showInput !== false,
    };
  } catch {
    return APPEARANCE_DEFAULT;
  }
}

function writeAppearance(value: Appearance): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value));
  } catch {
    /* quota·private mode 등 — 무시 */
  }
}

function applyAppearance(value: Appearance): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--agora-font-size",
    FONT_SIZE_PX[value.fontSize],
  );
  document.documentElement.dataset.density = value.density;
}

export function useAppearance(): [Appearance, (next: Appearance) => void] {
  const [value, setValue] = useState<Appearance>(APPEARANCE_DEFAULT);
  useEffect(() => {
    const v = readAppearance();
    setValue(v);
    applyAppearance(v);
  }, []);
  function update(next: Appearance) {
    setValue(next);
    writeAppearance(next);
    applyAppearance(next);
  }
  return [value, update];
}

// ─────────────────────────────────────────────────────────────────────────────
// 세션 한도 — localStorage 영속

export interface UserLimits {
  maxTurns: number;
  maxSessionTokens: number;
  maxSessionDurationMs: number;
}

const LIMITS_DEFAULT: UserLimits = {
  maxTurns: MAX_TURNS,
  maxSessionTokens: MAX_SESSION_TOKENS,
  maxSessionDurationMs: MAX_SESSION_DURATION_MS,
};

const LIMITS_KEY = "agora.limits.v1";

const LIMITS_RANGE = {
  maxTurns: { min: 1, max: 200 },
  maxSessionTokens: { min: 1_000, max: 1_000_000 },
  maxSessionDurationMs: { min: 30_000, max: 60 * 60_000 },
};

function clampUserLimits(input: Partial<UserLimits>): UserLimits {
  const t = Number(input.maxTurns);
  const k = Number(input.maxSessionTokens);
  const ms = Number(input.maxSessionDurationMs);
  return {
    maxTurns:
      Number.isFinite(t) &&
      t >= LIMITS_RANGE.maxTurns.min &&
      t <= LIMITS_RANGE.maxTurns.max
        ? Math.floor(t)
        : LIMITS_DEFAULT.maxTurns,
    maxSessionTokens:
      Number.isFinite(k) &&
      k >= LIMITS_RANGE.maxSessionTokens.min &&
      k <= LIMITS_RANGE.maxSessionTokens.max
        ? Math.floor(k)
        : LIMITS_DEFAULT.maxSessionTokens,
    maxSessionDurationMs:
      Number.isFinite(ms) &&
      ms >= LIMITS_RANGE.maxSessionDurationMs.min &&
      ms <= LIMITS_RANGE.maxSessionDurationMs.max
        ? Math.floor(ms)
        : LIMITS_DEFAULT.maxSessionDurationMs,
  };
}

function readLimits(): UserLimits {
  if (typeof window === "undefined") return LIMITS_DEFAULT;
  try {
    const raw = window.localStorage.getItem(LIMITS_KEY);
    if (!raw) return LIMITS_DEFAULT;
    return clampUserLimits(JSON.parse(raw) as Partial<UserLimits>);
  } catch {
    return LIMITS_DEFAULT;
  }
}

function writeLimits(value: UserLimits): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIMITS_KEY, JSON.stringify(value));
  } catch {
    /* 무시 */
  }
}

export function useLimits(): [UserLimits, (next: UserLimits) => void] {
  const [value, setValue] = useState<UserLimits>(LIMITS_DEFAULT);
  useEffect(() => {
    setValue(readLimits());
  }, []);
  function update(next: UserLimits) {
    const clamped = clampUserLimits(next);
    setValue(clamped);
    writeLimits(clamped);
  }
  return [value, update];
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsModal 본체

type CategoryId =
  | "agents"
  | "reference"
  | "appearance"
  | "backup"
  | "limits"
  | "about";

const CATEGORIES: { id: CategoryId; label: string; hint: string }[] = [
  { id: "agents", label: "AI 에이전트", hint: "활성·인증·역할·결과 정리" },
  { id: "reference", label: "참고 문서", hint: "공통 시스템 프롬프트" },
  { id: "appearance", label: "외관", hint: "폰트·밀도·발화창" },
  { id: "backup", label: "설정 백업", hint: "내보내기·가져오기" },
  { id: "limits", label: "토론 한도", hint: "턴·토큰·시간" },
  { id: "about", label: "정보", hint: "버전·포지셔닝" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  view: SessionView;
  configs: AgentConfig[];
  setConfigs: (next: AgentConfig[]) => void;
  referenceDoc: string;
  setReferenceDoc: (next: string) => void;
  summarizerId: AgentId | null;
  setSummarizerId: (next: AgentId | null) => void;
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  limits: UserLimits;
  setLimits: (next: UserLimits) => void;
  onSetSystemPrompt: (id: AgentId, prompt: string) => void;
}

export function SettingsModal({
  open,
  onClose,
  view,
  configs,
  setConfigs,
  referenceDoc,
  setReferenceDoc,
  summarizerId,
  setSummarizerId,
  appearance,
  setAppearance,
  limits,
  setLimits,
  onSetSystemPrompt,
}: Props) {
  const [active, setActive] = useState<CategoryId>("agents");
  const [authStates, setAuthStates] = useState<
    Partial<Record<AgentId, AuthState>>
  >({});
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);
  const [cliLoading, setCliLoading] = useState(false);

  const isSetup = view.status === "setup";
  const isRunning =
    view.status === "running" ||
    view.status === "idle" ||
    view.status === "paused";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    if (open) refreshCliStatus();
  }, [open]);

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

  function patch(id: AgentId, partial: Partial<AgentConfig>) {
    if ("apiKey" in partial) {
      setAuthStates((prev) => ({ ...prev, [id]: { phase: "idle" } }));
    }
    setConfigs(configs.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border border-ink bg-paper shadow-2xl"
      >
        <nav
          aria-label="설정 카테고리"
          className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-ink bg-paper p-3 text-sm"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h2
              id="settings-modal-title"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0"
            >
              Settings
            </h2>
          </div>
          {CATEGORIES.map((c) => {
            const selected = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                aria-current={selected ? "page" : undefined}
                className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
                  selected
                    ? "bg-paper-deep text-ink"
                    : "text-ink2 hover:bg-paper2 hover:text-ink"
                }`}
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-[10px] text-ink3">{c.hint}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-ink px-5 py-3">
            <div className="flex items-baseline gap-3">
              <span className="text-base font-semibold tracking-tight text-ink">
                {CATEGORIES.find((c) => c.id === active)?.label}
              </span>
              <span className="text-[11px] text-ink0">
                {CATEGORIES.find((c) => c.id === active)?.hint}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded px-2 py-0.5 text-ink2 transition-colors hover:bg-paper-deep hover:text-ink"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {active === "agents" && (
              <AgentsPane
                configs={configs}
                authStates={authStates}
                cliStatus={cliStatus}
                cliLoading={cliLoading}
                isSetup={isSetup}
                isRunning={isRunning}
                summarizerId={summarizerId}
                setSummarizerId={setSummarizerId}
                onPatch={patch}
                onCheckApiKey={checkApiKey}
                onRefreshCli={refreshCliStatus}
                onSetSystemPrompt={onSetSystemPrompt}
              />
            )}
            {active === "reference" && (
              <ReferencePane
                referenceDoc={referenceDoc}
                setReferenceDoc={setReferenceDoc}
                isSetup={isSetup}
              />
            )}
            {active === "appearance" && (
              <AppearancePane value={appearance} onChange={setAppearance} />
            )}
            {active === "backup" && (
              <BackupPane
                configs={configs}
                setConfigs={setConfigs}
                referenceDoc={referenceDoc}
                setReferenceDoc={setReferenceDoc}
              />
            )}
            {active === "limits" && (
              <LimitsPane value={limits} onChange={setLimits} />
            )}
            {active === "about" && <AboutPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentsPane

function AgentsPane({
  configs,
  authStates,
  cliStatus,
  cliLoading,
  isSetup,
  isRunning,
  summarizerId,
  setSummarizerId,
  onPatch,
  onCheckApiKey,
  onRefreshCli,
  onSetSystemPrompt,
}: {
  configs: AgentConfig[];
  authStates: Partial<Record<AgentId, AuthState>>;
  cliStatus: CliStatus;
  cliLoading: boolean;
  isSetup: boolean;
  isRunning: boolean;
  summarizerId: AgentId | null;
  setSummarizerId: (next: AgentId | null) => void;
  onPatch: (id: AgentId, partial: Partial<AgentConfig>) => void;
  onCheckApiKey: (id: AgentId, apiKey: string) => void;
  onRefreshCli: () => void;
  onSetSystemPrompt: (id: AgentId, prompt: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink0">
          진행 중에는 역할 메모만 핫스왑 가능.
        </p>
        <button
          type="button"
          onClick={onRefreshCli}
          disabled={cliLoading}
          className="text-[11px] text-ink2 underline disabled:opacity-50 hover:text-ink"
        >
          {cliLoading ? "확인 중…" : "↻ CLI 새로고침"}
        </button>
      </div>
      {configs.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-1.5 rounded-md border border-ink bg-paper2 px-3 py-2"
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={c.enabled}
              disabled={!isSetup}
              onChange={(e) => onPatch(c.id, { enabled: e.target.checked })}
            />
            <span className={`font-medium ${AGENT_ACCENT[c.id]}`}>
              {AGENT_LABELS[c.id]}
            </span>
            <span className="text-[10px] text-ink0">
              {AGENT_PERSONA[c.id]}
            </span>
            <select
              value={c.mode}
              disabled={!isSetup}
              onChange={(e) =>
                onPatch(c.id, { mode: e.target.value as AgentConfig["mode"] })
              }
              className="ml-auto rounded bg-paper-deep px-2 py-0.5 text-xs"
              aria-label={`${AGENT_LABELS[c.id]} 모드`}
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
                aria-label={`${AGENT_LABELS[c.id]} API 키`}
                disabled={!isSetup}
                value={c.apiKey}
                onChange={(e) => onPatch(c.id, { apiKey: e.target.value })}
                className="rounded bg-paper-deep px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              />
              <ApiKeyVerify
                state={authStates[c.id]}
                hasKey={c.apiKey.trim().length > 0}
                disabled={!isSetup}
                onCheck={() => onCheckApiKey(c.id, c.apiKey)}
              />
            </>
          )}
          {c.mode === "cli" && (
            <CliStatusBlock check={cliStatus?.[c.id]} loading={cliLoading} />
          )}
          <details className="text-[11px] text-ink2">
            <summary className="cursor-pointer select-none">
              역할 메모 (시스템 프롬프트)
            </summary>
            <textarea
              aria-label={`${AGENT_LABELS[c.id]} 역할 메모 (시스템 프롬프트)`}
              value={c.systemPrompt}
              onChange={(e) => {
                onPatch(c.id, { systemPrompt: e.target.value });
                if (isRunning) onSetSystemPrompt(c.id, e.target.value);
              }}
              className="mt-1 h-24 w-full resize-none rounded bg-paper-deep p-2 text-xs text-ink"
            />
            <button
              type="button"
              onClick={() => {
                onPatch(c.id, { systemPrompt: ROLE_SEEDS[c.id] });
                if (isRunning) onSetSystemPrompt(c.id, ROLE_SEEDS[c.id]);
              }}
              className="mt-1 text-[11px] text-ink2 underline hover:text-ink"
            >
              ↺ 기본값으로 되돌리기
            </button>
          </details>
        </div>
      ))}

      <div className="mt-1 flex flex-col gap-2 rounded-md border border-ink bg-paper2/40 px-3 py-2.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0">
          📝 결과 정리 담당
        </h3>
        <SummarizerPane
          configs={configs}
          authStates={authStates}
          cliStatus={cliStatus}
          summarizerId={summarizerId}
          setSummarizerId={setSummarizerId}
        />
      </div>
    </section>
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
        className="self-start rounded bg-paper-deep px-2 py-0.5 text-[11px] text-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
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

function CliStatusBlock({
  check,
  loading,
}: {
  check?: CliCheck;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-[11px] text-ink0">CLI 상태 확인 중…</p>;
  }
  if (!check) {
    return (
      <p className="text-[11px] text-ink0">
        CLI 상태를 알 수 없음. 위의 ↻ 버튼으로 새로고침.
      </p>
    );
  }
  if (check.found) {
    return (
      <div className="flex flex-col gap-1 rounded bg-emerald-950/40 p-2 text-[11px] text-emerald-200 ring-1 ring-emerald-900/60">
        <div className="font-medium">
          🟢 {check.id} CLI 사용 가능
          {check.overridden && (
            <span className="ml-2 rounded bg-emerald-900/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
              env override
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-emerald-300/80">
          {check.path ? `${check.path} · ` : ""}
          {check.version}
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

// ─────────────────────────────────────────────────────────────────────────────
// SummarizerPane

function SummarizerPane({
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
  const candidates = configs.filter((c) => {
    if (!c.enabled) return false;
    if (c.mode === "api") return c.apiKey.trim().length > 0;
    return cliStatus?.[c.id]?.found === true;
  });

  return (
    <section className="flex flex-col gap-2">
      <p className="text-[11px] text-ink0">
        종료 시 결론·논점·미해결·액션 4섹션 산출물. 미선택 시 첫 활성 어댑터로
        자동.
      </p>
      {candidates.length === 0 ? (
        <p className="rounded border border-ink bg-paper2 px-3 py-2 text-[11px] text-ink0">
          API 키 인증 또는 CLI 설치된 활성 에이전트 필요.
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
                    : "bg-paper2 text-ink ring-ink hover:ring-ink"
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
      <p className="text-[10px] text-ink3">
        API 45s · CLI 90s 단발 호출 · 자세한 정책은 AGENTS.md §A9.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReferencePane

function ReferencePane({
  referenceDoc,
  setReferenceDoc,
  isSetup,
}: {
  referenceDoc: string;
  setReferenceDoc: (next: string) => void;
  isSetup: boolean;
}) {
  const charCount = referenceDoc.length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink2">
          모든 에이전트의 시스템 프롬프트 앞에 prepend됩니다. 진행 중에는 변경
          불가 — 새 세션부터 적용.
        </p>
        <div className="flex items-center gap-2 text-[10px] text-ink0">
          {charCount > 0 && <span>{charCount.toLocaleString()}자</span>}
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => setReferenceDoc("")}
              disabled={!isSetup}
              className="text-ink0 underline hover:text-ink disabled:opacity-50"
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
        disabled={!isSetup}
        placeholder={
          "토론 시작 전 모든 AI에게 함께 보여줄 문서. 직접 타이핑·붙여넣기 가능.\n\n예: 게임 기획서·요구사항·기존 시스템 설명 등."
        }
        className="h-48 resize-y rounded border border-ink bg-paper2 p-2 text-xs leading-snug disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded bg-paper-deep px-2 py-1 text-[11px] text-ink hover:bg-ink hover:text-paper">
        📎 .md / .txt 파일 첨부
        <input
          type="file"
          aria-label="참고 문서 .md 또는 .txt 파일 첨부"
          accept=".md,.markdown,.txt"
          className="hidden"
          disabled={!isSetup}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await f.text();
              setReferenceDoc(text);
            } catch {
              /* 무시 */
            } finally {
              e.target.value = "";
            }
          }}
        />
      </label>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppearancePane

function AppearancePane({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (next: Appearance) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0">
          폰트 크기
        </h3>
        <div className="flex gap-1.5">
          {(["S", "M", "L"] as FontSize[]).map((sz) => {
            const selected = value.fontSize === sz;
            return (
              <button
                key={sz}
                type="button"
                onClick={() => onChange({ ...value, fontSize: sz })}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-0.5 rounded-md px-3 py-2 ring-1 transition-colors ${
                  selected
                    ? "bg-paper-deep text-ink ring-ink"
                    : "bg-paper2 text-ink2 ring-ink hover:bg-paper2/80"
                }`}
              >
                <span className="font-medium">{sz}</span>
                <span className="text-[10px] text-ink0">
                  {FONT_SIZE_PX[sz]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink3">
          한글 본문 가독성에 영향. localStorage에 영속.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0">
          메시지 밀도
        </h3>
        <div className="flex gap-1.5">
          {(
            [
              { id: "compact", label: "Compact", hint: "간격 좁게" },
              { id: "cozy", label: "Cozy", hint: "기본" },
            ] as { id: Density; label: string; hint: string }[]
          ).map((d) => {
            const selected = value.density === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onChange({ ...value, density: d.id })}
                aria-pressed={selected}
                className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 ring-1 transition-colors ${
                  selected
                    ? "bg-paper-deep text-ink ring-ink"
                    : "bg-paper2 text-ink2 ring-ink hover:bg-paper2/80"
                }`}
              >
                <span className="font-medium">{d.label}</span>
                <span className="text-[10px] text-ink0">{d.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink3">
          채팅 메시지 사이 여백. compact가 더 많은 라운드를 한 화면에
          보여줍니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0">
          하단 발화 입력창
        </h3>
        <div className="flex gap-1.5">
          {(
            [
              { id: true, label: "활성", hint: "기본 — 항상 표시" },
              { id: false, label: "비활성", hint: "숨김 — 인터럽트 불가" },
            ] as { id: boolean; label: string; hint: string }[]
          ).map((d) => {
            const selected = value.showInput === d.id;
            return (
              <button
                key={String(d.id)}
                type="button"
                onClick={() => onChange({ ...value, showInput: d.id })}
                aria-pressed={selected}
                className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 ring-1 transition-colors ${
                  selected
                    ? "bg-paper-deep text-ink ring-ink"
                    : "bg-paper2 text-ink2 ring-ink hover:bg-paper2/80"
                }`}
              >
                <span className="font-medium">{d.label}</span>
                <span className="text-[10px] text-ink0">{d.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink3">
          비활성 시 채팅 화면이 더 넓어집니다. 인터럽트가 필요하면 다시
          활성화하거나 좌측 컨트롤로 종료/일시정지.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackupPane

function BackupPane({
  configs,
  setConfigs,
  referenceDoc,
  setReferenceDoc,
}: {
  configs: AgentConfig[];
  setConfigs: (next: AgentConfig[]) => void;
  referenceDoc: string;
  setReferenceDoc: (next: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-ink2">
        현재 설정(에이전트 활성·모드·역할 메모·참고 문서)을 JSON으로 저장하거나
        다른 환경에서 복원합니다.{" "}
        <strong className="text-ink">
          API 키는 보안을 위해 export에 포함되지 않습니다.
        </strong>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            exportConfig(configs, referenceDoc);
            setStatus("내보내기 완료 — 다운로드를 확인하세요.");
          }}
          className="rounded bg-paper-deep px-3 py-1.5 text-xs text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          💾 JSON 내보내기
        </button>
        <label className="cursor-pointer rounded bg-paper-deep px-3 py-1.5 text-xs text-ink transition-colors hover:bg-ink hover:text-paper">
          📂 JSON 가져오기
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
                  setReferenceDoc(merged.referenceDoc);
                }
                setStatus("가져오기 완료. API 키는 별도로 다시 입력하세요.");
              } catch (err) {
                setStatus(
                  `가져오기 실패: ${(err as Error).message ?? String(err)}`,
                );
              } finally {
                e.target.value = "";
              }
            }}
          />
        </label>
      </div>
      {status && (
        <p
          className="rounded border border-ink bg-paper2 px-3 py-2 text-[11px] text-ink"
          role="status"
        >
          {status}
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LimitsPane (read-only)

function LimitsPane({
  value,
  onChange,
}: {
  value: UserLimits;
  onChange: (next: UserLimits) => void;
}) {
  const tokensPreset = [10_000, 50_000, 100_000, 200_000, 500_000];
  const minutesPreset = [1, 3, 5, 10, 15, 30];
  const turnsPreset = [10, 20, 30, 50, 100];
  const minutes = Math.round(value.maxSessionDurationMs / 60_000);

  return (
    <section className="flex flex-col gap-5">
      <p className="text-[12px] leading-relaxed text-ink2">
        다음 세션부터 적용됩니다. 진행 중 세션에는 영향 없음. localStorage에
        영속.
      </p>

      <LimitsField label="최대 턴 수" hint="이 라운드 수에 도달하면 자동 종료">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={LIMITS_RANGE.maxTurns.min}
            max={LIMITS_RANGE.maxTurns.max}
            step={1}
            value={value.maxTurns}
            onChange={(e) =>
              onChange({ ...value, maxTurns: Number(e.target.value) || 0 })
            }
            className="w-24 rounded border border-ink bg-paper2 px-2 py-1 text-sm tabular-nums"
            aria-label="최대 턴 수"
          />
          <span className="text-[11px] text-ink0">라운드</span>
          <PresetChips
            options={turnsPreset}
            current={value.maxTurns}
            format={(n) => `${n}`}
            onPick={(n) => onChange({ ...value, maxTurns: n })}
          />
        </div>
      </LimitsField>

      <LimitsField
        label="토큰 예산"
        hint="세션 누적 input+output. 도달 시 자동 종료(budget_exceeded). 결과 정리 담당이 지정돼 있으면 산출물은 별개로 호출됨."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={LIMITS_RANGE.maxSessionTokens.min}
            max={LIMITS_RANGE.maxSessionTokens.max}
            step={1000}
            value={value.maxSessionTokens}
            onChange={(e) =>
              onChange({
                ...value,
                maxSessionTokens: Number(e.target.value) || 0,
              })
            }
            className="w-32 rounded border border-ink bg-paper2 px-2 py-1 text-sm tabular-nums"
            aria-label="토큰 예산"
          />
          <span className="text-[11px] text-ink0">
            ≈ {Math.round(value.maxSessionTokens / 1000)}k tokens
          </span>
        </div>
        <PresetChips
          options={tokensPreset}
          current={value.maxSessionTokens}
          format={(n) => `${Math.round(n / 1000)}k`}
          onPick={(n) => onChange({ ...value, maxSessionTokens: n })}
        />
      </LimitsField>

      <LimitsField
        label="세션 시간 캡"
        hint="라운드 시작·토큰 emit 마다 재검사 — 디바운스 없음(AGENTS.md A8)"
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={60}
            step={1}
            value={minutes}
            onChange={(e) =>
              onChange({
                ...value,
                maxSessionDurationMs:
                  Math.max(1, Number(e.target.value) || 1) * 60_000,
              })
            }
            className="w-20 rounded border border-ink bg-paper2 px-2 py-1 text-sm tabular-nums"
            aria-label="세션 시간 캡 (분)"
          />
          <span className="text-[11px] text-ink0">분</span>
          <PresetChips
            options={minutesPreset}
            current={minutes}
            format={(n) => `${n}m`}
            onPick={(n) =>
              onChange({ ...value, maxSessionDurationMs: n * 60_000 })
            }
          />
        </div>
      </LimitsField>

      <button
        type="button"
        onClick={() =>
          onChange({
            maxTurns: MAX_TURNS,
            maxSessionTokens: MAX_SESSION_TOKENS,
            maxSessionDurationMs: MAX_SESSION_DURATION_MS,
          })
        }
        className="self-start rounded bg-paper-deep px-3 py-1.5 text-[11px] text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        ↺ 기본값으로 되돌리기
      </button>

      <details className="text-[11px] text-ink0">
        <summary className="cursor-pointer select-none text-ink2 hover:text-ink">
          ⚙ 변경 불가 시스템 한도 (코드 상수)
        </summary>
        <table className="mt-2 w-full border-collapse text-[11px]">
          <tbody>
            <tr className="border-b border-ink/80">
              <th className="py-1.5 text-left font-normal text-ink0">
                첫 토큰 timeout
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums text-ink">
                {AGENT_FIRST_TOKEN_TIMEOUT_MS / 1000} 초
              </td>
            </tr>
            <tr className="border-b border-ink/80">
              <th className="py-1.5 text-left font-normal text-ink0">
                연속 PASS 한도
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums text-ink">
                {MAX_CONSECUTIVE_PASS} 라운드
              </td>
            </tr>
            <tr className="border-b border-ink/80">
              <th className="py-1.5 text-left font-normal text-ink0">
                어댑터 연속 에러 한도
              </th>
              <td className="py-1.5 text-right font-mono tabular-nums text-ink">
                {MAX_AGENT_ERROR_STREAK} 회
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-ink3">
          이 값들은 안정성/UX 보호용이라 사용자 변경에서 제외. 변경하려면{" "}
          <code className="rounded bg-paper2 px-1 font-mono">
            src/lib/constants.ts
          </code>
          .
        </p>
      </details>
    </section>
  );
}

function LimitsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink0">
        {label}
      </h3>
      {children}
      <p className="text-[10px] leading-relaxed text-ink3">{hint}</p>
    </div>
  );
}

function PresetChips<T extends number>({
  options,
  current,
  format,
  onPick,
}: {
  options: T[];
  current: T;
  format: (n: T) => string;
  onPick: (n: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((n) => {
        const active = n === current;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-pressed={active}
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] ring-1 transition-colors ${
              active
                ? "bg-zinc-700 text-ink ring-zinc-500"
                : "bg-paper2 text-ink2 ring-ink hover:text-ink"
            }`}
          >
            {format(n)}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AboutPane

function AboutPane() {
  return (
    <section className="flex flex-col gap-3 text-[12px] leading-relaxed text-ink2">
      <h3 className="font-semibold text-ink">
        Agora · 사용자가 끼어들 수 있는 멀티 AI 토론 도구
      </h3>
      <p>
        베이글코드 신작팀 AI 개발자 채용 과제 제출물. 여러 AI 에이전트(Claude
        ·GPT·Gemini)가 직렬 라운드로 자유 메시지를 주고받으며 사용자의
        프롬프트를 협업 처리하고, 사용자는 토론에 즉시 끼어들거나 다음 라운드에
        보태거나 일시정지·재개·종료할 수 있다.
      </p>
      <p>
        차별화 한 줄:{" "}
        <strong className="text-ink">
          단순 다중 호출이 아니라 사용자가 토론에 끼어들 수 있는 도구
        </strong>
        .
      </p>
      <ul className="ml-4 list-disc space-y-1 text-ink0">
        <li>어댑터: Claude API/CLI · Codex API/CLI · Gemini API/CLI 6종</li>
        <li>개입: 즉시 인터럽트 · 큐 · Pause/Resume · Stop 4종</li>
        <li>
          결과 정리 담당: 종료 시 결론·논점·미해결·액션 4섹션 markdown 산출물
        </li>
        <li>JSONL append-only 로거 + scrub-check 시크릿 검증</li>
      </ul>
      <p className="text-[11px] text-ink3">
        자세한 ADR + 구현은 저장소의 <code>AGENTS.md</code> +{" "}
        <code>README.md</code>
        참조.
      </p>
    </section>
  );
}
