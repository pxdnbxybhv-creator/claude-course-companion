// 水月幻镜 · the frame's drawing (GDD §20, §24.3): setTransform + drawImage from the painter's
// atlases, in the contract's order (drawOrder): arena → telegraphs → zones → drops → enemies → summons
// → player → effects → player shots → numbers → enemy shots → low-HP edge and titles (the vermilion
// enemy shots stay on top of everything the player's side makes, numbers included). In the dark
// (暗月, 大雪, 天狗食月) the darkness goes over the field but under the danger: the enemy's ground,
// telegraphs and enemy shots are drawn after it. No shadowBlur,
// filters or per-frame gradients (the two overlay masks are baked once). A null sprite draws as a
// plain ink circle, so the game is playable before (or without) the art.
import type { AtlasId, Camera, NumStyle, Painter, Sprite } from '../types';
import { blit, blitRot } from '../paint/draw';
import { EKind, SMode } from './pools';
import { DROP_ATLAS, PROJ_ATLAS, SK, SUMMON_ATLAS, SWORDS_ON_SCREEN, TAU } from './consts';
import { ST } from './enemies';
import { PF } from './feel';
import { SH, SWIPE_FRAMES, TN } from '../paint/feel';
import type { World } from './world';

/** Trail tint of a player shot by its weapon's feel class. */
const TRAIL_TINT: readonly number[] = [
  TN.azure, TN.ink, TN.ink, TN.wine, TN.grey, TN.gold, TN.gamboge, TN.wine, TN.indigo, TN.jade, TN.ink, TN.green, TN.moon, TN.gold, TN.ink,
];
/** A drawNumber that also takes a scale (the painter's implementation accepts it). */
type DrawNum = (ctx: CanvasRenderingContext2D, value: number, sx: number, sy: number, style: NumStyle, a: number, lang: 'zh' | 'en', scale?: number) => void;

const NUM_STYLE: readonly NumStyle[] = ['hit', 'crit', 'heal', 'moon', 'coin', 'player'];
const FX_BASE: Record<string, number> = { beamRay: 64, boltChain: 32, swordStreak: 40, slashArc: 32 };

/** Everything the renderer keeps between frames (made once, reused). */
export class Renderer {
  private light: HTMLCanvasElement | null = null;
  private edge: HTMLCanvasElement | null = null;
  private hurtEdge: HTMLCanvasElement | null = null;
  private edgeKey = '';
  /** The darkness's hole and its four rects, reused every frame (holeRects). */
  private readonly hole = new Float64Array(20);
  private atlasCache = new Map<string, AtlasId>();

  constructor(private painter: Painter) {}

  setPainter(p: Painter): void { this.painter = p; }

  private sprite(id: AtlasId, v = 0): Sprite | null {
    try { return this.painter.sprite(id, v); } catch { return null; }
  }

