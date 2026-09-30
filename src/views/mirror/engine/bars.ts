// 水月幻镜 · HP bars over the bodies (the owner's feedback: 「给小怪都标注红色血条，给玩家头顶也标一个绿色
// 的小血条」). Every ordinary monster, elite and 心魔 carries a thin vermilion bar over its head (the enemy's
// colour; treasures a gold one) on a dark ink track: faded while it is untouched, fully shown once hurt,
// with a pale chip of the damage just taken draining into it; elites' bars are a size up. Bosses keep
// the HUD's big scroll. You carry a small jade bar with your shield as a thin grey cap over it; it
// flashes white for a moment when you are hurt (never under reduced motion).
//
// Layering: the bodies' bars are drawn right after the enemy layer ('enemyBars'), so your figure, your
// summons, the blows' light and the shots all stay over a crowd's bars; your own bar is drawn late
// ('bars', after your shots), over everything the field makes but the numbers and the enemy's shots.
//
// Cost: the enemy layer records each drawn body's bar (HpBars.enemy: a few typed-array writes, culled
// off-screen), then the 'enemyBars' layer fills them in runs — one fillStyle for all the tracks, one for the
// chips, one for the fills — so 140 bodies are ≈ 420 fillRect and 6 style changes, no path, no
// allocation, no per-bar state change.
import type { Camera, Sprite } from '../types';
import { EKind } from './pools';
import { fxDelta } from './feel';
import type { World } from './world';

/** Alpha of an untouched body's bar (full HP): there, but quiet. */
export const BAR_IDLE_A = 0.42;
/** Bar sizes in css px: [min width, max width, height], ordinary and big (elites, 心魔). Widths follow
 *  the body (≈ 2 × its radius), within these; the minimum shrinks to 3/4 as the view widens (a
 *  farther view draws small swarm bodies ≈ 9 css px: an 18-px bar over each is clutter). */
export const BAR_MON = [18, 30, 2.5] as const;
export const BAR_BIG = [30, 52, 3.5] as const;
/** Your bar: [min width, max width, height, shield cap height] in css px (≈ 0.8 of your figure's width). */
export const BAR_YOU = [30, 44, 4, 1.5] as const;
const TRACK = 'rgba(22,18,16,0.72)';
const CHIP = 'rgba(246,238,222,0.92)';
const RED = '#c8412c';
const GOLD = '#c9962e';
const JADE = '#3e9a63';
const JADE_FLASH = '#f2fff6';
const SHIELD = '#b9bfc8';
/** The damage chip drains this fraction of a bar per second (after a short hold). */
const CHIP_RATE = 0.9;
const CHIP_HOLD = 0.22;
/** css px per u at and above which a bar keeps its full minimum width (a phone's 'near' view is 0.89,
 *  'mid' 0.56, 'far' 0.48: 18 / 16.7 / 14.3 css px at the least). */
const BAR_MIN_AT = 0.6;

/** One run of bars (typed arrays, grown to the enemy pool's capacity once). */
class BarList {
  n = 0;
  x = new Float32Array(0); y = new Float32Array(0); w = new Float32Array(0); h = new Float32Array(0);
  f = new Float32Array(0); l = new Float32Array(0);
  gold = new Uint8Array(0);
  ensure(cap: number): void {
    if (this.x.length >= cap) return;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.w = new Float32Array(cap); this.h = new Float32Array(cap);
    this.f = new Float32Array(cap); this.l = new Float32Array(cap); this.gold = new Uint8Array(cap);
  }
}

export class HpBars {
  /** Untouched bodies (drawn at BAR_IDLE_A) and hurt ones (at 1). */
  private idle = new BarList();
  private hurt = new BarList();
  /** Per enemy slot: the chip's fraction, its hold, and whose it is (the slot's generation). */
  private lag = new Float32Array(0);
  private hold = new Float32Array(0);
  private gen = new Uint32Array(0);
  /** Your chip. */
  private youLag = 1;
  private youHold = 0;
  /** The effects clock at the last frame (W.tFx: simulation time, drawn on every frame; the chips hold
   *  with a hitstop, and drain as smoothly at 240 Hz as at 60). */
  private lastT = -1;
  private dt = 0;
  /** Bars recorded this frame (tests, the perf probe). */
  count = 0;

