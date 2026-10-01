// 水月幻镜 · the painter (GDD §20–§22, API.md §6). Everything is painted once, behind 研墨, with the
// app's brush engine into atlas pages; the frame loop only ever calls setTransform + drawImage.
//
//   kit.ts       stroke collector + shape helpers (pure)       atlas.ts   render a spec, halo, flash, 倒影, pages
//   figures.ts   the 13 companions (and 镜主)                   monsters.ts 36 monsters, 6 elites, 2 treasures
//   bosses.ts    9 bosses × phases                             gear.ts    weapons, projectiles, summons
//   items.ts     75 item icons                                 things.ts  drops and effects
//   arena.ts     the three arenas, stains, wash, 倒影          tele.ts    telegraphs and zones
//   numbers.ts   the damage-number glyph cache                 draw.ts    blit helpers for the engine
//
// Frames and variants (what `sprite(id, v)` means):
//   char:<id>        v 0 idle · 1, 2 walk steps · 3 hurt. All face right: flip x when facing left.
//   mon/elite:<id>   v 0, 1 walk (alternate ~5 Hz) · 2 tell / attack pose. Face right.
//   boss:<id>:<p>    v 0, 1 idle breathing. Face right. p 3 (倒悬) is baked when the vow is taken;
//                    sprite/flash/has fall back from :3 to :2 when it is not.
//   drop:cashCoin    v 0–3 spin frames (edge-on at 2); the glint is v 0.
//   wpn / proj       point along +x (rotate to the aim); weapons are anchored at the grip.
//   everything else  v 0.
import type { CharacterId } from '../types';
import { paintPortrait } from '../../walk/characters/portrait';
import {
  BOSS_REG, DROP_REG, ELITE_REG, FX_REG, ITEM_REG, MONSTER_REG, PROJ_REG, SUMMON_REG, TREASURE_REG, WEAPON_REG,
  COMPANION_REG, type BossId, type FxName, type MapId,
} from '../ids';
import type {
  ArenaGeom, AtlasId, BakeStage, Camera, MoonLook, NumStyle, Painter, Quality, RunSave, Sprite, StampKind, TeleShape,
} from '../types';
import { canvas, ctx2d, pack, Pages, renderSpec, warmGrain } from './atlas';
import { K_MAX } from './draw';
import { ArenaLayer, type ObstSprite } from './arena';
import { Ambience } from './ambient';
import { BOSS_SPEC, MOON_SPEC } from './bosses';
import { CHAR_SPECS } from './figures';
import { PROJ_SPECS, SUM_SPECS, WPN_SPECS } from './gear';
import { ITEM_SPECS } from './items';
import { B, extentOf, type Spec } from './kit';
import { MON_SPECS } from './monsters';
import { Numbers } from './numbers';
import { Tele } from './tele';
import { DROP_SPECS, FX_SPECS, isZone, pearlMap } from './things';

export { bakeScale, blit, blitRot, K_MAX, viewScale, viewOf, VIEWS, VIEW_DEFAULT, VIEW_SPAN, type ViewSize } from './draw';
export { abbrev } from './numbers';

/** Sprite resolution when no bake scale is given (the lab, icons): px per u = dpr × this. */
const PX_PER_U: Record<Quality, number> = { low: 0.85, mid: 1, high: 1.15 };
/** Zone looks a run shows large and for long, baked at the size they are drawn instead (≤ ZONE_PX
 *  across): the map's standing field (月湖's 月影, 墨林's 墨雨 puddles) and your own 镜技's field — at
 *  r 90–220 they are 3–7× the ±32 u disc the others are painted on. Low keeps ZONE_K. */
const MAP_ZONES: Readonly<Record<MapId, readonly FxName[]>> = { lake: ['moonCircle'], forest: ['inkPuddle'], palace: [] };
const SKILL_ZONES: Readonly<Partial<Record<CharacterId, FxName>>> = { scholar: 'zhenGlyph', gardener: 'flowerbed', fisher: 'netMesh', taoist: 'vortex', change: 'moonPool' };
/** The radius each is drawn at (engine/content: 月影 110, 墨雨 90, the skills' r). */
export const ZONE_R: Readonly<Partial<Record<FxName, number>>> = { moonCircle: 110, inkPuddle: 90, zhenGlyph: 180, flowerbed: 160, netMesh: 150, vortex: 180, moonPool: 220 };
/** Their size cap in px by quality (memory: 640² ≈ 1.6 MB each, two a run; ≈ 10–25 ms of bake each). */
const ZONE_PX: Record<Quality, number> = { low: 0, mid: 640, high: 640 };
/** Looks the renderer draws itself from sprite() (the vortex spins, the net is thrown, the glyph
 *  pulses: engine/render.ts zoneLive): their only sprite is the large one. The others keep their small
 *  sprite too, for small draws (芒种's r-18 flowers must not be a 640 px bed drawn 1/9 its size). */
