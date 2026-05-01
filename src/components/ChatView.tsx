/* ChatView — Brutalist Forum (시안 C 적용).
 * 5-column TurnRow + InterruptRow + Forum SetupHints + FinalArtifactCard. */
"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "@/lib/client/friendly-error";

const AGENT_INITIAL: Record<AgentId, string> = {
  claude: "C",
  codex: "X",
  gemini: "G",
};

const AGENT_LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const AGENT_ROLE: Record<AgentId, string> = {
  claude: "Reviewer",
  codex: "Implementer",
  gemini: "Critic",
};

const AGENT_ACCENT: Record<AgentId, string> = {
  claude: "#C84A2C", // coral
  codex: "#2D7A4F", // forest
  gemini: "#3F6CB6", // ink blue
};

const COLLAPSE_CHAR_THRESHOLD = 800;

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 leading-[1.65] text-ink">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="bf-highlight font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-ink2">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-paper2 px-1 py-0.5 font-mono text-[0.92em] text-ink">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 overflow-x-auto border border-ink bg-paper2 p-3 font-mono text-[12px] leading-relaxed text-ink">
      {children}
    </pre>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="border-b border-ink text-ink hover:bg-highlight"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-ink2">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-ink2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-[1.65] text-ink">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1.5 mt-3 font-mono text-base font-bold uppercase tracking-tight text-ink">
      {children}
    </h2>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2.5 font-mono text-sm font-bold uppercase tracking-tight text-ink">
      {children}
    </h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-2 font-mono text-[13px] font-bold uppercase text-ink">
      {children}
    </h4>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-ink pl-3 italic text-ink2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-ink" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-ink bg-paper2 px-2 py-1 text-left font-bold uppercase">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-ink px-2 py-1">{children}</td>
  ),
};

