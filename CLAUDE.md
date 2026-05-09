# Agora — 프로젝트 기획문서 (Stage A)

> 본 문서는 프로젝트의 **단일 진실 출처(SoT)** 입니다. 구조·결정·범위가 여기 적힌 것과 다르면 코드를 고치기 전에 본 문서를 먼저 갱신하세요.
>
> 베이글코드 신작팀 채용 과제 제출본은 `v0.1.0-bagelcode-submission` 태그로 동결되어 있으며, main은 본 기획에 따라 갈아엎습니다.
>
> 세부 명세(어댑터 인터페이스·오케스트레이터 알고리즘·JSONL 이벤트 스키마 등)는 [`AGENTS.md`](./AGENTS.md)에 위임합니다.

@AGENTS.md

---

## Context — 왜 v0.2를 만드는가

`doublesilver/agora`는 베이글코드 신작팀 AI 개발자 채용 과제로 제출된 멀티 AI 토론 도구입니다. 제출 후 다른 클라이언트가 관심을 보였고, 사용자(=감독자)는 이 코드를 **(1) 다른 회사 응시 포트폴리오** 와 **(2) 베타 SaaS 판매** 두 마리 토끼로 활용하려 합니다.

문제는 v0.1이 **게임 도메인과 베이글코드 컨텍스트에 정조준**되어 있다는 점입니다 — README·HANDOFF·AGENTS·UI 프리셋·데모 시나리오 곳곳에 "게임 기획·서바이벌·라이트 게이머·베이글코드 신작팀" 어휘가 박혀있습니다. 다른 회사 응시·범용 사용자에게 그대로 보이면 어색하고, 도메인 락인이 보입니다.

해결: **완전 도메인 중립**으로 전환합니다. 역할 지정 기능은 이미 시스템 프롬프트로 사용자에게 위임되어 있으므로, 다도메인 프리셋 라이브러리를 만들 필요 없이 **모든 도메인 어휘를 제거**하고 사용자가 자기 도메인을 자기 시스템 프롬프트로 정의하게 둡니다.

코드 자체는 시니어 수준(직렬 라운드 + AbortSignal 분리, Anthropic prompt caching, JSONL 시크릿 위생, AbortSignal.any 활용 등) — 갈아엎을 이유 없이 그대로 둡니다.

---

## 1. 프로젝트 정체성

**Agora** — 여러 AI(Claude · GPT · Gemini)가 직렬 라운드로 토론하는 도구. 사용자가 시스템 프롬프트로 각 AI 역할을 지정하고, 진행 중에 의견을 끼워넣을 수 있다.

**한 줄 차별화** — "단순 다중 호출이 아니라, 사람이 진행 중 토론에 끼어드는 직렬 라운드 + AbortSignal 분리 설계."
**도메인 무관** — 어떤 주제든 OK.

---

## 2. 클라이언트(=감독자) 원문 요구사항

> "기존 채용 과제용 프로젝트인데 다른 클라이언트가 관심을 보여서 판매 또는 다른 회사 지원용도로 작업할거야. 분석 먼저 해주고 냉정한 평가도 부탁해."
>
> "기능중에 역할을 지정해주는게 있으니까 완전 중립이 낫겠지?"
>
> "여유롭게 — Stage A 3주, Stage B 클라이언트 피드백 관찰 후."
>
> "기존 doublesilver/agora를 main에서 갈아엎기."

---

## 3. 비기능 요구사항

- TypeScript strict 0 에러 유지
- `scripts/verify-orchestrator.ts` 9 시나리오 회귀 통과
- `scripts/scrub-check.sh` 시크릿 0 hit
- 라이브 데모 URL 운영 (Railway, BYOK 모드)
- v0.1 코어 알고리즘(`src/lib/orchestrator*.ts`, `src/lib/agents/`, `src/lib/summarizer.ts`)은 보존 — 갈아엎지 않음

---

## 4. 범위

### In-Scope — Stage A (3주, 응시 + 라이브 데모 마감)

| #   | 산출물                                                        | 핵심 파일                                                                                             |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1  | 게임색·베이글코드 색채 일괄 제거                              | `README.md`, `AGENTS.md`, `HANDOFF.md`(legacy화), `src/components/LeftPanel.tsx` 프리셋               |
| A2  | 도메인 중립 README 재작성 (한국어)                            | `README.md`                                                                                           |
| A3  | 영문 README 추가                                              | `README.en.md`                                                                                        |
| A4  | AGENTS.md 포지셔닝 섹션 재작성                                | `AGENTS.md`                                                                                           |
| A5  | `final_artifact` 5섹션 어휘 점검 (게임 어휘 잔재 제거)        | `src/lib/summarizer.ts` `FINAL_INSTRUCTION`                                                           |
| A6  | 모델 ID 카탈로그 layer 추출 (하드코딩 제거)                   | `src/lib/agents/*.ts`, `src/lib/summarizer.ts`, 새 `src/lib/models.ts`                                |
| A7  | 어댑터 단위 테스트 추가                                       | `vitest` 도입 + `src/lib/agents/__tests__/`                                                           |
| A8  | Railway 라이브 데모 배포 (BYOK 그대로)                        | `railway.json` 또는 `Dockerfile`                                                                      |
| A9  | 데모 영상 신규 녹화 (90~150초, 도메인 중립 시나리오 1개)      | `assets/demo.mp4` 링크                                                                                |
| A10 | ARCHITECTURE.md 신규                                          | `ARCHITECTURE.md`                                                                                     |
| A11 | 응시용 1페이지 PDF                                            | `assets/portfolio-onepager.pdf`                                                                       |
| A12 | 모바일 최소 대응 (헤더·채팅 readonly 뷰만, 입력은 데스크탑)   | `src/components/*.tsx` Tailwind 반응형 클래스                                                         |