const LIVE_ZONES: ReadonlySet<string> = new Set(['vortex', 'netMesh', 'zhenGlyph']);
/** drawZone uses the large sprite from this radius up. */
const BIG_ZONE_MIN_R = 48;
/** Zone looks (a ±32 u disc the engine draws at r 40–360 u) bake at least this many px per u. */
const ZONE_K: Record<Quality, number> = { low: 2, mid: 2.6, high: 2.6 };

/** Effects the engine draws larger than they are painted (fx(name, …, { r }) blits at r / 32 of the
 *  sprite: kill bursts reach r 50–120, strikes r 64): baked this much larger, so the big ones stay
 *  near 1:1 while the common small ones are only drawn down to ≈ 0.4–0.6. */
const FX_DRAWN: Readonly<Record<string, number>> = { 'fx:inkBurst': 1.5, 'fx:petalBurst': 1.75, 'fx:dustPuff': 1.25, 'fx:lightningStrike': 2 };
/** How large an id is drawn relative to 1 × its size (bake it that much larger or smaller). */
export function kindScale(id: string): number {
  if (id.startsWith('boss:')) return 0.9; // the boss fight's camera zooms out to 0.84
  if (id.startsWith('wpn:')) return 0.85; // m8: held weapons are drawn at 0.8 (engine/render.ts HELD; baked a little over: no shimmer)
  if (id.startsWith('proj:e')) return 1.5; // enemy shots are drawn at 1.5×
  if (id === 'sum:molong') return 1.4; // 墨龙 is drawn at 1.4×
  if (id === 'fx:stunMark' || id === 'fx:charmMark' || id === 'fx:burnMark' || id === 'fx:slowMark' || id === 'fx:rootMark') return 0.5;
  return FX_DRAWN[id] ?? 1;
}
/** Overlays that ride a body (点化's mark over a converted foe): never a body themselves. */
const OVERLAYS = new Set<string>(['sum:inkAlly']);
/** m8 (A4): a boss look's second idle frame shares frame 0's flash twin (not 镜主, whose frames are walk steps). */
const sharesFlash = (id: string): boolean => id.startsWith('boss:') && !id.startsWith('boss:mirrorself');
/** Only bodies flash (enemies, summons, the companion); the rest shares its sprite as its flash. */
function flashes(id: string): boolean {
  if (OVERLAYS.has(id)) return false;
  return id.startsWith('mon:') || id.startsWith('elite:') || id.startsWith('boss:') || id.startsWith('sum:') || id.startsWith('char:');
}
/** The moonlight rim, ink hairline and ink volume by kind: figures stand off the paper and read as
 *  rounded; effects and overlays stay flat washes. 心魔 (sum:demonSelf) is an enemy: it is lit like one. */
export function edgeOf(id: string): { rim: number; outline: number; volume: number } {
  if (OVERLAYS.has(id)) return { rim: 0, outline: 0, volume: 0 };
  if (id.startsWith('char:')) return { rim: 0.6, outline: 0.5, volume: 0.8 };
  if (id === 'sum:demonSelf') return { rim: 0.32, outline: 0, volume: 1 };
  if (id.startsWith('sum:')) return { rim: 0.45, outline: 0.35, volume: 0.7 };
  if (id.startsWith('mon:') || id.startsWith('elite:')) return { rim: 0.32, outline: 0, volume: 1 };
  if (id.startsWith('boss:')) return { rim: 0.3, outline: 0, volume: 1 };
  return { rim: 0, outline: 0, volume: 0 };
}
/** 心魔's ink: your companion recoloured dark plum → pale lilac (luminance kept), in a dark halo. */
export const DEMON_INK: readonly [string, string] = ['#2a1234', '#d2bade'];
/** Damage numbers pop to ≈ 1.3× and big hits to ≈ 2× their glyphs: the glyphs are baked this much
 *  larger and drawn at 1 / it, so a settled number is ≈ 1:1 and a popped one ≤ 1.5×. */
const NUM_SS = 1.35;
const FONT_WAIT_MS = 1500;
/** Bake budget per frame (GDD §21: 6 ms). One job always runs, so a single big sprite can exceed it. */
const SLICE_MS = 6;
/** The first bake (the start plan, behind the 研墨 screen, which only animates a bar) takes bigger
 *  slices: the frames between slices are idle there, and sprites painted at the camera's scale cost
 *  2× the old pixels. Later bakes run in the shop's background and keep to SLICE_MS. */
const START_SLICE_MS = 24;
/** Icons kept painted (≈ 48–96 px each: a few MB at most). */
const ICON_CACHE = 260;

