/* CLI 어댑터 공용 헬퍼 — 큐 기반 토큰 스트림 + spawn/abort/stderr 보일러플레이트.
 * claude/codex/gemini CLI 어댑터가 공유. 파싱은 각 어댑터 자체. */
import { spawn, type ChildProcess } from "node:child_process";

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
