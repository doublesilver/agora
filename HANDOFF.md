# HANDOFF — 평가자용 1페이지 가이드

**Agora · 사용자가 함께 참여하는 멀티 AI 토론 도구**
베이글코드 신작팀 AI 개발자 채용 과제 제출물 — 이은석

---

## 0. TL;DR — 30초 요약

| 무엇      | 한 줄                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 차별화    | 단순 다중 호출이 아니라 **사용자가 진행 중 토론에 의견을 끼워넣는 도구**                                                    |
| 핵심 기능 | 2~3개 AI(Claude/Codex/Gemini)가 직렬 라운드로 토크쇼식 핑퐁, 사용자가 즉시/큐 모드로 의견 추가, 종료 시 5섹션 markdown 호외 |
| 도메인    | 게임 기획 (서바이벌·MMO·리듬게임 프리셋 내장)                                                                               |
| 스택      | Next.js 16 + TypeScript strict + Tailwind v4 + SSE + JSONL                                                                  |

---

## 1. 3분 안에 작동 확인

```bash
git clone <REPO_URL> agora && cd agora
npm install
cp .env.example .env.local   # 또는 UI에서 키 직접 입력 (sessionStorage 저장, 디스크 미저장)
npm run dev
```

http://localhost:3000 접속 후:

1. ⚙ (좌하단) → **AI 에이전트** 카테고리에서 Claude/Codex 둘 중 1개라도 API 키 입력 (또는 CLI 모드 선택, `claude`/`codex`/`gemini` 설치돼 있으면 LIVE 표시)
2. **2개 이상 활성화**돼야 ▶ START SESSION 버튼이 살아남
3. 좌측 패널에서 주제 입력 → ▶ START SESSION

5초 내 첫 토큰 스트리밍이 시작되면 OK.

---

## 2. 5분 시연 시나리오 — 차별화 포인트 직접 보기

| 단계 | 시간    | 액션                                                                  | 무엇을 보는가                                                                  |
| ---- | ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | 10s     | ⚙ → AI 에이전트 → Claude·Codex 활성 + API 키                          | 인증 흐름                                                                      |
| 2    | 5s      | ⚙ → 결과 정리 담당 → Claude 칩 클릭                                   | 종료 후 호외 생성용                                                            |
| 3    | 10s     | 좌패널에 "🎮 서바이벌 에너지" 프리셋 클릭 → ▶ START                   | 게임 도메인 시연 시작                                                          |
| 4    | 60s     | 2~3 라운드 관망 — 우측 활동 로그에서 추적                             | 직렬 라운드 + 토큰 스트리밍                                                    |
| 5    | **15s** | 입력창 모드 "⚡ 즉시" → "타겟 유저는 라이트 게이머다" → "지금 보내기" | **차별화 핵심 — 진행 중 발언 즉시 끊김 + 새 라운드가 사용자 의견 받아 재정렬** |
| 6    | 5s      | ■ STOP SESSION                                                        | 종료                                                                           |
| 7    | 10s     | 채팅 하단 **결론 호외 카드** 확인 + ↓ MARKDOWN 다운로드               | 결과물 5섹션 검증                                                              |

**5단계가 진짜 평가 포인트**. 사용자 개입이 토론 흐름을 흔드는 모습을 직접 보여줍니다.

---

## 3. 결과물 — 무엇을 보면 되나

### 화면에서

- **ChatView 호외 카드** — `## 결론 / ## 핵심 논점 / ## 사용자 개입 반영 / ## 미해결 / ## 액션 아이템` 5섹션
- **핵심 논점**의 `[Claude]` `[Codex]` `[Gemini]` 발언자 attribution → AI들이 진짜 다른 목소리 냈는지 한눈에
- **사용자 개입 반영** 섹션 → 인터럽트가 토론을 어떻게 흔들었는지 명시

### 디스크에서

- `./logs/{sessionId}.jsonl` — 모든 이벤트 append-only (token/agent_start/agent_end/user_message/usage/session_end/final_artifact 등 14종, AGENTS.md JSONL 섹션 참조)
- `./logs/sample-session.jsonl` — 미리 커밋된 50 event 샘플
- `↓ MARKDOWN` 다운로드 — transcript + 호외 합쳐진 단일 markdown

