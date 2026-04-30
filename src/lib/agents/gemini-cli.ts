/* Gemini CLI 어댑터 — gemini -p ... -y -o json. JSON 단일 응답 파싱. */
import { spawn } from "node:child_process";
import type {
  AgentAdapter,
  AgentUsage,
  SpeakInput,
  SpeakResult,
} from "./types";
import { buildSystemPrompt, serializeTranscript } from "./adapter-helpers";

interface GeminiCliOptions {
  command?: string;
  model?: string;
}

const DEFAULT_MODEL = "gemini-2.5-flash"; // CLI 부팅 ~10s + flash로 응답 빠르게

export function createGeminiCliAdapter(
  opts: GeminiCliOptions = {},
): AgentAdapter {
  const command = opts.command ?? "gemini";
  const model = opts.model ?? DEFAULT_MODEL;

  return {
    id: "gemini",
    mode: "cli",
    async speak(input: SpeakInput): Promise<SpeakResult> {
      const system = buildSystemPrompt("gemini", input.systemPrompt);
      const transcriptText = serializeTranscript(input.transcript);
      const fullPrompt = `${system}\n\n---\n${transcriptText}`;

      const child = spawn(
        command,
        ["-p", fullPrompt, "-y", "-o", "json", "-m", model],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      const onAbort = () => {
        if (!child.killed) child.kill("SIGTERM");
      };
      input.signal.addEventListener("abort", onAbort, { once: true });

      let stdoutBuf = "";
      let stderrTail = "";
      child.stdout.on("data", (buf: Buffer) => {
        stdoutBuf += buf.toString();
      });
      child.stderr.on("data", (buf: Buffer) => {
        stderrTail += buf.toString();
        if (stderrTail.length > 2000) stderrTail = stderrTail.slice(-2000);
      });

      const queue: string[] = [];
      const waiters: Array<(v: IteratorResult<string>) => void> = [];
      let done = false;
      let error: unknown = null;
      let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

      const push = (chunk: string) => {
        if (waiters.length > 0) waiters.shift()!({ value: chunk, done: false });
        else queue.push(chunk);
      };
      const finish = () => {
        done = true;
        while (waiters.length > 0)
          waiters.shift()!({ value: "" as string, done: true });
      };

      child.on("error", (err) => {
        error = err;
        finish();
      });
      // 'close'는 모든 stdio 스트림이 닫힌 후 발생 — stdoutBuf 완결 보장.
      child.on("close", (code, signal) => {
        if (code !== 0 && signal !== "SIGTERM" && !error) {
          error = new Error(
            `gemini CLI exited code=${code} signal=${signal} stderr=${stderrTail.slice(-300)}`,
          );
          finish();
          return;
        }
        // stdout 안에 JSON 객체 추출 (앞뒤 잡문자 무시).
        const start = stdoutBuf.indexOf("{");
        const end = stdoutBuf.lastIndexOf("}");
        if (start < 0 || end < 0 || end <= start) {
          error = new Error(
            `gemini CLI: JSON 응답 파싱 실패. raw="${stdoutBuf.slice(0, 200)}" stderr="${stderrTail.slice(-200)}"`,
          );
          finish();
          return;
        }
        try {
          const parsed = JSON.parse(stdoutBuf.slice(start, end + 1));
          const text =
            typeof parsed.response === "string" ? parsed.response : "";
          if (text) push(text);
          // usage는 stats.models[*].tokens 합산
          const models = parsed?.stats?.models ?? {};
          let input = 0;
          let output = 0;
          for (const k of Object.keys(models)) {
            const t = models[k]?.tokens ?? {};
            input += t.prompt ?? 0;
            output += t.candidates ?? 0;
          }
          usage = { inputTokens: input, outputTokens: output };
        } catch (e) {
          error = e;
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
