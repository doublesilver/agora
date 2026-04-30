/* M0 정찰 — Google Gen AI generateContentStream
 * 실행: npx tsx scripts/recon/gemini.ts
 * 환경: GEMINI_API_KEY 또는 GOOGLE_API_KEY 필수, 없으면 SKIPPED.
 */
import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log(
      "SKIPPED: GEMINI_API_KEY/GOOGLE_API_KEY 미설정 — Gemini CLI로 대체 검증 필요",
    );
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-pro"; // M3 권장 기본값

  console.log(`[gemini] model=${model}`);
  console.time("[gemini] elapsed");

  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let usage: unknown = null;

  const stream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: "Say hello in 5 words." }] }],
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      if (firstTokenAt === null) firstTokenAt = Date.now() - startedAt;
      process.stdout.write(text);
    }
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  }

  console.log("\n[gemini] firstTokenMs=", firstTokenAt);
  console.log("[gemini] usage=", JSON.stringify(usage));
  console.timeEnd("[gemini] elapsed");
}

main().catch((err) => {
  console.error("[gemini] ERROR:", err?.message ?? err);
  process.exit(1);
});
