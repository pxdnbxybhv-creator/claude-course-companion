// The brush skills:
//  - 书生 题诗: a line of verse brushed into the air, stroke by stroke; the plants nearby shed petals at
//    the words; by a wall, a pavilion pillar or a waypoint stele, the line is left there for the day.
//  - 诗仙 斗酒: a sip from the gourd, then couplets swirl round him — chosen for the place, the season
//    and the hour — while he walks a little tipsily.
//  - 画师 神笔: a paper crane flies from the brush toward the nearest thing not yet found, leaving a
//    trail of ink on the ground to follow.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { landmarks, reflects, type Bag } from '../kit';
import { birdWingParts } from './shapes';
import { attributionZh } from '../../../../data/poems';
import { encounterMet, play, record, waypointOpen } from '../../../../app/play';
import { todayKey } from '../../../../core/date';
import { WAYPOINTS, type RegionId } from '../../map';
import { COLUMNS, PAVILION_Y, WALL, wallSegments } from '../../world/site';
import { CELL, MODE } from './fx';
import { craneTarget } from './logic';
import { RULES } from '../encounters/logic';
import { ENCOUNTER } from '../../../../data/encounters';
import { HUE, TAU, clamp01, damp, easeOut, forward, type Running, type SkillEnv } from './env';
import type { VerseLine } from './verses';
import * as snd from './sound';

// ───────────────────────────── 书生 · 题诗 ─────────────────────────────

const PLANT_HUES: Record<string, number[]> = {
  plum: [HUE.rouge, HUE.white, HUE.blush],
  orchid: [0xcdb8e0, HUE.white, 0xe8dff0],
  chrysanthemum: [HUE.gamboge, 0xf0cf6a, HUE.white],
  lotus: [HUE.peach, HUE.blush, HUE.white],
  bamboo: [HUE.jade, HUE.leaf, 0xa9bf6a],
  pine: [HUE.jade, 0x7d9a52, HUE.ochre],
};
const SEASON_HUES: Record<string, number[]> = {
  spring: [HUE.peach, HUE.blush, HUE.white, HUE.rouge],
  summer: [HUE.peach, HUE.blush, HUE.leaf, HUE.jade],
  autumn: [HUE.ochre, HUE.gamboge, 0xc0643a, HUE.leaf],
  winter: [HUE.white, HUE.rouge, HUE.blush, HUE.white],
};

/** Petals (or leaves) falling from (x, y, z). */
function shed(env: SkillEnv, x: number, y: number, z: number, hues: number[], n: number, spread = 0.6): void {
  const { rng, fx } = env;
  const floor = env.floorAt(x, z) + 0.02;
  for (let i = 0; i < n; i++) {
    const leafy = hues[0] === HUE.jade || hues[0] === HUE.ochre;
    fx.air.emit({
      x: x + rng.range(-spread, spread), y: y + rng.range(-0.3, 0.4), z: z + rng.range(-spread, spread),
      vx: rng.range(-0.3, 0.3), vy: rng.range(0, 0.6), vz: rng.range(-0.3, 0.3),
      g: 0.9, drag: 1.6, flutter: 0.45, life: rng.range(4, 6.5), size: leafy ? rng.range(0.07, 0.1) : rng.range(0.055, 0.08),
      color: rng.pick(hues), mode: MODE.flake, cell: leafy ? CELL.leaf : rng.chance(0.3) ? CELL.blossom : CELL.petal,
      spin: rng.range(2, 5), floor, fadeIn: 0.2, fadeOut: 0.25,
    });
  }
}

/** Plants near (x, z) shed a few petals; with none in reach, petals of the season come on the air. */
function answerPlants(env: SkillEnv, x: number, z: number): void {
  const { ctx, rng } = env;
  let any = 0;
  for (const l of landmarks(ctx)) {
    if (l.kind !== 'plant') continue;
    const d = Math.hypot(l.position.x - x, l.position.z - z);
    if (d > 6) continue;
    any++;
    shed(env, l.position.x, l.position.y + 1.2 + rng() * 1.2, l.position.z, PLANT_HUES[l.plant ?? ''] ?? SEASON_HUES[ctx.env.season], env.reduced ? 3 : 7, Math.max(0.4, l.radius * 0.6));
  }
  if (any) return;
  const hues = SEASON_HUES[ctx.env.season];
  const region = ctx.currentRegion();
  const local = region === 'plum' ? PLANT_HUES.plum : region === 'bamboo' ? PLANT_HUES.bamboo : region === 'lake' ? PLANT_HUES.lotus : hues;
  for (let k = 0; k < 3; k++) {
    const a = rng() * TAU, r = rng.range(1.5, 4);
    shed(env, x + Math.cos(a) * r, env.floorAt(x, z) + rng.range(2.2, 3.2), z + Math.sin(a) * r, local, env.reduced ? 3 : 6, 0.8);
  }
}

