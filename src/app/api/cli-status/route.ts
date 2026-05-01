/* GET /api/cli-status — claude/codex/gemini CLI 설치·실행 가능 여부.
 * 인증 검증은 안 함(토큰 소모 회피). 실제 인증 실패는 어댑터 호출 시 agent_error로 surface.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveCliBin, type CliId } from "@/lib/agents/cli-stream";

const exec = promisify(execFile);

interface CliCheck {
  id: CliId;
  found: boolean;
  version?: string;
  path?: string;
  hint: string;
  /** 환경변수 override 적용 여부 — UI "수동 경로 사용 중" 라벨용. */
  overridden?: boolean;
}

const ENV_LABEL: Record<CliId, string> = {
  claude: "AGORA_CLAUDE_BIN",
  codex: "AGORA_CODEX_BIN",
  gemini: "AGORA_GEMINI_BIN",
};

const HINTS: Record<CliId, string> = {
  claude:
    "Claude Code 설치: `npm install -g @anthropic-ai/claude-code` → 첫 실행 `claude` 시 브라우저로 OAuth. PATH 미감지 시 `AGORA_CLAUDE_BIN=/절대/경로/claude npm run dev`.",
  codex:
    "Codex CLI 설치: `npm install -g @openai/codex` 또는 `brew install codex` → `codex login`. PATH 미감지 시 `AGORA_CODEX_BIN=/절대/경로/codex npm run dev`.",
  gemini:
    "Gemini CLI 설치: `npm install -g @google/gemini-cli` → 첫 실행 `gemini` 시 Google 계정 OAuth. PATH 미감지 시 `AGORA_GEMINI_BIN=/절대/경로/gemini npm run dev`.",
};

async function check(id: CliId): Promise<CliCheck> {
  const bin = resolveCliBin(id);
  const overridden = bin !== id;
  try {
    const { stdout } = await exec(bin, ["--version"], {
      timeout: 5000,
      env: process.env,
    });
    let path = overridden ? bin : "";
    if (!overridden) {
      try {
        const { stdout: which } = await exec("which", [id], { timeout: 2000 });
        path = which.trim();
      } catch {
        /* PATH 추적 실패해도 --version 성공이면 found 유효. */
      }
    }
    return {
      id,
      found: true,
      version: stdout.split("\n")[0]?.trim() || "(unknown)",
      path,
      hint: HINTS[id],
      overridden,
    };
  } catch {
    return {
      id,
      found: false,
      hint: overridden
        ? `${ENV_LABEL[id]}=${bin}에서 binary 실행 실패. 경로/실행권한 확인. (또는 ${HINTS[id]})`
        : HINTS[id],
      overridden,
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
