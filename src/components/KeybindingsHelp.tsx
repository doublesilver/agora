/* KeybindingsHelp — ? 키로 토글되는 단축키 도움말 모달.
 * 페이지 어디에서든 ? 누르면 열림 (단, input/textarea focus 시 무시 — 부모가 처리). */
"use client";

import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Row {
  keys: string[];
  desc: string;
}

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: "전역",
    rows: [
      { keys: ["⌘", "K"], desc: "명령 팔레트 열기 (Win/Linux: Ctrl+K)" },
      { keys: ["?"], desc: "이 도움말 열기 / 닫기" },
      { keys: ["Space"], desc: "Pause ↔ Resume 토글" },
      { keys: ["Esc"], desc: "Stop 또는 모달 닫기" },
      { keys: ["/"], desc: "입력창에 포커스" },
    ],
  },
  {
    group: "입력창",
    rows: [
      { keys: ["⌘", "Enter"], desc: "즉시 끼어들기 모드로 전송" },
      { keys: ["Shift", "Enter"], desc: "줄바꿈 (전송 안 함)" },
      { keys: ["Enter"], desc: "현재 모드(interrupt/queue)로 전송" },
    ],
  },
  {
    group: "팔레트 안",
    rows: [
      { keys: ["↑", "↓"], desc: "명령 선택" },
      { keys: ["Enter"], desc: "선택한 명령 실행" },
      { keys: ["Esc"], desc: "팔레트 닫기" },
    ],
  },
];

export function KeybindingsHelp({ open, onClose }: Props) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <span className="font-mono text-[11px] text-zinc-500">?</span>
            키보드 단축키
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          {ROWS.map((g) => (
            <section key={g.group} className="mb-3 last:mb-0">
              <h3 className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                {g.group}
              </h3>
              <ul className="flex flex-col gap-1">
                {g.rows.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900/60"
                  >
                    <span className="flex-1 truncate">{r.desc}</span>
                    <span className="flex items-center gap-1">
                      {r.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-zinc-800 px-4 py-2 font-mono text-[10px] text-zinc-600">
          ? 다시 누르거나 Esc로 닫기
        </div>
      </div>
    </div>
  );
}