  draw(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const order = drawOrder(W.lightR !== null);
    for (let k = 0; k < order.length; k++) this.layer(order[k], W, ctx, cam);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** One layer of the frame (draw() walks drawOrder). */
  layer(L: Layer, W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    switch (L) {
      case 'arena': this.painter.drawArena(ctx, cam); break;
      case 'telegraphs': this.drawTeles(W, ctx, cam); break;
      // in the dark the player's washes stay under it and the enemy's ground (webs, clouds, puddles) rises above
      case 'zones': this.drawZones(W, ctx, cam, W.lightR !== null ? 1 : -1); break;
      case 'dangerZones': this.drawZones(W, ctx, cam, 0); break;
      case 'ground': this.drawGround(W, ctx, cam); break;
      case 'drops': this.drawDrops(W, ctx, cam); break;
      case 'enemies': this.drawEnemies(W, ctx, cam); break;
      case 'summons': this.drawSummons(W, ctx, cam); break;
      case 'player': this.drawSwords(W, ctx, cam); this.drawPlayer(W, ctx, cam); break;
      case 'effects': this.drawEffects(W, ctx, cam); break;
      case 'playerShots': this.drawPlayerShots(W, ctx, cam); break;
      case 'numbers': this.drawNumbers(W, ctx, cam); break;
      case 'darkness': this.drawDarkness(W, ctx, cam); break;
      case 'enemyShots': this.drawEnemyShots(W, ctx, cam); break;
      case 'reticle': this.drawReticle(W, ctx, cam); break;
      case 'overlays': this.overlays(W, ctx, cam); break;
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
    for (let i = 0; i < Z.n; i++) {
      if (!Z.alive[i] || !Z.look[i] || (side >= 0 && Z.side[i] !== side)) continue;
      const fade = zoneFade(Z.life[i], Z.age[i]);
      P.drawZone(ctx, cam, Z.look[i] as never, Z.x[i], Z.y[i], Z.r[i], (Z.side[i] ? 0.6 : 0.7) * fade * (W.degrade ? 0.6 : 1));
    }
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
  }

  private drawDrops(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // drops
    const D = W.D;
    const tt = W.t;
    const zip = W.feel.sprites.ok && !W.degrade && D.count < 160 ? W.feel.sprites.get(SH.streak, TN.moon) : null;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      const id = DROP_ATLAS[k];
      const v = id === 'drop:cashCoin' ? Math.floor(tt * 8 + i) & 3 : 0;
      const s = this.sprite(id, v);
      const bob = D.age[i] < 0.25 ? Math.sin((D.age[i] / 0.25) * Math.PI) * 10 : 0;
      if (zip && D.magnet[i] && D.age[i] >= 0.25) {
        // 月华 streaming in leaves a thin moon-white streak
        const dx = W.px - D.x[i], dy = W.py - D.y[i];
        if (dx * dx + dy * dy > 900) blitAff(ctx, cam, zip, D.x[i], D.y[i], Math.atan2(dy, dx), 0.55, 0.55, 0.55);
      }
      if (s) blit(ctx, cam, s, D.x[i], D.y[i] - bob, D.worth[i] >= 5 && k === 0 ? 1.4 : 1);
      else circle(ctx, cam, D.x[i], D.y[i] - bob, k <= 1 ? 4 : 7, k >= 7 ? '#b8862b' : '#e8eef2');
    }
  }

  private drawEnemies(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // enemies
    const E = W.E;
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
  }

  private drawSummons(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // summons
    const tt = W.t;
    const S = W.S;
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

  private drawEffects(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // effects (kill bursts, rings, slashes, sparks) go under both kinds of shot: the vermilion
    // enemy shots that decide whether you get hit stay the brightest thing on screen (API.md §3)
    const FX = W.P;
    const pa = W.degrade ? 0.6 : 1;
    for (let i = 0; i < FX.n; i++) {
      if (!FX.alive[i]) continue;
      const k = FX.life[i] / FX.life0[i];
      const name = FX.kind[i];
      const s = this.sprite(this.fxId(name));
      if (!s) continue;
      if (FX.len[i] > 0) blitRot(ctx, cam, s, FX.x[i], FX.y[i], FX.dir[i], FX.r[i], k * pa, FX.len[i] / (FX_BASE[name] ?? 32) / Math.max(0.2, FX.r[i]));
      else if (name === 'levelRing' || name === 'shockRing' || name === 'pulseRing' || name === 'rippleRing' || name === 'coinRipple') blit(ctx, cam, s, FX.x[i], FX.y[i], (FX.r[i] / 32) * (0.4 + 0.6 * (1 - k)), false, k * pa);
      else if (name === 'slashArc') blitRot(ctx, cam, s, FX.x[i], FX.y[i], FX.dir[i], FX.r[i] / 32, k * pa);
      else blit(ctx, cam, s, FX.x[i], FX.y[i], FX.r[i] / 32, false, Math.min(1, k * 1.5) * pa);
    }
    // 打击感: spatter, rings, flares, swipes, crowns (under both kinds of shot)
    this.drawSparks(W, ctx, cam, pa);
  }

  private drawPlayerShots(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    // player shots
    const tt = W.t, pa = W.degrade ? 0.6 : 1;
    const PS = W.PS;
    const FS = W.feel.sprites;
    // brush trails: the raster cost of one per shot adds up at phone DPR, so fewer on mid, none on low
    const trails = FS.ok && !W.degrade && PS.count < (W.quality === 'high' ? 200 : W.quality === 'mid' ? 90 : 0);
    for (let i = 0; i < PS.n; i++) {
      if (!PS.alive[i]) continue;
      const id = PROJ_ATLAS[PS.kind[i]];
      const s = this.sprite(id);
      let ang = Math.atan2(PS.vy[i], PS.vx[i]);
      let sz = 1;
      let y = PS.y[i];
      if (PS.mode[i] === SMode.Lob) {
        const k = 1 - PS.life[i] / PS.life0[i];
        y -= Math.sin(k * Math.PI) * 60;
        ang = tt * 9;
        sz = 1 + Math.sin(k * Math.PI) * 0.3;
      } else if (PS.mode[i] === SMode.BoomOut || PS.mode[i] === SMode.BoomBack) ang = tt * 16;
      else if (trails && PS.life[i] < PS.life0[i] - 0.02) {
        // a short brush trail behind the shot (its weapon's colour), longer the faster it flies
        const sl = PS.slot[i];
        const tint = sl >= 0 && sl < W.slots.length ? TRAIL_TINT[W.slots[sl].fc] ?? TN.ink : TN.moon;
        const tr = FS.get(SH.streak, tint);
        if (tr) {
          const sp = Math.hypot(PS.vx[i], PS.vy[i]);
          const len = Math.min(1.6, sp / 520) * (0.6 + PS.r[i] / 16);
          if (len > 0.15) blitAff(ctx, cam, tr, PS.x[i], y, ang, len, 0.6 + PS.r[i] / 20, 0.5 * pa);
        }
      }
      if (s) blitRot(ctx, cam, s, PS.x[i], y, ang, sz, pa);
      else circle(ctx, cam, PS.x[i], y, PS.r[i] * 0.7, '#3f6f8f', pa);
    }
  }

  private drawNumbers(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const P = this.painter, lang = W.settings.lang;
    // numbers pop (overshoot to 1.15×, settle), size by damage (≤ 1.2×), fly an arc, then fade — under
    // the enemy shots, so a crit never hides the danger
    const N = W.N;
    const dn = P.drawNumber as DrawNum;
    const calm = W.settings.reduceMotion;
    for (let i = 0; i < N.n; i++) {
      if (!N.alive[i]) continue;
      const t = N.t[i];
      const a = t < 0.58 ? 1 : Math.max(0, 1 - (t - 0.58) / 0.2);
      let pop = 1;
      if (!calm) {
        if (t < 0.06) pop = 0.6 + 0.55 * (t / 0.06);
        else if (t < 0.18) { const u = (t - 0.06) / 0.12; pop = 1.15 - 0.15 * (1 - (1 - u) * (1 - u)); }
      }
      const sc = pop * (N.sz[i] || 1) * (t > 0.58 ? 0.85 + 0.15 * a : 1);
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
      ctx.strokeStyle = 'rgba(192,65,47,0.7)';
      ctx.lineWidth = 2 * cam.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 26 * cam.dpr, 0, TAU); ctx.stroke();
    }
  }

  private fxId(name: string): AtlasId {
    let id = this.atlasCache.get(name);
    if (!id) { id = (name.includes(':') ? name : `fx:${name}`) as AtlasId; this.atlasCache.set(name, id); }
    return id;
  }

  private drawEnemy(W: World, ctx: CanvasRenderingContext2D, cam: Camera, i: number): void {
    const E = W.E;
    const id = E.atlas[i];
    const k = E.kind[i];
    const tell = E.st[i] === ST.tell;
    const v = k === EKind.Boss ? Math.floor(W.t * 2 + i) & 1 : tell ? 2 : (Math.floor(W.t * 5 + i * 0.37) & 1);
    const calm = W.settings.reduceMotion;
    const flash = E.flash[i] > 0 && !calm;
    const s = id ? (flash ? this.painter.flash(id, v) ?? this.sprite(id, v) : this.sprite(id, v)) : null;
    const flip = Math.cos(E.face[i]) < 0;
    const scale = E.r[i] / Math.max(1, E.r0[i]);
    const air = E.air[i] ? 10 : 0;
    const a = E.untarget[i] ? 0.45 : k === EKind.Ally || E.charmT[i] > 0 ? 0.85 : 1;
    // 打击感: the blow squashes the body (wide, then a springy stretch back) and nudges it away
    let sqx = 1, sqy = 1, ox = 0, oy = 0;
    const hv = E.hitV[i], ha = E.hitAge[i];
    if (hv > 0 && ha < 0.35 && !calm) {
      const env = hv * Math.exp(-ha / 0.085);
      const osc = Math.cos(ha * 40);
      sqx = 1 + 0.26 * env * osc; sqy = 1 - 0.22 * env * osc;
      const push = hv * 6 * Math.exp(-ha / 0.05);
      ox = Math.cos(E.hitA[i]) * push; oy = Math.sin(E.hitA[i]) * push;
    }
    if (s) blit(ctx, cam, s, E.x[i] + ox, E.y[i] - air + oy, scale, flip, a, (1 + (E.st[i] === ST.act ? 0.08 : 0)) * sqx, (1 - (tell ? 0.08 : 0)) * sqy);
    else circle(ctx, cam, E.x[i] + ox, E.y[i] - air + oy, E.r[i] * (sqx + sqy) / 2, flash ? '#ffffff' : k === EKind.Elite ? '#5a4012' : k === EKind.Boss ? '#12141a' : k === EKind.Treasure ? '#d9a62e' : '#1d2430', a);
    // 伐桂人's three axes orbit it
    if (E.id[i] === 'axeshade') {
      const ax = this.sprite('proj:eAxe');
      for (let k = 0; k < 3; k++) {
        const a = E.age[i] * TAU * 0.8 + (k / 3) * TAU;
        const x = E.x[i] + Math.cos(a) * 70, y = E.y[i] + Math.sin(a) * 70;
        if (ax) blitRot(ctx, cam, ax, x, y, a * 3, 1.2); else circle(ctx, cam, x, y, 8, '#c0412f');
      }
    }
    // marks: allies, statuses
    if (k === EKind.Ally || E.charmT[i] > 0) this.mark(ctx, cam, k === EKind.Ally ? 'sum:inkAlly' : 'fx:charmMark', E.x[i], E.y[i] - E.r[i] - 6, k === EKind.Ally ? scale : 0.35);
    else if (E.stunT[i] > 0) this.mark(ctx, cam, 'fx:stunMark', E.x[i], E.y[i] - E.r[i] - 6, 0.35);
    else if (E.burnN[i] > 0) this.mark(ctx, cam, 'fx:burnMark', E.x[i], E.y[i] - 4, 0.35);
    else if (E.rootT[i] > 0) this.mark(ctx, cam, 'fx:rootMark', E.x[i], E.y[i] + E.r[i] * 0.6, 0.4);
    else if (E.slowT[i] > 0) this.mark(ctx, cam, 'fx:slowMark', E.x[i], E.y[i] + E.r[i] * 0.6, 0.35);
    // elites and treasures: a thin bar
    if ((k === EKind.Elite || k === EKind.Demon) && E.hp[i] < E.hpMax[i]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (E.x[i] - cam.x) * cam.scale + cam.w / 2, sy = (E.y[i] - E.r[i] - 10 - cam.y) * cam.scale + cam.h / 2;
      const w = E.r[i] * 2 * cam.scale;
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.fillRect(sx - w / 2, sy, w, 3 * cam.dpr);
      ctx.fillStyle = '#c0412f'; ctx.fillRect(sx - w / 2, sy, w * Math.max(0, E.hp[i] / E.hpMax[i]), 3 * cam.dpr);
    }
  }

  /** The feel layer's sparks, each a drawImage from a baked sprite. */
  private drawSparks(W: World, ctx: CanvasRenderingContext2D, cam: Camera, pa: number): void {
    const F = W.feel, P = F.sp, S = F.sprites;
    if (!S.ok || !P.count) return;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      const k = P.life[i] / P.life0[i], u = 1 - k;
      const fl = P.flags[i];
      let frame = 0, alpha: number, kx: number, ky: number, ang = P.rot[i];
      if (fl & PF.swipe) {
        // reveal over the first 45% (the head leads), then the dry follow-through fades
        frame = u < 0.45 ? Math.min(SWIPE_FRAMES - 2, Math.floor((u / 0.45) * (SWIPE_FRAMES - 1))) : SWIPE_FRAMES - 1;
        alpha = P.a0[i] * (u < 0.45 ? 1 : Math.max(0, (1 - u) / 0.55));
        kx = P.s0[i]; ky = P.s0[i] * P.s1[i] * (fl & PF.flip ? -1 : 1);
      } else if (fl & PF.ease) {
        const e = 1 - k * k;
        const sz = P.s0[i] + (P.s1[i] - P.s0[i]) * e;
        alpha = P.a0[i] * k;
        kx = sz; ky = sz;
      } else {
        const sz = P.s1[i] + (P.s0[i] - P.s1[i]) * k;
        alpha = P.a0[i] * Math.min(1, k * 2.2);
        kx = sz; ky = sz;
        if (fl & PF.stretch) {
          const sp = Math.hypot(P.vx[i], P.vy[i]);
          ang = Math.atan2(P.vy[i], P.vx[i]);
          kx = sz * (1 + Math.min(2.2, sp / 240));
        }
      }
      const s = S.get(P.shape[i], P.tint[i], frame);
      if (s) blitAff(ctx, cam, s, P.x[i], P.y[i], ang, kx, ky, alpha * pa);
    }
  }

