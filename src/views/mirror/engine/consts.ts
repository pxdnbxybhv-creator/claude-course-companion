// 水月幻镜 · engine constants: registry indexes for the pools, atlas ids built once, role codes.
import { DROP_REG, FX_REG, PROJ_REG, SUMMON_REG, type DropKind, type FxName, type ProjKind, type SummonKind } from '../ids';
import type { AtlasId, DamageSrc, MonsterRole, MonsterTag, StatusKind } from '../types';

const idx = <T extends string>(list: readonly { id: T }[]) => {
  const m = {} as Record<T, number>;
  list.forEach((r, i) => { m[r.id] = i; });
  return m;
};
export const DK = idx<DropKind>(DROP_REG);
export const PK = idx<ProjKind>(PROJ_REG);
export const SK = idx<SummonKind>(SUMMON_REG);
export const FXK = idx<FxName>(FX_REG);
export const DROP_IDS = DROP_REG.map((d) => d.id) as DropKind[];
export const PROJ_IDS = PROJ_REG.map((d) => d.id) as ProjKind[];
export const SUMMON_IDS = SUMMON_REG.map((d) => d.id) as SummonKind[];
export const DROP_ATLAS = DROP_REG.map((d) => `drop:${d.id}` as AtlasId);
export const PROJ_ATLAS = PROJ_REG.map((d) => `proj:${d.id}` as AtlasId);
export const SUMMON_ATLAS = SUMMON_REG.map((d) => `sum:${d.id}` as AtlasId);

export const ROLES: readonly MonsterRole[] = [
  'chaser', 'lunger', 'splitter', 'shooter', 'swarm', 'charger', 'leaper', 'tank', 'turret', 'exploder', 'spawner', 'diver',
  'ambusher', 'blinker', 'burrower', 'circler', 'thrower', 'deflector', 'pack', 'healer', 'webber', 'roller', 'spore', 'hunter',
  'formation', 'orbiter', 'thief', 'laser', 'artillery', 'reflector', 'spinner',
];
export const ROLE = idx<MonsterRole>(ROLES.map((id) => ({ id })));

export const TAG_BIT: Readonly<Record<MonsterTag, number>> = {
  ghost: 1, paper: 2, hopper: 4, hunter: 8, front: 16, shieldline: 32, deflect: 64, reflect: 128,
};
export const tagBits = (tags: readonly MonsterTag[]) => tags.reduce((b, t) => b | TAG_BIT[t], 0);

export const SRC: readonly DamageSrc[] = ['weapon', 'summon', 'skill', 'item', 'status', 'hazard', 'enemy', 'boss'];
export const SRCI = idx<DamageSrc>(SRC.map((id) => ({ id })));
export const STATUS: readonly StatusKind[] = ['burn', 'bleed', 'slow', 'root', 'stun', 'charm', 'shred', 'vuln', 'stagger'];
export const STI = idx<StatusKind>(STATUS.map((id) => ({ id })));

/** Strike flags (World.strike). */
export const HF = {
  noArmor: 1, projectile: 2, fire: 4, dot: 8, forceCrit: 16, noCrit: 32, noProc: 64, summon: 128, sword: 256, melee: 512,
  blast: 1024, quiet: 2048, beam: 4096, lob: 8192,
} as const;

/** Entity caps by quality (GDD §24.3). */
export const CAPS = {
  low: { enemies: 90, pshots: 250, particles: 150 },
  mid: { enemies: 140, pshots: 400, particles: 300 },
  high: { enemies: 200, pshots: 500, particles: 400 },
} as const;
export const ENEMY_SHOTS = 300;
export const DROPS_CAP = 340;
export const SWORDS_ON_SCREEN = 24;
export const SUMMON_CAP_HARD = 12;

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
/** Signed smallest difference a − b in (−π, π]. */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU;
  return d;
}
/** Distance from point (px, py) to the segment (ax, ay)-(bx, by), squared. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/** Core zone codes (World.coreZone). */
export const ZC = { web: 1, spore: 2, fire: 3, flower: 4, trail: 5, moonDust: 6 } as const;
/** Core telegraph strike codes (enemies.strikeTele). */
export const TC = { none: 0, burst: 1, lightning: 2, weed: 3, web: 4, cone: 5, tongue: 6, stone: 7, slam: 8 } as const;
