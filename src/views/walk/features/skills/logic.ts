// Pure logic for the companions' skills (技 · Q): how long each lasts and cools down, the cooldown
// clock, and where the painter's paper crane flies. No DOM, no three.js (tests/skills.test.ts).
import type { CharacterId } from '../../../../data/characters';
import { ENCOUNTERS } from '../../../../data/encounters';
import { REGION, REGIONS, WAYPOINTS, type RegionId } from '../../map';

export interface SkillTiming {
  /** Seconds to wait after the skill ends before it can be used again. */
  cooldown: number;
  /** Seconds the skill stays active (0 = a single moment). */
  active: number;
}

export const SKILL_TIMING: Record<CharacterId, SkillTiming> = {
  scholar: { cooldown: 10, active: 8 },
  gardener: { cooldown: 14, active: 3 },
  fisher: { cooldown: 20, active: 4.5 },
  musician: { cooldown: 12, active: 8.5 },
  swordsman: { cooldown: 8, active: 6.5 },
  taoist: { cooldown: 9, active: 4 },
  painter: { cooldown: 16, active: 4 },
  player: { cooldown: 15, active: 4 },
  cat: { cooldown: 10, active: 5 },
  rabbit: { cooldown: 7, active: 3 },
  poet: { cooldown: 12, active: 8.5 },
  guan: { cooldown: 18, active: 20 },
  change: { cooldown: 12, active: 6.5 },
};

/**
 * Per-character cooldown clocks (seconds on the world's real clock). A skill cools down only once
 * it has ended; switching companions keeps each one's own clock.
 */
export class Cooldowns {
  private until = new Map<string, { at: number; len: number }>();

  /** The skill ended at `now`: it is ready again after `secs`. */
  start(id: string, now: number, secs: number): void {
    this.until.set(id, { at: now + Math.max(0, secs), len: Math.max(1e-6, secs) });
  }
  ready(id: string, now: number): boolean {
    const u = this.until.get(id);
    return !u || now >= u.at;
  }
  /** 1 = just started cooling … 0 = ready. */
  frac(id: string, now: number): number {
    const u = this.until.get(id);
    if (!u) return 0;
    return Math.max(0, Math.min(1, (u.at - now) / u.len));
  }
  /** Seconds left (0 when ready). */
  left(id: string, now: number): number {
    const u = this.until.get(id);
    return u ? Math.max(0, u.at - now) : 0;
  }
  clear(id?: string): void {
    if (id) this.until.delete(id);
    else this.until.clear();
  }
}

// ───────────────────────────── the painter's crane ─────────────────────────────

export interface Discovery {
  waypointOpen(id: RegionId): boolean;
  encounterMet(id: string): boolean;
  visited(id: RegionId): boolean;
}

export interface CraneTarget {
  kind: 'waypoint' | 'encounter' | 'region' | 'none';
  x: number;
  z: number;
  region: RegionId | null;
  zh: string;
  en: string;
  /** For an encounter: its hint, to whisper where the crane leads. */
  hintZh?: string;
  hintEn?: string;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Where the painter's paper crane flies from `from`: the nearest waypoint stele not yet lit; else
 * the place of the nearest 奇遇 not yet met; else the nearest place never visited; else nowhere new
 * (it circles the painter). Places closer than `near` metres are passed over when anything farther
 * remains (the crane does not point at your feet).
 */
export function craneTarget(from: { x: number; z: number }, d: Discovery, near = 6): CraneTarget {
  const nearest = <T extends { x: number; z: number }>(list: T[]): T | null => {
    const far = list.filter((p) => dist(p, from) >= near);
    const pool = far.length ? far : list;
    let best: T | null = null, bd = Infinity;
    for (const p of pool) {
      const dd = dist(p, from);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  };
  const wp = nearest(WAYPOINTS.filter((w) => !d.waypointOpen(w.id)));
  if (wp) return { kind: 'waypoint', x: wp.x, z: wp.z, region: wp.id, zh: wp.zh, en: wp.en };

  const enc = nearest(ENCOUNTERS
    .filter((e) => e.region !== 'any' && !d.encounterMet(e.id))
    .map((e) => ({ e, x: REGION[e.region as RegionId].center.x, z: REGION[e.region as RegionId].center.z })));
  if (enc) {
    const r = REGION[enc.e.region as RegionId];
    return { kind: 'encounter', x: enc.x, z: enc.z, region: r.id, zh: r.zh, en: r.en, hintZh: enc.e.hintZh, hintEn: enc.e.hintEn };
  }

  const reg = nearest(REGIONS.filter((r) => !d.visited(r.id)).map((r) => ({ r, x: r.center.x, z: r.center.z })));
  if (reg) return { kind: 'region', x: reg.x, z: reg.z, region: reg.r.id, zh: reg.r.zh, en: reg.r.en };

  return { kind: 'none', x: from.x, z: from.z, region: null, zh: '', en: '' };
}

// ───────────────────────────── the qin player's phrase ─────────────────────────────

export interface Note { d: number; v: number; at: number; flow: boolean }

/** A phrase composed on the spot: the mountains rise, the water runs down, a soft close. */
export function qinPhrase(rng: () => number): Note[] {
  const out: Note[] = [];
  let t = 0.2;
  let d = [-3, -2, 0][Math.floor(rng() * 3)];
  const up = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < up; i++) {
    out.push({ d, v: 0.6 + i * 0.03, at: t, flow: false });
    t += 0.42 + (i === up - 1 ? 0.25 : 0);
    d += 1 + Math.floor(rng() * 2);
  }
  const top = d;
  const run = 8 + Math.floor(rng() * 3);
  for (let i = 0; i < run; i++) {
    const turn = i % 3 === 2 ? 1 : -1;
    d = Math.max(-1, d + turn * (1 + (rng() < 0.25 ? 1 : 0)));
    out.push({ d, v: 0.42 + 0.1 * Math.sin(i), at: t, flow: true });
    t += 0.17 + rng() * 0.04;
  }
  t += 0.25;
  out.push({ d: 2, v: 0.5, at: t, flow: false });
  t += 0.5;
  out.push({ d: 0, v: 0.55, at: t, flow: false });
  t += 0.7;
  out.push({ d: Math.min(top, 7), v: 0.35, at: t, flow: false });
  return out;
}
