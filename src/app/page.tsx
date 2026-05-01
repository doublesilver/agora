/* Agora 메인 페이지 — 좌측 패널 + 상단 헤더 + 채팅 + 입력. */
"use client";

import { useState } from "react";
import { LeftPanel } from "@/components/LeftPanel";
import { ChatView } from "@/components/ChatView";
import { InterventionInput } from "@/components/InterventionInput";
import { HeaderBar } from "@/components/HeaderBar";
import { AgentStrip } from "@/components/AgentStrip";
import { ActivityLog } from "@/components/ActivityLog";
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

export default function Home() {
  const [configs, setConfigs] = useState<AgentConfig[]>(initialConfigs);
  const [referenceDoc, setReferenceDoc] = useState("");
  const [summarizerId, setSummarizerId] = useState<AgentId | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const { view, actions } = useSession();

  return (
    <div className="flex h-dvh w-full flex-row bg-zinc-950 text-zinc-100">
      {errorBanner && (
        <div
          role="alert"
          className="fixed left-1/2 top-4 z-[80] flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-lg border border-red-700 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur"
        >
          <span className="mt-0.5 text-base">⚠️</span>
          <div className="flex-1">
            <div className="font-semibold">세션 시작 실패</div>
            <p className="mt-1 break-words text-xs leading-relaxed text-red-200">
              {errorBanner}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            aria-label="닫기"
            className="rounded px-2 py-0.5 text-red-300 transition-colors hover:bg-red-900 hover:text-red-50"
          >
            ✕
          </button>
        </div>
      )}
      <LeftPanel
        configs={configs}
        setConfigs={setConfigs}
        referenceDoc={referenceDoc}
        setReferenceDoc={setReferenceDoc}
        summarizerId={summarizerId}
        setSummarizerId={setSummarizerId}
        view={view}
        onStart={async (prompt) => {
          setErrorBanner(null);
          const merged = configs.map((c) => ({
            ...c,
            systemPrompt: mergeWithReference(c.systemPrompt, referenceDoc),
          }));
          const enabled = merged.filter((c) => c.enabled);
          const enabledIds = enabled.map((c) => c.id);
          // 사용자가 명시 선택했으면 그대로, 아니면 자동 fallback —
          // 결과(final_artifact)는 사용자가 토론을 한 핵심 이유라
          // 미지정/끄기 상태에서도 산출물이 따라오게 한다. 우선순위는 API+키
          // (가장 빠르고 안정), 그 다음 CLI(설치 가정).
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
            await actions.startSession(merged, prompt, effectiveSummarizer);
          } catch (err) {
            setErrorBanner((err as Error)?.message ?? "알 수 없는 오류입니다.");
          }
        }}
        onSetSystemPrompt={(id: AgentId, prompt: string) =>
          actions.setSystemPrompt(id, mergeWithReference(prompt, referenceDoc))
        }
        onPause={actions.pause}
        onResume={actions.resume}
        onStop={actions.stop}
        onReset={actions.reset}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <HeaderBar view={view} />
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
    </div>
  );
}
