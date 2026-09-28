// 开篇 · the opening film 《月亮看见的》 — the gate (main bundle, small).
//
// Who sees it, the seen flag, the shared geometry the title card and the lazy film both read (RING,
// MOON_GATE), the cut choice, the garden hooks the film lands on, and the lazy import of the film.
// The film itself (src/views/intro/Film.ts) is a lazy chunk; the title card and S1 are IntroHost.tsx.
//
// Everything here that decides something is pure and tested (tests/intro-gate.test.ts); the
// browser-facing helpers (storage, URL, history) never throw: a sandboxed iframe with an opaque
// origin throws on localStorage and history.replaceState, and the gate must go on regardless.
import { computed, signal } from '@preact/signals';
import type { Route } from './router';
import { route } from './router';
import { hasUserData, state } from './store';
import type { MusicTheme } from '../views/walk/map';
import type { SceneEnv } from '../ink/scene-types';

// ---------------------------------------------------------------------------------------------- state

export type IntroFrom = 'first' | 'settings' | 'url';
/** title: the card waits for the tap · gate: S1 (gate-owned) · film: after the takeover (3.9 s) · tail: skipping · out: the last fade. */
export type IntroPhase = 'off' | 'title' | 'gate' | 'film' | 'tail' | 'out';

export const intro = signal<{ phase: IntroPhase; from: IntroFrom; n: number }>({ phase: 'off', from: 'first', n: 0 });
export const introOn = computed(() => intro.value.phase !== 'off');

/** The seen flag's key and the cut's version (a re-cut can use '2'). Outside AppState and backups. */
export const INTRO_KEY = 'banmu.intro';
export const INTRO_VERSION = '1';

// ---------------------------------------------------------------------------------------------- the gate

export interface GateInput {
  seen: string | null;
  onboarded: boolean;
  hasData: boolean;
  route: string;
  intro: '0' | '1' | null;
  webdriver: boolean;
}

/** Who sees the film on this load (spec §9.1). Pure. */
export function decideIntro(i: GateInput): IntroFrom | null {
  if (i.intro === '0') return null;
  if (i.intro === '1') return 'url';
  if (i.webdriver) return null; // Playwright, snap, QA — unless forced
  if (i.seen) return null;
  if (i.onboarded || i.hasData) return null; // an existing user (or a demo): never interrupted
  if (i.route !== 'garden') return null; // a shared deep link: not now, and not marked seen
  return 'first';
}

/** An existing user when the film ships: marked seen silently, and told once by a toast. Pure. */
export function existingUser(i: GateInput): boolean {
  return !i.webdriver && i.intro === null && !i.seen && (i.onboarded || i.hasData);
}

/** `?intro=0|1` from a query string. */
export function parseIntroParam(search: string): '0' | '1' | null {
  try {
    const v = new URLSearchParams(search).get('intro');
    return v === '0' || v === '1' ? v : null;
  } catch {
    return null;
  }
}

/** The query string without `intro` ('' when nothing is left). */
export function stripIntro(search: string): string {
  try {
    const q = new URLSearchParams(search);
    q.delete('intro');
    const s = q.toString();
    return s ? '?' + s : '';
  } catch {
    return search;
  }
}

// ---------------------------------------------------------------------------------------------- the seen flag

let seenMem: string | null = null;

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null; // the getter itself may throw
  } catch {
    return null;
  }
}

