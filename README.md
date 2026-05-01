# Agora — 사용자가 끼어들 수 있는 멀티 AI 토론 도구

> 베이글코드 신작팀 AI 개발자 채용 과제 제출물 (마감 2026-05-03 23:59 KST).

여러 AI 에이전트(Claude·GPT·Gemini)가 **직렬 라운드**로 자유 메시지를 주고받으며 사용자의 프롬프트를 협업 처리하는 웹 도구. 사용자는 토론에 **즉시 끼어들거나(interrupt)·다음 차례에 보태거나(queue)·일시정지/재개·종료**할 수 있고 전체 transcript를 실시간으로 관찰한다.

차별화 한 줄: **단순 다중 호출이 아니라 사용자가 토론에 끼어들 수 있는 도구**.

---

## 1. 개요

- 프론트엔드: Next.js 16 + TypeScript + Tailwind 4 (다크 default), Pretendard / Noto Sans KR / JetBrains Mono
- 백엔드: Next.js Node.js runtime API routes (11개) + SSE 스트리밍 + JSONL append-only 로거
- 어댑터: Claude API/CLI · Codex(OpenAI) API/CLI · Gemini API/CLI — **6종 모두 1차 제출 포함**
- 차별화 코드:
  - 직렬 라운드 오케스트레이터 + 4종 사용자 개입(interrupt/queue/pause·resume/stop) + 30턴·50k토큰·5분 시간 캡 + 시스템 프롬프트 핫스왑
  - **결과 정리 담당(summarizer)** — 사용자가 지정한 1명이 종료 시 `결론/핵심논점/미해결/액션아이템` 4섹션 산출물 생성 (API + CLI 모드 모두 지원, ADR §A9)

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

1. 좌측 패널 → "AI 에이전트 설정" 모달 → 사용할 AI **2개 이상 활성화**
2. 모드 선택 (API: 키 입력 / CLI: 머신에 설치된 CLI 사용)
3. (선택) "📝 결과 정리 담당" 칩에서 1명 지정 — 종료 시 결론·핵심논점·미해결·액션아이템 4섹션 산출물 생성 (API+CLI 모두 가능)
4. 토론 주제 입력 → "세션 시작"

본편 reproduce에 필요한 인증 (활성화한 어댑터만 해당):

| 에이전트                | 모드 | 사전조건                                                                                        |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| Claude                  | API  | https://console.anthropic.com 에서 API 키 1개                                                   |
| Codex (OpenAI)          | API  | https://platform.openai.com/api-keys 에서 API 키 1개                                            |
| Gemini                  | API  | https://ai.google.dev/ 에서 API 키 1개                                                          |
| Claude / Codex / Gemini | CLI  | 머신에 `claude` / `codex` / `gemini` 가 설치·인증돼 있어야 (`which {cmd}` + `--version`로 확인) |

Enter로 전송 (Shift+Enter 줄바꿈). "즉시 끼어들기"는 진행 중 발언을 즉시 끊고, "다음 라운드"는 다음 라운드에 반영. 일시정지·재개·종료는 좌측 패널 컨트롤.

---

## 4. 환경변수

UI에서 키를 입력하면 환경변수는 불필요하다. dev 편의용으로만 `.env.example` 참조:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

> ⚠️ `.env.local`은 절대 커밋하지 않는다. `.gitignore`에 박제됨.

---

## 5. CLI 모드 사용법 + 트러블슈팅

CLI 모드는 사용자 머신에 이미 OAuth/구독으로 인증된 1st-party CLI를 spawn해서 활용한다 (운영 통찰 §7 참조). 3종 모두 지원.

```bash
# 사전 확인
which claude codex gemini   # 3개 모두 PATH 에 있으면 OK
claude --version
codex --version
gemini --version
```

각 CLI 호출 시그니처 (어댑터 내부에서 자동):

- Claude: `claude -p "<prompt>" --output-format stream-json --verbose`
- Codex: `codex exec --json --ephemeral --skip-git-repo-check --sandbox read-only "<prompt>"`
- Gemini: `gemini -p "<prompt>" -y -o json -m gemini-2.5-pro`

CLI 미설치/미인증·구독 한도 초과 시 라운드에서 `agent_error` 발생 후 PASS로 폴백 → 다음 라운드는 정상 시도.

> 💡 **MCP 도구 자동 활용**: CLI 모드는 사용자 머신의 1st-party CLI를 그대로 spawn하기 때문에 `~/.claude/mcp.json` 등 사용자가 등록한 MCP 서버가 토론 중 그대로 활용된다. 별도 통합 작업 없이 도메인 도구·로컬 파일·외부 API 모두 토론에 끌어들일 수 있음.

