# AGENTS.md — Agora Multi-Agent Collaboration Tool

이 문서는 AI 코딩 에이전트(Claude Code / Codex / Gemini CLI)가 이 프로젝트를 개발할 때 참조하는 단일 진실 가이드다.
구조·결정·컨벤션이 여기 적힌 것과 다르면 코드를 고치지 말고 이 문서를 먼저 갱신한다.

## 프로젝트 목표

사용자가 웹 UI에 프롬프트를 입력하면, 인증된 2개 이상의 AI 에이전트가 **실시간으로 자유 메시지**를 주고받으며 답을 도출한다. 사용자는 언제든 개입(메시지 끼워넣기, 일시정지, 재개, 종료) 가능하고 전체 전사를 관찰한다.

## 포지셔닝 — 무엇을 증명하는 결과물인가

1차 독자: **베이글코드 신작팀 채용 담당** — 게임 기획·시스템 설계에 친숙. 단순 통과가 아니라 "본인의 멀티에이전트 운영 통찰"을 보여주는 채널이다.

차별화 한 줄: **"사용자가 AI들의 토론에 끼어들 수 있는 도구"**. 단순 다중 호출이 아니라 **개입 가능성**이 핵심 포지셔닝.

README는 두 섹션으로:

1. **실행 가이드** — clone·install·run 5분 안에 띄운다.
2. **운영 통찰** (차별화 핵심, 형식 가드레일):
   - 분량 300~500자.
   - 강제 포함 3개 항목:
     1. 왜 표준 OAuth를 구현하지 않았는가 (Anthropic·OpenAI provider 부재 → CLI 모드가 사실상의 OAuth 대체)
     2. 왜 자유 메시지를 직렬 라운드로 만들었는가 (병렬은 동시 발화 어색, 직렬이 토크쇼식 핑퐁)
     3. 왜 인터럽트가 라운드만 끊고 세션은 안 끊는가 (사용자 의견 반영 후 다시 시작이 STOP보다 자연스러움)
   - 외부 참조 링크 최소 1개 (예: Anthropic API 정책, OpenAI Platform 도큐 등).
   - 채점자가 "이게 진짜 통찰인가" 한 번에 판정 가능한 구조 우선.

데모 녹화 시나리오: **게임 기획 토론** (예: "서바이벌 게임의 에너지 시스템을 설계해줘"). 두 AI가 토론하다 사용자가 "타겟 유저는 라이트 게이머다" 같은 제약을 인터럽트로 끼워넣고 토론이 그에 맞게 재정렬되는 흐름을 보여준다. 베이글코드 신작팀 도메인 정조준.

원본 과제 조건:

- 2개 이상 AI 에이전트가 메시지 교환
- 사용자 개입/관찰 가능
- 통신/프로토콜/UI/언어 자유
- AI 코딩 에이전트로 개발
- README 대로 실행 시 동작
- 제출: 작동 코드 + 에이전트 .md + JSONL 로그 또는 화면 녹화

마감: **2026-05-03 (일) 23:59 KST**.

## 핵심 결정 (ADR 압축)

### A1. 지원 에이전트

Claude (Anthropic) / Codex (OpenAI) / Gemini (Google) — 사용자가 이 중 **2개 이상 인증**하면 협업 시작 가능. 3개 다 인증 시 3자 협업.

### A2. 인증 모드 — API 키 + CLI 이중 (표준 OAuth는 미구현)

- **API 모드**: UI에 API 키 입력 → 브라우저 `sessionStorage`에만 저장, 서버 디스크 미저장. 서버 호출 시 HTTP 헤더로 전달, 메모리 내 세션 컨텍스트에서만 사용.
- **CLI 모드 (구독/OAuth 사실상의 대체)**: 사용자 머신에 이미 OAuth/구독으로 인증된 `claude` / `codex` / `gemini` CLI를 `child_process.spawn` → stdin/stdout 통신. 1st-party CLI가 자기 토큰으로 호출하므로 **사용자 구독·OAuth 인증을 우리 앱이 간접 활용**.
- **표준 OAuth는 구현하지 않는다**:
  - Anthropic·OpenAI는 외부 앱용 OAuth provider를 일반 개발자에게 공개하지 않음 → 진짜 OAuth client 등록 불가.
  - Google만 진짜 OAuth가 가능하지만 마감과 일관성 위해 1차 제출에선 모든 프로바이더에 동일한 API/CLI 두 모드만 제공.
  - README "운영 통찰"에 이 결정의 사유를 솔직히 풀어 쓴다.
