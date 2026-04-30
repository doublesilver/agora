#!/usr/bin/env bash
# JSONL 시크릿 grep 자동 검증.
# 사용: bash scripts/scrub-check.sh logs/<sessionId>.jsonl
# 패턴: api 키 / Bearer / sk- / AIza (Google) / 흔한 토큰 prefix
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <jsonl-path>" >&2
  exit 2
fi
TARGET="$1"
if [ ! -f "$TARGET" ]; then
  echo "ERROR: file not found: $TARGET" >&2
  exit 2
fi

PATTERN='(api[_-]?key|sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}|AIza[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]+)'

if grep -E -i "$PATTERN" "$TARGET"; then
  echo "❌ 시크릿 패턴 발견 — 절대 커밋 금지" >&2
  exit 1
fi

echo "✅ scrub-check OK: $TARGET ($(wc -l < "$TARGET") lines)"