interface Surface { kind: 'wall' | 'pillar' | 'stele'; x: number; y: number; z: number; yaw: number; w: number; h: number }

/** A wall, a pillar or a stele within reach of (x, z), and where on it to write. */
function surfaceNear(ctx: WorldCtx, x: number, z: number): Surface | null {
  const { THREE } = ctx;
  // a waypoint stele: on its back, which faces away from the name
  for (const w of WAYPOINTS) {
    if (Math.hypot(w.x - x, w.z - z) > 8) continue;
    const g = ctx.scene.getObjectByName('stele:' + w.id);
    if (!g) continue;
    g.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
    if (Math.hypot(p.x - x, p.z - z) > 1.9) continue;
    const rot = g.rotation.y;
    const bx = -Math.sin(rot), bz = -Math.cos(rot);
    return { kind: 'stele', x: p.x + bx * 0.106, y: p.y + 1.02, z: p.z + bz * 0.106, yaw: rot + Math.PI, w: 0.44, h: 1.22 };
  }
  // the pavilion's pillars: a red paper couplet strip
  for (const c of COLUMNS) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d > 1.25) continue;
    const ux = (x - c.x) / (d || 1), uz = (z - c.z) / (d || 1);
    return { kind: 'pillar', x: c.x + ux * 0.16, y: PAVILION_Y + 1.25, z: c.z + uz * 0.16, yaw: Math.atan2(ux, uz), w: 0.17, h: 1.2 };
  }
  // the garden wall, on the side you stand
  if (x * x + z * z < 40 * 40) {
    let best: Surface | null = null, bd = 1.3;
    for (const [ax, az, bx, bz] of wallSegments()) {
      const sx = bx - ax, sz = bz - az;
      const tt = Math.max(0.08, Math.min(0.92, ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz)));
      const cx = ax + sx * tt, cz = az + sz * tt;
      const d = Math.hypot(x - cx, z - cz);
      if (d >= bd) continue;
      bd = d;
      // the wall's normal, toward the walker
      let nx = -sz, nz = sx;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      if (nx * (x - cx) + nz * (z - cz) < 0) { nx = -nx; nz = -nz; }
      const y = ctx.groundY(cx, cz);
      best = { kind: 'wall', x: cx + nx * 0.185, y: y + Math.min(1.3, WALL.h * 0.56), z: cz + nz * 0.185, yaw: Math.atan2(nx, nz), w: 0.5, h: 1.5 };
    }
    return best;
  }
  return null;
}

interface Inscription extends Surface { text: string; day: string }
const INSCRIBE_KEY = 'banmu.inscribe.v1';

function loadInscriptions(day: string): Inscription[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INSCRIBE_KEY) ?? 'null') as { day?: string; marks?: Inscription[] } | null;
    if (!raw || raw.day !== day || !Array.isArray(raw.marks)) return [];
    return raw.marks.filter((m) => m && typeof m.text === 'string' && Number.isFinite(m.x) && Number.isFinite(m.z)).slice(-12);
  } catch {
    return [];
  }
}
function saveInscriptions(day: string, marks: Inscription[]): void {
  try { localStorage.setItem(INSCRIBE_KEY, JSON.stringify({ day, marks: marks.slice(-12) })); } catch { /* private mode: for this visit only */ }
}

/** The walls, pillars and steles written on today. */
export class Inscriptions {
  private list: { mesh: T.Mesh; mat: T.MeshBasicMaterial; born: number; kind: Surface['kind'] }[] = [];
  private marks: Inscription[];
  private day = todayKey();

  constructor(private bag: Bag) {
    this.marks = loadInscriptions(this.day);
    for (const m of this.marks) this.show(m, -99);
  }

