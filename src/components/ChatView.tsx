/* ChatView — 단일 시간순 transcript 스레드. */
"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "@/lib/client/friendly-error";

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
}

export function ChatView({ view }: Props) {
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

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex h-full flex-col gap-3 overflow-y-auto bg-zinc-900 px-6 py-6"
    >
      {view.messages.length === 0 && <SetupHints />}
      {view.messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
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
    <div className="m-auto flex w-full max-w-xl flex-col gap-6 px-2 py-8">
      <header className="flex flex-col gap-2 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Agora · multi-agent debate
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
          여러 AI의 토론에 직접 끼어드세요
        </h2>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          Claude · GPT · Gemini가 직렬 라운드로 자유롭게 메시지를 주고받습니다.
          사용자는 언제든 즉시 끼어들거나 다음 라운드에 보탤 수 있고, 전체
          transcript를 실시간으로 관찰합니다.
        </p>
      </header>

      <ol className="flex flex-col gap-2 text-left text-[13px] text-zinc-300">
        <li className="flex items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-3 transition-colors hover:border-zinc-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[11px] text-zinc-300">
            1
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-zinc-100">AI 활성·인증</span>
            <span className="text-[12px] text-zinc-500">
              좌측 ‘AI 에이전트 설정’에서 2개 이상 활성화하고 API 키 또는 CLI를
              인증하세요.
            </span>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-3 transition-colors hover:border-zinc-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[11px] text-zinc-300">
            2
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-zinc-100">
              토론 주제 + (선택) 요약 담당
            </span>
            <span className="text-[12px] text-zinc-500">
              프리셋 칩이 가장 빠릅니다. 요약 담당을 지정하면 라운드마다 실시간
              요약과 종료 시 최종 산출물이 생성됩니다.
            </span>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-3 transition-colors hover:border-zinc-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[11px] text-zinc-300">
            3
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-zinc-100">시작</span>
            <span className="text-[12px] text-zinc-500">
              좌측 ‘세션 시작’ 버튼을 누르면 토론이 시작됩니다. 진행 중 언제든
              하단 입력창으로 끼어들 수 있어요.
            </span>
          </div>
        </li>
      </ol>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const theme = AGENT_THEME[message.role] ?? AGENT_THEME.user;
  const isUserInterrupt =
    message.role === "user" && message.mode === "interrupt";
  const isUserQueue = message.role === "user" && message.mode === "queue";
  const ringClass = isUserInterrupt
    ? "ring-2 ring-amber-500 shadow-[0_0_24px_-4px_rgba(245,158,11,0.45)] animate-bubble-in"
    : isUserQueue
      ? "ring-1 ring-blue-700"
      : `ring-1 ${theme.ring}`;
  const userTag = isUserInterrupt
    ? "⚡ 즉시 끼어들기"
    : isUserQueue
      ? "📥 큐에 추가"
      : null;

  return (
    <div
      className={`max-w-[78ch] rounded-xl px-4 py-3 transition-shadow ${theme.bg} ${ringClass}`}
    >
      <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
        <span className="text-[13px]">{theme.emoji}</span>
        <span className="font-semibold tracking-tight text-zinc-200">
          {theme.label}
        </span>
        {userTag && (
          <span className="rounded bg-amber-700/40 px-1.5 py-0.5 text-[10px] text-amber-200">
            {userTag}
          </span>
        )}
        {message.turn !== undefined && <span>· 라운드 {message.turn}</span>}
        {message.streaming && message.text.length === 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-amber-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            생각 중…
          </span>
        )}
        {message.streaming && message.text.length > 0 && (
          <span className="text-emerald-300">· 전송 중</span>
        )}
        {message.interrupted && (
          <span className="ml-2 rounded bg-amber-700/40 px-1.5 py-0.5 text-[10px] text-amber-200">
            끼어듦으로 중단
          </span>
        )}
      </div>
      <div
        className={`text-sm ${message.interrupted ? "text-zinc-500" : "text-zinc-100"}`}
      >
        {message.text ? (
          <div className="prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {message.text}
            </ReactMarkdown>
            {message.streaming && (
              <span className="ml-0.5 animate-pulse">▌</span>
            )}
          </div>
        ) : message.streaming ? (
          <span className="italic text-zinc-500">
            CLI 부팅·인증 체크 중… (CLI 모드는 첫 응답까지 ~25초 걸릴 수 있어요)
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
