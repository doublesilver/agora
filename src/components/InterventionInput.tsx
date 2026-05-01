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
      className={`relative flex shrink-0 flex-col bg-zinc-950 px-6 pb-3 pt-6 ${flash ? "animate-flash-amber" : ""}`}
    >
      {/* Folio tab — Sagmeister 풍 신문 가장자리 라벨 */}
      <div className="absolute -top-3 left-6 bg-zinc-950 px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-300">
          Reader&apos;s Desk · 끼어들기
        </span>
      </div>
      <div className="border-t-2 border-zinc-700 pt-4">
        {showHelp && <SlashHelpCard onClose={() => setShowHelp(false)} />}

        {/* Mode 라디오 + 보조 액션 */}
        <div
          role="group"
          aria-label="메시지 개입 방식 선택"
          className="mb-4 flex flex-wrap items-center gap-4"
        >
          <button
            type="button"
            aria-pressed={mode === "interrupt"}
            onClick={() => setMode("interrupt")}
            title="진행 중 발언을 즉시 끊고 사용자 메시지를 다음 라운드에 반영"
            className={`flex items-center gap-1.5 transition-colors ${
              mode === "interrupt"
                ? "text-red-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="text-[10px]">
              {mode === "interrupt" ? "●" : "○"}
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em]">
              Immediate · 즉시
            </span>
          </button>
          <span className="text-zinc-700">/</span>
          <button
            type="button"
            aria-pressed={mode === "queue"}
            onClick={() => setMode("queue")}
            title="현재 라운드는 그대로 두고 다음 라운드에 반영"
            className={`flex items-center gap-1.5 transition-colors ${
              mode === "queue"
                ? "text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="text-[10px]">{mode === "queue" ? "●" : "○"}</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em]">
              Queue · 큐
            </span>
          </button>

          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              disabled={view.status === "setup" || view.status === "stopped"}
              onClick={() => onSend(SUMMARY_PROMPT, "queue")}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="다음 라운드에 자동 요약 요청"
            >
              Summarize
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-zinc-200"
              title="슬래시 커맨드 안내"
            >
              / Commands
            </button>
            {view.status === "idle" && (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-300">
                User Turn
              </span>
            )}
          </span>
        </div>

        {/* Reader's bar — double border-l + Serif italic placeholder */}
        <div className="flex gap-3">
          <div className="relative flex-1 border-l-[5px] border-double border-zinc-300/80 pl-4">
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
                      ? "AI들이 합의한 것 같아요. 다음 의견을 보태거나 종료하세요"
                      : view.status === "paused"
                        ? "일시정지 중 — 메시지는 큐에 쌓였다가 재개 시 반영"
                        : "이 토론에 한 마디 — 당신의 차례입니다."
              }
              aria-label="토론 개입 메시지 입력"
              disabled={view.status === "setup" || view.status === "stopped"}
              style={{ fontFamily: '"Noto Serif KR", serif' }}
              className="h-16 w-full resize-none bg-transparent text-base leading-relaxed text-zinc-100 outline-none placeholder:italic placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={send}
            className={`self-end border px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "interrupt"
                ? "border-red-300 text-red-200 hover:bg-red-200 hover:text-red-900"
                : "border-amber-300 text-amber-200 hover:bg-amber-200 hover:text-amber-900"
            }`}
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em]">
              Send →
            </span>
          </button>
        </div>

        {/* signature line */}
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">
            Enter to send · Shift+Enter newline · / Commands
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">
            — You, Reader
          </span>
        </div>
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
