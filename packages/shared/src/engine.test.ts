import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildRoles,
  createRoom,
  defaultSettings,
  getStateFor,
  mafiaCountFor,
  normalizeName,
  removePlayer,
  resolveMafiaCount,
  startGame,
  updateSettings,
  type Room,
  type Rng,
} from './index';

/** Small deterministic RNG (mulberry32) so tests are repeatable. */
function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lobby(n: number): Room {
  let room = createRoom('ABC234', { id: 'p0', name: 'P0', tokenHash: 'h0', socketId: 's0' }, 1);
  for (let i = 1; i < n; i++) {
    const r = addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `h${i}`, socketId: `s${i}` }, 1);
    if (!r.ok) throw new Error(r.error);
    room = r.value;
  }
  return room;
}

describe('names', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Maanav   S  ')).toBe('Maanav S');
  });
  it('rejects empty, too long, non-strings', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(21))).toBeNull();
    expect(normalizeName(42)).toBeNull();
  });
  it('strips control characters', () => {
    expect(normalizeName('a\u0000b\nc')).toBe('abc');
  });
});

describe('mafia count', () => {
  it('auto table matches the PRD', () => {
    const table: [number, number][] = [[5, 1], [6, 1], [7, 2], [9, 2], [10, 3], [13, 3], [14, 4], [15, 4]];
    for (const [n, m] of table) expect(mafiaCountFor(n)).toBe(m);
  });
  it('custom count is clamped so Town still outnumbers Mafia after one night kill', () => {
    const s = { ...defaultSettings(), mafiaCount: 7 };
    expect(resolveMafiaCount(5, s)).toBe(1);
    expect(resolveMafiaCount(6, s)).toBe(2);
    expect(resolveMafiaCount(15, s)).toBe(6);
  });
});

describe('buildRoles', () => {
  it('gives one doctor, one detective, right mafia count, rest villagers', () => {
    for (let n = 5; n <= 15; n++) {
      const roles = buildRoles(n, defaultSettings(), seeded(n));
      expect(roles).toHaveLength(n);
      expect(roles.filter((r) => r === 'doctor')).toHaveLength(1);
      expect(roles.filter((r) => r === 'detective')).toHaveLength(1);
      expect(roles.filter((r) => r === 'mafia')).toHaveLength(mafiaCountFor(n));
      expect(roles.filter((r) => r === 'villager')).toHaveLength(n - mafiaCountFor(n) - 2);
    }
  });
  it('is deterministic for a seed and varies across seeds', () => {
    const a = buildRoles(9, defaultSettings(), seeded(1));
    const b = buildRoles(9, defaultSettings(), seeded(1));
    const c = buildRoles(9, defaultSettings(), seeded(2));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('lobby rules', () => {
  it('rejects duplicate names (case-insensitive)', () => {
    const room = lobby(2);
    const r = addPlayer(room, { id: 'x', name: 'p1', tokenHash: 'h', socketId: null }, 2);
    expect(r).toEqual({ ok: false, error: 'NAME_TAKEN' });
  });
  it('rejects the 16th player', () => {
    const room = lobby(15);
    const r = addPlayer(room, { id: 'x', name: 'Extra', tokenHash: 'h', socketId: null }, 2);
    expect(r).toEqual({ ok: false, error: 'ROOM_FULL' });
  });
  it('passes host to next player when host leaves', () => {
    const r = removePlayer(lobby(3), 'p0', 2);
    expect(r.ok && r.value?.hostId).toBe('p1');
  });
  it('returns null room when last player leaves', () => {
    const r = removePlayer(lobby(1), 'p0', 2);
    expect(r).toEqual({ ok: true, value: null });
  });
  it('only host can change settings', () => {
    expect(updateSettings(lobby(3), 'p1', { mafiaCount: 2 }, 2)).toEqual({ ok: false, error: 'NOT_HOST' });
    const r = updateSettings(lobby(3), 'p0', { mafiaCount: 2 }, 2);
    expect(r.ok && r.value.settings.mafiaCount).toBe(2);
    expect(updateSettings(lobby(3), 'p0', { mafiaCount: 0 }, 2)).toEqual({ ok: false, error: 'BAD_SETTINGS' });
  });
});

describe('startGame', () => {
  it('needs the host and enough players', () => {
    expect(startGame(lobby(5), 'p1', seeded(1), 2)).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(startGame(lobby(4), 'p0', seeded(1), 2)).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
  });
  it('deals every player a role and moves to ROLE_REVEAL', () => {
    const r = startGame(lobby(7), 'p0', seeded(3), 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.phase).toBe('ROLE_REVEAL');
    for (const p of r.value.players.values()) expect(p.role).not.toBeNull();
  });
  it('cannot join or start after the game began', () => {
    const r = startGame(lobby(5), 'p0', seeded(3), 2);
    if (!r.ok) throw new Error(r.error);
    expect(addPlayer(r.value, { id: 'x', name: 'Late', tokenHash: 'h', socketId: null }, 3)).toEqual({
      ok: false,
      error: 'GAME_STARTED',
    });
    expect(startGame(r.value, 'p0', seeded(3), 3)).toEqual({ ok: false, error: 'NOT_IN_LOBBY' });
  });
});

describe('getStateFor: no role leaks', () => {
  const FORBIDDEN_KEYS = ['role', 'tokenHash', 'socketId'];

  function keysOutsideYou(value: unknown, path = '', out: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((v, i) => keysOutsideYou(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        const here = path ? `${path}.${k}` : k;
        if (FORBIDDEN_KEYS.includes(k) && !here.startsWith('you.')) out.push(here);
        keysOutsideYou(v, here, out);
      }
    }
    return out;
  }

  it('never exposes other players roles, tokens or socket ids', () => {
    const started = startGame(lobby(9), 'p0', seeded(5), 2);
    if (!started.ok) throw new Error(started.error);
    const room = started.value;
    for (const p of room.players.values()) {
      const view = getStateFor(room, p.id);
      expect(view).not.toBeNull();
      expect(keysOutsideYou(view)).toEqual([]);
      expect(view?.you.role).toBe(p.role);
    }
  });

  it('only mafia see teammates, and not themselves', () => {
    const started = startGame(lobby(9), 'p0', seeded(5), 2);
    if (!started.ok) throw new Error(started.error);
    const room = started.value;
    const mafiaIds = [...room.players.values()].filter((p) => p.role === 'mafia').map((p) => p.id);
    for (const p of room.players.values()) {
      const view = getStateFor(room, p.id)!;
      if (p.role === 'mafia') {
        expect(view.you.teammates.map((t) => t.id).sort()).toEqual(mafiaIds.filter((id) => id !== p.id).sort());
      } else {
        expect(view.you.teammates).toEqual([]);
      }
    }
  });

  it('returns null for unknown players', () => {
    expect(getStateFor(lobby(2), 'nobody')).toBeNull();
  });
});
