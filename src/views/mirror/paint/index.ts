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
import type { CharacterId } from '../../../data/characters';
import { paintPortrait } from '../../walk/characters/portrait';
import {
  BOSS_REG, DROP_REG, ELITE_REG, FX_REG, ITEM_REG, MONSTER_REG, PROJ_REG, SUMMON_REG, TREASURE_REG, WEAPON_REG,
  COMPANION_REG, type BossId, type FxName, type MapId,
} from '../ids';
import type {
  ArenaGeom, AtlasId, BakeStage, Camera, MoonLook, NumStyle, Painter, Quality, RunSave, Sprite, StampKind, TeleShape,
} from '../types';
import { canvas, ctx2d, pack, Pages, renderSpec, warmGrain } from './atlas';
import { viewScale } from './draw';
import { ArenaLayer } from './arena';
import { Ambience } from './ambient';
import { BOSS_SPEC, MOON_SPEC } from './bosses';
import { CHAR_SPECS } from './figures';
import { PROJ_SPECS, SUM_SPECS, WPN_SPECS } from './gear';
import { ITEM_SPECS } from './items';
import { B, extentOf, type Spec } from './kit';
import { MON_SPECS } from './monsters';
import { Numbers } from './numbers';
import { Tele } from './tele';
import { DROP_SPECS, FX_SPECS, isZone } from './things';

export { blit, blitRot, viewScale } from './draw';
export { abbrev } from './numbers';

/** Sprite resolution when no bake scale is given (the lab, icons): px per u = dpr × this. */
const PX_PER_U: Record<Quality, number> = { low: 0.85, mid: 1, high: 1.15 };
/** Bake scale over the camera's base px per u: zoom punches reach +3–10% for a tenth of a second, and a
 *  little supersample keeps rotating blades and thin lines crisp. Low paints exactly at the drawn size. */
const HEADROOM: Record<Quality, number> = { low: 1, mid: 1.1, high: 1.15 };
/** The bake scale's ceiling (memory grows with k²: the start atlas is ≈ 3 MB × k²). */
const K_MAX: Record<Quality, number> = { low: 3, mid: 3.2, high: 3.4 };
/** Zone looks (a ±32 u disc the engine draws at r 40–360 u) bake at least this many px per u. */
const ZONE_K: Record<Quality, number> = { low: 2, mid: 2.6, high: 3.2 };

/**
 * The sprite resolution (px per u) for a viewport: the camera's base scale there (viewScale × the
 * canvas dpr) × a small headroom by quality, within [1, K_MAX]. Sprites are then drawn at ≤ 1.0× their
 * baked pixels at every quality (bosses and a few ids adjust by how large they are drawn: kindScale).
 */
export function bakeScale(cssW: number, cssH: number, dpr: number, quality: Quality): number {
  const cam = viewScale(cssW, cssH) * Math.max(1, dpr || 1);
  return Math.max(1, Math.min(K_MAX[quality], cam * HEADROOM[quality]));
}
/** How large an id is drawn relative to 1 × its size (bake it that much larger or smaller). */
function kindScale(id: string): number {
  if (id.startsWith('boss:')) return 0.9; // the boss fight's camera zooms out to 0.84
  if (id.startsWith('wpn:')) return 0.6; // held weapons are drawn at 0.55 (baked small: no shimmer)
  if (id.startsWith('proj:e')) return 1.5; // enemy shots are drawn at 1.5×
  if (id === 'sum:molong') return 1.4; // 墨龙 is drawn at 1.4×
  if (id === 'fx:stunMark' || id === 'fx:charmMark' || id === 'fx:burnMark' || id === 'fx:slowMark' || id === 'fx:rootMark') return 0.5;
  return 1;
}
/** Only bodies flash (enemies, summons, the companion); the rest shares its sprite as its flash. */
function flashes(id: string): boolean {
  return id.startsWith('mon:') || id.startsWith('elite:') || id.startsWith('boss:') || id.startsWith('sum:') || id.startsWith('char:');
}
/** The moonlight rim and ink hairline by kind: figures stand off the paper; effects stay flat washes. */
function edgeOf(id: string): { rim: number; outline: number } {
  if (id.startsWith('char:')) return { rim: 0.6, outline: 0.5 };
  if (id.startsWith('sum:')) return { rim: 0.45, outline: 0.35 };
  if (id.startsWith('mon:') || id.startsWith('elite:')) return { rim: 0.32, outline: 0 };
  if (id.startsWith('boss:')) return { rim: 0.3, outline: 0 };
  return { rim: 0, outline: 0 };
}
const FONT_WAIT_MS = 1500;
/** Bake budget per frame (GDD §21: 6 ms). One job always runs, so a single big sprite can exceed it. */
const SLICE_MS = 6;
/** The first bake (the start plan, behind the 研墨 screen, which only animates a bar) takes bigger
 *  slices: the frames between slices are idle there, and sprites painted at the camera's scale cost
 *  2× the old pixels. Later bakes run in the shop's background and keep to SLICE_MS. */
