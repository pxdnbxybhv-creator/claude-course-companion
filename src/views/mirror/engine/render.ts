// 水月幻镜 · the frame's drawing (GDD §20, §24.3): setTransform + drawImage from the painter's
// atlases, in the contract's order: arena → telegraphs → zones → drops → enemies → summons → player
// → player shots → enemy shots → effects → numbers → light, low-HP edge and titles. No shadowBlur,
// filters or per-frame gradients (the two overlay masks are baked once). A null sprite draws as a
// plain ink circle, so the game is playable before (or without) the art.
import type { AtlasId, Camera, NumStyle, Painter, Sprite } from '../types';
import { blit, blitRot } from '../paint/draw';
import { EKind, SMode } from './pools';
import { DROP_ATLAS, PROJ_ATLAS, SK, SUMMON_ATLAS, SWORDS_ON_SCREEN, TAU } from './consts';
import { ST } from './enemies';
import type { World } from './world';

const NUM_STYLE: readonly NumStyle[] = ['hit', 'crit', 'heal', 'moon', 'coin', 'player'];
const FX_BASE: Record<string, number> = { beamRay: 64, boltChain: 32, swordStreak: 40, slashArc: 32 };

/** Everything the renderer keeps between frames (made once, reused). */
export class Renderer {
  private light: HTMLCanvasElement | null = null;
  private edge: HTMLCanvasElement | null = null;
  private edgeKey = '';
  private atlasCache = new Map<string, AtlasId>();

  constructor(private painter: Painter) {}

  setPainter(p: Painter): void { this.painter = p; }

  private sprite(id: AtlasId, v = 0): Sprite | null {
    try { return this.painter.sprite(id, v); } catch { return null; }
  }