type Kind = 'char' | 'mon' | 'elite' | 'boss' | 'wpn' | 'item' | 'sum' | 'proj' | 'drop' | 'fx';

const TREASURE_IDS = new Set<string>(TREASURE_REG.map((t) => t.id));
/** 水中月's reflections: boss:moonwater:1:m0 … m7. */
const MOON_LOOKS: readonly MoonLook[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Which spec paints an atlas id (null: unknown id). `self` is the run's companion for 镜主. */
export function specOf(id: string, self: CharacterId = 'scholar'): { spec: Spec; ghost?: boolean; duo?: readonly [string, string]; invertible: boolean } | null {
  const [kind, name, ph, sub] = id.split(':') as [Kind, string, string?, string?];
  switch (kind) {
    case 'char': return CHAR_SPECS[name as CharacterId] ? { spec: CHAR_SPECS[name as CharacterId], invertible: false } : null;
    // treasures keep their gold in 倒影: they are gifts, not threats
    case 'mon': case 'elite': return (MON_SPECS as Record<string, Spec>)[name] ? { spec: (MON_SPECS as Record<string, Spec>)[name], invertible: !TREASURE_IDS.has(name) } : null;
    case 'boss': {
      const p = Math.max(0, Math.min(3, Number(ph ?? 0) || 0));
      if (name === 'mirrorself') {
        const c = CHAR_SPECS[self];
        if (!c) return null;
        const k = 2.3;
        return {
          ghost: true, invertible: false,
          spec: { box: [c.box[0] * k, c.box[1] * k, c.box[2] * k, c.box[3] * k], n: 2, halo: 'dark', paint: (b, v) => { scaleOps(b, k, () => c.paint(b, v % 2)); if (p >= 1) b.disc(3 * k, -17 * k, 1.1 * k, '#d63a22'); } },
        };
      }
      // 水中月's reflections wear their own moon phase: boss:moonwater:1:m0 … m7
      if (sub !== undefined) return name === 'moonwater' && p === 1 && /^m[0-7]$/.test(sub) ? { spec: MOON_SPEC(Number(sub.slice(1))), invertible: true } : null;
      const f = BOSS_SPEC[name as BossId];
      return f ? { spec: f(p), invertible: true } : null;
    }
    case 'wpn': return lookup(WPN_SPECS, name);
    case 'item': return lookup(ITEM_SPECS, name);
    case 'sum': {
      // 心魔: a purple-ink copy of your companion (an enemy: it inverts in 倒影 like the others)
      // (frames 0–2: it walks and tells like any enemy; the hurt frame 3 is never drawn)
      if (name === 'demonSelf' && CHAR_SPECS[self]) return { spec: { ...CHAR_SPECS[self], n: 3, halo: 'dark' }, duo: DEMON_INK, invertible: true };
      return lookup(SUM_SPECS, name);
    }
    case 'proj': return lookup(PROJ_SPECS, name);
    case 'drop': return lookup(DROP_SPECS, name);
    case 'fx': return lookup(FX_SPECS, name);
    default: return null;
  }
}
function lookup(rec: Record<string, Spec>, name: string) {
  return rec[name] ? { spec: rec[name], invertible: false } : null;
}
/** Paint a spec at a larger size: wrap its ops so every coordinate is scaled (镜主 is the companion × 2.3). */
function scaleOps(b: import('./kit').B, k: number, paint: () => void) {
  const from = b.ops.length;
  paint();
  for (let i = from; i < b.ops.length; i++) {
    const op = b.ops[i];
    if (op.k === 'stroke') op.s = { ...op.s, pts: op.s.pts.map((q) => ({ x: q.x * k, y: q.y * k, w: op.s.kind === 'fill' || op.s.kind === 'wash' ? q.w : q.w * k })) };
    else { const f = op.f; op.f = (g) => { g.scale(k, k); f(g); }; if (op.bb) op.bb = [op.bb[0] * k, op.bb[1] * k, op.bb[2] * k, op.bb[3] * k]; }
  }
}

/** Every atlas id the painter knows (the lab and the tests walk it). */
export function allAtlasIds(): AtlasId[] {
  const out: string[] = [];
  for (const c of COMPANION_REG) out.push(`char:${c.id}`);
  for (const m of MONSTER_REG) out.push(`mon:${m.id}`);
  for (const t of TREASURE_REG) out.push(`mon:${t.id}`);
  for (const e of ELITE_REG) out.push(`elite:${e.id}`);
  for (const bo of BOSS_REG) for (let p = 0; p < 4; p++) out.push(`boss:${bo.id}:${p}`);
  for (const m of MOON_LOOKS) out.push(`boss:moonwater:1:m${m}`);
  for (let p = 0; p < 4; p++) out.push(`boss:mirrorself:${p}`);
  for (const w of WEAPON_REG) out.push(`wpn:${w.id}`);
  for (const i of ITEM_REG) out.push(`item:${i.id}`);
  for (const s of SUMMON_REG) out.push(`sum:${s.id}`);
  for (const p of PROJ_REG) out.push(`proj:${p.id}`);
  for (const d of DROP_REG) out.push(`drop:${d.id}`);
  for (const f of FX_REG) out.push(`fx:${f.id}`);
  return out as AtlasId[];
}

/** The bosses of a map at waves 10 / 20 / 30. */
function bossesOf(map: MapId): BossId[] {
  return BOSS_REG.filter((b) => b.map === map).sort((a, b) => a.wave - b.wave).map((b) => b.id);
}
/** The atlas ids of a map's roster (shared + own monsters, elites). */
function rosterOf(map: MapId): AtlasId[] {
  const out: string[] = [];
  for (const m of MONSTER_REG) if (m.map === 'all' || m.map === map) out.push(`mon:${m.id}`);
  for (const e of ELITE_REG) if (e.map === map) out.push(`elite:${e.id}`);
  return out as AtlasId[];
}
/** A boss's phases: 0–2, and 3 when 倒悬 gives every boss a 4th phase. */
function bossIds(id: BossId | 'mirrorself', daoxuan: boolean): AtlasId[] {
  const out = (daoxuan ? [0, 1, 2, 3] : [0, 1, 2]).map((p) => `boss:${id}:${p}` as AtlasId);
  // 水中月's split: each reflection shows its own moon phase
  if (id === 'moonwater') for (const m of MOON_LOOKS) out.push(`boss:moonwater:1:m${m}`);
  return out;
}
/**
 * `boss:X:3` → `boss:X:2` (the 倒悬 phase reuses the last one when it was not baked); a boss look's
 * variant (`boss:X:P:v`) → its phase look.
 */
function fallbackOf(id: string): string | null {
  if (!id.startsWith('boss:')) return null;
  const parts = id.split(':');
  if (parts.length > 3) return parts.slice(0, 3).join(':');
  return id.endsWith(':3') ? id.slice(0, -1) + '2' : null;
}

/** Wait for the faces that sprites and numbers are drawn in (never bake fallback glyphs). */
async function fontsReady(): Promise<void> {
  const f = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!f || typeof f.load !== 'function') return;
  const sample = '0123456789.+-kmb万亿镇月雷火当令杜玉十';
  const loads = Promise.all([
    f.load(`32px 'Ma Shan Zheng'`, sample),
    f.load(`32px 'LXGW WenKai'`, sample),
  ]).then(() => undefined, () => undefined);
  await Promise.race([loads, new Promise<void>((r) => setTimeout(r, FONT_WAIT_MS))]);
}

