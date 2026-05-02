/* In-memory transcript — 직렬 라운드에서 다음 발언자가 즉시 본다.
 * AGENTS.md A3 핵심: 한 발언자가 transcript.push() 한 결과를 같은 라운드 안의
 * 다음 발언자가 snapshot()으로 곧장 받아 본다. 토크쇼식 핑퐁의 토대. */
import type { TranscriptEvent } from "./agents/types";

export class Transcript {
  private readonly events: TranscriptEvent[] = [];

  push(event: TranscriptEvent): void {
    this.events.push(event);
  }

  /** 발언자 호출 직전에 받는 스냅샷 (이후 push로 인한 mutation 격리). */
  snapshot(): TranscriptEvent[] {
    return this.events.slice();
  }
}
