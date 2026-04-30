/* In-memory transcript — 직렬 라운드에서 다음 발언자가 즉시 본다. */
import type { TranscriptEvent } from "./agents/types";

export class Transcript {
  private readonly events: TranscriptEvent[] = [];

  push(event: TranscriptEvent): void {
    this.events.push(event);
  }

  /** 발언자 호출 직전에 받는 스냅샷 (이후 변경 안전). */
  snapshot(): TranscriptEvent[] {
    return this.events.slice();
  }

  get length(): number {
    return this.events.length;
  }
}
