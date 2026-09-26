// 拂花 · brushing the petals in the shrine courtyard (bible §4.3 C5). The courtyard seen from above,
// painted: flagstones, the walls and their gates, and a carpet of fallen petals. Under the petals lie
// six sets of prints at six depths (PRINTS in case.ts, one tenth an hour): drag across the courtyard —
// or hold 「拂」, Space or E — to brush the petals away layer by layer; each set shows itself, and its
// depth, as the brush reaches it. When all six are seen, the clue is found.
//
// Plain DOM and a 2D canvas, mounted in the walk's overlay layer (no preact: the world opens it).
import './case.css';
import { PRINTS, printStamps, type Line, type PrintSet, type Stamp } from '../features/taoyuan/case';

export interface BrushOpts {
  lang: 'zh' | 'en';
  mount(node: HTMLElement): () => void;
  reduced: boolean;
  /** A soft brushing sound (called at most a few times a second while brushing). */
  sound?(): void;
}

export interface BrushSession {
  /** Resolves true once every set is seen, false if closed first. */
  done: Promise<boolean>;
  close(): void;
}

// the courtyard (valley-local metres): x −4.2 … 4.2, z −22.4 (the hall, north, top) … −17.4 (the gate)
const X0 = -4.2, X1 = 4.2, Z0 = -22.4, Z1 = -17.4;
const W = 840, H = 500;
const PX = W / (X1 - X0);
const GX = 84, GZ = 50;
/** Petals over the whole courtyard, in tenths (the oldest print lies under 5½). */
const DEPTH = 6;

const u = (x: number) => (x - X0) * PX;
const v = (z: number) => (z - Z0) * PX;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** The flagstones, dry and pale. */
function paintFloor(): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  g.fillStyle = '#d8d0c0';
  g.fillRect(0, 0, W, H);
  const r = rng(7);
  const rows = 9;
  const rh = H / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * 60;
    while (x < W) {
      const w = 70 + r() * 70;
      const tone = 200 + Math.floor(r() * 22);
      g.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 18})`;
      g.fillRect(x + 2, j * rh + 2, w - 4, rh - 4);
      x += w;
    }
  }
  g.strokeStyle = 'rgba(70, 60, 48, 0.22)';
  g.lineWidth = 2;
  for (let j = 1; j < rows; j++) { g.beginPath(); g.moveTo(0, j * rh); g.lineTo(W, j * rh); g.stroke(); }
  return c;
}

/** The carpet of petals: dense, pink, a few white-edged ones. */
function paintPetals(): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  g.fillStyle = '#efc4cc';
  g.fillRect(0, 0, W, H);
  const r = rng(11);
  const cols = ['#f3b6c4', '#eea3b5', '#f7cfd8', '#f9dde3', '#e897ab', '#f4c0cb'];
  for (let i = 0; i < 5200; i++) {
    const x = r() * W, y = r() * H;
    const s = 5 + r() * 7;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath();
    g.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    if (r() < 0.04) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.4; g.stroke(); }
    g.fillStyle = 'rgba(180, 70, 100, 0.25)';
    g.beginPath();
    g.ellipse(-s * 0.55, 0, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return c;
}

/** The walls (ink), the gaps of the front gate, the side gate and the hall door, and their names. */
function paintWalls(lang: 'zh' | 'en'): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  g.strokeStyle = '#2a2420';
  g.lineCap = 'round';
  g.lineWidth = 14;
  const seg = (x0: number, z0: number, x1: number, z1: number) => { g.beginPath(); g.moveTo(u(x0), v(z0)); g.lineTo(u(x1), v(z1)); g.stroke(); };
  // north: the hall's front, with the door
  g.lineWidth = 18;
  seg(-4.2, -22.4, -0.65, -22.4);
  seg(0.65, -22.4, 4.2, -22.4);
  g.lineWidth = 14;
  // south: the gate
  seg(-4.2, -17.4, -0.85, -17.4);
  seg(0.85, -17.4, 4.2, -17.4);
  // east
  seg(4.2, -22.4, 4.2, -17.4);
  // west, with the side gate
  seg(-4.2, -22.4, -4.2, -21.75);
  seg(-4.2, -20.65, -4.2, -17.4);
  const f = lang === 'zh' ? '"LXGW WenKai", serif' : '"Cormorant Garamond", "LXGW WenKai", serif';
  g.font = `600 28px ${f}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tag = (s: string, x: number, y: number) => {
    g.fillStyle = 'rgba(244, 238, 226, 0.92)';
    const w = g.measureText(s).width + 18;
    g.fillRect(x - w / 2, y - 18, w, 36);
    g.fillStyle = '#2a2420';
    g.fillText(s, x, y + 1);
  };
  tag(lang === 'zh' ? '殿门' : 'Hall door', u(0), 24);
  tag(lang === 'zh' ? '前门' : 'Gate', u(0), H - 24);
  // the side gate on the west wall: upright characters, one above the other (or turned, in English)
  if (lang === 'zh') {
    g.fillStyle = 'rgba(244, 238, 226, 0.92)';
    g.fillRect(8, v(-21.2) - 36, 36, 72);
    g.fillStyle = '#2a2420';
    g.fillText('侧', 26, v(-21.2) - 16);
    g.fillText('门', 26, v(-21.2) + 17);
  } else {
    g.save();
    g.translate(26, v(-21.2));
    g.rotate(-Math.PI / 2);
    tag('Side gate', 0, 0);
    g.restore();
  }
  return c;
}

