/* Agora 메인 페이지 — 좌측 패널 + 상단 헤더 + 채팅 + 입력 + 글로벌 단축키 + ⌘K 팔레트. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { LeftPanel } from "@/components/LeftPanel";
import { ChatView } from "@/components/ChatView";
import { InterventionInput } from "@/components/InterventionInput";
import { HeaderBar } from "@/components/HeaderBar";
import { AgentStrip } from "@/components/AgentStrip";
import { ActivityLog } from "@/components/ActivityLog";
import {
  CommandPalette,
  type CommandAction,
} from "@/components/CommandPalette";
import { KeybindingsHelp } from "@/components/KeybindingsHelp";
import { useSession } from "@/lib/client/use-session";
import type { AgentConfig } from "@/lib/client/types";
import type { AgentId } from "@/lib/agents/types";
import { ROLE_SEEDS } from "@/lib/agents/role-seeds";

const initialConfigs: AgentConfig[] = [
  {
    id: "claude",
    enabled: true,
    mode: "api",
    apiKey: "",
    systemPrompt: ROLE_SEEDS.claude,
  },
  {
    id: "codex",
    enabled: true,
    mode: "api",
    apiKey: "",
    systemPrompt: ROLE_SEEDS.codex,
  },
  {
    id: "gemini",
    enabled: false,
    mode: "api",
    apiKey: "",
    systemPrompt: ROLE_SEEDS.gemini,
  },
];

function mergeWithReference(
  systemPrompt: string,
  referenceDoc: string,
): string {
  const ref = referenceDoc.trim();
  if (!ref) return systemPrompt;
  return `${ref}\n\n---\n\n${systemPrompt}`;
}

function isTextEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function focusInterventionInput(): void {
  const el = document.querySelector<HTMLTextAreaElement>(
    'textarea[data-shortcut-target="intervention-input"]',
  );
  el?.focus();
}

function clickStartSessionButton(): void {
  const btn = document.querySelector<HTMLButtonElement>(
    'button[data-shortcut-target="start-session"]',
  );
  btn?.click();
}

function downloadExport(sessionId: string): void {
  window.open(`/api/export?id=${sessionId}`, "_blank");
}

export default function Home() {
  const [configs, setConfigs] = useState<AgentConfig[]>(initialConfigs);
  const [referenceDoc, setReferenceDoc] = useState("");
  const [summarizerId, setSummarizerId] = useState<AgentId | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { view, actions } = useSession();

  const onStart = useCallback(
    async (prompt: string) => {
      const merged = configs.map((c) => ({
        ...c,
        systemPrompt: mergeWithReference(c.systemPrompt, referenceDoc),
      }));
      const enabledIds = merged.filter((c) => c.enabled).map((c) => c.id);
      const effectiveSummarizer =
        summarizerId && enabledIds.includes(summarizerId)
          ? summarizerId
          : undefined;
      try {
        await actions.startSession(merged, prompt, effectiveSummarizer);
      } catch (err) {
        alert(`세션 시작 실패: ${(err as Error).message}`);
      }
    },
    [actions, configs, referenceDoc, summarizerId],
  );

  // 팔레트에 노출할 액션 — status에 따라 enabled 토글.
  const isSetup = view.status === "setup";
  const isLive =
    view.status === "running" ||
    view.status === "idle" ||
    view.status === "paused";
  const isPaused = view.status === "paused";
  const hasSession = !!view.sessionId;

  const paletteActions: CommandAction[] = [
    {
      id: "start",
      group: "세션",
      label: "세션 시작",
      hint: "현재 좌측 패널 설정으로 시작",
      enabled: isSetup,
      onRun: () => clickStartSessionButton(),
    },
    {
      id: "pause",
      group: "세션",
      label: isPaused ? "재개 (Resume)" : "일시정지 (Pause)",
      hint: "라운드 경계에서 멈춤",
      shortcut: "Space",
      enabled: isLive,
      onRun: () => (isPaused ? actions.resume() : actions.pause()),
    },
    {
      id: "stop",
      group: "세션",
      label: "세션 종료 (Stop)",
      hint: "진행 중 발언 즉시 중단",
      shortcut: "Esc",
      enabled: isLive,
      onRun: () => {
        if (confirm("세션을 즉시 종료할까요? 진행 중 발언이 잘립니다.")) {
          actions.stop();
        }
      },
    },
    {
      id: "export",
      group: "산출물",
      label: "Markdown 다운로드 (Export)",
      hint: hasSession ? "transcript + 최종 산출물" : "세션 시작 후 활성화",
      enabled: hasSession,
      onRun: () => view.sessionId && downloadExport(view.sessionId),
    },
    ...(["claude", "codex", "gemini"] as AgentId[]).map<CommandAction>(
      (id) => ({
        id: `summarizer-${id}`,
        group: "요약 담당",
        label: `${id === "claude" ? "Claude" : id === "codex" ? "Codex" : "Gemini"}로 요약 담당 ${summarizerId === id ? "끄기" : "설정"}`,
        hint: summarizerId === id ? "현재 선택됨" : undefined,
        enabled:
          isSetup &&
          configs.some(
            (c) =>
              c.id === id &&
              c.enabled &&
              c.mode === "api" &&
              c.apiKey.trim().length > 0,
          ),
        onRun: () => setSummarizerId(summarizerId === id ? null : id),
      }),
    ),
    {
      id: "help",
      group: "도움말",
      label: "키보드 단축키 보기",
      shortcut: "?",
      onRun: () => setHelpOpen(true),
    },
    {
      id: "focus-input",
      group: "입력",
      label: "입력창에 포커스",
      shortcut: "/",
      enabled: isLive,
      onRun: () => focusInterventionInput(),
    },
  ];

  // 글로벌 단축키 — input/textarea focus 시 일부 키는 양보.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditable = isTextEditable(e.target);

      // ⌘K / Ctrl+K — 어디서든 팔레트.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      // 모달 열린 상태에서는 ESC만 처리, 나머지는 모달이 가져감.
      if (paletteOpen || helpOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPaletteOpen(false);
          setHelpOpen(false);
        }
        return;
      }

      if (inEditable) return; // 텍스트 입력 중엔 전역 키 양보.

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === " ") {
        if (isLive) {
          e.preventDefault();
          isPaused ? actions.resume() : actions.pause();
        }
        return;
      }
      if (e.key === "Escape") {
        if (isLive) {
          e.preventDefault();
          if (confirm("세션을 즉시 종료할까요? 진행 중 발언이 잘립니다.")) {
            actions.stop();
          }
        }
        return;
      }
      if (e.key === "/") {
        if (isLive) {
          e.preventDefault();
          focusInterventionInput();
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, helpOpen, isLive, isPaused, paletteOpen]);

  return (
    <div className="flex h-dvh w-full flex-row bg-zinc-950 text-zinc-100">
      <LeftPanel
        configs={configs}
        setConfigs={setConfigs}
        referenceDoc={referenceDoc}
        setReferenceDoc={setReferenceDoc}
        summarizerId={summarizerId}
        setSummarizerId={setSummarizerId}
        view={view}
        onStart={onStart}
        onSetSystemPrompt={(id: AgentId, prompt: string) =>
          actions.setSystemPrompt(id, mergeWithReference(prompt, referenceDoc))
        }
        onPause={actions.pause}
        onResume={actions.resume}
        onStop={actions.stop}
        onReset={actions.reset}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <HeaderBar view={view} onOpenPalette={() => setPaletteOpen(true)} />
        <AgentStrip view={view} configs={configs} />
        <ChatView view={view} />
        <InterventionInput
          view={view}
          onSend={actions.intervene}
          onPause={actions.pause}
          onResume={actions.resume}
          onStop={actions.stop}
        />
      </main>
      <ActivityLog view={view} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
      <KeybindingsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