  add(s: Surface, text: string, t: number): void {
    const m: Inscription = { ...s, text, day: this.day };
    // one inscription per spot: a new line replaces the old one there
    const near = this.marks.findIndex((o) => Math.hypot(o.x - m.x, o.z - m.z) < 0.4 && Math.abs(o.y - m.y) < 1);
    if (near >= 0) {
      this.marks.splice(near, 1);
      const old = this.list.splice(near, 1)[0];
      if (old) this.bag.drop(old.mesh);
    }
    this.marks.push(m);
    while (this.marks.length > 12) { this.marks.shift(); const o = this.list.shift(); if (o) this.bag.drop(o.mesh); }
    saveInscriptions(this.day, this.marks);
    this.show(m, t);
  }

  private show(m: Inscription, t: number): void {
    const { THREE } = this.bag.ctx;
    const chars = [...m.text].slice(0, 9);
    const W = 128, CH = 118, H = Math.max(3, chars.length) * CH + 40;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const red = m.kind === 'pillar';
    if (red) {
      // a strip of red paper with a gold rule
      g.fillStyle = '#b3402c';
      g.fillRect(8, 0, W - 16, H);
      g.strokeStyle = 'rgba(232,190,110,0.8)';
      g.lineWidth = 3;
      g.strokeRect(14, 6, W - 28, H - 12);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `96px "Ma Shan Zheng", "LXGW WenKai", "KaiTi", serif`;
    g.fillStyle = red ? '#1a1310' : '#221a14';
    chars.forEach((ch, i) => {
      g.globalAlpha = 0.82 + ((i * 37) % 11) / 60;
      g.fillText(ch, W / 2, 20 + CH * (i + 0.5));
    });
    g.globalAlpha = 1;
    // a small cinnabar seal at the foot (the walls and steles)
    if (!red) {
      g.fillStyle = '#b93a2b';
      g.fillRect(W / 2 - 16, H - 36, 32, 32);
      g.fillStyle = '#f4ecd9';
      g.font = `24px "Ma Shan Zheng", "KaiTi", serif`;
      g.fillText('题', W / 2, H - 20);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, opacity: t < 0 ? 1 : 0 });
    const aspect = H / W;
    const w = m.w, h = Math.min(m.h, w * aspect);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(red ? w : Math.min(w, h / aspect), h), mat);
    mesh.position.set(m.x, m.y, m.z);
    mesh.rotation.y = m.yaw;
    mesh.name = 'inscription';
    this.bag.add(mesh);
    this.list.push({ mesh, mat, born: t, kind: m.kind });
  }

  update(t: number, night: number): void {
    for (const e of this.list) {
      if (e.mat.opacity < 1) e.mat.opacity = clamp01((t - e.born) / 1.4);
      // unlit paper: dim it with the dusk
      const k = 1 - night * 0.55;
      e.mat.color.setRGB(k, k * (e.kind === 'pillar' ? 0.97 : 1), k * (e.kind === 'pillar' ? 0.93 : 1));
    }
  }
}

/** Layout of a vertical column of glyphs brushed into the air. */
function column(env: SkillEnv, line: VerseLine, t0: number, x: number, yTop: number, z: number, size: number): { h: number[]; x: number; z: number; yTop: number; n: number; t0: number; size: number } {
  const hs: number[] = [];
  for (const ch of [...line.text]) hs.push(env.fx.glyphs.add(ch, HUE.ink));
  return { h: hs, x, z, yTop, n: hs.length, t0, size };
}