function fontsLoaded(): boolean {
  const f = typeof document !== 'undefined' ? document.fonts : undefined;
  try { return !f || typeof f.check !== 'function' || f.check(`16px 'Ma Shan Zheng'`, '月'); } catch { return true; }
}

const nextFrame = () => new Promise<void>((r) => {
  if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') requestAnimationFrame(() => r());
  else setTimeout(r, 16);
});

interface Entry { s: Sprite[]; f: Sprite[] }

/** Where a bake writes: the live atlas, or a re-bake's fresh one (rescale) until it is swapped in. */
interface Target { pages: Pages; normal: Map<string, Entry>; inv: Map<string, Entry>; bigZone: Map<string, Sprite>; bigK: Map<string, number>; k: number }

class InkPainter implements Painter {
  readonly dpr: number;
  /** px per u of sprites (a rescale changes it). */
  k: number;
  private pages = new Pages();
  private normal = new Map<string, Entry>();
  private inv = new Map<string, Entry>();
  private self: CharacterId = 'scholar';
  /** Painted icons, least recently used first. */
  private icons = new Map<string, HTMLCanvasElement>();
  private warmed = new Set<string>();
  /** Bake enemies as 倒影 (the endless stage). */
  private wantInv = false;
  private arena: ArenaLayer;
  /** The arena's ambience (grain, vignette, contact shadows, motes): render.ts draws it after the arena. */
  readonly ambience: Ambience;
  private tele: Tele;
  private nums: Numbers;
  private disposed = false;
  /** Bakes started (the first is the start plan: START_SLICE_MS). */
  private bakes = 0;
  /** Zone looks this run shows large (planned at the start: its map and companion) → their px per u. */
  private bigK = new Map<string, number>();
  /** The large bakes of those zone looks that also keep a small sprite (drawZone picks by r). */
  private bigZone = new Map<string, Sprite>();
  /** The zone looks planZones chose from (a rescale re-plans them at the new scale). */
  private zoneLooks: FxName[] = [];
  /** bake() and rescale() run one at a time, in call order (a rescale never swaps pages under a bake). */
  private lock: Promise<void> = Promise.resolve();
  /** The newest rescale (an older one still running gives up at its next slice). */
  private rescaleGen = 0;