- UI 라벨도 `[OAuth]` 대신 정직하게 `[API | CLI]` 두 옵션만.
- 에이전트별로 모드 독립 선택 가능 (예: Claude=CLI, Codex=API, Gemini=API).

### A3. 협업 패턴 — 자유 메시지 (직렬 라운드)

- 모든 활성 에이전트는 공유 transcript를 본다.
- 한 라운드 = 활성 에이전트를 **순서대로 한 명씩** 호출 (직렬). 다음 발언자는 직전 발언자가 transcript에 푸시한 메시지를 그대로 입력으로 받아 즉시 반응한다 → 진짜 토크쇼식 핑퐁.
- 각 발언 차례에서 에이전트는 발화 또는 `[PASS]` 선택.
- 발언 순서는 라운드마다 1칸씩 시프트해서 발언권을 회전 (예: 활성 [A,B,C] → 라운드1 A→B→C, 라운드2 B→C→A, 라운드3 C→A→B).
- 한 라운드 통째 모두 PASS → consecutivePass +1.
- consecutivePass ≥ 2 → 사용자 발화권 (idle, 사용자 메시지 또는 STOP 대기).
- 종료 조건: 사용자 STOP, 최대 턴(기본 30) 도달, 토큰 예산 캡 도달 (A8).

### A6. 사용자 개입 — 4종

1. **즉시 인터럽트 (interrupt)** — 사용자 메시지 전송 시 모드에 따라 분기:
   - `mode=interrupt`(기본): 진행 중 라운드의 `roundAbort`를 fire → **현재 발언 중인 에이전트의 스트림 즉시 중단** + 라운드 통째 종료 (남은 발언자는 호출 안 함) → 부분 응답은 `agent_end(interrupted:true)`로 마감하고 (인터럽트 시점까지 누적된 텍스트는 transcript에 발화로 push되어 다음 라운드 화자가 본다 — "그 자리까지 한 말은 발언으로 인정") → 사용자 메시지를 transcript에 push → 새 라운드 시작 (다음 발언자가 사용자 메시지 직접 받아 반응).
   - `mode=queue`: 메시지를 대기 큐에 enqueue → 다음 라운드 시작 시 transcript에 반영 (기존 동작).
   - 토글은 `InterventionInput` UI에서 사용자가 선택.
2. **일시정지 / 재개 (pause / resume)** — 라운드 경계에서 멈춤:
   - `pause`: 현재 라운드 종료 후 다음 라운드 시작 직전 `paused` 상태 진입 (진행 중 토큰은 자르지 않음).
   - `resume`: 다시 라운드 진행.
   - 일시정지 중에도 사용자는 메시지 입력·STOP 가능. 메시지 입력은 큐 모드와 동일하게 enqueue, 재개 시 반영.
3. **STOP** — 세션 통째 종료 (기존).
4. **관찰** — 토큰 단위 SSE 스트리밍 + 에이전트별 색깔 말풍선 + PASS 라벨 + JSONL 실시간 append.

향후 확장 후보(시간 여유 시): 에이전트 활성 토글, 타겟 발화(`@claude ...`).

### A7. 시스템 프롬프트 핫스왑

- 진행 중에도 좌측 패널의 시스템 프롬프트 textarea를 편집·저장 가능. 다음 라운드부터 새 프롬프트가 어댑터에 전달된다 (이번 라운드는 자르지 않음).
- 인증·활성 에이전트 추가/제거는 **락**. 변경하려면 새 세션.
- `system_prompt_change` 이벤트로 SSE/JSONL에 기록.

### A8. 강건성 — 타임아웃·에러·예산

