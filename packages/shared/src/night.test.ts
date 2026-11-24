import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advancePhase,
  checkWin,
  createRoom,
  getStateFor,
  nightTargets,
  skipPhase,
  startGame,
  submitNightAction,
  type Player,
  type RoleId,
  type Rng,
  type Room,
} from './index';

function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = 1_000_000;

/** A started game (ROLE_REVEAL) with n players. */
function started(n = 7, seed = 5): Room {
  let room = createRoom('ABC234', { id: 'p0', name: 'P0', tokenHash: 'h', socketId: 's0' }, T0);
  for (let i = 1; i < n; i++) {
    const r = addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: 'h', socketId: `s${i}` }, T0);
    if (!r.ok) throw new Error(r.error);
    room = r.value;
  }
  const s = startGame(room, 'p0', seeded(seed), T0);
  if (!s.ok) throw new Error(s.error);
  return s.value;
}

const night = (room: Room): Room => advancePhase(room, seeded(1), T0 + 1000);
const withRole = (room: Room, role: RoleId): Player[] => [...room.players.values()].filter((p) => p.role === role);
const one = (room: Room, role: RoleId): Player => {
  const p = withRole(room, role)[0];
  if (!p) throw new Error(`no ${role}`);
  return p;
};
const submit = (room: Room, actor: string, target: string | null): Room => {
  const r = submitNightAction(room, actor, target, T0 + 2000);
  if (!r.ok) throw new Error(`${actor} -> ${target}: ${r.error}`);
  return r.value;
};
const resolve = (room: Room, rng: Rng = seeded(1)): Room => advancePhase(room, rng, T0 + 40_000);
/** From MORNING (or later) to the next night. */
const nextNight = (room: Room): Room =>
  advancePhase({ ...advancePhase({ ...room, phase: 'MORNING' }, seeded(1), T0), phase: 'ROLE_REVEAL' }, seeded(1), T0);
const kill = (room: Room, ids: string[]): Room => {
  const players = new Map(room.players);
  for (const id of ids) players.set(id, { ...players.get(id)!, alive: false });
  return { ...room, players };
};