/** One print at its place (the canvas already in metres → px). */
function stamp(g: CanvasRenderingContext2D, s: Stamp, alpha: number): void {
  if (alpha <= 0.01) return;
  g.save();
  g.translate(u(s.x), v(s.z));
  // (a heading of 0 walks +z, down the page)
  g.rotate(-s.a);
  g.globalAlpha = alpha;
  g.fillStyle = '#1f1a17';
  const L = 0.27 * PX, Wd = 0.1 * PX;
  switch (s.kind) {
    case 'boot':
      g.beginPath();
      g.ellipse(0, 0, Wd * 0.55, L * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'sandal': {
      g.beginPath();
      g.ellipse(0, 0, Wd * 0.55, L * 0.48, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(216, 208, 192, 0.8)';
      g.lineWidth = 1.2;
      for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-Wd * 0.5, k * L * 0.12); g.lineTo(Wd * 0.5, k * L * 0.12 + 2); g.stroke(); }
      break;
    }
    case 'clog':
      // two square teeth across the sole
      g.fillRect(-Wd * 0.55, -L * 0.42, Wd * 1.1, L * 0.2);
      g.fillRect(-Wd * 0.55, L * 0.22, Wd * 1.1, L * 0.2);
      break;
    case 'patched':
      // the front tooth square; the rear tooth rounded (mended)
      g.fillRect(-Wd * 0.55, L * 0.22, Wd * 1.1, L * 0.2);
      g.beginPath();
      g.ellipse(0, -L * 0.32, Wd * 0.58, L * 0.11, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'cane':
      g.beginPath();
      g.arc(0, 0, 0.035 * PX, 0, Math.PI * 2);
      g.fill();
      break;
  }
  g.restore();
}

interface SetState { p: PrintSet; stamps: Stamp[]; cells: number[]; seen: boolean; row: HTMLLIElement }

export function brushCourtyard(o: BrushOpts): BrushSession {
  const tr = (l: Line) => (o.lang === 'zh' ? l.zh : l.en);
  const root = document.createElement('div');
  root.className = 'case-brush';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', o.lang === 'zh' ? '庭中落花' : 'Petals in the courtyard');
  const panel = document.createElement('div');
  panel.className = 'case-brush-panel';
  root.appendChild(panel);
  const head = document.createElement('div');
  head.className = 'case-brush-head';
  const h = document.createElement('h3');
  h.textContent = o.lang === 'zh' ? '庭中落花' : 'Petals in the courtyard';
  const lead = document.createElement('p');
  lead.textContent = o.lang === 'zh' ? '在院中拂开落花；或按住「拂」。一个钟头落一分，越深的足迹，越早。' : 'Brush the petals aside with a finger or the mouse — or hold Brush. One tenth falls each hour: the deeper the prints, the older.';
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'case-brush-x';
  x.setAttribute('aria-label', o.lang === 'zh' ? '收起' : 'Close');
  x.textContent = '✕';
  head.append(h, x);
  const [view, g] = canvas(W, H);
  view.className = 'case-brush-canvas';
  const legend = document.createElement('ol');
  legend.className = 'case-brush-legend';
  const bar = document.createElement('div');
  bar.className = 'case-brush-bar';
  const hold = document.createElement('button');
  hold.type = 'button';
  hold.className = 'case-brush-hold';
  hold.innerHTML = `<span class="brush" aria-hidden="true">拂</span><span>${o.lang === 'zh' ? '按住拂花' : 'Hold to brush'}</span>`;
  const status = document.createElement('p');
  status.className = 'case-brush-status';
  status.setAttribute('role', 'status');
  bar.append(hold, status);
  panel.append(head, lead, view, legend, bar);

  // ── what lies where
  const floor = paintFloor();
  const petals = paintPetals();
  const walls = paintWalls(o.lang);
  const [mask, mg] = canvas(GX, GZ);
  const img = mg.createImageData(GX, GZ);
  const [tmp, tg] = canvas(W, H);
  /** Petals brushed away per cell, in tenths. */
  const cleared = new Float32Array(GX * GZ);
  const cellOf = (x: number, z: number) => {
    const i = Math.max(0, Math.min(GX - 1, Math.floor(((x - X0) / (X1 - X0)) * GX)));
    const j = Math.max(0, Math.min(GZ - 1, Math.floor(((z - Z0) / (Z1 - Z0)) * GZ)));
    return j * GX + i;
  };
  const sets: SetState[] = PRINTS.map((p) => {
    const stamps = printStamps(p);
    const row = document.createElement('li');
    legend.appendChild(row);
    return { p, stamps, cells: stamps.map((s) => cellOf(s.x, s.z)), seen: false, row };
  });
  const label = (s: SetState) => {
    s.row.classList.toggle('is-seen', s.seen);
    s.row.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = s.seen ? tr(s.p.coverName) : '？';
    const t = document.createElement('span');
    t.textContent = s.seen ? tr(s.p.name) : (o.lang === 'zh' ? '（还埋在落花底下）' : '(still under the petals)');
    s.row.append(b, t);
  };
  sets.forEach(label);

  // ── drawing
  let dirty = true;
  function draw(): void {
    // the petals left, as a mask: thick where untouched, thin where brushed
    for (let k = 0; k < GX * GZ; k++) {
      // (the carpet thins as soon as the brush touches it; a whisper of pink is left above the oldest prints)
      const left = Math.max(0, DEPTH - cleared[k]);
      const a = left <= 0.02 ? 0 : 0.16 + 0.84 * (left / DEPTH);
      img.data[k * 4 + 3] = Math.round(a * 250);
    }
    mg.putImageData(img, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(floor, 0, 0);
    tg.globalCompositeOperation = 'copy';
    tg.imageSmoothingEnabled = true;
    tg.drawImage(mask, 0, 0, W, H);
    tg.globalCompositeOperation = 'source-in';
    tg.drawImage(petals, 0, 0);
    g.drawImage(tmp, 0, 0);
    // the prints the brush has reached (each lies on the surface of its own layer)
    for (const s of sets) {
      for (let i = 0; i < s.stamps.length; i++) {
        const e = cleared[s.cells[i]] - s.p.cover;
        const a = s.p.cover === 0 ? 0.82 : Math.max(0, Math.min(1, (e + 0.55) / 0.55)) * 0.85;
        stamp(g, s.stamps[i], a);
      }
    }
    g.globalAlpha = 1;
    // the depth of each set once seen, beside it
    g.font = `600 27px ${o.lang === 'zh' ? '"LXGW WenKai", serif' : '"Cormorant Garamond", serif'}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of sets) {
      if (!s.seen || !s.stamps.length) continue;
      const m = s.stamps[Math.floor(s.stamps.length * 0.45)];
      const tx = Math.max(40, Math.min(W - 40, u(m.x) + 34)), ty = Math.max(40, Math.min(H - 40, v(m.z) - 20));
      const txt = tr(s.p.coverName);
      const w = g.measureText(txt).width + 16;
      g.fillStyle = 'rgba(185, 58, 43, 0.92)';
      g.fillRect(tx - w / 2, ty - 17, w, 34);
      g.fillStyle = '#fbf3e6';
      g.fillText(txt, tx, ty + 1);
    }
    g.drawImage(walls, 0, 0);
    dirty = false;
  }

  // ── the brush
  function brushAt(x: number, z: number, radius: number, amount: number): void {
    const r2 = radius * radius;
    const ci0 = Math.floor(((x - radius - X0) / (X1 - X0)) * GX), ci1 = Math.ceil(((x + radius - X0) / (X1 - X0)) * GX);
    const cj0 = Math.floor(((z - radius - Z0) / (Z1 - Z0)) * GZ), cj1 = Math.ceil(((z + radius - Z0) / (Z1 - Z0)) * GZ);
    for (let j = Math.max(0, cj0); j <= Math.min(GZ - 1, cj1); j++) {
      for (let i = Math.max(0, ci0); i <= Math.min(GX - 1, ci1); i++) {
        const cx = X0 + ((i + 0.5) / GX) * (X1 - X0), cz = Z0 + ((j + 0.5) / GZ) * (Z1 - Z0);
        const d2 = (cx - x) * (cx - x) + (cz - z) * (cz - z);
        if (d2 > r2) continue;
        const k = j * GX + i;
        // (the brush lifts the petals; it never scrapes the prints away: stop at the ground)
        cleared[k] = Math.min(DEPTH, cleared[k] + amount * (1 - Math.sqrt(d2) / radius));
      }
    }
    dirty = true;
  }

  let finished = false;
  let resolveDone: (v: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => { resolveDone = r; });
  function check(): void {
    let changed = false;
    for (const s of sets) {
      if (s.seen) continue;
      const n = s.cells.filter((c) => cleared[c] >= s.p.cover - 0.05).length;
      if (s.p.cover === 0 || n >= s.cells.length * 0.6) { s.seen = true; label(s); changed = true; }
    }
    const seen = sets.filter((s) => s.seen).length;
    status.textContent = o.lang === 'zh' ? `已见 ${seen} / ${sets.length} 行足迹` : `${seen} of ${sets.length} sets of prints seen`;
    if (changed) dirty = true;
    if (seen === sets.length && !finished) {
      finished = true;
      status.textContent = o.lang === 'zh' ? '六行足迹，都看清了。' : 'All six sets of prints are plain to see.';
      root.classList.add('is-done');
      setTimeout(() => finish(true), o.reduced ? 500 : 1500);
    }
  }

  // pointer: brush where the finger or the mouse is while pressed
  let pointer: { x: number; z: number } | null = null;
  const toLocal = (e: PointerEvent) => {
    const r = view.getBoundingClientRect();
    return { x: X0 + ((e.clientX - r.left) / r.width) * (X1 - X0), z: Z0 + ((e.clientY - r.top) / r.height) * (Z1 - Z0) };
  };
  const down = (e: PointerEvent) => { e.preventDefault(); try { view.setPointerCapture(e.pointerId); } catch { /* ok */ } pointer = toLocal(e); };
  const move = (e: PointerEvent) => { if (pointer) pointer = toLocal(e); };
  const up = () => { pointer = null; };
  view.addEventListener('pointerdown', down);
  view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);

  // hold: a broom sweeps across the whole courtyard, to and fro
  let holding = false;
  let sweep = 0;
  const holdOn = (e?: Event) => { e?.preventDefault(); holding = true; hold.classList.add('is-on'); };
  const holdOff = () => { holding = false; hold.classList.remove('is-on'); };
  hold.addEventListener('pointerdown', holdOn);
  hold.addEventListener('pointerup', holdOff);
  hold.addEventListener('pointerleave', holdOff);
  hold.addEventListener('pointercancel', holdOff);
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keydown') holdOn(); else holdOff();
      return;
    }
    // (the walk's own keys wait while the courtyard is open)
    if (/^(Key[WASDQMVP]|Arrow|Shift)/.test(e.code)) e.stopPropagation();
  };
  window.addEventListener('keydown', key, true);
  window.addEventListener('keyup', key, true);
  x.addEventListener('click', () => finish(false));

  let last = performance.now();
  let soundAt = 0;
  let raf = 0;
  const tick = (now: number) => {
    // (a slow device brushes in real time too, never in slow motion)
    const dt = Math.min(0.15, (now - last) / 1000);
    last = now;
    let brushing = false;
    if (pointer) { brushAt(pointer.x, pointer.z, 0.5, 6.2 * dt); brushing = true; }
    if (holding) {
      // a band 1.7 m wide sweeping across at 4 m/s, back and forth
      sweep += dt * 4;
      const span = X1 - X0 + 1.6;
      const k = sweep % (span * 2);
      const bx = X0 - 0.8 + (k < span ? k : span * 2 - k);
      for (let z = Z0 + 0.3; z < Z1; z += 0.55) brushAt(bx, z, 0.85, 6 * dt);
      brushing = true;
    }
    if (brushing && now > soundAt) { soundAt = now + 260; try { o.sound?.(); } catch { /* muted */ } }
    if (brushing) check();
    if (dirty) draw();
    if (!closed) raf = requestAnimationFrame(tick);
  };
  let off: () => void = () => {};
  let closed = false;
  function finish(ok: boolean): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('keyup', key, true);
    root.classList.add('is-out');
    const o2 = off;
    off = () => {};
    setTimeout(() => o2(), 260);
    resolveDone(ok);
  }
  check();
  draw();
  off = o.mount(root);
  requestAnimationFrame(() => { root.classList.add('is-on'); hold.focus({ preventScroll: true }); });
  raf = requestAnimationFrame(tick);
  return { done, close: () => finish(false) };
}
