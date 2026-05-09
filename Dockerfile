# syntax=docker/dockerfile:1.7
# Agora — Next.js 16 standalone production image.
#
# 3-stage 빌드 (deps → builder → runner). Next.js standalone 출력을 최소
# 이미지로 패키징. CLI 모드(claude/codex/gemini spawn)는 Railway 환경에선
# 어차피 사용자 OAuth 토큰이 없어 동작 불가 → API 모드(BYOK)만 지원.

# -------- Stage 1: 의존성 설치 (캐시 친화적) --------
FROM node:20-alpine AS deps
WORKDIR /app

# package*.json만 먼저 복사 → 코드 변경 시 npm ci 캐시 재사용.
# dev 의존성(typescript·tsx 등) 포함 — 빌드 단계에서 필요.
COPY package.json package-lock.json ./
RUN npm ci

# -------- Stage 2: 빌드 --------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 시 .env 불필요 — BYOK 흐름이라 런타임에 사용자가 UI에서 키 입력.
RUN npm run build

# -------- Stage 3: 런타임 (최소 이미지) --------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 비루트 사용자 — 컨테이너 내부 권한 격리.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone 번들만 복사 (.next/standalone에 server.js + 최소 deps).
# public/ 디렉토리는 미사용 — favicon은 App Router가 src/app/favicon.ico로 직접 처리.
# 향후 public/ 정적 자산 추가 시 이 위치에 COPY 라인 한 줄 추가.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# JSONL 로그 디렉토리 — 컨테이너 ephemeral storage. Stage A에선 단일 사용자
# 데모 가정이라 영속화 불필요. Stage B에서 S3 또는 DB로 마이그레이션.
RUN mkdir -p ./logs && chown nextjs:nodejs ./logs

USER nextjs

EXPOSE 3000

# Next.js standalone은 server.js 직접 실행 (next start 아님).
CMD ["node", "server.js"]
