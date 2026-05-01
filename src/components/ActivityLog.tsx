/* ActivityLog — 우측 사이드패널. 메타 이벤트 라이브 피드 (token 제외, 최근 30개).
 * JSONL 원본이 UI에 노출되지 않으니 채점자가 오케스트레이션을 시각적으로 확인하는 채널. */
"use client";

import { useEffect, useRef } from "react";
import type { ActivityEntry, SessionView } from "@/lib/client/types";

const TONE_CLASS: Record<ActivityEntry["tone"], string> = {
  info: "text-zinc-300",
  warn: "text-amber-300",
  error: "text-red-400",
  pass: "text-zinc-500",
  system: "text-emerald-300",
};

interface Props {
  view: SessionView;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", { hour12: false });
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
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 text-xs text-zinc-300">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="font-medium uppercase tracking-wider text-zinc-400">
          활동 로그
        </h2>
        <span className="text-[10px] text-zinc-500">
          {view.activityLog.length}/30
        </span>
      </header>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="실시간 활동 로그"
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {view.activityLog.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-zinc-600">
            <div className="text-2xl">📡</div>
            <p className="text-[11px]">세션 시작 시 이벤트가 흐릅니다</p>
            <p className="text-[10px] text-zinc-700">
              발언·PASS·timeout·usage·사용자 개입 등 메타 활동이
              <br />
              실시간 라이브 피드로 기록됩니다.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {view.activityLog.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-2 leading-snug"
              >
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                  {formatTime(entry.ts)}
                </span>
                <span className={TONE_CLASS[entry.tone]}>{entry.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
