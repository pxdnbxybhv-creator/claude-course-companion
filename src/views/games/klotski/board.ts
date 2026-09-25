// The 华容道 board on a canvas: carved tiles that follow a finger or the mouse along free space,
// turn corners, snap into cells, and glide into place when moved by keys, hints or undo.
import { COLS, ROWS, fits, occupancy, type Piece } from './logic';
import { ASPECT, FRAME, TAIL, cellOrigin, makeTile, paintTray, tilePad } from './paint';

export interface BoardEvents {
  /** A drag or flick ended with piece i somewhere new (a path of free cells led there). */
  move(i: number, x: number, y: number, path: { x: number; y: number }[]): void;
  /** A tap (no drag) on piece i. */
  tap(i: number): void;
  /** A tap on an empty cell of the tray. */
  tapCell?(x: number, y: number): void;
  /** Pointer went down on a piece (for sounds / focus). */
  grab?(i: number): void;
}

interface Drag {
  id: number;
  i: number;
  /** Integer cell the piece currently rests on during the drag. */
  bx: number;
  by: number;
  /** Pointer position (css px) that corresponds to (bx, by). */
  px0: number;
  py0: number;
  /** Fractional offset from (bx, by) along one axis. */
  ox: number;
  oy: number;
  axis: 'x' | 'y' | null;
  startX: number;
  startY: number;
  downX: number;
  downY: number;
  t0: number;
  moved: boolean;
  path: { x: number; y: number }[];
}

interface Glide { fx: number; fy: number; tx: number; ty: number; t0: number; ms: number }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class KlotskiBoard {
  private ctx: CanvasRenderingContext2D;
  private tray = document.createElement('canvas');
  private tiles = new Map<string, HTMLCanvasElement>();
  private cell = 0;
  private dpr = 1;
  private pieces: Piece[] = [];
  /** Displayed (fractional) cell positions per piece index. */
  private disp: { x: number; y: number }[] = [];
  private glides = new Map<number, Glide>();
  private drag: Drag | null = null;
  private emptyTap: { id: number; x: number; y: number } | null = null;
  private raf = 0;
  private exitAnim: { i: number; t0: number; ms: number; done: () => void } | null = null;
  selected = -1;
  hint: { i: number; x: number; y: number } | null = null;
  locked = false;
  reduced = false;
  private hintT0 = 0;

  constructor(private canvas: HTMLCanvasElement, private on: BoardEvents) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('lostpointercapture', this.onLost);
    // A finger that lands on a tile drags it; anywhere else the page scrolls as usual.
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('lostpointercapture', this.onLost);
    c.removeEventListener('touchstart', this.onTouchStart);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const cell = r.width / (COLS + 2 * FRAME);
    this.cell = cell;
    const w = Math.round(r.width * this.dpr), h = Math.round((r.width / ASPECT) * this.dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    this.tray.width = w;
    this.tray.height = h;
    const t = this.tray.getContext('2d')!;
    t.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paintTray(t, cell);
    this.tiles.clear();
    this.draw();
  }

  /** Repaint tiles (e.g. once the brush font has loaded). */
  refreshTiles(): void {
    this.tiles.clear();
    this.draw();
  }

  private tile(p: Piece, lifted: boolean): HTMLCanvasElement {
    const k = `${p.id}|${lifted ? 1 : 0}`;
    let c = this.tiles.get(k);
    if (!c) {
      c = makeTile(p.role, p.w, p.h, this.cell, this.dpr, p.id.charCodeAt(0) * 97 + 13, lifted);
      this.tiles.set(k, c);
    }
    return c;
  }

  /** New positions. `animate` glides pieces that moved (≤ ~180 ms, or 0 with reduced motion). */
  setPieces(pieces: Piece[], animate = true): void {
    const prev = this.disp;
    const same = this.pieces.length === pieces.length && this.pieces.every((p, i) => p.id === pieces[i].id);
    this.pieces = pieces;
    this.disp = pieces.map((p, i) => (same && prev[i] ? { ...prev[i] } : { x: p.x, y: p.y }));
    if (!same) this.glides.clear();
    const now = performance.now();
    pieces.forEach((p, i) => {
      if (this.drag?.i === i) return;
      const d = this.disp[i];
      if (d.x === p.x && d.y === p.y) return;
      if (!animate || this.reduced) {
        d.x = p.x;
        d.y = p.y;
        this.glides.delete(i);
        return;
      }
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      this.glides.set(i, { fx: d.x, fy: d.y, tx: p.x, ty: p.y, t0: now, ms: Math.min(260, 110 + dist * 45) });
    });
    this.kick();
  }

  setHint(h: { i: number; x: number; y: number } | null): void {
    this.hint = h;
    this.hintT0 = performance.now();
    this.kick();
  }

