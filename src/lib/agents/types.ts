/* Agent Adapter 인터페이스 — AGENTS.md A1/A3/A8 정합. */

export type AgentId = "claude" | "codex" | "gemini";
export type AgentMode = "api" | "cli";

/** transcript 한 줄 = 한 메시지. 토큰 단위는 별도 SSE 이벤트로만 표현. */
export type TranscriptEvent =
  | { role: "user"; text: string; ts: number }
  | { role: AgentId; text: string; ts: number; turn: number };

export interface SpeakInput {
  /** 공유 transcript 시간순 스냅샷. 이번 라운드 직전까지의 모든 발언 포함. */
  transcript: TranscriptEvent[];
  /** 어댑터별 시스템 프롬프트 (시드 또는 사용자 편집본). 어댑터는 말미에 [PASS] 규약 강제 주입. */
  systemPrompt: string;
  /** 라운드 abort + 세션 abort 합성 시그널. SDK/CLI 호출에 그대로 전달. */
  signal: AbortSignal;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}

export type SpeakResult =
  | { kind: "pass" }
  | {
      kind: "speak";
      stream: AsyncIterable<string>;
      /** 스트림 종료 후 호출. usage 정보 비동기 추출 (CLI 모드는 글자수/4 추정 폴백). */
      usage?: () => Promise<AgentUsage>;
    };

export interface AgentAdapter {
  id: AgentId;
  mode: AgentMode;
  /** 사용 모델 라벨 — agent_start 이벤트와 UI에 노출 (CLI는 사용자 설정에 따라 다르므로 옵셔널). */
  model?: string;
  /** 라운드 1회 발언 결정 + 스트림. PASS면 stream 없음. */
  speak(input: SpeakInput): Promise<SpeakResult>;
}

/** PASS 규약 토큰 — 시스템 프롬프트 강제 주입 + 응답 trim 비교에 사용. */
export const PASS_TOKEN = "[PASS]";

/** PASS 규약 강제 주입 문구 — 모든 어댑터 시스템 프롬프트 말미에 추가. */
export const PASS_INSTRUCTION = `Reply with the literal token "${PASS_TOKEN}" and nothing else if you have nothing meaningful to add this round.`;
