/* Claude CLI 어댑터 — child_process spawn + stream-json 라인 파싱.
 * M0 정찰 결과: 라인 경계 깨끗(R7 폴백 불필요), 다수의 system hook 라인 + 1개 이상 assistant + 마지막 result.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";

interface ClaudeCliOptions {
  command?: string; // 기본 'claude'
}

function extractAssistantText(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const ev = event as { type?: string; message?: { content?: unknown[] } };
  if (ev.type !== "assistant") return "";
  const content = ev.message?.content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type: string }).type === "text"
    ) {
      out += (part as { text?: string }).text ?? "";
    }
  }
  return out;
}

export function createClaudeCliAdapter(
  opts: ClaudeCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? "claude";

  return {
    id: "claude",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("claude", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const child = spawn(
        command,
        ["-p", fullPrompt, "--output-format", "stream-json", "--verbose"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      // AbortSignal → SIGTERM
      const onAbort = () => {
        if (!child.killed) child.kill("SIGTERM");
      };
      input.signal.addEventListener("abort", onAbort, { once: true });

      let cumulativeText = "";
      let finalResult: string | null = null;
      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
      let stderrTail = "";
      child.stderr.on("data", (buf: Buffer) => {
        stderrTail += buf.toString();
        if (stderrTail.length > 2000) stderrTail = stderrTail.slice(-2000);
      });

      const rl = createInterface({ input: child.stdout });

      // 라인 → 큐 → async iterator
      const queue: string[] = [];
      const waiters: Array<(v: IteratorResult<string>) => void> = [];
      let done = false;
      let error: unknown = null;

      const push = (chunk: string) => {
        if (waiters.length > 0) waiters.shift()!({ value: chunk, done: false });
        else queue.push(chunk);
      };
      const finish = () => {
        done = true;
        while (waiters.length > 0)
          waiters.shift()!({ value: "" as string, done: true });
      };

      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const ev = JSON.parse(line);
          if (ev?.type === "assistant") {
            const text = extractAssistantText(ev);
            if (text) {
              const delta = text.slice(cumulativeText.length);
              cumulativeText = text;
              if (delta) push(delta);
            }
          } else if (ev?.type === "result") {
            finalResult = typeof ev.result === "string" ? ev.result : null;
            const u = ev.usage;
            if (u) {
              usage = {
                inputTokens: (u.input_tokens ?? 0) as number,
                outputTokens: (u.output_tokens ?? 0) as number,
              };
            }
          }
        } catch {
          // 비-JSON 라인은 무시.
        }
      });

      child.on("error", (err) => {
        error = err;
        finish();
      });
      child.on("exit", (code, signal) => {
        // assistant 청크가 없었지만 result만 도착한 경우 finalResult를 한 번에 emit
        if (cumulativeText.length === 0 && finalResult) {
          push(finalResult);
        }
        if (code !== 0 && signal !== "SIGTERM" && !error) {
          error = new Error(
            `claude CLI exited code=${code} signal=${signal} stderr=${stderrTail.slice(-200)}`,
          );
        }
        // CLI usage 미보고 시 글자수/4 추정 폴백
        if (usage.outputTokens === 0) {
          usage = {
            inputTokens: Math.ceil(transcriptText.length / 4),
            outputTokens: Math.ceil((finalResult ?? cumulativeText).length / 4),
          };
        }
        finish();
      });

      const tokenStream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          try {
            while (true) {
              if (queue.length > 0) {
                yield queue.shift()!;
                continue;
              }
              if (done) {
                if (error) throw error;
                return;
              }
              const result = await new Promise<IteratorResult<string>>(
                (resolve) => {
                  waiters.push(resolve);
                },
              );
              if (result.done) {
                if (error) throw error;
                return;
              }
              yield result.value;
            }
          } finally {
            input.signal.removeEventListener("abort", onAbort);
            if (!child.killed && child.exitCode === null) {
              child.kill("SIGTERM");
            }
          }
        },
      };

      return {
        kind: "speak",
        stream: tokenStream,
        usage: async () => usage,
      };
    },
  };
}
