/* GET /api/cli-status — claude/codex/gemini CLI 설치·실행 가능 여부.
 * 인증 검증은 안 함(토큰 소모 회피). 실제 인증 실패는 어댑터 호출 시 agent_error로 surface.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

interface CliCheck {
  id: "claude" | "codex" | "gemini";
  found: boolean;
  version?: string;
  path?: string;
  hint: string;
}

const HINTS: Record<CliCheck["id"], string> = {
  claude:
    "Claude Code 설치: `npm install -g @anthropic-ai/claude-code` → 첫 실행 `claude` 시 브라우저로 OAuth.",
  codex:
    "Codex CLI 설치: `npm install -g @openai/codex` 또는 `brew install codex` → `codex login` 로 ChatGPT 계정 연결 (Plus/Pro 구독 필요).",
  gemini:
    "Gemini CLI 설치: `npm install -g @google/gemini-cli` → 첫 실행 `gemini` 시 Google 계정 OAuth.",
};

async function check(id: CliCheck["id"]): Promise<CliCheck> {
  try {
    const { stdout } = await exec(id, ["--version"], {
      timeout: 5000,
      env: process.env,
    });
    let path = "";
    try {
      const { stdout: which } = await exec("which", [id], { timeout: 2000 });
      path = which.trim();
    } catch {
      /* path 미보고 — found는 유효 */
    }
    return {
      id,
      found: true,
      version: stdout.split("\n")[0]?.trim() || "(unknown)",
      path,
      hint: HINTS[id],
    };
  } catch (err) {
    return {
      id,
      found: false,
      hint: HINTS[id],
    };
  }
}

export async function GET() {
  const [claude, codex, gemini] = await Promise.all([
    check("claude"),
    check("codex"),
    check("gemini"),
  ]);
  return Response.json({ claude, codex, gemini });
}
