/* Transcript → Markdown 변환 (Export 버튼). */
import type { Transcript } from "./transcript";
import type { OrchestratorEvent } from "./session-store";

const ROLE_LABEL: Record<string, string> = {
  user: "👤 You",
  claude: "🟦 Claude",
  codex: "🟧 Codex",
  gemini: "🟪 Gemini",
};

const SUMMARIZER_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

export function transcriptToMarkdown(
  transcript: Transcript,
  sessionId: string,
  eventLog?: OrchestratorEvent[],
): string {
  const events = transcript.snapshot();
  const lines: string[] = [
    `# Agora Session — ${sessionId}`,
    "",
    `_export ts: ${new Date().toISOString()}_`,
    "",
    "---",
    "",
  ];
  for (const e of events) {
    const label = ROLE_LABEL[e.role] ?? e.role;
    const ts = new Date(e.ts).toISOString();
    const turn = "turn" in e ? ` · turn ${e.turn}` : "";
    lines.push(`## ${label}${turn}`);
    lines.push("");
    lines.push(`> ${ts}`);
    lines.push("");
    lines.push(e.text);
    lines.push("");
  }

  // 최종 산출물 — 가장 최근 final_artifact 이벤트 1개를 transcript 뒤에 append.
  const final = eventLog
    ?.filter(
      (ev): ev is Extract<OrchestratorEvent, { type: "final_artifact" }> =>
        ev.type === "final_artifact",
    )
    .slice(-1)[0];
  if (final) {
    lines.push("---");
    lines.push("");
    lines.push(
      `# 📦 최종 산출물 — ${SUMMARIZER_LABEL[final.summarizerId] ?? final.summarizerId} 정리`,
    );
    lines.push("");
    lines.push(`_${new Date(final.ts).toISOString()}_`);
    lines.push("");
    lines.push(final.text);
    lines.push("");
  }

  return lines.join("\n");
}
