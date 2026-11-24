# PRD: Mafia Night (working title)

Status: Draft v1 | Owner: Maanav | Date: 2026-11-18

## 1. Problem
- Friends want to play Mafia (Werewolf) mostly **remotely**, sometimes **in one room**.
- Existing sites are either generic, die without notice, or lack our house rules, language (Hinglish) and theme.
- A human narrator must sit out. Nobody wants that.

## 2. Goal
A free, no-install, mobile-first web game where the **server acts as narrator**, roles stay secret, and voice runs inside the game with night auto-mute.

## 3. Non-goals (v1)
- Public matchmaking, accounts, rankings, payments.
- Native apps.
- Video as a core feature (optional toggle later).
- Anti-cheat against screen-sharing or outside chat. Friends-only trust model.

## 4. Personas
| Persona | Need |
|---|---|
| **Host** (organizer friend) | Create room in seconds, set roles and timers, kick or skip AFK players |
| **Remote player** (phone, mobile data) | Join by link or code, hear everyone, never lose seat on app switch |
| **Same-room player** | Phone as private role card, no mic echo |
| **Spectator** (dead player) | See what is happening, listen only |

## 5. Core capabilities
1. Room: create, join by 6-char code, link or QR. 5 to 15 players.
2. Server deals roles (Mafia, Doctor, Detective, Villager). Later: Jester, Godfather, Bodyguard, Vigilante.
3. Automated phases: Lobby, Role reveal, Night, Morning, Discussion, Vote, Elimination, Win check.
4. Per-player secret state. Mafia see teammates. Detective sees private results.
5. Voice (v2): LiveKit audio. Day: alive speak. Night: all muted, Mafia get private channel. Dead: listen only.
6. Narrator: text first, then recorded or TTS lines (Hinglish option).
7. Host controls: start, settings, kick, skip phase, pause, transfer host, play again.

## 5a. AI scope
- No ML model in v1. "AI" here means only optional narrator TTS (Web Speech API or pre-recorded clips) and AI coding agents building this repo.
- Model and data cards are therefore minimal. See `DATA_AND_MODEL_CARDS.md`.

## 6. Inputs and outputs
| Input | Output |
|---|---|
| Display name, room code | Seat in room, private role card |
| Night action (target) | Morning announcement |
| Vote (target) | Elimination and win check |
| Voice (v2) | Phase-aware audio routing |

## 7. Rules (defaults, all host toggles)
- Mafia ratio: 1 per 3 to 4 players. 5-6 players = 1, 7-9 = 2, 10-13 = 3, 14-15 = 4.
- Doctor self-save: once per game. No same target on consecutive nights.
- Tied vote: runoff, then no elimination.
- Night resolution order: blocks, protects, kills, investigations.
- Missing action at timer end = no action.
- Self-vote: disallowed. Role reveal on death: on.

## 8. Success metrics (targets, to measure in playtests)
| Metric | Target |
|---|---|
| Time from create room to first night | under 3 min for 6 players |
| Role leak incidents | 0 (automated test in CI) |
| Reconnect after phone lock | under 5 s, seat kept |
| Action to UI update (p95, mobile data) | under 500 ms |
| Completed games out of started | 80%+ |
| Monthly cost | Rs 0 on free tiers |
| Friends who say "play again" | 4 of 5 |

## 9. Constraints
- Solo student dev, evenings and weekends. v1 in about 6 days, voice in week 2.
- Free tiers only: Render (sleeps after 15 min idle), Vercel, LiveKit Cloud (about 5,000 free participant-minutes per month, verify).
- In-memory state. Server restart ends active games. Accepted.

## 10. Release plan
| Version | Scope |
|---|---|
| v1 | Lobby, 4 roles, full loop, reconnect, host controls. Voice on Discord call. |
| v2 | LiveKit voice with night mute, Mafia channel, narrator audio, sounds, 4 extra roles, settings panel |
| v3 | Themes, custom roles JSON, history in Postgres, PWA, optional video, table screen |

## 11. Risks
| Risk | Mitigation |
|---|---|
| Role leak via client state | `getStateFor(playerId)` only, leak test |
| iOS background freezes sockets | Resync on `visibilitychange`, wake lock |
| Voice flaky on mobile | Auto-rejoin, status indicator, test on mobile data early |
| Render cold start | Open site 1 min before game |
| Scope creep | Ship 4 roles, playtest, then add |

## 12. Open questions
- Final name and theme?
- Hinglish narrator lines: who writes them?
- Any friends under 18? (affects consent wording)
