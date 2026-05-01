/* InterventionInput — 입력창 + 모드 토글 + 보내기 + 슬래시 커맨드. */
"use client";

import { useState } from "react";
import type { InterveneMode, SessionView } from "@/lib/client/types";

interface Props {
  view: SessionView;
  onSend: (text: string, mode: InterveneMode) => Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const SUMMARY_PROMPT =
  "지금까지의 토론을 한국어로 3줄 요약하고, 합의된 핵심 결정 / 미해결 이슈 / 추천하는 다음 단계를 각각 bullet 한두 개로 정리해주세요.";

interface SlashCommand {
  name: string;
  alias?: string[];
  desc: string;
}

const COMMANDS: SlashCommand[] = [
  { name: "/요약", alias: ["/summary"], desc: "다음 라운드에 자동 요약 요청" },
  { name: "/일시정지", alias: ["/pause"], desc: "라운드 경계에서 일시정지" },
  { name: "/재개", alias: ["/resume"], desc: "일시정지 해제" },
  { name: "/종료", alias: ["/stop"], desc: "세션 즉시 종료 (확인 후)" },
  { name: "/도움말", alias: ["/help", "/?"], desc: "이 안내를 보여줌" },
];

function matchCommand(text: string): SlashCommand | null {
  const trimmed = text.trim().toLowerCase();
  for (const cmd of COMMANDS) {
    if (cmd.name === trimmed) return cmd;
    if (cmd.alias?.some((a) => a === trimmed)) return cmd;
  }
  return null;
}

export function InterventionInput({
  view,
  onSend,
  onPause,
  onResume,
  onStop,
}: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InterveneMode>("interrupt");
  const [flash, setFlash] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const disabled =
    view.status === "setup" ||
    view.status === "stopped" ||
    text.trim().length === 0;

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");

    // 슬래시 커맨드 분기
    const cmd = matchCommand(t);
    if (cmd) {
      await runCommand(cmd);
      return;
    }

    if (mode === "interrupt") {
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    }
    await onSend(t, mode);
  }

  async function runCommand(cmd: SlashCommand) {
    switch (cmd.name) {
      case "/요약":
        await onSend(SUMMARY_PROMPT, "queue");
        return;
      case "/일시정지":
        onPause();
        return;
      case "/재개":
        onResume();
        return;
      case "/종료":
        if (confirm("세션을 즉시 종료할까요? 진행 중 발언이 잘립니다.")) {
          onStop();
        }
        return;
      case "/도움말":
        setShowHelp(true);
        return;
    }
  }

  return (
    <div
      className={`flex shrink-0 flex-col gap-2 border-t border-zinc-800 bg-zinc-950 px-6 py-3 ${flash ? "animate-flash-amber" : ""}`}
    >
      {showHelp && <SlashHelpCard onClose={() => setShowHelp(false)} />}
      <div
        role="group"
        aria-label="메시지 개입 방식 선택"
        className="flex flex-wrap items-center gap-2 text-xs"
      >
        <span className="text-zinc-500">현재 모드:</span>
        <button
          type="button"
          aria-pressed={mode === "interrupt"}
          onClick={() => setMode("interrupt")}
          title="진행 중 발언을 즉시 끊고 사용자 메시지를 다음 라운드에 반영"
          className={`flex items-center gap-1 rounded px-2 py-0.5 ring-1 transition-colors ${
            mode === "interrupt"
              ? "bg-amber-700 text-white ring-amber-500"
              : "bg-zinc-800 text-zinc-400 ring-transparent hover:text-zinc-200"
          }`}
        >
          {mode === "interrupt" ? "●" : "○"} ⚡ 즉시 끼어들기
        </button>
        <button
          type="button"
          aria-pressed={mode === "queue"}
          onClick={() => setMode("queue")}
          title="현재 라운드는 그대로 두고 다음 라운드에 반영"
          className={`flex items-center gap-1 rounded px-2 py-0.5 ring-1 transition-colors ${
            mode === "queue"
              ? "bg-blue-700 text-white ring-blue-500"
              : "bg-zinc-800 text-zinc-400 ring-transparent hover:text-zinc-200"
          }`}
        >
          {mode === "queue" ? "●" : "○"} 📥 다음 라운드
        </button>
        <button
          type="button"
          disabled={view.status === "setup" || view.status === "stopped"}
          onClick={() => onSend(SUMMARY_PROMPT, "queue")}
          className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          title="다음 라운드에 자동 요약 요청"
        >
          📝 지금까지 요약
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400 hover:bg-zinc-700"
          title="슬래시 커맨드 안내"
        >
          / 명령어
        </button>
        {view.status === "idle" && (
          <span className="rounded bg-emerald-900/60 px-2 py-0.5 text-emerald-300">
            🤔 사용자 차례 — 메시지 보내거나 종료하세요
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            view.status === "setup"
              ? "세션 시작 후 메시지를 입력할 수 있어요"
              : view.status === "stopped"
                ? "세션이 종료되었습니다 — 좌측에서 새 세션을 시작하세요"
                : view.status === "idle"
                  ? "AI들이 합의한 것 같아요. 다음 의견을 보태거나 종료하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
                  : view.status === "paused"
                    ? "일시정지 중 — 메시지는 큐에 쌓였다가 재개 시 반영 (Enter 전송 · Shift+Enter 줄바꿈)"
                    : "예: '타겟 유저는 라이트 게이머다' — 즉시 끼어들면 진행 중 발언이 잘려요. /도움말 로 슬래시 커맨드 (Enter 전송)"
          }
          aria-label="토론 개입 메시지 입력"
          disabled={view.status === "setup" || view.status === "stopped"}
          className="h-16 flex-1 resize-none rounded border border-zinc-800 bg-zinc-900 p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={send}
          className={`rounded px-4 text-sm font-medium ${
            mode === "interrupt"
              ? "bg-amber-600 hover:bg-amber-500"
              : "bg-blue-600 hover:bg-blue-500"
          } disabled:bg-zinc-800 disabled:text-zinc-500`}
        >
          {mode === "interrupt" ? "⚡ 끼어들기" : "📥 보내기"}
        </button>
      </div>
    </div>
  );
}

function SlashHelpCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-zinc-200">/ 슬래시 커맨드</span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-0.5 text-zinc-400">
        {COMMANDS.map((c) => (
          <li key={c.name} className="flex gap-2">
            <span className="font-mono text-zinc-200">{c.name}</span>
            {c.alias && c.alias.length > 0 && (
              <span className="font-mono text-zinc-600">
                ({c.alias.join(", ")})
              </span>
            )}
            <span className="text-zinc-500">— {c.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