interface Props {
  view: SessionView;
  density?: "compact" | "cozy";
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function ChatView({ view, density = "cozy" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
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
      className={`flex h-full flex-col overflow-y-auto bg-paper ${
        density === "compact" ? "" : ""
      }`}
    >
      {view.messages.length === 0 ? (
        <SetupHints />
      ) : (
        <>
          <RowHeader />
          {view.messages.map((m, i) =>
            m.role === "user" ? (
              <InterruptRow key={m.id} message={m} idx={i} />
            ) : (
              <TurnRow
                key={m.id}
                message={m}
                idx={i}
                expanded={expanded.has(m.id)}
                onToggleExpand={() => toggleExpand(m.id)}
              />
            ),
          )}
          {view.errorRecent && <ErrorBanner errorRecent={view.errorRecent} />}
          <FinalArtifactCard view={view} />
        </>
      )}
    </div>
  );
}

function RowHeader() {
  return (
    <div className="sticky top-0 z-10 grid grid-cols-[60px_84px_120px_1fr_110px] border-b-2 border-ink bg-paper font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink3">
      <div className="border-r border-ink px-3 py-1.5">#</div>
      <div className="border-r border-ink px-3 py-1.5">timing</div>
      <div className="border-r border-ink px-3 py-1.5">speaker</div>
      <div className="border-r border-ink px-3 py-1.5">utterance</div>
      <div className="px-3 py-1.5">meta · acts</div>
    </div>
  );
}

function TurnRow({
  message,
  idx,
  expanded,
  onToggleExpand,
}: {
  message: ChatMessage;
  idx: number;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (message.role === "user") return null;
  const agentId = message.role as AgentId;
  const accent = AGENT_ACCENT[agentId];
  const live = !!message.streaming;
  const banded = idx % 2 === 0 ? "bg-paper" : "bg-paper2";
  const shouldCollapse =
    !live &&
    !expanded &&
    !message.interrupted &&
    message.text.length > COLLAPSE_CHAR_THRESHOLD;

  return (
    <article
      id={`msg-${message.id}`}
      data-turn={message.turn ?? ""}
      data-agent={message.role}
      className={`grid scroll-mt-24 grid-cols-[60px_84px_120px_1fr_110px] border-b border-ink ${banded} font-mono text-[12.5px] ${live ? "animate-bubble-in" : ""}`}
    >
      <div className="flex flex-col border-r border-ink px-2.5 py-3 text-[10px] tracking-[0.16em] text-ink2">
        <span>#{pad3(idx + 1)}</span>
        <span className="mt-0.5 text-ink3">R{message.turn ?? "—"}</span>
      </div>
      <div className="border-r border-ink px-2.5 py-3 text-[10px] tracking-[0.14em] text-ink2">
        {formatTime(message.ts)}
      </div>
      <div
        className="flex flex-col justify-start border-r border-ink px-2.5 py-3 font-bold text-paper"
        style={{ background: accent }}
      >
        <div className="text-[14px] leading-tight tracking-[-0.01em]">
          [{AGENT_INITIAL[agentId]}] {AGENT_LABEL[agentId]}
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.18em] opacity-85">
          {AGENT_ROLE[agentId]}
        </div>
        {live && (
          <div className="mt-auto pt-2 text-[9px] uppercase tracking-[0.2em]">
            ◉ ON FLOOR
          </div>
        )}
        {message.interrupted && (
          <div className="mt-auto pt-2 text-[9px] uppercase tracking-[0.2em]">
            ‖ CUT
          </div>
        )}
      </div>
      <div className="relative border-r border-ink px-3.5 py-3 leading-[1.55] text-ink">
        {message.text ? (
          <>
            <span className="mr-1 text-ink3">&gt;</span>
            <div
              className={`inline ${shouldCollapse ? "[&>p]:!my-0" : ""}`}
              style={
                shouldCollapse
                  ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 6,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }
                  : undefined
              }
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={MARKDOWN_COMPONENTS}
              >
                {message.text}
              </ReactMarkdown>
            </div>
            {live && <span className="ml-0.5 animate-pulse">▌</span>}
            {(shouldCollapse || expanded) && !live && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-1.5 border border-ink bg-paper px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
              >
                {expanded
                  ? "[ ▲ FOLD ]"
                  : `[ ▼ UNFOLD · ${message.text.length}자 ]`}
              </button>
            )}
          </>
        ) : live ? (
          <span className="italic text-ink3">// CLI 부팅·인증 체크 중…</span>
        ) : message.interrupted ? (
          <span className="italic text-ink3">
            // 응답 시간 초과 또는 끼어들기로 중단됨
          </span>
        ) : (
          <span className="italic text-ink3">
            // 응답 실패 — 활동 로그에서 사유 확인
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-2.5 py-3 text-[10px] tracking-[0.16em] text-ink2">
        <span>R{message.turn ?? "—"}</span>
        {live ? (
          <span className="text-ink3">streaming</span>
        ) : message.interrupted ? (
          <span className="text-ink3">cut</span>
        ) : (
          <span className="text-ink3">done</span>
        )}
      </div>
    </article>
  );
}

function InterruptRow({ message, idx }: { message: ChatMessage; idx: number }) {
  if (message.role !== "user") return null;
  const isInterrupt = message.mode === "interrupt";
  return (
    <article
      id={`msg-${message.id}`}
      data-agent="user"
      className="grid scroll-mt-24 grid-cols-[60px_84px_120px_1fr_110px] border-b border-ink bg-ink font-mono text-[12.5px] text-paper animate-bubble-in"
    >
      <div className="border-r border-paper2/20 px-2.5 py-3 text-[10px] tracking-[0.16em]">
        <span>#{pad3(idx + 1)}</span>
        <br />
        <span className="text-highlight">USR</span>
      </div>
      <div className="border-r border-paper2/20 px-2.5 py-3 text-[10px] tracking-[0.14em]">
        {formatTime(message.ts)}
        <br />
        <span className="text-highlight">NOW</span>
      </div>
      <div
        className="flex flex-col justify-start border-r border-paper2/20 px-2.5 py-3 font-bold"
        style={{ background: "#F2E14C", color: "#0A0A0A" }}
      >
        <div className="text-[14px] leading-tight tracking-[-0.01em]">
          ※ USER
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.18em]">
          {isInterrupt ? "IMMEDIATE" : "QUEUED"}
        </div>
        <div className="mt-auto pt-2 text-[9px] uppercase tracking-[0.2em]">
          {isInterrupt ? "⌥+↵ FIRED" : "⏎ ENQUEUED"}
        </div>
      </div>
      <div className="border-r border-paper2/20 px-3.5 py-3 leading-[1.55]">
        <span className="mr-1 text-highlight">&gt;&gt;</span>
        <span>{message.text}</span>
        <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-highlight">
          // INJECT → FLOOR.next() ·{" "}
          {isInterrupt ? "OVERRIDE: cut current" : "QUEUE: next round"}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-2.5 py-3 text-[10px] uppercase tracking-[0.16em]">
        <span>{isInterrupt ? "force-injected" : "enqueued"}</span>
      </div>
    </article>
  );
}

function FinalArtifactCard({ view }: { view: SessionView }) {
  const fa = view.finalArtifact;
  if (view.status !== "stopped") return null;
  if (!fa) {
    if (view.summaryError && view.summaryError.stage === "final") {
      return (
        <div className="border-y-2 border-ink bg-paper2 px-4 py-3">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink">
            ※ FINAL ARTIFACT — GENERATION FAILED
          </div>
          <p className="mt-1 font-mono text-[11px] text-ink2">
            {view.summaryError.message}
          </p>
        </div>
      );
    }
    return null;
  }
  const compiledAt = new Date(fa.ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article className="border-y-2 border-ink bg-paper">
      <div className="grid grid-cols-[1fr_220px] border-b border-ink">
        <div className="border-r border-ink px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink2">
            // FINAL ARTIFACT · COMPILED {compiledAt}
          </div>
          <div className="mt-2 font-mono text-[24px] font-extrabold uppercase leading-none tracking-[-0.03em] text-ink">
            <span className="bf-highlight">결론 호외</span>
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink3">
            BY {AGENT_LABEL[fa.summarizerId]} · {AGENT_ROLE[fa.summarizerId]} ·
            R{view.turn} · {view.sessionTokens.toLocaleString()} tok
          </div>
        </div>
        {view.sessionId && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-3">
            <a
              href={`/api/export?id=${view.sessionId}`}
              className="border border-ink bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink hover:bg-ink hover:text-paper"
            >
              ↓ MARKDOWN
            </a>
          </div>
        )}
      </div>
      <div className="px-4 py-4 text-[13.5px] leading-[1.7] text-ink">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {fa.text}
        </ReactMarkdown>
      </div>
      <div className="border-t border-ink py-2 text-center font-mono text-sm tracking-[0.6em] text-ink3">
        — 30 —
      </div>
    </article>
  );
}

