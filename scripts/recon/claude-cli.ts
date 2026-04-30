/* M0 정찰 — Claude Code CLI 비대화형 호출 + stream-json
 * 실행: npx tsx scripts/recon/claude-cli.ts
 * 환경: PATH에 claude 필요. 인증된 Claude Code 구독.
 *
 * 검증 항목:
 *   - 비대화형 호출 시그니처
 *   - stream-json 출력 라인 경계 보장 여부 (R7 폴백 결정)
 *   - usage / 모델 정보 추출 위치
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

async function main() {
  console.log(
    "[claude-cli] cmd=claude -p 'Say hello in 5 words.' --output-format stream-json --verbose",
  );
  console.time("[claude-cli] elapsed");

  const child = spawn("claude", [
    "-p",
    "Say hello in 5 words.",
    "--output-format",
    "stream-json",
    "--verbose",
  ]);

  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let lineCount = 0;
  let lastLine = "";
  let chunkCount = 0;
  let chunkBoundaryClean = true;

  child.stdout.on("data", (chunk: Buffer) => {
    chunkCount++;
    const str = chunk.toString();
    if (!str.endsWith("\n") && chunkBoundaryClean) chunkBoundaryClean = false;
  });

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    lineCount++;
    lastLine = line;
    if (firstTokenAt === null) firstTokenAt = Date.now() - startedAt;
    if (lineCount <= 3)
      console.log(`[claude-cli] line#${lineCount}: ${line.slice(0, 120)}`);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[claude-cli stderr] ${chunk}`);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });

  console.log("\n[claude-cli] firstLineMs=", firstTokenAt);
  console.log("[claude-cli] totalLines=", lineCount);
  console.log("[claude-cli] chunkCount=", chunkCount);
  console.log(
    "[claude-cli] chunkBoundaryClean=",
    chunkBoundaryClean,
    "(false면 readline 폴백 필요 — R7)",
  );
  console.log("[claude-cli] exitCode=", exitCode);
  if (lastLine) console.log("[claude-cli] lastLine=", lastLine.slice(0, 200));
  console.timeEnd("[claude-cli] elapsed");
}

main().catch((err) => {
  console.error("[claude-cli] ERROR:", err?.message ?? err);
  process.exit(1);
});
