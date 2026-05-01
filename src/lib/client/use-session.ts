/* useSession — 세션 시작·SSE 구독·서버 액션 트리거를 한 hook으로. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivityEntry,
  AgentConfig,
  AgentRuntimeStats,
  ChatMessage,
  InterveneMode,
  OrchestratorEvent,
  SessionView,
} from "./types";
import type { AgentId } from "@/lib/agents/types";
import { friendlyError } from "./friendly-error";

const ACTIVITY_LOG_CAP = 30;

const AGENT_LABEL: Record<AgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

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
  agents: [],
  sessionStartTs: null,
  agentStats: {},
  activityLog: [],
  finalArtifact: null,
  summaryError: null,
  limits: null,
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
        "final_artifact",
        "summary_error",
      ];
      for (const t of TYPES) es.addEventListener(t, handler);
      es.onerror = () => {
        // 재연결 default를 차단한다. 재연결 시 stream/route.ts가 eventLog
        // 전체를 replay하는데 클라 reducer는 since 토큰 없이 token 이벤트를
        // 그대로 재누적해 본문이 두 배가 된다. 시연 시간 박스(5분)에선
        // 끊기는 일이 거의 없고, 끊긴 뒤 무리하게 이어붙이는 것보다 명시
        // 종료가 깔끔. 새 세션은 페이지 새로고침으로 시작.
        es.close();
        if (esRef.current === es) esRef.current = null;
      };
    },
    [applyEvent],
  );

  const startSession = useCallback(
    async (
      configs: AgentConfig[],
      userPrompt: string,
      summarizerId?: AgentId,
      limits?: {
        maxTurns?: number;
        maxSessionTokens?: number;
        maxSessionDurationMs?: number;
      },
    ) => {
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
          summarizerId,
          limits,
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let msg = raw;
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* JSON 아님 — raw 그대로 */
        }
        throw new Error(msg || `session start failed (HTTP ${res.status})`);
      }
      const { sessionId } = (await res.json()) as { sessionId: string };
      const startTs = Date.now();
      setView({
        ...initialView,
        sessionId,
        status: "running",
        agents: enabled.map((c) => c.id),
        sessionStartTs: startTs,
        messages: [{ id: "u-0", role: "user", text: userPrompt, ts: startTs }],
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
    // 페이지 마운트 시 CLI binary 백그라운드 워밍업 — 사용자가 prompt 작성하는 동안
    // 페이지캐시·모듈 로드 흡수. 실패는 무시.
    fetch("/api/cli-warmup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
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

function appendActivity(
  log: ActivityEntry[],
  entry: ActivityEntry,
): ActivityEntry[] {
  // SSE 자동 재연결 등으로 같은 id가 또 들어오는 케이스 방지.
  if (log.some((e) => e.id === entry.id)) return log;
  // 같은 사유의 에러/경고가 연속해서 들어오면 도배 차단 — 직전 entry와 텍스트가
  // 같은 error/warn 톤이면 skip. 정상 발화·system 톤이 사이에 끼면 reset됨.
  const last = log[log.length - 1];
  if (
    last &&
    (entry.tone === "error" || entry.tone === "warn") &&
    last.tone === entry.tone &&
    last.text === entry.text
  ) {
    return log;
  }
  const next = [...log, entry];
  return next.length > ACTIVITY_LOG_CAP
    ? next.slice(next.length - ACTIVITY_LOG_CAP)
    : next;
}

function activityFromEvent(e: OrchestratorEvent): ActivityEntry | null {
  switch (e.type) {
    case "session_start":
      return {
        id: `act-${e.ts}-start`,
        ts: e.ts,
        tone: "system",
        text: `세션 시작 — agents: ${e.agents.map((a) => AGENT_LABEL[a.id]).join(", ")}`,
      };
    case "agent_start":
      return {
        id: `act-${e.ts}-${e.agentId}-start`,
        ts: e.ts,
        tone: "info",
        text: `${AGENT_LABEL[e.agentId]} 발언 시작 · 라운드 ${e.turn}${e.model ? ` · ${e.model}` : ""}`,
        jumpTo: { turn: e.turn, agentId: e.agentId },
      };
    case "agent_end":
      return {
        id: `act-${e.ts}-${e.agentId}-end`,
        ts: e.ts,
        tone: e.interrupted ? "warn" : "info",
        text: e.interrupted
          ? `${AGENT_LABEL[e.agentId]} 발언 중단 (interrupted)`
          : `${AGENT_LABEL[e.agentId]} 발언 종료`,
        jumpTo: { turn: e.turn, agentId: e.agentId },
      };
    case "agent_pass":
      return {
        id: `act-${e.ts}-${e.agentId}-pass`,
        ts: e.ts,
        tone: "pass",
        text: `${AGENT_LABEL[e.agentId]} PASS · turn ${e.turn}`,
        jumpTo: { turn: e.turn, agentId: e.agentId },
      };
    case "agent_timeout":
      return {
        id: `act-${e.ts}-${e.agentId}-to`,
        ts: e.ts,
        tone: "warn",
        text: `${AGENT_LABEL[e.agentId]} timeout ${e.timeoutMs / 1000}s`,
        jumpTo: { turn: e.turn, agentId: e.agentId },
      };
    case "agent_error": {
      const fe = friendlyError(e.message);
      return {
        id: `act-${e.ts}-${e.agentId}-err`,
        ts: e.ts,
        tone: "error",
        text: `${AGENT_LABEL[e.agentId]} ${fe.title}${fe.hint ? ` — ${fe.hint}` : ""}`,
        jumpTo: { turn: e.turn, agentId: e.agentId },
      };
    }
    case "user_message":
      return {
        id: `act-${e.ts}-user`,
        ts: e.ts,
        tone: "system",
        text: `사용자 ${e.mode === "interrupt" ? "인터럽트" : "큐"}: ${e.text.slice(0, 60)}`,
      };
    case "system_prompt_change":
      return {
        id: `act-${e.ts}-${e.agentId}-prompt`,
        ts: e.ts,
        tone: "system",
        text: `${AGENT_LABEL[e.agentId]} 시스템 프롬프트 핫스왑`,
      };
    case "status":
      return {
        id: `act-${e.ts}-status`,
        ts: e.ts,
        tone: "system",
        text: `상태 → ${e.value}`,
      };
    case "usage":
      return {
        id: `act-${e.ts}-${e.agentId}-usage`,
        ts: e.ts,
        tone: "info",
        text: `${AGENT_LABEL[e.agentId]} usage ${e.inputTokens}↓ ${e.outputTokens}↑ (총 ${e.sessionTotal})`,
      };
    case "session_end":
      return {
        id: `act-${e.ts}-end`,
        ts: e.ts,
        tone: "system",
        text: `세션 종료 — ${e.reason}`,
      };
    case "final_artifact":
      return {
        id: `act-${e.ts}-final`,
        ts: e.ts,
        tone: "system",
        text: `${AGENT_LABEL[e.summarizerId]} 최종 산출물 생성`,
      };
    case "summary_error":
      return {
        id: `act-${e.ts}-summary-err`,
        ts: e.ts,
        tone: "warn",
        text: `요약 실패 (${e.stage}) — ${e.message}`,
      };
    default:
      return null;
  }
}

function reduce(prev: SessionView, e: OrchestratorEvent): SessionView {
  const next = applyEvent(prev, e);
  const entry = activityFromEvent(e);
  if (!entry) return next;
  return { ...next, activityLog: appendActivity(next.activityLog, entry) };
}

function applyEvent(prev: SessionView, e: OrchestratorEvent): SessionView {
  switch (e.type) {
    case "session_start":
      return {
        ...prev,
        sessionId: e.sessionId,
        status: "running",
        agents: e.agents.map((a) => a.id),
        sessionStartTs: e.ts,
        limits: e.limits,
      };
    case "status":
      return { ...prev, status: e.value };
    case "user_message": {
      const msg: ChatMessage = {
        id: `u-${e.ts}`,
        role: "user",
        text: e.text,
        ts: e.ts,
        mode: e.mode,
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
          model: e.model,
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
    case "final_artifact":
      return {
        ...prev,
        finalArtifact: {
          text: e.text,
          summarizerId: e.summarizerId,
          ts: e.ts,
        },
        summaryError: null,
      };
    case "summary_error":
      return {
        ...prev,
        summaryError: { stage: e.stage, message: e.message, ts: e.ts },
      };
    case "system_prompt_change":
      return prev;
    default:
      return prev;
  }
}
