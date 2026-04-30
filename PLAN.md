# PLAN.md — Agora 구현 계획

마감: **2026-05-03 (일) 23:59 KST**
잔여: ~3일 7시간 (2026-04-30 17:00 기준)
목표 가용 시간: ~24h 작업, 마감까지 ~3일 7시간

**Step 4 + ralplan 패치 반영**:

- 어댑터 1차 제출 = **4개**: Claude API + GPT API + Claude CLI + Gemini API. 정직성 차별화 + 채점자 reproducibility 동시 확보.
- Export md만 (jsonl은 `./logs/`에서 직접). 새로고침 복원 컷.
- M0(SDK/CLI 사전 정찰) 1.5h로 격상 + recon 스크립트 4개 git 커밋 강제 → M3 위험 흡수.
- 데모 녹화 백업본 M6 끝에 fake 어댑터로 1회 (+0.3h).
- 시간 캡 `MAX_SESSION_DURATION_MS = 5min` 추가 (worst-case 45분 시연 사고 방지).
- README 운영 통찰 섹션 형식 가드레일(분량·필수 항목·외부 링크) AGENTS.md 포지셔닝에 박제.

마일스톤 합산: M0(1.5) + M1(1) + M2(1.5) + M4(3) + M5(3) + M6(5.8) + M3(4) + M7(2) + M8(2) = **23.8h** → 마감 안쪽 + ~7h 버퍼.

## 진행 순서 — 골격 우선

> 가짜(echo) 어댑터 2개로 오케스트레이터 + UI + SSE를 먼저 완성한다. SDK 막혀도 골격은 살아 있게.

```
M0 SDK/CLI 사전 정찰
  └─ M1 스캐폴드
       └─ M2 어댑터 인터페이스 + Fake 어댑터 2개
            └─ M4 오케스트레이터 + 강건성 (Fake 위에서 동작)
                 └─ M5 SSE API + JSONL 로거
                      └─ M6 UI (개입/STOP/핫스왑/Export-md 포함) → 백업 녹화
                           └─ M3 실제 어댑터 3개 (Claude API + GPT API + Claude CLI)
                                └─ M7 README + 검증
                                     └─ M8 본편 시연 녹화 + 제출
```

## 마일스톤

### M0. SDK/CLI 사전 정찰 — 1.5h

본격 어댑터(M3) 작성 전에 환경에서 어떤 게 실제로 동작하는지 미리 검증. 4개 경로 × ~22분.

각 경로별 미니 스크립트를 `scripts/recon/{경로}.ts`로 작성해 `npx tsx scripts/recon/anthropic.ts`처럼 실행·확인:

- `scripts/recon/anthropic.ts` — `@anthropic-ai/sdk` 최신, `messages.stream` 호출 시그니처·이벤트 형식·usage 위치 확인.
- `scripts/recon/openai.ts` — 현행 권장 API(Responses or Chat Completions) 결정 + 모델 ID 결정 (gpt-5.x). usage 위치 확인.
- `scripts/recon/gemini.ts` — `@google/genai` 최신, `generateContentStream` 시그니처·usage 위치 확인.
- `scripts/recon/claude-cli.ts` — `claude -p --output-format stream-json` 비대화형 호출, stdout 라인 경계 보장 여부·JSON 라인 포맷 확인 (R7 대비).

DoD:

- [ ] `scripts/recon/*.ts` 4개 파일 작성 + git 커밋 (커밋 SHA 메모).
- [ ] 4 경로 모두 "hello" 입력에 응답 받는 실행 통과 (인증 안 된 경로는 "skipped" 사유 1줄로 대체).
- [ ] `.omc/notes/m0-recon.md`에 4 경로별 1줄 이상 발견사항 + 권장 모델 ID + 라인 버퍼링 폴백 필요 여부.
- M3 진입 시 이 산출물을 그대로 카피해서 어댑터에 이식.

### M1. 스캐폴드 — 1h

- `npm create next-app@latest agora --ts --tailwind --app`
- `.gitignore`에 `node_modules`, `.next`, `.env*`, `logs/*.jsonl` (sample 제외).
- `.env.example` 빈 템플릿 + 주석.
- README skeleton (제목 + TODO).
- DoD: `npm run dev` → 빈 페이지 200 OK.

