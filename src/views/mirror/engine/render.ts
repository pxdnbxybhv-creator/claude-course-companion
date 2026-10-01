// 水月幻镜 · the frame's drawing (GDD §20, §24.3): setTransform + drawImage from the painter's
// atlases, in the contract's order (drawOrder): arena → telegraphs → zones → drops → enemies → their HP bars → summons
// → player → effects → player shots → your HP bar → numbers → enemy shots → low-HP edge and titles →
// off-screen threat chevrons (the vermilion
// enemy shots stay on top of everything the player's side makes, numbers included). In the dark
// (暗月, 大雪, 天狗食月) the darkness goes over the field but under the danger: the enemy's ground,
// telegraphs and enemy shots are drawn after it. No shadowBlur,
// filters or per-frame gradients (the two overlay masks are baked once). A null sprite draws as a
// plain ink circle, so the game is playable before (or without) the art.
import type { AtlasId, Camera, NumStyle, Painter, Sprite } from '../types';
import { blit, blitAt, blitRot, offCanvas, reach } from '../paint/draw';
import { EKind, SMode } from './pools';
import { DROP_ATLAS, DROP_IDS, PROJ_ATLAS, PROJ_IDS, SK, SUMMON_ATLAS, SWORDS_ON_SCREEN, TAU } from './consts';
import { ST } from './enemies';
import { CRIT_NUM, MK, PF, PULSE_A, PULSE_S, fragGrid, fragWhite, fxDelta, numPop } from './feel';
import { weaponRange } from '../logic/formulas';
import { SH, TN } from '../paint/feel';
import { drawAmbience } from '../paint/ambient';
import { BK, FK, VF, VT, tintOfWeapon, vfxOf, type Vfx } from './vfx';
import { TG, TSY, Trails } from './trails';
import { vfxSprites } from '../paint/vfx';
import { HpBars } from './bars';
import { Threats } from './threats';
import type { World } from './world';
import { drawDown } from './down';

/**
 * 流光 per projectile kind: trail width (u), trail length (s), trail style (0 none, 1 light, 2 ink),
 * glow radius under the shot (× its hit radius; 0 none), draw scale. Enemy kinds: none (their danger
 * look is the painter's).
 */
const SHOT_LOOK: Readonly<Record<string, readonly [number, number, number, number, number]>> = {
  flySword: [8, 0.24, 1, 3, 1.3], peachSword: [8, 0.24, 1, 3, 1.3], sunArrow: [4.8, 0.14, 1, 2.5, 1.2], crossBolt: [4.2, 0.11, 1, 2.5, 1.2],
  dartStar: [4.6, 0.12, 1, 2.6, 1.2], coinBlade: [5, 0.12, 1, 2.6, 1.2], noteGlyph: [6, 0.2, 1, 2.9, 1.25], moonDisc: [11, 0.16, 1, 2.4, 1.05],
  crescentWave: [26, 0.14, 1, 1.4, 1], inkBlob: [6.5, 0.11, 2, 0, 1], bambooLeaf: [3.8, 0.1, 1, 1.9, 1], fireLob: [7.5, 0.18, 1, 2.6, 1],
  gourdLob: [5.5, 0.11, 2, 0, 1], verseGlyph: [6, 0.18, 1, 2.5, 1.1], moonMote: [3.8, 0.15, 1, 2.7, 1], hookLine: [2.2, 0.07, 1, 0, 1],
};
/** Where a shot's head is (u ahead of its centre, along its flight): the white-hot point of light. */
const HEAD_OF: Readonly<Record<string, number>> = { flySword: 18, peachSword: 18, sunArrow: 16, crossBolt: 10, moonDisc: 0, crescentWave: 6, fireLob: 0, noteGlyph: 0, dartStar: 0, coinBlade: 0, verseGlyph: 0, moonMote: 3, bambooLeaf: 6 };
const NPK = PROJ_IDS.length;
const TR_W = new Float32Array(NPK), TR_DUR = new Float32Array(NPK), TR_GLOW = new Float32Array(NPK), TR_SZ = new Float32Array(NPK).fill(1);
const TR_STY = new Uint8Array(NPK);
/** The head's offset (u, −1: no head glow) by kind. */
const TR_HEAD = new Float32Array(NPK).fill(-1);
/** The light of a shot with no weapon slot (summons' shots, items'), by kind. */
const KIND_TINT = new Uint8Array(NPK).fill(VT.moon);
PROJ_IDS.forEach((id, k) => {
  const L = SHOT_LOOK[id];
  if (L) { TR_W[k] = L[0]; TR_DUR[k] = L[1]; TR_STY[k] = L[2]; TR_GLOW[k] = L[3]; TR_SZ[k] = L[4]; }
  const hd = HEAD_OF[id];
  if (hd !== undefined) TR_HEAD[k] = hd;
  KIND_TINT[k] = id === 'inkBlob' ? VT.ink : id === 'bambooLeaf' ? VT.green : id === 'verseGlyph' ? VT.wine : id === 'flySword' ? VT.jade : id === 'peachSword' ? VT.gamboge : VT.moon;
});
/** The resting 桃木剑 blades (their share of the idle swords) are drawn this much smaller than in flight. */
const PEACH_SZ = 0.85;
/** 嫦娥's height (u) while she rises (广寒清辉). */
const RISE_H = 22;
/** The companion's own light (dash and leap ribbons, afterimages). Never vermilion (关公's red stays in his sprite). */
const CHAR_TINT: Readonly<Record<string, number>> = {
  swordsman: VT.azure, guan: VT.gold, change: VT.moon, cat: VT.gold, rabbit: VT.jade, poet: VT.wine, taoist: VT.gamboge, painter: VT.indigo,
  scholar: VT.indigo, gardener: VT.green, fisher: VT.azure, musician: VT.green, player: VT.moon,
};
/** The largest glow under a shot (u): a soft light, never a wash over the field. */
const GLOW_MAX_R = 34;
/** Your figure while hurt (屏幕抖动 RC8): the i-frames' steady alpha, the drawn nudge along a blow (u),
 *  the dark rim's peak alpha. */
const IFRAME_A = 0.55;
const HURT_KNOCK = 2;
const HURT_RIM_A = 0.2;
/** Orbiting blades drawn with an arc ribbon, per quality (the frame guard halves it). */
const ARC_CAP = { low: 8, mid: 16, high: 24 } as const;
/** Drops that always glow (gold, hearts, cases), by kind index; −1 only while streaming in. m8: the 月华 pearls
 *  carry their glow baked in (the indigo bleed), so they never take a glow from the frame's budget. */
const DROP_GLOW_OF: Readonly<Record<string, number>> = { goldShard: VT.gold, carpGold: VT.gold, heartDrop: VT.moon, crateBox: VT.gold, cashTen: VT.gold, relicMirror: VT.moon, relicSword: VT.moon };
const DROP_GLOW = Int8Array.from(DROP_IDS, (id) => DROP_GLOW_OF[id] ?? -1);
/** m8 · held weapons (art.md §4.3, PLAN D22): drawn at 0.8× (was 0.55) and alpha 1 (was 0.9) on an orbit of
 *  30 × 22 u (was 24 × 18) so a 40 u sword does not cover the figure. The fallback the owner may pick is 0.7×
 *  (art §9 Q1): change `size` here only (paint/index.ts kindScale('wpn:') bakes at 0.85 either way). */
export const HELD = { size: 0.8, alpha: 1, orbitX: 30, orbitY: 22 } as const;
/** m8 · the 月华 pearls (月华, 月华珠, 满月) by kind index: they float, twinkle and stream in over the bodies. */
const DROP_MOON = Uint8Array.from(DROP_IDS, (id) => (id === 'moonDrop' || id === 'moonThick' || id === 'moonFull' ? 1 : 0));
/** 月华 on the ground (art.md §5.2): a float of ±MOON_BOB u at MOON_BOB_W rad/s, phase MOON_BOB_PH per drop; the
 *  twinkle frame shows while (MOON_TW_RATE t + MOON_TW_PH i) mod 1 < MOON_TW_ON (12 % of a 1.43 s cycle, a
 *  golden-ratio stagger). None of it under 减少动态 (the static v0 frame). */
