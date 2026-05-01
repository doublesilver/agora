/* Codex CLI 어댑터 — codex exec --json + 사용자 구독/OAuth 인증 사용. */
import { createInterface } from "node:readline";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";
import {
  createStreamQueue,
  isTerminationSignal,
  resolveCliBin,
  spawnWithAbort,
} from "./cli-stream";

interface CodexCliOptions {
  command?: string;
}

export function createCodexCliAdapter(
  opts: CodexCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? resolveCliBin("codex");

  return {
    id: "codex",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("codex", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const handle = spawnWithAbort(
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
        input.signal,
      );

      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const queue = createStreamQueue(() => {
        handle.detachAbort();
        if (!handle.child.killed && handle.child.exitCode === null) {
          handle.child.kill("SIGTERM");
        }
      });

      const rl = createInterface({ input: handle.child.stdout! });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const ev = JSON.parse(line);
          if (
            ev?.type === "item.completed" &&
            ev?.item?.type === "agent_message"
          ) {
            const text = typeof ev.item.text === "string" ? ev.item.text : "";
            if (text) queue.push(text);
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
            queue.finish(new Error(`codex: ${msg}`));
          }
        } catch {
          // 비-JSON 라인 무시.
        }
      });

      handle.child.on("error", (err) => queue.finish(err));
      handle.child.on("exit", (code, sig) => {
        const aborted = input.signal.aborted;
        const terminated = isTerminationSignal(code, sig);
        if (aborted || terminated) {
          queue.finish();
          return;
        }
        if (code !== 0) {
          queue.finish(
            new Error(
              `codex CLI exited code=${code} signal=${sig} stderr=${handle.getStderrTail().slice(-200)}`,
            ),
          );
          return;
        }
        queue.finish();
      });

      return {
        kind: "speak",
        stream: queue.stream,
        usage: async () => usage,
      };
    },
  };
}
