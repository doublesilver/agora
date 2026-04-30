/* InterventionInput — 입력창 + 모드 토글 + Send. V2 인터럽트/큐 포함. */
"use client";

import { useState } from "react";
import type { InterveneMode, SessionView } from "@/lib/client/types";

interface Props {
  view: SessionView;
  onSend: (text: string, mode: InterveneMode) => Promise<void>;
}

export function InterventionInput({ view, onSend }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InterveneMode>("interrupt");
  const disabled =
    view.status === "setup" ||
    view.status === "stopped" ||
    text.trim().length === 0;

  async function send() {
    const t = text.trim();
    if (!t) return;
    await onSend(t, mode);
    setText("");
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">개입 모드:</span>
        <button
          type="button"
          onClick={() => setMode("interrupt")}
          className={`rounded px-2 py-0.5 ${mode === "interrupt" ? "bg-amber-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
        >
          ● Interrupt
        </button>
        <button
          type="button"
          onClick={() => setMode("queue")}
          className={`rounded px-2 py-0.5 ${mode === "queue" ? "bg-blue-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
        >
          ○ Queue
        </button>
        {view.status === "idle" && (
          <span className="ml-2 rounded bg-emerald-900/60 px-2 py-0.5 text-emerald-300">
            사용자 차례 — 메시지를 보내거나 STOP
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            view.status === "setup"
              ? "세션 시작 후 메시지 입력 가능"
              : "메시지 입력 (⌘+Enter)"
          }
          disabled={view.status === "setup" || view.status === "stopped"}
          className="h-16 flex-1 resize-none rounded border border-zinc-800 bg-zinc-900 p-2 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={send}
          className="rounded bg-blue-600 px-4 text-sm font-medium disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          Send
        </button>
      </div>
    </div>
  );
}
