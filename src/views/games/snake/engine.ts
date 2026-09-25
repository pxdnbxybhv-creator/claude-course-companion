// The running 贪吃蛇: owns the canvas, steps the logic at the game speed and paints at 60 fps,
// interpolating the brushstroke between ticks. The view talks to it through a few methods and
// hears back through `on` callbacks.
import { audio } from '../../../audio/engine';
import { PIGMENTS } from '../../../ink/types';
import {
  createGame, queueTurn, step, tickMs, DIRS,
  type BonusKind, type Cell, type Dir, type SnakeState, type StepEvents,
} from './logic';
import { inkSplash, paintBoard, paintSnake, smoothSpine, sprite, type P } from './paint';

export type Phase = 'ready' | 'playing' | 'paused' | 'over';

export interface EngineHooks {
  phase(p: Phase): void;
  score(score: number): void;
  /** A tick's events (sound and toasts are the view's business only for festival treats). */
  event?(ev: StepEvents, s: SnakeState): void;
  over(s: SnakeState): void;
}

export interface EngineOptions {
  wrap: boolean;
  bonusKind: BonusKind;
  moon: boolean;
  reduced: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; a: number; va: number; born: number; life: number; kind: 'petal' | 'gold' | 'text'; size: number; text?: string }

export const COLS = 17;
export const ROWS = 17;

export class SnakeEngine {
  private ctx: CanvasRenderingContext2D;
  private layer = document.createElement('canvas');
  private lctx = this.layer.getContext('2d')!;
  private board: HTMLCanvasElement | null = null;
  private boardKey = '';
  private W = 0; // css px
  private H = 0;
  private dpr = 1;
  private cell = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private seedBase = (Date.now() ^ 0x5eed) >>> 0;
  private games = 0;

  state!: SnakeState;
  private prev!: SnakeState;
  phase: Phase = 'ready';
  private foodBorn = 0;
  private bonusBorn = 0;
  private particles: Particle[] = [];
  private tongueAt = 2;
  private splash: { c: HTMLCanvasElement; x: number; y: number; t0: number; size: number } | null = null;
  private crash: { dir: Cell; t0: number } | null = null;
  private next: Partial<EngineOptions> = {};

  constructor(private canvas: HTMLCanvasElement, private o: EngineOptions, private on: EngineHooks) {
    this.ctx = canvas.getContext('2d')!;
    this.reset();
  }

  // ── control ────────────────────────────────────────────────────────────────

  reset(opts?: Partial<EngineOptions>): void {
    this.o = { ...this.o, ...this.next, ...opts };
    this.next = {};
    this.games++;
    this.state = createGame({ cols: COLS, rows: ROWS, wrap: this.o.wrap, bonusKind: this.o.bonusKind, seed: (this.seedBase + this.games * 7919) >>> 0 });
    this.prev = this.state;
    this.acc = 0;
    this.particles = [];
    this.splash = null;
    this.crash = null;
    this.foodBorn = this.time;
    this.setPhase('ready');
    this.on.score(0);
  }

  private setPhase(p: Phase) {
    if (this.phase === p) return;
    this.phase = p;
    this.on.phase(p);
  }

  /** Steer (arrows, WASD, swipe, pad). Starts or resumes the game. */
  turn(d: Dir): void {
    if (this.phase === 'over') return;
    const n = queueTurn(this.state, d);
    if (n) this.state = n;
    if (this.phase !== 'playing') this.play();
  }

  play(): void {
    if (this.phase === 'over') return;
    this.last = 0;
    this.setPhase('playing');
  }

  pause(): void {
    if (this.phase === 'playing') this.setPhase('paused');
  }

