/* Agora 메인 페이지 — 좌측 패널 + 상단 헤더 + 채팅 + 입력 + ⚙ SettingsModal. */
"use client";

import { useState } from "react";
import { LeftPanel } from "@/components/LeftPanel";
import { ChatView } from "@/components/ChatView";
import { InterventionInput } from "@/components/InterventionInput";
import { HeaderBar } from "@/components/HeaderBar";
import { AgentStrip } from "@/components/AgentStrip";
import { ActivityLog } from "@/components/ActivityLog";
import {
  SettingsModal,
  useAppearance,
  useLimits,
} from "@/components/SettingsModal";
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
    enabled: true,
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

export default function Home() {
  const [configs, setConfigs] = useState<AgentConfig[]>(initialConfigs);
  const [referenceDoc, setReferenceDoc] = useState("");
  const [summarizerId, setSummarizerId] = useState<AgentId | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearance, setAppearance] = useAppearance();
  const [limits, setLimits] = useLimits();
  const { view, actions } = useSession();

  return (
    <div className="flex h-dvh w-full flex-row bg-paper text-ink">
      {errorBanner && (
        <div
          role="alert"
          className="fixed left-1/2 top-4 z-[80] flex max-w-xl -translate-x-1/2 items-start gap-3 border-2 border-ink bg-ink px-4 py-3 font-mono text-[11px] text-paper shadow-[8px_8px_0_0_var(--highlight)]"
        >
          <span className="mt-0.5">‖</span>
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em]">
              SESSION START FAILED
            </div>
            <p className="mt-1 break-words text-[11px] leading-relaxed text-paper2">
              // {errorBanner}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            aria-label="닫기"
            className="border border-paper px-2 text-paper hover:bg-paper hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}
      <LeftPanel
        configs={configs}
        view={view}
        summarizerId={summarizerId}
        onStart={async (prompt) => {
          setErrorBanner(null);
          const merged = configs.map((c) => ({
            ...c,
            systemPrompt: mergeWithReference(c.systemPrompt, referenceDoc),
          }));
          const enabled = merged.filter((c) => c.enabled);
          const enabledIds = enabled.map((c) => c.id);
          const explicit =
            summarizerId && enabledIds.includes(summarizerId)
              ? summarizerId
              : null;
          const apiFallback = enabled.find(
            (c) => c.mode === "api" && c.apiKey.trim().length > 0,
          );
          const cliFallback = enabled.find((c) => c.mode === "cli");
          const effectiveSummarizer =
            explicit ?? apiFallback?.id ?? cliFallback?.id ?? undefined;
          try {
            await actions.startSession(
              merged,
              prompt,
              effectiveSummarizer,
              limits,
            );
          } catch (err) {
            setErrorBanner((err as Error)?.message ?? "알 수 없는 오류입니다.");
          }
        }}
        onPause={actions.pause}
        onResume={actions.resume}
        onStop={actions.stop}
        onReset={actions.reset}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <HeaderBar view={view} />
        <AgentStrip view={view} configs={configs} />
        <ChatView
          view={view}
          density={appearance.density}
          autoFold={appearance.autoFold}
        />
        {appearance.showInput ? (
          <InterventionInput
            view={view}
            onSend={actions.intervene}
            onPause={actions.pause}
            onResume={actions.resume}
            onStop={actions.stop}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAppearance({ ...appearance, showInput: true })}
            className="hidden shrink-0 items-center justify-center gap-2 border-t-2 border-ink bg-paper py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink2 transition-colors hover:bg-ink hover:text-paper md:flex"
            title="발화 입력창 다시 활성화"
          >
            <span>⌃</span>
            <span>UNFOLD INPUT</span>
          </button>
        )}
        <div
          role="note"
          className="shrink-0 border-t-2 border-ink bg-paper2 px-3 py-3 text-center font-mono text-[11px] leading-relaxed text-ink2 md:hidden"
        >
          📱 데스크탑(≥768px) 전용 인터랙션 — 모바일에서는 토론을 <strong>읽기 전용</strong>으로만 표시합니다.
        </div>
      </main>
      <ActivityLog view={view} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        view={view}
        configs={configs}
        setConfigs={setConfigs}
        referenceDoc={referenceDoc}
        setReferenceDoc={setReferenceDoc}
        summarizerId={summarizerId}
        setSummarizerId={setSummarizerId}
        appearance={appearance}
        setAppearance={setAppearance}
        limits={limits}
        setLimits={setLimits}
        onSetSystemPrompt={(id, prompt) =>
          actions.setSystemPrompt(id, mergeWithReference(prompt, referenceDoc))
        }
      />
    </div>
  );
}
