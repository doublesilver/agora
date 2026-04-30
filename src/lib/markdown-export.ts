/* Transcript → Markdown 변환 (Export 버튼). */
import type { Transcript } from "./transcript";

const ROLE_LABEL: Record<string, string> = {
  user: "👤 You",
  claude: "🟦 Claude",
  codex: "🟧 Codex",
  gemini: "🟪 Gemini",
};

export function transcriptToMarkdown(
  transcript: Transcript,
  sessionId: string,
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
  return lines.join("\n");
}
