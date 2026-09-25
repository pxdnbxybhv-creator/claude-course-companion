// The 七巧板 table: a sheet of paper with the figure washed in pale ink at the top and the seven
// pieces laid out below. Pieces follow a finger or the mouse; a tap picks a piece and a second tap
// turns it 90° (so does a two-finger twist); they flip, and settle onto lattice points when close. Pure drawing + input; the view
// owns the rules.
import { fillPaper } from '../../../ink/paper';
import { LOCAL, SET, inPoly, maskTriangles, outlineOf, snap, type Mask, type Placed, type Pt } from './geometry';

export const WORLD = { w: 9, h: 11.6 };
/** Where the figure may sit (top area) and the tray below. */
export const FIG_AREA = { y: 0.5, h: 6.2 };

/** Muted pigments, one per piece of SET (大 大 中 小 小 方 斜). */
export const COLORS = ['#4d6479', '#a8784a', '#6b8e74', '#a44f58', '#c49d48', '#5a534a', '#4f7690'];
const INK = [38, 34, 29];

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: [number, number, number], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number];
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** A piece whose outline's bounding box starts at (bx, by). */
export function placedAt(kind: Placed['kind'], rot: number, flip: boolean, bx: number, by: number): Placed {
  const o = outlineOf({ kind, x: 0, y: 0, rot, flip });
  return { kind, rot, flip, x: bx - Math.min(...o.map((p) => p.x)), y: by - Math.min(...o.map((p) => p.y)) };
}

/** A quarter turn from `rot` (45° steps) to the next grid orientation: two steps, or one from an
 *  odd (diagonal) orientation left over from an older save. */
export function quarterTurn(rot: number, dir: 1 | -1): number {
  return (((rot + (rot % 2 ? dir : 2 * dir)) % 8) + 8) % 8;
}

/** The tray: every piece in its resting place. */
export function homePieces(): Placed[] {
  return [
    placedAt('L', 0, false, 0.45, 7.35),
    placedAt('L', 2, false, 2.75, 7.35),
    placedAt('M', 0, false, 0.7, 10.05),
    placedAt('S', 0, false, 3.35, 9.95),
    placedAt('S', 4, false, 4.75, 10.25),
    placedAt('Q', 0, false, 5.35, 7.85),
    placedAt('P', 0, false, 6.75, 7.85),
  ];
}

export interface TableEvents {
  /** A piece was dropped, turned or flipped by hand (already snapped). */
  change(i: number, p: Placed, how: 'drop' | 'turn'): void;
  select(i: number): void;
}

interface Disp { x: number; y: number; a: number; sx: number }
interface Tween { from: Disp; to: Disp; t0: number; ms: number }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const ang = (rot: number) => (rot * Math.PI) / 4;

export class TangramTable {
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private unit = 0;
  private dpr = 1;
  pieces: Placed[] = homePieces();
  private disp: Disp[] = this.pieces.map((p) => ({ x: p.x, y: p.y, a: ang(p.rot), sx: p.flip ? -1 : 1 }));
  private tweens = new Map<number, Tween>();
  /** Paint order, last on top. */
  private z = SET.map((_, i) => i);
  selected = -1;
  reduced = false;
  locked = false;
  private mask: Mask | null = null;
  private off: Pt = { x: 0, y: 0 };
  private inkT0 = 0;
  private inked = false;
  private raf = 0;
  private drag: { id: number; i: number; dx: number; dy: number; x0: number; y0: number; t0: number; moved: boolean; wasSel: boolean } | null = null;
  private second: { id: number; a0: number; acc: number } | null = null;
  private points = new Map<number, Pt>();

