// The painted 井字棋 board: a paper canvas onto which the grid, the marks and the winning stroke
// are brushed in one after another (StrokeAnimation). Resizing repaints everything at once.
import { StrokeAnimation, paintStroke } from '../../../ink/brush';
import { fillPaper } from '../../../ink/paper';
import type { Stroke } from '../../../ink/types';
import type { Mark } from './logic';
import { crossStrokes, ensoStrokes, geometry, gridStrokes, markRadius, winStroke } from './paint';

type Item = { kind: 'grid' } | { kind: 'mark'; i: number; m: Mark } | { kind: 'win'; a: number; b: number };

const MS: Record<Item['kind'], number> = { grid: 170, mark: 190, win: 320 };

export class TttBoard {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private bctx = this.base.getContext('2d')!;
  private S = 0;
  private dpr = 1;
  private items: Item[] = [];
  private seed = 1;
  /** Batches waiting to be painted, and the one in flight. */
  private queue: { strokes: Stroke[]; ms: number }[] = [];
  private anim: StrokeAnimation | null = null;
  private raf = 0;
  private last = 0;
  reduced = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  private strokesFor(it: Item, idx: number): Stroke[] {
    const { cell, center } = geometry(this.S);
    const sd = this.seed * 131 + idx * 7919;
    if (it.kind === 'grid') return gridStrokes(this.S, sd);
    if (it.kind === 'mark') return it.m === 'O' ? ensoStrokes(center(it.i), markRadius(cell), sd) : crossStrokes(center(it.i), markRadius(cell), sd);
    return [winStroke(center(it.a), center(it.b), cell, sd)];
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.S = r.width;
    const px = Math.round(this.S * this.dpr);
    this.canvas.width = this.canvas.height = px;
    this.base.width = this.base.height = px;
    // repaint everything at once at the new size
    this.stop();
    this.queue = [];
    this.anim = null;
    this.paper();
    this.items.forEach((it, k) => this.strokesFor(it, k).forEach((st) => paintStroke(this.bctx, st)));
    this.show();
  }

  private paper() {
    const b = this.bctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, this.base.width, this.base.height);
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    fillPaper(b, this.S, this.S, 31);
  }

  /** Fresh paper, then the grid is written in. */
  newGame(seed: number): void {
    this.seed = seed >>> 0;
    this.items = [{ kind: 'grid' }];
    this.stop();
    this.queue = [];
    this.anim = null;
    if (!this.S) return;
    this.paper();
    this.enqueue(this.strokesFor(this.items[0], 0), MS.grid);
  }

  mark(i: number, m: Mark): void {
    this.add({ kind: 'mark', i, m });
  }

  win(a: number, b: number): void {
    this.add({ kind: 'win', a, b });
  }

  private add(it: Item) {
    this.items.push(it);
    if (this.S) this.enqueue(this.strokesFor(it, this.items.length - 1), MS[it.kind]);
  }

  private enqueue(strokes: Stroke[], ms: number) {
    this.queue.push({ strokes, ms });
    if (this.reduced) {
      this.flush();
      return;
    }
    if (!this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** Paint whatever is pending immediately. */
  flush(): void {
    this.anim?.finish();
    this.anim = null;
    for (const q of this.queue) q.strokes.forEach((st) => paintStroke(this.bctx, st));
    this.queue = [];
    this.stop();
    this.show();
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = this.last ? Math.min(64, now - this.last) : 16;
    this.last = now;
    if (!this.anim || this.anim.done) {
      const next = this.queue.shift();
      this.anim = next ? new StrokeAnimation(next.strokes, this.bctx, { msPerStroke: next.ms }) : null;
    }
    this.show();
    if (this.anim) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.anim.step(dt, ctx);
      if (this.anim.done) this.show();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  /** Copy the committed painting to the screen. */
  private show() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Is anything still being painted? */
  get busy(): boolean {
    return (!!this.anim && !this.anim.done) || this.queue.length > 0;
  }
}

