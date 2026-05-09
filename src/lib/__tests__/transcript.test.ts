/* Transcript 단위 테스트 — push/snapshot 격리 invariant 검증.
 * snapshot이 mutation 격리를 보장해야 라운드 안의 다음 발언자가 안전한 입력을 받음. */
import { describe, it, expect } from "vitest";
import { Transcript } from "../transcript";

describe("Transcript", () => {
  it("push한 이벤트가 snapshot에 시간순으로 보존된다", () => {
    const t = new Transcript();
    t.push({ role: "user", text: "A", ts: 1 });
    t.push({ role: "claude", text: "B", ts: 2, turn: 0 });

    const snap = t.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]?.text).toBe("A");
    expect(snap[1]?.text).toBe("B");
  });

  it("snapshot은 호출 시점 복사본이라 이후 push에 영향받지 않는다", () => {
    const t = new Transcript();
    t.push({ role: "user", text: "first", ts: 1 });
    const snap = t.snapshot();
    t.push({ role: "user", text: "second", ts: 2 });

    expect(snap).toHaveLength(1);
    expect(t.snapshot()).toHaveLength(2);
  });

  it("snapshot은 array slice라 외부 mutation이 내부 상태를 깨지 않는다", () => {
    const t = new Transcript();
    t.push({ role: "user", text: "x", ts: 1 });
    const snap = t.snapshot();
    snap.push({ role: "user", text: "외부 mutation", ts: 99 });

    expect(t.snapshot()).toHaveLength(1);
  });

  it("초기 상태 snapshot은 빈 배열", () => {
    expect(new Transcript().snapshot()).toEqual([]);
  });
});
