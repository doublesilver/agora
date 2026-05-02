/* JSONL append-only 로거 — AGENTS.md JSONL 스키마 단일 출처.
 * 한 세션당 한 파일(`logs/{sessionId}.jsonl`)에 한 줄 = 한 이벤트로 append.
 * 시크릿 포함 가능 필드는 emitEvent 호출자가 미리 redact (logger는 그대로 직렬화). */
import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { join } from "node:path";
import type { OrchestratorEvent } from "./session-store";

const LOG_DIR = join(process.cwd(), "logs");

export class JsonlLogger {
  private stream: WriteStream;
  private closed = false;

  constructor(public readonly sessionId: string) {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `${sessionId}.jsonl`);
    this.stream = createWriteStream(path, { flags: "a", encoding: "utf-8" });
  }

  /** 단일 이벤트 한 줄. 시크릿 포함 가능 필드는 호출자가 미리 redact. */
  log(event: OrchestratorEvent): void {
    if (this.closed) return;
    const line = JSON.stringify(event);
    this.stream.write(line + "\n");
  }

  /** 세션 종료 후 closer 체인에서 호출. close 후 추가 log()는 silent drop. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await new Promise<void>((resolve) => this.stream.end(resolve));
  }
}