  private mark(ctx: CanvasRenderingContext2D, cam: Camera, id: AtlasId, x: number, y: number, size: number): void {
    const s = this.sprite(id);
    if (s) blit(ctx, cam, s, x, y, size, false, 0.9);
  }

  private drawSwords(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const sword = this.sprite('proj:flySword');
    let drawn = 0;
    // 剑匣 blades
    for (const sl of W.slots) {
      if (sl.kind !== 'orbit' || sl.swords <= 0) continue;
      const R = sl.flareT > 0 ? ((sl.def.p.flareR as number) ?? 240) : 90 + W.stats.range / 4;
      const rev = W.t * TAU * ((sl.def.p.rev as number) ?? 1);
      for (let k = 0; k < sl.swords && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
        const a = rev + (k / sl.swords) * TAU;
        const x = W.px + Math.cos(a) * R, y = W.py + Math.sin(a) * R;
        if (sword) blitRot(ctx, cam, sword, x, y, a + Math.PI / 2, 1); else circle(ctx, cam, x, y, 5, '#3f6f8f');
      }
    }
    // 残剑
    const can = this.sprite('sum:canjian');
    for (let k = 0; k < W.canjian && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
      const a = W.t * TAU * 1.3 + (k / W.canjian) * TAU;
      const x = W.px + Math.cos(a) * 60, y = W.py + Math.sin(a) * 60;
      if (can) blitRot(ctx, cam, can, x, y, a + Math.PI / 2, 0.8); else circle(ctx, cam, x, y, 4, '#556');
    }
    // idle swords
    for (let k = 0; k < W.idleSwords && drawn < SWORDS_ON_SCREEN; k++, drawn++) {
      const a = W.t * TAU * 0.9 + (k / Math.max(1, W.idleSwords)) * TAU;
      const x = W.px + Math.cos(a) * 44, y = W.py + Math.sin(a) * 44;
      if (sword) blitRot(ctx, cam, sword, x, y, a + Math.PI / 2, 0.7, 0.8); else circle(ctx, cam, x, y, 3, '#3f6f8f');
    }
  }