### M2. AgentAdapter 인터페이스 + Fake 2개 — 1.5h

- `src/lib/agents/types.ts` (AGENTS.md 인터페이스 그대로).
- `src/lib/agents/fake.ts`: 입력 transcript 마지막 메시지를 echo + 50% 확률 PASS, 토큰 단위 50ms 지연 yield.
- DoD: 노드 스크립트로 fake 어댑터 호출 → 토큰 스트림 + PASS 모두 관찰.

### M4. 오케스트레이터 + 강건성 — 3h

- `src/lib/transcript.ts` 단순 in-memory 배열.
- `src/lib/orchestrator.ts` 알고리즘 구현 (AGENTS.md A3 / A6 / A7 / A8 합산).
- `src/lib/session-store.ts` Map<sessionId, SessionState>.
- 어댑터 호출을 `withTimeout(30s)` + `withErrorCapture` 래퍼로 감싼다 → 타임아웃/에러 시 PASS 결과로 변환하고 `agent_timeout` / `agent_error` 이벤트 emit.
- 토큰 예산 누적: 각 라운드 종료 시 `result.usage()` 호출 결과를 세션 카운터에 합산 → 캡 도달 시 STOP. Fake 어댑터는 추정치 반환.
- DoD: Fake 2개 + 의도적 타임아웃·예외·예산 시나리오로 노드 스크립트 통과 — 라운드/PASS/idle/abort + 타임아웃·에러·예산 자동 STOP 확인.

### M5. SSE API + JSONL 로거 — 3h

- 모든 API route 파일 상단에 `export const runtime = 'nodejs'`와 `export const dynamic = 'force-dynamic'` 박제 (R6 대비 — edge로 떨어지면 child_process 사망).
- `src/lib/logger.ts`: append-only `fs.createWriteStream(...{flags:'a'})`. flushSync.
- `/api/session` POST → sessionId + agents + systemPrompts 받아 SessionState 생성, 로그 파일 오픈, `session_start` 기록.
- `/api/stream` GET (SSE) → sessionId 쿼리, 오케스트레이터 이벤트 emit. ReadableStream + `text/event-stream` + 30초 keepalive 코멘트.
- `/api/intervene` POST `{text, mode: 'interrupt'|'queue'}` → interrupt면 `roundAbort.abort()` + push, queue면 push만.
- `/api/system-prompt` POST `{agentId, prompt}` → 세션의 해당 에이전트 시스템 프롬프트 교체, `system_prompt_change` 이벤트 emit/log. 다음 라운드부터 적용.
- `/api/pause` POST → `status='paused'`.
- `/api/resume` POST → `status='running'` + resume 이벤트 fire.
- `/api/stop` POST → `sessionAbort.abort()`.
- `/api/export` GET `?id=...` → md 첨부 파일 응답 (jsonl은 `./logs/`에서 직접 가져감 — UI 노출 안 함).
- DoD: curl 시나리오로 인터럽트/큐/일시정지/재개/핫스왑/Export-md/STOP 7 케이스가 모두 SSE 이벤트와 JSONL 라인에 의도대로 찍힘.

### M6. UI + 백업 녹화 — 5.8h (vertical slice 2단계)

레이아웃: 좌측 접이식 패널(`LeftPanel`) + 우측 메인(`ChatView`+`InterventionInput`) + 상단 `HeaderBar`. 다크모드 default. Tailwind만으로 스타일.

#### M6-V1. 동작하는 최소 (3h)

협업이 화면에서 보이고 STOP까지 가는 최소 골격. 인터럽트·핫스왑·Export·예산바는 V2로.

- `LeftPanel` 최소: 인증 행 3개(활성 토글 + 모드 + 키 입력) + "세션 시작" 버튼. 시스템 프롬프트는 `defaultValue`로만 (편집은 V2). 시작 후 락.
- `ChatView`: 단일 시간순 스레드, 에이전트별 색깔, 토큰 append, PASS 라벨, 자동 스크롤.
- `InterventionInput`: 입력창 + Send (모드 토글 V2). 일단 `mode='queue'` 고정.
- `HeaderBar`: 상태 뱃지 + 라운드 카운터 (Export·예산바 V2).
- 시작 시: sessionStorage에서 키 읽어 헤더로 `/api/session` POST → sessionId 받음 → EventSource로 `/api/stream?sessionId=` 구독.
- STOP 버튼만 동작.
- DoD V1: fake 두 개로 협업 시연 — 메시지 흐름·자동 스크롤·STOP 정상.

