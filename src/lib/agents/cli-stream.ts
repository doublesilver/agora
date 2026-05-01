/* CLI 어댑터 공용 헬퍼 — 큐 기반 토큰 스트림 + spawn/abort/stderr 보일러플레이트.
 * claude/codex/gemini CLI 어댑터가 공유. 파싱은 각 어댑터 자체. */
import { spawn, type ChildProcess } from "node:child_process";

export type CliId = "claude" | "codex" | "gemini";

/** PATH에 없거나 dev 서버를 GUI에서 띄워 spawn에서 못 찾는 환경을 위한
 * 절대경로 override. 셋 중 어느 하나가 안 잡히면 그 id에만 환경변수 박아주면
 * 됨 — `AGORA_CLAUDE_BIN=/path/to/claude`. 미설정 시 default 명령(`id` 그대로). */
const ENV_KEY: Record<CliId, string> = {
  claude: "AGORA_CLAUDE_BIN",
  codex: "AGORA_CODEX_BIN",
  gemini: "AGORA_GEMINI_BIN",
};

export function resolveCliBin(id: CliId): string {
  const override = process.env[ENV_KEY[id]];
  return override && override.trim().length > 0 ? override : id;
}

export interface StreamQueue {
  push: (chunk: string) => void;
  finish: (err?: unknown) => void;
  stream: AsyncIterable<string>;
}

/** 외부에서 push/finish, 소비 측은 async iterator. onClose는 iterator finally에서 1회 호출. */
export function createStreamQueue(onClose?: () => void): StreamQueue {
  const queue: string[] = [];
  const waiters: Array<(v: IteratorResult<string>) => void> = [];
  let done = false;
  let error: unknown = null;

  const push = (chunk: string) => {
    if (waiters.length > 0) waiters.shift()!({ value: chunk, done: false });
    else queue.push(chunk);
  };
  const finish = (err?: unknown) => {
    if (err !== undefined) error = err;
    done = true;
    while (waiters.length > 0) {
      waiters.shift()!({ value: undefined as unknown as string, done: true });
    }
  };

  const stream: AsyncIterable<string> = {
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
        onClose?.();
      }
    },
  };

  return { push, finish, stream };
}

export interface CliHandle {
  child: ChildProcess;
  getStderrTail: () => string;
  detachAbort: () => void;
}

/** spawn + AbortSignal→SIGTERM + stderr 2KB 트레일 캡처. */
export function spawnWithAbort(
  command: string,
  args: string[],
  signal: AbortSignal,
): CliHandle {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

  const onAbort = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  signal.addEventListener("abort", onAbort, { once: true });

  let stderrTail = "";
  child.stderr?.on("data", (buf: Buffer) => {
    stderrTail += buf.toString();
    if (stderrTail.length > 2000) stderrTail = stderrTail.slice(-2000);
  });

  return {
    child,
    getStderrTail: () => stderrTail,
    detachAbort: () => signal.removeEventListener("abort", onAbort),
  };
}

/** SIGTERM/abort/정상종료 식별 헬퍼. */
export function isTerminationSignal(
  code: number | null,
  signal: NodeJS.Signals | null,
): boolean {
  return signal === "SIGTERM" || code === 143 || code === 130;
}

/** 단발 호출 — stdout을 통째로 모아 trim 후 반환. 비스트리밍 final 산출물 등에 사용.
 * - signal abort 또는 timeoutMs 도달 시 SIGTERM → reject('aborted')
 * - exit code !== 0 시 stderr 마지막 500자 포함하여 reject. */
export function runCliOneshot(
  command: string,
  args: string[],
  signal: AbortSignal,
  timeoutMs: number = 60_000,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const onAbort = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM");
      reject(new Error(`${command} CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code, sig) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (isTerminationSignal(code, sig)) {
        reject(new Error("aborted"));
        return;
      }
      if (code !== 0) {
        // stderr는 OAuth refresh 토큰·내부 endpoint·세션 ID 등을 echo하는
        // CLI 사례가 보고돼 있어 길이만 surface한다. 디버깅이 필요하면
        // 서버 stdout(아래 console.error)에서 raw로 확인.
        if (stderr.length > 0) {
          console.error(
            `[cli-stream] ${command} stderr (${stderr.length}b):`,
            stderr,
          );
        }
        reject(
          new Error(
            `${command} CLI exited code=${code}${
              stderr.length > 0
                ? ` (stderr suppressed, ${stderr.length}b — see server log)`
                : ""
            }`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** 세션 시작 시 백그라운드에서 가벼운 호출(--version)로 binary/페이지캐시 워밍업.
 * fire-and-forget. 첫 실제 speak() spawn의 cold-start 5~15s 흡수 목표. */
export function warmupCli(command: string): void {
  try {
    const child = spawn(command, ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.on("error", () => {
      // 명령 부재·권한 문제 등 무시 (실제 speak에서 surface).
    });
    child.unref();
  } catch {
    // 무시.
  }
}
