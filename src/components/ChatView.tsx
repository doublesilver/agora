/* ChatView — 단일 시간순 transcript 스레드. */
"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, SessionView } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";

const AGENT_THEME: Record<
  string,
  { bg: string; ring: string; label: string; emoji: string }
> = {
  user: { bg: "bg-zinc-800", ring: "ring-zinc-700", label: "You", emoji: "👤" },
  claude: {
    bg: "bg-blue-950/60",
    ring: "ring-blue-900",
    label: "Claude",
    emoji: "🟦",
  },
  codex: {
    bg: "bg-emerald-950/60",
    ring: "ring-emerald-900",
    label: "Codex",
    emoji: "🟧",
  },
  gemini: {
    bg: "bg-purple-950/60",
    ring: "ring-purple-900",
    label: "Gemini",
    emoji: "🟪",
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
      {view.messages.length === 0 && (
        <div className="my-auto self-center text-zinc-600 text-sm">
          왼쪽 패널에서 AI 2개 이상을 활성화하고 토론 주제를 입력해보세요.
        </div>
      )}
      {view.messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      {Object.entries(view.passedRecent).map(([id, turn]) =>
        turn === undefined ? null : (
          <PassChip key={`${id}-${turn}`} agentId={id as AgentId} turn={turn} />
        ),
      )}
      {view.errorRecent && (
        <div className="self-center rounded bg-red-950/80 px-3 py-1.5 text-xs text-red-300 ring-1 ring-red-900">
          ⚠ {view.errorRecent.agentId}: {view.errorRecent.message}
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const theme = AGENT_THEME[message.role] ?? AGENT_THEME.user;
  return (
    <div
      className={`max-w-[78ch] rounded-lg px-4 py-3 ${theme.bg} ring-1 ${theme.ring}`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
        <span>{theme.emoji}</span>
        <span className="font-medium text-zinc-300">{theme.label}</span>
        {message.turn !== undefined && <span>· turn {message.turn}</span>}
        {message.streaming && message.text.length === 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-amber-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            thinking…
          </span>
        )}
        {message.streaming && message.text.length > 0 && (
          <span className="text-emerald-300">· streaming</span>
        )}
        {message.interrupted && (
          <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
            interrupted
          </span>
        )}
      </div>
      <div
        className={`whitespace-pre-wrap text-sm ${message.interrupted ? "text-zinc-500" : "text-zinc-100"}`}
      >
        {message.text ? (
          <>
            {message.text}
            {message.streaming && (
              <span className="ml-0.5 animate-pulse">▌</span>
            )}
          </>
        ) : message.streaming ? (
          <span className="italic text-zinc-500">
            CLI 부팅·인증 체크 중… (CLI 모드는 첫 응답까지 ~25s 걸릴 수 있음)
          </span>
        ) : message.interrupted ? (
          <span className="italic text-zinc-600">
            (응답 시간 초과 또는 끼어들기로 중단됨)
          </span>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

function PassChip({ agentId, turn }: { agentId: AgentId; turn: number }) {
  const theme = AGENT_THEME[agentId];
  return (
    <div className="self-center text-[11px] text-zinc-500">
      {theme.emoji} {theme.label} passed · turn {turn}
    </div>
  );
}
