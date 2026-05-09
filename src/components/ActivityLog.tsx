/* ActivityLog — Forum terminal log (시안 C 적용).
 * 우측 사이드 — 메타 이벤트 라이브 피드. 클릭 시 발화로 점프. */
"use client";

import { useEffect, useRef } from "react";
import type { ActivityEntry, SessionView } from "@/lib/client/types";

const TONE_CLASS: Record<ActivityEntry["tone"], string> = {
  info: "text-ink",
  warn: "text-ink",
  error: "text-paper bg-ink",
  pass: "text-ink2",
  system: "text-ink",
};

const TONE_PREFIX: Record<ActivityEntry["tone"], string> = {
  info: "·",
  warn: "!",
  error: "‖",
  pass: "✓",
  system: ">",
};

interface Props {
  view: SessionView;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", { hour12: false });
}

/** ActivityLog 항목 클릭 → 해당 발화 행으로 스크롤 + 1.4s 하이라이터 플래시.
 * Brutalist 시안에 맞춰 ring(둥근 그림자형) 대신 globals.css의
 * .animate-flash-amber 키프레임으로 하단부터 highlight 색이 페이드아웃되게. */
function jumpToBubble(turn: number, agentId: string): void {
  const matches = document.querySelectorAll<HTMLElement>(
    `article[data-turn="${turn}"][data-agent="${agentId}"]`,
  );
  const target = matches[matches.length - 1];
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("animate-flash-amber");
  setTimeout(() => {
    target.classList.remove("animate-flash-amber");
  }, 1400);
}

export function ActivityLog({ view }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [view.activityLog]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickRef.current = distance < 40;
  }

  return (
    <aside className="hidden h-full w-[280px] shrink-0 flex-col border-l-2 border-ink bg-paper font-mono text-[11px] text-ink lg:flex">
      <header className="flex items-center justify-between border-b-2 border-ink bg-ink px-3 py-1.5 text-paper">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em]">
          $ ACTIVITY.LOG
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-paper2">
          {view.activityLog.length}/30
        </span>
      </header>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="실시간 활동 로그"
        className="flex-1 overflow-y-auto px-2 py-2"
      >
        {view.activityLog.length === 0 ? (
          <div className="flex flex-col items-start gap-1 py-4 text-[10px] uppercase tracking-[0.18em] text-ink3">
            <span>// AWAITING SESSION</span>
            <span>// EVENTS APPEAR HERE</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {view.activityLog.map((entry) => {
              const jt = entry.jumpTo;
              const inner = (
                <>
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-ink3">
                    {formatTime(entry.ts)}
                  </span>
                  <span
                    className={`shrink-0 px-1 ${TONE_CLASS[entry.tone]}`}
                    aria-hidden="true"
                  >
                    {TONE_PREFIX[entry.tone]}
                  </span>
                  <span className={`break-words ${TONE_CLASS[entry.tone]}`}>
                    {entry.text}
                  </span>
                  {jt && (
                    <span
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-[9px] text-ink3"
                    >
                      ↗
                    </span>
                  )}
                </>
              );
              return (
                <li key={entry.id} className="leading-snug">
                  {jt ? (
                    <button
                      type="button"
                      onClick={() => jumpToBubble(jt.turn, jt.agentId)}
                      className="flex w-full items-start gap-1.5 border border-transparent px-1 py-0.5 text-left hover:border-ink hover:bg-paper2"
                      title="해당 발화로 이동"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-start gap-1.5 px-1 py-0.5">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