  toggle(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'over') this.reset();
    else this.play();
  }

  /** Options for the next game only (e.g. a mode picked mid-run), applied at the next reset. */
  setNext(opts: Partial<EngineOptions>): void {
    this.next = { ...this.next, ...opts };
  }

  /** A run worth keeping is under way (switching modes now would throw it away). */
  get inProgress(): boolean {
    return (this.phase === 'playing' || this.phase === 'paused') && this.state.score > 0;
  }

  setOptions(opts: Partial<EngineOptions>): void {
    this.o = { ...this.o, ...opts };
    this.boardKey = '';
  }

  // ── sizing & loop ──────────────────────────────────────────────────────────

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.W = r.width;
    this.H = r.height;
    this.cell = this.W / COLS;
    const pw = Math.round(this.W * this.dpr), ph = Math.round(this.H * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.layer.width = pw;
    this.layer.height = ph;
    this.boardKey = '';
    this.draw();
  }

  start(): void {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.last ? Math.min(100, now - this.last) : 16;
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(dt: number) {
    this.time += dt / 1000;
    if (this.phase === 'playing') {
      this.acc += dt;
      let tick = tickMs(this.state.eaten);
      while (this.acc >= tick && this.phase === 'playing') {
        this.acc -= tick;
        this.advance();
        tick = tickMs(this.state.eaten);
      }
    }
    this.draw();
  }

  private advance() {
    const before = this.state;
    const r = step(before);
    this.prev = before;
    this.state = r.state;
    const ev = r.events;
    this.on.event?.(ev, this.state);
    const c = this.cell;
    if (ev.ate === 'food' && before.food) {
      this.foodBorn = this.time;
      this.burst(before.food, 'petal', 5);
      // the melody climbs a pentatonic step with every blossom; a phrase ends every ten
      const n = this.state.eaten;
      audio.pluck((n - 1) % 10, 0.55 + Math.min(0.3, n * 0.01));
      if (n % 10 === 0) audio.chime(Math.min(4, n / 10));
      this.on.score(this.state.score);
    }
    if (ev.ate === 'bonus' && before.bonus) {
      this.burst(before.bonus.cell, 'gold', 9);
      this.particles.push({ x: (before.bonus.cell.x + 0.5) * c, y: before.bonus.cell.y * c, vx: 0, vy: -c * 1.2, a: 0, va: 0, born: this.time, life: 1.1, kind: 'text', size: c * 0.8, text: `+${ev.points}` });
      audio.chime(2);
      this.on.score(this.state.score);
    }
    if (ev.bonusSpawned) this.bonusBorn = this.time;
    if (ev.died) {
      const h = before.body[0];
      const d = DIRS[this.state.dir];
      this.crash = { dir: d, t0: this.time };
      const at = { x: (h.x + 0.5 + d.x * 0.45) * c, y: (h.y + 0.5 + d.y * 0.45) * c };
      const size = c * 6;
      this.splash = { c: inkSplash(size, this.dpr, (this.games * 131 + this.state.ticks) >>> 0, d.x, d.y), x: at.x, y: at.y, t0: this.time, size };
      audio.knock();
      this.prev = this.state;
      this.setPhase('over');
      this.on.over(this.state);
    } else if (this.state.won) {
      audio.chime(5);
      this.prev = this.state;
      this.setPhase('over');
      this.on.over(this.state);
    }
  }

  private burst(cell: Cell, kind: 'petal' | 'gold', n: number) {
    if (this.o.reduced) return;
    const c = this.cell;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = c * (1.2 + Math.random() * 1.4);
      this.particles.push({
        x: (cell.x + 0.5) * c, y: (cell.y + 0.5) * c, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - c * 0.4,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 6, born: this.time, life: 0.7 + Math.random() * 0.4, kind,
        size: c * (kind === 'petal' ? 0.2 : 0.09) * (0.8 + Math.random() * 0.4),
      });
    }
  }

  // ── painting ───────────────────────────────────────────────────────────────

  private ensureBoard() {
    const key = `${this.canvas.width}x${this.canvas.height}|${this.o.wrap}|${this.o.moon}`;
    if (this.board && this.boardKey === key) return;
    const b = this.board ?? document.createElement('canvas');
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const bctx = b.getContext('2d')!;
    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paintBoard(bctx, this.W, this.H, COLS, ROWS, { wrap: this.o.wrap, moon: this.o.moon });
    this.board = b;
    this.boardKey = key;
  }

  /** The snake's centre line in board px (continuous across a wrap), head first. */
  private spine(f: number): P[] {
    const s = this.state, p = this.prev, c = this.cell;
    const wrap = s.wrap;
    const near = (q: Cell, ref: { x: number; y: number }) => {
      let x = q.x, y = q.y;
      if (wrap) {
        if (x - ref.x > s.cols / 2) x -= s.cols;
        else if (ref.x - x > s.cols / 2) x += s.cols;
        if (y - ref.y > s.rows / 2) y -= s.rows;
        else if (ref.y - y > s.rows / 2) y += s.rows;
      }
      return { x, y };
    };
    const pts: { x: number; y: number }[] = [];
    if (p === s || p.body === s.body) {
      let ref = s.body[0] as { x: number; y: number };
      if (this.crash) {
        const e = this.o.reduced ? 1 : Math.min(1, (this.time - this.crash.t0) / 0.12);
        pts.push({ x: ref.x + this.crash.dir.x * 0.42 * e, y: ref.y + this.crash.dir.y * 0.42 * e });
      }
      for (const b of s.body) {
        ref = near(b, ref);
        pts.push(ref);
      }
    } else {
      const grew = s.body.length > p.body.length;
      const h0 = p.body[0];
      const h1 = near(s.body[0], h0);
      pts.push({ x: h0.x + (h1.x - h0.x) * f, y: h0.y + (h1.y - h0.y) * f });
      let ref: { x: number; y: number } = h0;
      pts.push(h0);
      const m = p.body.length;
      const upto = grew ? m - 1 : m - 2;
      for (let i = 1; i <= upto; i++) {
        ref = near(p.body[i], ref);
        pts.push(ref);
      }
      if (!grew && m >= 2) {
        const tail = near(p.body[m - 1], ref);
        pts.push({ x: tail.x + (ref.x - tail.x) * f, y: tail.y + (ref.y - tail.y) * f });
      }
    }
    return smoothSpine(pts.map((q) => ({ x: (q.x + 0.5) * c, y: (q.y + 0.5) * c })), Math.max(1.5, c / 7));
  }

  draw(): void {
    if (!this.W) return;
    this.ensureBoard();
    const ctx = this.ctx, dpr = this.dpr, c = this.cell, t = this.time, s = this.state;
    const reduced = this.o.reduced;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.board!, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // food: a plum blossom opening where it lands
    if (s.food) {
      const k = reduced ? 1 : Math.min(1, (t - this.foodBorn) / 0.5);
      const e = 1 - Math.pow(1 - k, 3);
      const sway = reduced ? 0 : Math.sin(t * 0.9 + s.food.x) * 0.06;
      this.blit(sprite('blossom', c * 1.3, dpr, (s.eaten % 3)), s.food, c * 1.3 * (0.45 + 0.55 * e), sway, e);
    }
    // the golden bonus: glows softly, fades out as its time runs short
    if (s.bonus) {
      const b = s.bonus;
      const f = this.phase === 'playing' ? this.acc / tickMs(s.eaten) : 0;
      const left = b.ttl - f;
      const fade = Math.max(0, Math.min(1, left / 14));
      const k = reduced ? 1 : Math.min(1, (t - this.bonusBorn) / 0.6);
      const e = 1 - Math.pow(1 - k, 3);
      const cx = (b.cell.x + 0.5) * c, cy = (b.cell.y + 0.5) * c;
      const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 2.4);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c * 1.3);
      g.addColorStop(0, `rgba(217,166,46,${(0.28 * fade * e * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(217,166,46,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - c * 1.4, cy - c * 1.4, c * 2.8, c * 2.8);
      this.blit(sprite(b.kind, c * 1.45, dpr), b.cell, c * 1.45 * (0.5 + 0.5 * e), reduced ? 0 : Math.sin(t * 1.3) * 0.08, fade * e);
    }

    // the snake
    const f = this.phase === 'playing' ? Math.min(1, this.acc / tickMs(s.eaten)) : 0;
    const spine = this.spine(f);
    const travel = (s.ticks + f) * c;
    // tongue: flicks now and then, and when food is close ahead
    let tongue = 0;
    if (!reduced && this.phase !== 'over') {
      if (t > this.tongueAt + 0.4) {
        const h = s.body[0], fd = s.food;
        const near = fd && Math.abs(fd.x - h.x) + Math.abs(fd.y - h.y) <= 3;
        this.tongueAt = t + (near ? 0.5 + Math.random() * 0.6 : 2.5 + Math.random() * 3.5);
      }
      const k = (t - this.tongueAt) / 0.4;
      if (k > 0 && k < 1) tongue = Math.sin(k * Math.PI);
    }
    const look = {
      cell: c, travel, time: t, tongue,
      sway: reduced ? 0 : 1,
      breathe: reduced || this.phase === 'playing' ? 0 : 1,
      dead: this.phase === 'over' && !s.won,
    };
    const L = this.lctx;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.clearRect(0, 0, this.layer.width, this.layer.height);
    L.setTransform(dpr, 0, 0, dpr, 0, 0);
    // in wrap mode the stroke may leave one edge and re-enter at the other: paint the copies too
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const q of spine) {
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
    const pad = c;
    for (const ox of [0, -this.W, this.W]) {
      for (const oy of [0, -this.H, this.H]) {
        if ((ox || oy) && !s.wrap) continue;
        if (maxX + ox < -pad || minX + ox > this.W + pad || maxY + oy < -pad || minY + oy > this.H + pad) continue;
        const sp = ox || oy ? spine.map((q) => ({ x: q.x + ox, y: q.y + oy })) : spine;
        paintSnake(L, sp, look, this.layer.width, this.layer.height);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // particles: petals scatter, gold specks, a floating +N
    if (this.particles.length) {
      const alive: Particle[] = [];
      for (const p of this.particles) {
        const age = t - p.born;
        if (age > p.life) continue;
        alive.push(p);
        const k = age / p.life;
        const x = p.x + p.vx * age * (1 - k * 0.5), y = p.y + p.vy * age * (1 - k * 0.5) + (p.kind === 'text' ? 0 : c * 0.6 * age * age);
        ctx.globalAlpha = (1 - k) * (1 - k);
        if (p.kind === 'text') {
          ctx.fillStyle = '#7a5518';
          ctx.font = `600 ${Math.round(p.size)}px 'Cormorant Garamond', Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.fillText(p.text!, x, y);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.a + p.va * age);
          ctx.fillStyle = p.kind === 'petal' ? PIGMENTS.rouge : PIGMENTS.gamboge;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      this.particles = alive;
    }

    // the ink splash at the crash
    if (this.splash) {
      const sp = this.splash;
      const k = reduced ? 1 : Math.min(1, (t - sp.t0) / 0.35);
      const e = 1 - Math.pow(1 - k, 3);
      const size = sp.size * (0.55 + 0.45 * e);
      ctx.globalAlpha = Math.min(1, 0.3 + e);
      ctx.drawImage(sp.c, sp.x - size / 2, sp.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  /** Where the game ended, as a fraction of the board height (0 top … 1 bottom), or null. */
  crashY(): number | null {
    return this.splash && this.H ? this.splash.y / this.H : null;
  }

  private blit(img: HTMLCanvasElement, cell: Cell, size: number, rot: number, alpha: number) {
    if (alpha <= 0.01 || size <= 0.5) return;
    const ctx = this.ctx, c = this.cell;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate((cell.x + 0.5) * c, (cell.y + 0.5) * c);
    ctx.rotate(rot);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}