function SetupHints() {
  return (
    <div className="flex h-full w-full flex-col text-ink">
      {/* Brutal masthead bar — full bleed, bg-ink */}
      <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-6 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-paper">
        <span>ISSUE 001 · VOL.1 · SETUP</span>
        <span className="text-paper2">// AUTH → TOPIC → GO</span>
        <span className="text-paper2">EST. 2026</span>
      </div>

      {/* Hero masthead grid — wordmark + editorial sidebar */}
      <div className="grid grid-cols-[1fr_360px] border-b-2 border-ink">
        <div className="flex flex-col justify-between border-r-2 border-ink px-8 py-10">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-ink2">
            // BRIEF · 호외 — 멀티 AI 토론
          </div>
          <h1 className="mt-4 font-mono text-[120px] font-black uppercase leading-[0.84] tracking-[-0.06em] text-ink">
            AGORA<span className="text-ink3">::</span>
            <br />
            FORUM
          </h1>
          <div className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink2">
            ─── 사용자가 끼어들 수 있는 멀티 AI 토론 도구 ───
          </div>
        </div>
        <aside className="flex flex-col justify-between gap-4 bg-paper2 px-6 py-10">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-ink3">
            // EDITORIAL
          </div>
          <p className="font-mono text-[13px] leading-[1.7] text-ink">
            여러 AI 에이전트가{" "}
            <span className="bf-highlight font-bold">직렬 라운드</span>로
            토론합니다. 사용자는 진행 중 발언을{" "}
            <span className="bf-highlight font-bold">즉시 끊고</span> 의견을
            끼우거나 다음 라운드에 보탤 수 있습니다.
          </p>
          <p className="font-mono text-[12px] leading-[1.65] text-ink2">
            모든 토큰은 실시간으로 스트리밍되고, 모든 이벤트는 JSONL로 기록되며,
            토론 종료 시 결과 정리 담당이 한 장의 호외로 압축합니다.
          </p>
          <div className="border-t-2 border-ink pt-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink">
            ※ 토론에 끼어들 권한 — USER ONLY
          </div>
        </aside>
      </div>

      {/* 3-step setup ledger — full bleed, big numerals */}
      <div className="grid grid-cols-3 divide-x-2 divide-ink border-b-2 border-ink">
        {[
          ["01", "AUTH", "AI 에이전트 ≥2 활성·인증", "→ ⚙ SETTINGS · AGENTS"],
          [
            "02",
            "TOPIC",
            "토론 주제 입력 + (선택) 결과 정리 담당",
            "→ SIDEBAR · TOPIC.draft",
          ],
          ["03", "GO", "▶ START SESSION → 진행 중 끼어들기", "→ R01 BEGINS"],
        ].map(([n, label, body, hint]) => (
          <div key={n} className="flex flex-col gap-3 px-6 py-6">
            <div className="font-mono text-[64px] font-black leading-none tracking-[-0.05em] text-ink">
              {n}
            </div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-ink">
              / {label}
            </div>
            <div className="font-mono text-[12px] leading-[1.6] text-ink2">
              {body}
            </div>
            <div className="mt-auto border-t border-ink pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink3">
              {hint}
            </div>
          </div>
        ))}
      </div>

      {/* Predicate footer — terminal-style */}
      <div className="flex items-center justify-between bg-ink px-6 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-paper">
        <span>
          // READY WHEN: ACTIVE_AGENTS ≥ 2 &amp;&amp; TOPIC.length &gt; 0
        </span>
        <span className="bg-highlight px-1 text-ink">EDIT-RIGHT → USER</span>
      </div>
    </div>
  );
}

function ErrorBanner({
  errorRecent,
}: {
  errorRecent: { agentId: AgentId; message: string; turn: number };
}) {
  const fe = friendlyError(errorRecent.message);
  return (
    <div className="border-b border-ink bg-paper2 px-4 py-3">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink">
        ※ {AGENT_LABEL[errorRecent.agentId]} R{errorRecent.turn} — {fe.title}
      </div>
      {fe.hint && (
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink2">
          // {fe.hint}
        </p>
      )}
      <details className="mt-1 font-mono text-[10px] text-ink3">
        <summary className="cursor-pointer">// raw error</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all">{fe.raw}</pre>
      </details>
    </div>
  );
}
