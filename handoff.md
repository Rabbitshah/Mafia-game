# Handoff: Mafia Night

## Where we left off (2026-11-22)
- Code exists and runs: `npm run dev` gives client :5173 and server :3001. Tests 29/29 pass, typecheck clean.
- Status per AGENTS.md: days 1-2 done (rooms, lobby, join/rejoin, role dealing, leak tests). Next is day 3: night phase.

## Done this session
- Fixed broken node_modules (missing native binaries): `rm -rf node_modules && npm ci`.
- Fixed phone "server error": server CORS only allowed localhost. Added `allowLan` (dev only, when CLIENT_ORIGIN is unset) in `apps/server/src/server.ts` and `index.ts`.
- Fixed QR pointing at localhost: dev-only `/lan` route on the server; `Lobby.tsx` uses it to build the QR/share link. `socket.ts` now exports `serverUrl`.

## Open / unverified
- QR scan from a real phone not tested after the fix.
- Phone join by code works (confirmed by Maanav).
- No tests for `/lan` or the LAN origin rule.
- `_to_delete/` folder in the repo root is untouched, Maanav to review.
- No linter. Dev servers were stopped at session end.

## Next step
Reload the laptop page, create a room, scan the QR on the phone. Then start day 3 (night phase).
