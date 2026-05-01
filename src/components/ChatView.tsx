/* ChatView — 단일 시간순 transcript 스레드. */
"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "@/lib/client/friendly-error";

const COLLAPSE_CHAR_THRESHOLD = 800;

const AGENT_ROTATION_LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

function rotateAgents(agents: AgentId[], shift: number): AgentId[] {
  if (agents.length === 0) return [];
  const k = ((shift % agents.length) + agents.length) % agents.length;
  return [...agents.slice(k), ...agents.slice(0, k)];
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 leading-[1.72]">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-50">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-zinc-200">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded-[5px] bg-zinc-950/70 px-1.5 py-0.5 font-mono text-[0.86em] text-amber-200 ring-1 ring-zinc-800/80">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2.5 overflow-x-auto rounded-md bg-zinc-950/85 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-100 ring-1 ring-zinc-800">
      {children}
    </pre>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-300 underline decoration-blue-500/40 underline-offset-[3px] transition-colors hover:text-blue-200 hover:decoration-blue-300/70"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-zinc-500">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-zinc-500">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-[1.72]">{children}</li>
  ),
  // 페이지 h1은 사이드바 'Agora' 하나만 — 마크다운 본문의 # 제목은 h2로 매핑한다.
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-3 text-lg font-semibold tracking-tight text-zinc-50">
      {children}
    </h2>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-[15px] font-semibold tracking-tight text-zinc-50">
      {children}
    </h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-2.5 text-sm font-semibold text-zinc-100">
      {children}
    </h4>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-zinc-700 pl-3 italic text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-zinc-800/80" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-zinc-800 px-2 py-1">{children}</td>
  ),
};

const AGENT_THEME: Record<
  string,
  { bg: string; ring: string; label: string; emoji: string }
> = {
  user: { bg: "bg-zinc-800", ring: "ring-zinc-700", label: "나", emoji: "👤" },
  claude: {
    bg: "bg-orange-950/60",
    ring: "ring-orange-900",
    label: "Claude",
    emoji: "🟠",
  },
  codex: {
    bg: "bg-emerald-950/60",
    ring: "ring-emerald-900",
    label: "Codex",
    emoji: "🟢",
  },
  gemini: {
    bg: "bg-gradient-to-br from-blue-950/60 to-purple-950/60",
    ring: "ring-blue-900",
    label: "Gemini",
    emoji: "✨",
  },
};

interface Props {
  view: SessionView;
  density?: "compact" | "cozy";
}

