/* Claude API 어댑터 — @anthropic-ai/sdk messages.stream. M0 정찰 결과 적용. */
import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";

const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;

interface ClaudeApiOptions {
  apiKey: string;
  model?: string;
}

export function createClaudeApiAdapter(opts: ClaudeApiOptions): AgentAdapter {
  if (!opts.apiKey) throw new Error("claude-api: apiKey required");
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "claude",
    mode: "api",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("claude", input.systemPrompt);
      const userText = serializeTranscript(input.transcript);

      const stream = client.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: userText }],
        },
        { signal: input.signal },
      );

      let usagePromise: Promise<AgentUsage> | null = null;

      const tokenStream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          // SDK가 stream.on('text', ...) 패턴이라 async iterator 직접 미지원 → 큐로 변환.
          const queue: string[] = [];
          const waiters: Array<(value: IteratorResult<string>) => void> = [];
          let done = false;
          let err: unknown = null;

          const push = (chunk: string) => {
            if (waiters.length > 0) {
              waiters.shift()!({ value: chunk, done: false });
            } else {
              queue.push(chunk);
            }
          };
          const finish = () => {
            done = true;
            while (waiters.length > 0) {
              waiters.shift()!({
                value: undefined as unknown as string,
                done: true,
              });
            }
          };
          const fail = (e: unknown) => {
            err = e;
            finish();
          };

          stream.on("text", push);
          stream
            .finalMessage()
            .then((msg) => {
              usagePromise = Promise.resolve({
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
              });
              finish();
            })
            .catch(fail);

          while (true) {
            if (queue.length > 0) {
              const v = queue.shift()!;
              yield v;
              continue;
            }
            if (done) {
              if (err) throw err;
              return;
            }
            const result = await new Promise<IteratorResult<string>>(
              (resolve) => {
                waiters.push(resolve);
              },
            );
            if (result.done) {
              if (err) throw err;
              return;
            }
            yield result.value;
          }
        },
      };

      return {
        kind: "speak",
        stream: tokenStream,
        usage: () =>
          usagePromise ?? Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      };
    },
  };
}
