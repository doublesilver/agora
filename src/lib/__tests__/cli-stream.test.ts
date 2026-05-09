/* cli-stream 헬퍼 단위 테스트 — CLI 어댑터 6종 공용 로직.
 * 실제 spawn은 통합 테스트 영역이라 본 테스트는 순수 함수만. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isTerminationSignal,
  resolveCliBin,
  stripGeminiBanner,
} from "../agents/cli-stream";

describe("stripGeminiBanner", () => {
  it("2-space 들여쓴 배너 + 빈 줄 prefix를 잘라낸다", () => {
    const raw = `  Gemini CLI — v1.2.3\n  Authenticated as user@example.com\n\n실제 응답 첫 줄\n두 번째 줄`;
    expect(stripGeminiBanner(raw)).toBe("실제 응답 첫 줄\n두 번째 줄");
  });

  it("배너 없이 바로 본문이면 그대로 반환한다", () => {
    const raw = "응답 본문\n두 번째 줄";
    expect(stripGeminiBanner(raw)).toBe("응답 본문\n두 번째 줄");
  });

  it("trim된 결과를 반환한다 — 끝의 trailing newline 제거", () => {
    const raw = "  banner\n\n응답\n\n";
    expect(stripGeminiBanner(raw)).toBe("응답");
  });

  it("빈 문자열은 그대로 빈 문자열", () => {
    expect(stripGeminiBanner("")).toBe("");
  });
});

describe("isTerminationSignal", () => {
  it("SIGTERM은 종료 신호로 판정", () => {
    expect(isTerminationSignal(null, "SIGTERM")).toBe(true);
  });

  it("exit code 143(128+SIGTERM)·130(128+SIGINT)은 종료 신호", () => {
    expect(isTerminationSignal(143, null)).toBe(true);
    expect(isTerminationSignal(130, null)).toBe(true);
  });

  it("정상 exit(0)은 종료 신호 아님", () => {
    expect(isTerminationSignal(0, null)).toBe(false);
  });

  it("일반 에러 exit(1)은 종료 신호 아님 — abort vs error 구분", () => {
    expect(isTerminationSignal(1, null)).toBe(false);
  });
});

describe("resolveCliBin", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("AGORA_*_BIN env가 설정되면 절대경로 override를 반환", () => {
    process.env.AGORA_CLAUDE_BIN = "/abs/path/claude";
    expect(resolveCliBin("claude")).toBe("/abs/path/claude");
  });

  it("env 미설정 시 default 명령(id 그대로)", () => {
    delete process.env.AGORA_GEMINI_BIN;
    expect(resolveCliBin("gemini")).toBe("gemini");
  });

  it("env가 빈 문자열·공백이면 default fallback", () => {
    process.env.AGORA_CODEX_BIN = "";
    expect(resolveCliBin("codex")).toBe("codex");
    process.env.AGORA_CODEX_BIN = "   ";
    expect(resolveCliBin("codex")).toBe("codex");
  });

  it("3개 CLI id가 모두 독립 env를 사용", () => {
    process.env.AGORA_CLAUDE_BIN = "/c";
    process.env.AGORA_CODEX_BIN = "/x";
    process.env.AGORA_GEMINI_BIN = "/g";
    expect(resolveCliBin("claude")).toBe("/c");
    expect(resolveCliBin("codex")).toBe("/x");
    expect(resolveCliBin("gemini")).toBe("/g");
  });
});