export function ChatView({ view, density = "cozy" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [view.messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickRef.current = distance < 80;
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 라운드 구분선 삽입 — 직전 agent 발화의 turn과 달라지면 RoundDivider 끼움.
  const items: React.ReactNode[] = [];
  let lastTurn: number | undefined = undefined;
  for (const m of view.messages) {
    if (m.role !== "user" && m.turn !== undefined && m.turn !== lastTurn) {
      items.push(
        <RoundDivider
          key={`divider-${m.turn}`}
          turn={m.turn}
          agents={view.agents}
        />,
      );
      lastTurn = m.turn;
    }
    items.push(
      <Bubble
        key={m.id}
        message={m}
        expanded={expanded.has(m.id)}
        onToggleExpand={() => toggleExpand(m.id)}
      />,
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`flex h-full flex-col overflow-y-auto bg-zinc-950 px-6 py-6 ${
        density === "compact" ? "gap-2" : "gap-4"
      }`}
    >
      {view.messages.length === 0 && <SetupHints />}
      {items}
      {Object.entries(view.passedRecent).map(([id, turn]) =>
        turn === undefined ? null : (
          <PassChip key={`${id}-${turn}`} agentId={id as AgentId} turn={turn} />
        ),
      )}
      {view.errorRecent && <ErrorBanner errorRecent={view.errorRecent} />}
      <FinalArtifactCard view={view} />
    </div>
  );
}

function RoundDivider({ turn, agents }: { turn: number; agents: AgentId[] }) {
  const order = rotateAgents(agents, turn);
  return (
    <div className="my-2 flex items-center gap-3 px-1 font-mono text-[10px] uppercase tracking-[0.18em]">
      <span className="text-zinc-500">
        Round {String(turn).padStart(2, "0")}
      </span>
      <span className="h-px flex-1 bg-zinc-800" />
      {order.length > 0 && (
        <span className="text-zinc-600">
          {order.map((id, i) => (
            <span key={id}>
              {i > 0 && <span className="mx-1 text-zinc-700">→</span>}
              {AGENT_ROTATION_LABEL[id]}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function FinalArtifactCard({ view }: { view: SessionView }) {
  const fa = view.finalArtifact;
  if (view.status !== "stopped") return null;
  if (!fa) {
    if (view.summaryError && view.summaryError.stage === "final") {
      return (
        <div className="rounded-lg bg-amber-950/40 px-4 py-3 ring-1 ring-amber-900/60">
          <div className="text-xs font-medium text-amber-200">
            ⚠ 최종 산출물 생성 실패
          </div>
          <p className="mt-1 text-[11px] text-amber-300/80">
            {view.summaryError.message}
          </p>
        </div>
      );
    }
    return null;
  }
  const theme = AGENT_THEME[fa.summarizerId];
  return (
    <div className="mt-2 rounded-lg bg-zinc-950 px-5 py-4 ring-2 ring-blue-700/60 shadow-[0_0_24px_-8px_rgba(59,130,246,0.55)]">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-blue-700/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-200">
          📦 최종 산출물
        </span>
        <span className="text-zinc-500">
          · {theme.emoji} {theme.label} 정리
        </span>
      </div>
      <div className="prose-invert text-sm leading-relaxed text-zinc-100">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {fa.text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function SetupHints() {
  return (
    <div className="m-auto grid w-full max-w-3xl grid-cols-[auto_1fr] gap-x-10 gap-y-6 px-4 py-12">
      <div className="col-span-2 flex items-baseline gap-4 border-b border-zinc-800 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          Issue №00 · standby
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          Agora / multi-agent debate
        </span>
      </div>

      <h2 className="col-span-2 max-w-2xl text-[40px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-50">
        여러 AI가 토론하는 동안,
        <br />
        <span className="text-zinc-400">
          함께 끼어들고 함께 흐름을 만듭니다.
        </span>
      </h2>

      <p className="col-span-2 max-w-xl text-[14px] leading-[1.7] text-zinc-400">
        Claude · GPT · Gemini가 한 명씩 직렬로 메시지를 주고받는다. 사용자는
        진행 중 발언을 즉시 끊고 의견을 끼우거나, 다음 라운드 큐에 보탠다. 모든
        토큰은 실시간 스트리밍, 모든 이벤트는 JSONL로 기록된다.
      </p>

      <ol className="col-span-2 mt-2 grid grid-cols-1 divide-y divide-zinc-800 border-y border-zinc-800 md:grid-cols-3 md:divide-x md:divide-y-0">
        <SetupStep
          n="01"
          label="Authenticate"
          title="AI 활성·인증"
          body="좌측 ‘AI 에이전트 설정’에서 2개 이상 활성화하고 API 키 또는 CLI를 인증한다."
        />
        <SetupStep
          n="02"
          label="Topic"
          title="토론 주제 · 결과 정리 담당"
          body="프리셋 칩이 가장 빠르다. 정리 담당을 지정하면 종료 시 결론·논점·미해결·액션 4섹션 산출물이 따라온다."
        />
        <SetupStep
          n="03"
          label="On air"
          title="시작 · 끼어들기"
          body="좌측 ‘세션 시작’ → 진행 중 언제든 하단 입력창으로 끼어들기. 진행 발언을 자르거나 큐에 보탠다."
        />
      </ol>
    </div>
  );
}

function SetupStep({
  n,
  label,
  title,
  body,
}: {
  n: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-2 px-5 py-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[28px] font-light text-zinc-700">
          {n}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[14px] font-medium tracking-tight text-zinc-100">
          {title}
        </span>
        <span className="text-[12px] leading-[1.7] text-zinc-500">{body}</span>
      </div>
    </li>
  );
}

const AGENT_BAR: Record<string, string> = {
  user: "bg-zinc-500",
  claude: "bg-orange-400",
  codex: "bg-emerald-400",
  gemini: "bg-blue-400",
};

const AGENT_LABEL_COLOR: Record<string, string> = {
  user: "text-zinc-400",
  claude: "text-orange-300",
  codex: "text-emerald-300",
  gemini: "text-blue-300",
};

function Bubble({
  message,
  expanded,
  onToggleExpand,
}: {
  message: ChatMessage;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const theme = AGENT_THEME[message.role] ?? AGENT_THEME.user;
  const bar = AGENT_BAR[message.role] ?? AGENT_BAR.user;
  const shouldCollapse =
    !message.streaming &&
    !expanded &&
    !message.interrupted &&
    message.text.length > COLLAPSE_CHAR_THRESHOLD;
  const isUserInterrupt =
    message.role === "user" && message.mode === "interrupt";
  const isUserQueue = message.role === "user" && message.mode === "queue";
  const userTag = isUserInterrupt ? "INTERRUPT" : isUserQueue ? "QUEUED" : null;
  const interruptStyle = isUserInterrupt ? "animate-bubble-in" : "";

  return (
    <article
      id={`msg-${message.id}`}
      data-turn={message.turn ?? ""}
      data-agent={message.role}
      className={`group relative grid w-full max-w-[78ch] grid-cols-[3px_1fr] gap-4 scroll-mt-24 ${interruptStyle}`}
    >
      <div
        aria-hidden="true"
        className={`${bar} ${
          isUserInterrupt ? "shadow-[0_0_12px_rgba(245,158,11,0.5)]" : ""
        } rounded-full opacity-80 transition-opacity group-hover:opacity-100`}
      />
      <div className="flex flex-col gap-1.5 pb-1">
        <div className="flex items-baseline gap-3 text-[10px]">
          <span
            className={`font-mono uppercase tracking-[0.18em] ${
              AGENT_LABEL_COLOR[message.role] ?? "text-zinc-400"
            }`}
          >
            {theme.label}
          </span>
          {message.turn !== undefined && (
            <span className="font-mono tabular-nums text-zinc-600">
              R{String(message.turn).padStart(2, "0")}
            </span>
          )}
          {userTag && (
            <span
              className={`rounded-sm px-1.5 py-0.5 font-mono tracking-wider ${
                isUserInterrupt
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-blue-500/15 text-blue-300"
              }`}
            >
              {userTag}
            </span>
          )}
          {message.streaming && message.text.length === 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400" />
              <span className="font-mono uppercase tracking-wider">
                thinking
              </span>
            </span>
          )}
          {message.streaming && message.text.length > 0 && (
            <span className="font-mono uppercase tracking-wider text-emerald-400">
              streaming
            </span>
          )}
          {message.interrupted && (
            <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 font-mono tracking-wider text-amber-300">
              CUT
            </span>
          )}
          <span className="ml-auto font-mono tabular-nums text-zinc-700">
            {new Date(message.ts).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
        <div
          className={`text-sm ${message.interrupted ? "text-zinc-500" : "text-zinc-100"}`}
        >
          {message.text ? (
            <>
              <div
                className={
                  shouldCollapse
                    ? "prose-invert relative max-h-48 overflow-hidden"
                    : "prose-invert"
                }
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={MARKDOWN_COMPONENTS}
                >
                  {message.text}
                </ReactMarkdown>
                {message.streaming && (
                  <span className="ml-0.5 animate-pulse">▌</span>
                )}
                {shouldCollapse && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
                )}
              </div>
              {(shouldCollapse || expanded) && !message.streaming && (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  {expanded
                    ? "접기 ↑"
                    : `더 보기 ↓ · ${message.text.length.toLocaleString()}자`}
                </button>
              )}
            </>
          ) : message.streaming ? (
            <span className="italic text-zinc-500">
              CLI 부팅·인증 체크 중… (CLI 모드는 첫 응답까지 ~25초 걸릴 수
              있어요)
            </span>
          ) : message.interrupted ? (
            <span className="italic text-zinc-600">
              (응답 시간 초과 또는 끼어들기로 중단됨)
            </span>
          ) : (
            <span className="italic text-zinc-600">
              (응답 실패 — 우측 활동 로그에서 사유 확인)
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function PassChip({ agentId, turn }: { agentId: AgentId; turn: number }) {
  const theme = AGENT_THEME[agentId];
  return (
    <div className="self-center text-[11px] text-zinc-500">
      {theme.emoji} {theme.label} 패스 · 라운드 {turn}
    </div>
  );
}

function ErrorBanner({
  errorRecent,
}: {
  errorRecent: { agentId: AgentId; message: string; turn: number };
}) {
  const theme = AGENT_THEME[errorRecent.agentId];
  const fe = friendlyError(errorRecent.message);
  return (
    <div className="self-center max-w-md rounded-lg bg-red-950/80 px-3 py-2 text-xs ring-1 ring-red-900">
      <div className="font-medium text-red-200">
        ⚠ {theme.emoji} {theme.label} — {fe.title}
        <span className="ml-1 text-red-300/60">
          · 라운드 {errorRecent.turn}
        </span>
      </div>
      {fe.hint && (
        <p className="mt-1 text-[11px] leading-relaxed text-red-300/85">
          💡 {fe.hint}
        </p>
      )}
      <details className="mt-1 text-[10px] text-red-400/70">
        <summary className="cursor-pointer select-none">
          원본 메시지 펼쳐보기
        </summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono">
          {fe.raw}
        </pre>
      </details>
    </div>
  );
}
