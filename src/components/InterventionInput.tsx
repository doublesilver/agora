/* InterventionInput — Forum 사용자 발언 입력창 (시안 C 적용).
 * 모드(즉시/큐) 라디오 + 터미널 prompt + 액션 버튼. */
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

  const isInterrupt = mode === "interrupt";
  const inputDisabled = view.status === "setup" || view.status === "stopped";

  return (
    <div
      className={`shrink-0 border-t-2 border-ink bg-paper ${flash ? "animate-flash-amber" : ""}`}
    >
      {showHelp && <SlashHelpCard onClose={() => setShowHelp(false)} />}

      {/* Mode + utility row */}
      <div className="flex flex-wrap items-center gap-4 border-b border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink2">
        <span className="text-ink3">// MODE</span>
        <button
          type="button"
          aria-pressed={isInterrupt}
          onClick={() => setMode("interrupt")}
          className={`flex items-center gap-1.5 transition-colors ${
            isInterrupt ? "text-ink" : "text-ink3 hover:text-ink2"
          }`}
        >
          <span className="text-[10px]">{isInterrupt ? "[●]" : "[ ]"}</span>
          <span
            className={`font-bold ${isInterrupt ? "bf-highlight px-1" : ""}`}
          >
            ⚡ IMMEDIATE · 즉시
          </span>
        </button>
        <span className="text-ink3">/</span>
        <button
          type="button"
          aria-pressed={!isInterrupt}
          onClick={() => setMode("queue")}
          className={`flex items-center gap-1.5 transition-colors ${
            !isInterrupt ? "text-ink" : "text-ink3 hover:text-ink2"
          }`}
        >
          <span className="text-[10px]">{!isInterrupt ? "[●]" : "[ ]"}</span>
          <span
            className={`font-bold ${!isInterrupt ? "bf-highlight px-1" : ""}`}
          >
            ⏎ QUEUE · 큐
          </span>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            disabled={inputDisabled}
            onClick={() => onSend(SUMMARY_PROMPT, "queue")}
            className="text-ink2 hover:text-ink disabled:opacity-40"
          >
            / SUMMARIZE
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="text-ink2 hover:text-ink"
          >
            / COMMANDS
          </button>
          {view.status === "idle" && (
            <span className="bf-highlight px-1 text-ink">※ USER TURN</span>
          )}
        </div>
      </div>

      {/* Input row — terminal prompt */}
      <div className="grid grid-cols-[120px_1fr_140px] divide-x divide-ink">
        <div className="flex flex-col justify-center gap-1 px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink3">
            // ※ USER
          </div>
          <div className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-ink">
            R{view.turn} · {isInterrupt ? "즉시" : "큐"}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink3">
            {isInterrupt ? "↵ 즉시 반영" : "↵ 다음 라운드"}
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="mt-1 font-mono text-[14px] font-bold text-ink">
              &gt;&gt;
            </span>
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
                inputDisabled
                  ? view.status === "stopped"
                    ? "// 세션 종료됨 — 새 세션을 시작하세요"
                    : "// 세션 시작 전 — 좌측에서 ▶ START SESSION"
                  : isInterrupt
                    ? "// 지금 의견 추가 — 예: '타겟 유저는 라이트 게이머입니다'"
                    : "// 다음 라운드에 전달할 메시지 — 진행 중 발언은 그대로"
              }
              aria-label="토론 개입 메시지 입력"
              disabled={inputDisabled}
              className="h-14 w-full resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink3 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2">
          <button
            type="button"
            disabled={disabled}
            onClick={send}
            className={`flex-1 border-2 border-ink font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isInterrupt
                ? "bg-ink text-paper hover:bg-paper hover:text-ink"
                : "bg-paper text-ink hover:bg-ink hover:text-paper"
            }`}
          >
            {isInterrupt ? "※ 지금 보내기 →" : "↳ 큐에 추가 →"}
          </button>
        </div>
      </div>

      {/* signature line */}
      <div className="flex items-center justify-between border-t border-ink px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink3">
        <span>
          ↵ 보내기 · ⇧↵ 줄바꿈 · / 슬래시 명령 · 진행 중에도 의견 추가 가능
        </span>
      </div>
    </div>
  );
}

function SlashHelpCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-b border-ink bg-paper2 px-4 py-2 font-mono text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold uppercase tracking-[0.2em] text-ink">
          / SLASH COMMANDS
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-ink2 hover:text-ink"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {COMMANDS.map((c) => (
          <li key={c.name} className="flex flex-wrap gap-2 text-ink2">
            <span className="font-bold text-ink">{c.name}</span>
            {c.alias && c.alias.length > 0 && (
              <span className="text-ink3">({c.alias.join(", ")})</span>
            )}
            <span className="text-ink3">— {c.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
