// 开篇 · the compositor: every frame is render(t), a pure function of film time over cached layers
// (spec §4 "How a frame is made"). The exceptions are the Weather sim, the incense smoke and the
// petal burst, which reset at their shot's start (the lab simulates them from there).
//
// World holds the layers and layouts for one viewport; each shot has a draw function. Layers are
// painted by the stage's deadline queue (Film.ts registers the jobs from JOBS below); a shot whose
// layer is missing draws its fallback or leaves that layer out.
import type { Cut, Tier } from '../../../app/intro';
import type { Backdrop } from '../../../ink/landscape';
import type { SceneEnv } from '../../../ink/scene-types';
import type { Drawing, Stroke } from '../../../ink/types';
import { paintBackdrop, paintPond } from '../../../ink/landscape';
import { paintStroke, rasterize } from '../../../ink/brush';
import { plantDrawing } from '../../../ink/plants';
import { Weather } from '../../../ink/weather';
import { fillPaper } from '../../../ink/paper';
import { makeRng } from '../../../core/rng';
import { ENSO, SPINE, BLOT, CX, CY } from '../../garden/enso-paths';
import { beatTable, montageAt, pondMix, reflectedRabbit, POND_STATES, litOf } from '../beats';
import { CUTS, END_SHIFT, shotAt, type ShotId } from '../shots';
import type { RenderFlags } from '../stage';
import { C, ctxOf, ease, layer, mk, release, span, window01, type Lay, type PaintJob } from './util';
import { drawGlints, drawRim, earthLayout, paintEarth, type EarthLayout } from './earth';
import { notebookLayout, paintNotebook, drawPondStrokes, type NotebookLayout } from './notebook';
import { clearMoonCache, drawMoon, drawMoonReflection, dustPuff } from './moon';
import { clearRabbitCache, drawRabbit, drawEnvelope, rabbitSprite, RABBIT_POSES } from './rabbit';
import { drawFigure, drawBrushTip, drawSlip } from './figure';
import { drawRings } from './rings';
import type { StudySet } from './study';
/** The study (S7–S7c, S7s) and the mirror kit it draws with load after the tap, in their own chunk. */
type StudyMod = typeof import('./study');
import * as moonground from './moonground';
import * as letter from './letter';
import type { CountrySet } from './country';
/** S11's painted strip (and the walk's preview it crops) loads late, in its own chunk. */
type CountryMod = typeof import('./country');

export interface WorldOpts {
  lay: Lay; cut: Cut; tier: Tier; seal: string; dark: boolean; env: SceneEnv;
  /** The viewer's garden: its canvas rect (viewport css px) and a snapshot, once taken. */
  garden?: GardenLanding | null;
}

export interface GardenLanding {
  rect: { x: number; y: number; w: number; h: number };
  snap: HTMLCanvasElement | null;
  pond: { x: number; y: number } | null;
  body: { kind: 'sun' | 'moon'; x: number; y: number; r: number } | null;
  title: DOMRect | null;
  mail: DOMRect | null;
  /** The header's date row (viewport css px), kept covered until the film's date lands on it. */
  date?: DOMRect | null;
  /** The app's own paper colour behind the header (body background). */
  bg?: string;
}

/** Everything a frame is drawn from. */
export class World {
  lay: Lay; cut: Cut; tier: Tier; seal: string; dark: boolean; env: SceneEnv;
  earthL: EarthLayout;
  nb: NotebookLayout;
  earth: HTMLCanvasElement | null = null;
  earth2: HTMLCanvasElement | null = null;
  notebook: HTMLCanvasElement | null = null;
  night: Backdrop | null = null;
  ponds: HTMLCanvasElement[] | null = null;
  plumD: Drawing;
  plumAt: { x: number; y: number };
  plum: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; n: number } | null = null;
  pale: HTMLCanvasElement | null = null;
  portrait: HTMLCanvasElement | null = null;
  sealMoon: HTMLCanvasElement | null = null;
  sealName: HTMLCanvasElement | null = null;
  study: StudySet | null = null;
  studyMod: StudyMod | null = null;
  sky: HTMLCanvasElement | null = null;
  ground: moonground.MoonGround | null = null;
  letter: letter.LetterSet | null = null;
  country: CountrySet | null = null;
  countryMod: CountryMod | null = null;
  garden: GardenLanding | null = null;
  weather: Weather | null = null;
  weatherT = -1;
  burstDone = false;
  flags: RenderFlags;
  /** Film time of stage taps (small rings on the paper). */
  taps: { x: number; y: number; t: number }[] = [];
  moonAt: { x: number; y: number; r: number };
  reflAt: { x: number; y: number; r: number };

  constructor(o: WorldOpts, flags: RenderFlags) {
    this.lay = o.lay; this.cut = o.cut; this.tier = o.tier; this.seal = o.seal; this.dark = o.dark; this.env = o.env;
    this.flags = flags;
    this.garden = o.garden ?? null;
    this.earthL = earthLayout(o.lay);
    this.nb = notebookLayout(o.lay);
    const { w, h, P } = o.lay;
    this.plumD = plantDrawing({ kind: 'plum', seed: 11, height: Math.round(h * (P ? 0.44 : 0.5)) });
    const pondTop = h * (P ? 0.61 : 0.63);
    this.plumAt = { x: w * (P ? 0.24 : 0.2), y: pondTop - 0.02 * h };
    this.moonAt = P ? { x: 0.64 * w, y: 0.15 * h, r: 0.14 * w } : { x: 0.74 * w, y: 0.16 * h, r: 0.065 * h };
    this.reflAt = { x: this.moonAt.x, y: h * (P ? 0.7 : 0.76), r: this.moonAt.r * 0.62 };
  }

  get pondTop(): number { return this.night?.pondTop ?? this.lay.h * (this.lay.P ? 0.61 : 0.63); }

  dispose(): void {
    for (const c of [this.earth, this.earth2, this.notebook, this.night?.canvas, this.pale, this.plum?.c, this.sky, ...(this.ponds ?? [])]) release(c);
    this.study?.dispose(); this.ground?.dispose(); this.letter?.dispose(); this.country?.dispose();
    release(this.garden?.snap);
    // the film's module caches never outlive it
    clearRabbitCache(); clearMoonCache(); releaseScratch();
  }
}

// ---------------------------------------------------------------------------------------------- jobs

export interface JobSpec { id: string; layer: string; from: number; neededBy: number; make: (w: World) => PaintJob | Promise<PaintJob> }

const soft = (lay: Lay): Lay => ({ ...lay, dpr: lay.dpr });
const nightDpr = (lay: Lay) => Math.min(lay.dpr, 1.5);