  private drawPlayer(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const pool = this.sprite('fx:moonPool');
    if (pool) blit(ctx, cam, pool, W.px, W.py + 4, 0.55, false, 0.45);
    const id = `char:${W.run.char}` as AtlasId;
    const hurt = W.iframes > 0.2;
    const v = hurt ? 3 : W.moving ? 1 + (Math.floor(W.t * 8) & 1) : 0;
    const s = this.sprite(id, v);
    const blink = (W.iframes > 0 || W.invulnT > 0) && (Math.floor(W.t * 20) & 1) === 1;
    const a = W.untargT > 0 ? 0.5 : blink ? 0.45 : 1;
    const lift = W.leapT > 0 ? Math.sin((1 - W.leapT / W.leapDur) * Math.PI) * 30 : 0;
    const flip = Math.cos(W.face) < 0;
    const F = W.feel;
    const calm = W.settings.reduceMotion;
    // a blow squashes you for a moment
    const hs = !calm && F.hurtAge < 0.2 ? Math.exp(-F.hurtAge / 0.06) * F.hurtK : 0;
    // … and knocks your figure back a few u (drawn only; the hitbox dot stays where you are)
    const kb = 7 * hs;
    if (s) blit(ctx, cam, s, W.px + F.hurtUx * kb, W.py - lift + F.hurtUy * kb, 1, flip, a, 1 + 0.16 * hs, 1 - 0.14 * hs);
    else circle(ctx, cam, W.px + F.hurtUx * kb, W.py - lift + F.hurtUy * kb, 14, '#f4f1e8', a);
    // weapons held around you, pointing at the last attack: a wind-up as the cooldown ends
    // (anticipation), a swing through the blow (follow-through), a kick back on a shot (recoil)
    const n = W.slots.length;
    const dir = W.lastDir < 1e8 ? W.lastDir : W.face;
    for (let k = 0; k < n; k++) {
      const sl = W.slots[k];
      if (sl.kind === 'orbit' || sl.kind === 'familiar') continue;
      const ws = this.sprite(`wpn:${sl.id}` as AtlasId);
      if (!ws) continue;
      const a0 = (k / n) * TAU + W.t * 0.4;
      let wx = W.px + Math.cos(a0) * 24, wy = W.py - lift + Math.sin(a0) * 18;
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
      blitRot(ctx, cam, ws, wx, wy, wd, 0.55, 0.9);
    }
    if (W.shieldV > 0) this.mark(ctx, cam, 'fx:shieldBubble', W.px, W.py - lift, 0.9);
    // the hitbox: a small vermilion dot at the centre (GDD §20)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (W.px - cam.x) * cam.scale + cam.w / 2, sy = (W.py - lift - cam.y) * cam.scale + cam.h / 2;
    ctx.fillStyle = '#d63a22';
    ctx.fillRect(sx - 1.5 * cam.dpr, sy - 1.5 * cam.dpr, 3 * cam.dpr, 3 * cam.dpr);
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
      ctx.globalAlpha = calm ? 0.65 : 0.45 + 0.45 * pulse; ctx.drawImage(this.edge, 0, 0, cam.w, cam.h); ctx.globalAlpha = 1;
    }
    // a blow: a thin dark rim (ink, not the enemy's vermilion) closes in and drains; with reduced
    // motion it holds still at a low alpha for the i-frames instead of pulsing
    if (this.hurtEdge && W.phase !== 'idle') {
      const ha = calm ? (F.hurtAge < 0.35 && F.hurtK > 0 ? 0.16 : 0) : Math.min(0.3, 0.3 * F.hurtK * Math.exp(-F.hurtAge / 0.18));
      if (ha > 0.01) { ctx.globalAlpha = ha; ctx.drawImage(this.hurtEdge, 0, 0, cam.w, cam.h); ctx.globalAlpha = 1; }
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
      ctx.fillStyle = centre ? '#1c1c1c' : '#c0412f';
      ctx.fillText(text, cam.w / 2, y);
      ctx.globalAlpha = 1;
    }
  }
}

