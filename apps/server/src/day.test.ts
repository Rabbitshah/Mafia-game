import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Creds, PlayerView } from '@mafia/shared';
import { createGameServer } from './server';

type Server = ReturnType<typeof createGameServer>;
interface TC {
  socket: Socket;
  creds: Creds;
  last: () => PlayerView;
  emit: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
}

let server: Server;
let url: string;
const sockets: Socket[] = [];

async function setup(timing?: Parameters<typeof createGameServer>[0]['timing']) {
  server = createGameServer({ clientOrigin: 'http://localhost:5173', minPlayers: 5, lobbyGraceMs: 50, timing });
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server.close();
  await new Promise((r) => server.httpServer.close(r));
});

async function mk(first: boolean, code?: string, name = 'P'): Promise<TC> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  let last!: PlayerView;
  socket.on('state:snapshot', (v: PlayerView) => (last = v));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  const emit: TC['emit'] = (e, p) => new Promise((res) => socket.emit(e, p, res));
  const r = await emit(first ? 'room:create' : 'room:join', first ? { name } : { code, name });
  return { socket, creds: r as unknown as Creds, last: () => last, emit };
}

async function game(n = 5): Promise<TC[]> {
  const host = await mk(true, undefined, 'P0');
  const ps = [host];
  for (let i = 1; i < n; i++) ps.push(await mk(false, host.creds.code, `P${i}`));
  expect((await host.emit('host:start')).ok).toBe(true);
  await wait(60);
  return ps;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byRole = (ps: TC[], role: string) => ps.filter((p) => p.last().you.role === role);

async function toVoting(ps: TC[]) {
  // reveal -> night -> morning -> discussion -> voting, all via host skip
  for (let i = 0; i < 4; i++) {
    expect((await ps[0]!.emit('host:skip')).ok).toBe(true);
    await wait(40);
  }
}

describe('day vote over the wire', () => {
  beforeEach(() => setup());

  it('walks to voting, rejects bad votes, and shows a safe public view', async () => {
    const ps = await game();
    await toVoting(ps);
    expect(ps[0]!.last().phase).toBe('VOTING');
    const alive = ps.filter((p) => p.last().players.find((x) => x.id === p.creds.playerId)?.alive);
    const a = alive[0]!;
    expect((await a.emit('vote:cast', { target: a.creds.playerId })).error).toBe('INVALID_TARGET');
    expect((await a.emit('vote:cast', {})).error).toBe('INVALID_TARGET');
    expect((await a.emit('vote:cast', { target: 'nope' })).error).toBe('INVALID_TARGET');
    // nobody has died yet only if the night kill was skipped (no actions were submitted), so no role is public
    const { you, ...pub } = a.last();
    expect(JSON.stringify(pub)).not.toMatch(/"(mafia|doctor|detective|villager)"/);
  });

  it('ends the vote early when everyone has voted, then eliminates and reveals the role', async () => {
    const ps = await game(7);
    await toVoting(ps);
    const target = ps[6]!;
    for (const p of ps.slice(0, 6)) expect((await p.emit('vote:cast', { target: target.creds.playerId })).ok).toBe(true);
    // the target has not voted yet, so the vote is still open
    expect(ps[0]!.last().phase).toBe('VOTING');
    expect((await target.emit('vote:cast', { target: null })).ok).toBe(true);
    await wait(60);
    const v = ps[0]!.last();
    expect(['ELIMINATION', 'GAME_OVER']).toContain(v.phase);
    expect(v.elimination?.eliminatedId).toBe(target.creds.playerId);
    expect(v.players.find((p) => p.id === target.creds.playerId)?.revealedRole).not.toBeNull();
  });

  it('only the host can start a rematch, and only after the game', async () => {
    const ps = await game();
    expect((await ps[0]!.emit('host:rematch')).error).toBe('NOT_FINISHED');
    // force a finished game: host skips the vote with a clear Town win by voting out every Mafia isn't
    // deterministic here, so just check the permission error order
    expect((await ps[1]!.emit('host:rematch')).error).toBe('NOT_HOST');
  });
});

describe('timers drive the vote', () => {
  beforeEach(() =>
    setup({ roleRevealSec: 0.05, nightSec: 0.05, morningSec: 0.05, discussionSec: 0.05, voteSec: 0.1, eliminationSec: 0.05 }),
  );

  it('runs on its own through voting and into the next night', async () => {
    const ps = await game();
    await wait(1200);
    const v = ps[0]!.last();
    // with no votes: no_votes elimination, then night 2 (or discussion/vote of later days)
    expect(v.day).toBeGreaterThanOrEqual(2);
    expect(v.phase).not.toBe('LOBBY');
  });
});
