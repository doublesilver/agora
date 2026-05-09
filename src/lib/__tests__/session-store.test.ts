/* session-store Notifier 단위 테스트 — paused/idle 대기·notify 패턴 검증.
 * 오케스트레이터가 notifier로 외부 트리거(intervene/pause/resume/stop)를 깨운다. */
import { describe, it, expect } from "vitest";
import { Notifier } from "../session-store";

describe("Notifier", () => {
  it("notify 후 도착한 wait()는 다음 notify까지 블록된다 — 1:1 매칭 아님(브로드캐스트)", async () => {
    const n = new Notifier();
    n.notify(); // 대기자 없으면 흡수

    let resolved = false;
    const p = n.wait().then(() => {
      resolved = true;
    });

    // microtask flush
    await Promise.resolve();
    expect(resolved).toBe(false);

    n.notify();
    await p;
    expect(resolved).toBe(true);
  });

  it("wait() 후 notify()를 부르면 즉시 resolve", async () => {
    const n = new Notifier();
    const p = n.wait();
    n.notify();
    await expect(p).resolves.toBeUndefined();
  });

  it("다중 wait()를 한 notify()로 모두 깨운다 (broadcast)", async () => {
    const n = new Notifier();
    const p1 = n.wait();
    const p2 = n.wait();
    const p3 = n.wait();
    n.notify();
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("notify() 한 번 부른 뒤의 새 wait()는 다음 notify를 기다린다", async () => {
    const n = new Notifier();
    const first = n.wait();
    n.notify();
    await first;

    let secondResolved = false;
    const second = n.wait().then(() => {
      secondResolved = true;
    });
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    n.notify();
    await second;
    expect(secondResolved).toBe(true);
  });
});
