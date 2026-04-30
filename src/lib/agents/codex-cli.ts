/* Codex CLI 어댑터 — codex exec --json + 사용자 구독/OAuth 인증 사용. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";

interface CodexCliOptions {
  command?: string;
}

export function createCodexCliAdapter(
  opts: CodexCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? "codex";

  return {
    id: "codex",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("codex", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const child = spawn(
        command,
        [
          "exec",
          "--json",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          fullPrompt,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      const onAbort = () => {
        if (!child.killed) child.kill("SIGTERM");
      };
      input.signal.addEventListener("abort", onAbort, { once: true });

      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
      let stderrTail = "";
      child.stderr.on("data", (buf: Buffer) => {
        stderrTail += buf.toString();
        if (stderrTail.length > 2000) stderrTail = stderrTail.slice(-2000);
      });

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

      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const ev = JSON.parse(line);
          if (
            ev?.type === "item.completed" &&
            ev?.item?.type === "agent_message"
          ) {
            const text = typeof ev.item.text === "string" ? ev.item.text : "";
            if (text) push(text);
          } else if (ev?.type === "turn.completed" && ev?.usage) {
            usage = {
              inputTokens: ev.usage.input_tokens ?? 0,
              outputTokens: ev.usage.output_tokens ?? 0,
            };
          } else if (ev?.type === "error" || ev?.type === "turn.failed") {
            // codex가 보내는 명확한 에러 메시지 (예: 사용량 한도) — 우선순위 높여 surface.
            const msg =
              ev?.message ??
              ev?.error?.message ??
              "codex CLI returned error event";
            error = new Error(`codex: ${msg}`);
          }
        } catch {
          // 비-JSON 라인 무시.
        }
      });

      child.on("error", (err) => {
        error = err;
        finish();
      });
      child.on("exit", (code, signal) => {
        if (code !== 0 && signal !== "SIGTERM" && !error) {
          error = new Error(
            `codex CLI exited code=${code} signal=${signal} stderr=${stderrTail.slice(-200)}`,
          );
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
            if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
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