  /** Once a frame, before the enemy layer: clear the runs, advance the chips' clock. */
  begin(W: World): void {
    const cap = W.E.cap;
    this.idle.ensure(cap); this.hurt.ensure(cap);
    if (this.lag.length < cap) { this.lag = new Float32Array(cap).fill(1); this.hold = new Float32Array(cap); this.gen = new Uint32Array(cap).fill(0xffffffff); }
    this.idle.n = 0; this.hurt.n = 0; this.count = 0;
    const t = W.t + fxDelta(W);
    // (the effects clock may step back a hair after a still redraw: that frame's chip holds)
    this.dt = this.lastT >= 0 && t >= this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    if (this.lastT < 0 || t >= this.lastT || this.lastT - t > 0.05) this.lastT = t;
  }

  /**
   * Record enemy i's bar (the enemy layer calls this as it draws the body): at the drawn position
   * (x, y), over its sprite `s` drawn at `size` (null: over its radius). Bosses, allies, the hidden, the
   * dying and the invulnerable carry none.
   */
  enemy(W: World, cam: Camera, i: number, s: Sprite | null, x: number, y: number, size: number): void {
    const E = W.E, k = E.kind[i];
    if (k === EKind.Boss || k === EKind.Ally || E.decoy[i] || E.invuln[i] || E.charmT[i] > 0) return;
    const hpMax = E.hpMax[i], hp = E.hp[i];
    if (!(hpMax > 0) || !(hp > 0)) return;
    const d = cam.dpr;
    const big = k === EKind.Elite || k === EKind.Demon;
    const spec = big ? BAR_BIG : BAR_MON;
    const minK = Math.max(0.75, Math.min(1, cam.scale / d / BAR_MIN_AT));
    const w = Math.round(Math.max(spec[0] * d * minK, Math.min(spec[1] * d, E.r[i] * 2 * cam.scale)));
    const h = Math.max(2, Math.round(spec[2] * d));
    // over the head: the sprite's top (its anchor to its top edge, at the size drawn), a hair above
    const top = s ? y - s.ay * s.h * size : y - E.r[i] * 1.45;
    const sx = Math.round((x - cam.x) * cam.scale + cam.w / 2 - w / 2);
    const sy = Math.round((top - cam.y) * cam.scale + cam.h / 2 - h - 3 * d);
    if (sx > cam.w || sy > cam.h || sx + w < 0 || sy + h < 0) return;
    const f = Math.min(1, hp / hpMax);
    // the chip: a new body starts full; a blow holds it a moment, then it drains down to the bar
    if (this.gen[i] !== E.gen[i]) { this.gen[i] = E.gen[i]; this.lag[i] = f; this.hold[i] = 0; }
    let l = this.lag[i];
    if (f >= l || W.settings.reduceMotion) { l = f; this.hold[i] = 0; }
    else if (this.hold[i] < CHIP_HOLD) this.hold[i] += this.dt;
    else l = Math.max(f, l - CHIP_RATE * this.dt);
    if (l > f && this.hold[i] === 0) this.hold[i] = 1e-4; // a fresh blow starts the hold
    this.lag[i] = l;
    const L = f >= 0.9999 && l >= 0.9999 ? this.idle : this.hurt;
    if (L.n >= L.x.length) return; // (one enemy layer a frame: never, but never past the arrays either)
    const n = L.n++;
    L.x[n] = sx; L.y[n] = sy; L.w[n] = w; L.h[n] = h; L.f[n] = f; L.l[n] = l; L.gold[n] = k === EKind.Treasure ? 1 : 0;
    this.count++;
  }

  /** The 'enemyBars' layer (right after the enemy layer): every recorded body's bar, in fill runs. */
  drawEnemies(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (!this.idle.n && !this.hurt.n) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const b = Math.max(1, Math.round(cam.dpr * 0.75));
    if (this.idle.n) { ctx.globalAlpha = BAR_IDLE_A; runs(ctx, this.idle, b, false); }
    if (this.hurt.n) { ctx.globalAlpha = 1; runs(ctx, this.hurt, b, true); }
    ctx.globalAlpha = 1;
  }
  /** The 'bars' layer (after your shots): your bar, during a wave. */
  drawYou(W: World, ctx: CanvasRenderingContext2D, cam: Camera, you: Sprite | null, lift: number): void {
    if (W.phase !== 'wave') return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.you(W, ctx, cam, you, lift, Math.max(1, Math.round(cam.dpr * 0.75)));
  }
  /** Both at once (tests, a caller without the layers). */
  draw(W: World, ctx: CanvasRenderingContext2D, cam: Camera, you: Sprite | null, lift: number): void {
    this.drawEnemies(ctx, cam);
    this.drawYou(W, ctx, cam, you, lift);
  }

