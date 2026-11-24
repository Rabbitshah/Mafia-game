# Technical Architecture

## 1. Stack
| Layer | Choice | Why |
|---|---|---|
| Client | React + Vite + TypeScript + Tailwind + Framer Motion | Fast, mobile-first, known stack |
| Realtime server | Node 20 + Express + Socket.IO 4.8 | Rooms, reconnect, authoritative loop |
| Shared | `packages/shared` (types, game engine) | Pure TS, unit-testable, no I/O |
| Voice (v2) | LiveKit Cloud, audio first | Server-controlled permissions, TURN included |
| Tests | Vitest (engine), Playwright later | Engine bugs are the main risk |
| Hosting | Vercel (client), Render free (server) | $0, WebSockets supported on Render |

## 2. Layout
```
mafia-game/
  apps/client/        React app
  apps/server/        Express + Socket.IO + LiveKit token route
  packages/shared/    types, engine, roles config
  docs/
  AGENTS.md
```

## 3. Data flow
```
Phone (React) <--WebSocket--> Socket.IO server <--> In-memory rooms Map
      |                              |
      |                              +--> LiveKit server API (mute, permissions)
      +--WebRTC audio--> LiveKit Cloud
```
- Server is the **only** source of truth. Client sends intents, never state.
- Public events: `io.to(code).emit`. Private: `io.to(playerSocket).emit`. Mafia: `io.to(code:mafia)`.
- Every server push is built by `getStateFor(playerId)`. Never send the full room.

## 4. Phase machine
`LOBBY -> ROLE_REVEAL -> NIGHT -> MORNING -> DISCUSSION -> VOTING -> (RUNOFF) -> ELIMINATION -> NIGHT | GAME_OVER`
- Transitions are pure functions: `(state, event) -> state`.
- Timers live on the server. State holds `phaseEndsAt`. Clients render countdowns.
- NIGHT never ends early (an early end would reveal who has the Doctor or Detective). It always runs the full timer or until the host skips. VOTING and RUNOFF end early once every living player has voted.

## 5. Client to server events
| Event | Who | Valid in phase |
|---|---|---|
| `room:create` | anyone | none |
| `room:join` {code, name} | anyone | LOBBY (or rejoin any) |
| `room:rejoin` {code, playerId, token} | known player | any |
| `host:settings` {timers, tieRule, doctorSelfSave, publicVotes, revealOnDeath, mafiaCount} | host | LOBBY |
| `host:start` | host | LOBBY |
| `host:kick` {target} | host | LOBBY |
| `host:skip` | host | any timed phase |
| `host:pause` (toggle) | host | any timed phase; night actions and votes are refused while paused |
| `night:action` {target\|null} | role holder, alive | NIGHT (latest choice wins until night ends) |
| `vote:cast` {target\|null} | alive | VOTING, RUNOFF (latest wins; ends early when all alive have voted) |
| `host:rematch` | host | GAME_OVER |
| `chat:send` (optional) | alive in day, mafia at night | DISCUSSION, NIGHT |

Every handler validates: room exists, phase matches, sender alive, target valid, action not already used.

## 6. Server to client events
`state:snapshot` (full per-player view, sent on join and reconnect), `phase:changed`, `night:result` (private), `vote:update`, `player:eliminated`, `game:over` (reveals all roles), `voice:token`.

## 7. Reconnect
- Identity = `playerId` + secret `token` stored in `localStorage` (use `sessionStorage` in dev tabs).
- On reconnect client sends `room:rejoin`. Server rebinds socket, sends snapshot.
- Client listens to `visibilitychange` and forces resync. Re-request wake lock.
- Disconnected player keeps seat. Host can skip or remove after timeout.

## 8. Voice design (v2)
| Phase | Alive | Mafia | Dead |
|---|---|---|---|
| Day | speak | speak (public room) | listen |
| Night | muted | speak in `CODE-mafia` room only | listen to nothing or ghost room |

- Server maps `phase -> allowed speakers` and calls LiveKit server API to update publish permission. Clients cannot unmute themselves.
- Token route `POST /voice/token` checks playerId+token, returns a short-lived LiveKit token per room.
- "Same room" toggle: mic off, play on phone only (stops echo).
- Audio only by default. Video is a later toggle.

## 9. Rate limits and limits
| Limit | Value (start here, tune later) |
|---|---|
| Socket events per connection | 10 per second, drop and warn |
| Room creations per IP | 5 per minute |
| Players per room | 15 |
| Rooms alive | 50 total, 2 hour idle cleanup |
| Name length | 1 to 20 chars |
| LiveKit free tier | about 5,000 participant-minutes per month (verify) |

## 10. Deployment
- Client: Vercel. `VITE_SERVER_URL` env.
- Server: Render web service. CORS allow only the Vercel domain. Health route `/healthz`.
- Env (server only): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CLIENT_ORIGIN`, `TRUST_PROXY_HOPS`. See `DEPLOY.md`.
- Do not deploy during a game. Restart kills in-memory rooms.

## 11. Scaling note
One server instance only. Past that, add Redis and the Socket.IO Redis adapter. Not needed for friends.

## 12. ADRs (decisions)
1. In-memory state over database: simplest, games last under an hour.
2. Socket.IO over Supabase Realtime: authoritative secrets and timers are easier on a real server.
3. LiveKit over raw WebRTC: server-enforced mute and TURN included.
4. Audio-first: video costs battery and bandwidth for little gain.