export function scholar(env: SkillEnv, inscriptions: Inscriptions): Running {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  P.emote('skill');
  snd.brush(0.7);
  const line = env.deck.next(env.place());
  const [fx0, fz0] = forward(P.heading);
  const rx = -fz0, rz = fx0;
  const p = P.position;
  const size = 0.44, step = 0.4;
  const n = [...line.text].length;
  // at his right shoulder, a little ahead — unless a pillar, a wall or a prop stands there (the
  // 牌坊 at the water town's stele): then his left, or further ahead
  const spots: [number, number][] = [[0.7, 0.95], [0.7, -0.95], [1.3, 0.6], [1.3, -0.6], [1.6, 0]];
  const [ahead, side] = spots.find(([a, sd]) => ctx.isWalkable(p.x + fx0 * a + rx * sd, p.z + fz0 * a + rz * sd)) ?? spots[0];
  const col = column(env, line, 0, p.x + fx0 * ahead + rx * side, p.y + 0.55 + step * (n - 1), p.z + fz0 * ahead + rz * side, size);
  const surface = surfaceNear(ctx, p.x, p.z);
  ctx.hud.toast(`「${line.text}」 —— ${attributionZh(line.poem)}`, `“${line.text}” — ${line.poem.authorEn}`, 3600);
  let t0 = -1;
  let wrote = -1;
  let petals = false;
  let inscribed = false;
  const REVEAL = env.reduced ? 0.05 : 0.2, EACH = env.reduced ? 0.02 : 0.19;
  const LIFE = 8;
  return {
    update(dt, t) {
      if (t0 < 0) t0 = t;
      const e = t - t0;
      const done = col.n * EACH + REVEAL;
      for (let i = 0; i < col.n; i++) {
        const start = 0.2 + i * EACH;
        const k = clamp01((e - start) / REVEAL);
        if (k > 0 && wrote < i) {
          wrote = i;
          if (!env.reduced) snd.brush(0.25);
          // a fleck or two of ink from the brush
          const gy = col.yTop - i * step;
          for (let j = 0; j < (env.reduced ? 1 : 3); j++) {
            fx.air.emit({ x: col.x + rng.range(-0.12, 0.12), y: gy, z: col.z + rng.range(-0.12, 0.12), vx: rng.range(-0.4, 0.4), vy: rng.range(0.2, 0.8), vz: rng.range(-0.4, 0.4), g: 7, life: 1.4, size: rng.range(0.03, 0.06), color: HUE.ink, alpha: 0.85, mode: MODE.puff, cell: CELL.drop, floor: env.floorAt(col.x, col.z) + 0.01, fadeOut: 0.3 });
          }
        }
        const fade = e > LIFE - 1.2 ? clamp01((LIFE - e) / 1.2) : 1;
        const lift = e > LIFE - 1.2 ? (e - (LIFE - 1.2)) * (0.25 + i * 0.03) : 0;
        const bob = env.reduced ? 0 : Math.sin(e * 1.3 + i * 0.6) * 0.025;
        fx.glyphs.set(col.h[i], col.x, col.yTop - i * step + bob + lift, col.z, size * (1 + (1 - fade) * 0.25), fade, env.reduced ? 1 : k, 0);
        if (fade < 1 && !env.reduced && rng.chance(dt * 3)) {
          fx.air.emit({ x: col.x, y: col.yTop - i * step + lift, z: col.z, vx: rng.range(-0.1, 0.1), vy: 0.35, vz: rng.range(-0.1, 0.1), life: 1.4, size: 0.18, grow: 2.2, color: HUE.inkSoft, alpha: 0.18, mode: MODE.puff, cell: CELL.soft });
        }
      }
      if (!petals && e > 0.5) { petals = true; answerPlants(env, P.position.x, P.position.z); }
      if (!inscribed && surface && e > done) {
        inscribed = true;
        inscriptions.add(surface, line.text, t);
        record('inscribe');
        snd.brush(0.5);
        const what = surface.kind === 'wall' ? ['题壁', 'on the wall'] : surface.kind === 'pillar' ? ['题柱', 'on the pillar'] : ['题碑', 'on the stele'];
        ctx.hud.toast(`${what[0]}：「${line.text}」——今日墨迹不干`, `Inscribed ${what[1]}: “${line.text}” — it stays for the day`, 3200);
      }
      return e < LIFE;
    },
    end() {
      for (const h of col.h) fx.glyphs.remove(h);
    },
  };
}

// ───────────────────────────── 诗仙 · 斗酒 ─────────────────────────────

interface Swirl { h: number; ring: number; k: number; n: number; born: number; ch: string }