- **에이전트 타임아웃**: 라운드당 한 에이전트가 60초 안에 첫 토큰을 못 보내면 abort → 그 라운드는 PASS 처리 + `agent_timeout` 이벤트 로그. 60초는 상수 `AGENT_FIRST_TOKEN_TIMEOUT_MS = 60_000`로 분리. CLI cold-start(~25s) + 추론 latency를 흡수하기 위한 값.
- **에러 처리**: SDK throw 또는 CLI 비정상 종료 시 그 라운드 PASS + UI에 빨간 에러 라벨 한 줄("Codex: <짧은 메시지>"). 자동 재시도 없음. 다음 라운드부터 정상 시도. `agent_error` 이벤트 로그.
- **토큰 예산 캡**: 세션 전체 누적 입력+출력 토큰 `MAX_SESSION_TOKENS = 100_000` 도달 시 자동 STOP, 사유 `budget_exceeded` (한 라운드 평균 6~12k이라 시연·결과 산출물까지 6~12라운드 이상 도달 가능, 안전 net 역할). 헤더 바에 진행률 표시. 카운팅은 SDK가 반환하는 usage 메타로 누적, CLI 모드는 응답 글자 수의 1/4 (대략) 추정 폴백. 사용자가 ⚙ 설정에서 1k~1M 사이로 조정 가능.
- **transcript 무제한**: 슬라이딩 윈도우·요약 도입하지 않음. 토큰 캡이 먼저 도달하므로 컨텍스트 폭주 방지는 캡에 위임.
- **PASS 판정**: 응답을 `trim()`해서 정확히 문자열 `[PASS]`이면 pass. 그 외 발화로 처리. 시스템 프롬프트 말미에 다음 문장 강제 주입(어댑터 레이어):
  ```
  Reply with the literal token "[PASS]" and nothing else if you have nothing meaningful to add this round.
  ```
- **MAX_TURNS = 30** (이미 A3). 도달 시 reason `max_turns`.
- **MAX_SESSION_DURATION_MS = 5 \* 60_000 (5분)**: 세션 시작 시각부터 경과 시간이 5분을 넘으면 자동 STOP, 사유 `time_exceeded`. 본편 시연(M8) 시간 박스(90~150초)와 정합. 매 라운드 시작 시 + 토큰 청크 emit 시 모두 체크 (디바운스 안 함, 정확성 우선).

### A4. 통신

- 클라 → 서버: `fetch` POST (세션 시작, 사용자 개입, 종료).
- 서버 → 클라: **SSE** 단방향 스트리밍 (토큰/상태 이벤트).
- 서버 ↔ 에이전트: API 모드는 SDK 스트리밍, CLI 모드는 stdout 라인 파싱.
- 모든 이벤트는 동시에 `./logs/{sessionId}.jsonl`에 append.

### A5. 도메인 — 범용 + 기본 역할 시드 항상 적용

어떤 프롬프트든 받음. 시스템 프롬프트로 에이전트 역할을 약하게 차별화한다.

기본 역할 시드 (항상 존재):

- Claude → "구조화·요약·메타 검토"
- Codex → "구현·코드·구체화"
- Gemini → "대안 제시·반례·검증"

처리 규칙:

- 좌측 패널의 시스템 프롬프트 textarea는 **`defaultValue`로 시드를 미리 채워둔다** (placeholder 아님 — 그대로 시작 가능).
- 사용자가 수정·저장하면 그 값 사용.
- 사용자가 비워서 저장한 경우(빈 문자열·공백만), 백엔드에서 감지하여 **자동으로 시드로 fallback**.
- textarea 옆에 작은 `↺ Reset to default` 버튼 — 클릭 시 시드로 복원.
- 시드 문자열은 `src/lib/agents/role-seeds.ts` 상수로 분리, UI/백엔드 양쪽 단일 출처.

### A8.1 CLI binary 자동감지 + 환경변수 override

CLI 모드 어댑터(claude/codex/gemini)는 Node `child_process.spawn`으로 호출되는데, spawn은 셸이 아니라 부모 프로세스의 `PATH`만 그대로 상속한다. 면접관/채점자가 GUI(VSCode/Cursor "Run", Finder)로 dev 서버를 띄우면 IDE PATH에 `~/.npm-global/bin`, `/opt/homebrew/bin`이 빠져 있어 `claude`/`codex`/`gemini`가 안 잡히는 케이스가 흔하다.

대응 두 단계:

1. **권장 1순위**: 터미널에서 `which claude codex gemini`로 사전 확인 후 같은 터미널에서 `npm run dev`. README §5에 박제.
2. **fallback**: 환경변수 절대경로 override를 도입(`src/lib/agents/cli-stream.ts`의 `resolveCliBin(id)`). 셋 중 어느 하나만 PATH 못 잡혀도 그 id에만 박아주면 됨.

```bash
AGORA_CLAUDE_BIN=/abs/path/claude \
AGORA_CODEX_BIN=/abs/path/codex \
AGORA_GEMINI_BIN=/abs/path/gemini \
npm run dev
```

`resolveCliBin`은 환경변수 우선, 없으면 default 명령(`id` 그대로) 반환. `cli-status` 라우트도 동일 함수를 거쳐 감지하므로 좌패널 카드에 경로가 그대로 노출돼 사용자가 override 적용 여부를 시각 확인 가능. override 실패 시 hint에 사유와 재시도 가이드.

### A9. 결과 정리 담당 (final 산출물)

토론 종료 시 결과물을 한 번에 회수할 수 있게 **결과 정리 담당(summarizer)** 한 명을 사용자가 좌패널에서 지정한다. 1차 제출에서는 종료 시 1회 final 산출물만 생성한다 (rolling 요약은 호출 비용·UX 노이즈 균형이 맞지 않아 제외).

- **선택**: 좌패널 "📝 결과 정리 담당" 섹션. 활성 에이전트 중 **API 모드(키 입력) 또는 CLI 모드(인증 확인)** 후보를 모두 노출. 미지정 시 산출물 비활성 — transcript와 Export(markdown)는 그대로.
- **final 산출물**: `session_end` 직전 한 번 호출. `## 결론 / ## 핵심 논점 / ## 사용자 개입 반영 / ## 미해결 / ## 액션 아이템` 5섹션 markdown 강제. `핵심 논점`은 발언자 attribution(`[Claude]`/`[Codex]`/`[Gemini]`) 필수. `사용자 개입 반영`은 USER 발언이 토론에 어떻게 반영됐는지 1~2문장(없으면 "없음"). 결과는 `final_artifact` 이벤트로 SSE+JSONL emit.
- **단발 호출 정책**: 산출물 생성은 `speak()`를 우회한다 — PASS 규약·라운드 시그널이 끼면 압축 의도와 충돌하기 때문. 어댑터 인터페이스 일관성을 한 번 깨는 대신 호출 비용·지연을 격리.
  - **API 모드**: SDK 단발 호출 (Anthropic `messages.create` / OpenAI `chat.completions.create` / GoogleGenAI `generateContent`). 타임아웃 45s + AbortController. `state.sessionAbort.signal`과 합성되어 STOP 시 즉시 끊긴다.
  - **CLI 모드**: 1st-party CLI를 `runCliOneshot`(stdout 통째 collect)로 한 번 spawn. 시그니처는 `claude -p "<prompt>"` / `codex exec --skip-git-repo-check --sandbox read-only "<prompt>"` / `gemini -p "<prompt>" -y -m gemini-2.5-flash`. 타임아웃 90s (cold-start 25~40s 흡수).
- **Export 합치기**: `transcriptToMarkdown`이 `eventLog`에서 가장 최근 `final_artifact`를 찾아 transcript 뒤에 append. JSONL 원본을 보지 않는 채점자도 markdown 한 개로 결론까지 도달.

## UI/UX 설계

### 레이아웃 — 단일 페이지, 좌측 접이식 패널 + 우측 메인 채팅

- 좌측 패널 (collapsible, 기본 expand): 인증/모드 행 3개(Claude·Codex·Gemini), 시스템 프롬프트 textarea 3개, "세션 시작" 버튼, 세션 진행 중에는 PAUSE/RESUME/STOP 컨트롤. 세션 진행 중에도 **시스템 프롬프트 편집·저장 가능 (핫스왑)**.
- 우측 메인: 단일 시간순 transcript 스레드. 에이전트별 색깔·아바타로 발화자 구분 (Slack 메타포). PASS는 옅은 회색 작은 라벨. 인터럽트로 잘린 메시지는 "(interrupted)" 배지. 하단 고정: `InterventionInput` (입력창 + 모드 토글 [Interrupt | Queue] + Send).
- 상단 헤더: 상태 뱃지 (running / idle / paused / stopped), 라운드 카운터, "Export Markdown" 버튼, 토큰 예산 진행률 바 (현재/`MAX_SESSION_TOKENS`).