---

## 4. 평가 포인트 → 코드 위치

| 평가 항목                                | 진입 코드                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 직렬 라운드 알고리즘 (A3)                | `src/lib/orchestrator.ts` + `orchestrator-round.ts` (rotate + speakOnce 직렬)                 |
| 인터럽트 / 큐 / Pause·Resume / STOP (A6) | `src/lib/orchestrator.ts` (intervene/pause/resume/stop) + `roundAbort` vs `sessionAbort` 분리 |
| 6 어댑터 (Claude/Codex/Gemini × API/CLI) | `src/lib/agents/{claude-api,gpt-api,gemini-api,claude-cli,codex-cli,gemini-cli}.ts`           |
| 결과 정리 (A9)                           | `src/lib/summarizer.ts` (5섹션 강제 + speak() 우회)                                           |
| 종료 사유 4종 (A8)                       | `src/lib/orchestrator.ts` `checkSessionGate` (max_turns/budget/time/user_stop)                |
| JSONL 로거 + 시크릿 마스킹               | `src/lib/logger.ts` + `scripts/scrub-check.sh`                                                |
| 사용자 한도 변경 (clampLimits)           | `src/lib/orchestrator.ts:36-54` 안전 범위 박힘                                                |
| 운영 통찰 (왜 OAuth/직렬/인터럽트?)      | `README.md` §7                                                                                |

---

## 5. 검증 (이미 통과)

```bash
npm run typecheck                    # TypeScript strict 0 에러
npx tsx scripts/verify-orchestrator.ts  # 9 시나리오 회귀 (정상/인터럽트/타임아웃/에러/Pause-Resume/핫스왑/Pause-중-STOP/budget/time)
bash scripts/scrub-check.sh          # JSONL 시크릿 grep (0 hit 기대)
```

---

## 6. 트러블슈팅 — 자주 걸리는 것

| 증상                        | 원인                                            | 해결                                                                       |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| ▶ START SESSION 비활성      | 활성 어댑터 < 2 또는 주제 미입력                | ⚙ → AI 에이전트에서 2개 이상 + 사이드바 주제 입력                          |
| CLI 모드 "MISS" 표시        | spawn이 PATH 못 잡음 (GUI 실행 환경)            | 터미널에서 `which claude codex gemini` 후 같은 터미널에서 `npm run dev`    |
| 그래도 안 잡힘              | IDE PATH가 셸 PATH와 다름                       | `AGORA_CLAUDE_BIN=/abs/path/claude npm run dev` (3종 각각 env) — README §5 |
| API 잔액 부족 → errorStreak | 한 어댑터 3회 연속 실패                         | 다른 키로 교체, 활동 로그가 사유 표시                                      |
| Gemini CLI 한 줄도 안 나옴  | `~/.gemini/GEMINI.md`의 model 설정과 충돌(과거) | 이미 `-m` 플래그 제거함 (`gemini-cli.ts`)                                  |
| 시연이 너무 느림            | CLI는 매 라운드 cold-start 25~40s               | API 모드 권장 (§7 운영 통찰) — CLI는 "OAuth 대체" 증명용 1개만             |

---

## 7. 봐주실 것 / 알아두실 것

- **단일 사용자 로컬 시연 환경 가정** — 다중 사용자 배포는 별도 세션 토큰 + CSRF 강화 필요. README §7에 솔직 기재.
- **표준 OAuth 미구현** — Anthropic·OpenAI는 외부 앱용 OAuth 미공개라 CLI spawn이 사실상의 OAuth 대체. README §7에 사유.
- **새로고침 시 세션 복원 미지원** — URL에 sessionId 안 박음. 1차 제출 범위 외.
- **transcript 무제한** — 토큰 캡(default 100k)이 안전 net 역할.
- **시연 녹화 첨부 위치** — (제출 시 추가)

---

문의는 코드 진입점부터 읽으시고, ADR 의문은 `AGENTS.md` (단일 진실 출처)의 §A1~A9를 보세요. 평가 시간 내주셔서 감사합니다.

— 이은석
