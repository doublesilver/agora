# Agora — 사용자가 토론에 참여하는 멀티 AI 도구

> **이은석** · korea5410@gmail.com · GitHub [doublesilver/agora](https://github.com/doublesilver/agora)
> 라이브 데모: <https://agora-production-17a6.up.railway.app> · 데모 영상: (녹화 후 추가)

여러 AI(Claude · GPT · Gemini)가 직렬 라운드로 토론하는 도구. 사용자가 시스템 프롬프트로 역할을 지정하고, 진행 중에 의견을 끼워넣으면 발언이 즉시 끊기고 다음 라운드가 의견을 반영해 재정렬. **도메인 무관** — 어떤 주제든 OK.

---

## 기술 차별화 — 일반 LLM 호출과 다른 3가지

**1. 직렬 라운드 + AbortSignal 분리.** `roundAbort`(라운드별 새로 생성, 인터럽트 시 fire) vs `sessionAbort`(세션 단일, STOP 시 fire) — 두 컨트롤러를 분리해 "인터럽트로 라운드만 끊고 다음 라운드 자동 시작" / "STOP으로 세션 통째 종료" 의미를 명확히 분리. Node 20+ `AbortSignal.any`로 합성해 listener leak 자동 정리.

**2. Anthropic prompt caching 정확 적용.** transcript의 prior(직전 발언 제외) 블록에 `cache_control: ephemeral`을 박아 같은 라운드 다음 화자가 prefix 캐시 히트 → input 토큰 ~10× 저렴, TTFT 단축. 캐시 미스/적중 토큰을 usage에 합산해 토큰 캡 정확성 유지.

**3. 시크릿 위생 — JSONL 자동 검증.** API 키·OAuth 토큰·CLI 인자는 로그·콘솔·SSE 어디에도 echo 안 됨. CLI stderr는 길이만 surface(`stderr suppressed (Nbytes)`) — 실제 stderr가 OAuth refresh 토큰을 echo하는 사례를 의식. `scripts/scrub-check.sh` 자동 검증.

---

## 강건성 — 4개 종료 사유 + 4개 개입 모드

| 종료 사유            | 트리거                                                  |
| -------------------- | ------------------------------------------------------- |
| `user_stop`          | STOP 버튼 또는 모든 어댑터 3회 연속 실패 (errorStreak)  |
| `max_turns`          | 30턴 (사용자 1~200 변경 가능)                           |
| `budget_exceeded`    | 100k 토큰 (사용자 1k~1M)                                |
| `time_exceeded`      | 5분 (사용자 30s~60min)                                  |

| 개입 모드             | 동작                                                     |
| --------------------- | -------------------------------------------------------- |
| ⚡ Interrupt          | `roundAbort` fire → 현 발언자 stream 즉시 중단           |
| ↳ Queue               | userQueue에 enqueue → 다음 라운드 시작 시 transcript에 반영 |
| ‖ Pause / Resume      | 라운드 경계에서 멈춤·재개                                 |
| ■ Stop                | `sessionAbort` fire → 5섹션 markdown 호외 후 종료         |

서버 limits는 `clampLimits()`로 안전 범위 강제 — 클라이언트 입력 신뢰 경계 검증.

---

## 스택 + 검증

**Next.js 16 · TypeScript strict · Tailwind v4 · SSE · JSONL** + `@anthropic-ai/sdk` · `openai` · `@google/genai` · `vitest`

- **typecheck** 0 에러 / **vitest** 4 files · 26 tests passed / **verify-orchestrator** 9 시나리오 통과 (정상·인터럽트·timeout·error·pause-resume·hotswap·pause-mid-stop·budget·time) / **scrub-check** JSONL 시크릿 0 hit
- 어댑터 6종 (Claude · GPT · Gemini × API · CLI) — `cli-stream.ts`로 spawn·abort·stderr 캡처 공용 헬퍼화
- 모델 ID 카탈로그 `src/lib/models.ts` 단일 출처 — 5개 사용처 import (deprecation 헤지)

---

## 본 프로젝트 이력

베이글코드 신작팀 AI 개발자 채용 과제 제출본(`v0.1.0-bagelcode-submission` 태그)에서 출발해, 이후 main을 범용 멀티 AI 토론 도구로 재포지셔닝. 채용 시점 산출물은 `docs/legacy/`에 보존.

자세한 내용: [`README.md`](https://github.com/doublesilver/agora/blob/main/README.md) · [`ARCHITECTURE.md`](https://github.com/doublesilver/agora/blob/main/ARCHITECTURE.md) · [`AGENTS.md`](https://github.com/doublesilver/agora/blob/main/AGENTS.md)
