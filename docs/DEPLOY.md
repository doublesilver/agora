# 배포 가이드 — Railway

Agora를 [Railway](https://railway.app)에 배포해 라이브 데모 URL을 운영하기 위한 가이드입니다. **Vercel은 부적합** — SSE long-lived 연결과 `child_process.spawn`이 serverless 함수 시간 제한과 충돌합니다.

> **Stage A 가정** — 단일 사용자 BYOK 데모. 다중 테넌트·인증·결제는 Stage B에서 별도 진입.

---

## 1. 사전 준비

- GitHub 계정 (이 repo는 `doublesilver/agora`)
- [Railway 계정](https://railway.app/login) (GitHub OAuth로 무료 가입 가능)

---

## 2. 배포 방법 — 두 갈래

### 2-A. Railway 대시보드 (권장, 가장 쉬움)

1. https://railway.app/new → **Deploy from GitHub repo** 선택
2. `doublesilver/agora` 검색 → **Deploy now**
3. Railway가 저장소 루트의 `railway.json`·`Dockerfile`을 자동 감지하여 빌드 시작
4. 빌드 ~3~5분 후 자동 시작
5. 프로젝트 → **Settings → Networking → Generate Domain** 클릭 → 공개 URL(`*.up.railway.app`) 발급
6. 발급된 URL 접속 → ⚙ → API 키 입력 → 시작

### 2-B. Railway CLI (자동화·CI 친화)

```bash
# CLI 설치 (한 번만)
npm install -g @railway/cli

# OAuth 로그인 (브라우저 열림)
railway login

# repo 루트에서 새 프로젝트 생성·배포
cd ~/projects/agora
railway init
railway up

# 도메인 발급
railway domain
```

배포 후 `railway logs`로 실시간 로그, `railway status`로 헬스 확인.

---

## 3. 환경변수

**기본 흐름은 BYOK** — 사용자가 UI에서 API 키를 직접 입력하므로 Railway에 키를 등록할 필요가 없습니다. `sessionStorage`에만 저장되며 서버 디스크에는 절대 남지 않습니다.

dev 편의용 환경변수가 필요한 경우만 Railway 대시보드 → **Variables** 탭에서 추가:

| 변수                | 설명                                           | 필수 |
| ------------------- | ---------------------------------------------- | ---- |
| `ANTHROPIC_API_KEY` | dev 시 UI 키 입력 우회용 (운영에선 비워두기)  | ✗    |
| `OPENAI_API_KEY`    | 동일                                           | ✗    |
| `GEMINI_API_KEY`    | 동일                                           | ✗    |
| `PORT`              | Dockerfile default 3000 — Railway가 자동 설정 | 자동 |

**금지** — Railway에 운영용 키를 박지 마세요. 다중 사용자 환경이라 BYOK가 맞고, 호스팅 키 모델은 Stage B에서 vault·결제와 함께 도입.

---

## 4. CLI 모드는 Railway에서 작동하지 않습니다

컨테이너 이미지에 `claude`/`codex`/`gemini` 1st-party CLI가 없고, 사용자 OAuth 토큰도 없으므로 **API 모드만 지원**합니다. UI의 좌패널 카드가 자동으로 CLI 모드를 비활성화합니다 (`/api/cli-status` route가 감지).

로컬 개발에서는 CLI 모드가 그대로 동작합니다 — 배포 환경에서만 비활성.

---

## 5. JSONL 세션 로그

컨테이너의 `./logs/{sessionId}.jsonl`은 **ephemeral storage** — 인스턴스 재시작 시 사라집니다. Stage A 단일 사용자 데모 가정상 OK입니다.

영속 로그가 필요하면 Railway → **Volumes** 추가 → `/app/logs`에 마운트. 다만 Stage B에서 S3·DB로 마이그레이션할 예정이므로 임시 조치만.

---

## 6. 헬스체크

`railway.json`에 박혀있는 헬스체크 경로:

```
/api/cli-status — 30초 타임아웃
```

이 route는 CLI binary 존재 여부만 빠르게 응답하므로(<100ms) 부하 0에 가깝습니다.

5번 연속 헬스체크 실패 시 자동 재시작 (`restartPolicyMaxRetries: 5`).

---

## 7. 검증 — 배포 후 5분 안에 해볼 것

1. URL 접속 → 정적 페이지 즉시 로드 (~1s)
2. ⚙ → AI 에이전트 → Claude·Codex 둘 다 API 모드 + 키 입력
3. 좌패널 프리셋 클릭 → ▶ START SESSION
4. 5초 안에 첫 토큰 스트림 시작 → SSE 동작 확인
5. 진행 중 인터럽트 메시지 입력 → 라운드만 끊기는지 확인
6. STOP → 5섹션 markdown 호외 카드 도착 → Export Markdown 다운로드

---

## 8. 트러블슈팅

| 증상                                  | 원인                                                                  | 해결                                                  |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 빌드 실패: `Cannot find module 'X'`   | `package.json` 의존성 누락                                            | 로컬에서 `npm install X` + commit + redeploy          |
| 첫 토큰 안 옴 (5초 이상 대기)          | API 키 오타 또는 SDK quota 부족                                       | DevTools Network 탭에서 SSE 이벤트 확인, `agent_error` |
| 배포는 됐는데 SSE 즉시 끊김           | Railway 프록시가 buffering — `X-Accel-Buffering: no` 누락 가능성 (이미 박혀있음) | 1차 의심 헤더, 2차 ENV `PORT` 충돌                    |
| `npm ci` 빌드 에러                    | `package-lock.json` 동기화 안 됨                                      | 로컬에서 `npm install` 후 lock 재커밋                 |
| 컨테이너가 메모리 OOM (>512MB)        | 빌드 중 `next build` 메모리 spike                                     | Railway 인스턴스 사이즈 1GB 이상 (Hobby 플랜 OK)      |

---

## 9. 비용 가이드

- **Railway Hobby plan ($5 크레딧/월)** — Stage A 데모는 충분
- 시간당 $0.000463 × 720시간 = **월 ~$0.33** (idle, 1GB RAM 기준)
- 자주 호출되지 않는 데모면 sleep 모드로 무료 가능 (Hobby plan 자동 sleep)
- BYOK 모델이라 LLM 비용은 **사용자가 부담** — Agora 운영자는 인프라 비용만

---

## 10. Stage B 진입 시 추가될 것 (참고만)

- Postgres (Railway add-on, $5/월) → 사용자/세션 영속화
- Redis (Railway add-on, $5/월) → 세션 store + rate limit
- 인증 (NextAuth) → Google/GitHub OAuth
- BYOK → 호스팅 키 vault → Stripe 구독

---

배포 후 도메인 URL을 README에 추가해 응시·포트폴리오에 라이브 링크 노출하세요.
