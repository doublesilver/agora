/* JSONL append-only 로거 — AGENTS.md JSONL 스키마 단일 출처. */
import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { dirname, join } from "node:path";
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

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await new Promise<void>((resolve) => this.stream.end(resolve));
  }

  /** 로그 파일의 절대 경로. /api/export/jsonl 직접 스트리밍에 사용. */
  get filePath(): string {
    return join(LOG_DIR, `${this.sessionId}.jsonl`);
  }
}

export function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}