### Out-of-Scope — Stage A에서 안 함

- 다중 사용자 인증 (Google OAuth 등)
- Postgres·Redis·DB 도입
- 결과 영구 저장·검색·공유 링크
- BYOK 서버측 vault·KMS 연동
- 결제(Stripe)·구독 tier
- rolling 요약 (v0.1 결정 유지)
- 새로고침 시 세션 복원
- 다도메인 프리셋 라이브러리 (사용자 자유 입력으로 충분)
- 모바일 입력 UX
- Vercel 배포 (SSE long-lived + spawn 한계로 부적합 — Railway 단일 채택)

### Stage B (참고만, 정식 1단계 기획은 추후 별도)

클라이언트 피드백 관찰 후 별도 기획문서로 진입. 가설 항목:

- 인증 (Google + GitHub OAuth)
- Postgres 사용자/세션
- BYOK 서버측 vault
- 결과 영구 저장 + 공유 링크
- Stripe 무료(BYOK)/유료(호스팅 키) 2 tier

---

## 5. 기술 스택 결정 + 사유

| 항목         | 결정                                              | 사유                                                                  |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| 프레임워크   | Next.js 16 + TypeScript strict + Tailwind v4 (유지) | v0.1 검증 완료, 갈아엎을 이유 없음                                    |
| 스트리밍     | SSE (유지)                                        | 단방향 토큰 스트림에 충분, WebSocket 불필요                           |
| 상태 저장    | In-memory `Map` (Stage A 한정, 유지)              | Stage B에서 Postgres로 마이그레이션                                   |
| 로깅         | JSONL append-only (유지)                          | 단일 사용자 가정, Stage B에서 S3/DB로                                 |
| 배포         | Railway                                           | Vercel은 SSE long-lived + child_process spawn에 부적합                |
| 모델 ID      | `src/lib/models.ts` 카탈로그 layer 신규           | 1년 후 deprecation 헤지, 단일 출처                                    |
| 테스트       | `vitest` 도입                                     | 어댑터 단위 테스트로 채용 평가 신뢰도 향상                            |
| 인증         | BYOK 그대로 (sessionStorage)                      | Stage A는 단일 사용자 전제 유지, Stage B에서 OAuth                    |

---

## 6. 마일스톤 / 산출물 / 일정 (Stage A — 3주)

| #      | 마일스톤                                  | 산출물                              | 일정 (목표)   |
| ------ | ----------------------------------------- | ----------------------------------- | ------------- |
| **M1** | 게임색 제거                               | A1·A4·A5 commit                     | Week 1 (3~5일) |
| **M2** | 도메인 중립 README + 영문 초안            | A2·A3 초안 commit                   | Week 1 후반   |
| **M3** | 모델 카탈로그 + 단위 테스트               | A6·A7 commit                        | Week 2 전반   |
| **M4** | Railway 라이브 데모 + 데모 영상           | A8·A9 commit + 라이브 URL 공개      | Week 2 후반   |
| **M5** | ARCHITECTURE.md + 영문 README 마감        | A10·A3 마감                         | Week 3 전반   |
| **M6** | 응시용 1페이지 PDF + 모바일 최소 + 최종   | A11·A12 + 회귀 테스트 통과          | Week 3 후반   |

각 마일스톤 종료 시:

1. Conventional Commits 형식(한국어 본문)으로 commit + push (main 직접 push, 단일 작업자)
2. 산출물 짧은 학습 노트 채팅 보고
3. 다음 마일스톤 진입

---

## 7. 워크플로 가드

- 모든 변경은 Conventional Commits + 한국어 본문 (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`)
- 커밋 단위: 한 모듈/파일 완료 시
- main 직접 push (PR 워크플로 없음, 단일 작업자)
- v0.1 코드 호환성은 신경 쓰지 않음 (베이글코드 태그로 보존됨)
- production 배포(Railway live)는 **사용자 명시 확인** 후 진행
- `--no-verify` / `--no-gpg-sign` / `--force` 등 우회 금지 (실패 시 근본 원인 분석)
- Stage B 진입은 **별도 1단계 기획문서** 작성 후 — 본 문서는 Stage A만 책임

---

## 8. Verification — 완료 검증

각 마일스톤 종료 시:

```bash
cd ~/projects/agora
npm run typecheck                                       # 0 에러
npx tsx scripts/verify-orchestrator.ts                  # 9 시나리오 통과
bash scripts/scrub-check.sh logs/sample-session.jsonl   # 0 시크릿
npm run build                                           # production 컴파일 OK
# (M3 이후) npx vitest run                              # 단위 테스트 통과
```

전체 Stage A 완료 검증:

- [ ] 코드/문서/UI 어디에도 "게임·베이글코드·서바이벌·라이트 게이머" 어휘 없음 (`grep -ri` 0 hit)
- [ ] Railway 라이브 데모 URL이 외부에서 5초 안에 응답
- [ ] 데모 영상 공개 링크 작동
- [ ] 영문 README가 응시용으로 완성됨
- [ ] `git log v0.1.0-bagelcode-submission..main`이 깔끔한 Conventional Commits 라인업
