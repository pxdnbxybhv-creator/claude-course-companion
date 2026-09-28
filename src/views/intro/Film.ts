// 开篇 · 《月亮看见的》 — the director (spec §9, §13.2). Lazy chunk.
//
// prepareFilm() pre-paints the shared opening under the title card (the earth, the notebook, the
// night backdrop in an idle callback, the pond states, the plum…) and builds the score; startFilm()
// takes over from the gate at 3.9 s. Every frame is render(t) over cached layers; the film clock
// follows the reel (minus the A/V lag) or a pausable perf clock, slewed ≤ 20 ms a frame. When a
// layer misses its deadline the director holds the last complete frame (the shared AudioContext is
// suspended with it), at most 3 s in all; after that a shot plays its fallback. The governor only
// lowers the rendering tier; the cut never changes. The skip tail (2.5 s) needs nothing but S1.
import type { Cut, FilmHandle, FilmPrep, FilmPrepOptions, FilmStart, IntroPhase, Tier } from '../../app/intro';
import { gardenTargets } from '../../app/intro';
import { audio } from '../../audio/engine';
import { music } from '../../audio/music';
import { sceneEnv, todayLine } from '../garden/env';
// (the seal and portrait painters load with the film, never in the main bundle's first-load graph)
const getSeal = (text: string, size: number, dpr: number) => import('../quests/paint').then((m) => m.getSeal(text, size, dpr));
async function squareSeal(text: string, size: number, dpr: number): Promise<HTMLCanvasElement> {
  const [{ makeSeal, sealReady }, { hashString }] = await Promise.all([import('../../ink/seal'), import('../../core/rng')]);
  try { await sealReady(text); } catch { /* a fallback face will do */ }
  return makeSeal(text, { size, dpr, style: 'zhu', shape: 'square', wear: 0.45, seed: hashString('album:' + text) });
}
import { fillPaper } from '../../ink/paper';
import { state } from '../../app/store';
import { TAIL_CHOKE, buildScore, tailCue, type SfxCue } from './score';
import { BedCue, SFX_AHEAD, createReel, cuesIn, playCue, type Reel } from './reel';
import { CUTS, END_SHIFT, HOLD_CAP, LINES, TAIL, TAKEOVER, resumeAt, skyLine } from './shots';
import { Captions, EndWords } from './captions';
import { FilmClock, Governor, PaintQueue, PerfClock, budgetDpr, flagsFor, makeStageLay } from './stage';
import { World, defaultRect, drawLanding, jobsFor, landingMask, renderFrame, type GardenLanding } from './paint/frames';
import { drawS12, releaseScratch } from './paint/frames';
import { ctxOf, mk, release, type Lay } from './paint/util';
import './intro.css';

/** ms/Mpx of fillPaper → ms/Mpx of paintBackdrop (paper is 78 of the backdrop's 251 ms, lab-measured). */
const PAPER_TO_BACKDROP = 3.2;
/** Output latency where the browser does not report it (lab-measured). */
const LAB_OUTPUT_LAG = 0.04;

// ---------------------------------------------------------------------------------------------- prepare

interface Prep extends FilmPrep {
  lay: Lay;
  world: World;
  queue: PaintQueue;
  reel: Reel | null;
  reelReady: boolean;
  seal: string;
  dark: boolean;
  reduced: boolean;
  alive: boolean;
}

export function envNow() {
  return sceneEnv(new Date(), 1, state.peek().settings.location);
}