/** Every paint the film needs, with its keep-rule start and its deadline (film s), by cut. */
export function jobsFor(cut: Cut): JobSpec[] {
  const full = cut === 'full';
  const sh = END_SHIFT[cut];
  const J: JobSpec[] = [
    { id: 'earth', layer: 'earth', from: 0, neededBy: 3.9, make: (w) => withDone(paintEarth(soft(w.lay)), (c) => { w.earth = c; }) },
    { id: 'notebook', layer: 'notebook', from: 0, neededBy: 7.9, make: (w) => withDone(paintNotebook(w.lay), (c) => { w.notebook = c; }) },
    { id: 'night', layer: 'night', from: 0, neededBy: 18.0, make: (w) => nightJob(w) },
    // after the limb match (3.5–4.3), never on it
    { id: 'ponds', layer: 'ponds', from: 4.4, neededBy: 20.0, make: (w) => pondJob(w) },
    { id: 'plum', layer: 'plum', from: 7.9, neededBy: 21.6, make: (w) => plumJob(w) },
    // (under the title card: no frame at a shot boundary ever builds a sprite)
    { id: 'rabbit', layer: 'rabbit', from: 0, neededBy: 33.0, make: (w) => rabbitJob(w, false) },
    { id: 'rabbitBack', layer: 'rabbit', from: full ? 60.6 : 49.3, neededBy: full ? 67.1 : 54.2, make: (w) => rabbitJob(w, true) },
    // after the #66 bloom (39.5) settles; the module (and the mirror kit) is fetched then
    { id: 'study', layer: 'study', from: 40.6, neededBy: 49.2, make: async (w) => { const m = await loadStudy(w); return withSet(m.paintStudy(w.lay, cut), (s) => { w.study = s; }); } },
  ];
  if (full) {
    J.push(
      { id: 'sky', layer: 'sky', from: 55.7, neededBy: 57.9, make: async (w) => { const m = await loadStudy(w); return withDone(m.paintSky(w.lay), (c) => { w.sky = c; }); } },
      { id: 'moonground', layer: 'moonground', from: 55.7, neededBy: 60.5, make: (w) => withSet(moonground.paintGround(w.lay), (s) => { w.ground = s; }) },
      { id: 'earth2', layer: 'earth2', from: 60.5, neededBy: 67.1, make: (w) => withDone(paintEarth(soft(w.lay), 0xea58), (c) => { w.earth2 = c; }) },
      { id: 'letter', layer: 'letter', from: 60.5, neededBy: 71.4, make: (w) => withSet(letter.paintLetter(w.lay), (s) => { w.letter = s; }) },
      { id: 'country', layer: 'country', from: 67.1, neededBy: 74.4, make: async (w) => { const m = (w.countryMod ??= await import('./country')); return withSet(m.paintCountry(w.lay, 'full'), (s) => { w.country = s; }); } },
    );
  } else {
    J.push(
      { id: 'earth2', layer: 'earth2', from: 49.2, neededBy: 54.2, make: (w) => withDone(paintEarth(soft(w.lay), 0xea58), (c) => { w.earth2 = c; }) },
      { id: 'country', layer: 'country', from: 54.2, neededBy: 59.5, make: async (w) => { const m = (w.countryMod ??= await import('./country')); return withSet(m.paintCountry(w.lay, 'short'), (s) => { w.country = s; }); } },
    );
  }
  void sh;
  return J;
}

async function loadStudy(w: World): Promise<StudyMod> {
  if (!w.studyMod) w.studyMod = await import('./study');
  return w.studyMod;
}

function withDone(j: PaintJob, done: (c: HTMLCanvasElement) => void): PaintJob {
  return { canvas: j.canvas, steps: [...j.steps, () => done(j.canvas)] };
}

function withSet<T extends { canvas: HTMLCanvasElement; steps: (() => void)[] }>(j: T, done: (s: T) => void): PaintJob {
  return { canvas: j.canvas, steps: [...j.steps, () => done(j)] };
}

function nightJob(w: World): PaintJob {
  const holder = mk(1, 1);
  return {
    canvas: holder,
    steps: [() => {
      const env: SceneEnv = { ...w.env, tod: 'night', hour: 0, moonPhase: 0.02, clarity: 1, seed: 1127 };
      w.night = paintBackdrop(w.lay.w, w.lay.h, nightDpr(w.lay), env);
    }],
  };
}

function pondJob(w: World): PaintJob {
  const holder = mk(1, 1);
  const out: HTMLCanvasElement[] = [];
  const steps = POND_STATES.map((cl) => () => {
    if (!w.night) throw new Error('night first');
    const { w: W, h: H } = w.lay;
    const dpr = nightDpr(w.lay);
    const top = w.night.pondTop;
    const PH = H * 1.25 - top;
    const c = mk(W * dpr, PH * dpr);
    const g = ctxOf(c);
    g.scale(dpr, dpr);
    g.translate(0, -top);
    fillPaper(g, W, H * 1.25, 1127);
    g.drawImage(w.night.canvas, 0, top * dpr, W * dpr, (H - top) * dpr, 0, top, W, H - top);
    paintPond(g, { x: 0, y: top, w: W, h: PH, t: 0, source: w.night.canvas, mirrorY: top, clarity: cl, dpr, seed: 1127, tod: 'night', body: null, cache: false });
    out.push(c);
  });
  steps.push(() => { w.ponds = out; });
  return { canvas: holder, steps };
}

function plumJob(w: World): PaintJob {
  const d = w.plumD;
  const dpr = w.lay.dpr;
  const { c, g } = layer(d.width, d.height, dpr);
  return {
    canvas: c,
    steps: [
      () => { w.plum = { c, g, n: 0 }; },
      () => { w.pale = rasterize(d, beatTable()[7].growth, dpr, 0.6); },
    ],
  };
}

/** Every rabbit sprite the film draws, at the sizes it draws them (so no frame ever builds one). */
function rabbitJob(w: World, big: boolean): PaintJob {
  const { P, h } = w.lay;
  const sizes: [typeof RABBIT_POSES[number], number][] = big
    ? [['back', P ? h * 0.48 : h * 0.5]]
    : [
      ['pound', P ? 70 : 90], ['stand', P ? 64 : 86], ['crouch', P ? 64 : 86], ['stretch', (P ? 52 : 64) * 1.45],
      ['ride', P ? 52 : 64], ['shake0', P ? 36 : 46], ['shake1', P ? 36 : 46], ['shake2', P ? 36 : 46], ['sit', P ? 36 : 46], ['crouch', P ? 36 : 46], ['stretch', P ? 36 : 46],
    ];
  return { canvas: mk(1, 1), steps: sizes.map(([p, s]) => () => void rabbitSprite(p, s, w.lay.dpr)) };
}

// ---------------------------------------------------------------------------------------------- the frame

export interface FrameOut {
  /** CSS transform for the stage wrapper (S3's push moves the canvas and the page's DOM text together). */
  stage: string;
  /** Stage opacity (the takeover fades the film in over the gate). */
  alpha: number;
  shot: ShotId;
}

const cam = (g: CanvasRenderingContext2D, s: number, ox: number, oy: number, tx = 0, ty = 0) => {
  g.translate(ox + tx, oy + ty);
  g.scale(s, s);
  g.translate(-ox, -oy);
};

