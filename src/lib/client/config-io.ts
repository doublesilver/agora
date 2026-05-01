/* 좌패널 설정 내보내기/가져오기. JSON 단일 파일 포맷.
 * apiKey는 보안상 export·import 모두 제외. */
import type { AgentConfig } from "./types";
import type { AgentMode } from "@/lib/agents/types";

interface ExportPayload {
  version: 1;
  exportedAt: string;
  configs: Array<Omit<AgentConfig, "apiKey">>;
  referenceDoc: string;
}

export function exportConfig(
  configs: AgentConfig[],
  referenceDoc: string,
): void {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    configs: configs.map((c) => ({
      id: c.id,
      enabled: c.enabled,
      mode: c.mode,
      systemPrompt: c.systemPrompt,
    })),
    referenceDoc,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `agora-config-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  configs: AgentConfig[];
  referenceDoc?: string;
}

export function importConfig(
  jsonText: string,
  current: AgentConfig[],
): ImportResult {
  const parsed = JSON.parse(jsonText) as {
    configs?: Array<{
      id?: string;
      enabled?: boolean;
      mode?: string;
      systemPrompt?: string;
    }>;
    referenceDoc?: unknown;
  };
  if (!Array.isArray(parsed.configs)) {
    throw new Error("configs 배열이 없습니다.");
  }
  const merged: AgentConfig[] = current.map((c) => {
    const incoming = parsed.configs?.find((x) => x.id === c.id);
    if (!incoming) return c;
    const mode: AgentMode = incoming.mode === "cli" ? "cli" : "api";
    return {
      ...c,
      enabled:
        typeof incoming.enabled === "boolean" ? incoming.enabled : c.enabled,
      mode,
      systemPrompt:
        typeof incoming.systemPrompt === "string"
          ? incoming.systemPrompt
          : c.systemPrompt,
      // apiKey는 가져오지 않음 (보안 정책 — AGENTS.md A2)
    };
  });
  const referenceDoc =
    typeof parsed.referenceDoc === "string" ? parsed.referenceDoc : undefined;
  return { configs: merged, referenceDoc };
}
