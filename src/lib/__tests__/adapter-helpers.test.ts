/* adapter-helpers 단위 테스트 — transcript 직렬화 + 시스템 프롬프트 augment.
 * 어댑터 6종이 공유하는 로직이라 invariant 깨지면 attribution·PASS 규약이 모두
 * 깨진다. */
import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  serializeTranscript,
} from "../agents/adapter-helpers";
import type { TranscriptEvent } from "../agents/types";

describe("serializeTranscript", () => {
  it("user/agent 이벤트에 [LABEL] prefix를 붙여 직렬화한다", () => {
    const transcript: TranscriptEvent[] = [
      { role: "user", text: "주제 X에 대해 토론해줘", ts: 0 },
      { role: "claude", text: "관점 1", ts: 1, turn: 0 },
      { role: "codex", text: "관점 2", ts: 2, turn: 0 },
      { role: "gemini", text: "반례", ts: 3, turn: 0 },
    ];
    const result = serializeTranscript(transcript);
    expect(result).toBe(
      "[USER] 주제 X에 대해 토론해줘\n\n[CLAUDE] 관점 1\n\n[CODEX] 관점 2\n\n[GEMINI] 반례",
    );
  });

  it("빈 transcript는 빈 문자열을 반환한다", () => {
    expect(serializeTranscript([])).toBe("");
  });

  it("이벤트 사이는 빈 줄(개행 2개)로 구분된다 — markdown 단락 호환", () => {
    const t: TranscriptEvent[] = [
      { role: "user", text: "A", ts: 0 },
      { role: "claude", text: "B", ts: 1, turn: 0 },
    ];
    expect(serializeTranscript(t)).toContain("\n\n");
  });
});

describe("buildSystemPrompt", () => {
  it("base prompt 다음에 화자 ID + 사칭 금지 + PASS 규약을 augmentation한다", () => {
    const result = buildSystemPrompt("claude", "당신은 비평가입니다.");
    expect(result).toContain("당신은 비평가입니다.");
    expect(result).toContain("speaking AS CLAUDE");
    expect(result).toContain("do NOT impersonate");
    expect(result).toContain("[PASS]");
  });

  it("base가 빈 문자열이어도 augmentation 부분은 항상 포함된다 (fallback)", () => {
    const result = buildSystemPrompt("codex", "");
    expect(result).toContain("speaking AS CODEX");
    expect(result).toContain("[PASS]");
  });

  it("agentId가 대문자로 들어간다 — transcript LABEL prefix와 일치", () => {
    expect(buildSystemPrompt("gemini", "x")).toContain("speaking AS GEMINI");
  });
});