> 💡 **결과 정리 담당은 CLI도 지원**: 토론 종료 시 1회 호출이라 CLI cold-start(25~40s)를 흡수할 여유가 있어, 좌패널 "📝 결과 정리 담당" 칩은 API+키 후보 + CLI 인증된 후보를 모두 노출한다. CLI 모드는 `claude -p` / `codex exec --skip-git-repo-check --sandbox read-only` / `gemini -p -y -m gemini-2.5-flash`로 단발 spawn해 stdout을 받는다. 호출 실패 시 `summary_error` 한 번 emit되고 transcript·Export는 그대로 유지. 실시간 요약(rolling)은 호출 비용·UX 노이즈 균형이 안 맞아 1차 제출에서 제외. 자세한 ADR은 `AGENTS.md` §A9 참조.

| 증상                                      | 원인                                    | 해결                         |
| ----------------------------------------- | --------------------------------------- | ---------------------------- |
| `agent_error: claude CLI exited code=...` | 인증 만료                               | `claude` 한 번 실행해 재인증 |
| `agent_timeout (60s)`                     | 첫 토큰 지연 (네트워크/모델 부팅)       | 다음 라운드 자동 재시도      |
| 라운드 무한 PASS                          | API 키 잘못 (인증 실패가 PASS로 가려짐) | 좌패널에서 키 확인 후 재시작 |

---

## 6. JSONL 세션 로그

세션마다 `./logs/{sessionId}.jsonl`에 한 줄 = 한 이벤트로 append.

이벤트 종류 (스키마 단일 출처: `AGENTS.md` JSONL 섹션):

- `session_start` / `session_end` (reason: user_stop / max_turns / budget_exceeded / time_exceeded)
- `agent_start` / `token` / `agent_end(interrupted)` / `agent_pass`
- `agent_timeout` / `agent_error`
- `user_message(mode: interrupt|queue)`
- `system_prompt_change`
- `status` (running|idle|paused|stopped)
- `usage` (input/output 토큰 + sessionTotal)
- `final_artifact` / `summary_error` (결과 정리 담당 지정 시 종료 직전 1회, API+CLI 모드 모두)

API 키 / OAuth 토큰은 절대 기록되지 않는다. 자동 검증: `bash scripts/scrub-check.sh logs/<id>.jsonl`.

---

## 7. 운영 통찰 — 왜 이렇게 만들었는가

**왜 표준 OAuth를 구현하지 않았는가.** Anthropic·OpenAI는 외부 앱용 OAuth provider를 일반 개발자에게 공개하지 않는다 ([Anthropic API Auth](https://docs.anthropic.com/claude/reference/getting-started-with-the-api), OpenAI는 API 키 전용). 진짜 OAuth가 가능한 건 Google뿐. 그래서 Claude·OpenAI는 "1st-party CLI를 spawn해 자기 토큰으로 호출"하는 방식이 사실상의 OAuth 대체다. UI에 가짜 OAuth 버튼을 두는 것보다 정직하다.

**왜 자유 메시지를 직렬 라운드로 만들었는가.** 병렬 라운드(`Promise.all`)는 두 AI가 서로의 발언을 못 듣고 동시 발화해 "엇갈린 독백"이 된다. 직렬로 바꾸자 토크쇼식 핑퐁이 살아났다. SSE 토큰 스트리밍이 체감 속도를 보전한다.

**왜 인터럽트는 라운드만 끊고 세션은 안 끊는가.** "사용자 의견 반영 후 다시 시작"이 STOP보다 자연스럽다. `roundAbort`와 `sessionAbort`를 분리해 인터럽트는 현재 발언자 스트림만 abort하고 사용자 메시지를 transcript에 push한 뒤 새 라운드를 띄운다. STOP은 별개 버튼으로 사고를 막는다.

**보안 가정.** 단일 사용자 로컬 데모 환경 가정. sessionId는 UUIDv4(122-bit 엔트로피)라 추측 불가하지만 외부 노출 시 동일 세션의 stop/intervene/system-prompt 호출이 가능 — 다중 사용자 배포는 별도 세션 인증 토큰 + CORS 강화 필요. API 키는 클라 sessionStorage만 저장, 서버는 메모리 통과만(JSONL·콘솔·SSE 어디에도 echo 없음, `scrub-check.sh` 자동 검증).

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