/** render(t): draw the frame at film time t onto g (css px, dpr already applied). */
export function renderFrame(g: CanvasRenderingContext2D, W: World, t: number): FrameOut {
  const { w, h } = W.lay;
  const { shot } = shotAt(W.cut, t);
  g.save();
  // S12 paints its own ground: at the settle it clears to the app beneath (§4 S12)
  if (shot.id === 'S12') g.clearRect(0, 0, w, h);
  else { g.fillStyle = C.paper; g.fillRect(0, 0, w, h); }
  let out: FrameOut = { stage: 'none', alpha: 1, shot: shot.id };
  try {
    switch (shot.id) {
      case 'S1': case 'S2': drawS2(g, W, t); out.alpha = t >= 3.85 ? 1 : 0; break; // opaque beneath the gate's 3.9–4.3 fade (a two-sided fade lets the app show through)
      case 'S3': out.stage = drawS3(g, W, t); break;
      case 'S4': case 'S5': case 'S6': drawGarden(g, W, t); break;
      case 'S7': if (W.studyMod) W.studyMod.drawS7(g, W, t); else drawNightGardenStill(g, W, 49.0); break;
      case 'S7c': if (W.studyMod) W.studyMod.drawS7c(g, W, t); else { g.fillStyle = C.sky; g.fillRect(0, 0, w, h); } break;
      case 'S7s': if (W.studyMod) W.studyMod.drawS7s(g, W, t); else drawNightGardenStill(g, W, 49.0); break;
      case 'S8': moonground.drawS8(g, W, t); break;
      case 'S9': case 'S9s': drawS9(g, W, t, shot.id === 'S9s'); break;
      case 'S10':
        // the 0.3 s cross-dissolve from S9 belongs to S10 (S9's layers stay alive until S10 ends)
        if (t < 71.7) { drawS9(g, W, 71.4, false); g.save(); g.globalAlpha = span(t, 71.4, 71.7); letter.drawS10(g, W, t); g.restore(); }
        else letter.drawS10(g, W, t);
        break;
      case 'S11': case 'S11s': if (W.countryMod) W.countryMod.drawS11(g, W, t, shot.id === 'S11s' || !W.flags.countryDrift); break;
      case 'S12': drawS12(g, W, t - END_SHIFT[W.cut]); break;
    }
  } catch (e) {
    console.warn('[intro] frame', shot.id, e);
  }
  // stage taps: a small RING on the paper, no sound
  for (const tp of W.taps) drawRings(g, tp.x, tp.y, Math.min(w, h) * 0.08, t - tp.t, { color: '40,50,66', alpha: 0.7 });
  g.restore();
  return out;
}

// ---------------------------------------------------------------------------------------------- S2

function drawS2(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const L = W.earthL;
  const drift = 0.02 * h * ease.s(span(t, 4.3, 7.9));
  const push = 1 + 6 * ease.in(span(t, 7.3, 7.9));
  g.save();
  cam(g, push, L.square.x, L.square.y + drift);
  if (W.earth) g.drawImage(W.earth, 0, -0.04 * h + drift, w, h * 1.04);
  else { g.fillStyle = C.night; g.fillRect(0, 0, w, h); }
  drawGlints(g, L, t, drift);
  g.restore();
  // the rim is the moon under the viewer: it does not drift, and the push leaves it behind
  g.save();
  cam(g, 1 + 1.5 * ease.in(span(t, 7.3, 7.9)), w / 2, 0, 0, -h * 0.3 * ease.in(span(t, 7.3, 7.9)));
  drawRim(g, w, h);
  g.restore();
}

// ---------------------------------------------------------------------------------------------- S3

function s3Push(W: World, t: number): { s: number; ox: number; oy: number } {
  const p = W.nb.pond;
  if (!W.lay.P) {
    // landscape: the pond, Q1, the slip and L1 sit on the right page's top; the camera goes to them
    // (1.0 → 1.7 over 8.6–14.5 about the right page's top, then the slow drift), so they fill the frame
    const s = 1 + 0.7 * ease.io(span(t, 8.6, 14.5)) + 0.06 * ease.s(span(t, 14.5, 19.0));
    return { s, ox: 0.82 * W.lay.w, oy: 0.1 * W.lay.h }; // (L1 at 0.86 w stays left of the 「略过」 chip)
  }
  const s = 1 + 0.06 * ease.s(span(t, 8.6, 19.0));
  return { s, ox: (p.x0 + p.x1) / 2, oy: (p.y0 + p.y1) / 2 };
}

function drawS3(g: CanvasRenderingContext2D, W: World, t: number): string {
  const { w, h } = W.lay;
  // 7.9–8.6: paper bleeds out of the square glint over the pushed earth
  if (t < 8.6) {
    drawS2(g, W, 7.9);
    const u = ease.out(span(t, 7.9, 8.6));
    const m = bleedMask(w, h, W.earthL.square.x, W.earthL.square.y, u, 0x71);
    const tmp = scratch(w, h, W.lay.dpr);
    tmp.g.save();
    tmp.g.clearRect(0, 0, w, h);
    drawPage(tmp.g, W, t);
    tmp.g.globalCompositeOperation = 'destination-in';
    tmp.g.drawImage(m, 0, 0, w, h);
    tmp.g.restore();
    g.drawImage(tmp.c, 0, 0, w, h);
    return 'none';
  }
  drawPage(g, W, t);
  const { s, ox, oy } = s3Push(W, t);
  return `translate(${ox}px,${oy}px) scale(${s.toFixed(4)}) translate(${-ox}px,${-oy}px)`;
}