describe('phase flow', () => {
  it('ROLE_REVEAL -> NIGHT 1 -> MORNING -> DISCUSSION with server timers', () => {
    const room = started();
    expect(room.phase).toBe('ROLE_REVEAL');
    expect(room.phaseEndsAt).toBe(T0 + room.settings.roleRevealSec * 1000);

    const n = night(room);
    expect(n.phase).toBe('NIGHT');
    expect(n.day).toBe(1);
    expect(n.phaseEndsAt).toBe(T0 + 1000 + n.settings.nightSec * 1000);

    const m = resolve(n);
    expect(m.phase).toBe('MORNING');
    expect(m.phaseEndsAt).toBe(T0 + 40_000 + m.settings.morningSec * 1000);

    const d = advancePhase(m, seeded(1), T0 + 50_000);
    expect(d.phase).toBe('DISCUSSION');
    expect(d.phaseEndsAt).toBe(T0 + 50_000 + d.settings.discussionSec * 1000);
  });

  it('host can skip phases and others cannot; the lobby cannot be skipped', () => {
    const room = started();
    expect(skipPhase(room, 'p1', seeded(1), T0)).toEqual({ ok: false, error: 'NOT_HOST' });
    const a = skipPhase(room, 'p0', seeded(1), T0);
    expect(a.ok && a.value.phase).toBe('NIGHT');
    const disc = advancePhase(advancePhase(night(room), seeded(1), T0), seeded(1), T0);
    expect(disc.phase).toBe('DISCUSSION');
    const v = skipPhase(disc, 'p0', seeded(1), T0);
    expect(v.ok && v.value.phase).toBe('VOTING');
    const lobby = { ...room, phase: 'LOBBY' as const };
    expect(skipPhase(lobby, 'p0', seeded(1), T0)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

describe('night targets', () => {
  const room = night(started());
  const mafia = one(room, 'mafia');
  const doctor = one(room, 'doctor');
  const detective = one(room, 'detective');
  const villager = one(room, 'villager');

  it('Mafia can pick only non-Mafia', () => {
    const t = nightTargets(room, mafia.id);
    expect(t).not.toContain(mafia.id);
    for (const id of t) expect(room.players.get(id)?.role).not.toBe('mafia');
  });
  it('Doctor may pick self (once by default); Detective may not', () => {
    expect(nightTargets(room, doctor.id)).toContain(doctor.id);
    expect(nightTargets(room, detective.id)).not.toContain(detective.id);
  });
  it('Villagers have no targets, and nobody has targets outside the night', () => {
    expect(nightTargets(room, villager.id)).toEqual([]);
    expect(nightTargets(started(), mafia.id)).toEqual([]);
  });
});

describe('submitNightAction validation', () => {
  const base = night(started());
  const mafia = one(base, 'mafia');
  const detective = one(base, 'detective');
  const villager = one(base, 'villager');

  it('rejects wrong phase, no power, bad target, dead actor', () => {
    expect(submitNightAction(started(), mafia.id, null, T0)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(submitNightAction(base, villager.id, null, T0)).toEqual({ ok: false, error: 'NO_NIGHT_ACTION' });
    expect(submitNightAction(base, mafia.id, mafia.id, T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(submitNightAction(base, detective.id, detective.id, T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(submitNightAction(base, mafia.id, 'ghost', T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(submitNightAction(kill(base, [mafia.id]), mafia.id, null, T0)).toEqual({ ok: false, error: 'NOT_ALIVE' });
    expect(submitNightAction(base, 'nobody', null, T0)).toEqual({ ok: false, error: 'NO_SUCH_PLAYER' });
  });

  it('latest choice wins until the night ends', () => {
    const t = nightTargets(base, mafia.id);
    let room = submit(base, mafia.id, t[0]!);
    room = submit(room, mafia.id, t[1]!);
    expect(room.nightActions[mafia.id]).toBe(t[1]);
  });
});

describe('night resolution', () => {
  it('Mafia kill kills', () => {
    let room = night(started());
    const mafia = one(room, 'mafia');
    const victim = one(room, 'villager');
    room = submit(room, mafia.id, victim.id);
    const out = resolve(room);
    expect(out.players.get(victim.id)?.alive).toBe(false);
    expect(out.morning).toEqual({ day: 1, deathIds: [victim.id] });
  });

  it('Doctor save cancels the kill and gives no reason in the public summary', () => {
    let room = night(started());
    const victim = one(room, 'villager');
    for (const m of withRole(room, 'mafia')) room = submit(room, m.id, victim.id);
    room = submit(room, one(room, 'doctor').id, victim.id);
    const out = resolve(room);
    expect(out.players.get(victim.id)?.alive).toBe(true);
    expect(out.morning).toEqual({ day: 1, deathIds: [] });
  });

  it('nobody dies when Mafia choose nobody or do not act', () => {
    const room = night(started());
    expect(resolve(room).morning?.deathIds).toEqual([]);
    const mafia = one(room, 'mafia');
    expect(resolve(submit(room, mafia.id, null)).morning?.deathIds).toEqual([]);
  });

  it('plurality among Mafia decides; ties go to the rng', () => {
    const room = night(started(9, 3)); // 2 Mafia
    const [m1, m2] = withRole(room, 'mafia') as [Player, Player];
    const targets = nightTargets(room, m1.id);
    const [a, b] = [targets[0]!, targets[1]!];

    // 2 vs 0 plurality: m1 and m2 both pick a
    let r = submit(submit(room, m1.id, a), m2.id, a);
    expect(resolve(r).morning?.deathIds).toEqual([a]);

    // 1 vs 1 tie: rng picks. 0 -> first tied, 0.99 -> last tied.
    r = submit(submit(room, m1.id, a), m2.id, b);
    expect(resolve(r, () => 0).morning?.deathIds).toEqual([a]);
    expect(resolve(r, () => 0.99).morning?.deathIds).toEqual([b]);
  });

  it('a dead Mafia member does not vote', () => {
    let room = night(started(9, 3));
    const [m1, m2] = withRole(room, 'mafia') as [Player, Player];
    const [a, b] = nightTargets(room, m1.id) as [string, string];
    room = submit(submit(room, m1.id, a), m2.id, b);
    const out = resolve(kill(room, [m2.id]), () => 0);
    expect(out.morning?.deathIds).toEqual([a]);
  });
});

describe('Detective', () => {
  it('learns whether the target is Mafia, privately, and keeps findings across nights', () => {
    let room = night(started());
    const det = one(room, 'detective');
    const mafia = one(room, 'mafia');
    const villager = one(room, 'villager');

    room = resolve(submit(room, det.id, mafia.id));
    expect(room.investigations).toEqual([{ day: 1, detectiveId: det.id, targetId: mafia.id, isMafia: true }]);

    room = nextNight(room);
    expect(room.day).toBe(2);
    room = resolve(submit(room, det.id, villager.id));
    expect(room.investigations.map((i) => i.isMafia)).toEqual([true, false]);

    const view = getStateFor(room, det.id)!;
    expect(view.you.investigations.map((i) => i.targetId)).toEqual([mafia.id, villager.id]);
    for (const p of room.players.values()) {
      if (p.id !== det.id) expect(getStateFor(room, p.id)!.you.investigations).toEqual([]);
    }
  });

  it('still gets a finding when the target is killed the same night', () => {
    let room = night(started());
    const det = one(room, 'detective');
    const victim = one(room, 'villager');
    for (const m of withRole(room, 'mafia')) room = submit(room, m.id, victim.id);
    room = submit(room, det.id, victim.id);
    const out = resolve(room);
    expect(out.players.get(victim.id)?.alive).toBe(false);
    expect(out.investigations).toHaveLength(1);
  });
});

describe('Doctor rules', () => {
  it('cannot protect the same player two nights in a row', () => {
    let room = night(started());
    const doc = one(room, 'doctor');
    const other = one(room, 'villager');
    room = resolve(submit(room, doc.id, other.id));
    room = nextNight(room);
    expect(nightTargets(room, doc.id)).not.toContain(other.id);
    expect(submitNightAction(room, doc.id, other.id, T0)).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });

  it('self-save once, then never again (default rule)', () => {
    let room = night(started());
    const doc = one(room, 'doctor');
    room = resolve(submit(room, doc.id, doc.id));
    expect(room.doctorSelfSaveUsed).toBe(true);
    room = nextNight(room);
    expect(nightTargets(room, doc.id)).not.toContain(doc.id);
  });

  it("'never' and 'always' settings", () => {
    const base = night(started());
    const doc = one(base, 'doctor');
    const never = { ...base, settings: { ...base.settings, doctorSelfSave: 'never' as const } };
    expect(nightTargets(never, doc.id)).not.toContain(doc.id);
    const always = { ...base, settings: { ...base.settings, doctorSelfSave: 'always' as const }, doctorSelfSaveUsed: true };
    expect(nightTargets(always, doc.id)).toContain(doc.id);
  });
});

describe('win check', () => {
  it('Town wins with no Mafia, Mafia wins when they equal the rest', () => {
    const room = started(7, 5);
    const mafia = withRole(room, 'mafia').map((p) => p.id);
    expect(checkWin(room)).toBeNull();
    expect(checkWin(kill(room, mafia))).toBe('town');
    const others = [...room.players.values()].filter((p) => p.role !== 'mafia').map((p) => p.id);
    expect(checkWin(kill(room, others.slice(0, others.length - mafia.length)))).toBe('mafia');
  });

  it('a kill that levels the table ends the game and reveals every role', () => {
    let room = night(started(6, 2)); // 1 Mafia + 5 others
    const mafia = one(room, 'mafia');
    const others = [...room.players.values()].filter((p) => p.role !== 'mafia');
    // Leave exactly 1 Mafia + 2 others alive, then Mafia kill one of them: 1 vs 1.
    room = kill(room, others.slice(0, 3).map((p) => p.id));
    const victim = others[3]!;
    room = submit(room, mafia.id, victim.id);
    const out = resolve(room);
    expect(out.phase).toBe('GAME_OVER');
    expect(out.winner).toBe('mafia');
    expect(out.phaseEndsAt).toBeNull();
    const view = getStateFor(out, others[4]!.id)!;
    expect(view.winner).toBe('mafia');
    for (const p of view.players) expect(p.revealedRole).toBe(out.players.get(p.id)!.role);
  });
});

describe('views during the night', () => {
  const FORBIDDEN = ['role', 'tokenHash', 'socketId'];
  const stray = (value: unknown, path = '', out: string[] = []): string[] => {
    if (Array.isArray(value)) value.forEach((v, i) => stray(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        const here = path ? `${path}.${k}` : k;
        if (FORBIDDEN.includes(k) && !here.startsWith('you.')) out.push(here);
        stray(v, here, out);
      }
    }
    return out;
  };

  it('only living night roles get a night panel; villagers and the dead get none', () => {
    const room = night(started());
    for (const p of room.players.values()) {
      const v = getStateFor(room, p.id)!;
      if (p.role === 'villager') expect(v.night).toBeNull();
      else expect(v.night).not.toBeNull();
    }
    const mafia = one(room, 'mafia');
    expect(getStateFor(kill(room, [mafia.id]), mafia.id)!.night).toBeNull();
  });

  it('Mafia see teammates picks, nobody else does', () => {
    let room = night(started(9, 3));
    const [m1, m2] = withRole(room, 'mafia') as [Player, Player];
    const target = nightTargets(room, m1.id)[0]!;
    room = submit(room, m1.id, target);
    expect(getStateFor(room, m2.id)!.night!.teammateVotes).toEqual([
      { voterId: m1.id, voterName: m1.name, targetId: target },
    ]);
    expect(getStateFor(room, m1.id)!.night!.chosen).toBe(target);
    expect(getStateFor(room, one(room, 'doctor').id)!.night!.teammateVotes).toEqual([]);
    expect(getStateFor(room, one(room, 'detective').id)!.night!.teammateVotes).toEqual([]);
  });

  it('no foreign role, token or socket id leaks in any night or morning view', () => {
    let room = night(started(9, 3));
    for (const m of withRole(room, 'mafia')) room = submit(room, m.id, nightTargets(room, m.id)[0]!);
    for (const phaseRoom of [room, resolve(room)]) {
      for (const p of phaseRoom.players.values()) {
        const v = getStateFor(phaseRoom, p.id)!;
        expect(stray(v)).toEqual([]);
        // Roles are only revealed for dead players (default rule), never for the living.
        for (const pub of v.players) if (pub.alive) expect(pub.revealedRole).toBeNull();
      }
    }
  });

  it('reveal on death off: dead players stay hidden until GAME_OVER', () => {
    let room = night(started());
    room = { ...room, settings: { ...room.settings, revealOnDeath: false } };
    const victim = one(room, 'villager');
    for (const m of withRole(room, 'mafia')) room = submit(room, m.id, victim.id);
    const out = resolve(room);
    const view = getStateFor(out, one(out, 'doctor').id)!;
    expect(view.players.find((p) => p.id === victim.id)).toMatchObject({ alive: false, revealedRole: null });
  });

  it('reveal on death on (default): the dead role is shown to everyone', () => {
    let room = night(started());
    const victim = one(room, 'villager');
    for (const m of withRole(room, 'mafia')) room = submit(room, m.id, victim.id);
    const out = resolve(room);
    const view = getStateFor(out, one(out, 'doctor').id)!;
    expect(view.players.find((p) => p.id === victim.id)).toMatchObject({ alive: false, revealedRole: 'villager' });
  });

  it('serverNow is passed through for countdown correction', () => {
    const room = night(started());
    expect(getStateFor(room, 'p0', { now: 12345 })!.serverNow).toBe(12345);
  });
});