  constructor(readonly map: MapId, readonly quality: Quality, dpr: number, pxPerU?: number) {
    this.dpr = Math.max(1, Math.min(dpr || 1, 3));
    this.k = pxPerU && Number.isFinite(pxPerU) && pxPerU > 0 ? Math.max(0.5, Math.min(K_MAX[quality], pxPerU)) : this.dpr * PX_PER_U[quality];
    this.arena = new ArenaLayer(map, quality, this.dpr, this.k);
    this.ambience = new Ambience(map, quality, this.dpr, this.k);
    this.tele = new Tele(this.dpr);
    this.nums = new Numbers(this.dpr * NUM_SS);
  }

  plan(run: RunSave, stage: BakeStage): AtlasId[] {
    this.self = run.char;
    const dx = !!run.vows?.daoxuan;
    const out = new Set<AtlasId>();
    const next = run.wave + 1;
    const bosses = bossesOf(run.map);
    const bossFor = (w: number): (BossId | 'mirrorself')[] => {
      if (w % 10 !== 0) return [];
      if (w <= 30) return [bosses[w / 10 - 1]];
      if (w % 50 === 0) return ['mirrorself'];
      return bosses; // 双生: two of the three, cycling
    };
    if (stage === 'start') {
      this.planZones(run);
      out.add(`char:${run.char}` as AtlasId);
      for (const id of rosterOf(run.map)) out.add(id);
      out.add('mon:pixiu'); out.add('mon:mirrorflower');
      for (const w of WEAPON_REG) out.add(`wpn:${w.id}` as AtlasId);
      for (const s of SUMMON_REG) out.add(`sum:${s.id}` as AtlasId);
      for (const p of PROJ_REG) out.add(`proj:${p.id}` as AtlasId);
      for (const d of DROP_REG) out.add(`drop:${d.id}` as AtlasId);
      for (const f of FX_REG) out.add(`fx:${f.id}` as AtlasId);
      // a resumed run near a boss, or deep in endless, needs those too
      if (next % 10 === 0 || next % 10 === 9) for (const b of bossFor(next % 10 === 0 ? next : next + 1)) for (const id of bossIds(b, dx)) out.add(id);
      if (run.wave >= 30) for (const id of this.plan(run, 'endless')) out.add(id);
    } else if (stage === 'boss') {
      const w = next % 10 === 0 ? next : Math.ceil(next / 10) * 10;
      for (const b of bossFor(w)) for (const id of bossIds(b, dx)) out.add(id);
    } else {
      this.wantInv = true;
      for (const m of ['lake', 'forest', 'palace'] as MapId[]) for (const id of rosterOf(m)) out.add(id);
      for (const b of bosses) for (const id of bossIds(b, dx)) out.add(id);
      for (const id of bossIds('mirrorself', dx)) out.add(id);
    }
    return [...out];
  }

  /** The zone looks this run draws large, and the px per u each bakes at (none on low). */
  private planZones(run: RunSave): void {
    const looks: FxName[] = [];
    for (const look of [...(MAP_ZONES[run.map] ?? []), SKILL_ZONES[run.char]]) if (look) looks.push(look);
    this.zoneLooks = looks;
    this.bigK = this.zoneKs(this.k);
  }
  /** px per u of each planned zone look's large bake at sprite scale k. */
  private zoneKs(k0: number): Map<string, number> {
    const out = new Map<string, number>();
    const cap = ZONE_PX[this.quality];
    if (!cap) return out;
    for (const look of this.zoneLooks) {
      const R = ZONE_R[look];
      if (!R) continue;
      // the disc spans ±34 u (its 2 u margin); drawn at r / 32 of it
      const k = Math.min(k0 * (R / 32), cap / 68);
      if (k > Math.max(k0, ZONE_K[this.quality]) * 1.15) out.set(`fx:${look}`, k);
    }
    return out;
  }
  /** The live atlas as a bake target. */
  private live(): Target { return { pages: this.pages, normal: this.normal, inv: this.inv, bigZone: this.bigZone, bigK: this.bigK, k: this.k }; }
  /** Run bake / rescale jobs one at a time. */
  private serial<T>(f: () => Promise<T>): Promise<T> {
    const p = this.lock.then(f, f);
    this.lock = p.then(() => undefined, () => undefined);
    return p;
  }
  /** px per u a zone look's large bake uses (0: none), for the lab and the tests. */
  zoneScale(look: FxName): number { return this.bigK.get(`fx:${look}`) ?? 0; }