/** The page with the drawn pond, its moon (94 %), the thunder's rings, the slip and the brush tip. */
function drawPage(g: CanvasRenderingContext2D, W: World, t: number, noMoon = false): void {
  const { w, h } = W.lay;
  const N = W.nb;
  if (W.notebook) g.drawImage(W.notebook, 0, 0, w, h);
  else { g.fillStyle = C.page; g.fillRect(0, 0, w, h); }
  const p = N.pond;
  g.save();
  g.beginPath(); g.rect(p.x0 + 3, p.y0 + 3, p.x1 - p.x0 - 5, p.y1 - p.y0 - 6); g.clip();
  const m = N.moon;
  if (noMoon) { g.restore(); return; }
  // soft: drawn a little transparent, as a wash in the drawing
  const tremble = [9, 10, 11].reduce((a, k, i) => a + Math.max(0, 1 - Math.abs(t - k - 0.2) / 0.6) * (0.9 - i * 0.3), 0);
  drawMoon(g, m.x + Math.sin(t * 9) * tremble * 1.2, m.y, m.r, 0.43, { maria: true, halo: 0.7, alpha: 0.9, earth: 0.1 });
  g.strokeStyle = 'rgba(40,58,78,.3)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 2; i++) { g.beginPath(); g.ellipse(m.x, m.y + m.r * 1.35 + i * 7, m.r * (1.3 + i * 0.5), m.r * (0.22 + i * 0.08), 0, 0, Math.PI * 2); g.stroke(); }
  for (const k of [9, 10, 11]) drawRings(g, m.x, m.y + m.r * 0.2, m.r * 2.2, t - k, { color: '40,58,78', alpha: 0.6 - (k - 9) * 0.2, px: 0.9 });
  g.restore();
  // the slip, laid blank at 15.6; the brush tip writes 半 (15.8–16.1) and 亩 (16.1–16.4), then leaves
  if (t >= 15.6) {
    const s = N.slip;
    const a = t < 19.0 ? span(t, 15.6, 15.8) : 1 - span(t, 19.0, 19.3);
    drawSlip(g, s.x0, s.y0, s.x1, s.y1, a);
    const px = W.lay.P ? 15 : 17;
    const cx = (s.x0 + s.x1) / 2;
    const gy0 = s.y0 + (s.y1 - s.y0) * 0.5 - px * 1.05;
    g.save();
    g.globalAlpha *= a;
    g.fillStyle = 'rgba(27,25,22,.9)';
    g.font = `${px}px "Ma Shan Zheng", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    let tipY = gy0;
    ['半', '亩'].forEach((ch, i) => {
      const a0 = 15.8 + i * 0.3, u = span(t, a0, a0 + 0.3);
      if (u <= 0) return;
      const y = gy0 + i * px * 1.1;
      g.save();
      g.beginPath(); g.rect(cx - px, y - 2, px * 2, (px * 1.1 + 2) * u); g.clip();
      g.fillText(ch, cx, y);
      g.restore();
      if (u < 1) tipY = y + px * u;
    });
    g.restore();
    if (t >= 15.6 && t < 16.8) {
      // comes in from the lower right, writes, leaves
      const inU = ease.out(span(t, 15.6, 15.8)), outU = ease.in(span(t, 16.4, 16.8));
      const writing = t >= 15.8 && t < 16.4;
      const wob = writing ? Math.sin(t * 40) * 2 : 0;
      const tx = cx + 3 + wob + (1 - inU) * w * 0.3 + outU * w * 0.35;
      const ty = (writing ? tipY : gy0 + px * 2.2) + (1 - inU) * h * 0.2 + outU * h * 0.25;
      drawBrushTip(g, tx, ty, W.lay.P ? 64 : 80, Math.min(inU * 1.2, 1 - outU * 0.6));
    }
  }
}

/** The --ink-p multi-radial bleed as an alpha mask (white where revealed). */
function bleedMask(w: number, h: number, x: number, y: number, u: number, seed: number): HTMLCanvasElement {
  const m = scratch2(w * 0.25, h * 0.25);
  const g = m.g;
  g.setTransform(0.25, 0, 0, 0.25, 0, 0);
  g.clearRect(0, 0, w, h);
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * 1.15;
  const r = makeRng(seed);
  const blobs = [[0, 0, 1], ...Array.from({ length: 6 }, () => [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.55 + r() * 0.35])];
  for (const [dx, dy, k] of blobs) {
    const cx = x + dx * reach * u, cy = y + dy * reach * u, rr = Math.max(1, reach * u * k);
    const grd = g.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
  }
  return m.c;
}

/** S4's rising front as an alpha mask at ¼ size (the upscale softens it): below the bank it fades in (`a0`);
 *  above, a smooth ragged curve (fixed, no jitter) with a feathered edge climbs from the bank line to the top. */
function riseMask(w: number, h: number, bank: number, u: number, a0: number): HTMLCanvasElement {
  const m = scratch2(w * 0.25, h * 0.25);
  const g = m.g;
  g.setTransform(0.25, 0, 0, 0.25, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(255,255,255,${a0})`;
  g.fillRect(0, bank, w, h - bank);
  const front = bank - (bank + 140) * u;
  const r = makeRng(0xf00);
  const n = 9;
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) ys.push(front + Math.sin(i * 1.7) * 22 + (r() - 0.5) * 30 + Math.sin(i * 0.6) * 26);
  const soft = 36;
  for (let k = 0; k < 6; k++) {
    const off = -soft / 2 + (soft * k) / 5;
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.moveTo(-10, bank + 12);
    g.lineTo(-10, ys[0] + off);
    for (let i = 0; i < n; i++) {
      const x0 = (w * i) / n, x1 = (w * (i + 1)) / n;
      g.quadraticCurveTo(x0, ys[i] + off, (x0 + x1) / 2, (ys[i] + ys[i + 1]) / 2 + off);
    }
    g.lineTo(w + 10, ys[n] + off);
    g.lineTo(w + 10, bank + 12);
    g.closePath();
    g.fill();
  }
  // under the front it is fully revealed (the feather above only)
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(-10, bank + 12);
  g.lineTo(-10, ys[0] + soft / 2);
  for (let i = 0; i < n; i++) {
    const x0 = (w * i) / n, x1 = (w * (i + 1)) / n;
    g.quadraticCurveTo(x0, ys[i] + soft / 2, (x0 + x1) / 2, (ys[i] + ys[i + 1]) / 2 + soft / 2);
  }
  g.lineTo(w + 10, ys[n] + soft / 2);
  g.lineTo(w + 10, bank + 12);
  g.closePath();
  g.fill();
  return m.c;
}

let scr: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; key: string } | null = null;
/** A frame-sized scratch canvas at the stage dpr (reused). */
export function scratch(w: number, h: number, dpr: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const key = `${w}|${h}|${dpr}`;
  if (!scr || scr.key !== key) {
    const c = mk(w * dpr, h * dpr);
    scr = { c, g: ctxOf(c), key };
  }
  scr.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return scr;
}
/** Release the frame scratch canvases (S3–S4 are done with them; the landing makes them again). */
export function releaseScratch(): void {
  release(scr?.c); release(scr2?.c);
  scr = null; scr2 = null;
}
let scr2: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; key: string } | null = null;
function scratch2(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const key = `${Math.round(w)}|${Math.round(h)}`;
  if (!scr2 || scr2.key !== key) {
    const c = mk(w, h);
    scr2 = { c, g: ctxOf(c), key };
  }
  return scr2;
}

// ---------------------------------------------------------------------------------------------- S4–S6: the garden

/** The pond's reflection of the sky moon, and whether the camera has panned (S6). */
function gardenCam(W: World, t: number): { dy: number; s: number; ox: number; oy: number } {
  const { P, h } = W.lay;
  const u = ease.io(span(t, 41.5, 43.5));
  // (0.24 h: the sky moon leaves the frame whole, never a sliver at the top edge; S7's pan starts from here)
  if (P) return { dy: -0.24 * h * u, s: 1, ox: 0, oy: 0 };
  return { dy: 0, s: 1 + 0.14 * u, ox: W.reflAt.x, oy: W.reflAt.y };
}

