/* CommandPalette — opencode 풍 ⌘K 팔레트.
 * 부모(page.tsx)가 액션 목록을 props로 주입한다. 검색·키보드 조작·실행은 자체 처리. */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  /** 표시 보조 (예: "⌘E"). 시각용으로만 사용, 실제 단축키는 부모가 별도 등록. */
  shortcut?: string;
  group?: string;
  /** false면 disabled 회색 처리 + 실행 차단. 0개 가시면 "지금 가능한 액션 없음" 빈 상태 표시. */
  enabled?: boolean;
  onRun: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  placeholder?: string;
}

export function CommandPalette({ open, onClose, actions, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const hay = `${a.label} ${a.hint ?? ""} ${a.group ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [actions, query]);

  useEffect(() => {
    if (cursor >= visible.length) setCursor(0);
  }, [visible.length, cursor]);

  if (!open) return null;

  function runAt(idx: number) {
    const a = visible[idx];
    if (!a) return;
    if (a.enabled === false) return;
    a.onRun();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(visible.length - 1, c + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      runAt(cursor);
      return;
    }
  }

  // group으로 묶은 가시 항목 렌더 — 같은 그룹은 헤더 한 번만.
  let lastGroup: string | undefined = undefined;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
          <span className="font-mono text-[11px] text-zinc-500">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? "명령 검색…"}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <span className="font-mono text-[10px] text-zinc-600">esc 닫기</span>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto py-1.5">
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-zinc-500">
              일치하는 명령 없음
            </li>
          )}
          {visible.map((a, i) => {
            const showGroup = a.group && a.group !== lastGroup;
            lastGroup = a.group;
            const active = i === cursor;
            const disabled = a.enabled === false;
            return (
              <li key={a.id}>
                {showGroup && (
                  <div className="mt-1 px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    {a.group}
                  </div>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    active && !disabled
                      ? "bg-zinc-800/80 text-zinc-50"
                      : "text-zinc-200"
                  } ${disabled ? "cursor-not-allowed text-zinc-600" : "hover:bg-zinc-900"}`}
                >
                  <span className="flex-1 truncate">{a.label}</span>
                  {a.hint && (
                    <span className="text-[11px] text-zinc-500">{a.hint}</span>
                  )}
                  {a.shortcut && (
                    <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      {a.shortcut}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-zinc-600">
          <span>↑↓ 선택 · Enter 실행 · Esc 닫기</span>
          <span className="text-zinc-700">Agora · ⌘K</span>
        </div>
      </div>
    </div>
  );
}
