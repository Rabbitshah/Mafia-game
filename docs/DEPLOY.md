# Deploy guide (Render server + Vercel client)

Nothing here has been deployed yet. Treat the config files as a starting point and test each step.

## Before you start
- [ ] Put the repo on GitHub (it has no commits yet): `git add -A && git commit -m "Mafia Night"`, then push to a new repo.
- [ ] Check `.gitignore` keeps `.env`, `node_modules`, `dist`, `_to_delete`, `.claude-review` out of the repo.
- [ ] `npm run typecheck && npm run test && npm run build` all pass.

## 1. Server on Render (free)
1. Render dashboard -> New -> Blueprint -> pick the repo. It reads `render.yaml`.
2. Set `CLIENT_ORIGIN` to your future Vercel URL (you can edit it after step 2).
3. Wait for the deploy, then open `https://<service>.onrender.com/healthz`. It should return ok.
4. Note the server URL for step 2.

Free-tier facts (from Render's docs, checked Nov 2026):
- The service spins down after **15 minutes without inbound traffic**. WebSocket messages from open connections count as traffic, so an active game keeps it awake.
- Waking from a cold start takes a few seconds, sometimes up to about 30 seconds. **Open the game link a minute before friends join.**
- A redeploy, restart or spin-down **destroys all rooms** (state is in memory). Never deploy during a game.
- Some people report sockets dropping after about 5 minutes on the free plan. Unconfirmed. The client reconnects and rejoins automatically, but watch for this in your first long game.

## 2. Client on Vercel
1. Vercel -> Add New Project -> same repo. It reads `vercel.json`.
2. Environment variable: `VITE_SERVER_URL` = the Render URL from step 1 (no trailing slash).
3. Deploy. Copy the Vercel URL.
4. Go back to Render and set `CLIENT_ORIGIN` to that exact URL (no trailing slash). Redeploy the server.

## 3. After the first deploy
- [ ] Create a room on your phone using the Vercel URL, join from a second device, play a night.
- [ ] Share link and QR use the Vercel URL, not localhost.
- [ ] `TRUST_PROXY_HOPS`: confirm the per-IP limits see different IPs for different networks (create 6 rooms from one phone -> the 6th is refused; a friend on another network is not).
- [ ] Reload mid-game on the phone: you land back in your seat.
- [ ] `CLIENT_ORIGIN` is exactly the Vercel URL. Other origins are refused.

## Alternatives if free Render is annoying
- Render Starter (paid) removes the spin-down.
- Keep-alive pings are possible but Render's staff have said keeping a free service awake that way is abuse. Not recommended.