  draw(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    const P = this.painter;
    const lang = W.settings.lang;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    P.drawArena(ctx, cam);
    // telegraphs: wet ink filling (fullness = time spent)
    const T = W.T;
    for (let i = 0; i < T.n; i++) if (T.alive[i]) P.drawTele(ctx, cam, T.shape[i], Math.min(1, T.t[i] / T.dur[i]));
    // zones (washes)
    const Z = W.Z;
    for (let i = 0; i < Z.n; i++) {
      if (!Z.alive[i] || !Z.look[i]) continue;
      const fade = Math.min(1, Z.life[i] / 0.4, (Z.life0[i] - Z.life[i]) / 0.2 + 0.2);
      P.drawZone(ctx, cam, Z.look[i] as never, Z.x[i], Z.y[i], Z.r[i], (Z.side[i] ? 0.6 : 0.7) * fade * (W.degrade ? 0.6 : 1));
    }
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
    // drops
    const D = W.D;
    const tt = W.t;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      const id = DROP_ATLAS[k];
      const v = id === 'drop:cashCoin' ? Math.floor(tt * 8 + i) & 3 : 0;
      const s = this.sprite(id, v);
      const bob = D.age[i] < 0.25 ? Math.sin((D.age[i] / 0.25) * Math.PI) * 10 : 0;
      if (s) blit(ctx, cam, s, D.x[i], D.y[i] - bob, D.worth[i] >= 5 && k === 0 ? 1.4 : 1);
      else circle(ctx, cam, D.x[i], D.y[i] - bob, k <= 1 ? 4 : 7, k >= 7 ? '#b8862b' : '#e8eef2');
    }
    // enemies
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
    // summons
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
    // swords: 剑匣 blades, 残剑 and the idle ring
    this.drawSwords(W, ctx, cam);
    // the player
    this.drawPlayer(W, ctx, cam);
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
    // player shots
    const PS = W.PS;
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
      if (s) blitRot(ctx, cam, s, PS.x[i], y, ang, sz, pa);
      else circle(ctx, cam, PS.x[i], y, PS.r[i] * 0.7, '#3f6f8f', pa);
    }
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
    // numbers
    const N = W.N;
    for (let i = 0; i < N.n; i++) {
      if (!N.alive[i]) continue;
      const a = N.t[i] < 0.6 ? 1 : 1 - (N.t[i] - 0.6) / 0.2;
      const sx = (N.x[i] - cam.x) * cam.scale + cam.w / 2, sy = (N.y[i] - cam.y) * cam.scale + cam.h / 2;
      P.drawNumber(ctx, N.v[i], sx, sy, NUM_STYLE[N.style[i]] ?? 'hit', Math.max(0, a), lang);
    }
    // skill reticle
    if (W.skillPreview) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = (W.skillPreview.x - cam.x) * cam.scale + cam.w / 2, sy = (W.skillPreview.y - cam.y) * cam.scale + cam.h / 2;
      ctx.strokeStyle = 'rgba(192,65,47,0.7)';
      ctx.lineWidth = 2 * cam.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 26 * cam.dpr, 0, TAU); ctx.stroke();
    }
    this.overlays(W, ctx, cam);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
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
    const flash = E.flash[i] > 0 && !W.settings.reduceMotion;
    const s = id ? (flash ? this.painter.flash(id, v) : this.sprite(id, v)) : null;
    const flip = Math.cos(E.face[i]) < 0;
    const scale = E.r[i] / Math.max(1, E.r0[i]);
    const air = E.air[i] ? 10 : 0;
    const a = E.untarget[i] ? 0.45 : k === EKind.Ally || E.charmT[i] > 0 ? 0.85 : 1;
    if (s) blit(ctx, cam, s, E.x[i], E.y[i] - air, scale, flip, a, 1 + (E.st[i] === ST.act ? 0.08 : 0), 1 - (tell ? 0.08 : 0));
    else circle(ctx, cam, E.x[i], E.y[i] - air, E.r[i], flash ? '#ffffff' : k === EKind.Elite ? '#5a4012' : k === EKind.Boss ? '#12141a' : k === EKind.Treasure ? '#d9a62e' : '#1d2430', a);
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
    if (s) blit(ctx, cam, s, W.px, W.py - lift, 1, flip, a);
    else circle(ctx, cam, W.px, W.py - lift, 14, '#f4f1e8', a);
    // weapons held around you, pointing at the last attack
    const n = W.slots.length;
    const dir = W.lastDir < 1e8 ? W.lastDir : W.face;
    for (let k = 0; k < n; k++) {
      const sl = W.slots[k];
      if (sl.kind === 'orbit' || sl.kind === 'familiar') continue;
      const ws = this.sprite(`wpn:${sl.id}` as AtlasId);
      if (!ws) continue;
      const a0 = (k / n) * TAU + W.t * 0.4;
      blitRot(ctx, cam, ws, W.px + Math.cos(a0) * 24, W.py - lift + Math.sin(a0) * 18, dir, 0.55, 0.9);
    }
    if (W.shieldV > 0) this.mark(ctx, cam, 'fx:shieldBubble', W.px, W.py - lift, 0.9);
    // the hitbox: a small vermilion dot at the centre (GDD §20)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (W.px - cam.x) * cam.scale + cam.w / 2, sy = (W.py - lift - cam.y) * cam.scale + cam.h / 2;
    ctx.fillStyle = '#d63a22';
    ctx.fillRect(sx - 1.5 * cam.dpr, sy - 1.5 * cam.dpr, 3 * cam.dpr, 3 * cam.dpr);
  }

  private overlays(W: World, ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // darkness (暗月, 天狗食月): a baked soft hole around you
    if (W.lightR !== null) {
      const R = W.lightR * cam.scale;
      if (!this.light) this.light = makeLight();
      const sx = (W.px - cam.x) * cam.scale + cam.w / 2, sy = (W.py - cam.y) * cam.scale + cam.h / 2;
      ctx.fillStyle = 'rgba(8,8,12,0.92)';
      ctx.fillRect(0, 0, cam.w, Math.max(0, sy - R)); ctx.fillRect(0, sy + R, cam.w, Math.max(0, cam.h - sy - R));
      ctx.fillRect(0, sy - R, Math.max(0, sx - R), 2 * R); ctx.fillRect(sx + R, sy - R, Math.max(0, cam.w - sx - R), 2 * R);
      if (this.light) ctx.drawImage(this.light, sx - R, sy - R, 2 * R, 2 * R);
    }
    // low HP browns the paper's edge
    if (W.hp < W.hpMax * 0.3 && W.phase === 'wave') {
      const key = `${cam.w}x${cam.h}`;
      if (!this.edge || this.edgeKey !== key) { this.edge = makeEdge(cam.w, cam.h); this.edgeKey = key; }
      if (this.edge) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(W.t * 5); ctx.drawImage(this.edge, 0, 0); ctx.globalAlpha = 1; }
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
/** The low-HP edge: brown at the rim (baked per screen size). */
function makeEdge(w: number, h: number): HTMLCanvasElement | null {
  const c = canvas(w, h);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const r = Math.hypot(w, h) / 2;
  const grad = g.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
  grad.addColorStop(0, 'rgba(120,60,20,0)');
  grad.addColorStop(1, 'rgba(120,60,20,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}