  /** 曹操 walks out through the gap. Resolves when he is gone. */
  exit(i: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.reduced) {
        this.exitAnim = { i, t0: performance.now() - 5000, ms: 1, done: resolve };
      } else this.exitAnim = { i, t0: performance.now(), ms: 1500, done: resolve };
      this.kick();
    });
  }

  clearExit(): void {
    this.exitAnim = null;
    this.draw();
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    let busy = false;
    for (const [i, g] of this.glides) {
      const t = Math.min(1, (now - g.t0) / g.ms);
      const k = easeOut(t);
      const d = this.disp[i];
      if (!d) continue;
      d.x = g.fx + (g.tx - g.fx) * k;
      d.y = g.fy + (g.ty - g.fy) * k;
      if (t >= 1) this.glides.delete(i);
      else busy = true;
    }
    if (this.exitAnim) {
      const e = this.exitAnim;
      const t = Math.min(1, (now - e.t0) / e.ms);
      if (t < 1) busy = true;
      else if (e.done) {
        const done = e.done;
        e.done = null as unknown as () => void;
        done();
      }
    }
    if (this.hint && !this.reduced && now - this.hintT0 < 2400) busy = true;
    this.draw(now);
    if (busy) this.kick();
  };

  draw(now = performance.now()): void {
    const ctx = this.ctx;
    const cell = this.cell;
    if (!cell) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.tray, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const pad = tilePad(cell);

    // hint: where the piece should go, a quiet dashed ghost in cinnabar
    if (this.hint && this.pieces[this.hint.i]) {
      const p = this.pieces[this.hint.i];
      const o = cellOrigin(cell, this.hint.x, this.hint.y);
      const pulse = this.reduced ? 1 : 0.6 + 0.4 * Math.sin(((now - this.hintT0) / 600) * Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.setLineDash([cell * 0.09, cell * 0.07]);
      ctx.lineWidth = Math.max(1.5, cell * 0.035);
      ctx.strokeStyle = '#e0624c';
      const g = cell * 0.08;
      ctx.strokeRect(o.x + g, o.y + g, p.w * cell - g * 2, p.h * cell - g * 2);
      ctx.restore();
    }

    const order = this.pieces.map((_, i) => i).sort((a, b) => (a === this.drag?.i ? 1 : b === this.drag?.i ? -1 : 0));
    const exitI = this.exitAnim?.i ?? -1;
    for (const i of order) {
      const p = this.pieces[i];
      const d = this.disp[i] ?? p;
      let x = d.x, y = d.y, alpha = 1;
      if (i === exitI && this.exitAnim) {
        const t = Math.min(1, (now - this.exitAnim.t0) / this.exitAnim.ms);
        const k = easeInOut(t);
        y = p.y + k * (ROWS - p.y + FRAME + TAIL + 0.4);
        alpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
      }
      const lifted = this.drag?.i === i && this.drag.moved;
      const o = cellOrigin(cell, x, y);
      const img = this.tile(p, lifted);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (i === exitI) {
        // he passes *under* nothing: clip to the gap and the road below it
        ctx.beginPath();
        ctx.rect(0, 0, this.canvas.width, (FRAME + ROWS) * cell);
        ctx.rect((FRAME + 1) * cell, (FRAME + ROWS) * cell - 1, 2 * cell, this.canvas.height);
        ctx.clip();
      }
      ctx.drawImage(img, o.x - pad, o.y - pad - (lifted ? cell * 0.02 : 0), img.width / this.dpr, img.height / this.dpr);
      ctx.restore();
      if (i === this.selected && !this.locked) {
        ctx.save();
        ctx.lineWidth = Math.max(2, cell * 0.045);
        ctx.strokeStyle = 'rgba(214,82,58,0.95)';
        const g = cell * 0.03;
        const r = cell * 0.12;
        const bx = o.x + g, by = o.y + g, bw = p.w * cell - g * 2, bh = p.h * cell - g * 2;
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ─── input ────────────────────────────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Piece under a point (css px), −1 if none. */
  pieceAt(px: number, py: number): number {
    const cx = px / this.cell - FRAME, cy = py / this.cell - FRAME;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const d = this.disp[i] ?? p;
      if (cx >= d.x && cx < d.x + p.w && cy >= d.y && cy < d.y + p.h) return i;
    }
    return -1;
  }

  private onTouchStart = (e: TouchEvent) => {
    if (this.locked || e.touches.length !== 1) return;
    const t = e.touches[0];
    const p = this.local(t);
    if (this.pieceAt(p.x, p.y) >= 0) e.preventDefault();
  };

  private onDown = (e: PointerEvent) => {
    if (this.locked || this.drag || !this.cell) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = this.local(e);
    const i = this.pieceAt(p.x, p.y);
    if (i < 0) {
      this.emptyTap = { id: e.pointerId, x: p.x, y: p.y };
      return;
    }
    const pc = this.pieces[i];
    // finish any glide this piece was in
    this.glides.delete(i);
    this.disp[i] = { x: pc.x, y: pc.y };
    this.drag = {
      id: e.pointerId, i, bx: pc.x, by: pc.y, px0: p.x, py0: p.y, ox: 0, oy: 0, axis: null,
      startX: pc.x, startY: pc.y, downX: p.x, downY: p.y, t0: performance.now(), moved: false, path: [],
    };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.on.grab?.(i);
    this.draw();
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const p = this.local(e);
    if (!d.moved && Math.hypot(p.x - d.downX, p.y - d.downY) < 5) return;
    d.moved = true;
    this.follow(d, p.x, p.y);
    this.disp[d.i] = { x: d.bx + d.ox, y: d.by + d.oy };
    this.kick();
  };

  /** Move the dragged piece toward the pointer through free cells, one cell at a time. */
  private follow(d: Drag, px: number, py: number) {
    const cell = this.cell;
    const occ = occupancy(this.pieces);
    const free = (x: number, y: number) => fits(this.pieces, d.i, x, y, occ);
    for (let guard = 0; guard < 12; guard++) {
      const dx = (px - d.px0) / cell, dy = (py - d.py0) / cell;
      // turning a corner: the tile is past halfway to the next cell, the finger has already pulled
      // off sideways, and that sideways way is open from the next cell — commit the step and turn
      if (d.axis) {
        const a = d.axis;
        const along = a === 'x' ? dx : dy, perp = a === 'x' ? dy : dx;
        const s = Math.sign(along), t = Math.sign(perp);
        const nx = a === 'x' ? d.bx + s : d.bx, ny = a === 'y' ? d.by + s : d.by;
        if (s && t && Math.abs(along) >= 0.5 && Math.abs(along) < 1 && Math.abs(perp) > 0.3 && free(nx, ny) &&
            (a === 'x' ? free(nx, ny + t) : free(nx + t, ny))) {
          d.bx = nx;
          d.by = ny;
          d.path.push({ x: nx, y: ny });
          if (a === 'x') d.px0 += s * cell;
          else d.py0 += s * cell;
          d.axis = a === 'x' ? 'y' : 'x';
          d.ox = d.oy = 0;
          continue;
        }
      }
      // keep the axis while the tile is visibly off its cell; otherwise follow the stronger pull
      let axis = d.axis;
      const off = axis === 'x' ? Math.abs(d.ox) : axis === 'y' ? Math.abs(d.oy) : 0;
      if (!axis || off < 0.12) {
        const ax: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        // prefer an axis the tile can actually move along
        const can = (a: 'x' | 'y') => {
          const s = Math.sign(a === 'x' ? dx : dy);
          return s !== 0 && (a === 'x' ? free(d.bx + s, d.by) : free(d.bx, d.by + s));
        };
        axis = can(ax) ? ax : can(ax === 'x' ? 'y' : 'x') ? (ax === 'x' ? 'y' : 'x') : ax;
      }
      d.axis = axis;
      const v = axis === 'x' ? dx : dy;
      const s = Math.sign(v);
      const nx = axis === 'x' ? d.bx + s : d.bx, ny = axis === 'y' ? d.by + s : d.by;
      if (s !== 0 && Math.abs(v) >= 1 && free(nx, ny)) {
        d.bx = nx;
        d.by = ny;
        d.path.push({ x: nx, y: ny });
        if (axis === 'x') d.px0 += s * cell;
        else d.py0 += s * cell;
        continue;
      }
      const lim = s !== 0 && free(nx, ny) ? 0.999 : 0;
      const o = Math.max(-lim, Math.min(lim, v));
      d.ox = axis === 'x' ? o : 0;
      d.oy = axis === 'y' ? o : 0;
      break;
    }
  }

  private onUp = (e: PointerEvent) => {
    const et = this.emptyTap;
    if (et && et.id === e.pointerId) {
      this.emptyTap = null;
      const p = this.local(e);
      if (Math.hypot(p.x - et.x, p.y - et.y) < 10 && !this.locked) {
        const cx = Math.floor(p.x / this.cell - FRAME), cy = Math.floor(p.y / this.cell - FRAME);
        if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) this.on.tapCell?.(cx, cy);
      }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const p = this.local(e);
    const dt = performance.now() - d.t0;
    if (!d.moved) {
      this.disp[d.i] = { x: d.startX, y: d.startY };
      this.draw();
      this.on.tap(d.i);
      return;
    }
    let fx = d.bx, fy = d.by;
    const off = d.ox || d.oy;
    // snap past the halfway mark — or a quick flick moves on by one
    const flick = dt < 260 && Math.hypot(p.x - d.downX, p.y - d.downY) > this.cell * 0.18;
    if (Math.abs(off) >= 0.4 || (flick && Math.abs(off) > 0.05)) {
      if (d.ox) fx += Math.sign(d.ox);
      else fy += Math.sign(d.oy);
      d.path.push({ x: fx, y: fy });
    }
    this.disp[d.i] = { x: d.bx + d.ox, y: d.by + d.oy };
    if (fx !== d.startX || fy !== d.startY) this.on.move(d.i, fx, fy, d.path);
    else this.setPieces(this.pieces, true);
    this.kick();
  };

  private onCancel = (e: PointerEvent) => {
    if (this.emptyTap?.id === e.pointerId) this.emptyTap = null;
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    // a scroll took over: put the tile back
    this.disp[d.i] = { x: d.bx + d.ox, y: d.by + d.oy };
    this.setPieces(this.pieces, true);
  };

  private onLost = (e: PointerEvent) => {
    if (this.drag && this.drag.id === e.pointerId) this.onUp(e);
  };
}
