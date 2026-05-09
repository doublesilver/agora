# Changelog

본 프로젝트의 변경 이력. [Keep a Changelog](https://keepachangelog.com/) 형식 + [Semantic Versioning](https://semver.org/).

## [v0.2.0] — 2026-05-09

**도메인 중립 + 라이브 데모 + 응시·SaaS 자산화** Stage A 완주.

### Added

- **Live demo on Railway** — https://agora-production-17a6.up.railway.app (BYOK 모드)
- **`Dockerfile`** + `railway.json` + `.dockerignore` — Next.js standalone 3-stage 빌드
- **English README** (`README.en.md`) + **`ARCHITECTURE.md`** (영문 ADR + 트레이드오프 + pseudocode + cheat sheet)
- **`src/lib/models.ts`** — 모델 ID 카탈로그 단일 출처 (DEFAULT_API_MODELS + MODEL_CANDIDATES)
- **vitest** 도입 + 어댑터 헬퍼 단위 테스트 4 files / 26 cases
- **`assets/portfolio-onepager.md`** — 응시·외주 메일 첨부용 1페이지
- **모바일 readonly 뷰** — 헤더·채팅만 표시, 입력은 데스크탑 전용 명시
- **`docs/DEPLOY.md`** — Railway 배포 가이드 10 섹션 + 트러블슈팅

### Changed

- **포지셔닝**: 베이글코드 신작팀 채용 과제 정조준 → **범용 멀티 AI 토론 도구** (도메인 무관)
- **`README.md`** 전면 재작성 — 도메인 중립 + 활용 예시 (PM·기획·전략·콘텐츠·연구·페어 검토 5 페르소나)
- **LeftPanel 프리셋** 게임 3종 → 도메인 중립 3종 (요구사항 정리 · 의사결정 비교 · 글 다듬기)
- **AGENTS.md 포지셔닝 섹션** 재작성 + 검증 체크리스트 헤더 정정
- 모델 ID 5개 사용처 (claude-api · gpt-api · gemini-api · summarizer · SettingsModal) → `models.ts` import로 통일

### Moved

- `HANDOFF.md` → `docs/legacy/HANDOFF.md` (채용 평가자 가이드, 이력 보존)
- `PLAN.md` → `docs/legacy/PLAN.md` (v0.1 마일스톤 M0~M8, 이력 보존)

### Verified

- TypeScript strict 0 errors
- vitest 4 files / 26 tests passed
- `verify-orchestrator.ts` 9 시나리오 통과 (정상 · 인터럽트 · timeout · error · pause-resume · hotswap · pause-mid-stop · budget · time)
- `scrub-check.sh` JSONL 시크릿 0 hit (50 lines sample)
- production build OK (13 routes)
- Live URL 헬스체크 200 OK (avg 1.0s)

---

## [v0.1.0-bagelcode-submission] — 2026-05-03

베이글코드 신작팀 AI 개발자 채용 과제 제출본. `v0.1.0-bagelcode-submission` 태그로 영구 동결.

### Initial Release

- 직렬 라운드 + 사용자 인터럽트 multi-AI debate tool
- 6 어댑터 (Claude · Codex · Gemini × API · CLI)
- 4 종료 사유 (`user_stop` · `max_turns` · `budget_exceeded` · `time_exceeded`)
- 4 개입 모드 (Interrupt · Queue · Pause/Resume · Stop)
- 5섹션 markdown 호외 산출물
- JSONL append-only logger + 시크릿 자동 검증

상세 자료: [`docs/legacy/HANDOFF.md`](./docs/legacy/HANDOFF.md) · [`docs/legacy/PLAN.md`](./docs/legacy/PLAN.md)

---

[v0.2.0]: https://github.com/doublesilver/agora/compare/v0.1.0-bagelcode-submission...v0.2.0
[v0.1.0-bagelcode-submission]: https://github.com/doublesilver/agora/releases/tag/v0.1.0-bagelcode-submission
