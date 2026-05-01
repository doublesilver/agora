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
  const { view, actions } = useSession();

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
        onStart={async (prompt) => {
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