### 시각 톤

- 다크모드 default (라이트 토글 없음 — 시간 절약).
- 모바일 반응형 미지원 (데스크탑 시연 전제, README에 명시).
- 토큰/비용 표시 미포함 (시간 여유 시 후속).

### 시작 후 변경 정책

- **시스템 프롬프트**: 진행 중 편집 가능. 저장 시 다음 라운드부터 적용. (`A7`)
- **인증·활성 에이전트 목록·모드(api/cli)**: 락. 바꾸려면 STOP 후 새 세션.

### 새로고침/재접속 — 미지원

- 1차 제출에서는 새로고침 시 새 세션 시작으로 회귀 (URL에 sessionId 안 박음). README에 명시.
- 서버 재시작 시 in-memory 세션은 사라지지만 `./logs/{sessionId}.jsonl`은 디스크에 남아 별도 분석 가능.
- 시간 여유 시 후속: URL sessionId + `GET /api/session/{id}` 메모리 복원.

### Export

- `GET /api/export?id={id}` → markdown 첨부 다운로드 (발화자 헤더 + 메시지).
- jsonl 원본은 UI에 노출하지 않음. 채점자/사용자는 `./logs/{sessionId}.jsonl`에서 직접 가져감 (README에 명시).

### API 모델 — 고정값

- Claude: `claude-opus-4-7`
- Codex (OpenAI): GPT-5 계열 SOTA (M3 진입 시 docs로 정확한 모델 ID 확인)
- Gemini: `gemini-2.5-pro` 계열 (M3 진입 시 docs로 확인)
- 드롭다운 미제공. 시간 여유 시 후속.

## 스택

- Next.js 16 (App Router) + TypeScript (strict) + Tailwind v4
- Node.js runtime API routes (edge 아님 — `child_process` 필요)
- SDK: `@anthropic-ai/sdk`, `openai`, `@google/genai`
- 로깅: 자체 JSONL writer (외부 의존성 없음)

## 디렉토리

```
~/Projects/agora/
├── AGENTS.md
├── PLAN.md
├── README.md
├── .env.example
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # 메인 UI
│   │   └── api/
│   │       ├── session/route.ts        # POST 시작 (GET 복원은 후속)
│   │       ├── stream/route.ts         # SSE 스트림
│   │       ├── intervene/route.ts      # 사용자 개입 (mode: interrupt | queue)
│   │       ├── system-prompt/route.ts  # 시스템 프롬프트 핫스왑
│   │       ├── pause/route.ts          # 일시정지
│   │       ├── resume/route.ts         # 재개
│   │       ├── stop/route.ts           # 세션 종료
│   │       └── export/route.ts         # transcript md/jsonl 다운로드
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── types.ts                # AgentAdapter 인터페이스
│   │   │   ├── role-seeds.ts           # 기본 역할 시스템 프롬프트 상수 (A5)
│   │   │   ├── adapter-helpers.ts      # transcript 직렬화 + 시스템 프롬프트 augment
│   │   │   ├── cli-stream.ts           # CLI 어댑터 공용 spawn/stream/abort 헬퍼
│   │   │   ├── fake.ts                 # 시연·테스트용 fake echo 어댑터
│   │   │   ├── claude-api.ts
│   │   │   ├── claude-cli.ts
│   │   │   ├── gpt-api.ts              # Codex(OpenAI) API 어댑터 — id="codex"이지만 SDK가 `openai`라 파일명만 gpt-api
│   │   │   ├── codex-cli.ts
│   │   │   ├── gemini-api.ts
│   │   │   └── gemini-cli.ts
│   │   ├── orchestrator.ts             # entry — createSessionState/runSession/intervene/pause/resume/stop
│   │   ├── orchestrator-round.ts       # 한 라운드 = 화자 회전 + 직렬 호출
│   │   ├── orchestrator-stream.ts      # 발화자 토큰 스트림 + 첫 토큰 timeout + 시간캡 재검사
│   │   ├── summarizer.ts               # 요약 담당 단발 호출 (rolling/final, 1차: API 모드 3종)
│   │   ├── transcript.ts               # 공유 transcript 상태
│   │   ├── logger.ts                   # JSONL append-only 로거
│   │   ├── markdown-export.ts          # transcript + final_artifact → Markdown
│   │   ├── session-store.ts            # in-memory 세션 맵 + OrchestratorEvent 단일 출처
│   │   └── client/                     # 클라이언트 측 hook·타입·friendly-error·config-io
│   └── components/
│       ├── LeftPanel.tsx               # 인증/시스템프롬프트/요약담당/컨트롤
│       ├── ChatView.tsx                # 단일 시간순 스레드 + 실시간 요약 + 최종 산출물 카드
│       ├── InterventionInput.tsx       # 입력창 + mode 토글 + Send + 슬래시 커맨드
│       ├── HeaderBar.tsx               # 상태 뱃지·라운드·Export
│       ├── AgentStrip.tsx              # 발화자 상태 인디케이터 행
│       └── ActivityLog.tsx             # 메타 이벤트 라이브 피드
└── logs/                                # 런타임 생성, .gitignore에 추가하지 않음(샘플 1개 커밋)
```