#### M6-V2. 개입·핫스왑·Export·예산·녹화 (2.5h + 백업 녹화 0.3h)

- `InterventionInput` 모드 토글 [Interrupt | Queue] + 인터럽트 메시지 잘림 표시 "(interrupted)".
- PAUSE/RESUME 버튼 + paused 상태 시각화.
- 시스템 프롬프트 `PromptEditor` 핫스왑 + Reset to default 버튼.
- "Export Markdown" 버튼 (HeaderBar).
- 토큰 예산 진행률 바 + 도달 시 자동 STOP 표시.
- 시간 캡 도달 시 자동 STOP 표시 (`session_end.reason='time_exceeded'` SSE 처리).
- DoD V2: fake 위에서 인터럽트/큐, PAUSE·RESUME, 핫스왑, Export-md, 예산 도달 자동 STOP, 시간 캡 도달 자동 STOP 모두 동작.

**M6 끝 — 백업 녹화 (+0.3h)**: fake 어댑터 위에서 본편 시나리오를 1회 풀 녹화. 본편 녹화 사고 시 fallback. `assets/demo-fake.mp4`로 보관, README에는 본편만 링크.

### M3. 실제 어댑터 4개 — 4h

1차 제출 범위: **Claude API + GPT API + Gemini API + Claude CLI**. M0 정찰 결과를 그대로 참조하므로 시그니처 헤매지 않는다.

1. **Claude API** — `@anthropic-ai/sdk`, M0에서 확인한 스트림 메서드. `usage()` 콜백에서 input/output 토큰 반환.
2. **GPT API** — `openai`, M0에서 결정한 API. usage 메타 추출.
3. **Gemini API** — `@google/genai`, `generateContentStream`. usage 메타 추출.
4. **Claude CLI** — `child_process.spawn('claude', [...M0에서 확인한 플래그])`. stdout 라인 파싱 (R7 폴백 적용). usage는 추정(글자 수/4) 폴백.

각 어댑터:

- transcript → 단일 user 메시지 문자열로 직렬화 (멀티턴 컨텍스트 매번 재전송).
- 응답을 `trim()`해서 정확히 `[PASS]`이면 `{kind:'pass'}`.
- 시스템 프롬프트 말미에 `[PASS]` 규약 강제 주입 (어댑터 책임).
- AbortSignal 연결.

DoD:

- [ ] 4개 어댑터 단위 호출 통과 (`scripts/recon/*` 결과와 일치).
- [ ] 두 API 어댑터(예: Claude+GPT)로 활성 세션 1회 협업 — 각 라운드 ≥3턴, agent_pass + agent_end 모두 발생, JSONL 라인 수 ≥ 20.
- [ ] Claude CLI 단독으로 협업 1회 (인증된 머신 기준) — 본인 머신 시연용.

**시간 남으면**: Codex CLI → Gemini CLI 순으로 추가. 각 ~1h.

### M7. README + .env.example 마무리 + 검증 — 2h

README 섹션:

1. 개요 + 스크린샷/녹화 링크
2. 사전 요구사항 (Node 20+, 선택: claude/codex/gemini CLI 인증)
3. 설치·실행 (`git clone && npm i && npm run dev`)
4. 환경변수 (없음 — 키는 UI 입력)
5. CLI 모드 사용법 + 트러블슈팅 (`which claude` 등)
6. JSONL 로그 위치 + 스키마 요약
7. **운영 통찰** (차별화 핵심) — AGENTS.md 포지셔닝 가드레일 그대로 적용:
   - 분량 300~500자
   - 강제 포함: ① 왜 표준 OAuth 미구현 ② 왜 직렬 라운드 자유 메시지 ③ 왜 인터럽트가 라운드만 끊고 세션 안 끊음
   - 외부 참조 링크 1개 이상