  bake(ids: readonly AtlasId[], onProgress?: (done: number, total: number) => void): Promise<void> {
    return this.serial(() => this.bakeNow(ids, onProgress));
  }
  private async bakeNow(ids: readonly AtlasId[], onProgress?: (done: number, total: number) => void): Promise<void> {
    await fontsReady();
    if (this.disposed) return;
    this.nums.ensure();
    const jobs: { id: AtlasId; v: number; inv: boolean; n: number }[] = [];
    for (const id of ids) {
      const sp = specOf(id, this.self);
      if (!sp) continue;
      const inv = this.wantInv && sp.invertible;
      if ((inv ? this.inv : this.normal).has(id)) continue;
      const n = sp.spec.n ?? 1;
      for (let v = 0; v < n; v++) jobs.push({ id, v, inv, n });
    }
    const total = jobs.length;
    const slice = this.bakes++ === 0 ? START_SLICE_MS : SLICE_MS;
    let done = 0;
    onProgress?.(0, total);
    // warm the grain tiles of every colour the jobs use, a slice at a time, before the first sprite
    for (let i = 0; i < jobs.length;) {
      const t0 = performance.now();
      do {
        const j = jobs[i++];
        const b = new B(1);
        try { specOf(j.id, this.self)?.spec.paint(b, j.v); } catch { continue; }
        const fine: string[] = [], wet: string[] = [];
        for (const op of b.ops) {
          if (op.k !== 'stroke' || !op.s.color || this.warmed.has(op.s.color + op.s.kind)) continue;
          this.warmed.add(op.s.color + op.s.kind);
          (op.s.kind === 'wash' ? wet : fine).push(op.s.color);
        }
        if (fine.length || wet.length) warmGrain(fine, wet);
      } while (i < jobs.length && performance.now() - t0 < slice);
      if (i < jobs.length) await nextFrame();
      if (this.disposed) return;
    }
    const pending = new Map<string, Entry>();
    while (done < total) {
      const t0 = performance.now();
      do {
        const j = jobs[done];
        this.bakeOne(j.id, j.v, j.inv, j.n, pending, this.live());
        done++;
      } while (done < total && performance.now() - t0 < slice);
      onProgress?.(done, total);
      if (done < total) await nextFrame();
      if (this.disposed) return;
    }
    this.tele.blot = this.sprite('fx:teleInk');
  }

  /**
   * Re-bake every sprite baked so far at a new sprite scale (px per u, within the quality's K_MAX) into
   * fresh pages, frame-budgeted like bake() (`sliceMs` per frame: a number, or read each frame — the
   * engine gives more while paused), then swap them in at once: the old sprites keep drawing until the
   * new ones are all ready, and their pages are freed after. Runs after any bake in flight. Resolves
   * true when swapped in; false when there was nothing to do (within 3% of the current scale), a newer
   * rescale superseded it, or the painter was disposed. The arena's obstacle sprites are re-baked with
   * the atlas (the arena's base and stains and the ambience keep the resolution they were painted at:
   * memory-capped); the feel layer's marks follow at the next wave.
   */
  rescale(pxPerU: number, onProgress?: (done: number, total: number) => void, sliceMs: number | (() => number) = SLICE_MS): Promise<boolean> {
    const gen = ++this.rescaleGen;
    return this.serial(() => this.rescaleNow(gen, pxPerU, onProgress, sliceMs));
  }
  private async rescaleNow(gen: number, pxPerU: number, onProgress: ((done: number, total: number) => void) | undefined, sliceMs: number | (() => number)): Promise<boolean> {
    if (this.disposed || gen !== this.rescaleGen || !(pxPerU > 0) || !Number.isFinite(pxPerU)) return false;
    const k = Math.max(0.5, Math.min(K_MAX[this.quality], pxPerU));
    if (Math.abs(k - this.k) / this.k < 0.03) return false;
    await fontsReady();
    if (this.disposed || gen !== this.rescaleGen) return false;
    const T: Target = { pages: new Pages(), normal: new Map(), inv: new Map(), bigZone: new Map(), bigK: this.zoneKs(k), k };
    const jobs: { id: AtlasId; v: number; inv: boolean; n: number }[] = [];
    const add = (m: Map<string, Entry>, inv: boolean) => { for (const [id, e] of m) for (let v = 0; v < e.s.length; v++) jobs.push({ id: id as AtlasId, v, inv, n: e.s.length }); };
    add(this.normal, false); add(this.inv, true);
    // the arena's obstacle sprites follow too (a few; the base keeps its memory-capped resolution)
    const A = this.arena, nObst = A.obstaclesToRebake(k), arenaGen = A.paintGen;
    const obst: (ObstSprite | null)[] = [];
    const total = jobs.length + nObst;
    const pending = new Map<string, Entry>();
    let done = 0;
    onProgress?.(0, total);
    const drop = () => { T.pages.dispose(); for (const o of obst) if (o) { o.img.width = 1; o.img.height = 1; } };
    while (done < total) {
      const t0 = performance.now();
      const slice = typeof sliceMs === 'function' ? sliceMs() : sliceMs;
      do {
        if (done < jobs.length) { const j = jobs[done]; this.bakeOne(j.id, j.v, j.inv, j.n, pending, T); }
        else obst.push(A.rebakeObstacle(done - jobs.length, k));
        done++;
      } while (done < total && performance.now() - t0 < slice);
      onProgress?.(done, total);
      if (done < total) await nextFrame();
      if (this.disposed || gen !== this.rescaleGen) { drop(); return false; }
    }
    // the swap: one assignment each (the frame loop reads these maps; it never sees a half-baked atlas)
    if (nObst) A.setObstacles(obst, k, arenaGen);
    const old = this.pages;
    this.pages = T.pages; this.normal = T.normal; this.inv = T.inv; this.bigZone = T.bigZone; this.bigK = T.bigK; this.k = k;
    this.tele.blot = this.sprite('fx:teleInk');
    old.dispose();
    return true;
  }

