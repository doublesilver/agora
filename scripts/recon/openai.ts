/* M0 정찰 — OpenAI SDK chat.completions.stream
 * 실행: npx tsx scripts/recon/openai.ts
 * 환경: OPENAI_API_KEY 필수, 없으면 SKIPPED.
 */
import OpenAI from "openai";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("SKIPPED: OPENAI_API_KEY 미설정 — Codex CLI로 대체 검증 필요");
    return;
  }

  const client = new OpenAI();
  const model = "gpt-5"; // M0에서 사용 가능 모델 확인 필요

  console.log(`[openai] model=${model}`);
  console.time("[openai] elapsed");

  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let usage: unknown = null;

  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: "Say hello in 5 words." }],
    max_completion_tokens: 100,
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      if (firstTokenAt === null) firstTokenAt = Date.now() - startedAt;
      process.stdout.write(delta);
    }
    if (chunk.usage) usage = chunk.usage;
  }

  console.log("\n[openai] firstTokenMs=", firstTokenAt);
  console.log("[openai] usage=", JSON.stringify(usage));
  console.timeEnd("[openai] elapsed");
}

main().catch((err) => {
  console.error("[openai] ERROR:", err?.message ?? err);
  process.exit(1);
});
