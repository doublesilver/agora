# M0 정찰 결과 (2026-04-30)

scripts/recon/\*.ts 4개 작성·실행. 결과 요약.

## anthropic.ts (Anthropic SDK `@anthropic-ai/sdk@^0.91.1`)

- **상태**: SKIPPED — `ANTHROPIC_API_KEY` 미설정. M3 시점 키 입수 후 검증 재시도.
- **권장 모델 ID**: `claude-opus-4-7` (M3 fallback 대비 Sonnet도 점검 필요).
- **스트리밍**: `client.messages.stream({ model, messages, max_tokens })` 패턴. 이벤트 핸들러 `.on("text", delta => ...)` + `await stream.finalMessage()`로 usage 추출.
- **usage 위치**: `finalMessage().usage = { input_tokens, output_tokens }`.

## openai.ts (OpenAI SDK `openai@^6.35.0`)

- **상태**: SKIPPED — `OPENAI_API_KEY` 미설정.
- **권장 모델 ID**: `gpt-5` (M3 시점 SDK 모델 카탈로그 재확인). 호출 실패 시 `gpt-5-mini` 또는 `gpt-4o`로 폴백.
- **스트리밍**: `chat.completions.create({ model, messages, stream:true, stream_options:{ include_usage:true } })` 패턴. `for await chunk` 루프, `chunk.choices[0].delta.content` 추출, 마지막 청크에 `chunk.usage`.
- **`max_completion_tokens`**: gpt-5 계열은 `max_tokens` 대신 `max_completion_tokens` 사용 (호환성 주의).

## gemini.ts (Google Gen AI `@google/genai@^1.51.0`)

- **상태**: SKIPPED — `GEMINI_API_KEY`/`GOOGLE_API_KEY` 미설정.
- **권장 모델 ID**: `gemini-2.5-pro`. (Gemini 3.x 출시 여부 M3 시점 재확인 — 베이글코드 사용자 셸에 `gemini-3.1-pro-preview` 설정이 있었음.)
- **스트리밍**: `ai.models.generateContentStream({ model, contents })` 패턴. `for await chunk` 루프, `chunk.text` 추출, 마지막 청크에 `chunk.usageMetadata`.
- **계정 형태**: 일반 Google API key (`https://ai.google.dev/`). Vertex 계정은 별도 흐름.

## claude-cli.ts (Claude Code CLI)

- **상태**: ✅ 통과. `claude -p "..." --output-format stream-json --verbose` 정상 동작.
- **stdout 라인 경계**: **clean** (chunkBoundaryClean=true). R7 폴백(`readline.createInterface`) 사용은 안전 마진 차원에서만 적용, 필수는 아님.
- **출력 라인 종류**: `system/hook_started` 다수 → 실제 결과는 마지막 `type:"result"` 라인. M3 어댑터에서 `type==="result"`만 토큰으로 추출. 또는 중간의 `type:"assistant"/content` 청크 사용.
- **finalLine 구조**: `{ type:"result", subtype:"success", duration_ms, duration_api_ms, num_turns, result:"<full text>", stop_reason, ... }`.
- **first line 도달**: ~7s (hook 부팅 + LLM 호출). 30초 타임아웃 내 충분.
- **stdin 경고**: `< /dev/null` 리다이렉트로 stdin 폐쇄 권장 (M3 spawn 시 적용).

## M3 진입 시 카피용 스니펫

```ts
// Anthropic
const stream = client.messages.stream({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  messages,
});
stream.on("text", (delta) => onToken(delta));
const final = await stream.finalMessage();
// usage: final.usage.input_tokens, final.usage.output_tokens

// OpenAI
const stream = await client.chat.completions.create({
  model: "gpt-5",
  messages,
  stream: true,
  stream_options: { include_usage: true },
  max_completion_tokens: 1024,
});
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) onToken(delta);
  if (chunk.usage) saveUsage(chunk.usage);
}

// Gemini
const stream = await ai.models.generateContentStream({
  model: "gemini-2.5-pro",
  contents: [{ role: "user", parts: [{ text }] }],
});
for await (const chunk of stream) {
  if (chunk.text) onToken(chunk.text);
  if (chunk.usageMetadata) saveUsage(chunk.usageMetadata);
}

// Claude CLI
const child = spawn(
  "claude",
  ["-p", prompt, "--output-format", "stream-json", "--verbose"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const rl = createInterface({ input: child.stdout });
rl.on("line", (line) => {
  const ev = JSON.parse(line);
  if (ev.type === "assistant") onToken(ev.message?.content?.[0]?.text ?? "");
});
```