  private bakeOne(id: AtlasId, v: number, inv: boolean, n: number, pending: Map<string, Entry>, T: Target) {
    const sp = specOf(id, this.self);
    if (!sp) return;
    const key = id;
    let e = pending.get(key + (inv ? '|i' : ''));
    if (!e) { e = { s: new Array(n), f: new Array(n) }; pending.set(key + (inv ? '|i' : ''), e); }
    try {
      const big = id.startsWith('boss:');
      const zone = isZone(sp.spec);
      const kBig = zone ? T.bigK.get(id) ?? 0 : 0;
      const live = kBig > 0 && LIVE_ZONES.has(id.slice(3));
      const k = zone ? (live ? kBig : Math.max(T.k, ZONE_K[this.quality])) : T.k * kindScale(id);
      const edge = edgeOf(id);
      // the halo in px follows the bake scale (≈ 1 u; bosses 1.8 u), never under 1 px
      const halo = Math.max(1, Math.round(k * (big ? 1.8 : 1)));
      // m8 (A4): a boss's second idle frame shares the first one's hit-flash twin (a flash lasts ≈ 0.1 s), halving its memory
      const opts = { k, seed: seedOf(id) + v * 7919, halo, invert: inv, ghost: sp.ghost, duo: sp.duo, flash: flashes(id) && !(v > 0 && sharesFlash(id)), rim: edge.rim, outline: edge.outline, volume: edge.volume };
      // m8: 月华's indigo bleed is baked for this map (deeper on 天宫's cold wash)
      if (id.startsWith('drop:moon')) pearlMap(this.map);
      const painted = renderSpec(sp.spec, v, opts);
      const { s, f } = pack(T.pages, painted);
      e.s[v] = s; e.f[v] = f;
      // a zone look drawn large this run also gets its large bake (same seed: the same marks)
      if (kBig > 0 && !live && v === 0 && !inv) T.bigZone.set(id.slice(3), pack(T.pages, renderSpec(sp.spec, 0, { ...opts, k: kBig, halo: Math.max(1, Math.round(kBig)) })).s);
    } catch (err) {
      console.warn('[mirror paint]', id, err);
    }
    if (v === n - 1) {
      // fill any failed frame with frame 0 so variants() stays honest
      for (let i = 0; i < n; i++) { if (!e.s[i]) e.s[i] = e.s[0]; if (!e.f[i]) e.f[i] = e.f[0]; }
      if (sharesFlash(id)) for (let i = 1; i < n; i++) e.f[i] = e.f[0];
      if (e.s[0]) (inv ? T.inv : T.normal).set(key, e);
      pending.delete(key + (inv ? '|i' : ''));
    }
  }

  private entry(id: AtlasId): Entry | undefined {
    const e = this.inverted() ? this.inv.get(id) ?? this.normal.get(id) : this.normal.get(id) ?? this.inv.get(id);
    if (e) return e;
    const fb = fallbackOf(id);
    return fb ? this.entry(fb as AtlasId) : undefined;
  }
  private inverted(): boolean { return this.arena.inverted; }
  has(id: AtlasId): boolean { return !!this.entry(id); }
  sprite(id: AtlasId, v = 0): Sprite | null {
    const e = this.entry(id);
    if (!e) return null;
    const n = e.s.length;
    return e.s[((v % n) + n) % n] ?? null;
  }
  flash(id: AtlasId, v = 0): Sprite | null {
    const e = this.entry(id);
    if (!e) return null;
    const n = e.f.length;
    return e.f[((v % n) + n) % n] ?? null;
  }
  variants(id: AtlasId): number {
    const e = this.entry(id);
    if (e) return e.s.length;
    return specOf(id, this.self)?.spec.n ?? 1;
  }