export function poet(env: SkillEnv): Running {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  P.emote('skill');
  snd.sip(0.7);
  P.setMoveMods({ speed: 0.92 });
  let t0 = -1;
  let glyphs: Swirl[] = [];
  let leaving: { s: Swirl; from: number }[] = [];
  let shown = 0;
  let wobbleAt = 0, side = 1;
  const cam = ctx.camera.position;
  const R = env.reduced;
  const spawn = (t: number) => {
    const lines = env.deck.couplet(env.place());
    for (const s of glyphs) leaving.push({ s, from: t });
    glyphs = [];
    lines.forEach((l, ring) => {
      const chars = [...l.text];
      chars.forEach((ch, k) => {
        const h = fx.glyphs.add(ch, ring ? 0x2a1d17 : HUE.ink);
        if (h >= 0) glyphs.push({ h, ring, k, n: chars.length, born: t + k * 0.08 + ring * 0.35, ch });
      });
    });
    const poem = lines[0].poem;
    ctx.hud.toast(`「${lines.map((l) => l.text).join('，')}」 —— ${attributionZh(poem)}`, `“${lines.map((l) => l.text).join(', ')}” — ${poem.authorEn}`, 3800);
    shown++;
  };
  const place = (s: Swirl, e: number, out: number) => {
    const p = P.position;
    const camA = Math.atan2(cam.x - p.x, cam.z - p.z);
    const r0 = s.ring ? 0.95 : 1.05;
    const step = s.ring ? 0.25 : 0.26;
    const sway = R ? 0 : Math.sin(e * 0.7) * 0.28;
    // swirl in from wide and high, settle on the arc facing the camera, swirl out and up
    const come = R ? 1 : easeOut(clamp01((e - (s.born - (t0 < 0 ? 0 : t0))) / 0.7));
    const a = camA + sway + (s.k - (s.n - 1) / 2) * step + (1 - come) * 2.4 + out * 1.8;
    const r = r0 + (1 - come) * 1.6 + out * 1.4;
    const y = p.y + (s.ring ? 1.62 : 2.08) + (R ? 0 : Math.sin(e * 1.6 + s.k * 0.7) * 0.04) + (1 - come) * 0.9 + out * 1.2;
    const alpha = clamp01(come * 1.4) * (1 - out);
    fx.glyphs.set(s.h, p.x + Math.sin(a) * r, y, p.z + Math.cos(a) * r, 0.27, alpha, 1, R ? 0 : Math.sin(e * 1.1 + s.k) * 0.12);
  };
  return {
    update(dt, t) {
      if (t0 < 0) { t0 = t; wobbleAt = t + 1.2; }
      const e = t - t0;
      if (shown === 0 && e > 0.9) spawn(t);
      else if (shown === 1 && e > 4.7) spawn(t);
      for (const s of glyphs) place(s, e, 0);
      leaving = leaving.filter(({ s, from }) => {
        const k = clamp01((t - from) / 0.9);
        place(s, e, easeOut(k));
        if (k >= 1) { fx.glyphs.remove(s.h); return false; }
        return true;
      });
      // gold motes of wine-warmth round him
      if (!R && rng.chance(dt * 6)) {
        const a = rng() * TAU;
        fx.air.emit({ x: P.position.x + Math.cos(a) * 0.9, y: P.position.y + rng.range(0.6, 1.9), z: P.position.z + Math.sin(a) * 0.9, vy: 0.25, life: 1.6, size: rng.range(0.06, 0.12), color: env.night() > 0.5 ? HUE.amber : HUE.gold, alpha: 0.8, mode: MODE.glow, cell: CELL.star });
      }
      // a tipsy step now and then
      if (!R && t > wobbleAt && e < 8.3) {
        wobbleAt = t + rng.range(0.45, 0.8);
        const [fx0, fz0] = forward(P.heading);
        side = -side;
        const s = side * rng.range(0.6, 1.0);
        P.impulse(-fz0 * s, 0, fx0 * s);
      }
      const end = e > 8.6;
      if (end) for (const s of glyphs) leaving.push({ s, from: t });
      if (end) glyphs = [];
      return !end || leaving.length > 0;
    },
    end() {
      for (const s of glyphs) fx.glyphs.remove(s.h);
      for (const l of leaving) fx.glyphs.remove(l.s.h);
      glyphs = []; leaving = [];
      P.setMoveMods(null);
    },
  };
}

// ───────────────────────────── 画师 · 神笔 ─────────────────────────────

/**
 * A folded paper crane (one instanced draw, wings beating in the vertex shader). One crane flies at a
 * time: `flight` counts the flights, and a flight that is no longer the newest lets go of the mesh.
 */
