import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advancePhase,
  createRoom,
  getStateFor,
  kickPlayer,
  startGame,
  submitNightAction,
  submitVote,
  togglePause,
  updateSettings,
  type Rng,
  type Room,
} from './index';

const rng: Rng = () => 0.3;
const T0 = 1_000_000;

function lobby(n = 5): Room {
  let room = createRoom('ABC234', { id: 'p0', name: 'P0', tokenHash: 'h', socketId: 's0' }, T0);
  for (let i = 1; i < n; i++) {
    const r = addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: 'h', socketId: `s${i}` }, T0);
    if (!r.ok) throw new Error(r.error);
    room = r.value;
  }
  return room;
}
const started = (n = 5): Room => {
  const r = startGame(lobby(n), 'p0', rng, T0);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('settings', () => {
  it('accepts valid timers, tie rule and toggles; only the host, only in the lobby', () => {
    const r = updateSettings(
      lobby(),
      'p0',
      { voteSec: 60, nightSec: 45, tieRule: 'random', publicVotes: false, revealOnDeath: false, doctorSelfSave: 'never' },
      T0,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings).toMatchObject({
        voteSec: 60,
        nightSec: 45,
        tieRule: 'random',
        publicVotes: false,
        revealOnDeath: false,
        doctorSelfSave: 'never',
      });
    }
    expect(updateSettings(lobby(), 'p1', { voteSec: 60 }, T0)).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(updateSettings(started(), 'p0', { voteSec: 60 }, T0)).toEqual({ ok: false, error: 'NOT_IN_LOBBY' });
  });

  it('rejects out-of-range, non-integer and wrong-type values and changes nothing', () => {
    const bad: Record<string, unknown>[] = [
      { voteSec: 5 },
      { voteSec: 9999 },
      { voteSec: 30.5 },
      { voteSec: '30' },
      { nightSec: null },
      { tieRule: 'coinflip' },
      { doctorSelfSave: 'sometimes' },
      { publicVotes: 'yes' },
      { mafiaCount: 99 },
    ];
    for (const patch of bad) expect(updateSettings(lobby(), 'p0', patch, T0)).toEqual({ ok: false, error: 'BAD_SETTINGS' });
  });

  it('ignores unknown keys', () => {
    const base = lobby();
    const r = updateSettings(base, 'p0', { hostId: 'p3', evil: true }, T0);
    expect(r.ok && r.value.hostId).toBe('p0');
  });
});

describe('kick', () => {
  it('host removes another lobby player; not self, not unknown, not others, not in game', () => {
    const r = kickPlayer(lobby(), 'p0', 'p3', T0);
    expect(r.ok && r.value.players.has('p3')).toBe(false);
    expect(r.ok && r.value.players.size).toBe(4);
    expect(kickPlayer(lobby(), 'p0', 'p0', T0)).toEqual({ ok: false, error: 'NO_SUCH_PLAYER' });
    expect(kickPlayer(lobby(), 'p0', 'zzz', T0)).toEqual({ ok: false, error: 'NO_SUCH_PLAYER' });
    expect(kickPlayer(lobby(), 'p1', 'p2', T0)).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(kickPlayer(started(), 'p0', 'p2', T0)).toEqual({ ok: false, error: 'NOT_IN_LOBBY' });
  });
});

describe('pause', () => {
  it('stops the clock, remembers the time left, and resumes with it', () => {
    const g = started(); // ROLE_REVEAL, ends at T0 + 20s
    const p = togglePause(g, 'p0', T0 + 5_000);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.paused).toBe(true);
    expect(p.value.phaseEndsAt).toBeNull();
    expect(p.value.pausedMs).toBe(15_000);
    expect(getStateFor(p.value, 'p1')?.paused).toBe(true);
    expect(getStateFor(p.value, 'p1')?.pausedMs).toBe(15_000);
    expect(getStateFor(g, 'p1')?.pausedMs).toBeNull();
    const r = togglePause(p.value, 'p0', T0 + 100_000);
    expect(r.ok && r.value.paused).toBe(false);
    expect(r.ok && r.value.phaseEndsAt).toBe(T0 + 100_000 + 15_000);
  });

  it('only the host can pause, and only a timed phase', () => {
    expect(togglePause(started(), 'p1', T0)).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(togglePause(lobby(), 'p0', T0)).toEqual({ ok: false, error: 'NOT_PAUSABLE' });
    expect(togglePause({ ...started(), phase: 'GAME_OVER' }, 'p0', T0)).toEqual({ ok: false, error: 'NOT_PAUSABLE' });
  });

  it('blocks night actions and votes while paused', () => {
    const night = advancePhase(started(7), rng, T0);
    const mafia = [...night.players.values()].find((p) => p.role === 'mafia')!;
    const target = [...night.players.values()].find((p) => p.role !== 'mafia')!;
    const paused = togglePause(night, 'p0', T0 + 1);
    if (!paused.ok) throw new Error(paused.error);
    expect(submitNightAction(paused.value, mafia.id, target.id, T0 + 2)).toEqual({ ok: false, error: 'PAUSED' });
    const voting: Room = { ...paused.value, phase: 'VOTING', paused: true };
    expect(submitVote(voting, 'p0', 'p1', T0 + 2)).toEqual({ ok: false, error: 'PAUSED' });
  });

  it('skipping while paused moves on and clears the pause', () => {
    const g = started();
    const p = togglePause(g, 'p0', T0 + 1);
    if (!p.ok) throw new Error(p.error);
    const next = advancePhase(p.value, rng, T0 + 2);
    expect(next.phase).toBe('NIGHT');
    expect(next.paused).toBe(false);
    expect(next.phaseEndsAt).not.toBeNull();
  });
});
