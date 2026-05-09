/* 모델 ID 카탈로그 — 어댑터·summarizer가 공유하는 단일 출처.
 *
 * 왜 분리했나: SDK의 모델 ID는 deprecation 주기가 짧다. 1년 안에 새 모델로
 * 교체될 가능성이 크고, 그때마다 어댑터·summarizer·테스트를 일일이 갱신하기
 * 부담이라 한 군데만 손대면 끝나도록 모은다. */
import type { AgentId } from "./agents/types";

/** 각 AgentId의 API 모드 default 모델 ID.
 * 사용자가 ⚙ 설정에서 override 가능 — 그 경우 spec.model이 우선이고 이 값은
 * fallback. */
export const DEFAULT_API_MODELS: Record<AgentId, string> = {
  claude: "claude-opus-4-7",
  codex: "gpt-5",
  gemini: "gemini-2.5-pro",
};

/** SettingsModal datalist 자동완성 후보 — 사용자가 직접 모델 ID를 입력할 때
 * 노출되는 옵션. quota·속도·가격 trade-off에 따라 사용자가 자유 선택.
 *
 * Invariant: 각 agent별 배열의 **첫 항목은 DEFAULT_API_MODELS와 같아야 함**
 * (UI label·placeholder가 첫 항목을 default로 보여주므로 어긋나면 혼란). */
export const MODEL_CANDIDATES: Record<AgentId, string[]> = {
  claude: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
  codex: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
};
