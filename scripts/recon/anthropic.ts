/* M0 정찰 — Anthropic SDK messages.stream
 * 실행: npx tsx scripts/recon/anthropic.ts
 * 환경: ANTHROPIC_API_KEY 필수, 없으면 SKIPPED 출력.
 */
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "SKIPPED: ANTHROPIC_API_KEY 미설정 — CLI 모드로 대체 검증 필요",
    );
    return;
  }

  const client = new Anthropic();
  const model = "claude-opus-4-7"; // M3 권장 기본값

  console.log(`[anthropic] model=${model}`);
  console.time("[anthropic] elapsed");

  const stream = client.messages.stream({
    model,
    max_tokens: 100,
    messages: [{ role: "user", content: "Say hello in 5 words." }],
  });

  let firstTokenAt: number | null = null;
  const startedAt = Date.now();

  stream.on("text", (delta) => {
    if (firstTokenAt === null) firstTokenAt = Date.now() - startedAt;
    process.stdout.write(delta);
  });

  const final = await stream.finalMessage();
  console.log("\n[anthropic] firstTokenMs=", firstTokenAt);
  console.log("[anthropic] usage=", JSON.stringify(final.usage));
  console.log("[anthropic] stopReason=", final.stop_reason);
  console.timeEnd("[anthropic] elapsed");
}

main().catch((err) => {
  console.error("[anthropic] ERROR:", err?.message ?? err);
  process.exit(1);
});
