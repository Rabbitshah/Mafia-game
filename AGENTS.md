# AGENTS.md: Mafia Night

Read this first. Specs live in `docs/`. Keep changes small.

## What this is
Mobile-first web Mafia game. Server is the narrator and referee. Friends play mostly remote, sometimes in one room. Voice (LiveKit, audio first) comes in v2.

## Stack
- Client: React + Vite + TypeScript + Tailwind (Framer Motion not installed yet, add in v2)
- Server: Node 20 + Express + Socket.IO 4.8, in-memory state
- Shared: `packages/shared` (types, pure game engine, roles config)
- Tests: Vitest. Voice: LiveKit. Hosting: Vercel (client), Render (server)

## Layout
```
apps/client/   apps/server/   packages/shared/   docs/
```

## Commands
```
npm install            # root, npm workspaces
npm run dev            # server :3001 + client :5173 (client also reachable from phones on same Wi-Fi)
npm run test           # vitest: engine tests + server integration + wire-level leak test
npm run typecheck      # all workspaces
npm run build          # client production build
npm run start -w apps/server   # production server (runs with tsx, no build step)
```
Dev tip: set `MIN_PLAYERS=3` in `apps/server/.env` style env to test with fewer than 5 tabs (3 is the minimum: Mafia, Doctor, Detective need 3 seats; 2 crashes role dealing). Each dev tab is its own player (sessionStorage).
(Update this list if scripts change.)

## Hard rules (never break)
1. **Server is authoritative.** Client sends intents only. Timers run on the server.
2. **Never send another player's role to a client.** All outgoing state goes through `getStateFor(playerId)`. Add or keep the leak test.
3. **Identity is `playerId` + token, never `socket.id`.**
4. **Validate every event:** room exists, phase matches, sender alive, target valid, action not repeated.
5. **Engine is pure.** `packages/shared` has no I/O, no timers, no `Date.now()` (pass time in).
6. **No secrets in the client or git.** `.env` ignored, `.env.example` committed.
7. **Do not log roles, tokens or full payloads.**
8. **Mute and permissions are enforced by the server** via LiveKit, not by client UI.

## Conventions
- TypeScript strict, no `any` without a comment.
- Small functions, early returns, clear names. Match existing style.
- Every engine rule change needs a Vitest test (night resolution, ties, win checks).
- Phase names and event names are defined once in `packages/shared`. Do not hardcode strings elsewhere.
- UI: every screen answers "what should I do now" and "who are we waiting on".
- Mobile first. Min tap target 44px. Dark by default.

## Workflow for agents
1. Read the relevant doc in `docs/` before coding.
2. State a short plan with a verify step for each part.
3. Make surgical changes. Do not refactor unrelated code. Mention unrelated issues, do not fix them.
4. Run `typecheck` and `test` before saying done. (No linter set up yet.)
5. Update the docs if behavior or schema changed.

## Status
- Done (days 1-2): rooms, lobby (code, link, QR), join/leave/rejoin, host settings (mafia count), role dealing, per-player state via `getStateFor`, leak tests, mobile client with hold-to-reveal role card, wake lock, resync on tab return.
- Done (day 3): night phase (Mafia vote, Doctor protect, Detective check), server-side resolution, server phase timers (`phaseEndsAt`), host skip, morning announcement, win check at night end, discussion placeholder, game-over screen. Night choices can be changed until the night ends (latest wins). NIGHT never ends early. `ALLOW_LAN=1` (dev only) opens CORS to private LAN ranges; `FAST_PHASES=1` (dev only) shortens phases.
- Done (day 4): day vote (VOTING, RUNOFF on ties, ELIMINATION), early end when everyone voted, win check after vote, host skip in every timed phase, rematch (`host:rematch`). New events: `vote:cast`, `host:rematch`.
- Done (day 5): host settings screen (timers with limits, tie rule, Doctor self-save, public votes, reveal on death), lobby kick (`host:kick`), pause/resume (`host:pause`, blocks actions while paused), `TRUST_PROXY_HOPS`, deploy config (`render.yaml`, `vercel.json`, `docs/DEPLOY.md`). Not deployed yet.
- Next (day 6): deploy and smoke test on a real phone, then voice (LiveKit, audio first).
- QA: after every build day, add a Claude Code test prompt to `docs/CLAUDE_CODE_TEST_PROMPTS.md` and new checklist items to `docs/QA_CHECKLIST.md`.

## Out of scope unless asked
Accounts, database, video, native apps, public matchmaking.

## Docs index
`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY.md`, `docs/DATA_AND_MODEL_CARDS.md`, `docs/COMPLIANCE.md`, `docs/QA_CHECKLIST.md`, `docs/CLAUDE_CODE_TEST_PROMPTS.md`, `docs/DEPLOY.md`