  paintArena(geom: ArenaGeom, seed: number, inverted: boolean): void {
    this.arena.paint(geom, seed, inverted);
    this.ambience.bake(inverted);
  }
  drawArena(ctx: CanvasRenderingContext2D, cam: Camera): void { this.arena.draw(ctx, cam); }
  stamp(kind: StampKind, x: number, y: number, r: number, seed: number, tint?: string): void { this.arena.stamp(kind, x, y, r, seed, tint); }
  wash(f: number): void { this.arena.wash(f); }
  drawTele(ctx: CanvasRenderingContext2D, cam: Camera, shape: TeleShape, k: number): void { this.tele.draw(ctx, cam, shape, k); }
  drawZone(ctx: CanvasRenderingContext2D, cam: Camera, look: FxName, x: number, y: number, r: number, a: number): void {
    const s = (r >= BIG_ZONE_MIN_R ? this.bigZone.get(look) : undefined) ?? this.sprite(`fx:${look}` as AtlasId);
    this.tele.zone(ctx, cam, s, look, x, y, r, a);
  }
  /** `scale` (optional, beyond the contract): the engine's pop and size-by-damage. */
  drawNumber(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en', scale = 1): void {
    this.nums.draw(ctx, value, sx, sy, style, a, lang, scale / NUM_SS);
  }

  /** A fresh canvas each call (the UI may keep or mutate it), copied from a painted icon cached by
   *  id, size and dpr: the codex's 185 pages or a shop reroll never repaint the brush work. */
  icon(id: AtlasId, px: number): HTMLCanvasElement {
    const d = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const size = Math.max(8, Math.round(px * d));
    const key = `${id}|${size}|${id.startsWith('boss:mirrorself') || id === 'sum:demonSelf' ? this.self : ''}`;
    let src = this.icons.get(key);
    if (!src) {
      src = this.paintIcon(id, size);
      // never keep an icon painted in a fallback face (glyph icons before the brush font has loaded)
      if (fontsLoaded()) {
        if (this.icons.size >= ICON_CACHE) this.icons.delete(this.icons.keys().next().value as string);
        this.icons.set(key, src);
      }
    } else { this.icons.delete(key); this.icons.set(key, src); }
    const c = canvas(size, size);
    c.style.width = c.style.height = px + 'px';
    try { ctx2d(c).drawImage(src, 0, 0); } catch { /* a lost context: an empty icon */ }
    return c;
  }

  private paintIcon(id: AtlasId, size: number): HTMLCanvasElement {
    const c = canvas(size, size);
    if (id.startsWith('char:')) { paintPortrait(c, id.slice(5), false); return c; }
    const sp = specOf(id, this.self);
    if (!sp) return c;
    try {
      const [x0, y0, x1, y1] = extentOf(sp.spec, 0, seedOf(id));
      const k = (size * 0.86) / Math.max(x1 - x0, y1 - y0);
      const p = renderSpec(sp.spec, 0, { k, seed: seedOf(id), halo: Math.max(1, Math.round(size / 40)), ghost: sp.ghost, duo: sp.duo, flash: false });
      const g = ctx2d(c);
      const s = Math.min(size / p.img.width, size / p.img.height, 1);
      g.drawImage(p.img, (size - p.img.width * s) / 2, (size - p.img.height * s) / 2, p.img.width * s, p.img.height * s);
    } catch (err) {
      console.warn('[mirror paint] icon', id, err);
    }
    return c;
  }

  arenaImage(w: number, h: number): HTMLCanvasElement { return this.arena.image(w, h); }

  /** Memory held, in bytes (beyond the contract: the lab, the perf probe and the tests read it). */
  memory(): { atlas: number; arena: number; total: number } {
    const atlas = this.pages.bytes(), arena = this.arena.bytes() + this.ambience.bytes();
    return { atlas, arena, total: atlas + arena };
  }
  /** Whether the arena is painted as 倒影 now (the ambience layer reads it). */
  get invertedNow(): boolean { return this.arena.inverted; }

  dispose(): void {
    this.disposed = true;
    this.pages.dispose();
    this.normal.clear();
    this.bigZone.clear();
    this.inv.clear();
    this.arena.dispose();
    for (const c of this.icons.values()) { c.width = 1; c.height = 1; }
    this.icons.clear();
  }
}

function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** `pxPerU` (optional, beyond the contract's three arguments): the sprite resolution, from bakeScale()
 *  for the viewport the run is played in; without it sprites bake at dpr × a quality factor. */
export const createPainter = (map: MapId, quality: Quality, dpr: number, pxPerU?: number): Painter => new InkPainter(map, quality, dpr, pxPerU);