/** The seen flag: storage when it works, else this session's memory. */
export function readSeen(): string | null {
  if (seenMem !== null) return seenMem;
  try {
    return store()?.getItem(INTRO_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Marks the film seen: in memory first, so a failed write never replays it within the session. */
export function markSeen(): void {
  seenMem = INTRO_VERSION;
  try {
    store()?.setItem(INTRO_KEY, INTRO_VERSION);
  } catch {
    /* storage refused: the memory copy stands */
  }
}

/** Tests only. */
export function _resetSeenForTests(): void {
  seenMem = null;
}

// ---------------------------------------------------------------------------------------------- boot

/** Set by initIntro for an existing user: IntroHost shows the one-time toast. */
export const introToast = signal(false);

/** Set by the garden's ?demo= flag when it seeds (before initIntro): that visitor is not an existing user. */
let demoSeeded = false;
export function noteDemoSeed(): void { demoSeeded = true; }

function setHtmlOn(on: boolean): void {
  try {
    document.documentElement.classList.toggle('intro-on', on);
  } catch {
    /* no DOM */
  }
}

/**
 * main.tsx: after every import has evaluated (so the demo flag has seeded or onboarded), before
 * render(<App/>), so the App's first render and effects already see introOn. Never throws.
 */
export function initIntro(): void {
  try {
    const q = parseIntroParam(location.search);
    if (q !== null) {
      try {
        history.replaceState(history.state, '', location.pathname + stripIntro(location.search) + location.hash);
      } catch {
        /* an opaque-origin sandbox: the flag stays in the URL, harmlessly */
      }
    }
    const input: GateInput = {
      seen: readSeen(),
      onboarded: !!state.value.onboarded,
      hasData: hasUserData(),
      route: route.value,
      intro: q,
      webdriver: !!(typeof navigator !== 'undefined' && navigator.webdriver),
    };
    const from = decideIntro(input);
    if (from) begin(from);
    else if (existingUser(input)) {
      markSeen();
      if (!demoSeeded) introToast.value = true;
    }
  } catch {
    /* the PV never blocks the app */
  }
}

function begin(from: IntroFrom): void {
  intro.value = { phase: 'title', from, n: intro.peek().n + 1 };
  setHtmlOn(true);
}

/** Settings · 关于 · 「重看开篇」, and the existing users' toast. */
export function playIntro(from: IntroFrom): void {
  if (introOn.peek()) return;
  begin(from);
}

/** Moves the phase on (IntroHost and the film's onPhase). */
export function setIntroPhase(phase: IntroPhase): void {
  const cur = intro.peek();
  if (cur.phase === phase || cur.phase === 'off') return;
  intro.value = { ...cur, phase };
}

/** The film is over (or closed): the app is the app again. */
export function endIntro(): void {
  const cur = intro.peek();
  if (cur.phase === 'off') return;
  intro.value = { ...cur, phase: 'off' };
  setHtmlOn(false);
}

// ---------------------------------------------------------------------------------------------- music

/** The App's music theme: none at all while the film is on (the reel is the only music). Pure. */
export function appTheme(r: Route, burning: boolean, on: boolean): MusicTheme | null | 'walk' {
  if (on) return null;
  if (r === 'walk' || r === 'mirror') return 'walk'; // the walk and the mirror drive their own themes
  if (burning) return null;
  if (r === 'focus') return null; // the incense has its own ambience
  if (r === 'games' || r === 'quests' || ['snake', 'tictactoe', 'gomoku', 'xiangqi', 'klotski', 'tangram', 'feihua'].includes(r)) return 'hall';
  return 'garden';
}

// ---------------------------------------------------------------------------------------------- geometry

/** The tap's ripple set: the gate's CSS variables and the film's rings.ts both read it. */
export const RING = { n: 3, stagger: 0.18, dur: 1.2, ry: 0.36, alpha: 0.7, px: 1.4, rx: 0.34 } as const;

/** The sub-hint under 「轻触水面」 (both cuts run over a minute; no sound promised when both are off). */
export function gateSubHint(sound: boolean, music: boolean): string {
  return sound || music ? '一分多钟 · 有声音' : '一分多钟';
}

/** P when h/w ≥ 1.3, L when w/h ≥ 1.3; in between 0..1. */
export function aspectMix(w: number, h: number): number {
  const a = w / Math.max(1, h);
  const p = 1 / 1.3, l = 1.3;
  return Math.max(0, Math.min(1, (a - p) / (l - p)));
}

/** The moon of the title card, in viewport fractions; r is × w for P and × h for L. */
export interface MoonGate { cx: number; cy: number; r: number; unit: 'w' | 'h' }
export interface MoonGatePx {
  /** Centre and radius of the settled moon (after the tilt), px. */
  x: number; y: number; r: number;
  /** y of the rim (px): where the lower limb rises to at the end of the limb match. */
  rimY: number;
  /** The scale origin (px, viewport): below the centre, so the disc grows up out of frame. */
  ox: number; oy: number;
}

const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

const GATE_P: MoonGate = { cx: 0.57, cy: 0.4, r: 0.15, unit: 'w' };
const GATE_L: MoonGate = { cx: 0.58, cy: 0.42, r: 0.12, unit: 'h' };
const GATE_S = 4;
const RIM_Y = { P: 0.13, L: 0.11 } as const;

/**
 * The limb match (S1 → S2, 3.5–4.3 s). The gate scales its moon div by scale(t) about origin(); the
 * film paints its rim as the circle of radius S·r centred at (x, rimY − S·r): exactly the scaled limb.
 */
export const MOON_GATE = {
  P: GATE_P,
  L: GATE_L,
  S: GATE_S,
  rimY: RIM_Y,
  t0: 3.5,
  t1: 4.3,
  /** 1 at ≤ 3.5 → S at ≥ 4.3, easeInOutCubic. */
  scale(t: number): number {
    const u = Math.max(0, Math.min(1, (t - 3.5) / 0.8));
    return 1 + (GATE_S - 1) * easeInOutCubic(u);
  },
  /** The scale origin for a class's gate (P or L) at w × h. */
  origin(g: MoonGate, w: number, h: number): { x: number; y: number } {
    const r = g.r * (g.unit === 'w' ? w : h);
    const rim = (g === GATE_L ? RIM_Y.L : RIM_Y.P) * h;
    return { x: g.cx * w, y: (GATE_S * (g.cy * h + r) - rim) / (GATE_S - 1) };
  },
  /** The resolved geometry at any aspect (between P and L it interpolates). */
  at(w: number, h: number): MoonGatePx {
    const m = aspectMix(w, h);
    const lerp = (a: number, b: number) => a + (b - a) * m;
    const x = lerp(GATE_P.cx, GATE_L.cx) * w;
    const y = lerp(GATE_P.cy, GATE_L.cy) * h;
    const r = lerp(GATE_P.r * w, GATE_L.r * h);
    const rimY = lerp(RIM_Y.P, RIM_Y.L) * h;
    return { x, y, r, rimY, ox: x, oy: (GATE_S * (y + r) - rimY) / (GATE_S - 1) };
  },
  /** The film's rim circle (px). */
  rim(w: number, h: number): { x: number; y: number; r: number } {
    const g = MOON_GATE.at(w, h);
    return { x: g.x, y: g.rimY - GATE_S * g.r, r: GATE_S * g.r };
  },
};

// ---------------------------------------------------------------------------------------------- the cut

export type Cut = 'full' | 'short';
export type Tier = 'high' | 'low' | 'still';
/** ms per Mpx of the garden's first paintBackdrop above which a device plays the short cut (lab-calibrated). */
export const SLOW_MS_PER_MPX = 420;

/** Chosen once, at the click, from a measurement (core counts cannot tell phones apart). Pure. */
export function chooseCut(i: { reduced: boolean; benchMsPerMpx: number | null; cores: number | null; mem: number | null }): { cut: Cut; tier: Tier } {
  if (i.reduced) return { cut: 'short', tier: 'still' };
  const weak = (i.cores !== null && i.cores <= 2) || (i.mem !== null && i.mem <= 2);
  const b = i.benchMsPerMpx;
  if (b === null || !Number.isFinite(b)) return weak ? { cut: 'short', tier: 'low' } : { cut: 'full', tier: 'high' };
  if (b > SLOW_MS_PER_MPX) return { cut: 'short', tier: 'low' };
  if (b > SLOW_MS_PER_MPX * 0.85 && weak) return { cut: 'short', tier: 'low' };
  return { cut: 'full', tier: 'high' };
}

// ---------------------------------------------------------------------------------------------- the garden

export interface GardenHooks {
  canvas: HTMLCanvasElement;
  /** on: resolves after the next complete frame (backdrop, plants, pond), then the scene stops. */
  hold(on: boolean): Promise<void>;
  /** The pond, in viewport coordinates (null before the first backdrop). */
  pondRect(): DOMRect | null;
  /** The painted sun or moon disc in canvas css px (null when none). */
  body(): { kind: 'sun' | 'moon'; x: number; y: number; r: number } | null;
  env(): SceneEnv;
  /** The first paintBackdrop, timed (null if it came from the cache or has not run). */
  bench(): { ms: number; mpx: number } | null;
}

let garden: GardenHooks | null = null;

/** GardenView registers its scene on mount (and null on unmount). While the film is on it is held at once. */
export function registerGarden(h: GardenHooks | null): void {
  garden = h;
  if (h && introOn.peek()) void h.hold(true).catch(() => {});
}

/** GardenView's unmount: forget its hooks (unless another garden has registered since). */
export function releaseGarden(h: GardenHooks): void {
  if (garden === h) garden = null;
}

/** The live garden and the header elements S12 settles into. */
export function gardenTargets(): { hooks: GardenHooks; title: Element | null; date: Element | null; mail: Element | null; mount: Element | null } | null {
  if (!garden || !garden.canvas.isConnected) return null;
  const q = (s: string) => {
    try {
      return document.querySelector(s);
    } catch {
      return null;
    }
  };
  return { hooks: garden, title: q('.garden-title h1'), date: q('.garden-date'), mail: q('.garden-mail'), mount: q('.garden-mount') };
}

// ---------------------------------------------------------------------------------------------- the film

export interface FilmPrepOptions { reduced: boolean; seal: string; w: number; h: number; dark: boolean }
export interface FilmPrep {
  readonly takeoverReady: Promise<void>;
  readonly nightReady: Promise<void>;
  /** ms/Mpx from a quick paper probe, when the garden has no bench. */
  probe(): number | null;
  dispose(): void;
}
export interface FilmStart {
  /** The film's own layer inside the PV root (empty; the film fills it). */
  root: HTMLElement;
  /** performance.now() at the click = film t 0 (rebased after a late-chunk hold). */
  tapAt: number;
  ringAt: number | null;
  tap: { x: number; y: number } | null;
  cut: Cut;
  tier: Tier;
  from: IntroFrom;
  muted(): boolean;
  onPhase(p: IntroPhase): void;
  onDone(r: 'end' | 'skip' | 'error'): void;
}
export interface FilmHandle {
  skip(): void;
  endNow(): void;
  destroy(): void;
  stageTap(x: number, y: number): void;
}
export interface FilmModule {
  prepareFilm(o: FilmPrepOptions): FilmPrep;
  startFilm(prep: FilmPrep, o: FilmStart): FilmHandle;
}

// The film chunk. Until Film.ts exists the glob is empty and the stub (the skip tail at 4.0 s) stands in.
const FILMS = import.meta.glob<FilmModule>('../views/intro/Film.ts');
let filmP: Promise<FilmModule> | null = null;

function useStub(): boolean {
  try {
    return !FILMS['../views/intro/Film.ts'] || !!(window as unknown as { __introStub?: boolean }).__introStub;
  } catch {
    return !FILMS['../views/intro/Film.ts'];
  }
}

/** The film chunk, imported once (a failure is forgotten, so a later try can succeed). */
export function loadFilm(): Promise<FilmModule> {
  if (!filmP) {
    const load = useStub() ? () => import('../views/intro/stub') : FILMS['../views/intro/Film.ts'];
    filmP = load().then(
      (m) => {
        if (typeof m?.prepareFilm !== 'function' || typeof m?.startFilm !== 'function') throw new Error('film chunk incomplete');
        return m;
      },
    );
    filmP.catch(() => { filmP = null; });
  }
  return filmP;
}
