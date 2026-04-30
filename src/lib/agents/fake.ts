/* Fake 어댑터 — M3 실어댑터 없이도 골격 검증 가능하게.
 * 약 절반의 확률로 PASS, 나머지는 transcript 마지막 메시지를 echo + 짧은 응답.
 * 토큰은 단어 단위로 50ms 지연 yield → 스트리밍 UI 동작 검증.
 */
import type {
  AgentAdapter,
  AgentId,
  AgentMode,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";

const DEFAULT_TOKEN_DELAY_MS = 50;
const DEFAULT_PASS_PROB = 0.4;

interface FakeOptions {
  passProbability?: number;
  tokenDelayMs?: number;
  /** 결정성을 위해 외부에서 시드 가능. 기본 Math.random. */
  rng?: () => number;
}

function lastSpoken(transcript: SpeakInput["transcript"]): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const e = transcript[i];
    if (e.text.trim().length > 0) return e.text;
  }
  return "";
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createFakeAdapter(
  id: AgentId,
  options: FakeOptions = {},
): AgentAdapter {
  const passProb = options.passProbability ?? DEFAULT_PASS_PROB;
  const delay = options.tokenDelayMs ?? DEFAULT_TOKEN_DELAY_MS;
  const rng = options.rng ?? Math.random;

  const adapter: AgentAdapter = {
    id,
    mode: "api" satisfies AgentMode,
    async speak(input: SpeakInput): Promise<SpeakResult> {
      if (rng() < passProb) {
        return { kind: "pass" };
      }

      const echo = lastSpoken(input.transcript).slice(0, 80);
      const utterance = `[fake:${id}] noted${echo ? ` (re: "${echo}")` : ""}. proceeding with stub response.`;
      const tokens = utterance.split(/(\s+)/).filter((t) => t.length > 0);

      let totalChars = 0;

      const stream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          for (const tok of tokens) {
            await sleep(delay, input.signal);
            totalChars += tok.length;
            yield tok;
          }
        },
      };

      const usage = async (): Promise<AgentUsage> => ({
        inputTokens: Math.ceil(
          input.transcript.reduce((acc, e) => acc + e.text.length, 0) / 4,
        ),
        outputTokens: Math.ceil(totalChars / 4),
      });

      return { kind: "speak", stream, usage };
    },
  };

  return adapter;
}
