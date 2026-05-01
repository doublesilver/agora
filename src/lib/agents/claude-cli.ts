/* Claude CLI 어댑터 — child_process spawn + stream-json 라인 파싱.
 * M0 정찰 결과: 라인 경계 깨끗(R7 폴백 불필요), 다수의 system hook 라인 + 1개 이상 assistant + 마지막 result.
 */
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

interface ClaudeCliOptions {
  command?: string; // 기본 resolveCliBin('claude') — env override 또는 'claude'
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
  const command = opts.command ?? resolveCliBin("claude");

  return {
    id: "claude",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("claude", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const handle = spawnWithAbort(
        command,
        ["-p", fullPrompt, "--output-format", "stream-json", "--verbose"],
        input.signal,
      );

      let cumulativeText = "";
      let finalResult: string | null = null;
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
          if (ev?.type === "assistant") {
            const text = extractAssistantText(ev);
            if (text) {
              const delta = text.slice(cumulativeText.length);
              cumulativeText = text;
              if (delta) queue.push(delta);
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

      handle.child.on("error", (err) => queue.finish(err));
      handle.child.on("exit", (code, sig) => {
        const aborted = input.signal.aborted;
        const terminated = isTerminationSignal(code, sig);
        if (aborted || terminated) {
          if (cumulativeText.length === 0 && finalResult) {
            queue.push(finalResult);
          }
          queue.finish();
          return;
        }
        if (cumulativeText.length === 0 && finalResult) {
          queue.push(finalResult);
        }
        if (code !== 0) {
          queue.finish(
            new Error(
              `claude CLI exited code=${code} signal=${sig} stderr=${handle.getStderrTail().slice(-200)}`,
            ),
          );
          return;
        }
        // CLI usage 미보고 시 글자수/4 추정 폴백
        if (usage.outputTokens === 0) {
          usage = {
            inputTokens: Math.ceil(transcriptText.length / 4),
            outputTokens: Math.ceil((finalResult ?? cumulativeText).length / 4),
          };
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
