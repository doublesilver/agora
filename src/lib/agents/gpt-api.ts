/* GPT API 어댑터 — openai chat.completions.stream(usage). M0 정찰 결과 적용. */
import OpenAI from "openai";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";
import { DEFAULT_API_MODELS } from "../models";

const DEFAULT_MODEL = DEFAULT_API_MODELS.codex;

interface GptApiOptions {
  apiKey: string;
  model?: string;
}

export function createGptApiAdapter(opts: GptApiOptions): AgentAdapter {
  if (!opts.apiKey) throw new Error("gpt-api: apiKey required");
  const client = new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "codex",
    mode: "api",
    model,
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("codex", input.systemPrompt);
      const userText = serializeTranscript(input.transcript);

      const stream = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userText },
          ],
          max_completion_tokens: 1024,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: input.signal },
      );

      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const tokenStream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta;
            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
              };
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
