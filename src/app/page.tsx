/* Agora 메인 페이지 — 좌측 패널 + 상단 헤더 + 채팅 + 입력. */
"use client";

import { useState } from "react";
import { LeftPanel } from "@/components/LeftPanel";
import { ChatView } from "@/components/ChatView";
import { InterventionInput } from "@/components/InterventionInput";
import { HeaderBar } from "@/components/HeaderBar";
import { AgentStrip } from "@/components/AgentStrip";
import { useSession } from "@/lib/client/use-session";
import type { AgentConfig } from "@/lib/client/types";
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

export default function Home() {
  const [configs, setConfigs] = useState<AgentConfig[]>(initialConfigs);
  const { view, actions } = useSession();

  return (
    <div className="flex h-dvh w-full flex-row bg-zinc-900 text-zinc-100">
      <LeftPanel
        configs={configs}
        setConfigs={setConfigs}
        view={view}
        onStart={async (prompt) => {
          try {
            await actions.startSession(configs, prompt);
          } catch (err) {
            alert(`세션 시작 실패: ${(err as Error).message}`);
          }
        }}
        onSetSystemPrompt={actions.setSystemPrompt}
        onPause={actions.pause}
        onResume={actions.resume}
        onStop={actions.stop}
        onReset={actions.reset}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <HeaderBar view={view} />
        <AgentStrip view={view} configs={configs} />
        <ChatView view={view} />
        <InterventionInput view={view} onSend={actions.intervene} />
      </main>
    </div>
  );
}