const START_SLICE_MS = 14;
/** Icons kept painted (≈ 48–96 px each: a few MB at most). */
const ICON_CACHE = 260;

type Kind = 'char' | 'mon' | 'elite' | 'boss' | 'wpn' | 'item' | 'sum' | 'proj' | 'drop' | 'fx';

const TREASURE_IDS = new Set<string>(TREASURE_REG.map((t) => t.id));
/** 水中月's reflections: boss:moonwater:1:m0 … m7. */
const MOON_LOOKS: readonly MoonLook[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Which spec paints an atlas id (null: unknown id). `self` is the run's companion for 镜主. */
export function specOf(id: string, self: CharacterId = 'scholar'): { spec: Spec; ghost?: boolean; invertible: boolean } | null {
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
    case 'sum': return lookup(SUM_SPECS, name);
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

class InkPainter implements Painter {
  readonly dpr: number;
  /** px per u of sprites. */
  readonly k: number;
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

  constructor(readonly map: MapId, readonly quality: Quality, dpr: number, pxPerU?: number) {
    this.dpr = Math.max(1, Math.min(dpr || 1, 3));
    this.k = pxPerU && Number.isFinite(pxPerU) && pxPerU > 0 ? Math.max(0.5, Math.min(K_MAX[quality], pxPerU)) : this.dpr * PX_PER_U[quality];
    this.arena = new ArenaLayer(map, quality, this.dpr, this.k);
    this.ambience = new Ambience(map, quality, this.dpr, this.k);
    this.tele = new Tele(this.dpr);
    this.nums = new Numbers(this.dpr);
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

  async bake(ids: readonly AtlasId[], onProgress?: (done: number, total: number) => void): Promise<void> {
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
        this.bakeOne(j.id, j.v, j.inv, j.n, pending);
        done++;
      } while (done < total && performance.now() - t0 < slice);
      onProgress?.(done, total);
      if (done < total) await nextFrame();
      if (this.disposed) return;
    }
    this.tele.blot = this.sprite('fx:teleInk');
  }

  private bakeOne(id: AtlasId, v: number, inv: boolean, n: number, pending: Map<string, Entry>) {
    const sp = specOf(id, this.self);
    if (!sp) return;
    const key = id;
    let e = pending.get(key + (inv ? '|i' : ''));
    if (!e) { e = { s: new Array(n), f: new Array(n) }; pending.set(key + (inv ? '|i' : ''), e); }
    try {
      const big = id.startsWith('boss:');
      const k = isZone(sp.spec) ? Math.max(this.k, ZONE_K[this.quality]) : this.k * kindScale(id);
      const edge = edgeOf(id);
      // the halo in px follows the bake scale (≈ 1 u; bosses 1.8 u), never under 1 px
      const halo = Math.max(1, Math.round(k * (big ? 1.8 : 1)));
      const painted = renderSpec(sp.spec, v, { k, seed: seedOf(id) + v * 7919, halo, invert: inv, ghost: sp.ghost, flash: flashes(id), rim: edge.rim, outline: edge.outline });
      const { s, f } = pack(this.pages, painted);
      e.s[v] = s; e.f[v] = f;
    } catch (err) {
      console.warn('[mirror paint]', id, err);
    }
    if (v === n - 1) {
      // fill any failed frame with frame 0 so variants() stays honest
      for (let i = 0; i < n; i++) { if (!e.s[i]) e.s[i] = e.s[0]; if (!e.f[i]) e.f[i] = e.f[0]; }
      if (e.s[0]) (inv ? this.inv : this.normal).set(key, e);
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
    const s = this.sprite(`fx:${look}` as AtlasId);
    this.tele.zone(ctx, cam, s, look, x, y, r, a);
  }
  /** `scale` (optional, beyond the contract): the engine's pop and size-by-damage. */
  drawNumber(ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en', scale = 1): void {
    this.nums.draw(ctx, value, sx, sy, style, a, lang, scale);
  }

  /** A fresh canvas each call (the UI may keep or mutate it), copied from a painted icon cached by
   *  id, size and dpr: the codex's 185 pages or a shop reroll never repaint the brush work. */
  icon(id: AtlasId, px: number): HTMLCanvasElement {
    const d = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const size = Math.max(8, Math.round(px * d));
    const key = `${id}|${size}|${id.startsWith('boss:mirrorself') ? this.self : ''}`;
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
      const p = renderSpec(sp.spec, 0, { k, seed: seedOf(id), halo: Math.max(1, Math.round(size / 40)), ghost: sp.ghost, flash: false });
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
