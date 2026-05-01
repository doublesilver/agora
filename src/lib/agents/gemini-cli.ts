/* Gemini CLI 어댑터 — gemini -p ... -y -o stream-json. 라인 단위 NDJSON 파싱.
 * 이전 -o json은 응답 끝나야 stdout 토함(배치) → 첫 토큰 latency가 응답 끝까지
 * 누적되어 시연상 가장 느렸다. stream-json은 delta 메시지를 즉시 토하므로
 * Claude/Codex CLI와 동일한 토크쇼식 핑퐁 가능. -m 플래그는 사용자
 * ~/.gemini/GEMINI.md의 model 설정과 충돌(쉼표 구분 list)하므로 의도적으로
 * 생략 — 사용자 GEMINI.md가 모델 단일 출처. */
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

interface GeminiCliOptions {
  command?: string;
}

export function createGeminiCliAdapter(
  opts: GeminiCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? resolveCliBin("gemini");

  return {
    id: "gemini",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("gemini", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const handle = spawnWithAbort(
        command,
        ["-p", fullPrompt, "-y", "-o", "stream-json"],
        input.signal,
      );

      let producedText = "";
      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const queue = createStreamQueue(() => {
        handle.detachAbort();
        if (!handle.child.killed && handle.child.exitCode === null) {
          handle.child.kill("SIGTERM");
        }
      });

      const rl = createInterface({ input: handle.child.stdout! });
      rl.on("line", (line) => {
        const t = line.trim();
        if (!t || !t.startsWith("{")) return; // 배너/잡문자 skip
        try {
          const ev = JSON.parse(t);
          // assistant delta 메시지 = 실제 발화 토큰
          if (
            ev?.type === "message" &&
            ev?.role === "assistant" &&
            ev?.delta === true &&
            typeof ev?.content === "string"
          ) {
            const text = ev.content;
            if (text) {
              producedText += text;
              queue.push(text);
            }
            return;
          }
          // result = 종료 + 토큰 통계
          if (ev?.type === "result" && ev?.stats) {
            const s = ev.stats;
            usage = {
              inputTokens: s.input_tokens ?? 0,
              outputTokens: s.output_tokens ?? 0,
            };
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
              `gemini CLI exited code=${code} signal=${sig} stderr=${handle.getStderrTail().slice(-200)}`,
            ),
          );
          return;
        }
        // result.stats 미보고 시 글자수/4 폴백 — transcript 폭주 방어.
        if (usage.outputTokens === 0 && producedText.length > 0) {
          usage = {
            inputTokens: Math.ceil(fullPrompt.length / 4),
            outputTokens: Math.ceil(producedText.length / 4),
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