## 인터페이스 — AgentAdapter

```ts
type AgentId = "claude" | "codex" | "gemini";
type AgentMode = "api" | "cli";

interface SpeakInput {
  transcript: TranscriptEvent[]; // 공유 메시지 스트림
  systemPrompt: string;
  signal: AbortSignal;
}

type SpeakResult =
  | { kind: "pass" }
  | {
      kind: "speak";
      stream: AsyncIterable<string>; // 토큰 청크
      usage?: () => Promise<{ inputTokens: number; outputTokens: number }>; // 스트림 종료 후 호출
    };

interface AgentAdapter {
  id: AgentId;
  mode: AgentMode;
  speak(input: SpeakInput): Promise<SpeakResult>;
}
```

규칙:

- 어댑터는 **자체 결정**으로 PASS 가능. 발화 가치가 낮을 때 빈 응답 대신 PASS 반환하도록 시스템 프롬프트에 명시 (`Reply with the literal token "[PASS]" if you have nothing to add this round.`).
- 어댑터 내부에서 `signal.aborted` 폴링 또는 SDK abort 옵션 연결 필수.
- 토큰 스트림은 raw 텍스트만 yield, 메타는 호출자가 wrap.

## 오케스트레이터 알고리즘

세션 상태:

```
{ transcript, userQueue, turn, consecutivePass, status, roundAbort, sessionAbort }
status ∈ { running, idle, paused, stopped }
roundAbort: AbortController       # 라운드 단위, 인터럽트 시 fire
sessionAbort: AbortController     # 세션 단위, STOP 시 fire
```

이벤트(외부 트리거):

- `interrupt(text)` → userQueue에 push, `roundAbort.abort('interrupt')`
- `enqueue(text)` → userQueue에 push만
- `pause()` → status=paused
- `resume()` → status=running 재개 (idle/paused에서 깨움)
- `stop()` → `sessionAbort.abort()`

루프:

```
loop:
  if sessionAbort.aborted: emit session_end(reason=user_stop); break
  if turn >= MAX_TURNS: emit session_end(reason=max_turns); break

  while status == paused:
    emit status('paused'); await (resumeEvent OR sessionAbort)
    if sessionAbort.aborted: break outer

  drain userQueue → transcript (각 항목 user_message로 emit + log)

  roundAbort = new AbortController()
  speakerOrder = rotate(activeAgents, turn)   # turn % N 만큼 시프트하여 발언권 회전
  anySpeak = false

  for speaker in speakerOrder:                # ← 직렬: 한 명 끝나야 다음
    if sessionAbort.aborted: break
    if roundAbort.aborted: break              # 인터럽트 → 라운드 통째 종료, 남은 발언자 호출 안 함

    signal = anySignal(roundAbort.signal, sessionAbort.signal)
    result = await withTimeout(
      withErrorCapture(
        speaker.speak({ transcript, systemPrompt: speaker.systemPrompt, signal })),
      AGENT_FIRST_TOKEN_TIMEOUT_MS)

    if result.kind == 'pass':    emit agent_pass(speaker.id); log; continue
    if result.kind == 'timeout': emit agent_timeout(speaker.id); log; continue
    if result.kind == 'error':   emit agent_error(speaker.id, result.message); log; continue

    anySpeak = true
    emit agent_start(speaker.id); log
    fullText = ''
    try:
      for await chunk in result.stream:
        fullText += chunk
        emit token(speaker.id, chunk); log
    catch AbortError: pass  # 인터럽트로 끊김
    interrupted = roundAbort.signal.aborted
    emit agent_end(speaker.id, fullText, interrupted); log
    if fullText: transcript.push({ role: speaker.id, text: fullText })   # ← 다음 발언자가 즉시 본다

    if result.usage:
      usage = await result.usage()
      sessionTokens += usage.inputTokens + usage.outputTokens
      emit usage(speaker.id, usage, sessionTokens); log
      if sessionTokens >= MAX_SESSION_TOKENS: sessionAbort.abort('budget'); break

  consecutivePass = anySpeak ? 0 : consecutivePass + 1
  if consecutivePass >= 2 and userQueue empty and !interrupted:
    status = idle; emit status('idle')
    await (userMessageEvent OR resumeEvent OR sessionAbort)
    consecutivePass = 0
    status = running

  turn++
```

핵심: 인터럽트는 `roundAbort`로 라운드만 끊고 세션은 살린다. STOP은 `sessionAbort`로 전체를 끊는다.

## JSONL 이벤트 스키마

`./logs/{sessionId}.jsonl` — 한 줄 = 한 이벤트.

```jsonc
{"type":"session_start","sessionId":"...","agents":[{"id":"claude","mode":"api"},...],"systemPrompts":{...},"userPrompt":"...","ts":1730000000000}
{"type":"agent_start","agentId":"claude","turn":1,"ts":...}
{"type":"token","agentId":"claude","turn":1,"text":"hello","ts":...}
{"type":"agent_end","agentId":"claude","turn":1,"fullText":"...","interrupted":false,"ts":...}
{"type":"agent_pass","agentId":"codex","turn":1,"ts":...}
{"type":"user_message","text":"...","mode":"interrupt|queue","ts":...}
{"type":"status","value":"running|idle|paused|stopped","ts":...}
{"type":"system_prompt_change","agentId":"claude","prompt":"...","ts":...}
{"type":"agent_timeout","agentId":"gemini","turn":3,"timeoutMs":30000,"ts":...}
{"type":"agent_error","agentId":"codex","turn":3,"message":"...redacted-safe...","ts":...}
{"type":"usage","agentId":"claude","turn":3,"inputTokens":1234,"outputTokens":456,"sessionTotal":12345,"ts":...}
{"type":"final_artifact","summarizerId":"claude","text":"## 결론\n...\n## 핵심 논점\n- [Claude] ...\n- [Codex] ...\n## 사용자 개입 반영\n...\n## 미해결\n...\n## 액션 아이템\n...","ts":...}
{"type":"summary_error","stage":"final","message":"...redacted-safe...","ts":...}
{"type":"session_end","reason":"user_stop|max_turns|budget_exceeded|time_exceeded","ts":...}
```

산출물 이벤트 2종(`final_artifact`/`summary_error`)은 결과 정리 담당이 지정된 세션에서만 emit된다. API 모드 3종(Anthropic/OpenAI/GoogleGenAI SDK)과 CLI 모드 3종(`claude`/`codex`/`gemini` 단발 spawn) 모두 지원한다. 호출 실패 시 `summary_error`만 1회 emit되고 transcript·Export는 그대로 유지된다.

API 키 / OAuth 토큰 / CLI 인자는 **절대 로그에 쓰지 않는다**.

## 코딩 컨벤션

- TypeScript `strict: true`. `any` 지양.
- 한 함수 ~50줄, 한 파일 ~200줄. 그 이상이면 분리.
- 주석은 자명하지 않은 의도(왜)만. "무엇"은 코드/명명으로.
- 에러 핸들링은 시스템 경계에서만 (사용자 입력 / SDK / `spawn`). 내부 함수는 throw 위임.
- `.env`/`.env.local`은 절대 생성·읽기·수정하지 않는다. `.env.example`만 갱신.
- 커밋 메시지 한글, 브랜치 `main` + `feature/{기능명}`.
- `npm run typecheck` + `npm run lint` 통과 후 커밋.

