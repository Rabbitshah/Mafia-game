import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advancePhase,
  allVotesIn,
  createRoom,
  getStateFor,
  rematch,
  startGame,
  submitVote,
  voteTargets,
  type Rng,
  type Room,
  type RoleId,
} from './index';

const seeded = (seed: number): Rng => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const T0 = 1_000_000;

/** A 7-player game parked at the start of VOTING (day 1, everyone alive). */
function voting(n = 7): Room {
  let room = createRoom('ABC234', { id: 'p0', name: 'P0', tokenHash: 'h', socketId: 's0' }, T0);
  for (let i = 1; i < n; i++) {
    const r = addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: 'h', socketId: `s${i}` }, T0);
    if (!r.ok) throw new Error(r.error);
    room = r.value;
  }
  const s = startGame(room, 'p0', seeded(5), T0);
  if (!s.ok) throw new Error(s.error);
  return advancePhase({ ...s.value, phase: 'DISCUSSION', day: 1 }, seeded(1), T0);
}
const vote = (room: Room, who: string, target: string | null): Room => {
  const r = submitVote(room, who, target, T0 + 1);
  if (!r.ok) throw new Error(`${who} -> ${target}: ${r.error}`);
  return r.value;
};
const end = (room: Room, rng = seeded(1)) => advancePhase(room, rng, T0 + 60_000);
const withRole = (room: Room, role: RoleId) => [...room.players.values()].filter((p) => p.role === role);