  /** Your bar: jade on the ink track, the shield a grey cap over it, a white flash as a blow lands. */
  private you(W: World, ctx: CanvasRenderingContext2D, cam: Camera, s: Sprite | null, lift: number, b: number): void {
    const hpMax = W.hpMax;
    if (!(hpMax > 0)) return;
    const d = cam.dpr, calm = !!W.settings.reduceMotion;
    const f = Math.max(0, Math.min(1, W.hp / hpMax));
    const w = Math.round(Math.max(BAR_YOU[0] * d, Math.min(BAR_YOU[1] * d, 44 * cam.scale)));
    const h = Math.max(3, Math.round(BAR_YOU[2] * d));
    const top = s ? W.py - lift - s.ay * s.h : W.py - lift - 34;
    const sx = Math.round((W.px - cam.x) * cam.scale + cam.w / 2 - w / 2);
    const sy = Math.round((top - cam.y) * cam.scale + cam.h / 2 - h - 5 * d);
    // the chip (the blow just taken), as the enemies'
    let l = this.youLag;
    if (f >= l || calm) { l = f; this.youHold = 0; }
    else if (this.youHold < CHIP_HOLD) this.youHold += this.dt;
    else l = Math.max(f, l - CHIP_RATE * this.dt);
    if (l > f && this.youHold === 0) this.youHold = 1e-4;
    this.youLag = l;
    const sh = W.shieldV > 0 ? Math.min(1, W.shieldV / hpMax) : 0;
    const ch = sh > 0 ? Math.max(1, Math.round(BAR_YOU[3] * d)) : 0;
    const flash = !calm && W.feel.hurtAge < 0.09 && W.feel.hurtK > 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash ? JADE_FLASH : TRACK;
    ctx.fillRect(sx - b, sy - b - (ch ? ch + b : 0), w + 2 * b, h + 2 * b + (ch ? ch + b : 0));
    if (l > f) { ctx.fillStyle = CHIP; ctx.fillRect(sx + Math.round(w * f), sy, Math.round(w * (l - f)), h); }
    ctx.fillStyle = flash ? '#ffffff' : JADE;
    if (f > 0) ctx.fillRect(sx, sy, Math.max(1, Math.round(w * f)), h);
    if (ch) { ctx.fillStyle = SHIELD; ctx.fillRect(sx, sy - b - ch, Math.max(1, Math.round(w * sh)), ch); }
  }
}

/** One alpha group: all tracks, then all chips, then all fills (red, then gold): 3–4 fillStyle changes. */
function runs(ctx: CanvasRenderingContext2D, L: BarList, b: number, chips: boolean): void {
  const n = L.n, X = L.x, Y = L.y, Wd = L.w, H = L.h, F = L.f;
  ctx.fillStyle = TRACK;
  for (let j = 0; j < n; j++) ctx.fillRect(X[j] - b, Y[j] - b, Wd[j] + 2 * b, H[j] + 2 * b);
  if (chips) {
    ctx.fillStyle = CHIP;
    const Lg = L.l;
    for (let j = 0; j < n; j++) if (Lg[j] > F[j] + 0.004) ctx.fillRect(X[j] + Math.round(Wd[j] * F[j]), Y[j], Math.round(Wd[j] * (Lg[j] - F[j])), H[j]);
  }
  let gold = 0;
  ctx.fillStyle = RED;
  for (let j = 0; j < n; j++) { if (L.gold[j]) { gold++; continue; } ctx.fillRect(X[j], Y[j], Math.max(1, Math.round(Wd[j] * F[j])), H[j]); }
  if (gold) {
    ctx.fillStyle = GOLD;
    for (let j = 0; j < n; j++) if (L.gold[j]) ctx.fillRect(X[j], Y[j], Math.max(1, Math.round(Wd[j] * F[j])), H[j]);
  }
}
