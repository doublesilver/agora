# Agora — 사용자가 끼어들 수 있는 멀티 AI 토론 도구

> 베이글코드 신작팀 AI 개발자 채용 과제 제출물 (마감 2026-05-03 23:59 KST).

여러 AI 에이전트(Claude·GPT·Gemini)가 **직렬 라운드**로 자유 메시지를 주고받으며 사용자의 프롬프트를 협업 처리하는 웹 도구. 사용자는 토론에 **즉시 끼어들거나(interrupt)·다음 차례에 보태거나(queue)·일시정지/재개·종료**할 수 있고 전체 transcript를 실시간으로 관찰한다.

차별화 한 줄: **단순 다중 호출이 아니라 사용자가 토론에 끼어들 수 있는 도구**.

---

## 1. 개요

- 프론트엔드: Next.js 16 + TypeScript + Tailwind 4 (다크 default)
- 백엔드: Next.js Node.js runtime API routes (8개) + SSE 스트리밍 + JSONL append-only 로거
- 어댑터: Claude API / GPT API / Gemini API / Claude CLI (1차 제출 4개)
- 차별화 코드: 직렬 라운드 오케스트레이터 + 4종 사용자 개입(interrupt/queue/pause·resume/stop) + 30턴·50k토큰·5분 시간 캡 + 시스템 프롬프트 핫스왑

스크린샷 / 시연 녹화: M8 단계에서 첨부.

---

## 2. 사전 요구사항

- Node.js 20 이상 (개발: v25 검증)
- npm 11 이상
- (선택) `claude` CLI 설치·인증 — Claude CLI 모드 사용 시 필요. 설치 가이드: https://docs.anthropic.com/claude/docs/claude-cli
- 1개 이상의 API 키 또는 인증된 Claude CLI — 활성 에이전트 2개 이상이 모이면 협업 시작 가능

API 키는 다음 중에서 사용자가 UI에 직접 입력 (서버 디스크 미저장):