describe('voting phase', () => {
  it('discussion leads into voting with a fresh timer and empty votes', () => {
    const v = voting();
    expect(v.phase).toBe('VOTING');
    expect(v.votes).toEqual({});
    expect(v.phaseEndsAt).toBe(T0 + v.settings.voteSec * 1000);
  });

  it('validates votes: phase, alive, target, no self-vote', () => {
    const v = voting();
    expect(submitVote({ ...v, phase: 'NIGHT' }, 'p0', 'p1', T0)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(submitVote(v, 'p0', 'p0', T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(submitVote(v, 'p0', 'nobody', T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(submitVote(v, 'ghost', 'p1', T0)).toEqual({ ok: false, error: 'NO_SUCH_PLAYER' });
    const players = new Map(v.players);
    players.set('p2', { ...players.get('p2')!, alive: false });
    const d = { ...v, players };
    expect(submitVote(d, 'p2', 'p1', T0)).toEqual({ ok: false, error: 'NOT_ALIVE' });
    expect(submitVote(d, 'p1', 'p2', T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(voteTargets(v, 'p0')).not.toContain('p0');
    expect(voteTargets(v, 'p0')).toHaveLength(6);
  });

  it('latest vote wins and allVotesIn counts abstain', () => {
    let v = voting(5);
    v = vote(v, 'p0', 'p1');
    v = vote(v, 'p0', 'p2');
    expect(v.votes.p0).toBe('p2');
    expect(allVotesIn(v)).toBe(false);
    for (const id of ['p1', 'p2', 'p3']) v = vote(v, id, null);
    expect(allVotesIn(v)).toBe(false);
    v = vote(v, 'p4', null);
    expect(allVotesIn(v)).toBe(true);
  });
});

describe('resolution', () => {
  it('plurality eliminates, reveals role, ends in ELIMINATION then NIGHT', () => {
    let v = voting();
    for (const id of ['p0', 'p1', 'p2']) v = vote(v, id, 'p6');
    v = vote(v, 'p3', 'p5');
    const out = end(v);
    // Win check may end the game; pick a target that keeps it going.
    expect(out.elimination?.eliminatedId).toBe('p6');
    expect(out.players.get('p6')?.alive).toBe(false);
    expect(out.elimination?.tally[0]).toEqual({ targetId: 'p6', count: 3 });
    if (out.phase === 'ELIMINATION') {
      expect(out.phaseEndsAt).toBe(T0 + 60_000 + out.settings.eliminationSec * 1000);
      const n = advancePhase(out, seeded(1), T0 + 70_000);
      expect(n.phase).toBe('NIGHT');
      expect(n.day).toBe(2);
      expect(n.votes).toEqual({});
    } else {
      expect(out.phase).toBe('GAME_OVER');
    }
  });

  it('no votes means nobody is eliminated', () => {
    const out = end(voting());
    expect(out.elimination).toMatchObject({ outcome: 'no_votes', eliminatedId: null });
    expect(out.phase).toBe('ELIMINATION');
    expect([...out.players.values()].every((p) => p.alive)).toBe(true);
  });

  it('abstain votes do not count', () => {
    let v = voting();
    for (const id of ['p0', 'p1', 'p2']) v = vote(v, id, null);
    v = vote(v, 'p3', 'p4');
    expect(end(v).elimination?.eliminatedId).toBe('p4');
  });

  it('a tie starts a runoff between only the tied players; a second tie eliminates nobody', () => {
    let v = voting(9);
    v = vote(v, 'p0', 'p5');
    v = vote(v, 'p1', 'p5');
    v = vote(v, 'p2', 'p6');
    v = vote(v, 'p3', 'p6');
    const r = end(v);
    expect(r.phase).toBe('RUNOFF');
    expect(r.runoffCandidates.sort()).toEqual(['p5', 'p6']);
    expect(r.votes).toEqual({});
    expect(submitVote(r, 'p0', 'p7', T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(voteTargets(r, 'p5')).toEqual(['p6']); // a candidate may only vote for the other one
    let r2 = vote(r, 'p0', 'p5');
    r2 = vote(r2, 'p1', 'p6');
    const out = end(r2);
    expect(out.elimination).toMatchObject({ outcome: 'tie', eliminatedId: null });
    expect(out.phase).toBe('ELIMINATION');
  });

  it('a runoff can eliminate one of the tied players', () => {
    let v = voting(9);
    v = vote(v, 'p0', 'p5');
    v = vote(v, 'p1', 'p6');
    const r = end(v);
    expect(r.phase).toBe('RUNOFF');
    let r2 = vote(r, 'p0', 'p5');
    r2 = vote(r2, 'p1', 'p5');
    r2 = vote(r2, 'p2', 'p6');
    expect(end(r2).elimination?.eliminatedId).toBe('p5');
  });

  it("tieRule 'none' skips the runoff; 'random' picks one of the tied", () => {
    let v = voting(9);
    v = vote(vote(v, 'p0', 'p5'), 'p1', 'p6');
    expect(end({ ...v, settings: { ...v.settings, tieRule: 'none' } }).elimination?.outcome).toBe('tie');
    const rnd = end({ ...v, settings: { ...v.settings, tieRule: 'random' } });
    expect(['p5', 'p6']).toContain(rnd.elimination?.eliminatedId);
  });

  it('eliminating the last Mafia ends the game with Town winning; roles become public', () => {
    let v = voting();
    const mafia = withRole(v, 'mafia');
    const players = new Map(v.players);
    // keep exactly one Mafia alive
    for (const m of mafia.slice(1)) players.set(m.id, { ...m, alive: false });
    v = { ...v, players };
    const last = mafia[0]!;
    for (const p of players.values()) if (p.alive && p.id !== last.id) v = vote(v, p.id, last.id);
    const out = end(v);
    expect(out.phase).toBe('GAME_OVER');
    expect(out.winner).toBe('town');
    expect(getStateFor(out, 'p0')?.players.every((p) => p.revealedRole !== null)).toBe(true);
  });

  it('Mafia win when a wrong vote leaves them level with Town', () => {
    // 1 Mafia + 2 Town alive. Town votes out the other Town player -> 1 vs 1 -> Mafia wins.
    let v = voting(5);
    const mafia = withRole(v, 'mafia')[0]!;
    const town = [...v.players.values()].filter((p) => p.id !== mafia.id).map((p) => p.id);
    const players = new Map(v.players);
    for (const id of town.slice(2)) players.set(id, { ...players.get(id)!, alive: false });
    v = { ...v, players };
    const [a, b] = town as [string, string];
    v = vote(v, a, b);
    v = vote(v, mafia.id, b);
    const out = end(v);
    expect(out.phase).toBe('GAME_OVER');
    expect(out.winner).toBe('mafia');
    expect(out.elimination?.eliminatedId).toBe(b);
  });

  it('game continues when Town still outnumbers Mafia after a vote', () => {
    let v = voting(7);
    const town = [...v.players.values()].filter((p) => p.role !== 'mafia');
    for (const p of v.players.values()) if (p.id !== town[0]!.id) v = vote(v, p.id, town[0]!.id);
    expect(end(v).phase).toBe('ELIMINATION');
  });
});

describe('views', () => {
  it('hides who picked whom when publicVotes is off, but still shows who has voted', () => {
    let v = voting();
    v = { ...v, settings: { ...v.settings, publicVotes: false } };
    v = vote(v, 'p0', 'p1');
    const view = getStateFor(v, 'p2')!;
    expect(view.voting?.votes).toBeNull();
    expect(view.voting?.voted).toEqual(['p0']);
    expect(view.voting?.chosen).toBeNull();
    expect(getStateFor(v, 'p0')!.voting?.chosen).toBe('p1');
  });

  it('shows live votes when publicVotes is on, and dead players can watch but not vote', () => {
    let v = voting();
    v = vote(v, 'p0', 'p1');
    expect(getStateFor(v, 'p2')!.voting?.votes).toEqual([{ voterId: 'p0', targetId: 'p1' }]);
    const players = new Map(v.players);
    players.set('p3', { ...players.get('p3')!, alive: false });
    expect(getStateFor({ ...v, players }, 'p3')!.voting?.canVote).toBe(false);
  });

  it('never lists you as your own candidate', () => {
    const v = voting();
    expect(getStateFor(v, 'p0')!.voting?.candidates.map((c) => c.id)).not.toContain('p0');
  });

  it('outside voting there is no voting view', () => {
    const v = voting();
    expect(getStateFor({ ...v, phase: 'NIGHT' }, 'p0')!.voting).toBeNull();
  });
});

describe('rematch', () => {
  it('only the host, only after the game, resets everyone and drops disconnected players', () => {
    let v = voting();
    const over: Room = { ...v, phase: 'GAME_OVER', winner: 'town' };
    expect(rematch(v, 'p0', T0)).toEqual({ ok: false, error: 'NOT_FINISHED' });
    expect(rematch(over, 'p1', T0)).toEqual({ ok: false, error: 'NOT_HOST' });
    const players = new Map(over.players);
    players.set('p6', { ...players.get('p6')!, connected: false, socketId: null });
    players.set('p2', { ...players.get('p2')!, alive: false });
    const r = rematch({ ...over, players }, 'p0', T0 + 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.phase).toBe('LOBBY');
    expect(r.value.players.size).toBe(6);
    expect([...r.value.players.values()].every((p) => p.alive && p.role === null)).toBe(true);
    expect(r.value.winner).toBeNull();
    expect(r.value.elimination).toBeNull();
    // can start again
    const again = startGame(r.value, 'p0', seeded(9), T0 + 10);
    expect(again.ok).toBe(true);
  });
});
