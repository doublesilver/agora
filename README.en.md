# Agora — Multi-AI Debate Tool with Human-in-the-Loop

A web tool where multiple AI agents (Claude · GPT · Gemini) take turns in a **serial round** to discuss a topic, while you can **interrupt, queue, pause, resume, or stop** the debate at any time. **Domain-agnostic** — define your own domain via system prompts.

> **One-line differentiator** — Not a parallel multi-call. **A human participates in the AI debate.**
> Drop in a constraint mid-debate ("Constraint: assume English-only users"), the current speaker's stream is cut, and the next round picks up with that input.

|             |                                                                                |
| ----------- | ------------------------------------------------------------------------------ |
| Stack       | Next.js 16 · TypeScript strict · Tailwind v4 · SSE · JSONL                     |
| Adapters    | Claude / OpenAI(Codex) / Gemini × API · CLI = **6 total**                      |
| Interventions | ⚡ Interrupt · ↳ Queue · ‖ Pause/Resume · ■ Stop = **4 modes**               |
| Output      | On stop, a 5-section markdown: `결론 / 핵심 논점 / 사용자 개입 반영 / 미해결 / 액션 아이템` |
| End reasons | `user_stop` · `max_turns` · `budget_exceeded` · `time_exceeded`                |
| Verification | typecheck 0 · 9 scenario regressions · scrub-check 0 secrets                  |

---

## Quick start

```bash
git clone https://github.com/doublesilver/agora && cd agora
npm install
npm run dev   # → http://localhost:3000
```

| Step 1                                                | Step 2          | Step 3          |
| ----------------------------------------------------- | --------------- | --------------- |
| ⚙ → Agents → enable **2 or more** + paste API keys    | Enter the topic | ▶ START SESSION |

If the first token streams within 5 seconds, you're good.

---

## What kind of debate fits

You define the domain. Use system prompts to set each AI's role.

| Persona / context           | Use case                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| **PM · planner**            | Draft requirements → two AIs debate priorities & acceptance criteria          |
| **Strategy · architect**    | Compare option A vs B trade-offs; inject new constraints mid-debate           |
| **Content · writer**        | Improve clarity, structure, tone — one AI as reviewer, the other as editor    |
| **Researcher · learner**    | Hypothesis review + counterexamples + experiment design                       |
| **Developer pair-review**   | Trade-off discussions like "OAuth vs JWT" from multiple angles                |

The 3 sidebar presets (Requirements · Decision compare · Writing polish) are just starting points.

---

## Key design decisions

### 1. Why not standard OAuth?

Anthropic and OpenAI don't expose a public OAuth provider for third-party apps. Only Google does. Instead of a fake OAuth button, **CLI mode** spawns the user's own first-party CLI (`claude`, `codex`, `gemini`) which carries its own OAuth/subscription token — **a de facto OAuth substitute**, and an honest one.

### 2. Why serial rounds, not parallel?

`Promise.all` makes two AIs talk past each other — "interleaved monologues". Serial turns produce true talk-show ping-pong. SSE token streaming preserves the perceived speed.

### 3. Why does interrupt only kill the round, not the session?

Two `AbortController`s: `roundAbort` (created per round) and `sessionAbort` (single per session). Interrupt fires `roundAbort` only → current speaker's stream stops, partial text is committed to transcript, user message is pushed, **a new round auto-starts** with the next speaker reacting to the user message. STOP is a separate button to prevent accidents.

### 4. Demos: prefer API mode

CLI cold-starts ~25s every round. API gives first token in 1~3s. In a 5-minute box, the difference is roughly 3× round throughput.

### 5. Security stance

Single-user local demo assumed. For multi-user deployment you'd add session auth tokens + CORS hardening. API keys live only in browser `sessionStorage`; the server passes them through memory only — never written to JSONL, console, or SSE. Auto-verified by `scripts/scrub-check.sh`.

---

## Architecture

```mermaid
flowchart LR
    User([User])
    UI[Next.js UI]
    API{Next.js<br/>API Routes (11)}
    Orch[Orchestrator<br/>serial rounds<br/>roundAbort · sessionAbort]
    Sum[Summarizer<br/>5-section markdown]
    Log[(JSONL<br/>append-only)]

    Claude[Claude SDK]
    GPT[OpenAI SDK]
    Gemini[Gemini SDK]
    CLI[1st-party CLI<br/>spawn]

    User <--> UI
    UI -- POST --> API
    API -- SSE --> UI
    API <--> Orch
    Orch --> Sum
    Orch -- emitEvent --> Log
    Sum --> Claude & GPT & Gemini & CLI
    Orch --> Claude & GPT & Gemini & CLI
```

For the full architecture explanation with trade-offs and pseudocode, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For canonical Korean ADRs (A1~A9), JSONL event schema, and full orchestrator algorithm, see [`AGENTS.md`](./AGENTS.md).

---

## Intervention modes

| Mode                | What happens                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Interrupt**    | Fires `roundAbort`. Current speaker's stream stops mid-token, partial text is committed, your message is pushed to transcript, **a new round auto-starts** with the next speaker reacting to your input. |
| ↳ **Queue**         | Your message is queued. Current round finishes naturally; the next round starts with your message in transcript.      |
| ‖ **Pause / Resume**| Pauses at the **round boundary** (in-flight tokens are not cut). Resume restarts the round loop from where it left off. |
| ■ **Stop**          | Fires `sessionAbort`. Whole session ends; final 5-section artifact is generated; SSE stream closes.                   |

System prompts can be **hot-swapped** mid-session — saving them takes effect from the next round. Authentication and active-agent list are **locked** once a session starts (start a new session to change them).

---

## End reasons

```
session_end.reason ∈ { user_stop, max_turns, budget_exceeded, time_exceeded }
```

| Reason            | Default                | User-adjustable range          |
| ----------------- | ---------------------- | ------------------------------ |
| `max_turns`       | 30 turns               | 1 ~ 200                        |
| `budget_exceeded` | 100,000 tokens         | 1,000 ~ 1,000,000              |
| `time_exceeded`   | 5 minutes              | 30s ~ 60min                    |
| `user_stop`       | STOP button OR all adapters fail 3 consecutive rounds | n/a                            |

Limits are clamped server-side (`orchestrator.ts:clampLimits`) so client requests can't bypass safety bounds.

---

## Verification commands

```bash
npm run typecheck                                       # TypeScript strict, 0 errors
npx tsx scripts/verify-orchestrator.ts                  # 9 scenarios (interrupt · timeout · budget · time · …)
bash scripts/scrub-check.sh logs/sample-session.jsonl   # 0 secrets
npm run build                                           # production compile (11 routes)
```

---

## Project history

This repository started as a take-home assignment for the Bagelcode New IP Team's AI Engineer hiring (submitted 2026-05-03, frozen at the `v0.1.0-bagelcode-submission` tag). After submission, main was repositioned as a **general-purpose multi-AI debate tool** for portfolio + beta SaaS use. The submission-era artifacts (HANDOFF, PLAN) are preserved under [`docs/legacy/`](./docs/legacy/).

— Eunseok Lee · korea5410@gmail.com
