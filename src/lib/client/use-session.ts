/* useSession — 세션 시작·SSE 구독·서버 액션 트리거를 한 hook으로. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentConfig,
  AgentRuntimeStats,
  ChatMessage,
  InterveneMode,
  OrchestratorEvent,
  SessionView,
} from "./types";
import type { AgentId } from "@/lib/agents/types";

const initialView: SessionView = {
  sessionId: null,
  status: "setup",
  turn: 0,
  sessionTokens: 0,
  messages: [],
  passedRecent: {},
  errorRecent: null,
  endReason: null,
  activeSpeaker: null,
  agentStats: {},
};

function blankStats(): AgentRuntimeStats {
  return {
    phase: "idle",
    lastTurn: null,
    inputTokens: 0,
    outputTokens: 0,
    startedAt: null,
    firstTokenAt: null,
    endedAt: null,
  };
}

export function useSession() {
  const [view, setView] = useState<SessionView>(initialView);
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setView(initialView);
  }, []);

  const applyEvent = useCallback((e: OrchestratorEvent) => {
    setView((prev) => reduce(prev, e));
  }, []);

  const subscribe = useCallback(
    (sessionId: string) => {
      if (esRef.current) esRef.current.close();
      const es = new EventSource(`/api/stream?sessionId=${sessionId}`);
      esRef.current = es;
      const handler = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as OrchestratorEvent;
          applyEvent(parsed);
        } catch (err) {
          console.error("[stream] bad event", err, ev.data);
        }
      };
      // SSE는 named event로 보내므로 모든 type에 listener 부착.
      const TYPES: OrchestratorEvent["type"][] = [
        "session_start",
        "agent_start",
        "token",
        "agent_end",
        "agent_pass",
        "agent_timeout",
        "agent_error",
        "user_message",
        "system_prompt_change",
        "status",
        "usage",
        "session_end",
      ];
      for (const t of TYPES) es.addEventListener(t, handler);
      es.onerror = () => {
        // 자동 재연결 default — 명시 처리 불요.
      };
    },
    [applyEvent],
  );

  const startSession = useCallback(
    async (configs: AgentConfig[], userPrompt: string) => {
      const enabled = configs.filter((c) => c.enabled);
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agents: enabled.map((c) => ({
            id: c.id,
            mode: c.mode,
            apiKey: c.apiKey,
          })),
          systemPrompts: Object.fromEntries(
            enabled.map((c) => [c.id, c.systemPrompt]),
          ),
          userPrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`session start failed: ${err}`);
      }
      const { sessionId } = (await res.json()) as { sessionId: string };
      setView({
        ...initialView,
        sessionId,
        status: "running",
        messages: [
          { id: "u-0", role: "user", text: userPrompt, ts: Date.now() },
        ],
      });
      subscribe(sessionId);
      return sessionId;
    },
    [subscribe],
  );

  const intervene = useCallback(
    async (text: string, mode: InterveneMode) => {
      const sid = view.sessionId;
      if (!sid) return;
      await fetch("/api/intervene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, text, mode }),
      });
    },
    [view.sessionId],
  );

  const setSystemPrompt = useCallback(
    async (agentId: AgentId, prompt: string) => {
      const sid = view.sessionId;
      if (!sid) return;
      await fetch("/api/system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, agentId, prompt }),
      });
    },
    [view.sessionId],
  );

  const callSimple = useCallback(
    (path: "pause" | "resume" | "stop") => async () => {
      const sid = view.sessionId;
      if (!sid) return;
      await fetch(`/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
    },
    [view.sessionId],
  );

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  return {
    view,
    actions: {
      reset,
      startSession,
      intervene,
      setSystemPrompt,
      pause: callSimple("pause"),
      resume: callSimple("resume"),
      stop: callSimple("stop"),
    },
  };
}

function patchStats(
  prev: SessionView,
  agentId: AgentId,
  patch: Partial<AgentRuntimeStats>,
): Partial<Record<AgentId, AgentRuntimeStats>> {
  const current = prev.agentStats[agentId] ?? blankStats();
  return { ...prev.agentStats, [agentId]: { ...current, ...patch } };
}

function reduce(prev: SessionView, e: OrchestratorEvent): SessionView {
  switch (e.type) {
    case "session_start":
      return { ...prev, sessionId: e.sessionId, status: "running" };
    case "status":
      return { ...prev, status: e.value };
    case "user_message": {
      const msg: ChatMessage = {
        id: `u-${e.ts}`,
        role: "user",
        text: e.text,
        ts: e.ts,
      };
      return { ...prev, messages: [...prev.messages, msg] };
    }
    case "agent_start": {
      const msg: ChatMessage = {
        id: `${e.agentId}-${e.turn}-${e.ts}`,
        role: e.agentId,
        text: "",
        turn: e.turn,
        ts: e.ts,
        streaming: true,
      };
      return {
        ...prev,
        turn: e.turn,
        messages: [...prev.messages, msg],
        passedRecent: { ...prev.passedRecent, [e.agentId]: undefined },
        activeSpeaker: e.agentId,
        agentStats: patchStats(prev, e.agentId, {
          phase: "thinking",
          lastTurn: e.turn,
          startedAt: e.ts,
          firstTokenAt: null,
          endedAt: null,
        }),
      };
    }
    case "token": {
      const messages = prev.messages.slice();
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === e.agentId && m.streaming) {
          messages[i] = { ...m, text: m.text + e.text };
          break;
        }
      }
      const stats = prev.agentStats[e.agentId];
      const isFirstToken = !stats?.firstTokenAt;
      return {
        ...prev,
        messages,
        agentStats: patchStats(prev, e.agentId, {
          phase: "streaming",
          firstTokenAt: isFirstToken ? e.ts : (stats?.firstTokenAt ?? e.ts),
        }),
      };
    }
    case "agent_end": {
      const messages = prev.messages.slice();
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === e.agentId && m.streaming) {
          messages[i] = {
            ...m,
            text: e.fullText,
            streaming: false,
            interrupted: e.interrupted,
          };
          break;
        }
      }
      return {
        ...prev,
        messages,
        activeSpeaker:
          prev.activeSpeaker === e.agentId ? null : prev.activeSpeaker,
        agentStats: patchStats(prev, e.agentId, {
          phase: "idle",
          endedAt: e.ts,
        }),
      };
    }
    case "agent_pass": {
      return {
        ...prev,
        passedRecent: { ...prev.passedRecent, [e.agentId]: e.turn },
        activeSpeaker:
          prev.activeSpeaker === e.agentId ? null : prev.activeSpeaker,
        agentStats: patchStats(prev, e.agentId, {
          phase: "passed",
          lastTurn: e.turn,
          endedAt: e.ts,
        }),
      };
    }
    case "agent_timeout":
      return {
        ...prev,
        errorRecent: {
          agentId: e.agentId,
          message: `timeout (${e.timeoutMs / 1000}s)`,
          turn: e.turn,
        },
        activeSpeaker:
          prev.activeSpeaker === e.agentId ? null : prev.activeSpeaker,
        agentStats: patchStats(prev, e.agentId, {
          phase: "timeout",
          endedAt: e.ts,
        }),
      };
    case "agent_error":
      return {
        ...prev,
        errorRecent: { agentId: e.agentId, message: e.message, turn: e.turn },
        activeSpeaker:
          prev.activeSpeaker === e.agentId ? null : prev.activeSpeaker,
        agentStats: patchStats(prev, e.agentId, {
          phase: "error",
          endedAt: e.ts,
        }),
      };
    case "usage": {
      const cur = prev.agentStats[e.agentId] ?? blankStats();
      return {
        ...prev,
        sessionTokens: e.sessionTotal,
        agentStats: patchStats(prev, e.agentId, {
          inputTokens: cur.inputTokens + e.inputTokens,
          outputTokens: cur.outputTokens + e.outputTokens,
        }),
      };
    }
    case "session_end":
      return {
        ...prev,
        status: "stopped",
        endReason: e.reason,
        activeSpeaker: null,
      };
    case "system_prompt_change":
      return prev;
    default:
      return prev;
  }
}
