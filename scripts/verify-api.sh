#!/usr/bin/env bash
# M5 검증 — dev 서버에 curl 시나리오 7개 + JSONL 라인 체크.
# 사전조건: npm run dev가 다른 터미널 또는 백그라운드에서 실행 중 (port 3000).
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"

echo "=== 1. POST /api/session ==="
RES=$(curl -s -X POST "$BASE/api/session" \
  -H 'Content-Type: application/json' \
  -d '{
    "agents": [
      {"id":"claude","mode":"api"},
      {"id":"codex","mode":"api"}
    ],
    "userPrompt":"design a survival game energy system"
  }')
echo "session response: $RES"
SID=$(echo "$RES" | sed -E 's/.*"sessionId":"([^"]+)".*/\1/')
echo "sessionId=$SID"

if [ -z "$SID" ] || [ "$SID" = "$RES" ]; then
  echo "ERROR: failed to extract sessionId"
  exit 1
fi

echo
echo "=== 2. GET /api/stream (3초 캡처) ==="
( curl -sN "$BASE/api/stream?sessionId=$SID" 2>&1 | head -30 ) || true

echo
echo "=== 3. POST /api/system-prompt (핫스왑) ==="
curl -s -X POST "$BASE/api/system-prompt" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"agentId\":\"claude\",\"prompt\":\"new persona for hotswap test\"}"
echo

echo
echo "=== 4. POST /api/intervene (queue 모드) ==="
curl -s -X POST "$BASE/api/intervene" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"text\":\"queued message\",\"mode\":\"queue\"}"
echo

echo
echo "=== 5. POST /api/intervene (interrupt 모드) ==="
curl -s -X POST "$BASE/api/intervene" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"text\":\"interrupting now\",\"mode\":\"interrupt\"}"
echo

echo
echo "=== 6. POST /api/pause / resume ==="
curl -s -X POST "$BASE/api/pause" -H 'Content-Type: application/json' -d "{\"sessionId\":\"$SID\"}"
echo
sleep 0.5
curl -s -X POST "$BASE/api/resume" -H 'Content-Type: application/json' -d "{\"sessionId\":\"$SID\"}"
echo

echo
echo "=== 7. GET /api/export (markdown 첫 30줄) ==="
curl -s "$BASE/api/export?id=$SID" | head -30

echo
echo "=== 8. POST /api/stop ==="
curl -s -X POST "$BASE/api/stop" -H 'Content-Type: application/json' -d "{\"sessionId\":\"$SID\"}"
echo

sleep 0.5

echo
echo "=== 9. JSONL 로그 검증 ==="
LOG="logs/$SID.jsonl"
if [ ! -f "$LOG" ]; then
  echo "ERROR: log file not found: $LOG"
  exit 1
fi
echo "log file: $LOG ($(wc -l < "$LOG") lines)"
echo "샘플 5줄:"
head -5 "$LOG"
echo "..."
echo "이벤트 type 분포:"
node -e "const lines=require('fs').readFileSync('$LOG','utf8').split('\\n').filter(Boolean); const counts={}; for (const l of lines) { try { const e=JSON.parse(l); counts[e.type]=(counts[e.type]||0)+1; } catch { console.error('bad line:',l); } } console.log(counts);"

echo
echo "=== 시크릿 grep 검증 ==="
if grep -E '(api[_-]?key|sk-[a-zA-Z0-9]|Bearer )' "$LOG"; then
  echo "ERROR: 시크릿 패턴 발견"
  exit 1
fi
echo "OK: 시크릿 패턴 없음"

echo
echo "=== M5 검증 완료 ==="
