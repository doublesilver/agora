/* Gemini CLI 어댑터 — gemini -p ... -y -o json. JSON 단일 응답 파싱. */
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
  model?: string;
}

const DEFAULT_MODEL = "gemini-2.5-flash"; // CLI 부팅 ~10s + flash로 응답 빠르게

export function createGeminiCliAdapter(
  opts: GeminiCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? resolveCliBin("gemini");
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "gemini",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("gemini", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const handle = spawnWithAbort(
        command,
        ["-p", fullPrompt, "-y", "-o", "json", "-m", model],
        input.signal,
      );

      let stdoutBuf = "";
      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const queue = createStreamQueue(() => {
        handle.detachAbort();
        if (!handle.child.killed && handle.child.exitCode === null) {
          handle.child.kill("SIGTERM");
        }
      });

      handle.child.stdout?.on("data", (buf: Buffer) => {
        stdoutBuf += buf.toString();
      });

      handle.child.on("error", (err) => queue.finish(err));
      // 'close'는 모든 stdio 스트림이 닫힌 후 발생 — stdoutBuf 완결 보장.
      handle.child.on("close", (code, sig) => {
        const aborted = input.signal.aborted;
        const terminated = isTerminationSignal(code, sig);
        if (aborted || terminated) {
          queue.finish();
          return;
        }
        if (code !== 0) {
          queue.finish(
            new Error(
              `gemini CLI exited code=${code} signal=${sig} stderr=${handle.getStderrTail().slice(-300)}`,
            ),
          );
          return;
        }
        // stdout 안에 JSON 객체 추출 (앞뒤 잡문자 무시).
        const start = stdoutBuf.indexOf("{");
        const end = stdoutBuf.lastIndexOf("}");
        if (start < 0 || end < 0 || end <= start) {
          queue.finish(
            new Error(
              `gemini CLI: JSON 응답 파싱 실패. raw="${stdoutBuf.slice(0, 200)}" stderr="${handle.getStderrTail().slice(-200)}"`,
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse(stdoutBuf.slice(start, end + 1));
          const text =
            typeof parsed.response === "string" ? parsed.response : "";
          if (text) queue.push(text);
          // usage는 stats.models[*].tokens 합산
          const models = parsed?.stats?.models ?? {};
          let inputTokens = 0;
          let outputTokens = 0;
          for (const k of Object.keys(models)) {
            const t = models[k]?.tokens ?? {};
            inputTokens += t.prompt ?? 0;
            outputTokens += t.candidates ?? 0;
          }
          // stats 미보고 시 글자수/4 추정 폴백 — transcript 무제한 폭주 방어.
          if (outputTokens === 0 && text.length > 0) {
            inputTokens = Math.ceil(fullPrompt.length / 4);
            outputTokens = Math.ceil(text.length / 4);
          }
          usage = { inputTokens, outputTokens };
          queue.finish();
        } catch (e) {
          queue.finish(e);
        }
      });

      return {
        kind: "speak",
        stream: queue.stream,
        usage: async () => usage,
      };
    },
  };
}