- Anthropic API key (https://console.anthropic.com)
- OpenAI API key (https://platform.openai.com/api-keys)
- Google Gemini API key (https://ai.google.dev/)

---

## 3. 설치·실행

```bash
git clone <REPO_URL> agora
cd agora
npm install
npm run dev
```

http://localhost:3000 접속 후:

1. 좌측 패널에서 사용할 AI 2개 이상 활성화
2. 모드 선택 (API: 키 입력 / CLI: 머신에 설치된 CLI 사용)
3. 토론 주제 입력 → "세션 시작"

⌘+Enter (또는 Ctrl+Enter)로 메시지 전송. Interrupt 모드는 진행 중 발언을 즉시 끊고, Queue 모드는 다음 라운드에 반영.

---

## 4. 환경변수

UI에서 키를 입력하면 환경변수는 불필요하다. dev 편의용으로만 `.env.example` 참조:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

> ⚠️ `.env.local`은 절대 커밋하지 않는다. `.gitignore`에 박제됨.

특수 옵션:

- `AGORA_FAKE=1 npm run dev` — 모든 어댑터를 fake echo로 강제 (UI/오케스트레이터 시연용)

---

## 5. CLI 모드 사용법 + 트러블슈팅

CLI 모드는 사용자 머신에 이미 OAuth/구독으로 인증된 1st-party CLI를 spawn해서 활용한다 (운영 통찰 §7 참조).

```bash
# 사전 확인
which claude     # /opt/homebrew/bin/claude 또는 동등 경로
claude --version # 실행 가능 여부
```

CLI 미설치/미인증 시 CLI 모드 선택은 가능하지만 라운드에서 `agent_error` 발생 후 PASS로 폴백된다.

| 증상                                      | 원인                                    | 해결                         |
| ----------------------------------------- | --------------------------------------- | ---------------------------- |
| `agent_error: claude CLI exited code=...` | 인증 만료                               | `claude` 한 번 실행해 재인증 |
| `agent_timeout (30s)`                     | 첫 토큰 지연 (네트워크/모델 부팅)       | 다음 라운드 자동 재시도      |
| 라운드 무한 PASS                          | API 키 잘못 (인증 실패가 PASS로 가려짐) | 좌패널에서 키 확인 후 재시작 |

---

## 6. JSONL 세션 로그

세션마다 `./logs/{sessionId}.jsonl`에 한 줄 = 한 이벤트로 append.

이벤트 종류 (스키마 단일 출처: `AGENTS.md` JSONL 섹션):

- `session_start` / `session_end` (reason: user_stop / max_turns / all_pass / budget_exceeded / time_exceeded)
- `agent_start` / `token` / `agent_end(interrupted)` / `agent_pass`
- `agent_timeout` / `agent_error`
- `user_message(mode: interrupt|queue)`
- `system_prompt_change`
- `status` (running|idle|paused|stopped)
- `usage` (input/output 토큰 + sessionTotal)

API 키 / OAuth 토큰은 절대 기록되지 않는다. 자동 검증: `bash scripts/scrub-check.sh logs/<id>.jsonl`.

---

## 7. 운영 통찰 — 왜 이렇게 만들었는가

10년차 외주 풀스택으로서 멀티 AI 도구를 굴려본 경험에서 본 결정 3개를 짧게 정리한다.

**왜 표준 OAuth를 구현하지 않았는가.** 채점자는 "구독제 로그인"을 기대하지만 현실은 다르다. Anthropic·OpenAI는 외부 앱용 OAuth provider를 일반 개발자에게 공개하지 않는다 ([Anthropic API Auth](https://docs.anthropic.com/claude/reference/getting-started-with-the-api), OpenAI Platform은 API 키 전용). 진짜 OAuth가 가능한 건 Google뿐이다. 그래서 Claude·OpenAI에 대해서는 "1st-party CLI를 spawn해 자기 토큰으로 호출"하는 방식이 사실상의 OAuth 대체다. UI에 가짜 OAuth 버튼을 두는 것보다 정직하다.

**왜 자유 메시지를 직렬 라운드로 만들었는가.** 처음엔 병렬 라운드(`Promise.all`)로 짰지만 같은 라운드 내 두 AI가 서로의 발언을 못 듣고 동시 발화하면 "엇갈린 독백"이 된다. 직렬로 바꾸자 즉시 토크쇼식 핑퐁이 살아났다. 라운드 wall-clock은 늘지만 SSE 토큰 단위 스트리밍이 사용자 체감 속도를 충분히 보전한다.

**왜 인터럽트는 라운드만 끊고 세션은 안 끊는가.** "사용자 의견 반영 후 다시 시작"이 STOP보다 훨씬 자연스럽다. `roundAbort`와 `sessionAbort`를 분리해 인터럽트는 현재 발언자 스트림만 abort하고 사용자 메시지를 transcript에 push한 뒤 새 라운드를 띄운다. STOP은 별개 버튼으로 명확히 분리해 사고를 막는다.

---

## 8. 제출물 안내

- `AGENTS.md` — 명세 단일 출처 (포지셔닝·ADR·아키텍처·검증 체크리스트)
- `PLAN.md` — 마일스톤 M0~M8 작업 계획
- `.omc/prd.json` — 스토리·인수기준 PRD (ralplan APPROVE 결과)
- `.omc/progress.txt` — 진행 로그·발견사항
- `.omc/notes/m0-recon.md` — SDK/CLI 사전 정찰 결과 (M0 산출물)
- `scripts/recon/*.ts` — SDK/CLI 호출 검증 미니 스크립트 4개
- `scripts/verify-*.ts` — fake 어댑터·오케스트레이터 6 시나리오·Claude CLI 어댑터 검증
- `scripts/verify-api.sh` — 8 API 라우트 + JSONL 통합 검증 7 케이스
- `scripts/scrub-check.sh` — JSONL 시크릿 grep 자동 검증
- `logs/sample-session.jsonl` — 샘플 JSONL 1건
- 화면 녹화: M8에서 본편(실어댑터) + 백업본(fake) 2개

---

## 라이선스 / 작성자

본 저장소는 채용 과제 제출용 단일 작가 작품이다. 외부 코드 기여는 받지 않는다.