  constructor(private canvas: HTMLCanvasElement, private on: TableEvents) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('touchstart', this.onTouchStart);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.unit = r.width / WORLD.w;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.width * (WORLD.h / WORLD.w) * this.dpr);
    this.paintBg();
    this.draw();
  }

  setFigure(mask: Mask, off: Pt): void {
    this.mask = mask;
    this.off = off;
    this.inked = false;
    this.paintBg();
    this.draw();
  }

  /** Paper, and the figure as a pale wash of ink. */
  private paintBg() {
    if (!this.unit) return;
    const b = this.bg;
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const g = b.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    fillPaper(g, WORLD.w * this.unit, WORLD.h * this.unit, 23);
    const u = this.unit;
    // a faint rule between the figure and the tray
    g.strokeStyle = 'rgba(27,25,22,0.1)';
    g.lineWidth = 1;
    g.setLineDash([3, 5]);
    g.beginPath();
    g.moveTo(u * 0.6, u * 7.05);
    g.lineTo(u * (WORLD.w - 0.6), u * 7.05);
    g.stroke();
    g.setLineDash([]);
    if (!this.mask) return;
    g.save();
    g.translate(this.off.x * u, this.off.y * u);
    g.beginPath();
    for (const tri of maskTriangles(this.mask)) {
      // all triangles wound the same way, so the union fills without seams
      const pts = tri.map((p) => ({ x: p.x * u, y: p.y * u }));
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        s += p.x * q.y - q.x * p.y;
      }
      const seq = s < 0 ? pts.slice().reverse() : pts;
      seq.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
    }
    g.fillStyle = 'rgba(40,36,30,0.2)';
    g.shadowColor = 'rgba(40,36,30,0.25)';
    g.shadowBlur = u * 0.12;
    g.fill('nonzero');
    g.restore();
  }

  /** Put pieces where the game says; glide there over `ms` (0 = jump). */
  setPieces(pieces: Placed[], ms = 170, stagger = 0): void {
    const now = performance.now();
    this.pieces = pieces.map((p) => ({ ...p }));
    pieces.forEach((p, i) => {
      if (this.drag?.i === i) return;
      const d = this.disp[i];
      // turn the short way round
      let a = ang(p.rot);
      while (a - d.a > Math.PI) a -= Math.PI * 2;
      while (d.a - a > Math.PI) a += Math.PI * 2;
      const to: Disp = { x: p.x, y: p.y, a, sx: p.flip ? -1 : 1 };
      if (!ms || this.reduced) {
        this.disp[i] = to;
        this.tweens.delete(i);
      } else if (to.x !== d.x || to.y !== d.y || to.a !== d.a || to.sx !== d.sx) {
        this.tweens.set(i, { from: { ...d }, to, t0: now + i * stagger, ms });
      }
    });
    this.kick();
  }

  /** The finished figure turns to ink. */
  setInked(on: boolean): void {
    this.inked = on;
    this.inkT0 = performance.now();
    this.kick();
  }

  raise(i: number): void {
    this.z = [...this.z.filter((k) => k !== i), i];
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    let busy = false;
    for (const [i, tw] of this.tweens) {
      const t = Math.max(0, Math.min(1, (now - tw.t0) / tw.ms));
      const k = easeOut(t);
      const f = tw.from, to = tw.to;
      this.disp[i] = { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k, a: f.a + (to.a - f.a) * k, sx: f.sx + (to.sx - f.sx) * k };
      if (t >= 1) {
        this.disp[i] = { ...to, a: ang(this.pieces[i].rot) };
        this.tweens.delete(i);
      } else busy = true;
    }
    if (this.inked && now - this.inkT0 < 900) busy = true;
    this.draw(now);
    if (busy) this.kick();
  };

  draw(now = performance.now()): void {
    const ctx = this.ctx;
    const u = this.unit;
    if (!u) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const inkK = this.inked ? (this.reduced ? 1 : Math.min(1, (now - this.inkT0) / 800)) : 0;
    for (const i of this.z) {
      const p = this.pieces[i];
      const d = this.disp[i];
      const lifted = this.drag?.i === i && this.drag.moved;
      const base = hexRgb(COLORS[i]);
      const col = mix(base, INK, inkK * 0.92);
      ctx.save();
      ctx.translate(d.x * u, d.y * u);
      ctx.rotate(d.a);
      ctx.scale(Math.abs(d.sx) < 0.02 ? 0.02 * Math.sign(d.sx || 1) : d.sx, 1);
      const pts = LOCAL[p.kind];
      ctx.beginPath();
      pts.forEach((q, k) => (k ? ctx.lineTo(q.x * u, q.y * u) : ctx.moveTo(q.x * u, q.y * u)));
      ctx.closePath();
      ctx.shadowColor = lifted ? 'rgba(30,20,10,0.35)' : 'rgba(30,20,10,0.16)';
      ctx.shadowBlur = u * (lifted ? 0.35 : 0.08);
      ctx.shadowOffsetY = u * (lifted ? 0.12 : 0.03);
      const gr = ctx.createLinearGradient(-u, -u, u, u);
      gr.addColorStop(0, rgb(mix(col, [255, 250, 238], 0.14)));
      gr.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.06)));
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, u * 0.03);
      ctx.strokeStyle = rgb(mix(col, [255, 248, 232], 0.35), 0.55 * (1 - inkK));
      ctx.stroke();
      ctx.restore();
      if (i === this.selected && !this.locked) {
        const o = outlineOf({ ...p, x: d.x, y: d.y });
        ctx.save();
        ctx.beginPath();
        o.forEach((q, k) => (k ? ctx.lineTo(q.x * u, q.y * u) : ctx.moveTo(q.x * u, q.y * u)));
        ctx.closePath();
        ctx.setLineDash([u * 0.12, u * 0.09]);
        ctx.lineWidth = Math.max(1.5, u * 0.05);
        ctx.strokeStyle = 'rgba(185,58,43,0.9)';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ─── input ────────────────────────────────────────────────────────────────────────────────

  private world(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.unit, y: (e.clientY - r.top) / this.unit };
  }

  pieceAt(p: Pt): number {
    for (let k = this.z.length - 1; k >= 0; k--) {
      const i = this.z[k];
      if (inPoly(outlineOf(this.pieces[i]), p.x, p.y)) return i;
    }
    // small pieces are forgiving: the nearest centre within a finger's reach
    let best = -1, bd = 0.42;
    for (const i of this.z) {
      const d = Math.hypot(this.pieces[i].x - p.x, this.pieces[i].y - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private onTouchStart = (e: TouchEvent) => {
    if (this.locked) return;
    if (e.touches.length > 1 && this.drag) {
      e.preventDefault(); // a second finger turns the piece, not the page
      return;
    }
    const t = e.touches[0];
    if (t && this.pieceAt(this.world(t)) >= 0) e.preventDefault();
  };

  private onDown = (e: PointerEvent) => {
    if (this.locked || !this.unit) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = this.world(e);
    this.points.set(e.pointerId, w);
    if (this.drag && !this.second && e.pointerType !== 'mouse') {
      const a = this.points.get(this.drag.id)!;
      this.second = { id: e.pointerId, a0: Math.atan2(w.y - a.y, w.x - a.x), acc: 0 };
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (this.drag) return;
    const i = this.pieceAt(w);
    if (i < 0) return;
    const p = this.pieces[i];
    this.tweens.delete(i);
    this.disp[i] = { x: p.x, y: p.y, a: ang(p.rot), sx: p.flip ? -1 : 1 };
    this.drag = { id: e.pointerId, i, dx: p.x - w.x, dy: p.y - w.y, x0: w.x, y0: w.y, t0: performance.now(), moved: false, wasSel: this.selected === i };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.raise(i);
    this.selected = i;
    this.on.select(i);
    this.draw();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.points.has(e.pointerId)) return;
    const w = this.world(e);
    this.points.set(e.pointerId, w);
    const d = this.drag;
    if (!d) return;
    if (this.second) {
      // two fingers: turn in quarter turns as the angle between them changes
      const a = this.points.get(d.id)!, b = this.points.get(this.second.id)!;
      const now = Math.atan2(b.y - a.y, b.x - a.x);
      let delta = now - this.second.a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const steps = Math.round(delta / (Math.PI / 2));
      if (steps !== this.second.acc) {
        const p = this.pieces[d.i];
        let rot = p.rot;
        for (let k = this.second.acc; k !== steps; k += Math.sign(steps - this.second.acc)) rot = quarterTurn(rot, steps > k ? 1 : -1);
        this.pieces[d.i] = { ...p, rot };
        this.second.acc = steps;
        d.moved = true;
        this.setPieces(this.pieces, 120);
      }
      return;
    }
    if (e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(w.x - d.x0, w.y - d.y0) * this.unit < 6) return;
    d.moved = true;
    const x = Math.max(0.2, Math.min(WORLD.w - 0.2, w.x + d.dx)), y = Math.max(0.2, Math.min(WORLD.h - 0.2, w.y + d.dy));
    this.pieces[d.i] = { ...this.pieces[d.i], x, y };
    this.disp[d.i] = { ...this.disp[d.i], x, y };
    this.kick();
  };

  private onUp = (e: PointerEvent) => {
    this.points.delete(e.pointerId);
    if (this.second && e.pointerId === this.second.id) {
      this.second = null;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.second = null;
    const i = d.i;
    if (!d.moved) {
      // a tap on a piece that wasn't picked only picks it; a tap on the picked piece turns it 90°
      if (!d.wasSel) return;
      const p = this.pieces[i];
      const next = snap({ ...p, rot: quarterTurn(p.rot, 1) }, 0.75);
      this.pieces[i] = next;
      this.setPieces(this.pieces, 150);
      this.on.change(i, next, 'turn');
      return;
    }
    const next = snap(this.pieces[i], 0.36);
    this.pieces[i] = next;
    this.setPieces(this.pieces, 110);
    this.on.change(i, next, 'drop');
  };

  private onCancel = (e: PointerEvent) => {
    this.points.delete(e.pointerId);
    if (this.second?.id === e.pointerId) this.second = null;
    if (this.drag?.id === e.pointerId) {
      const i = this.drag.i;
      this.drag = null;
      const next = snap(this.pieces[i]);
      this.pieces[i] = next;
      this.setPieces(this.pieces, 110);
      this.on.change(i, next, 'drop');
    }
  };
}