const MOON_BOB = 1.8, MOON_BOB_W = 3.2, MOON_BOB_PH = 1.7, MOON_TW_RATE = 0.7, MOON_TW_PH = 0.618, MOON_TW_ON = 0.12;
/** The comet tail of a streaming pearl (art §5.3): length, width and alpha of SH.streak (was 0.55 each). */
const MOON_TAIL: readonly [number, number, number] = [1.4, 0.9, 0.85];
/** The pickup ping (art §5.4): ring r and life, motes r / count / life. */
const MOON_PING = { r: 30, life: 0.32, moteR: 16, motes: 3, moteLife: 0.55 } as const;
/** A 月华 pearl's float offset (u, up) at time t for drop i (0 under 减少动态 or while pulled). */
export function moonBob(t: number, i: number, calm: boolean, pulled: boolean): number {
  return calm || pulled ? 0 : MOON_BOB * Math.sin(t * MOON_BOB_W + i * MOON_BOB_PH);
}
/** A 月华 pearl's frame at time t for drop i: 1 (the twinkle) 12 % of the time, staggered; 0 under 减少动态. */
export function moonFrame(t: number, i: number, calm: boolean): number {
  return !calm && ((t * MOON_TW_RATE + i * MOON_TW_PH) % 1) < MOON_TW_ON ? 1 : 0;
}
/** Both at once (the tests). */
export function moonIdle(t: number, i: number, calm: boolean, pulled: boolean): { bob: number; v: number } {
  return { bob: moonBob(t, i, calm, pulled), v: moonFrame(t, i, calm) };
}
/** A drawNumber that also takes a scale (the painter's implementation accepts it). */
type DrawNum = (ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en', scale?: number) => void;

const NUM_STYLE: readonly NumStyle[] = ['hit', 'crit', 'heal', 'moon', 'coin', 'player'];
const FX_BASE: Record<string, number> = { beamRay: 64, boltChain: 32, swordStreak: 40, slashArc: 32 };

/** Extra passes (a flash twin over a body, its ink tint) a frame may spend on the crowd, by quality. */
const BODY_PASSES = { low: 12, mid: 20, high: 32 } as const;

/** Everything the renderer keeps between frames (made once, reused). */
export class Renderer {
  private light: HTMLCanvasElement | null = null;
  private edge: HTMLCanvasElement | null = null;
  private hurtEdge: HTMLCanvasElement | null = null;
  private edgeKey = '';
  /** The darkness's hole and its four rects, reused every frame (holeRects). */
  private readonly hole = new Float64Array(20);
  private atlasCache = new Map<string, AtlasId>();
  /** Extra body passes spent this frame (BODY_PASSES). */
  private passes = 0;
  /** Per enemy slot: the generation whose death shards are baked (or can't be), so a body's pieces are
   *  ready long before it breaks. */
  private shardGen = new Uint32Array(0);
  /** 流光: the ribbon trails (shots, your dash and leap, summons), sized by quality. */
  readonly trails: Trails;
  /** Per shot slot: its last life, kind and mode (a reused slot is a new shot: its trail restarts). */
  private shotLife = new Float32Array(0);
  private shotKind = new Int16Array(0);
  private shotMode = new Uint8Array(0);
  /** Per summon slot: where it was drawn last and when (its speed decides its trail). */
  private sumX = new Float32Array(0);
  private sumY = new Float32Array(0);
  private sumT = new Float32Array(0);
  /** Your dash/leap trail (for the afterimages), the xp and levels seen (pickup pings). */
  private pTrail = -1;
  private seenXp = 0;
  private lastPing = -9;
  /** Slot → light tint, refreshed each frame (no lookup per shot). */
  private readonly slotTint = new Uint8Array(16);
  /** 嫦娥's rise (广寒清辉): how long it was when it began, and the untargetable time seen last. */
  private riseDur = 0;
  private lastUntarg = 0;
  private readonly pt = { x: 0, y: 0 };
  /** Shot glows left this frame. */
  private glowsLeft = 0;
  /** Sprites looked up once a frame: drops by kind × coin frame, shots by kind (undefined: not yet). */
  private readonly dropSpr: (Sprite | null | undefined)[] = new Array(DROP_ATLAS.length * 4).fill(undefined);
  private readonly projSpr: (Sprite | null | undefined)[] = new Array(NPK).fill(undefined);
  /** Simulation steps seen by the shot layer (the shots take turns shedding motes, one step in eight
   *  each), and the world time it last looked at: shedding counts steps, never drawn frames, so every
   *  shot sheds at the same rate at 30–360 Hz. */
  private shedN = 0;
  private shedT = -1;
  /** The painter's sprite lookup, bound once (the VFX layer's glyph). */
  private readonly spr = (id: AtlasId): Sprite | null => this.sprite(id);
  /** HP bars over the bodies and you (engine/bars.ts): recorded by the enemy layer, the bodies' drawn
   *  by 'enemyBars' (under your figure and the blows), yours by 'bars'. */
  readonly bars = new HpBars();
  /** Off-screen threat chevrons at the screen's edge (engine/threats.ts): the 'threats' layer. */
  readonly threats = new Threats();
  /** Your figure and lift as drawn this frame (your bar sits over them). */
  private youS: Sprite | null = null;
  private youLift = 0;

  constructor(private painter: Painter) {
    this.trails = new Trails(painter.quality);
    // the VFX layer's soft sprites bake here, behind the run's loading bake (never mid-frame)
    try { vfxSprites(painter.quality); } catch { /* no canvas: vectors only */ }
  }

  setPainter(p: Painter): void { this.painter = p; }

  private sprite(id: AtlasId, v = 0): Sprite | null {
    try { return this.painter.sprite(id, v); } catch { return null; }
  }

  draw(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    // what the drawing itself spawns (motes off shots, pickup pings, legacy fx taken over) draws on the
    // renderer's own random stream: the simulation's effects get the same numbers at every frame rate
    const V = vfxOf(W);
    V.drawing(true);
    try {
      this.beginVfx(W);
      this.bars.begin(W);
      const order = drawOrder(W.lightR !== null);
      for (let k = 0; k < order.length; k++) this.layer(order[k], W, ctx, cam);
    } finally { V.drawing(false); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** One layer of the frame (draw() walks drawOrder). */
  layer(L: Layer, W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    switch (L) {
      case 'arena': this.painter.drawArena(ctx, cam); drawAmbience(W, ctx, cam); break;
      case 'telegraphs': this.drawTeles(W, ctx, cam); break;
      // in the dark the player's washes stay under it and the enemy's ground (webs, clouds, puddles) rises above
      case 'zones': this.drawZones(W, ctx, cam, W.lightR !== null ? 1 : -1); break;
      case 'dangerZones': this.drawZones(W, ctx, cam, 0); break;
      case 'ground': this.drawGround(W, ctx, cam); break;
      case 'drops': this.drawDrops(W, ctx, cam); break;
      case 'enemies': this.drawEnemies(W, ctx, cam); if (this.streaming > 0) this.drawStream(W, ctx, cam); break;
      case 'summons': this.drawSummons(W, ctx, cam); break;
      case 'player': vfxOf(W).drawUnder(ctx, cam, this.spr); this.drawSwords(W, ctx, cam); this.drawPlayer(W, ctx, cam); break;
      case 'effects': this.drawEffects(W, ctx, cam); break;
      case 'playerShots': this.drawPlayerShots(W, ctx, cam); break;
      case 'enemyBars': this.bars.drawEnemies(ctx, cam); break;
      case 'bars': this.bars.drawYou(W, ctx, cam, this.youS, this.youLift); break;
      case 'numbers': this.drawNumbers(W, ctx, cam); break;
      case 'darkness': this.drawDarkness(W, ctx, cam); break;
      case 'enemyShots': this.drawEnemyShots(W, ctx, cam); break;
      case 'reticle': this.drawReticle(W, ctx, cam); break;
      case 'overlays': this.overlays(W, ctx, cam); break;
      case 'threats': this.threats.draw(W, ctx, cam); break;
    }
  }

  private drawTeles(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // telegraphs: wet ink filling (fullness = time spent)
    const P = this.painter, T = W.T;
    for (let i = 0; i < T.n; i++) if (T.alive[i]) P.drawTele(ctx, cam, T.shape[i], Math.min(1, T.t[i] / T.dur[i]));
  }

  /** Zones (washes) of one side: 0 the enemy's, 1 the player's, −1 both. */
  private drawZones(W: World, ctx: CanvasRenderingContext2D, cam: Camera, side: number): void {
    const P = this.painter, Z = W.Z;
    const calm = !!W.settings.reduceMotion;
    for (let i = 0; i < Z.n; i++) {
      if (!Z.alive[i] || !Z.look[i] || (side >= 0 && Z.side[i] !== side)) continue;
      const fade = zoneFade(Z.life[i], Z.age[i]);
      const a = (Z.side[i] ? 0.6 : 0.7) * fade * (W.degrade ? 0.6 : 1);
      // the player's own 镜技 grounds move: the vortex turns, the net is thrown open, the 镇 breathes
      if (Z.side[i] === 1 && this.zoneLive(W, ctx, cam, i, Z.look[i], a, calm)) continue;
      P.drawZone(ctx, cam, Z.look[i] as never, Z.x[i], Z.y[i], Z.r[i], a);
    }
  }
  /** A player zone that moves (vortex, net, 镇); false: draw it plain. */
  private zoneLive(W: World, ctx: CanvasRenderingContext2D, cam: Camera, i: number, look: string, a: number, calm: boolean): boolean {
    if (look !== 'vortex' && look !== 'netMesh' && look !== 'zhenGlyph') return false;
    const s = this.sprite(this.fxId(look));
    if (!s) return false;
    const Z = W.Z, age = Z.age[i];
    let r = Z.r[i], ang = 0, al = a;
    if (look === 'vortex') ang = -age * (calm ? 0.4 : 2.2);
    else if (look === 'netMesh') {
      const e = Math.min(1, age / 0.24), k = 1 - (1 - e) * (1 - e) * (1 - e);
      if (!calm) { r *= 0.3 + 0.7 * k; ang = (1 - k) * 1.8; }
    } else if (!calm) al *= 0.8 + 0.2 * Math.sin(age * 5.5);
    blitRot(ctx, cam, s, Z.x[i], Z.y[i], ang, r / 32, Math.max(0, Math.min(1, al)));
    return true;
  }

  /** Spawn blooms and go stones. */
  private drawGround(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // blooms
    const E = W.E;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.st[i] !== ST.bloom) continue;
      const s = this.sprite('fx:spawnBloom');
      const k = 1 - Math.max(0, E.stT[i]);
      if (s) blit(ctx, cam, s, E.x[i], E.y[i], (E.r[i] / 32) * (0.6 + 0.8 * k), false, 0.5 + 0.4 * k);
      else circle(ctx, cam, E.x[i], E.y[i], E.r[i] * (0.4 + k), 'rgba(40,40,48,0.35)');
    }
    // stones
    const STN = W.ST;
    for (let i = 0; i < STN.n; i++) {
      if (!STN.alive[i]) continue;
      const s = this.sprite(STN.white[i] ? 'fx:stoneWhite' : 'fx:stoneBlack');
      const a = STN.arm[i] > 0 ? 0.5 : 1;
      if (s) blit(ctx, cam, s, STN.x[i], STN.y[i], 12 / 32, false, a); else circle(ctx, cam, STN.x[i], STN.y[i], 10, STN.white[i] ? '#f4f1e8' : '#161616', a);
    }
    // the ground the player's blows marked: scorches, burns, cracks drying away
    vfxOf(W).drawGround(ctx, cam);
  }

  private drawDrops(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // drops
    const D = W.D;
    const tt = W.t;
    const zip = W.feel.sprites.ok && !W.degrade && D.count < 160 ? W.feel.sprites.get(SH.streak, TN.moon) : null;
    const VS = vfxOf(W).sprites;
    // glows: the precious drops always (within the frame's budget), a streaming pearl while there is room
    let glows = Math.min(this.glowsLeft, vfxOf(W).caps.glows >> 2);
    // the drops are upright: glows and bodies are destination rects under one identity transform (a
    // streak's turn breaks the run: `ident`), the alpha set only when it changes (`al`); sprites by kind
    // and coin frame looked up once a frame
    const dsp = this.dropSpr;
    dsp.fill(undefined);
    let ident = false, al = 1;
    ctx.globalAlpha = 1;
    const calm = !!W.settings.reduceMotion, td = W.tDraw;
    this.streaming = 0;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      const id = DROP_ATLAS[k];
      const moon = DROP_MOON[k] === 1;
      // m8: a pearl streaming in is drawn after the enemies (drawStream), so it never vanishes under a body
      if (moon && D.magnet[i] && D.age[i] >= 0.25) { this.streaming++; continue; }
      if (glows > 0 && !moon) {
        const gt = DROP_GLOW[k];
        const gt2 = gt >= 0 ? gt : D.magnet[i] && D.age[i] >= 0.25 ? VT.moon : -1;
        const g = gt2 >= 0 ? VS.glow(gt2) : null;
        if (g) {
          glows--; this.glowsLeft--;
          const ga = gt >= 0 ? 0.55 : 0.4;
          if (!ident) { ctx.setTransform(1, 0, 0, 1, 0, 0); ident = true; }
          if (al !== ga) ctx.globalAlpha = al = ga;
          blitAt(ctx, cam, g, D.x[i], D.y[i], gt >= 0 ? 0.9 : 0.55);
        }
      }
      const v = id === 'drop:cashCoin' ? Math.floor(tt * 8 + i) & 3 : moon ? moonFrame(td, i, calm) : 0;
      const si = k * 4 + v;
      let s = dsp[si];
      if (s === undefined) s = dsp[si] = this.sprite(id, v);
      const bob = D.age[i] < 0.25 ? Math.sin((D.age[i] / 0.25) * Math.PI) * 10 : moon ? moonBob(td, i, calm, false) : 0;
      if (zip && D.magnet[i] && D.age[i] >= 0.25) {
        // 月华 streaming in leaves a thin moon-white streak
        const dx = W.px - D.x[i], dy = W.py - D.y[i];
        if (dx * dx + dy * dy > 900 && blitAff(ctx, cam, zip, D.x[i], D.y[i], Math.atan2(dy, dx), 0.55, 0.55, 0.55)) { ident = false; al = 1; }
      }
      if (al !== 1) ctx.globalAlpha = al = 1;
      if (s) {
        if (!ident) { ctx.setTransform(1, 0, 0, 1, 0, 0); ident = true; }
        blitAt(ctx, cam, s, D.x[i], D.y[i] - bob, D.worth[i] >= 5 && k === 0 ? 1.4 : 1);
      } else { circle(ctx, cam, D.x[i], D.y[i] - bob, k <= 1 ? 4 : 7, k >= 7 ? '#b8862b' : '#e8eef2'); ident = true; }
    }
    if (al !== 1) ctx.globalAlpha = 1;
  }

  /** Pearls streaming in counted by the last drawDrops (drawStream runs only when there are some). */
  private streaming = 0;
  /** m8 (art §5.2–5.3): the 月华 pearls streaming in, after the enemies: a comet tail (MOON_TAIL) while more
   *  than 30 u out, then the pearl (no bob, no twinkle while pulled). The draws move here; none are added. */
  private drawStream(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const D = W.D;
    const zip = W.feel.sprites.ok && !W.degrade && D.count < 160 ? W.feel.sprites.get(SH.streak, TN.moon) : null;
    const dsp = this.dropSpr;
    let ident = false;
    ctx.globalAlpha = 1;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      if (DROP_MOON[k] !== 1 || !D.magnet[i] || D.age[i] < 0.25) continue;
      if (zip) {
        const dx = W.px - D.x[i], dy = W.py - D.y[i];
        if (dx * dx + dy * dy > 900 && blitAff(ctx, cam, zip, D.x[i], D.y[i], Math.atan2(dy, dx), MOON_TAIL[0], MOON_TAIL[1], MOON_TAIL[2])) ident = false;
      }
      const si = k * 4;
      let s = dsp[si];
      if (s === undefined) s = dsp[si] = this.sprite(DROP_ATLAS[k], 0);
      if (s) {
        if (!ident) { ctx.setTransform(1, 0, 0, 1, 0, 0); ident = true; }
        blitAt(ctx, cam, s, D.x[i], D.y[i], D.worth[i] >= 5 && k === 0 ? 1.4 : 1);
      } else { circle(ctx, cam, D.x[i], D.y[i], 4, '#e8eef2'); ident = true; }
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemies(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // enemies; 打击感: the ground's splashes under them, the marks of the blows over them (the dead
    // bodies' pieces fly in the effects layer, over the blows' light)
    const E = W.E, F = W.feel;
    if (F.mk.count) this.drawMarks(W, ctx, cam, true);
    this.passes = 0;
    F.sprites.frame();
    if (this.shardGen.length < E.cap) this.shardGen = new Uint32Array(E.cap).fill(0xffffffff);
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.hidden[i]) {
        if (E.alive[i] && E.hidden[i] && E.st[i] !== ST.bloom && (E.id[i] === 'rat' || E.id[i] === 'drowned')) {
          const s = this.sprite('fx:rippleRing');
          if (s) blit(ctx, cam, s, E.x[i], E.y[i], 0.5, false, 0.5);
        }
        continue;
      }
      this.drawEnemy(W, ctx, cam, i);
    }
    if (F.mk.count) this.drawMarks(W, ctx, cam, false);
  }

  private drawSummons(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // summons (the render clock: the trail's speed divides the drawn positions' move by the time between
    // the pictures they were drawn in)
    const tt = drawClock(W);
    const S = W.S;
    // 流光: a diving crane leaves its path in paper-white light, a charging 墨宝 a wet ink wake
    const TR = this.trails;
    if (this.sumX.length < S.cap) { this.sumX = new Float32Array(S.cap); this.sumY = new Float32Array(S.cap); this.sumT = new Float32Array(S.cap).fill(-9); }
    const calm = !!W.settings.reduceMotion;
    const lim = W.degrade ? TR.cap >> 1 : TR.cap;
    for (let i = 0; i < S.n; i++) {
      if (!S.alive[i]) continue;
      const kind = S.kind[i];
      if (kind === SK.flowerSprout || kind === SK.yantai || kind === SK.mozhu) continue;
      const bob = kind === SK.zhihe || kind === SK.mohe ? Math.sin(tt * 4 + i) * 3 : 0;
      const x = S.x[i], y = S.y[i] + bob;
      const dtl = tt - this.sumT[i];
      if (dtl > 1e-4 && dtl < 0.2) {
        const dx = x - this.sumX[i], dy = y - this.sumY[i], sp = Math.hypot(dx, dy) / dtl;
        if (sp > 280 && sp < 4000) {
          const paper = kind === SK.zhihe;
          TR.feed(TG.summon, i, x, y, tt, paper ? 9 : S.dragon[i] ? 12 : 9, (paper ? 0.24 : 0.16) * (calm ? 0.5 : 1), paper ? VT.moon : VT.ink, paper ? TSY.light : TSY.ink, lim - 2, 70);
        }
      } else if (dtl < 0 || dtl >= 0.2) TR.cut(TG.summon, i);
      this.sumX[i] = x; this.sumY[i] = y; this.sumT[i] = tt;
    }
    TR.draw(ctx, cam, tt, TG.summon, this.passesOf(W));
    for (let i = 0; i < S.n; i++) {
      if (!S.alive[i]) continue;
      const kind = S.kind[i];
      const id = S.dragon[i] ? SUMMON_ATLAS[SK.molong] : SUMMON_ATLAS[kind];
      const flash = S.flash[i] > 0;
      const s = flash ? this.painter.flash(id) : this.sprite(id);
      const fade = S.life[i] < 0.6 ? S.life[i] / 0.6 : 1;
      const bob = kind === SK.zhihe || kind === SK.mohe ? Math.sin(tt * 4 + i) * 3 : 0;
      if (s) blit(ctx, cam, s, S.x[i], S.y[i] + bob, S.dragon[i] ? 1.4 : 1, Math.cos(S.face[i]) < 0, fade);
      else circle(ctx, cam, S.x[i], S.y[i], S.r[i], kind === SK.flowerSprout ? '#d98c9a' : '#3a4a6a', fade);
    }
  }

  /** Ribbon passes this frame: 3 (halo, body, core) on mid and high, 2 on low and under the frame guard. */
  private passesOf(W: World): number {
    return W.degrade || W.quality === 'low' ? 2 : 3;
  }

  /** Once per frame: the VFX pools follow the world, the budgets refill, pickups ping. */
  private beginVfx(W: World): void {
    const V = vfxOf(W);
    V.sync();
    V.frameStart();
    this.trails.begin(W.quality, W.t);
    this.glowsLeft = W.degrade ? 0 : V.caps.glows;
    const n = Math.min(16, W.slots.length);
    for (let k = 0; k < n; k++) {
      this.slotTint[k] = tintOfWeapon(W.slots[k].id, W.slots[k].fc);
    }
    // 月华 reaching you: a small ping of moonlight (at most 6 a second)
    if (W.xpGot < this.seenXp - 1e-6) { this.seenXp = 0; this.lastPing = -9; }
    if (W.xpGot > this.seenXp + 1e-6) {
      this.seenXp = W.xpGot;
      if (W.phase === 'wave' && (W.t - this.lastPing >= 1 / 6 || W.t < this.lastPing)) {
        this.lastPing = W.t;
        V.ring(W.px, W.py, MOON_PING.r, VT.moon, MOON_PING.life, VF.thin);
        // and glints of it rising off you (sparkle): m8, three
        V.motes(W.px, W.py - 12, MOON_PING.moteR, MOON_PING.motes, VT.moon, MOON_PING.moteLife);
      }
    }
  }

  /**
   * A legacy ring or line fx becomes the VFX layer's crisp vectors, once, on first sight (the fx entry
   * is released). Shockwaves not emitted by the player's side (a boss's slam, an elite's roar) are ink;
   * the level-up at your feet is the gold one. Returns whether it was taken over.
   */
  private upgrade(W: World, V: Vfx, i: number, name: string): boolean {
    const FX = W.P;
    const x = FX.x[i], y = FX.y[i], r = FX.r[i], life = FX.life0[i];
    const age = Math.max(0, FX.life0[i] - FX.life[i]);
    let j = -1;
    switch (name) {
      case 'shockRing': j = V.shock(x, y, r, VT.ink, { life: Math.max(0.28, life), debris: Math.min(6, 2 + Math.round(r / 45)), prio: 0 }); if (j >= 0) V.rings.t0[j] -= age; return true;
      case 'pulseRing': j = V.ring(x, y, r, VT.ink, Math.max(0.3, life), VF.thin | VF.double); if (j >= 0) V.rings.t0[j] -= age; return true;
      case 'levelRing':
        // the core's mid-wave level (r 120 at your feet; you may have moved a step or two since)
        if (r === 120 && Math.abs(x - W.px) < 60 && Math.abs(y - W.py) < 60) { this.levelUp(W, V, W.px, W.py); return true; }
        j = V.ring(x, y, r, VT.ink, Math.max(0.3, life), VF.thin | VF.double); if (j >= 0) V.rings.t0[j] -= age;
        return true;
      case 'slashArc': {
        if (FX.len[i] > 0) return false;
        const d = FX.dir[i];
        j = V.slash(x - Math.cos(d) * r * 0.6, y - Math.sin(d) * r * 0.6, d, r * 1.1, 100, VT.ink, 0, Math.max(0.2, life), 0);
        if (j >= 0) V.slashes.t0[j] -= age;
        return true;
      }
      case 'boltChain': {
        if (FX.len[i] <= 0) return false;
        const d = FX.dir[i], L = FX.len[i];
        j = V.bolt(x, y, x + Math.cos(d) * L, y + Math.sin(d) * L, VT.gold, Math.max(0.14, life), Math.max(0.6, FX.r[i]));
        if (j >= 0) V.bolts.t0[j] -= age;
        return true;
      }
      case 'critSpark': j = V.bloom(x, y, r, VT.gold, Math.max(0.2, life)); if (j >= 0) V.blooms.t0[j] -= age; return true;
    }
    return false;
  }
  /** A mid-wave level: a gold double ring with a bright edge, a column of light, rising glints. */
  private levelUp(_W: World, V: Vfx, x: number, y: number): void {
    // (the feel layer adds its gold burst at your feet: this is the light around it — no ink chips):
    // a wide gold double ring with a halo, a moon-white ring after it, a tall column of light behind
    // the figure, a soft gold bloom at the feet and glints rising all round
    V.shock(x, y, 200, VT.gold, { flags: VF.double | VF.halo | VF.big, debris: 10, fleck: FK.glint, life: 0.6, prio: 2 });
    const j = V.ring(x, y, 130, VT.gold, 0.5, VF.double);
    if (j >= 0) V.rings.t0[j] += 0.1;
    V.bloom(x, y + 6, 170, VT.gold, 0.75, BK.column, 1, 2);
    V.motes(x, y, 60, 16, VT.gold, 0.95);
  }

  private drawEffects(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // effects (kill bursts, rings, slashes, sparks) go under both kinds of shot: the vermilion
    // enemy shots that decide whether you get hit stay the brightest thing on screen (API.md §3)
    const FX = W.P;
    const V = vfxOf(W);
    const pa = W.degrade ? 0.6 : 1;
    for (let i = 0; i < FX.n; i++) {
      if (!FX.alive[i]) continue;
      const name = FX.kind[i];
      // rings, slashes and lightning are crisp vectors now (the VFX layer)
      if ((name === 'shockRing' || name === 'pulseRing' || name === 'levelRing' || name === 'slashArc' || name === 'boltChain' || name === 'critSpark') && this.upgrade(W, V, i, name)) { FX.release(i); continue; }
      const k = FX.life[i] / FX.life0[i];
      const s = this.sprite(this.fxId(name));
      if (!s) continue;
      if (FX.len[i] > 0) blitRot(ctx, cam, s, FX.x[i], FX.y[i], FX.dir[i], FX.r[i], k * pa, FX.len[i] / (FX_BASE[name] ?? 32) / Math.max(0.2, FX.r[i]));
      else if (name === 'rippleRing' || name === 'coinRipple') blit(ctx, cam, s, FX.x[i], FX.y[i], (FX.r[i] / 32) * (0.4 + 0.6 * (1 - k)), false, k * pa);
      else blit(ctx, cam, s, FX.x[i], FX.y[i], FX.r[i] / 32, false, Math.min(1, k * 1.5) * pa);
    }
    // 流光: shockwaves, crescent slashes, lances, lightning, beams, blooms and flecks (engine/vfx.ts)
    V.draw(ctx, cam, W.feel.sprites.ok ? W.feel.sprites : null, this.spr);
    // 打击感: spatter, rings, flares, crowns (under both kinds of shot)
    this.drawSparks(W, ctx, cam, pa);
    // the dead bodies' pieces fly over the blows' light (a slash or a flash never buries them)
    if (W.feel.fr.count) this.drawFrags(W, ctx, cam);
  }

  private drawPlayerShots(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // player shots: a ribbon of light behind each (流光), a soft glow under it, then the shot itself.
    // Ribbons age on the render clock (W.tDraw, the time of the drawn positions they record: the tail
    // moves on every frame, as the head does); spins and the flicker on the effects clock (t at 60 Hz)
    const tt = W.t + fxDelta(W), td = drawClock(W), pa = W.degrade ? 0.6 : 1;
    const PS = W.PS;
    const TR = this.trails;
    const VS = vfxOf(W).sprites;
    const calm = !!W.settings.reduceMotion;
    if (this.shotLife.length < PS.cap) { this.shotLife = new Float32Array(PS.cap); this.shotKind = new Int16Array(PS.cap).fill(-1); this.shotMode = new Uint8Array(PS.cap); }
    const lim = Math.max(1, (W.degrade ? TR.cap >> 1 : TR.cap) - 3);
    const nsl = W.slots.length;
    const hot = VS.glow(VT.white);
    // the simulation steps since the last look (a hitstop or a held frame: none, so motes never pile up);
    // a shot sheds when its turn (one step in eight) came in them, on the budget of that many steps
    const ns = Math.max(0, Math.min(4, Math.round((W.t - this.shedT) / (1 / 60))));
    let sheds = W.degrade || calm || W.phase !== 'wave' || !ns ? 0 : vfxOf(W).caps.sheds * ns;
    const n0 = this.shedN;
    this.shedN = (this.shedN + ns) >>> 0;
    this.shedT = W.t;
    for (let i = 0; i < PS.n; i++) {
      if (!PS.alive[i]) { this.shotKind[i] = -1; continue; }
      const k = PS.kind[i], mode = PS.mode[i];
      // a reused slot is a new shot: its old ribbon fades on its own (a sword turning home keeps its own)
      const lm = this.shotMode[i];
      const fresh = this.shotKind[i] !== k || (mode === lm && PS.life[i] > this.shotLife[i] + 0.02)
        || (mode !== lm && (lm === SMode.SwordBack || lm === SMode.BoomBack || lm === SMode.HookBack));
      if (fresh) TR.cut(TG.shot, i);
      this.shotKind[i] = k; this.shotMode[i] = mode; this.shotLife[i] = PS.life[i];
      const sty = TR_STY[k];
      if (!sty || (mode === SMode.Lob && PS.life[i] > PS.life0[i] - 0.03)) continue;
      const y = mode === SMode.Lob ? PS.y[i] - Math.sin((1 - PS.life[i] / PS.life0[i]) * Math.PI) * 60 : PS.y[i];
      const sl = PS.slot[i];
      const tint = sl >= 0 && sl < nsl && sl < 16 ? this.slotTint[sl] : KIND_TINT[k];
      const svx = PS.vx[i], svy = PS.vy[i], sp = Math.sqrt(svx * svx + svy * svy);
      TR.feed(TG.shot, i, PS.x[i], y, td, TR_W[k], TR_DUR[k] * (calm ? 0.5 : 1), tint, sty === 2 ? TSY.ink : TSY.light, lim, Math.max(34, sp * 0.09 + 24));
    }
    TR.draw(ctx, cam, td, TG.shot, this.passesOf(W), pa);
    const psp = this.projSpr;
    psp.fill(undefined);
    // each shot is drawn in its own turned frame: the transform is its rotation alone at cam.scale (rA: the
    // angle set, NaN when something else set the transform), and its glow, body and head are destination
    // rects in that frame. One setTransform per shot at most, none along a run of shots turning together
    // (a boomerang's or a lob's spin is the clock's: they share the angle). The body's matrix is blitRot's;
    // the glow and the head are round (radial, anchored at their centre), so turning them changes nothing.
    // The alpha is set only when it changes (al); a shot wholly off the canvas makes no call.
    let rA = NaN, rc = 1, rn = 0, al = 1;
    const k0 = cam.scale, hw = cam.w / 2, hh = cam.h / 2;
    ctx.globalAlpha = 1;
    for (let i = 0; i < PS.n; i++) {
      if (!PS.alive[i]) continue;
      const k = PS.kind[i];
      let s = psp[k];
      if (s === undefined) s = psp[k] = this.sprite(PROJ_ATLAS[k]);
      let ang = Math.atan2(PS.vy[i], PS.vx[i]);
      let sz = TR_SZ[k];
      let y = PS.y[i];
      if (PS.mode[i] === SMode.Lob) {
        const u = 1 - PS.life[i] / PS.life0[i];
        y -= Math.sin(u * Math.PI) * 60;
        ang = tt * 9;
        sz = 1 + Math.sin(u * Math.PI) * 0.3;
      } else if (PS.mode[i] === SMode.BoomOut || PS.mode[i] === SMode.BoomBack) ang = tt * 16;
      const px = (PS.x[i] - cam.x) * k0 + hw, py = (y - cam.y) * k0 + hh;
      // the glow under it: a white-hot heart in the weapon's light
      const sl = PS.slot[i];
      const tint = sl >= 0 && sl < nsl && sl < 16 ? this.slotTint[sl] : KIND_TINT[k];
      if (this.glowsLeft > 0 && TR_GLOW[k] > 0) {
        const g = VS.glow(tint);
        if (g) {
          this.glowsLeft--;
          // (capped: a falling 七星 sword's r is its landing's reach, not its size)
          const gs = Math.min(GLOW_MAX_R, Math.max(6, PS.r[i]) * TR_GLOW[k]) / 16;
          if (!offCanvas(cam, px, py, reach(g, k0 * gs))) {
            if (ang !== rA) { rc = Math.cos(ang); rn = Math.sin(ang); rA = ang; ctx.setTransform(rc * k0, rn * k0, -rn * k0, rc * k0, 0, 0); }
            const qx = (rc * px + rn * py) / k0, qy = (rc * py - rn * px) / k0;
            const ga = 0.6 * pa;
            if (al !== ga) ctx.globalAlpha = al = ga;
            ctx.drawImage(g.img, g.sx, g.sy, g.sw, g.sh, qx - g.ax * g.w * gs, qy - g.ay * g.h * gs, g.w * gs, g.h * gs);
          }
        }
      }
      if (s) {
        if (!offCanvas(cam, px, py, reach(s, k0 * sz))) {
          if (ang !== rA) { rc = Math.cos(ang); rn = Math.sin(ang); rA = ang; ctx.setTransform(rc * k0, rn * k0, -rn * k0, rc * k0, 0, 0); }
          // the shot's screen point, back in the turned frame
          const qx = (rc * px + rn * py) / k0, qy = (rc * py - rn * px) / k0;
          if (al !== pa) ctx.globalAlpha = al = pa;
          ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, qx - s.ax * s.w * sz, qy - s.ay * s.h * sz, s.w * sz, s.h * sz);
        }
      } else {
        if (al !== 1) ctx.globalAlpha = al = 1;
        circle(ctx, cam, PS.x[i], y, PS.r[i] * 0.7, '#3f6f8f', pa);
        rA = NaN;
      }
      // its head burns white: a small hot point of light over the tip (light shots only)
      if (TR_HEAD[k] >= 0 && TR_STY[k] === 1 && this.glowsLeft > 0 && hot) {
        this.glowsLeft--;
        const hx = PS.x[i] + Math.cos(ang) * TR_HEAD[k] * sz, hy = y + Math.sin(ang) * TR_HEAD[k] * sz;
        const flick = calm ? 1 : 0.9 + 0.1 * Math.sin(tt * 40 + i);
        const hs = (Math.min(10, Math.max(4, PS.r[i] * 0.8)) / 16) * flick;
        const hpx = (hx - cam.x) * k0 + hw, hpy = (hy - cam.y) * k0 + hh;
        if (!offCanvas(cam, hpx, hpy, reach(hot, k0 * hs))) {
          if (ang !== rA) { rc = Math.cos(ang); rn = Math.sin(ang); rA = ang; ctx.setTransform(rc * k0, rn * k0, -rn * k0, rc * k0, 0, 0); }
          const qx = (rc * hpx + rn * hpy) / k0, qy = (rc * hpy - rn * hpx) / k0;
          const ha = 0.85 * pa;
          if (al !== ha) ctx.globalAlpha = al = ha;
          ctx.drawImage(hot.img, hot.sx, hot.sy, hot.sw, hot.sh, qx - hot.ax * hot.w * hs, qy - hot.ay * hot.h * hs, hot.w * hs, hot.h * hs);
        }
      }
      // 流光 sheds a few motes of its light in its wake (budgeted per frame; none on low or calm)
      if (sheds > 0 && TR_STY[k] === 1 && PS.mode[i] !== SMode.Lob && ((8 - ((n0 + i) & 7)) & 7) < ns) {
        sheds--;
        const V = vfxOf(W);
        const vx = PS.vx[i], vy = PS.vy[i], L = Math.sqrt(vx * vx + vy * vy) || 1;
        V.fleck(PS.x[i] - (vx / L) * 14, y - (vy / L) * 14, -vx * 0.06 + (V.rnd01() - 0.5) * 50, -vy * 0.06 + (V.rnd01() - 0.5) * 50, FK.glint, tint, 0.3, 0.6);
      }
    }
    if (al !== 1) ctx.globalAlpha = 1;
  }

  private drawNumbers(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const P = this.painter, lang = W.settings.lang;
    // numbers pop (overshoot to 1.15×, settle; crits 1.4× with a bounce), size by damage (≤ 1.2×; crits a
    // size up), fly an arc, then fade — under the enemy shots, so a crit never hides the danger
    const N = W.N;
    const dn = P.drawNumber as DrawNum;
    const calm = W.settings.reduceMotion;
    for (let i = 0; i < N.n; i++) {
      if (!N.alive[i]) continue;
      const t = N.t[i];
      const a = t < 0.58 ? 1 : Math.max(0, 1 - (t - 0.58) / 0.2);
      // 打击感: a crit pops bigger (1.4×) with a short bounce and stays a size up (feel.numPop)
      const crit = N.style[i] === 1;
      const pop = numPop(t, crit, calm);
      const sc = pop * (crit ? CRIT_NUM : 1) * (N.sz[i] || 1) * (t > 0.58 ? 0.85 + 0.15 * a : 1);
      const sx = (N.x[i] - cam.x) * cam.scale + cam.w / 2, sy = (N.y[i] - cam.y) * cam.scale + cam.h / 2;
      dn.call(P, ctx, N.v[i], sx, sy, NUM_STYLE[N.style[i]] ?? 'hit', a, lang, sc);
    }
  }

  private drawEnemyShots(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // enemy shots: 1.5× the player's, the brightest thing on screen
    const ES = W.ES;
    for (let i = 0; i < ES.n; i++) {
      if (!ES.alive[i]) continue;
      const s = this.sprite(PROJ_ATLAS[ES.kind[i]]);
      let y = ES.y[i];
      if (ES.mode[i] === SMode.Lob) {
        const k = 1 - ES.life[i] / ES.life0[i];
        y -= Math.sin(k * Math.PI) * 80;
      }
      if (s) blitRot(ctx, cam, s, ES.x[i], y, Math.atan2(ES.vy[i], ES.vx[i]), 1.5);
      else { circle(ctx, cam, ES.x[i], y, ES.r[i], '#c0412f'); circle(ctx, cam, ES.x[i], y, ES.r[i] * 0.55, '#fff'); }
    }
  }

  private drawReticle(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // skill reticle
    if (W.skillPreview) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (W.skillPreview.x - cam.x) * cam.scale + cam.w / 2, sy = (W.skillPreview.y - cam.y) * cam.scale + cam.h / 2;
      // your aim is gold (vermilion is the enemy's danger), with an ink hairline inside for definition
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(212,147,12,0.85)';
      ctx.lineWidth = 2 * cam.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 26 * cam.dpr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(27,25,22,0.5)';
      ctx.lineWidth = cam.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 28 * cam.dpr, 0, TAU); ctx.stroke();
    }
  }

  private fxId(name: string): AtlasId {
    let id = this.atlasCache.get(name);
    if (!id) { id = (name.includes(':') ? name : `fx:${name}`) as AtlasId; this.atlasCache.set(name, id); }
    return id;
  }

  private drawEnemy(W: World, ctx: CanvasRenderingContext2D, cam: Camera, i: number): void {
    const E = W.E, F = W.feel;
    const id = E.atlas[i];
    const k = E.kind[i];
    const tell = E.st[i] === ST.tell;
    const v = k === EKind.Boss ? Math.floor(W.t * 2 + i) & 1 : tell ? 2 : (Math.floor(W.t * 5 + i * 0.37) & 1);
    // 打击感: the body shows the blow (feel.pose): drawn where the freeze holds it or the recoil throws
    // it, squashed along the blow, a white flash in an ink rim that fades into an ink tint, a wobble
    F.pose(i);
    const o = F.po;
    const s = id ? this.sprite(id, v) : null;
    const twin = id && o.fl ? this.painter.flash(id, v) : null;
    const flip = Math.cos(E.face[i]) < 0;
    const scale = E.r[i] / Math.max(1, E.r0[i]);
    const air = E.air[i] ? 10 : 0;
    const a = E.untarget[i] ? 0.45 : k === EKind.Ally || E.charmT[i] > 0 ? 0.85 : 1;
    const bx = 1 + (E.st[i] === ST.act ? 0.08 : 0), by = 1 - (tell ? 0.08 : 0);
    const x = o.x, y = o.y - air;
    F.dX[i] = x; F.dY[i] = y;
    if (s) {
      blitBody(ctx, cam, o.fl === 1 && twin ? twin : s, x, y, scale, flip, a, bx, by, o.s, o.ang, o.wob);
      // one extra pass at most per body, and a frame budget for them (a crowd under a fast weapon)
      if (this.passes < (BODY_PASSES[W.quality] ?? 20) * (W.degrade ? 0.5 : 1)) {
        if (o.fl === 2 && twin && twin !== s && o.fa > 0.02) {
          this.passes++;
          blitBody(ctx, cam, twin, x, y, scale, flip, a * o.fa, bx, by, o.s, o.ang, o.wob);
        } else if (o.ink > 0.02) {
          const ink = F.sprites.ink(s);
          if (ink) { this.passes++; blitBody(ctx, cam, ink, x, y, scale, flip, a * o.ink, bx, by, o.s, o.ang, o.wob); }
        }
      }
      // its death shards, baked on first sight (≤ 2 bakes a frame, shared with the ink twins)
      if (this.shardGen[i] !== E.gen[i] && F.sprites.ok) {
        const s0 = this.sprite(id!, 0);
        if (!s0 || F.sprites.shards(s0, fragGrid(k, W.quality), this.painter.flash(id!, 0), id!) !== undefined) this.shardGen[i] = E.gen[i];
      }
    } else circle(ctx, cam, x, y, E.r[i] * (1 - o.s * 0.15), o.fl ? '#ffffff' : k === EKind.Elite ? '#5a4012' : k === EKind.Boss ? '#12141a' : k === EKind.Treasure ? '#d9a62e' : '#1d2430', a);
    // 伐桂人's three axes orbit it
    if (E.id[i] === 'axeshade') {
      const ax = this.sprite('proj:eAxe');
      for (let k = 0; k < 3; k++) {
        const a = E.age[i] * TAU * 0.8 + (k / 3) * TAU;
        const x = E.x[i] + Math.cos(a) * 70, y = E.y[i] + Math.sin(a) * 70;
        if (ax) blitRot(ctx, cam, ax, x, y, a * 3, 1.2); else circle(ctx, cam, x, y, 8, '#c0412f');
      }
    }
    // marks: allies, statuses (they ride the drawn body)
    const mx = o.x, my = o.y;
    if (k === EKind.Ally || E.charmT[i] > 0) this.mark(ctx, cam, k === EKind.Ally ? 'sum:inkAlly' : 'fx:charmMark', mx, my - E.r[i] - 6, k === EKind.Ally ? scale : 0.35);
    else if (E.stunT[i] > 0) this.mark(ctx, cam, 'fx:stunMark', mx, my - E.r[i] - 6, 0.35);
    else if (E.burnN[i] > 0) this.mark(ctx, cam, 'fx:burnMark', mx, my - 4, 0.35);
    else if (E.rootT[i] > 0) this.mark(ctx, cam, 'fx:rootMark', mx, my + E.r[i] * 0.6, 0.4);
    else if (E.slowT[i] > 0) this.mark(ctx, cam, 'fx:slowMark', mx, my + E.r[i] * 0.6, 0.35);
    // its HP bar over its head (engine/bars.ts; drawn in the 'enemyBars' layer, all in a few fill runs)
    this.bars.enemy(W, cam, i, s, x, y, scale);
  }

  /**
   * 打击感: the marks of the blows (feel.mk): impact stars, cuts across the bodies, pierce beams, rings of
   * light, claw rakes — over the bodies, following each one's drawn pose — or the ground's splashes
   * under them (`ground`). One drawImage each from the feel layer's baked sprites.
   */
  private drawMarks(W: World, ctx: CanvasRenderingContext2D, cam: Camera, ground: boolean): void {
    const F = W.feel, M = F.mk, S = F.sprites, E = W.E;
    if (!S.ok) return;
    const pa = W.degrade ? 0.7 : 1;
    for (let j = 0; j < M.n; j++) {
      if (!M.alive[j]) continue;
      const kd = M.kind[j];
      if ((kd === MK.ground) !== ground) continue;
      const s = S.get(M.shape[j], M.tint[j]);
      if (!s) continue;
      const u = Math.min(1, Math.max(0, 1 - M.life[j] / M.life0[j]));
      const e = 1 - (1 - u) * (1 - u);
      const calm = M.calm[j] === 1;
      let x = M.x[j], y = M.y[j];
      const ow = M.owner[j];
      if (ow >= 0 && E.alive[ow] && E.gen[ow] === M.gen[j]) { x = F.dX[ow] + M.ox[j]; y = F.dY[ow] + M.oy[j]; }
      let kx: number, ky: number, al: number;
      if (kd === MK.pop) {
        // a star blooms fast, holds, then fades
        kx = ky = calm ? M.s1[j] : M.s0[j] + (M.s1[j] - M.s0[j]) * Math.min(1, e * 1.7);
        al = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65;
      } else if (kd === MK.cut) {
        // the cut opens along its length and thins away
        kx = M.s0[j] * (calm ? 1 : 0.75 + 0.35 * e); ky = M.s1[j] * (1 - 0.8 * u);
        al = u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6;
      } else if (kd === MK.beam) {
        kx = M.s0[j] * (calm ? 1 : 0.55 + 0.6 * e); ky = M.s1[j] * (1 - 0.7 * u);
        al = 1 - u * u;
      } else if (kd === MK.ring) {
        kx = ky = calm ? M.s1[j] : M.s0[j] + (M.s1[j] - M.s0[j]) * e;
        al = 1 - u;
      } else if (kd === MK.ground) {
        // it lands (a quick spread), then dries away
        kx = ky = calm ? M.s1[j] : M.s0[j] + (M.s1[j] - M.s0[j]) * Math.min(1, u * 5);
        al = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
      } else {
        kx = M.s1[j]; ky = M.s1[j] * (1 - 0.4 * u);
        al = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
      }
      blitAff(ctx, cam, s, x, y, M.ang[j], kx, ky, al * M.a0[j] * pa);
    }
  }

  /**
   * 打击感: the dead body's pieces (feel.fr) — its own sprite broken into irregular shards with a
   * white-hot rim along each break (FeelSprites.shards), white for their first frames; plain grid cuts
   * of the sprite until a body's shards are baked.
   */
  private drawFrags(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const Fr = W.feel.fr, FS = W.feel.sprites;
    const calm = !!W.settings.reduceMotion;
    for (let j = 0; j < Fr.n; j++) {
      if (!Fr.alive[j]) continue;
      const id = Fr.id[j];
      if (!id) continue;
      const white = fragWhite(Fr.life0[j] - Fr.life[j], calm);
      const u = Math.min(1, Math.max(0, 1 - Fr.life[j] / Fr.life0[j]));
      const al = u < 0.6 ? 1 : (1 - u) / 0.4;
      if (al <= 0.02) continue;
      const g = Fr.g[j] || 2, q = Fr.q[j];
      const f = Fr.flip[j] ? -1 : 1;
      const sc = Fr.sc[j];
      const plain = this.sprite(id, 0);
      const sh = plain && FS.ok ? FS.shardsOf(plain, g) : null;
      if (sh && q < g * g) {
        const R = sh.r, o = q * 8, up = sh.upx;
        const px = (Fr.x[j] + R[o + 4] * f * sc - cam.x) * cam.scale + cam.w / 2, py = (Fr.y[j] + R[o + 5] * sc - cam.y) * cam.scale + cam.h / 2;
        const k = cam.scale * sc * (1 - 0.3 * u), c = Math.cos(Fr.rot[j]) * k, n = Math.sin(Fr.rot[j]) * k;
        ctx.setTransform(c * f, n * f, -n, c, px, py);
        ctx.globalAlpha = al;
        ctx.drawImage(sh.img, R[o], R[o + 1] + (white && sh.wy ? sh.wy : 0), R[o + 2], R[o + 3], R[o + 6], R[o + 7], R[o + 2] * up, R[o + 3] * up);
        continue;
      }
      const s = (white ? this.painter.flash(id, 0) : null) ?? plain;
      if (!s) continue;
      const qx = q % g, qy = (q / g) | 0;
      const cw = s.w / g, ch = s.h / g;
      // the piece's place in the body (u from the anchor), mirrored with it
      let ox = (qx + 0.5) * cw - s.ax * s.w;
      const oy = (qy + 0.5) * ch - s.ay * s.h;
      ox *= f;
      const px = (Fr.x[j] + ox * sc - cam.x) * cam.scale + cam.w / 2, py = (Fr.y[j] + oy * sc - cam.y) * cam.scale + cam.h / 2;
      const k = cam.scale * sc * (1 - 0.3 * u), c = Math.cos(Fr.rot[j]) * k, n = Math.sin(Fr.rot[j]) * k;
      ctx.setTransform(c * f, n * f, -n, c, px, py);
      ctx.globalAlpha = al;
      ctx.drawImage(s.img, s.sx + (qx * s.sw) / g, s.sy + (qy * s.sh) / g, s.sw / g, s.sh / g, -cw / 2, -ch / 2, cw, ch);
    }
    ctx.globalAlpha = 1;
  }

  /** The feel layer's sparks, each a drawImage from a baked sprite. */
  private drawSparks(W: World, ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const F = W.feel, P = F.sp, S = F.sprites;
    if (!S.ok || !P.count) return;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      const k = P.life[i] / P.life0[i];
      const fl = P.flags[i];
      // the melee swing is the VFX layer's crescent now (engine/vfx.ts slash); the old swipe stays unseen
      if (fl & PF.swipe) continue;
      let alpha: number, kx: number, ky: number, ang = P.rot[i];
      if (fl & PF.ease) {
        const e = 1 - k * k;
        const sz = P.s0[i] + (P.s1[i] - P.s0[i]) * e;
        alpha = P.a0[i] * k;
        kx = sz; ky = sz;
      } else {
        const sz = P.s1[i] + (P.s0[i] - P.s1[i]) * k;
        alpha = P.a0[i] * Math.min(1, k * 2.2);
        kx = sz; ky = sz;
        if (fl & PF.stretch) {
          const pvx = P.vx[i], pvy = P.vy[i], sp = Math.sqrt(pvx * pvx + pvy * pvy);
          ang = Math.atan2(P.vy[i], P.vx[i]);
          kx = sz * (1 + Math.min(2.2, sp / 240));
        }
      }
      const s = S.get(P.shape[i], P.tint[i]);
      if (s) blitAff(ctx, cam, s, P.x[i], P.y[i], ang, kx, ky, alpha * pa);
    }
  }

  private mark(ctx: CanvasRenderingContext2D, cam: Camera, id: AtlasId, x: number, y: number, size: number): void {
    const s = this.sprite(id);
    if (s) blit(ctx, cam, s, x, y, size, false, 0.9);
  }

  private drawSwords(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sword = this.sprite('proj:flySword');
    const TR = this.trails;
    const VS = vfxOf(W).sprites;
    const calm = !!W.settings.reduceMotion;
    const passes = this.passesOf(W);
    let arcs = (ARC_CAP[W.quality] ?? 16) >> (W.degrade ? 1 : 0);
    let drawn = 0;
    // the orbits turn on the render clock (W.tDraw): a blade 90–240 u out moves 9–25 u a step, so on the
    // simulation clock it stood still on every other frame of a 120 Hz screen and then jumped
    const td = W.tDraw;
    // 剑匣 blades: each trails an arc of light along its orbit (流光), a soft glow at its heart; drawn
    // where they cut (the radius the blades hit at: weapons.ts tickSwords, with 龙渊剑's reach)
    for (const sl of W.slots) {
      if (sl.kind !== 'orbit' || sl.swords <= 0) continue;
      const R = sl.flareT > 0 ? ((sl.def.p.flareR as number) ?? 240) : weaponRange(sl.def, sl.stats, W.reachPct);
      const revS = (sl.def.p.rev as number) ?? 1;
      const rev = td * TAU * revS;
      const tint = this.slotTint[Math.min(15, sl.i)] ?? VT.jade;
      const g = this.glowsLeft > 0 ? VS.glow(tint) : null;
      let bladeGlows = Math.min(this.glowsLeft, vfxOf(W).caps.glows >> 2);
      for (let k = 0; k < sl.swords && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
        const a = rev + (k / sl.swords) * TAU;
        const x = W.px + Math.cos(a) * R, y = W.py + Math.sin(a) * R;
        if (arcs > 0) { arcs--; TR.arc(ctx, cam, W.px, W.py, R, a, (calm ? 0.28 : 0.62) * Math.min(1.4, revS), 1, 5.5, tint, passes, 0.9); }
        if (g && bladeGlows > 0) { bladeGlows--; this.glowsLeft--; blit(ctx, cam, g, x, y, 1.1, false, 0.45); }
        if (sword) blitRot(ctx, cam, sword, x, y, a + Math.PI / 2, 1.2); else circle(ctx, cam, x, y, 5, '#3f6f8f');
      }
    }
    // 残剑
    const can = this.sprite('sum:canjian');
    for (let k = 0; k < W.canjian && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
      const a = td * TAU * 1.3 + (k / W.canjian) * TAU;
      const x = W.px + Math.cos(a) * 60, y = W.py + Math.sin(a) * 60;
      if (arcs > 0) { arcs--; TR.arc(ctx, cam, W.px, W.py, 60, a, calm ? 0.3 : 0.7, 1, 3.5, VT.moon, passes, 0.75); }
      if (can) blitRot(ctx, cam, can, x, y, a + Math.PI / 2, 0.8); else circle(ctx, cam, x, y, 4, '#556');
    }
    // idle swords (the 桃木剑's share of them rest as peachwood blades in their gamboge light)
    let fly = 0, fpeach = 0;
    if (W.idleSwords > 0) for (let j = 0; j < W.slots.length; j++) { const sl = W.slots[j]; if (sl.kind === 'launch' || (sl.kind === 'homing' && sl.flying)) { fly++; if (sl.id === 'peach') fpeach++; } }
    const nPeach = fly > 0 ? Math.round((W.idleSwords * fpeach) / fly) : 0;
    const peachS = nPeach > 0 ? this.sprite('proj:peachSword' as AtlasId) : null;
    for (let k = 0; k < W.idleSwords && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
      const a = td * TAU * 0.9 + (k / Math.max(1, W.idleSwords)) * TAU;
      const x = W.px + Math.cos(a) * 44, y = W.py + Math.sin(a) * 44;
      const pk = peachS !== null && k >= W.idleSwords - nPeach;
      if (arcs > 0) { arcs--; TR.arc(ctx, cam, W.px, W.py, 44, a, calm ? 0.3 : 0.75, 1, 3.2, pk ? VT.gamboge : VT.jade, passes, 0.7); }
      if (pk) blitRot(ctx, cam, peachS, x, y, a + Math.PI / 2, PEACH_SZ * 0.94, 0.85);
      else if (sword) blitRot(ctx, cam, sword, x, y, a + Math.PI / 2, 0.8, 0.85); else circle(ctx, cam, x, y, 3, '#3f6f8f');
    }
  }

  private drawPlayer(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // 破镜重圆: fallen, your figure is an ink blot (engine/down.ts)
    if (drawDown(W, ctx, cam)) return;
    const pool = this.sprite('fx:moonPool');
    if (pool) blit(ctx, cam, pool, W.px, W.py + 4, 0.55, false, 0.45);
    const id = `char:${W.run.char}` as AtlasId;
    const hurt = W.iframes > 0.2;
    const v = hurt ? 3 : W.moving ? 1 + (Math.floor(W.t * 8) & 1) : 0;
    const s = this.sprite(id, v);
    const calm = W.settings.reduceMotion;
    // i-frames: a steady half-tone (屏幕抖动 RC8: the old 10 Hz blink of the figure at the centre of the
    // screen read as the screen flickering, and sat in the photosensitive band)
    const inv = W.iframes > 0 || W.invulnT > 0;
    // 广寒清辉: untargetable and not leaping, she rises — lifted off the ground (eased up, a slow sway,
    // eased down to land) and drawn clear, not a pale ghost on pale paper
    if (W.untargT > this.lastUntarg + 1e-4) this.riseDur = W.untargT;
    this.lastUntarg = W.untargT;
    let rise = 0;
    if (W.untargT > 0 && W.leapT <= 0 && this.riseDur > 0) {
      const up = Math.min(1, (this.riseDur - W.untargT) / 0.35), down = Math.min(1, W.untargT / 0.3);
      const e = up * up * (3 - 2 * up) * down * down * (3 - 2 * down);
      rise = e * (RISE_H + (calm ? 0 : 2.5 * Math.sin(W.tDraw * 3)));
    }
    const a = W.untargT > 0 ? (rise > 0 ? 0.82 : 0.5) : inv ? IFRAME_A : 1;
    const lift = (W.leapT > 0 ? Math.sin((1 - W.leapT / W.leapDur) * Math.PI) * 30 : 0) + rise;
    const flip = Math.cos(W.face) < 0;
    const F = W.feel;
    // 流光: a dash or a leap draws a brush of light behind you, and your afterimages linger in it
    if (s) this.drawDash(W, ctx, cam, s, lift, flip, !!calm);
    // a blow squashes you a little (RC8: 40% of the old squash) …
    const hs = !calm && F.hurtAge < 0.2 ? Math.exp(-F.hurtAge / 0.06) * F.hurtK : 0;
    // … and nudges your figure ≤ 2 u along it (drawn only; the old 7 u knock at the centre of the screen
    // was 3–10 px, and read as the screen jolting)
    const kb = HURT_KNOCK * hs;
    this.youS = s; this.youLift = lift;
    // m8 (ART, QA fix): every held weapon is drawn behind the figure; at 0.8× the near half drawn in front covered
    // about half of a thickened figure with four to six weapons
    this.drawHeld(W, ctx, cam, lift, !!calm);
    // m8 (PLAN E7): the lanes' figure-layer hooks (rings, tethers, poses); one returning true draws the figure itself
    let posed = false;
    for (let k = 0; k < W.playerHooks.length; k++) if (W.playerHooks[k](ctx, cam, W)) posed = true;
    if (posed) { /* a pose drew the figure */ }
    else if (s) blit(ctx, cam, s, W.px + F.hurtUx * kb, W.py - lift + F.hurtUy * kb, 1, flip, a, 1 + 0.064 * hs, 1 - 0.056 * hs);
    else circle(ctx, cam, W.px + F.hurtUx * kb, W.py - lift + F.hurtUy * kb, 14, '#f4f1e8', a);
    if (W.shieldV > 0) this.mark(ctx, cam, 'fx:shieldBubble', W.px, W.py - lift, 0.9);
    // the hitbox: a small vermilion dot at the centre (GDD §20)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (W.px - cam.x) * cam.scale + cam.w / 2, sy = (W.py - lift - cam.y) * cam.scale + cam.h / 2;
    ctx.fillStyle = '#d63a22';
    ctx.fillRect(sx - 1.5 * cam.dpr, sy - 1.5 * cam.dpr, 3 * cam.dpr, 3 * cam.dpr);
  }

  /** Held weapons, all under the figure, pointing at the last attack. */
  private drawHeld(W: World, ctx: CanvasRenderingContext2D, cam: Camera, lift: number, calm: boolean): void {
    // weapons held around you, pointing at the last attack: a wind-up as the cooldown ends
    // (anticipation), a swing through the blow (follow-through), a kick back on a shot (recoil)
    const n = W.slots.length, F = W.feel;
    const dir = W.lastDir < 1e8 ? W.lastDir : W.face;
    for (let k = 0; k < n; k++) {
      const sl = W.slots[k];
      if (sl.kind === 'orbit' || sl.kind === 'familiar') continue;
      const a0 = (k / n) * TAU + W.tDraw * 0.4;
      const ws = this.sprite(`wpn:${sl.id}` as AtlasId);
      if (!ws) continue;
      let wx = W.px + Math.cos(a0) * HELD.orbitX, wy = W.py - lift + Math.sin(a0) * HELD.orbitY;
      const ft = k < 8 ? F.slotT[k] : 9;
      let wd = ft < 0.6 ? F.slotDir[k] : dir;
      if (!calm && k < 8) {
        if (ft < 0.3) {
          if (F.slotMelee[k]) {
            // follow-through: sweep −70° → +70° in 0.09 s, then drift home
            const u = Math.min(1, ft / 0.09);
            const back = ft > 0.09 ? Math.max(0, 1 - (ft - 0.09) / 0.2) : 1;
            wd += (-1.2 + 2.4 * (1 - (1 - u) * (1 - u))) * back;
            const out = 10 * Math.sin(Math.min(1, ft / 0.18) * Math.PI);
            wx += Math.cos(wd) * out; wy += Math.sin(wd) * out;
          } else {
            const kb = 7 * Math.exp(-ft / 0.05);
            wx -= Math.cos(wd) * kb; wy -= Math.sin(wd) * kb;
          }
        } else if (sl.cd > 0 && sl.cd < 0.14 && (sl.kind === 'combo' || sl.kind === 'sweep' || sl.kind === 'smash' || sl.kind === 'punch' || sl.kind === 'thrust' || sl.kind === 'slam')) {
          // anticipation: draw back before the blow
          const u = 1 - sl.cd / 0.14;
          wd -= 0.7 * u;
          wx -= Math.cos(wd) * 5 * u; wy -= Math.sin(wd) * 5 * u;
        }
      }
      blitRot(ctx, cam, ws, wx, wy, wd, HELD.size, HELD.alpha);
    }
  }

  /**
   * Your dash or leap (一剑光寒, 拖刀计, 扑蝶, …): a tapered ribbon of your light along the path and up
   * to three afterimages of your figure fading behind you (reduced motion: a short ribbon, one ghost).
   */
  private drawDash(W: World, ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, lift: number, flip: boolean, calm: boolean): void {
    // (the render clock: the ribbon records your drawn positions — see drawPlayerShots)
    const TR = this.trails, t = drawClock(W);
    const moving = W.dashT > 0 || W.leapT > 0;
    const tint = CHAR_TINT[W.run.char] ?? VT.moon;
    if (moving) {
      const leap = W.leapT > 0;
      this.pTrail = TR.feed(TG.player, 0, W.px, W.py - lift - 12, t, leap ? 13 : 18, (calm ? 0.12 : 0.26), tint, TSY.light, TR.cap, 400);
    } else TR.cut(TG.player, 0);
    const i = this.pTrail;
    if (i < 0 || !TR.alive[i] || TR.group[i] !== TG.player) { this.pTrail = -1; return; }
    TR.draw(ctx, cam, t, TG.player, this.passesOf(W), 0.95);
    // afterimages at 35, 70, 105 ms back along the path
    const n = calm ? 1 : W.quality === 'low' ? 2 : 3;
    for (let k = n; k >= 1; k--) {
      if (!TR.sample(i, t, k * 0.035, this.pt)) continue;
      const dx = this.pt.x - W.px, dy = this.pt.y - (W.py - lift - 12);
      if (dx * dx + dy * dy < 36) continue;
      blit(ctx, cam, s, this.pt.x, this.pt.y + 12, 1, flip, (calm ? 0.3 : 0.42) * (1 - (k - 1) / 3.2));
    }
  }

  /**
   * Darkness (暗月, 大雪, 天狗食月): a baked soft hole around you, the rest near-black. The four rects and
   * the hole share whole-pixel edges (no seam of light between them). Telegraphs, the enemy's ground
   * and enemy shots are drawn over it (drawOrder), so danger stays readable in the dark.
   */
  private drawDarkness(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (W.lightR === null) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const R = W.lightR * cam.scale;
    if (!this.light) this.light = makeLight();
    const h = holeRects(this.hole, cam.w, cam.h, (W.px - cam.x) * cam.scale + cam.w / 2, (W.py - cam.y) * cam.scale + cam.h / 2, R);
    ctx.fillStyle = 'rgba(8,8,12,0.92)';
    for (let k = 4; k < 20; k += 4) if (h[k + 2] > 0 && h[k + 3] > 0) ctx.fillRect(h[k], h[k + 1], h[k + 2], h[k + 3]);
    if (this.light) ctx.drawImage(this.light, h[0], h[1], h[2] - h[0], h[3] - h[1]);
  }

  private overlays(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const key = `${cam.w}x${cam.h}`;
    const F = W.feel;
    const calm = W.settings.reduceMotion;
    // the edge masks are baked small (≤ 128 px across: a soft gradient scales up cleanly, and a small
    // canvas costs nothing to draw) and elliptical, so a portrait phone gets a thin rim on every side
    if (this.edgeKey !== key) { this.edge = makeEdge(cam.w, cam.h, 'rgba(120,60,20,0.55)', 0.7); this.hurtEdge = makeEdge(cam.w, cam.h, 'rgba(46,22,14,1)', 0.8); this.edgeKey = key; }
    // low HP browns the paper's edge, pulsing with a heartbeat (lub-dub) that quickens as you fade
    if (W.hp < W.hpMax * 0.3 && W.phase === 'wave' && this.edge) {
      const p = F.beat - Math.floor(F.beat);
      const pulse = Math.max(Math.exp(-p / 0.08), p > 0.26 ? 0.65 * Math.exp(-(p - 0.26) / 0.07) : 0);
      ctx.globalAlpha = calm ? 0.65 : 0.45 + 0.45 * pulse; edgeBands(ctx, this.edge, cam.w, cam.h, 0.7); ctx.globalAlpha = 1;
    }
    // a blow: a thin dark rim (ink, not the enemy's vermilion) closes in and drains (≤ 0.2); with reduced
    // motion it holds still at a low alpha for the i-frames instead of pulsing. The big moments (a
    // boss's phase or death, a hard blow) pulse the same rim darker a moment (≤ PULSE_A over PULSE_S s):
    // the feedback the camera shake used to give, with nothing on the screen moving
    if (this.hurtEdge && W.phase !== 'idle') {
      const ha = calm ? (F.hurtAge < 0.35 && F.hurtK > 0 ? 0.16 : 0) : Math.min(HURT_RIM_A, HURT_RIM_A * F.hurtK * Math.exp(-F.hurtAge / 0.18));
      const u = F.pulseAge / PULSE_S;
      const pa = u < 1 && F.pulseK > 0 ? PULSE_A * F.pulseK * (calm ? 0.6 : Math.sin(Math.min(1, u * 4) * Math.PI * 0.5) * (1 - u) * (1 - u)) : 0;
      const e = Math.max(ha, pa);
      if (e > 0.01) { ctx.globalAlpha = e; edgeBands(ctx, this.hurtEdge, cam.w, cam.h, 0.8); ctx.globalAlpha = 1; }
    }
    // brush titles (synergies at the edge, boss phases and 「第 N 重 · 破」 in the centre)
    for (const t of W.titles) {
      const zh = W.settings.lang === 'zh';
      const text = zh ? t.text.zh : t.text.en;
      const centre = t.where === 'centre';
      const px = (centre ? 44 : 24) * cam.dpr;
      ctx.font = `${px}px 'Ma Shan Zheng', 'LXGW WenKai', serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, t.t / 0.25);
      ctx.fillStyle = 'rgba(244,241,232,0.8)';
      const y = centre ? cam.h * 0.36 : cam.h * 0.14;
      ctx.fillText(text, cam.w / 2 + cam.dpr, y + cam.dpr);
      // edge titles in dark gold ink (your synergies, 共鸣, 「举杯邀明月」: not the enemy's vermilion)
      ctx.fillStyle = centre ? '#1c1c1c' : '#8a5d0c';
      ctx.fillText(text, cam.w / 2, y);
      ctx.globalAlpha = 1;
    }
  }
}

/** The frame's layers (Renderer.layer draws one). */
export type Layer =
  | 'arena' | 'telegraphs' | 'zones' | 'dangerZones' | 'ground' | 'drops' | 'enemies' | 'enemyBars' | 'summons' | 'player' | 'effects'
  | 'playerShots' | 'bars' | 'numbers' | 'darkness' | 'enemyShots' | 'reticle' | 'overlays' | 'threats';
/** The contract's order (API.md §3): the vermilion enemy shots on top of everything the player's side
 *  makes; the bodies' HP bars right over the bodies (under your figure, your summons and the blows'
 *  light: a crowd's bars never bury you), your own bar late ('bars'). */
const LIT: readonly Layer[] = [
  'arena', 'telegraphs', 'zones', 'ground', 'drops', 'enemies', 'enemyBars', 'summons', 'player', 'effects', 'playerShots', 'bars', 'numbers', 'enemyShots', 'reticle', 'overlays', 'threats',
];
/** In the dark the field goes under the darkness; the danger (the enemy's ground, telegraphs, enemy
 *  shots) and your aim stay above it, readable wherever they are. */
const DARK: readonly Layer[] = [
  'arena', 'zones', 'ground', 'drops', 'enemies', 'enemyBars', 'summons', 'player', 'effects', 'playerShots', 'bars', 'numbers',
  'darkness', 'dangerZones', 'telegraphs', 'enemyShots', 'reticle', 'overlays', 'threats',
];
/** The render order list: what draw() walks, lit or in the dark. */
export function drawOrder(dark: boolean): readonly Layer[] { return dark ? DARK : LIT; }
/** The render clock (World.tDraw: the time of the drawn positions, within a step before t while the
 *  engine draws); a renderer driven by hand, or a stale one, reads t. */
function drawClock(W: World): number {
  const d = W.tDraw, t = W.t;
  return d <= t && d >= t - 1 / 60 - 1e-9 ? d : t;
}

/** A zone's wash alpha: fading in over its first 0.2 s (from its age, never from a float32 life, which
 *  at 1e9 never counts down) and out over its last 0.4 s. */
export function zoneFade(life: number, age: number): number {
  return Math.max(0, Math.min(1, life / 0.4, age / 0.2 + 0.2));
}

/**
 * The darkness around a hole of radius R at (sx, sy) on a w × h screen, in whole pixels, into `out`:
 * [x0, y0, x1, y1] the hole's square (the soft light mask fills it), then four rects (x, y, w, h) —
 * above, below, left, right — that tile the rest edge to edge.
 */
export function holeRects(out: Float64Array | number[], w: number, h: number, sx: number, sy: number, R: number): Float64Array | number[] {
  const W = Math.round(w), H = Math.round(h);
  const x0 = Math.floor(sx - R), x1 = Math.ceil(sx + R), y0 = Math.floor(sy - R), y1 = Math.ceil(sy + R);
  const cx0 = Math.max(0, Math.min(W, x0)), cx1 = Math.max(cx0, Math.min(W, x1));
  const cy0 = Math.max(0, Math.min(H, y0)), cy1 = Math.max(cy0, Math.min(H, y1));
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
  out[4] = 0; out[5] = 0; out[6] = W; out[7] = cy0; // above
  out[8] = 0; out[9] = cy1; out[10] = W; out[11] = H - cy1; // below
  out[12] = 0; out[13] = cy0; out[14] = cx0; out[15] = cy1 - cy0; // left
  out[16] = cx1; out[17] = cy0; out[18] = W - cx1; out[19] = cy1 - cy0; // right
  return out;
}

/** A sprite rotated by `ang` and scaled kx along it, ky across it (ky < 0 mirrors), about its anchor. */
function blitAff(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, ang: number, kx: number, ky: number, a: number): boolean {
  if (a <= 0.01) return false;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  // wholly off the canvas: no call
  const ak = kx < 0 ? -kx : kx, bk = ky < 0 ? -ky : ky;
  if (offCanvas(cam, px, py, reach(s, cam.scale * (ak > bk ? ak : bk)))) return false;
  const c = Math.cos(ang) * cam.scale, n = Math.sin(ang) * cam.scale;
  ctx.setTransform(c * kx, n * kx, -n * ky, c * ky, px, py);
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  ctx.globalAlpha = 1;
  return true;
}

/**
 * A body: its base scale (mirrored when it faces left) and act/tell stretch (bx, by), squashed by `sq`
 * along the blow's axis `ang` (compressed along it, widened across) and turned by `wob` (rad), about
 * its anchor — one setTransform, one drawImage.
 */
function blitBody(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, size: number, flip: boolean, a: number, bx: number, by: number, sq: number, ang: number, wob: number): void {
  if (a <= 0.01) return;
  const k = cam.scale * size;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  // wholly off the canvas: no call (the squash stretches by ≤ 1 + |sq|, the wobble only turns it)
  if (offCanvas(cam, px, py, reach(s, k) * (bx > by ? bx : by) * (1 + (sq < 0 ? -sq : sq)))) return;
  const fx = (flip ? -k : k) * bx, fy = k * by;
  let m11 = fx, m12 = 0, m21 = 0, m22 = fy;
  if (sq !== 0) {
    const c = Math.cos(ang), n = Math.sin(ang), d1 = 1 - sq, d2 = 1 + 0.7 * sq;
    const a11 = c * c * d1 + n * n * d2, a12 = c * n * (d1 - d2), a22 = n * n * d1 + c * c * d2;
    m11 = a11 * fx; m12 = a12 * fy; m21 = a12 * fx; m22 = a22 * fy;
  }
  if (wob !== 0) {
    const c = Math.cos(wob), n = Math.sin(wob);
    const r11 = c * m11 - n * m21, r12 = c * m12 - n * m22, r21 = n * m11 + c * m21, r22 = n * m12 + c * m22;
    m11 = r11; m12 = r12; m21 = r21; m22 = r22;
  }
  ctx.setTransform(m11, m21, m12, m22, px, py);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  if (a !== 1) ctx.globalAlpha = 1;
}

function circle(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, r: number, fill: string, a = 1): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (a !== 1) ctx.globalAlpha = a;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc((x - cam.x) * cam.scale + cam.w / 2, (y - cam.y) * cam.scale + cam.h / 2, Math.max(1, r * cam.scale), 0, TAU);
  ctx.fill();
  if (a !== 1) ctx.globalAlpha = 1;
}

function canvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
/** The light mask: dark outside a soft circle (baked once). */
function makeLight(): HTMLCanvasElement | null {
  const c = canvas(256, 256);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(8,8,12,0)');
  grad.addColorStop(1, 'rgba(8,8,12,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return c;
}
/**
 * An edge mask (makeEdge) stretched over the w × h screen, drawn as the four bands around its clear
 * middle: the mask is clear inside `inner` of each half-axis (an ellipse), so the rect inscribed in that
 * ellipse, two texels in, is never touched. Each band's source rect maps onto its whole-pixel destination
 * exactly as the one stretched draw did — a quarter to a third less fill while the rim is up.
 */
function edgeBands(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, w: number, h: number, inner: number): void {
  const cw = img.width, ch = img.height, kx = w / cw, ky = h / ch;
  const hx = ((cw / 2) * inner) / Math.SQRT2 - 2, hy = ((ch / 2) * inner) / Math.SQRT2 - 2;
  const x0 = Math.ceil((cw / 2 - hx) * kx), x1 = Math.floor((cw / 2 + hx) * kx);
  const y0 = Math.ceil((ch / 2 - hy) * ky), y1 = Math.floor((ch / 2 + hy) * ky);
  if (hx <= 0 || hy <= 0 || x1 <= x0 || y1 <= y0) { ctx.drawImage(img, 0, 0, w, h); return; }
  ctx.drawImage(img, 0, 0, cw, y0 / ky, 0, 0, w, y0);
  ctx.drawImage(img, 0, y1 / ky, cw, ch - y1 / ky, 0, y1, w, h - y1);
  ctx.drawImage(img, 0, y0 / ky, x0 / kx, (y1 - y0) / ky, 0, y0, x0, y1 - y0);
  ctx.drawImage(img, x1 / kx, y0 / ky, cw - x1 / kx, (y1 - y0) / ky, x1, y0, w - x1, y1 - y0);
}
/**
 * An edge vignette (baked per screen shape, small; drawn stretched to the screen): `rim` at the edge,
 * clear inside `inner` of each half-axis — an ellipse, so the band is as thin at the top and bottom of
 * a portrait phone as at its sides. Low-HP brown, the blow's ink.
 */
function makeEdge(w: number, h: number, rim: string, inner: number): HTMLCanvasElement | null {
  const k = 128 / Math.max(w, h, 1);
  const cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k));
  const c = canvas(cw, ch);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  g.translate(cw / 2, ch / 2);
  g.scale(1, ch / cw);
  const r = cw / 2;
  const grad = g.createRadialGradient(0, 0, r * inner, 0, 0, r);
  grad.addColorStop(0, rim.replace(/[\d.]+\)$/, '0)'));
  grad.addColorStop(1, rim);
  g.fillStyle = grad;
  g.fillRect(-cw, -cw * 2, cw * 2, cw * 4);
  return c;
}