export function paperCrane(bag: Bag): { mesh: T.InstancedMesh; flight: number; setTime(t: number): void; setBeat(a: number): void } {
  const { THREE } = bag.ctx;
  const { geo, mat, amp, uniforms } = birdWingParts(THREE);
  bag.own(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.name = 'paper-crane';
  mesh.frustumCulled = false;
  mesh.visible = false;
  bag.add(reflects(mesh));
  return {
    mesh,
    flight: 0,
    setTime(t) { uniforms.uTime.value = t; },
    setBeat(a) { amp.setX(0, a); amp.needsUpdate = true; },
  };
}

export function painter(env: SkillEnv, crane: ReturnType<typeof paperCrane>): Running | null {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  const p0 = P.position;
  const here = ctx.currentRegion();
  const pv = play.value;
  const target = craneTarget({ x: p0.x, z: p0.z }, {
    waypointOpen: (id) => waypointOpen(pv, id),
    encounterMet: (id) => encounterMet(pv, id),
    visited: (id: RegionId) => id === here || !!pv.flags[`visit:${id}`],
    here,
    // the 奇遇's own place and hour (the butterfly only on a sunny afternoon, the moon on the lake by night)
    canHappen: (id) => {
      const rule = RULES[id], def = ENCOUNTER[id];
      if (!rule || !def || def.region === 'any') return true;
      return rule.when({ day: todayKey(), tod: ctx.env.tod, hour: ctx.env.hour, night: ctx.sky.isNight(), season: ctx.env.season, moon: ctx.env.moonPhase, region: def.region, who: P.character, festivals: ctx.env.festivals });
    },
  });
  P.emote('skill');
  snd.paper(6, 0.6);
  snd.flap(0.5);
  const { THREE } = ctx;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), s = new THREE.Vector3(1.7, 1.7, 1.7);
  const circling = target.kind === 'none';
  // it leaves his hand on the side it will fly to (never back toward the camera behind him)
  const toward = circling ? P.heading : Math.atan2(target.x - p0.x, target.z - p0.z);
  const [f0x, f0z] = forward(toward);
  let x = p0.x + f0x * 0.5, z = p0.z + f0z * 0.5, y = p0.y + 1.25;
  let heading = toward;
  const dist = Math.hypot(target.x - x, target.z - z);
  const speed = Math.max(6.5, dist / 15);
  let travelled = 0, dotAt = 0.6;
  let phase: 'rise' | 'fly' | 'circle' | 'gone' = 'rise';
  let pt = 0;
  let circleA = 0;
  const cx0 = circling ? p0.x : target.x, cz0 = circling ? p0.z : target.z;
  // a new crane from the painter's hand: one still on its way unfolds into paper where it is
  const mine = ++crane.flight;
  crane.mesh.visible = true;
  crane.setBeat(1);
  const metres = Math.round(dist / 5) * 5;
  if (target.kind === 'waypoint') ctx.hud.toast(`纸鹤飞向「${target.zh}」——那里的驿碑尚未点亮（约${metres}米）`, `The crane flies toward ${target.en} — a waypoint not yet lit (about ${metres} m)`, 4200);
  else if (target.kind === 'encounter' && target.later) ctx.hud.toast(`纸鹤飞向${target.zh}，却说时候未到：${target.hintZh}`, `The crane flies toward the ${target.en}, but not yet: ${target.hintEn}`, 5200);
  else if (target.kind === 'encounter') ctx.hud.toast(`纸鹤飞向${target.zh}：${target.hintZh}`, `The crane flies toward the ${target.en}: ${target.hintEn}`, 4800);
  else if (target.kind === 'region') ctx.hud.toast(`纸鹤飞向「${target.zh}」——你还未曾去过（约${metres}米）`, `The crane flies toward ${target.en} — somewhere you have never been (about ${metres} m)`, 4200);
  else ctx.hud.toast('山水皆已入画——纸鹤绕你飞了一圈', 'Every place is already in your painting — the crane circles you once', 3600);
  // turn the view the crane's way, a few metres ahead: the framing centres between the walker and
  // this point, so a far one would swing the camera past him and leave him out of the picture
  if (!circling) ctx.frameCamera(p0.x + f0x * 4.5, p0.z + f0z * 4.5, p0.y + 2.2, 1.8);

  // the flight outlives the skill: the painter walks on while the crane leads
  const scatter = (n: number) => {
    for (let i = 0; i < n; i++) {
      fx.air.emit({ x, y, z, vx: rng.range(-0.8, 0.8), vy: rng.range(-0.2, 0.9), vz: rng.range(-0.8, 0.8), g: 0.6, drag: 1.2, flutter: 0.3, life: rng.range(1.6, 2.6), size: rng.range(0.05, 0.09), color: rng.chance(0.7) ? HUE.white : HUE.ink, mode: MODE.flake, cell: CELL.petal, spin: 4 });
    }
  };
  env.linger((dt, t) => {
    if (phase === 'gone') return false;
    if (crane.flight !== mine) {
      // a newer crane has the mesh now: this one comes apart in the air
      phase = 'gone';
      scatter(env.reduced ? 4 : 10);
      return false;
    }
    crane.setTime(t);
    pt += dt;
    const floor = env.floorAt(x, z);
    if (phase === 'rise') {
      const k = clamp01(pt / 0.8);
      y = damp(y, floor + 2.6, 4, dt);
      heading = Math.atan2(cx0 - x, cz0 - z);
      if (circling) heading = P.heading;
      x += Math.sin(heading) * dt * 1.5;
      z += Math.cos(heading) * dt * 1.5;
      if (k >= 1) { phase = circling ? 'circle' : 'fly'; pt = 0; circleA = Math.atan2(x - cx0, z - cz0); }
    } else if (phase === 'fly') {
      const want = Math.atan2(target.x - x, target.z - z);
      let d = want - heading;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      heading += d * Math.min(1, dt * 3) + (env.reduced ? 0 : Math.sin(pt * 1.7) * 0.004);
      const stepLen = speed * dt;
      x += Math.sin(heading) * stepLen;
      z += Math.cos(heading) * stepLen;
      travelled += stepLen;
      y = damp(y, floor + 2.4 + Math.sin(pt * 1.3) * 0.25, 3, dt);
      // the ink trail below it
      while (travelled > dotAt) {
        dotAt += 1.05;
        const gy = env.floorAt(x, z);
        fx.ground.emit({ x: x + rng.range(-0.15, 0.15), y: gy + 0.03, z: z + rng.range(-0.15, 0.15), life: 20, size: rng.range(0.22, 0.34), color: HUE.ink, alpha: 0.55, mode: MODE.flat, cell: rng.chance(0.6) ? CELL.blot : CELL.drop, fadeIn: 0.4, fadeOut: 0.2 });
      }
      if (Math.hypot(target.x - x, target.z - z) < 2.2 || pt > 22) { phase = 'circle'; pt = 0; circleA = Math.atan2(x - cx0, z - cz0); }
    } else if (phase === 'circle') {
      const r = circling ? 2.6 : 2.2;
      circleA += dt * (circling ? 1.6 : 1.3);
      const nx = cx0 + Math.sin(circleA) * r, nz = cz0 + Math.cos(circleA) * r;
      heading = Math.atan2(nx - x, nz - z);
      x = nx; z = nz;
      const cf = env.floorAt(x, z);
      y = damp(y, cf + (circling ? 2.0 : 2.8), 2, dt);
      if (pt > (circling ? 4.2 : 3)) {
        phase = 'gone';
        crane.mesh.visible = false;
        snd.paper(4, 0.3);
        scatter(env.reduced ? 6 : 16);
        return false;
      }
    }
    e.set(phase === 'fly' ? -0.08 : 0, heading, phase === 'circle' ? -0.35 : Math.sin(pt * 2.1) * 0.08);
    q.setFromEuler(e);
    // never a great grey sheet across the lens: it folds away as it comes within 2.5 m of the camera
    const near = clamp01((ctx.camera.position.distanceTo(v.set(x, y, z)) - 1.2) / 1.3);
    m.compose(v, q, s.setScalar(1.7 * near));
    crane.mesh.setMatrixAt(0, m);
    crane.mesh.instanceMatrix.needsUpdate = true;
    crane.setBeat(phase === 'fly' && Math.sin(pt * 0.9) > 0.6 ? 0.25 : 1);
    return true;
  });
  let t0 = -1;
  return {
    update(_dt, t) {
      if (t0 < 0) t0 = t;
      return t - t0 < 1.2;
    },
    end() { /* the crane flies on */ },
  };
}