/** The frame's layers (Renderer.layer draws one). */
export type Layer =
  | 'arena' | 'telegraphs' | 'zones' | 'dangerZones' | 'ground' | 'drops' | 'enemies' | 'summons' | 'player' | 'effects'
  | 'playerShots' | 'numbers' | 'darkness' | 'enemyShots' | 'reticle' | 'overlays';
/** The contract's order (API.md §3): the vermilion enemy shots on top of everything the player's side makes. */
const LIT: readonly Layer[] = [
  'arena', 'telegraphs', 'zones', 'ground', 'drops', 'enemies', 'summons', 'player', 'effects', 'playerShots', 'numbers', 'enemyShots', 'reticle', 'overlays',
];
/** In the dark the field goes under the darkness; the danger (the enemy's ground, telegraphs, enemy
 *  shots) and your aim stay above it, readable wherever they are. */
const DARK: readonly Layer[] = [
  'arena', 'zones', 'ground', 'drops', 'enemies', 'summons', 'player', 'effects', 'playerShots', 'numbers',
  'darkness', 'dangerZones', 'telegraphs', 'enemyShots', 'reticle', 'overlays',
];
/** The render order list: what draw() walks, lit or in the dark. */
export function drawOrder(dark: boolean): readonly Layer[] { return dark ? DARK : LIT; }

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
function blitAff(ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite, x: number, y: number, ang: number, kx: number, ky: number, a: number): void {
  if (a <= 0.01) return;
  const px = (x - cam.x) * cam.scale + cam.w / 2, py = (y - cam.y) * cam.scale + cam.h / 2;
  const c = Math.cos(ang) * cam.scale, n = Math.sin(ang) * cam.scale;
  ctx.setTransform(c * kx, n * kx, -n * ky, c * ky, px, py);
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * s.w, -s.ay * s.h, s.w, s.h);
  ctx.globalAlpha = 1;
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
