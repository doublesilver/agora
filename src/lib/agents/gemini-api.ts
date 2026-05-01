/* Gemini API 어댑터 — @google/genai generateContentStream. M0 정찰 결과 적용. */
import { GoogleGenAI } from "@google/genai";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";

const DEFAULT_MODEL = "gemini-2.5-pro";

interface GeminiApiOptions {
  apiKey: string;
  model?: string;
}

export function createGeminiApiAdapter(opts: GeminiApiOptions): AgentAdapter {
  if (!opts.apiKey) throw new Error("gemini-api: apiKey required");
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "gemini",
    mode: "api",
    model,
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("gemini", input.systemPrompt);
      const userText = serializeTranscript(input.transcript);

      const stream = await ai.models.generateContentStream({
        model,
        config: {
          systemInstruction: system,
          abortSignal: input.signal,
        },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      });

      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const tokenStream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) yield text;
            const meta = chunk.usageMetadata;
            if (meta) {
              usage = {
                inputTokens: meta.promptTokenCount ?? 0,
                outputTokens: meta.candidatesTokenCount ?? 0,
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
