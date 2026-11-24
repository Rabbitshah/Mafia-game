import { createGameServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const minPlayers = process.env.MIN_PLAYERS ? Number(process.env.MIN_PLAYERS) : undefined;
// LAN mode is opt-in (`npm run dev` sets ALLOW_LAN=1) and is never allowed in production.
const allowLan = process.env.ALLOW_LAN === '1' && process.env.NODE_ENV !== 'production';

// Dev only: short phases so one person can click through a whole night quickly.
const fast = process.env.FAST_PHASES === '1' && process.env.NODE_ENV !== 'production';

// How many reverse proxies sit in front of the server. Leave unset locally. Set on the host and verify.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0) || 0;

const { httpServer } = createGameServer({
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  allowLan,
  trustProxyHops,
  minPlayers,
  timing: fast ? { roleRevealSec: 5, nightSec: 12, morningSec: 4, discussionSec: 20, voteSec: 20, eliminationSec: 4 } : undefined,
});

httpServer.listen(port, () => {
  console.log(`mafia server listening on :${port}${allowLan ? ' (LAN dev mode)' : ''}`);
});
