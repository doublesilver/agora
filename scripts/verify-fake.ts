/* Fake 어댑터 검증 — 토큰 스트림 + PASS 분기 + AbortSignal 동작.
 * 실행: npx tsx scripts/verify-fake.ts
 */
import { createFakeAdapter } from "../src/lib/agents/fake";
import type { TranscriptEvent } from "../src/lib/agents/types";

async function run(label: string, passProb: number, abortAfterMs?: number) {
  const adapter = createFakeAdapter("claude", {
    passProbability: passProb,
    tokenDelayMs: 30,
  });
  const transcript: TranscriptEvent[] = [
    {
      role: "user",
      text: "design a survival game energy system",
      ts: Date.now(),
    },
  ];
  const ac = new AbortController();
  if (abortAfterMs !== undefined)
    setTimeout(() => ac.abort("test-abort"), abortAfterMs);

  const result = await adapter.speak({
    transcript,
    systemPrompt: "test",
    signal: ac.signal,
  });
  if (result.kind === "pass") {
    console.log(`[${label}] PASS`);
    return;
  }
  process.stdout.write(`[${label}] speaking: `);
  try {
    for await (const tok of result.stream) process.stdout.write(tok);
    console.log();
    if (result.usage) {
      const u = await result.usage();
      console.log(`[${label}] usage=`, u);
    }
  } catch (err) {
    console.log(`\n[${label}] ABORTED: ${(err as Error).message ?? err}`);
  }
}

async function main() {
  await run("forced-speak", 0);
  await run("forced-pass", 1);
  await run("aborted-mid-stream", 0, 80);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