function drawGarden(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  const M = montageAt(t);
  const top = W.pondTop;
  // S4 19.0–20.0: push ×3 into the margin pond, aimed so the page's moon lands where the garden's reflection
  // will be (its water then fills the backdrop's pond band); the moon wheels in its water
  if (t < 21.6) {
    const N = W.nb;
    const P0 = s3Push(W, 19.0);
    const s0 = P0.s;
    const e = ease.io(span(t, 19.0, 20.0));
    const s = s0 * (1 + 2 * e);
    const m = N.moon, re = W.reflAt;
    // page point q → A + q·s: at 19.0 exactly S3's push (A0 = O(1 − s0)); at 20.0 the moon on the reflection
    const A0x = P0.ox * (1 - s0), A0y = P0.oy * (1 - s0);
    const A1x = re.x - m.x * s0 * 3, A1y = re.y - m.y * s0 * 3;
    const Ax = A0x + (A1x - A0x) * e, Ay = A0y + (A1y - A0y) * e;
    g.save();
    g.translate(Ax, Ay);
    g.scale(s, s);
    drawPage(g, W, 19.3, true);
    drawPondStrokes(g, N, 1);
    g.restore();
    // 20.2–21.6: the garden climbs out of the water: a soft ragged ink front rises from the bank line
    if (t >= 20.2) {
      const u = ease.io(span(t, 20.2, 21.6));
      const tmp = scratch(w, h, W.lay.dpr);
      tmp.g.save();
      tmp.g.clearRect(0, 0, w, h);
      drawNightGarden(tmp.g, W, t, M, true);
      tmp.g.globalCompositeOperation = 'destination-in';
      tmp.g.drawImage(riseMask(w, h, top, u, ease.io(span(t, 20.2, 20.7))), 0, 0, w, h);
      tmp.g.restore();
      g.drawImage(tmp.c, 0, 0, w, h);
    }
    // the moon in the water: the page's own disc, kept at its size (a reflection does not grow as you near
    // the water), wheels 94 % → full → new → 4 % (19.6–20.8), then hands over to the garden's reflection
    const wu = ease.io(span(t, 19.6, 20.8));
    const ph = 0.43 + wu * (1.062 - 0.43);
    const mx = Ax + m.x * s, my = Ay + m.y * s;
    const r = m.r * s0 + (re.r - m.r * s0) * e;
    const ma = 1 - span(t, 20.8, 21.4);
    if (ma > 0) drawMoon(g, mx, my, r, ph, { maria: true, halo: 0.7, alpha: 0.9 * ma, earth: 0.1 });
    return;
  }
  const c = gardenCam(W, t);
  g.save();
  g.translate(0, c.dy);
  if (c.s !== 1) cam(g, c.s, c.ox, c.oy);
  drawNightGarden(g, W, t, M, false);
  g.restore();
}

