/* POST /api/auth-check — API 키 라이브 검증 (가벼운 provider ping).
 * 입력: { id: 'claude'|'codex'|'gemini', apiKey: string }
 * 출력: { id, ok: bool, detail?: string, error?: string }
 * 정책(AGENTS.md A2): 키는 메모리 통과만, 디스크·로그 미저장. 응답에 키 echo 금지.
 * 검증 근거(detail)는 어떤 엔드포인트로 무엇을 확인했는지 짧게 기술 — UI 툴팁/배지에 노출.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

type AgentId = "claude" | "codex" | "gemini";

interface AuthCheckRequest {
  id?: AgentId;
  apiKey?: string;
}

interface PingResult {
  ok: boolean;
  detail?: string;
  error?: string;
}

function shortenError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 240);
}

async function pingAnthropic(apiKey: string): Promise<PingResult> {
  try {
    const client = new Anthropic({ apiKey });
    const list = await client.models.list({ limit: 1 });
    const id = list.data?.[0]?.id ?? "models";
    return {
      ok: true,
      detail: `Anthropic SDK · GET /v1/models?limit=1 → 200 OK · "${id}"`,
    };
  } catch (err) {
    return { ok: false, error: shortenError(err) };
  }
}

async function pingOpenAI(apiKey: string): Promise<PingResult> {
  try {
    const client = new OpenAI({ apiKey });
    const list = await client.models.list();
    const first = list.data?.[0]?.id ?? "models";
    return {
      ok: true,
      detail: `OpenAI SDK · GET /v1/models → 200 OK · "${first}"`,
    };
  } catch (err) {
    return { ok: false, error: shortenError(err) };
  }
}

async function pingGemini(apiKey: string): Promise<PingResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "ping",
      config: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } },
    });
    return {
      ok: true,
      detail:
        "Google GenAI SDK · models.generateContent(gemini-2.5-flash, 1 token) → 200 OK",
    };
  } catch (err) {
    return { ok: false, error: shortenError(err) };
  }
}

export async function POST(req: Request) {
  let body: AuthCheckRequest;
  try {
    body = (await req.json()) as AuthCheckRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id || !["claude", "codex", "gemini"].includes(body.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (!body.apiKey || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
  }

  let result: PingResult;
  switch (body.id) {
    case "claude":
      result = await pingAnthropic(body.apiKey);
      break;
    case "codex":
      result = await pingOpenAI(body.apiKey);
      break;
    case "gemini":
      result = await pingGemini(body.apiKey);
      break;
  }

  return NextResponse.json({ id: body.id, ...result });
}