## 보안

- API 키: 클라 `sessionStorage`만 저장. 서버는 메모리 통과만.
- 서버 로그/JSONL/콘솔에 키 출력 금지. dev 시에도.
- CORS: 동일 출처만.
- CLI spawn 시 사용자 입력을 셸 인자로 직접 보간 금지 — 항상 `args` 배열 사용.

## 작업 시 사전 확인 — SDK/CLI

**SDK 사용 전 반드시 공식 docs를 확인한다.** Anthropic/OpenAI/Google SDK 메서드 시그니처는 자주 바뀐다. 추측 금지.

- Anthropic: 스트리밍 → `client.messages.stream(...)` 패턴 확인.
- OpenAI: chat completion vs responses API 중 현행 권장 확인.
- Google Gen AI: `@google/genai` 최신 패키지 확인 (구 `@google/generative-ai`와 다름).

CLI 모드는 OS PATH 차이 큼. `which claude` 등으로 실재 확인 → 없으면 UI에서 그 모드 비활성. 호출 시그니처 예 (구체 플래그는 각 CLI 최신 도움말 확인):

- Claude Code: `claude -p "<prompt>" --output-format stream-json`
- Codex: `codex exec "<prompt>"` 또는 동등 비대화형 모드
- Gemini: `gemini -p "<prompt>"` 또는 동등

## 검증 체크리스트 (제출 전)

- [ ] `git clone && npm i && cp .env.example .env.local && npm run dev` → 3000번 포트 기동
- [ ] API 키 1개만 입력 시 시작 버튼 비활성, 2개 입력 시 활성
- [ ] 프롬프트 전송 → 두 에이전트가 토큰 스트리밍으로 메시지 교환되는 것 UI에서 보임
- [ ] 개입(interrupt) 모드: 사용자 메시지 전송 시 진행 중 토큰 스트림 즉시 중단 → 새 라운드에 메시지 반영
- [ ] 개입(queue) 모드: 진행 중 라운드 보존 + 다음 라운드에 메시지 반영
- [ ] PAUSE → 라운드 경계에서 멈춤, RESUME → 재개, 일시정지 중에도 메시지 enqueue 가능
- [ ] STOP 클릭 → 진행 중 응답 즉시 중단, `session_end` 로그
- [ ] 시스템 프롬프트 핫스왑: 진행 중 textarea 저장 → 다음 라운드 응답이 새 프롬프트 영향 받음 + `system_prompt_change` 이벤트 기록
- [ ] Export Markdown 버튼: transcript md 파일 정상 다운로드
- [ ] 60초 타임아웃: 한 에이전트 의도적으로 응답 안 하게 한 경우 그 라운드 PASS + `agent_timeout` 이벤트
- [ ] 에이전트 에러: 잘못된 키로 한 어댑터 강제 실패 → 그 라운드 PASS + 빨간 에러 라벨 + `agent_error` 이벤트, 다음 라운드 다른 어댑터 정상 진행
- [ ] 토큰 예산: 캡을 작게(예: 2,000) 설정한 dev 시나리오에서 도달 시 자동 STOP + `session_end(reason=budget_exceeded)`
- [ ] 시간 캡: `MAX_SESSION_DURATION_MS`를 작게(예: 30_000ms) 설정 후 30초 경과 시 자동 STOP + `session_end(reason=time_exceeded)`
- [ ] M0 산출물: `scripts/recon/{anthropic,openai,claude-cli,gemini}.ts` 4개 파일 존재 + git 커밋 + `.omc/notes/m0-recon.md`에 4 경로별 1줄 이상 발견사항
- [ ] `./logs/{sessionId}.jsonl` 라인 단위 JSON 파싱 가능, 시크릿 없음
- [ ] CLI 모드 1회 이상 실제 사용 시연 (또는 README에 사전조건 명시 + 화면 녹화)
- [ ] README: 설치/환경변수/CLI 모드 사전조건/실행/트러블슈팅 5개 섹션
- [ ] 샘플 JSONL 1개 `logs/sample-session.jsonl`로 커밋 (마스킹 확인)