/** The night garden: backdrop, veil, sky moon (with its rabbit), pond, reflection, plum, figure, ensō, weather. */
function drawNightGarden(g: CanvasRenderingContext2D, W: World, t: number, M: ReturnType<typeof montageAt>, climbing: boolean): void {
  const { w, h, P } = W.lay;
  const top = W.pondTop;
  if (W.night) g.drawImage(W.night.canvas, 0, 0, w, h);
  else { g.fillStyle = '#39424f'; g.fillRect(0, 0, w, h); }
  // the pond: the two nearest baked clarity states, cross-faded
  if (W.ponds) {
    const m = pondMix(M.pond);
    const PH = h * 1.25 - top;
    g.drawImage(W.ponds[m.a], 0, top, w, PH);
    if (m.k > 0.01 && m.b !== m.a) { g.save(); g.globalAlpha = m.k; g.drawImage(W.ponds[m.b], 0, top, w, PH); g.restore(); }
  }
  // the night veil follows the moon: α .12 + .22 (1 − lit)
  g.fillStyle = `rgba(30,38,52,${0.12 + 0.22 * (1 - M.lit)})`;
  g.fillRect(0, 0, w, h * 1.3);
  // the sky moon (the crescent appears last while the garden climbs out)
  const mo = W.moonAt;
  const skyA = climbing ? span(t, 21.0, 21.6) : 1;
  const beats = beatTable();
  const next = beats.find((b) => b.t > t - 0.05 && b.enso);
  const last = [...beats].reverse().find((b) => b.t <= t && b.enso);
  let pestle = 0.8;
  if (next && t >= next.t - 0.2) pestle = t < next.t - 0.05 ? 0.8 - 0.8 * span(t, next.t - 0.2, next.t - 0.05) : 0;
  if (last && t - last.t < 0.12) pestle = 1;
  else if (last && t - last.t < 0.4) pestle = 1 - 0.2 * span(t, last.t + 0.12, last.t + 0.4);
  const lapse = t >= 32.9 && t < 36.5;
  if (lapse) pestle = 0.8;
  const flick = Math.max(0, 1 - Math.abs(t - 43.75) / 0.18);
  if (skyA > 0) {
    drawMoon(g, mo.x, mo.y, mo.r, M.phase, { maria: true, halo: 1, alpha: skyA, rabbit: { pestle, lean: M.lean, flick } });
    if (last && t < 39.6) dustPuff(g, mo.x, mo.y, mo.r, t - last.t, 5);
  }
  // the reflection: a soft small disc in the montage; sharp with its rabbit in S6
  const re = W.reflAt;
  const refl = reflectedRabbit(t);
  if (W.flags.reflections || refl) {
    drawMoonReflection(g, re.x, re.y, refl ? re.r * 1.1 : re.r, M.phase, t, M.pond, {
      rabbit: refl ? { pestle: 0.8, flick } : null, slices: W.flags.reflections ? 24 : 6, alpha: climbing ? span(t, 20.4, 21.2) : 1,
    });
  } else {
    g.fillStyle = `rgba(${C.leadRGB},${0.35 * M.pond})`;
    g.beginPath(); g.ellipse(re.x, re.y, re.r, re.r * 1.1, 0, 0, Math.PI * 2); g.fill();
  }
  // duckweed below .72
  if (M.pond < 0.85) {
    const k = Math.max(0, Math.min(1, (0.85 - M.pond) / 0.13));
    const r = makeRng(0xd0c);
    for (let i = 0; i < 12; i++) {
      const x = (r() * w + t * (6 + r() * 6)) % w, y = top + 10 + r() * (h * 0.22);
      g.fillStyle = `rgba(78,104,74,${0.55 * k})`;
      g.beginPath(); g.ellipse(x, y, 3.5 + r() * 2, 1.6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 4, y + 1, 2.4, 1.2, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // the plum's reflection (S6): flipped, α .22, clipped to the pond, slice-wobbled
  if (W.plum && t >= 39.5) drawPlumReflection(g, W, t);
  // the plum
  drawPlum(g, W, t, M);
  // the figure: fades in 21.8, bends over the sprout, fades out at 25.2
  const fa = window01(t, 21.8, 25.5, 0.4, 0.3);
  if (fa > 0) {
    const bend = ease.s(span(t, 22.0, 22.4)) * (1 - ease.s(span(t, 24.4, 24.9)));
    drawFigure(g, W.plumAt.x + (P ? 40 : 50), W.plumAt.y + 2, P ? 30 : 38, 'bend', { bend, alpha: fa, flip: true });
  }
  // the ensō at the plum's base
  drawEnsoBeat(g, W, t);
  // weather (petals, leaves…) from 21.6
  if (W.flags.weather && !climbing) stepWeather(g, W, t);
}

function drawPlum(g: CanvasRenderingContext2D, W: World, t: number, M: ReturnType<typeof montageAt>): void {
  if (!W.plum) return;
  const d = W.plumD;
  const dpr = W.lay.dpr;
  const P = W.plum;
  // how many strokes are painted, and the one in flight (one at a time, seekable)
  const B = beatTable();
  let done = 0, fly: Stroke | null = null, flyU = 0;
  const count = (gr: number) => { let n = 0; for (const s of d.strokes) { if (s.birth > gr) break; n++; } return n; };
  const cur = [...B].reverse().find((b) => b.t <= t + 1e-9) ?? null;
  if (t < 21.6) done = 0;
  else {
    const iCur = cur ? B.indexOf(cur) : -1;
    const g0 = iCur > 0 ? B[iCur - 1].growth : 0;
    const g1 = cur ? cur.growth : B[0].growth;
    const t0 = !cur || cur.kind === 'sprout' ? 21.6 : cur.t;
    const dur = !cur || cur.kind === 'sprout' ? 1.0 : 0.85;
    const n0 = count(g0), n1 = count(g1);
    const u = span(t, t0, t0 + dur) * (n1 - n0);
    done = n0 + Math.floor(u);
    if (done < n1) { fly = d.strokes[done]; flyU = u - Math.floor(u); }
    else done = n1;
  }
  if (done < P.n) {
    P.g.setTransform(1, 0, 0, 1, 0, 0);
    P.g.clearRect(0, 0, P.c.width, P.c.height);
    P.n = 0;
  }
  if (done > P.n) {
    P.g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = P.n; i < done; i++) paintStroke(P.g, d.strokes[i], { scale: dpr });
    P.n = done;
  }
  const x = W.plumAt.x - d.anchor.x, y = W.plumAt.y - d.anchor.y;
  g.drawImage(P.c, x, y, d.width, d.height);
  if (fly) {
    g.save();
    g.translate(x, y);
    paintStroke(g, fly, { progress: 1 - (1 - flyU) * (1 - flyU), scale: 1 });
    g.restore();
  }
  // the vigour: a pale copy cross-faded over the live plum
  if (W.pale && M.vigor < 0.999) {
    g.save();
    g.globalAlpha = Math.min(1, (1 - M.vigor) / 0.4);
    // cover the live ink with the paper-toned pale copy: first thin the live plum, then lay the pale one
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha *= 0.55;
    g.drawImage(P.c, x, y, d.width, d.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.min(1, (1 - M.vigor) / 0.4);
    g.drawImage(W.pale, x, y, d.width, d.height);
    g.restore();
  }
}

function drawPlumReflection(g: CanvasRenderingContext2D, W: World, t: number): void {
  const d = W.plumD;
  const P = W.plum!;
  const top = W.pondTop;
  const x = W.plumAt.x - d.anchor.x;
  const a = 0.22 * span(t, 39.5, 41.0);
  if (a <= 0) return;
  g.save();
  g.beginPath(); g.rect(0, top, W.lay.w, W.lay.h * 1.3); g.clip();
  g.globalAlpha = a;
  const n = 16;
  const sh = d.height / n;
  const my = top + (top - W.plumAt.y) + 4;
  for (let i = 0; i < n; i++) {
    const dx = Math.sin(t * 1.6 + i * 0.9) * 2.5 + (i / n) * 18;
    const sy = d.height - (i + 1) * sh;
    // mirrored about the bank, slanting a little (疏影横斜)
    g.save();
    g.translate(x + dx, my + i * sh);
    g.scale(1, -1);
    g.drawImage(P.c, 0, (sy / d.height) * P.c.height, P.c.width, (sh / d.height) * P.c.height + 1, 0, -sh, d.width, sh);
    g.restore();
  }
  g.restore();
}

const ENSO_P = typeof Path2D !== 'undefined' ? { enso: new Path2D(ENSO), spine: new Path2D(SPINE), blot: new Path2D(BLOT) } : null;

/** One ensō, the app's own mark, at (x, y), radius r; `since` s after its beat; `dur` its spine reveal. */
function drawEnso(g: CanvasRenderingContext2D, x: number, y: number, r: number, since: number, dur = 0.35, alpha = 1, instant = false): void {
  if (!ENSO_P || since < 0) return;
  const hold = dur + 0.15 + 0.15;
  const fade = 1 - span(since, hold, hold + 0.35);
  if (fade <= 0) return;
  const k = r / 17.6;
  g.save();
  g.globalAlpha *= alpha * fade;
  g.translate(x - CX * k, y - CY * k);
  g.scale(k, k);
  // the faint circle first, then the ink along the spine
  g.fillStyle = 'rgba(27,25,22,.12)';
  g.fill(ENSO_P.enso);
  g.save();
  g.clip(ENSO_P.enso);
  g.strokeStyle = 'rgba(20,18,16,.92)';
  g.lineWidth = 8;
  g.lineCap = 'round';
  const len = 2 * Math.PI * 17.6 * (326 / 360);
  const u = instant ? 1 : ease.out(span(since, 0, dur));
  g.setLineDash([len * u, len * 2]);
  g.stroke(ENSO_P.spine);
  g.restore();
  // the heart fills with ink
  const hu = instant ? 1 : span(since, dur, dur + 0.15);
  if (hu > 0) {
    g.fillStyle = `rgba(20,18,16,${0.8 * hu})`;
    g.save();
    g.translate(CX, CY); g.scale(0.4 + 0.6 * hu, 0.4 + 0.6 * hu); g.translate(-CX, -CY);
    g.fill(ENSO_P.blot);
    g.restore();
  }
  g.restore();
}

function drawEnsoBeat(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { P, h } = W.lay;
  const x = W.plumAt.x, y = W.pondTop + 0.03 * h;
  const r = P ? 17 : 20;
  for (const b of beatTable()) {
    if (!b.enso) continue;
    const since = t - b.t;
    if (since < -0.4 || since > 1.2) continue;
    if (b.kind === 'return') drawEnso(g, x, y, P ? 22 : 26, since + 0.35, 0.8);
    else if (b.kind === 'bloom') drawEnso(g, x, y, r * 1.4, since, 0.35);
    else drawEnso(g, x, y, r, since, 0.35);
    // the flip-book: four small ensō on 16ths (8ths when the governor asks), stepping round an arc
    if (b.flip && since >= 0 && since < 1) {
      const n = W.flags.flip16 ? 4 : 2;
      const step = 1 / n;
      const i = Math.floor(since / step);
      const a = -2.2 + i * 0.45;
      const fx = x + Math.cos(a) * (r * 2.6), fy = y - 6 + Math.sin(a) * (r * 1.2);
      drawEnso(g, fx, fy, 12 * (P ? 1 : 1.15), (since - i * step) * 3, 0.1, 0.55, true);
    }
  }
}

function stepWeather(g: CanvasRenderingContext2D, W: World, t: number): void {
  const { w, h } = W.lay;
  if (!W.weather || t < W.weatherT - 0.01 || t - W.weatherT > 2) {
    // (re)start at the shot's start and simulate up to t (seekable for the lab and a resume)
    W.weather = new Weather({ ...W.env, tod: 'night' }, w, h);
    W.weatherT = 21.6;
    W.burstDone = false;
  }
  while (W.weatherT < t) {
    const dt = Math.min(1 / 30, t - W.weatherT);
    if (!W.burstDone && W.weatherT + dt >= 39.5) {
      // the bloom: petals burst at the crown
      const cx = W.plumAt.x, cy = W.plumAt.y - W.plumD.height * 0.62;
      for (let i = 0; i < 3; i++) W.weather.burst(cx + (i - 1) * 16, cy + i * 6, C.rouge);
      W.burstDone = true;
    }
    W.weather.step(dt, 0.2);
    W.weatherT += dt;
  }
  W.weather.draw(g);
}

/** The night garden as the camera leaves it at t (S7's pan starts on it; S12's fallback). */
export function drawNightGardenStill(g: CanvasRenderingContext2D, W: World, t: number): void {
  drawNightGarden(g, W, t, montageAt(t), false);
}

// ---------------------------------------------------------------------------------------------- S9: someone touched the water

function drawS9(g: CanvasRenderingContext2D, W: World, t: number, short: boolean): void {
  const { w, h, P } = W.lay;
  const t0 = short ? 54.2 : 67.1;
  const ringT = short ? 54.6 : 67.5;
  const earsT = short ? 55.4 : 68.3;
  const u = span(t, t0, t0 + (short ? 5.3 : 4.3));
  const s = 1 + 0.15 * ease.s(u);
  g.save();
  cam(g, s, w * 0.6, h * 0.55);
  if (W.earth2) g.drawImage(W.earth2, 0, -0.03 * h, w, h * 1.04);
  else { g.fillStyle = C.night; g.fillRect(0, 0, w, h); }
  g.fillStyle = 'rgba(30,38,52,.15)';
  g.fillRect(0, 0, w, h);
  // far below: the ring spreads, and settles into a small clear moon
  const rx = w * (P ? 0.16 : 0.11);
  const rp = P ? { x: 0.62 * w, y: 0.52 * h } : { x: 0.64 * w, y: 0.5 * h };
  drawRings(g, rp.x, rp.y, rx, t - ringT, { color: C.leadRGB });
  const mu = span(t, ringT + 0.6, ringT + 1.8);
  if (mu > 0) {
    const grd = g.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, 16);
    grd.addColorStop(0, `rgba(250,248,240,${0.95 * mu})`);
    grd.addColorStop(0.35, `rgba(${C.leadRGB},${0.6 * mu})`);
    grd.addColorStop(1, `rgba(${C.leadRGB},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(rp.x, rp.y, 16, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // the moon's edge under the rabbit: the S2 rim, seen from the side
  g.save();
  const rimY = h * (P ? 0.86 : 0.84);
  const grd = g.createLinearGradient(0, rimY - 20, 0, h);
  grd.addColorStop(0, '#f1ece0'); grd.addColorStop(1, '#ddd6c5');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(0, rimY + 14);
  g.quadraticCurveTo(w * 0.5, rimY - 26, w, rimY + 18);
  g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
  g.restore();
  // over the rabbit's shoulder: its back and ears, big and cropped at bottom left
  const ear = span(t, earsT, earsT + 0.3);
  const bx = P ? 0.2 * w : 0.15 * w, by = h * 1.03;
  const px = P ? h * 0.48 : h * 0.5;
  drawRabbit(g, 'back', px, W.lay.dpr, bx, by, { rot: -0.05 + 0.08 * ease.s(ear), alpha: 1 });
  // short cut: 嫦娥's fan rises at top right (57.2–58.2), and she hands down the sealed envelope (58.2–59.0); the rabbit leaps (59.0–59.5)
  if (short) {
    const fa = ease.s(span(t, 57.2, 58.2));
    if (fa > 0 && W.portrait) {
      const fs = P ? 0.34 * w : 0.24 * h;
      g.save(); g.globalAlpha = fa;
      g.drawImage(W.portrait, w * (P ? 0.74 : 0.8) - fs / 2, h * (P ? 0.22 : 0.24) - fs / 2 + (1 - fa) * 30, fs, fs);
      g.restore();
    }
    const eu = span(t, 58.2, 59.0);
    if (eu > 0) {
      const ex = w * (P ? 0.74 : 0.8) + (bx + w * 0.1 - w * (P ? 0.74 : 0.8)) * ease.io(eu);
      const ey = h * 0.36 + (h * 0.62 - h * 0.36) * ease.io(eu);
      drawEnvelope(g, ex, ey, P ? 44 : 60, -0.2 + eu * 0.2, W.sealMoon);
    }
  }
}

// ---------------------------------------------------------------------------------------------- S12: 半亩

/** The ink-bleed mask (S11's foam → the garden; the skip tail's seal → the garden). */
export function landingMask(W: World, x: number, y: number, u: number): HTMLCanvasElement {
  return bleedMask(W.lay.w, W.lay.h, x, y, u, 0x7a);
}

/** The landing's base (paper round the canvas rect, the garden inside it) through a mask. */
export function drawLanding(g: CanvasRenderingContext2D, W: World, mask: HTMLCanvasElement): void {
  const { w, h } = W.lay;
  const tmp = scratch(w, h, W.lay.dpr);
  tmp.g.save();
  tmp.g.clearRect(0, 0, w, h);
  drawLandingBase(tmp.g, W, 0);
  tmp.g.globalCompositeOperation = 'destination-in';
  tmp.g.drawImage(mask, 0, 0, w, h);
  tmp.g.restore();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(tmp.c, 0, 0);
  g.restore();
}

function landingRect(W: World): { x: number; y: number; w: number; h: number } {
  return W.garden?.rect ?? defaultRect(W.lay);
}

function drawLandingBase(g: CanvasRenderingContext2D, W: World, settle: number, below = settle): void {
  const { w, h } = W.lay;
  const G = W.garden;
  const rect = landingRect(W);
  // with no snapshot (no live garden beneath) the landing keeps its paper: the root's fade is the hand-off
  const k = G?.snap ? 1 - settle : 1;
  // landscape: the paper under the rect (with the caption on it) stays until C22 leaves, so the last caption
  // never sits on the app's own buttons
  const kb = G?.snap ? 1 - below : 1;
  if (kb > 0 && kb !== k) {
    g.save();
    g.globalAlpha = kb;
    g.fillStyle = W.dark ? C.mount : C.paper;
    const y0 = rect.y + rect.h;
    g.fillRect(0, y0, w, h - y0);
    g.restore();
  }
  if (k <= 0) return; // after the settle the held garden beneath is the picture (pixel-identical, with its DOM)
  g.save();
  g.globalAlpha = k;
  g.fillStyle = W.dark ? C.mount : C.paper;
  g.fillRect(0, 0, w, h);
  if (!W.dark) {
    const mist = g.createLinearGradient(0, rect.y + rect.h, 0, h);
    mist.addColorStop(0, 'rgba(210,214,218,0.35)'); mist.addColorStop(1, 'rgba(210,214,218,0)');
    g.fillStyle = mist; g.fillRect(0, rect.y + rect.h, w, h - rect.y - rect.h);
  }
  // the snapshot cross-fades into the held garden (whose DOM, the inscription, shows through)
  if (G?.snap) g.drawImage(G.snap, rect.x, rect.y, rect.w, rect.h);
  g.restore();
  if (!G?.snap) {
    g.save();
    g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip();
    // cover-fitted (uniform: the moon stays round)
    const s = Math.max(rect.w / w, rect.h / h);
    const oy = Math.max(rect.h - h * s, Math.min(0, rect.h / 2 - 0.4 * h * s)); // keeps the moon and the water
    g.translate(rect.x + (rect.w - w * s) / 2, rect.y + oy);
    g.scale(s, s);
    drawNightGarden(g, W, 49.0, montageAt(49.0), false);
    g.restore();
  }
}

/** The landing (spec §4 S12), in full-cut times (the short cut is shifted by −15.2 s). */
export function drawS12(g: CanvasRenderingContext2D, W: World, t: number, o: { hops?: boolean } = {}): void {
  const { w, h, P } = W.lay;
  const G = W.garden;
  const rect = landingRect(W);
  // PV paper outside the rect (dark silk in dark mode), a low mist band; it fades at the settle (82.2–83.1)
  const settle = ease.io(span(t, 82.2, 83.1));
  drawLandingBase(g, W, settle, P ? settle : ease.io(span(t, 84.8, 85.4)));
  // the header's own title and date stay under paper until the film's land on them (82.9–83.1), so the
  // settle never shows the name (or the date) twice
  if (G?.snap && settle > 0) {
    coverHeader(g, W, G.title, 1 - span(t, 82.9, 83.1), settle);
    coverHeader(g, W, G.date ?? null, 1 - span(t, 82.85, 83.1), settle);
  }
  if (o.hops === false && t >= 83.2) return;
  // the halo on the garden's own moon (79.6, when C22 is the moon line)
  if (G?.body && G.body.kind === 'moon' && G.body.r > 0) {
    const u = span(t, 79.6, 80.8);
    if (u > 0 && u < 1) {
      const bx = rect.x + G.body.x, by = rect.y + G.body.y;
      const rr = G.body.r * (1 + 1.4 * ease.out(u));
      g.strokeStyle = `rgba(${C.leadRGB},${0.45 * (1 - u)})`;
      g.lineWidth = G.body.r * 0.5 * (1 - u) + 1;
      g.beginPath(); g.arc(bx, by, rr, 0, Math.PI * 2); g.stroke();
    }
  }
  // the splash and the rabbit on the bank
  const pond = G?.pond ?? { x: rect.x + rect.w * 0.4, y: rect.y + rect.h * 0.8 };
  drawRings(g, pond.x, pond.y, Math.min(rect.w * 0.18, 90), t - 79.5, { color: C.leadRGB });
  const rs = P ? 36 : 46;
  if (o.hops !== false && t >= 79.5 && t < 84.1) {
    // (a skip before S8 lands without the rabbit: the viewer has not met it yet, §9.2)
    // climbs out 79.5–79.9, shakes 79.9–80.2, sits; hops 83.2 / 83.5 / 83.8 up to the mailbox (shrinking to 60 %)
    const bank = { x: pond.x - rs * 0.9, y: pond.y - rs * 0.25 };
    const climb = ease.out(span(t, 79.5, 79.9));
    let x = pond.x + (bank.x - pond.x) * climb, y = pond.y + (bank.y - pond.y) * climb;
    let pose: 'sit' | 'shake0' | 'shake1' | 'shake2' | 'crouch' | 'stretch' = 'sit';
    let scale = 1;
    let alpha = climb > 0 ? 1 : 0;
    if (t >= 79.9 && t < 80.2) pose = (['shake0', 'shake1', 'shake2'] as const)[Math.min(2, Math.floor((t - 79.9) / 0.1))];
    const mail = G?.mail ? { x: G.mail.x + G.mail.width / 2, y: G.mail.y + G.mail.height / 2 } : { x: w + 60, y: bank.y - h * 0.1 };
    if (t >= 83.2) {
      const i = Math.min(2, Math.floor((t - 83.2) / 0.3));
      const u = (t - 83.2 - i * 0.3) / 0.3;
      const from = i / 3, to = (i + 1) / 3;
      const f = from + (to - from) * ease.io(Math.min(1, u));
      x = bank.x + (mail.x - bank.x) * f;
      y = bank.y + (mail.y + rs * 0.3 - bank.y) * f - Math.sin(Math.PI * Math.min(1, u)) * rs * 1.2;
      scale = 1 - 0.4 * f;
      pose = u < 0.25 || u > 0.85 ? 'crouch' : 'stretch';
      if (t >= 83.95) alpha = 1 - span(t, 83.95, 84.05);
    }
    if (alpha > 0) drawRabbit(g, pose, rs, W.lay.dpr, x, y, { sx: scale, sy: scale, alpha, flip: G?.mail ? mail.x < bank.x : false });
    if (t < 83.2) drawEnvelope(g, x + rs * 0.28, y - rs * 0.42, rs * 0.42, -0.3, W.sealMoon);
  }
  // the mailbox puff: 8 dots (84.0)
  if (G?.mail && t >= 84.0 && t < 84.5) {
    const mx = G.mail.x + G.mail.width / 2, my = G.mail.y + G.mail.height / 2;
    dustPuff(g, mx, my, 10, t - 84.0, 8, 0.45, 0);
  }
  // 卷 on a phone: a 立轴 frame inside the rect's edges (81.7–82.3 in, fades at the settle)
  const mount = ease.out(span(t, 81.7, 82.3)) * (1 - settle);
  if (mount > 0) drawMount(g, W, rect, mount);
}

/** Paper over one header element (the app's own paper, then the fading PV paper, as around it). */
function coverHeader(g: CanvasRenderingContext2D, W: World, r: DOMRect | null, a: number, settle: number): void {
  if (!r || a <= 0 || r.width <= 0) return;
  const pad = 3;
  const x = r.left - pad, y = r.top - pad, rw = r.width + 2 * pad, rh = r.height + 2 * pad;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = W.garden?.bg || (W.dark ? '#1b1814' : C.paper);
  g.fillRect(x, y, rw, rh);
  const k = 1 - settle;
  if (k > 0) {
    g.globalAlpha = a * k;
    g.fillStyle = W.dark ? C.mount : C.paper;
    g.fillRect(x, y, rw, rh);
  }
  g.restore();
}

function drawMount(g: CanvasRenderingContext2D, W: World, r: { x: number; y: number; w: number; h: number }, a: number): void {
  const band = W.dark ? 18 : 12;
  g.save();
  g.globalAlpha = a;
  const silk = W.dark ? '#4a4034' : '#d9cfb8';
  g.fillStyle = silk;
  if (W.lay.w >= 900) {
    const p = 9;
    g.fillRect(r.x - p, r.y - p, r.w + 2 * p, p); g.fillRect(r.x - p, r.y + r.h, r.w + 2 * p, p);
    g.fillRect(r.x - p, r.y, p, r.h); g.fillRect(r.x + r.w, r.y, p, r.h);
  } else {
    g.fillRect(r.x, r.y, r.w, band); g.fillRect(r.x, r.y + r.h - band, r.w, band);
    g.fillStyle = W.dark ? '#2b251e' : '#8a7458';
    g.fillRect(r.x - 4, r.y + r.h + 1, r.w + 8, 5);
    g.strokeStyle = 'rgba(27,25,22,.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(r.x, r.y + band + 1); g.lineTo(r.x + r.w, r.y + band + 1); g.moveTo(r.x, r.y + r.h - band - 1); g.lineTo(r.x + r.w, r.y + r.h - band - 1); g.stroke();
  }
  g.restore();
}

/** The garden rect S12 is authored on when there is no garden (the lab, a forced run elsewhere). */
export function defaultRect(lay: Lay): { x: number; y: number; w: number; h: number } {
  const { w, h, P } = lay;
  return P ? { x: 0, y: Math.round(h * 0.14), w, h: Math.round(Math.min(Math.max(300, h * 0.55), 540)) } : { x: w * 0.046, y: h * 0.16, w: w * 0.908, h: Math.min(Math.max(420, h * 0.62), 560) };
}

export { litOf, CUTS };