function idle(f: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(f, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  // Safari: a MessageChannel hop with a 50 ms deadline
  let dead = false;
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { if (!dead) f(); };
  const t = setTimeout(() => ch.port2.postMessage(0), 50);
  return () => { dead = true; clearTimeout(t); };
}

export function registerJobs(p: { world: World; queue: PaintQueue }, cut: Cut): void {
  for (const j of jobsFor(cut)) p.queue.add(j.id, j.from, j.neededBy, () => j.make(p.world));
  // the portrait and the seals (small; kept to the end)
  const w = p.world;
  // (in the quiet of S3, after the naming's columns are up: never on the push into the pond)
  p.queue.add('portrait', 9.5, cut === 'full' ? 61.0 : 57.2, async () => {
    const { paintPortrait } = await import('../walk/characters/portrait');
    const c = mk(260, 260);
    return { canvas: c, steps: [() => { paintPortrait(c, 'change', false); w.portrait = c; }] };
  });
}

export function prepareFilm(o: FilmPrepOptions): FilmPrep {
  const dpr = budgetDpr(o.w, o.h, 'high');
  const lay = makeStageLay(o.w, o.h, dpr);
  const world = new World({ lay, cut: 'full', tier: 'high', seal: o.seal, dark: o.dark, env: envNow() }, flagsFor(0, 'high'));
  const queue = new PaintQueue();
  registerJobs({ world, queue }, 'full');
  let takeRes: () => void = () => {}, takeRej: (e: unknown) => void = () => {}, nightRes: () => void = () => {};
  const takeoverReady = new Promise<void>((a, b) => { takeRes = a; takeRej = b; });
  const nightReady = new Promise<void>((a) => { nightRes = a; });
  let reel: Reel | null = null;
  try { music.prime(); } catch { /* no audio */ }
  try { reel = createReel(buildScore('full').events); } catch (e) { console.warn('[intro] reel', e); }
  const p: Prep = {
    lay, world, queue, reel, reelReady: false, seal: o.seal, dark: o.dark, reduced: o.reduced, alive: true,
    takeoverReady, nightReady,
    probe() {
      try {
        const c = mk(512, 512);
        const g = ctxOf(c);
        const t0 = performance.now();
        for (let i = 0; i < 3; i++) fillPaper(g, 512, 512, 7 + i);
        const ms = (performance.now() - t0) / 3;
        release(c);
        return (ms / ((512 * 512) / 1e6)) * PAPER_TO_BACKDROP;
      } catch {
        return null;
      }
    },
    dispose() {
      p.alive = false;
      if (!started.has(p)) { world.dispose(); try { reel?.stop(0.05); } catch { /* ignore */ } }
    },
  };
  reel?.ready.then(() => { p.reelReady = true; }, () => {});
  // seals: the letter's 月 and the landing's own (fonts first)
  const sd = Math.min(2, window.devicePixelRatio || 1);
  void getSeal('月', 60, sd).then((c) => { world.sealMoon = c; }, () => {});
  // the first open's 「半亩」 is the square pond come back as a square 朱文 seal (§1 motifs); a named replay keeps its own look
  void (o.seal && o.seal !== '半亩' ? getSeal(o.seal, 56, sd) : squareSeal('半亩', 56, sd)).then((c) => { world.sealName = c; }, () => {});
  // under the title card: the earth and the notebook in rAF slices; the night backdrop (unsliceable) in an idle callback
  let raf = 0;
  const pump = () => {
    raf = 0;
    if (!p.alive || started.has(p)) return;
    queue.pump(0, 6);
    if (queue.isDone('earth')) takeRes();
    const e = queue.get('earth');
    if (e?.failed) takeRej(new Error('earth'));
    // (and the small rabbit sprites, so no frame after the tap builds one)
    if (!queue.isDone('earth') || !queue.isDone('notebook') || !queue.isDone('rabbit')) raf = requestAnimationFrame(pump);
  };
  const night = queue.get('night')!;
  night.paintFrom = Infinity; // the pump leaves it to the idle callback
  const cancelIdle = idle(() => {
    if (!p.alive) return;
    night.paintFrom = 0;
    queue.pump(0, 1000);
    // (pump runs the earliest deadline first; make sure the backdrop itself ran)
    for (let i = 0; i < 3 && !queue.isDone('night'); i++) queue.pump(0, 1000);
    if (queue.isDone('night')) nightRes();
    else nightRes();
  });
  raf = requestAnimationFrame(pump);
  const d0 = p.dispose;
  p.dispose = () => { cancelAnimationFrame(raf); cancelIdle(); d0(); };
  return p;
}

const started = new WeakSet<object>();

// ---------------------------------------------------------------------------------------------- start

/** The settle animates transform and opacity only (see captions.ts). */
export { SETTLE_PROPS } from './captions';

export function startFilm(prepIn: FilmPrep, o: FilmStart): FilmHandle {
  const prep = prepIn as Prep;
  started.add(prep);
  const { cut } = o;
  const tier: Tier = o.tier;
  const W = prep.world;
  W.cut = cut;
  W.tier = tier;
  W.flags = flagsFor(0, tier);
  const lay = prep.lay;
  const { w, h } = lay;
  const queue = prep.queue;
  if (cut === 'short') {
    // the cut-specific paints (everything before 49.2 s is shared)
    for (const id of ['sky', 'moonground', 'letter', 'country', 'earth2']) {
      const j = queue.get(id);
      if (j && !j.done) queue.jobs.splice(queue.jobs.indexOf(j), 1);
    }
    registerJobs({ world: W, queue }, 'short');
    queue.get('portrait')!.neededBy = 57.2;
  }
  // the night backdrop, if the tap came before its idle callback: during S1 (compositor only)
  const night = queue.get('night');
  if (night) night.paintFrom = 0;
  const score = buildScore(cut);
  const reel = prep.reel;
  if (reel && cut === 'short') try { reel.setScore(score.events); } catch { /* ignore */ }

  // ---------------------------------------------------------------- DOM
  const doc = o.root.ownerDocument;
  const stage = doc.createElement('div');
  stage.className = 'intro-stage';
  stage.dataset.cut = cut; // the e2e reads the cut here
  stage.style.opacity = '0';
  // the starting composition's own size: after a rotation the stage is contain-fitted by transform, never re-laid out
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  const canvas = doc.createElement('canvas');
  canvas.className = 'intro-canvas';
  canvas.width = Math.round(w * lay.dpr);
  canvas.height = Math.round(h * lay.dpr);
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  o.root.append(stage);
  let rotated = false;
  // the viewport's shape changed after the film was prepared (a rotation on the card that was not re-prepared
  // in time): letterbox it, as after a rotation mid-film
  if (Math.abs(innerWidth / innerHeight - w / h) / (w / h) > 0.12) {
    rotated = true;
    o.root.style.background = '#2b251e';
  }
  const g = ctxOf(canvas);
  const reduced = tier === 'still';
  const env0 = envNow();
  const caps = new Captions(o.root, stage, { cut, w, h, reduced, sky: LINES.C22day, date: todayLine(new Date()).zh });
  let end: EndWords | null = null;
  const filmRoot = o.root.closest<HTMLElement>('.intro-film');
  const late = doc.createElement('p');
  late.className = 'intro-flate';
  late.textContent = LINES.late;
  late.style.display = 'none';
  o.root.append(late);

  // ---------------------------------------------------------------- clock and sound
  const perf = new PerfClock(o.tapAt);
  const clock = new FilmClock();
  clock.jump(Math.max(0, perf.now()));
  const bed = new BedCue();
  let reelOn = false;
  const avLag = () => {
    const c = audio.context as (AudioContext & { outputLatency?: number }) | null;
    if (!c) return LAB_OUTPUT_LAG;
    return (typeof c.outputLatency === 'number' && c.outputLatency > 0 ? c.outputLatency : LAB_OUTPUT_LAG) + (c.baseLatency || 0);
  };
  const startReel = (from: number, fade?: number) => {
    if (!reel || !prep.reelReady) return;
    try { reel.start(from + avLag(), fade ? { fade } : undefined); reelOn = true; } catch (e) { console.warn('[intro] reel', e); }
  };
  if (prep.reelReady) startReel(clock.t);
  else reel?.ready.then(() => { prep.reelReady = true; if (mode === 'film' && !holding && !hidden) startReel(clock.t); }, () => {});
  const sourceTime = () => (reelOn && reel?.playing ? reel.time() - avLag() : perf.now());
  let cueFrom = Math.max(0.001, clock.t);
  const scheduleSfx = (t: number) => {
    const until = t + SFX_AHEAD;
    if (until <= cueFrom) return;
    const ctx = audio.context;
    // on the reel, sfx sit on the music's own clock (c.t − reel.time()); on the perf clock they are
    // heard with the picture (the output latency taken off)
    const onReel = reelOn && !!reel?.playing;
    const base = onReel ? reel!.time() : t + avLag();
    for (const c of cuesIn(score.sfx, cueFrom, until) as SfxCue[]) {
      if (c.kind === 'ambient') { ambientQ.push(c); continue; }
      if (!ctx || o.muted()) continue;
      try { playCue(c, ctx.currentTime + Math.max(0, c.t - base)); } catch { /* no audio */ }
    }
    cueFrom = until;
  };
  const ambientQ: SfxCue[] = [];
  /** After a clock jump (a still skipped ahead, a rewind after a hidden tab): the bed a cue at or before t left on. */
  const reconcileBed = (t: number) => {
    ambientQ.length = 0;
    const b = score.sfx.filter((c) => c.kind === 'ambient' && c.t <= t).pop();
    try { if (b && b.kind === 'ambient' && b.bed === 'stream') bed.apply(b); else bed.restore(); } catch { /* ignore */ }
  };
  const runAmbient = (t: number) => {
    while (ambientQ.length && ambientQ[0].t <= t) { const c = ambientQ.shift()!; try { bed.apply(c); } catch { /* ignore */ } }
  };

  // ---------------------------------------------------------------- state
  type Mode = 'film' | 'tail' | 'done';
  let mode: Mode = 'film';
  let raf = 0;
  let holding = false;
  let holdSince = 0;
  let holdTotal = 0;
  let suspended = false;
  let hidden = false;
  let tookOver = false;
  let outSent = false;
  let lastT = clock.t;
  const gov = new Governor();
  let wallPrev = performance.now();
  let tailAt = 0;
  let tailFromT = 0;
  let frozen: HTMLCanvasElement | null = null;
  let doneCalled = false;
  let endFade: Animation | null = null;

  const finish = (r: 'end' | 'skip' | 'error') => {
    if (doneCalled) return;
    try { o.root.ownerDocument.documentElement.dataset.introDone = `${r}@${lastT.toFixed(2)}`; } catch { /* ignore */ }
    doneCalled = true;
    mode = 'done';
    cancelAnimationFrame(raf);
    o.onDone(r);
  };
  const phase = (p: IntroPhase) => { try { o.onPhase(p); } catch { /* ignore */ } };

  const suspend = () => {
    const c = audio.context;
    if (c && c.state === 'running') { suspended = true; c.suspend().catch(() => {}); }
  };
  const resume = () => {
    if (!suspended) return;
    suspended = false;
    audio.context?.resume().catch(() => {});
  };

  // ---------------------------------------------------------------- the landing (S12)
  const landT = 75.0 + END_SHIFT[cut];
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    const tg = gardenTargets();
    let L: GardenLanding;
    try {
      if (tg && !rotated) {
        const r = tg.hooks.canvas.getBoundingClientRect();
        const rect = { x: r.left, y: r.top, w: r.width, h: r.height };
        let snap: HTMLCanvasElement | null = null;
        try {
          snap = mk(Math.max(1, rect.w * lay.dpr), Math.max(1, rect.h * lay.dpr));
          ctxOf(snap).drawImage(tg.hooks.canvas, 0, 0, snap.width, snap.height);
        } catch { snap = null; }
        const pr = tg.hooks.pondRect();
        const body = tg.hooks.body();
        L = {
          rect, snap,
          pond: pr ? { x: pr.left + pr.width * 0.4, y: pr.top + Math.min(pr.height * 0.35, rect.y + rect.h - pr.top - 20) } : null,
          body,
          title: tg.title?.getBoundingClientRect() ?? null,
          mail: tg.mail?.getBoundingClientRect() ?? null,
          date: tg.date?.getBoundingClientRect() ?? null,
          bg: (() => {
            try { const c = getComputedStyle(doc.body).backgroundColor; return c && c !== 'transparent' && !/,\s*0\)$/.test(c) ? c : undefined; } catch { return undefined; }
          })(),
        };
        const envG = tg.hooks.env();
        const vis = { x: Math.max(0, -rect.x), y: Math.max(0, -rect.y), w: Math.min(rect.w, w - rect.x), h: Math.min(rect.h, h - rect.y) };
        const sky = skyLine(envG, body, vis);
        setSky(sky);
        const english = state.peek().settings.lang === 'en';
        end = new EndWords(o.root, { title: L.title, date: tg.date?.getBoundingClientRect() ?? null, rect, mail: L.mail }, {
          cut, w, h, date: dateLine(), colophon: LINES.K, seal: W.sealName ? cloneCanvas(W.sealName) : null, english,
        });
      } else {
        const rect = defaultRect(lay);
        L = { rect, snap: null, pond: null, body: null, title: null, mail: null };
        setSky(skyLine(env0, null, { x: 0, y: 0, w: rect.w, h: rect.h }));
        end = new EndWords(o.root, { title: null, date: null, rect, mail: null }, { cut, w, h, date: dateLine(), colophon: LINES.K, seal: W.sealName ? cloneCanvas(W.sealName) : null, english: false });
      }
      W.garden = L;
    } catch (e) {
      console.warn('[intro] landing', e);
    }
  };
  const setSky = (s: string) => {
    const el = o.root.querySelectorAll<HTMLElement>('.intro-fcap');
    const c22 = CUTS[cut].text.findIndex((x) => x.id === 'C22');
    void c22;
    // the C22 caption is the last film caption
    const last = el[el.length - 1];
    const line = last?.querySelector<HTMLElement>('.intro-cap-line');
    if (line) line.textContent = s;
  };

  // ---------------------------------------------------------------- the frame
  const draw = (t: number) => {
    g.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
    const st = reduced ? stillTime(cut, t) : t;
    const f = renderFrame(g, W, st);
    const clearing = reduced ? crossStill(t) : 0;
    stage.style.transform = rotated ? fitTransform() : withCover(f.stage);
    const sa = settleAlpha(t);
    stage.style.opacity = String(f.alpha * (1 - sa) * (1 - clearing));
    // after a rotation the silk letterbox fades with the stage, so the app shows at the settle
    if (rotated) o.root.style.background = sa > 0 ? `rgba(43,37,30,${(1 - sa).toFixed(3)})` : '#2b251e';
    caps.update(t);
    // the title and the date follow the still on screen, so they settle together with the header's still
    end?.update(reduced && t - END_SHIFT[cut] > 79.5 ? st : t);
  };
  // reduced motion: held stills, cross-faded over ≥ 600 ms (canvas alpha, never CSS). Into a still after the S12
  // settle (a cleared canvas: the app beneath) the stage itself fades instead; that factor is returned.
  const crossStill = (t: number): number => {
    const S = STILLS[cut];
    const i = S.findIndex((s) => s > t) - 1;
    const next = S[i + 1];
    if (next === undefined || next - t > 0.6) return 0;
    const a = 1 - (next - t) / 0.6;
    if (next - END_SHIFT[cut] >= 83.1) return a;
    g.save();
    g.globalAlpha = a;
    const tmp = mk(canvas.width, canvas.height);
    const tg2 = ctxOf(tmp);
    tg2.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
    renderFrame(tg2, W, next);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(tmp, 0, 0);
    release(tmp);
    g.restore();
    return 0;
  };
  const settleAlpha = (t: number) => {
    const T = t - END_SHIFT[cut];
    // after a rotation the letterboxed stage cross-fades to the app at 82.2 (§9.7); otherwise S12 clears itself
    return mode === 'film' && rotated && T >= 82.2 ? Math.min(1, (T - 82.2) / 0.9) : 0;
  };

  const frame = (now: number) => {
    raf = 0;
    if (mode === 'done') return;
    raf = requestAnimationFrame(frame);
    if (hidden) return;
    const dtWall = now - wallPrev;
    wallPrev = now;
    if (mode === 'tail') { tailFrame(now); return; }
    const t0 = performance.now();
    let t = clock.step(sourceTime(), now, !holding);
    // paint what is due (a hold gives the queue a bigger slice)
    queue.pump(t, holding ? 14 : 6);
    // holds: a layer late for its deadline keeps the last complete frame
    if (t >= TAKEOVER) {
      const lateJobs = queue.late(t + 0.02);
      if (lateJobs.length && !holding && holdTotal < HOLD_CAP) {
        holding = true; holdSince = now; perf.pause(); suspend();
      }
      if (holding) {
        const held = holdTotal + (now - holdSince) / 1000;
        if (!queue.late(t + 0.02).length || held >= HOLD_CAP) {
          if (held >= HOLD_CAP) for (const j of queue.late(t + 0.02)) queue.abandon(j);
          holdTotal = held; holding = false; late.style.display = 'none';
          perf.resume(); resume();
          if (reelOn && reel && !reel.playing) startReel(t);
        } else {
          if (now - holdSince > 2500) late.style.display = '';
          return; // the last complete frame stays
        }
      }
    }
    if (!tookOver && t >= TAKEOVER) { tookOver = true; phase('film'); }
    if (t >= landT && !landed) land();
    scheduleSfx(t);
    runAmbient(t);
    // the stream bed (45.2) is synthesized in the petal hold, never on the Q3 answer's frame
    if (!warmed && t >= 41.0 && t < 45.0) { warmed = true; try { audio.prepareAmbient('stream'); } catch { /* no audio */ } }
    // the keep rule: release what no later shot draws
    // (reduced motion: the still on screen, or the next one cross-fading in, may be older than t)
    releaseLayers(reduced ? Math.min(t, stillTime(cut, t)) : t);
    if (t >= 3.8) draw(t);
    stage.dataset.t = t.toFixed(2); // the e2e reads the film clock here
    const T = t - END_SHIFT[cut];
    if (T >= 84.0 && end) end.pulse();
    if (T >= 82.2 && !outSent) { outSent = true; phase('out'); }
    if (T >= 85.3 && reelOn) { try { reel?.stop(1.5); } catch { /* ignore */ } reelOn = false; }
    if (T >= 85.4 && !endFade && filmRoot) {
      try { endFade = filmRoot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }); } catch { /* ignore */ }
    }
    if (t >= CUTS[cut].end) { finish('end'); return; }
    lastT = t;
    // the governor: rendering steps down only
    if (gov.frame(performance.now() - t0, now)) { W.flags = flagsFor(gov.level, tier); }
    void dtWall;
  };

  let scratchGone = false;
  let warmed = false;
  const releaseLayers = (t: number) => {
    // S3's bleed and S4's rise are done with the frame scratch (the landing makes it again at 78.4)
    if (!scratchGone && t >= 21.7 && t < 60) { scratchGone = true; releaseScratch(); }
    for (const l of CUTS[cut].layers) {
      if (t < l.until || released.has(l.id)) continue;
      released.add(l.id);
      switch (l.id) {
        case 'earth': release(W.earth); W.earth = null; break;
        case 'notebook': release(W.notebook); W.notebook = null; break;
        case 'night': if (t >= 60) { release(W.night?.canvas); W.night = null; } else released.delete(l.id); break;
        case 'ponds': if (t >= 60) { for (const c of W.ponds ?? []) release(c); W.ponds = null; } else released.delete(l.id); break;
        case 'plum': if (t >= 60) { release(W.plum?.c); release(W.pale); W.plum = null; W.pale = null; } else released.delete(l.id); break;
        case 'study': W.study?.dispose(); W.study = null; break;
        case 'sky': release(W.sky); W.sky = null; break;
        case 'moonground': W.ground?.dispose(); W.ground = null; break;
        case 'earth2': release(W.earth2); W.earth2 = null; break;
        case 'letter': W.letter?.dispose(); W.letter = null; break;
        case 'country': W.country?.dispose(); W.country = null; break;
      }
    }
  };
  const released = new Set<string>();

  // ---------------------------------------------------------------- the skip tail (2.5 s)
  const tailMap = (tau: number) => {
    // τ 0–0.4 title · 0.4 seal · 1.2 date · 1.6–2.5 the settle (full-cut S12 times)
    const pts: [number, number][] = [[0, 80.2], [0.4, 81.5], [1.2, 81.6], [1.6, 82.2], [2.5, 83.1]];
    for (let i = 1; i < pts.length; i++) if (tau <= pts[i][0]) { const [a, A] = pts[i - 1], [b, B] = pts[i]; return A + ((B - A) * (tau - a)) / (b - a); }
    return 83.1;
  };
  const tailFrame = (now: number) => {
    const tau = (now - tailAt) / 1000;
    const T = tailMap(tau);
    g.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
    if (tau < 1.6) {
      if (frozen) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(frozen, 0, 0); g.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0); }
      const u = Math.max(0, Math.min(1, (tau - 0.4) / 1.2));
      if (u > 0) {
        const sx = end ? 0 : w * 0.3;
        drawLanding(g, W, landingMask(W, (W.garden?.title?.left ?? sx) + 60, W.garden?.title?.top ?? h * 0.1, u));
      }
    } else {
      const rabbit = tailFromT >= (CUTS[cut].shots.find((s) => s.id === 'S8' || s.id === 'S9s')?.t0 ?? Infinity);
      drawS12(g, W, rabbit ? 82.2 + (tau - 1.6) * (2.0 / 0.9) : 82.2 + (tau - 1.6), { hops: rabbit });
    }
    stage.style.opacity = String(1 - Math.max(0, Math.min(1, (tau - 1.6) / 0.9)));
    caps.update(-1);
    end?.update(T + END_SHIFT[cut]);
    if (tau >= TAIL) finish('skip');
  };

  // ---------------------------------------------------------------- visibility, resize
  const onVis = () => {
    if (mode !== 'film') return;
    if (doc.visibilityState === 'hidden') {
      hidden = true; perf.pause(); suspend();
      try { reel?.stop(0.05); } catch { /* ignore */ }
      reelOn = false;
      return;
    }
    if (!hidden) return;
    hidden = false;
    // resume at the current shot's start (never before the takeover); the keep rule has its layers alive
    const t = resumeAt(cut, clock.t);
    perf.set(t); perf.resume(); clock.jump(t); cueFrom = t;
    reconcileBed(t);
    W.weather = null;
    resume();
    startReel(t);
    wallPrev = performance.now();
  };
  doc.addEventListener('visibilitychange', onVis);
  const onResize = () => {
    const nw = innerWidth, nh = innerHeight;
    const a0 = w / h, a1 = nw / nh;
    if (Math.abs(a1 - a0) / a0 > 0.12) {
      rotated = true;
      if (filmRoot) o.root.style.background = '#2b251e';
    }
    stage.style.transform = fitTransform();
  };
  /** A small viewport change (same shape): cover-fit the stage, composed with the shot's own camera. */
  const withCover = (cam: string): string => {
    const s = Math.max(innerWidth / w, innerHeight / h);
    const cover = Math.abs(s - 1) > 0.001 ? `translate(${(innerWidth - w * s) / 2}px,${(innerHeight - h * s) / 2}px) scale(${s}) ` : '';
    return (cover + (cam === 'none' ? '' : cam)).trim() || 'none';
  };
  const fitTransform = () => {
    const nw = innerWidth, nh = innerHeight;
    if (!rotated) {
      const s = Math.max(nw / w, nh / h);
      return s === 1 ? 'none' : `translate(${(nw - w * s) / 2}px,${(nh - h * s) / 2}px) scale(${s})`;
    }
    const s = Math.min(nw / w, nh / h);
    return `translate(${(nw - w * s) / 2}px,${(nh - h * s) / 2}px) scale(${s})`;
  };
  addEventListener('resize', onResize);

  raf = requestAnimationFrame(frame);

  return {
    skip() {
      if (mode !== 'film') { this.endNow(); return; }
      mode = 'tail';
      tailFromT = lastT;
      tailAt = performance.now();
      phase('tail');
      try { reel?.stop(0.3); } catch { /* ignore */ }
      reelOn = false;
      try { setTimeout(() => { try { if (!o.muted()) music.cue(tailCue(), { choke: TAIL_CHOKE }); } catch { /* ignore */ } }, 400); } catch { /* ignore */ }
      resume();
      holding = false;
      frozen = mk(canvas.width, canvas.height);
      try { ctxOf(frozen).drawImage(canvas, 0, 0); } catch { /* ignore */ }
      land();
      setTimeout(() => phase('out'), 1600);
      if (filmRoot) setTimeout(() => { try { filmRoot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }); } catch { /* ignore */ } }, 2100);
      if (!raf) raf = requestAnimationFrame(frame);
    },
    endNow() {
      if (mode === 'done') return;
      try { reel?.stop(0.3); } catch { /* ignore */ }
      if (filmRoot) {
        try {
          const a = filmRoot.animate([{ opacity: getComputedStyle(filmRoot).opacity }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
          mode = 'done';
          cancelAnimationFrame(raf);
          a.onfinish = () => finish('skip');
          setTimeout(() => finish('skip'), 450);
          return;
        } catch { /* ignore */ }
      }
      finish('skip');
    },
    destroy() {
      mode = 'done';
      cancelAnimationFrame(raf);
      doc.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', onResize);
      try { if (reel?.playing) reel.stop(0.3); } catch { /* ignore */ }
      try { bed.restore(); } catch { /* ignore */ }
      resume();
      caps.destroy();
      end?.destroy();
      stage.remove();
      late.remove();
      release(canvas);
      release(frozen);
      W.dispose();
    },
    stageTap(x: number, y: number) {
      if (mode !== 'film') return;
      if (reduced) {
        // advance to the next still: the film clock moves there and the music restarts with a crossfade
        const S = STILLS[cut];
        const next = S.find((s) => s > clock.t + 0.05);
        if (next === undefined) return;
        const t = Math.max(next - 0.6, clock.t);
        perf.set(t); clock.jump(t); cueFrom = t;
        reconcileBed(t);
        startReel(t, 0.3);
        return;
      }
      W.taps.push({ x, y, t: clock.t });
      if (W.taps.length > 6) W.taps.shift();
    },
  };

  function dateLine(): string {
    const d = todayLine(new Date());
    return d.festivalZh ? `${d.festivalZh} · ${d.zh}` : d.zh;
  }
}

export function cloneCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const d = mk(c.width, c.height);
  ctxOf(d).drawImage(c, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------------------------- reduced motion

/** The short cut as held stills: one or two per shot (film times each still shows). */
const STILLS: Record<Cut, number[]> = {
  full: [],
  // 7.2: every glint and the square one lit · 17.0: the slip written, the tip gone · 21.7: the garden risen, under C6
  // · 67.9: after the settle (the app's own header, never a blank one)
  short: [4.4, 7.2, 9.4, 17.0, 21.7, 22.8, 29.6, 34.6, 39.8, 44.4, 49.6, 51.8, 55.0, 58.4, 60.2, 62.6, 64.4, 66.4, 67.9, 68.6],
};

/** The still shown at film time t (the last still at or before t). */
function stillTime(cut: Cut, t: number): number {
  const S = STILLS[cut];
  let s = S[0] ?? t;
  for (const x of S) if (x <= t + 1e-9) s = x;
  return t < (S[0] ?? 0) ? t : s;
}
