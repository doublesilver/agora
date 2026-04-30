/* Claude CLI 어댑터 직접 호출 — speak() → 토큰 스트림 + usage. */
import { createClaudeCliAdapter } from "../src/lib/agents/claude-cli";
import type { TranscriptEvent } from "../src/lib/agents/types";

async function main() {
  const adapter = createClaudeCliAdapter();
  const transcript: TranscriptEvent[] = [
    { role: "user", text: "say hello in 5 words", ts: Date.now() },
  ];
  const result = await adapter.speak({
    transcript,
    systemPrompt: "You are a concise assistant.",
    signal: new AbortController().signal,
  });

  if (result.kind === "pass") {
    console.log("PASS");
    return;
  }
  process.stdout.write("[stream] ");
  for await (const chunk of result.stream) {
    process.stdout.write(chunk);
  }
  console.log();
  if (result.usage) {
    const u = await result.usage();
    console.log("[usage]", u);
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
