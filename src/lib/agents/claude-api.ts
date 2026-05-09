/* Claude API 어댑터 — @anthropic-ai/sdk messages.stream + prompt caching.
 * cache_control 2개: system 블록, user 콘텐츠의 prior(직전 발언 제외) 블록.
 * 같은 라운드 내 다음 화자도 prior prefix는 캐시 히트 → TTFT/비용 절감. */
import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
  TranscriptEvent,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";
import { DEFAULT_API_MODELS } from "../models";

const DEFAULT_MODEL = DEFAULT_API_MODELS.claude;
const MAX_TOKENS = 1024;

interface ClaudeApiOptions {
  apiKey: string;
  model?: string;
}

type TextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

function buildUserContent(transcript: TranscriptEvent[]): TextBlock[] {
  if (transcript.length <= 1) {
    return [{ type: "text", text: serializeTranscript(transcript) }];
  }
  return [
    {
      type: "text",
      text: serializeTranscript(transcript.slice(0, -1)),
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: serializeTranscript(transcript.slice(-1)) },
  ];
}

export function createClaudeApiAdapter(opts: ClaudeApiOptions): AgentAdapter {
  if (!opts.apiKey) throw new Error("claude-api: apiKey required");
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "claude",
    mode: "api",
    model,
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("claude", input.systemPrompt);

      const stream = client.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: "text",
              text: system,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            { role: "user", content: buildUserContent(input.transcript) },
          ],
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
              const u = msg.usage as unknown as Record<
                string,
                number | undefined
              >;
              // input_tokens는 캐시 미스 부분만 카운트. 토큰 캡(MAX_SESSION_TOKENS)을
              // "총 입력 토큰" 단위로 산정하기 위해 cache_creation/cache_read를 합산.
              // 비용 가중(cache_read 1/10, cache_creation 1.25배)은 적용하지 않음 — 캡은 토큰 절대량 기준.
              const cacheCreate = u?.cache_creation_input_tokens ?? 0;
              const cacheRead = u?.cache_read_input_tokens ?? 0;
              usagePromise = Promise.resolve({
                inputTokens:
                  (msg.usage?.input_tokens ?? 0) + cacheCreate + cacheRead,
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