8. 제출물 안내 (AGENTS.md, PLAN.md, 샘플 로그, 화면 녹화)

검증: 빈 디렉토리에서 신규 `git clone` → `npm i` → `npm run dev` → 채점 시나리오 1회 처음부터 끝까지.

### M8. 본편 시연 녹화 + 샘플 로그 + 제출 — 2h

- 본편 화면 녹화 (실제 어댑터): 게임 기획 토론 시나리오 — "서바이벌 게임의 에너지 시스템을 설계해줘" → 두 AI 토론 → 사용자가 "타겟은 라이트 게이머다" 인터럽트 → 토론 재정렬 → 종료.
- **시간 박스**: 90~150초. 30초 초과 단일 발화 없음(미리 타임아웃 발동 확인). 시연 시간이 시간 캡 5분 안에 안전히 들어감.
- 녹화 직전 시크릿 노출 점검: 좌측 패널 인증 입력은 `type="password"`로 감춰진 상태 + DevTools sessionStorage 닫힘 (R9). 녹화 후 첫 1분 시각 검수.
- 백업본(M6 끝에서 확보한 fake 녹화)이 안전망.
- `logs/sample-session.jsonl` 1개 커밋 (시크릿 grep 확인 — 자동 스크립트 `scripts/scrub-check.sh`).
- GitHub repo public 푸시 + 마지막 커밋 해시 메모. (zip 선호 시 zip 생성으로 대체)

## 리스크 & 완화

| 리스크                                        | 영향             | 완화                                                                            |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| R1 OpenAI/Anthropic/Google SDK 버전·API 변경  | M3 지연          | M0 정찰에서 1ping 통과 후 진입, 1개씩 검증, recon 스크립트가 어댑터 baseline    |
| R2 CLI 모드 OS·PATH 차이                      | CLI 전반         | `which` 확인 → 없으면 UI 비활성 + README 명시. API 4개로 합격 조건 충족         |
| R3 자유 메시지 무한 발화 루프                 | UX/비용          | N=2회 연속 PASS = idle, MAX_TURNS=30, 토큰 캡, 시간 캡 4중                      |
| R4 SSE 끊김(브라우저 idle)                    | UX               | 30초마다 keepalive 코멘트 라인 (M5에 박제)                                      |
| R5 시크릿 누출                                | 치명             | 서버 디스크 미저장, JSONL/콘솔 키 출력 금지, `scripts/scrub-check.sh` 자동 검증 |
| R6 SSE Node runtime + Next.js 15 edge 폴백    | M5/M3 CLI 사망   | 모든 API route에 `runtime='nodejs'` + `dynamic='force-dynamic'` 박제 (M5)       |
| R7 CLI stdout 라인 버퍼링/부분 토큰           | CLI 어댑터 깨짐  | M0 정찰에서 라인 경계 보장 여부 확인, 깨지면 `readline.createInterface` 폴백    |
| R8 토큰 캡 산술 미스매치(시연 중 갑자기 STOP) | 시연 NG          | M8 직전 dry-run으로 평균 라운드 토큰 측정, 데모용 임시 100k 상향 옵션           |
| R9 녹화 시 API 키 화면 노출                   | 치명             | input `type=password` + DevTools sessionStorage 닫힘 + 녹화 후 1분 시각 검수    |
| R10 macOS dev 서버 좀비화                     | 디버깅 시간 증발 | 매 마일스톤 종료 시 `pkill -f "next dev"` 후 재기동                             |

## 작업 외 — 제출 산출물 체크

- [ ] AGENTS.md (✅ 작성 완료)
- [ ] PLAN.md (✅ 본 파일)
- [ ] README.md
- [ ] .env.example
- [ ] 작동 코드 (GitHub repo)
- [ ] 화면 녹화 1개 (~2분)
- [ ] logs/sample-session.jsonl 1개

## 다음 액션

1. 본 PLAN.md 사용자 승인.
2. 승인 시 M1 스캐폴드 시작 (`npm create next-app@latest agora ...`) — 단, 디렉토리에 이미 AGENTS.md/PLAN.md/.omc가 있어 빈 폴더 모드가 안 되므로 `--use-npm`로 현재 디렉토리에 init하거나 임시 폴더로 만든 뒤 파일 이동.
