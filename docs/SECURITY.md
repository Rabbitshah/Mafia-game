# Security & Access Control Specification

Trust model: friends-only, low stakes, but **cheating by reading network data is easy**, so secrets are protected properly.

## 1. Assets
| Asset | Why it matters |
|---|---|
| Player roles and night actions | The whole game |
| Rejoin tokens | Seat takeover |
| LiveKit API key and secret | Voice abuse, cost |
| Room codes | Uninvited joiners |

## 2. Permissions matrix
| Action | Host | Player (alive) | Dead | Spectator link |
|---|---|---|---|---|
| Change settings (lobby) | yes | no | no | no |
| Start, kick, skip, pause | yes | no | no | no |
| Night action | no (unless role) | role holders | no | no |
| Vote | no (unless alive) | yes | no | no |
| See own role | yes | yes | yes | no |
| See all roles | after game | after game | after game (optional live) | no |
| Speak (voice) | per phase table in ARCHITECTURE.md | per phase | no | no |

## 3. Threats and controls
| Threat | Control |
|---|---|
| Role leak through Network tab | `getStateFor(playerId)` only. Automated test: serialize every outgoing payload and assert no foreign role appears. |
| Settings abuse (huge timers, wrong types) | Every setting is range-checked on the server (`TIMER_LIMITS`), unknown keys are ignored, only the host can change them, only in the lobby |
| Fake events (vote for dead, act in wrong phase) | Server validates room, phase, alive, target, already-acted on every event |
| Seat hijack | Secret `token` (random 32 bytes). Server stores hash only. Rejoin requires playerId + token |
| Room code guessing | 6 chars from unambiguous alphabet, `crypto.randomInt`, join rate limit per IP |
| Spam and DoS | 10 events per second per socket (the flooded caller gets a `RATE_LIMIT` reply), 5 room creations per minute per IP, 15 players per room, 50 rooms max. Per-IP limits ignore `X-Forwarded-For` unless `TRUST_PROXY_HOPS` is set; then the address is counted from the right, because the left side is client-controlled |
| XSS via names | Name 1 to 20 chars, plain text only, React escapes by default, never `dangerouslySetInnerHTML` |
| Cross-origin abuse | CORS and Socket.IO `cors.origin` = exact client origin only. Private-LAN origins and `/lan` are allowed only when `ALLOW_LAN=1` and `NODE_ENV!=production` (explicit opt-in, tested in `origin.test.ts`). Raw WebSockets ignore CORS, so the server also checks the `Origin` header on every connection (`allowRequest`). Clients that send no Origin (scripts, bots) still connect, so this stops other websites, not determined attackers |
| Voice unmute cheating | Mute enforced by LiveKit permissions from the server, not by client UI |
| LiveKit secret leak | Server env only. Never in client bundle, never in git |
| Dependency risk | `npm audit` before deploy, lockfile committed |

## 4. Secrets handling
- `.env` files are git-ignored. Commit `.env.example` with placeholders.
- Use Render and Vercel dashboard env vars.
- Rotate LiveKit keys if ever pasted into chat, logs or a screenshot.

## 5. Data privacy rules
- Store only: display name (in memory), role, game actions. No email, phone, location or analytics in v1.
- Voice is **not recorded**. Do not enable LiveKit egress or recording.
- Logs: never log roles, tokens or full socket payloads. Log room code, phase and error codes only.
- Rooms deleted after 2 hours idle or on game end.

## 6. API keys and services
| Key | Where | Scope |
|---|---|---|
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Render env | Token minting and mute control |
| `CLIENT_ORIGIN` | Render env | CORS |
| `TRUST_PROXY_HOPS` | Render env | Number of proxies in front of the server. Probably 1 on Render, **verify** before relying on it |
| `VITE_SERVER_URL` | Vercel env | Public, not secret |

## 7. Pre-launch checklist
- [ ] Leak test passes in CI
- [ ] All handlers validate phase, alive and target
- [ ] Rate limits on, and `TRUST_PROXY_HOPS` checked against the real forwarded header on the host
- [ ] CORS locked to real origin
- [ ] No secrets in repo history (`git log -p | grep -i secret`)
- [ ] Voice not recorded
- [ ] `npm audit` clean or reviewed

## 8. Compliance
See `COMPLIANCE.md`.
