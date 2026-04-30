/* CLI 어댑터 3개 직접 호출 — 각 speak() → 토큰 + usage 출력. */
import { createClaudeCliAdapter } from "../src/lib/agents/claude-cli";
import { createCodexCliAdapter } from "../src/lib/agents/codex-cli";
import { createGeminiCliAdapter } from "../src/lib/agents/gemini-cli";
import type { AgentAdapter, TranscriptEvent } from "../src/lib/agents/types";

async function exercise(label: string, adapter: AgentAdapter) {
  console.log(`\n=== ${label} ===`);
  const transcript: TranscriptEvent[] = [
    { role: "user", text: "say hello in 5 words", ts: Date.now() },
  ];
  const ac = new AbortController();
  const t0 = Date.now();
  try {
    const result = await adapter.speak({
      transcript,
      systemPrompt: "You are concise.",
      signal: ac.signal,
    });
    if (result.kind === "pass") {
      console.log("PASS");
      return;
    }
    process.stdout.write("[stream] ");
    let chars = 0;
    for await (const chunk of result.stream) {
      process.stdout.write(chunk);
      chars += chunk.length;
    }
    console.log();
    if (result.usage) {
      const u = await result.usage();
      console.log(
        `[${label}] usage=`,
        u,
        `chars=${chars} elapsed=${Date.now() - t0}ms`,
      );
    }
  } catch (err) {
    console.log(`[${label}] ERROR:`, (err as Error).message ?? err);
  }
}

async function main() {
  await exercise("claude-cli", createClaudeCliAdapter());
  await exercise("codex-cli", createCodexCliAdapter());
  await exercise("gemini-cli", createGeminiCliAdapter());
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
