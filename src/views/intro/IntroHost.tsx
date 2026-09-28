// 开篇 · the title card, S1 and C1 (main bundle), and everything around the lazy film: the tap,
// the late-chunk hold, early skip, the 「声」 mute, the lifecycle guards, the wake lock, and the
// restores on every close. The film (Film.ts, lazy) takes over at 3.9 s through FilmStart.
//
// Before the takeover every moving thing is an HTML element animated with WAAPI on transform or
// opacity: created in the click handler with delays from the click, so a long task cannot delay
// them, reduced motion's CSS cut does not touch them, and a hold can pause them exactly.
import { useEffect, useErrorBoundary, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { audio, type AudioEngine } from '../../audio/engine';
import { music } from '../../audio/music';
import { go, route } from '../../app/router';
import { state } from '../../app/store';
import { useT } from '../../app/i18n';
import { toast } from '../../ui/kit';
import {
  MOON_GATE, RING, aspectMix, chooseCut, endIntro, gardenTargets, gateSubHint, intro, introToast, loadFilm, markSeen, playIntro, setIntroPhase,
  type FilmHandle, type FilmModule, type FilmPrep, type IntroFrom, type IntroPhase, type MoonGatePx,
} from '../../app/intro';
import './gate.css';


export function IntroHost() {
  const t = useT();
  const st = intro.value;
  const pending = introToast.value;
  // the PV never blocks the app: anything thrown while rendering the card closes it
  const [err] = useErrorBoundary((e) => { console.warn('[intro]', e); endIntro(); });
  // Existing users when the film ships: marked seen at boot, told once (owner's choice).
  useEffect(() => {
    if (!pending) return;
    const tm = setTimeout(() => {
      introToast.value = false;
      toast(t('半亩添了一段开篇', 'Half-Acre has a new opening film'), { ms: 9000, action: { label: t('看看', 'Watch'), run: () => playIntro('settings') } });
    }, 1800);
    return () => clearTimeout(tm);
  }, [pending]);
  if (st.phase === 'off' || err) return null;
  return <IntroCard key={st.n} from={st.from} />;
}

// ---------------------------------------------------------------------------------------------- geometry

interface Geo {
  w: number; h: number; L: boolean; shortL: boolean;
  pond: { x0: number; x1: number; tx0: number; tx1: number; y0: number; y1: number };
  refl: { x: number; y: number; bw: number; bh: number };
  gate: MoonGatePx;
  hintY: number; subY: number; hintPx: number; subPx: number;
}

function cardGeo(w: number, h: number): Geo {
  const m = aspectMix(w, h);
  const l = (p: number, q: number) => p + (q - p) * m;
  return {
    w, h, L: m >= 0.5, shortL: m >= 0.5 && h < 500,
    pond: { x0: l(0.07, 0.24) * w, x1: l(0.93, 0.76) * w, tx0: l(0.12, 0.28) * w, tx1: l(0.88, 0.72) * w, y0: l(0.28, 0.22) * h, y1: l(0.74, 0.76) * h },
    refl: { x: l(0.57, 0.58) * w, y: l(0.45, 0.42) * h, bw: l(64, 84), bh: l(78, 100) },
    gate: MOON_GATE.at(w, h),
    hintY: l(0.85, 0.87) * h, subY: Math.max(l(0.895, 0.91) * h, l(0.85, 0.87) * h + l(24, 28) * 0.7 + l(13, 14) * 0.9), hintPx: l(24, 28), subPx: l(13, 14),
  };
}

/** The broken moon: 8 lead-white bars and 2 faint halo bars (dy, width as fractions; px height; alpha). */
const BARS: [number, number, number, number, number][] = [
  [-0.46, 0.34, 0.05, 3, 0.55], [-0.33, 0.62, -0.07, 4, 0.7], [-0.2, 0.86, 0.06, 5, 0.8], [-0.07, 1, -0.03, 5, 0.78],
  [0.06, 0.94, 0.08, 5, 0.75], [0.19, 0.78, -0.06, 4, 0.7], [0.32, 0.52, 0.04, 4, 0.62], [0.45, 0.28, -0.03, 3, 0.55],
  [-0.12, 1.7, 0, 2, 0.16], [0.26, 1.45, 0.03, 2, 0.13],
];
/** Scatter offsets for the bars at the tap (px, ±18). */
const SCATTER = [[-14, -3], [16, 2], [-9, 4], [18, -2], [-17, 1], [11, -4], [-6, 3], [13, 2], [-4, 0], [6, -1]];
const TUFTS = [0.12, 0.27, 0.46, 0.66, 0.84];

const C1 = ['月亮每晚往下看。', '河里、井里、水缸里，都有一个它。'];
const EASE_TILT = 'cubic-bezier(.45,0,.2,1)';
const EASE_IO_CUBIC = 'cubic-bezier(.65,0,.35,1)';
const EASE_OUT = 'cubic-bezier(.2,.7,.3,1)';
/** The limb match hands over to the film here (film t, s). */
const TAKEOVER = 3.9;
const HOLD_AT = 3.45;
const FAIL_AFTER_MS = 8000;

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function darkMode(): boolean {
  const th = state.peek().settings.theme;
  if (th === 'dark') return true;
  if (th === 'light') return false;
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------- wake lock

interface Sentinel { release(): Promise<void>; addEventListener?(t: string, f: () => void): void }
function wakeLock() {
  let lock: Sentinel | null = null;
  let want = false;
  const get = () => {
    if (!want || lock || document.visibilityState !== 'visible') return;
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
      wl?.request('screen').then((s) => {
        if (!want) { s.release().catch(() => {}); return; }
        lock = s;
        s.addEventListener?.('release', () => { if (lock === s) lock = null; });
      }, () => {});
    } catch { /* a sandbox or an older browser simply goes without */ }
  };
  return {
    on() { want = true; get(); },
    visible() { get(); },
    off() {
      want = false;
      const l = lock;
      lock = null;
      try { l?.release().catch(() => {}); } catch { /* already gone */ }
    },
  };
}

// ---------------------------------------------------------------------------------------------- the card

function IntroCard(props: { from: IntroFrom }) {
  const [geo, setGeo] = useState(() => cardGeo(innerWidth, innerHeight));
  const [hint, setHint] = useState(false);
  const [late, setLate] = useState(false);
  const [muted, setMuted] = useState(false);
  const s = state.value.settings;
  const r = route.value;
  const el = {
    root: useRef<HTMLDivElement>(null), slot: useRef<HTMLDivElement>(null), bg: useRef<HTMLDivElement>(null),
    tilt: useRef<HTMLDivElement>(null), pond: useRef<HTMLDivElement>(null), sky: useRef<HTMLDivElement>(null),
    moon: useRef<HTMLDivElement>(null), halo: useRef<HTMLDivElement>(null), veil: useRef<HTMLDivElement>(null),
    bars: useRef<HTMLDivElement>(null), rings: useRef<HTMLDivElement>(null), start: useRef<HTMLButtonElement>(null),
    hint: useRef<HTMLParagraphElement>(null), sub: useRef<HTMLParagraphElement>(null), band: useRef<HTMLDivElement>(null),
    caps: useRef<HTMLDivElement>(null), live: useRef<HTMLDivElement>(null), skip: useRef<HTMLButtonElement>(null), mute: useRef<HTMLButtonElement>(null),
  };
  const ctl = useRef<ReturnType<typeof createGate> | null>(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const geoRef = useRef(geo);
  geoRef.current = geo;

  useLayoutEffect(() => {
    try { performance.mark('intro:card'); } catch { /* old browsers */ }
    const g = createGate(props.from, el, () => geoRef.current, { setHint, setLate, muted: () => mutedRef.current });
    ctl.current = g;
    g.mount();
    return () => g.dispose();
  }, []);

  // Resizing before the tap re-lays the card out; after it the composition is kept.
  useEffect(() => {
    const on = () => { if (intro.peek().phase === 'title') setGeo(cardGeo(innerWidth, innerHeight)); };
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  useEffect(() => { ctl.current?.inert(); }, [r]);
  useEffect(() => {
    if (!hint) return;
    for (const e of [el.hint.current, el.sub.current]) e?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' });
  }, [hint]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    const cur = state.peek().settings;
    audio.setEnabled(!m && cur.sound);
    music.setEnabled(!m && cur.music);
  };

  const { w, h, pond: p, refl, gate } = geo;
  const lift = 0.96 * h;
  const pts = `${p.tx0},${p.y0} ${p.tx1},${p.y0} ${p.x1},${p.y1} ${p.x0},${p.y1}`;
  const cls = 'intro-film' + (geo.L ? ' is-L' : ' is-P') + (geo.shortL ? ' is-shortL' : '');
  return (
    <div ref={el.root} class={cls} role="dialog" aria-modal="true" aria-label="开篇" lang="zh-CN" tabIndex={-1}
      onPointerDown={(e) => ctl.current?.stagePointer(e)}>
      <div ref={el.slot} class="intro-slot" />
      <div ref={el.bg} class="intro-bg" />
      <div ref={el.tilt} class="intro-tilt" aria-hidden="true">
        <div ref={el.sky} class="intro-skygrp">
          <div class="intro-sky" style={{ top: `${-lift - 0.06 * h}px`, height: `${h * 1.12}px` }} />
        </div>
        <div ref={el.pond} class="intro-pondgrp">
          <svg class="intro-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <defs>
              <filter id="intro-feather" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5" /></filter>
              <radialGradient id="intro-slab" cx="50%" cy="48%" r="62%">
                <stop offset="0" stop-color="#2e3746" stop-opacity="0.62" />
                <stop offset="0.7" stop-color="#2e3746" stop-opacity="0.56" />
                <stop offset="1" stop-color="#2e3746" stop-opacity="0.5" />
              </radialGradient>
              <radialGradient id="intro-slab2" cx="34%" cy="30%" r="46%">
                <stop offset="0" stop-color="#1c2330" stop-opacity="0.16" />
                <stop offset="1" stop-color="#1c2330" stop-opacity="0" />
              </radialGradient>
              <radialGradient id="intro-slab3" cx="72%" cy="74%" r="40%">
                <stop offset="0" stop-color="#5a6678" stop-opacity="0.14" />
                <stop offset="1" stop-color="#5a6678" stop-opacity="0" />
              </radialGradient>
            </defs>
            <polygon points={pts} fill="url(#intro-slab)" filter="url(#intro-feather)" />
            <polygon points={pts} fill="url(#intro-slab2)" />
            <polygon points={pts} fill="url(#intro-slab3)" />
            <g fill="none" stroke="rgba(27,25,22,.5)" stroke-width="1.2" stroke-linecap="round">
              {TUFTS.map((f, i) => {
                const x = p.x0 + (p.x1 - p.x0) * f, y = p.y1 + h * (0.035 + 0.012 * (i % 2));
                return <path d={`M${x} ${y}q${-2 - i % 3} ${-9 - i} ${-6 - i} ${-15 - i}M${x + 2} ${y}q1 -8 5 -13M${x + 4} ${y}q3 -5 9 -8M${x - 3} ${y}q-3 -4 -8 -6`} />;
              })}
              <path d={`M${p.x0 - 6} ${p.y1 + 3}q${(p.x1 - p.x0) * 0.5} ${h * 0.012} ${p.x1 - p.x0 + 12} 0`} stroke="rgba(27,25,22,.28)" stroke-width="1.6" />
            </g>
          </svg>
          <div ref={el.bars} class="intro-bars">
            {BARS.map(([dy, fw, dx, bh, a], i) => {
              const bw = fw * refl.bw;
              return (
                <div class="intro-bar" style={{ left: `${refl.x + dx * refl.bw - bw / 2}px`, top: `${refl.y + dy * refl.bh - bh / 2}px`, width: `${bw}px`, height: `${bh}px`, opacity: a }}>
                  <i style={{ animationDelay: `${-i * 0.37}s` }} />
                </div>
              );
            })}
          </div>
          <div ref={el.rings} class="intro-rings" />
        </div>
        <div ref={el.moon} class="intro-moon" style={{
          left: `${gate.x - gate.r}px`, top: `${gate.y - gate.r - lift}px`, width: `${2 * gate.r}px`, height: `${2 * gate.r}px`,
          transformOrigin: `${gate.r}px ${gate.oy - gate.y + gate.r}px`,
        }}>
          <div ref={el.halo} class="intro-halo" />
          <div ref={el.veil} class="intro-veil" />
        </div>
      </div>
      <button ref={el.start} type="button" class="intro-start" aria-label="轻触水面，开始播放"
        style={{ left: `${p.x0}px`, top: `${p.y0}px`, width: `${p.x1 - p.x0}px`, height: `${p.y1 - p.y0}px` }}
        onPointerDown={(e) => ctl.current?.down(e)}
        onClick={(e) => ctl.current?.click(e)} />
      <p ref={el.hint} class="intro-hint" style={{ top: `${geo.hintY}px`, fontSize: `${geo.hintPx}px` }} aria-hidden="true">轻触水面</p>
      <p ref={el.sub} class="intro-sub" style={{ top: `${geo.subY}px`, fontSize: `${geo.subPx}px` }} aria-hidden="true">{gateSubHint(s.sound, s.music)}</p>
      {late && <p class="intro-late" style={{ top: `${gate.y + gate.r * 1.5 + 12}px` }}>研墨…</p>}
      <div ref={el.band} class="intro-capband" aria-hidden="true" />
      <div ref={el.caps} class="intro-caps" aria-hidden="true">
        <p class="intro-cap">{C1.map((line) => <span class="intro-cap-line">{line}</span>)}</p>
      </div>
      <div ref={el.live} class="intro-live visually-hidden" aria-live="polite" />
      <div class="intro-silk" aria-hidden="true" />
      <button ref={el.skip} type="button" class="intro-chip intro-skip" onClick={() => ctl.current?.skipPress()}>略过</button>
      <button ref={el.mute} type="button" class="intro-chip intro-mute" aria-pressed={muted} onClick={toggleMute}>声</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the gate's flow

type ElKey = 'root' | 'slot' | 'bg' | 'tilt' | 'pond' | 'sky' | 'moon' | 'halo' | 'veil' | 'bars' | 'rings' | 'hint' | 'sub' | 'band' | 'caps' | 'live' | 'start' | 'skip' | 'mute';
type Els = Record<ElKey, { current: HTMLElement | null }>;

function createGate(from: IntroFrom, el: Els, geo: () => Geo, ui: { setHint(v: boolean): void; setLate(v: boolean): void; muted(): boolean }) {
  let phase: IntroPhase = 'title';
  let mountedAt = performance.now();
  let anims: Animation[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];
  let poll: ReturnType<typeof setInterval> | null = null;
  let mod: FilmModule | null = null;
  let prep: FilmPrep | null = null;
  let ready = false;
  let handle: FilmHandle | null = null;
  let clickAt = 0;
  let ringAt: number | null = null;
  let tap: { x: number; y: number } | null = null;
  let cut: { cut: 'full' | 'short'; tier: 'high' | 'low' | 'still' } = { cut: 'full', tier: 'high' };
  let held = false;
  let tookOver = false;
  let sceneGone = false;
  let skipped = false;
  let closed = false;
  let hidden = false;
  let savedEffect: AudioEngine['onEffect'] | undefined = undefined;
  let suspended = false;
  let inerted: Element[] = [];
  let prevFocus: Element | null = null;
  let selfNav = false;
  let reduced = reducedMotion();
  let wl = wakeLock();
  let watch = 0;


  function mount(): void {
    prevFocus = document.activeElement;
    inert();
    try { el.start.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
    addEventListener('keydown', onKey, true);
    addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    addEventListener('hashchange', onRoute);
    addEventListener('popstate', onRoute);
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('resize', onResize);
    prepare();
  }

  /** The viewport changed on the title card (a rotation, a window resize): prepare the film again at the new
   *  size, so it never plays at the old one (debounced; after the tap the film fits itself). */
  let prepSize = { w: 0, h: 0 };
  let prepSeal = '半亩';
  let resizeT: ReturnType<typeof setTimeout> | null = null;
  const onResize = (): void => {
    if (resizeT !== null) clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      resizeT = null;
      if (closed || phase !== 'title' || !mod || !prep) return;
      if (Math.abs(innerWidth - prepSize.w) <= 1 && Math.abs(innerHeight - prepSize.h) <= 1) return;
      ready = false;
      try { prep.dispose(); } catch { /* ignore */ }
      prepSize = { w: innerWidth, h: innerHeight };
      try {
        const p = mod.prepareFilm({ reduced: reduced, seal: prepSeal, w: prepSize.w, h: prepSize.h, dark: darkMode() });
        prep = p;
        p.takeoverReady.then(() => { if (prep === p) { ready = true; maybeStart(); } }, (e) => console.warn('[intro] takeover', e));
      } catch (e) {
        console.warn('[intro] prepare', e);
        prep = null;
        mod = null;
      }
    }, 250);
  };

  function dispose(): void {
    // unmounted from outside (never closed through finish): still undo everything
    if (!closed) finish(true);
  }

  /** inert on the app beneath (re-applied when the route re-creates the view). */
  function inert(): void {
    if (closed) return;
    try {
      for (const e of document.querySelectorAll('.shell > main, .shell > nav')) {
        if (!(e as HTMLElement).inert) { (e as HTMLElement).inert = true; inerted.push(e); }
      }
    } catch { /* no inert support: aria-modal still stands */ }
  }

  // ------------------------------------------------------------------------------ behind the card

  function prepare(): void {
    const filmP = loadFilm();
    // the garden paints its first complete frame, times it and holds (garden first, then the film)
    const gardenP = new Promise<void>((res) => {
      if (route.peek() !== 'garden') return res();
      let n = 0;
      const tick = () => {
        if (closed) return res();
        const g = gardenTargets();
        if (g) g.hooks.hold(true).then(res, res);
        else if (++n > 25) res();
        else later(tick, 100);
      };
      tick();
    });
    const cap = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => later(r, ms))]);
    filmP.then(async (m) => {
      await cap(gardenP, 2500);
      if (closed) return;
      mod = m;
      const cur = state.peek().settings;
      const seal = from === 'first' ? '半亩' : Array.from((cur.sealName || '').replace(/\s+/g, '')).slice(0, 4).join('') || '半亩';
      try {
        prepSeal = seal;
        prepSize = { w: innerWidth, h: innerHeight };
        prep = m.prepareFilm({ reduced: reduced, seal, w: prepSize.w, h: prepSize.h, dark: darkMode() });
      } catch (e) {
        console.warn('[intro] prepare', e);
        mod = null;
        return;
      }
      const p0 = prep;
      p0.takeoverReady.then(() => { if (prep === p0) { ready = true; maybeStart(); } }, (e) => { console.warn('[intro] takeover', e); });
      maybeStart();
    }, (e) => console.warn('[intro] film chunk', e));
    const fontsP = (async () => {
      try { await document.fonts?.load('24px "Ma Shan Zheng"', '轻触水面'); } catch { /* no font loading API */ }
    })();
    const nightP = filmP.then(async () => {
      for (let i = 0; i < 40 && !prep && !closed; i++) await new Promise<void>((r) => later(() => r(), 75));
      await prep?.nightReady;
    }).catch(() => {});
    void cap(Promise.all([fontsP, gardenP, nightP]), 3000).then(() => { if (!closed && phase === 'title') ui.setHint(true); });
  }

  // ------------------------------------------------------------------------------ the tap

  /** pointerdown: visual only (a touch does not unlock audio here). */
  function down(e: PointerEvent): void {
    if (phase !== 'title' || ringAt !== null) return;
    ringAt = performance.now();
    tap = clampTap(e.clientX, e.clientY);
    ring(tap.x, tap.y);
    scatter();
  }

  /** click (touch, mouse, Enter or Space): film t = 0. */
  function click(e: MouseEvent): void {
    if (phase !== 'title' || closed) return;
    clickAt = performance.now();
    phase = 'gate';
    try { void audio.unlock(); } catch { /* no audio */ }
    savedEffect = audio.onEffect;
    audio.onEffect = null;
    try { audio.drip(); } catch { /* no audio */ }
    try { music.prime(); } catch { /* no audio */ }
    const b = gardenTargets()?.hooks.bench();
    let bench: number | null = b && b.mpx > 0 ? b.ms / b.mpx : null;
    if (bench === null) try { bench = prep?.probe() ?? null; } catch { bench = null; }
    const nav = navigator as Navigator & { deviceMemory?: number };
    cut = chooseCut({ reduced: reduced, benchMsPerMpx: bench, cores: nav.hardwareConcurrency || null, mem: nav.deviceMemory ?? null });
    if (ringAt === null) {
      const g = geo();
      const kb = e.detail === 0 || (!e.clientX && !e.clientY);
      tap = kb ? { x: g.refl.x, y: g.refl.y } : clampTap(e.clientX, e.clientY);
      ring(tap.x, tap.y);
      scatter();
    }
    wl.on();
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    s1();
    setIntroPhase('gate');
    if (from === 'settings') {
      // the PV's own navigation: the snapshot and the settle targets must exist by 75 s
      selfNav = true;
      try { go('garden'); } catch { /* ignore */ }
      later(() => { selfNav = false; }, 1500);
    }
    maybeStart();
    poll = setInterval(tick, 50);
    later(() => { if (!handle && !closed) fail(); }, FAIL_AFTER_MS);
    watch = setInterval(watchdog, 5000) as unknown as number;
  }

  function clampTap(x: number, y: number): { x: number; y: number } {
    const p = geo().pond;
    return { x: Math.min(p.x1 - 12, Math.max(p.x0 + 12, x)), y: Math.min(p.y1 - 12, Math.max(p.y0 + 12, y)) };
  }

  function ring(x: number, y: number): void {
    const host = el.rings.current;
    if (!host) return;
    const g = geo();
    const rx = RING.rx * g.w, ry = rx * RING.ry;
    const n = reduced ? 1 : RING.n;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'intro-ring';
      d.style.cssText = `left:${x}px;top:${y}px;width:${2 * rx}px;height:${2 * ry}px;border-width:${RING.px}px`;
      host.appendChild(d);
      const kf = reduced
        ? [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.5 }, { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }]
        : [{ transform: 'translate(-50%,-50%) scale(.02)', opacity: RING.alpha }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }];
      const a = d.animate(kf, { duration: (reduced ? 0.6 : RING.dur) * 1000, delay: i * RING.stagger * 1000, easing: EASE_OUT, fill: 'both' });
      a.onfinish = () => d.remove();
    }
  }

  function scatter(): void {
    if (reduced) return;
    const bars = el.bars.current?.children;
    if (!bars) return;
    for (let i = 0; i < bars.length; i++) {
      const [dx, dy] = SCATTER[i % SCATTER.length];
      (bars[i] as HTMLElement).animate(
        [{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px)`, offset: 0.25 }, { transform: 'none' }],
        { duration: 2400, easing: 'ease-out' },
      );
    }
  }

  /** S1 and C1, all from the click: tilt 0.8–3.5, limb match 3.5–4.3, C1 1.0 / 3.6 → 8.4. */
  function s1(): void {
    const e = el, g = geo();
    const an = (node: Element | null, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (!node) return;
      try { anims.push(node.animate(kf, { fill: 'both', ...o })); } catch { /* no WAAPI: the film still takes over */ }
    };
    const lift = 0.96 * g.h;
    // the gate's clock: a no-op animation that runs (and pauses) with the others; anims[0]
    an(e.slot.current, [{ visibility: 'visible' }, { visibility: 'visible' }], { duration: 30_000, fill: 'none' });
    // the hint and the tap target go with the tap
    for (const n of [e.hint.current, e.sub.current]) n?.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    if (e.start.current) {
      e.start.current.style.visibility = 'hidden';
      try { e.root.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    if (!reduced) {
      an(e.tilt.current, [{ transform: 'translateY(0)' }, { transform: `translateY(${lift}px)` }], { delay: 800, duration: 2700, easing: EASE_TILT });
      an(e.moon.current, [{ transform: 'scale(1)' }, { transform: `scale(${MOON_GATE.S})` }], { delay: 3500, duration: 800, easing: EASE_IO_CUBIC });
      an(e.veil.current, [{ opacity: 0 }, { opacity: 0.4 }], { delay: 3500, duration: 800 });
      an(e.halo.current, [{ opacity: 1 }, { opacity: 0 }], { delay: 3500, duration: 400 });
    } else {
      // no tilt: a ≥ 600 ms cross-fade from the pond to the settled moon, and the limb match as a fade
      an(e.tilt.current, [
        { transform: 'translateY(0)', opacity: 1, offset: 0 }, { transform: 'translateY(0)', opacity: 0, offset: 0.5 },
        { transform: `translateY(${lift}px)`, opacity: 0, offset: 0.5 }, { transform: `translateY(${lift}px)`, opacity: 1, offset: 1 },
      ], { delay: 800, duration: 1400 });
    }
    // everything but the moon clears for the film beneath (3.9–4.3); the moon is gone by 4.3
    // (with the tilt the pond has slid down out of the shot by ~2 s: it fades then, never a pale remnant at the bottom)
    if (!reduced) an(e.pond.current, [{ opacity: 1 }, { opacity: 0 }], { delay: 1500, duration: 600 });
    for (const n of reduced ? [e.bg.current, e.sky.current, e.pond.current] : [e.bg.current, e.sky.current]) an(n, [{ opacity: 1 }, { opacity: 0 }], { delay: 3900, duration: 400 });
    an(e.moon.current, [{ opacity: 1 }, { opacity: 0 }], reduced ? { delay: 3500, duration: 800 } : { delay: 4300, duration: 50 });
    // C1 — gate-owned, timed from the click
    const lines = e.caps.current?.querySelectorAll('.intro-cap-line') ?? [];
    const fade = reduced ? 600 : 500;
    const lineIn = (i: number, at: number) => an(lines[i], reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { delay: at * 1000, duration: fade });
    lineIn(0, 1.0);
    lineIn(1, 3.6);
    an(e.band.current, [{ opacity: 0 }, { opacity: 1 }], { delay: 800, duration: 600 });
    an(e.band.current, [{ opacity: 1 }, { opacity: 0 }], { delay: 8400, duration: 250, fill: 'forwards' });
    an(e.caps.current, [{ opacity: 1 }, { opacity: 0 }], { delay: 8400, duration: 200, fill: 'forwards' });
    const last = anims[anims.length - 1];
    if (last) last.onfinish = () => { for (const n of [e.caps.current, e.band.current]) if (n) n.style.display = 'none'; };
    // the aria-live mirror
    later(() => say(C1[0]), 1000);
    later(() => say(C1[1]), 3600);
  }

  function say(text: string): void {
    const live = el.live.current;
    if (live && !closed && !held) live.textContent = text;
  }

  // ------------------------------------------------------------------------------ the gate's clock

  /** Film time (s) as the gate's own animations see it (paused while held or hidden). */
  function gateTime(): number {
    const a = anims[0];
    const ct = a?.currentTime;
    if (typeof ct === 'number') return ct / 1000;
    return (performance.now() - clickAt) / 1000;
  }

  const tick = (): void => {
    if (closed) return;
    const t = gateTime();
    if (!handle && !held && t >= HOLD_AT) hold();
    if (handle && !tookOver && t >= TAKEOVER) takeover();
    if (tookOver && !sceneGone && t >= 4.35) {
      sceneGone = true;
      for (const n of [el.tilt.current, el.bg.current]) if (n) (n as HTMLElement).style.display = 'none';
    }
    if (sceneGone && t >= 8.7 && poll !== null) { clearInterval(poll); poll = null; }
  };

  /** The film is late at 3.45: hold at 3.5, before the limb match, with the audio frozen. */
  function hold(): void {
    held = true;
    for (const a of anims) try { a.pause(); } catch { /* ignore */ }
    const ctx = audio.context;
    if (ctx && ctx.state === 'running') { suspended = true; ctx.suspend().catch(() => {}); }
    later(() => { if (held && !closed) ui.setLate(true); }, 2500);
  }

  function maybeStart(): void {
    if (closed || handle || phase === 'title' || !mod || !prep || !ready || skipped) return;
    const t = gateTime();
    const tapAt = performance.now() - t * 1000; // rebased after a hold: film t = the gate's t now
    try {
      handle = mod.startFilm(prep, {
        root: el.slot.current as HTMLElement,
        tapAt, ringAt: ringAt, tap: tap, cut: cut.cut, tier: cut.tier, from: from,
        muted: () => ui.muted(),
        onPhase: (p) => onPhase(p),
        onDone: (r) => { if (r === 'error') console.warn('[intro] film error'); close(r === 'error' ? 300 : 0); },
      });
    } catch (e) {
      console.warn('[intro] start', e);
      handle = null;
      fail();
      return;
    }
    if (held) {
      held = false;
      ui.setLate(false);
      if (suspended) { suspended = false; audio.context?.resume().catch(() => {}); }
      if (!hidden) for (const a of anims) try { a.play(); } catch { /* ignore */ }
    }
  }

  function takeover(): void {
    if (tookOver) return;
    tookOver = true;
    markSeen(); // written when the film takes over from the gate
    if (phase === 'gate') { phase = 'film'; setIntroPhase('film'); }
  }

  function onPhase(p: IntroPhase): void {
    if (closed) return;
    if (p === 'film') takeover();
    phase = p;
    setIntroPhase(p);
    // a skip while C1 is up: the tail clears the gate's caption with the film's own
    if (p === 'tail') for (const n of [el.caps.current, el.band.current]) n?.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    if (p === 'out') {
      for (const c of [el.skip.current, el.mute.current]) c?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      backToSettings();
    }
  }

  /** A replay whose garden never mounted cross-fades back to Settings (the fallback ladder, D). */
  function backToSettings(): void {
    if (from !== 'settings' || gardenTargets() || route.peek() === 'settings') return;
    selfNav = true;
    try { go('settings'); } catch { /* ignore */ }
    later(() => { selfNav = false; }, 1500);
  }

  // ------------------------------------------------------------------------------ skip, guards

  /** 「略过」 or Esc: before the takeover the card's plain close; after it the film's tail; again: at once. */
  function skipPress(): void {
    if (closed || performance.now() - mountedAt < 400) return;
    if (!tookOver) {
      markSeen();
      skipped = true;
      close(600);
      return;
    }
    if (skipped || phase === 'tail' || phase === 'out') {
      try { handle?.endNow(); } catch { close(300); }
      return;
    }
    skipped = true;
    try { handle?.skip(); } catch { close(300); }
  }

  const onKey = (e: KeyboardEvent): void => {
    // the start button's focus cue shows only once the keyboard is in use (it is focused at load)
    if (e.key !== 'Escape') { try { el.root.current?.classList.add('kbd'); } catch { /* ignore */ } }
    if (e.key !== 'Escape' || closed) return;
    e.preventDefault();
    e.stopPropagation();
    skipPress();
  };

  const onTouchEnd = (): void => {
    removeEventListener('touchend', onTouchEnd, true);
    try { void audio.unlock(); } catch { /* ignore */ }
    try { music.prime(); } catch { /* ignore */ }
  };

  /** Android back, browser back, a hash change the PV did not cause: end cleanly. */
  const onRoute = (): void => {
    if (closed || selfNav) return;
    if (!tookOver) { close(300); return; }
    const toGarden = /^#?\/?(garden)?$/.test(location.hash);
    try {
      if (toGarden && gardenTargets() && !skipped) { skipped = true; handle?.skip(); }
      else handle?.endNow();
    } catch { close(0); }
  };

  const onVisibility = (): void => {
    hidden = document.visibilityState === 'hidden';
    if (closed) return;
    if (hidden) {
      if (phase === 'gate') for (const a of anims) try { a.pause(); } catch { /* ignore */ }
      return;
    }
    wl.visible();
    if (phase !== 'gate' || held) return;
    // a return during S1 or the limb match resumes at the takeover with the gate's end state
    for (const a of anims) {
      try {
        if (handle && typeof a.currentTime === 'number' && a.currentTime < TAKEOVER * 1000) a.currentTime = TAKEOVER * 1000;
        a.play();
      } catch { /* ignore */ }
    }
  };

  /** A tap on the stage after the takeover: the film draws a small ring (or the next still). */
  function stagePointer(e: PointerEvent): void {
    if (!tookOver || closed || !handle) return;
    const t = e.target as Element | null;
    if (t?.closest?.('.intro-chip')) return;
    try { handle.stageTap(e.clientX, e.clientY); } catch { /* ignore */ }
  }

  const watchdog = (): void => {
    // the PV never outlives its film: it closes when the film clock has not moved for 15 s while visible
    // (a stall), or at a generous wall-time ceiling; a rewind after a hidden tab is progress, not a stall
    if (document.visibilityState !== 'visible') return;
    watchMs += 5000;
    const st = el.slot.current?.querySelector<HTMLElement>('.intro-stage');
    const t = st ? Number(st.dataset.t ?? NaN) : gateTime();
    if (Number.isFinite(t) && t !== lastFilmT) { lastFilmT = t; stuckMs = 0; } else stuckMs += 5000;
    if (stuckMs >= 15_000 || watchMs > ((cut.cut === 'full' ? 86 : 70.8) + 11) * 1000 + 90_000) {
      console.warn('[intro] watchdog');
      close(300);
    }
  };
  let lastFilmT = -1;
  let stuckMs = 0;
  let watchMs = 0;

  // ------------------------------------------------------------------------------ closing

  /** The chunk failed or is 8 s late: close quietly, NOT marked seen. */
  function fail(): void {
    if (closed) return;
    close(600);
  }

  /** Fade the whole PV out (WAAPI, so reduced motion still fades), then finish. */
  function close(ms: number): void {
    if (closed || closing) return;
    closing = true;
    try { handle?.destroy(); } catch { /* ignore */ }
    handle = null;
    const root = el.root.current;
    if (!ms || !root) return finish(false);
    try {
      const a = root.animate([{ opacity: getComputedStyle(root).opacity }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
      a.onfinish = () => finish(false);
      later(() => finish(false), ms + 400); // a finish event that never comes
    } catch {
      finish(false);
    }
  }
  let closing = false;

  /** Every close ends here: restores, then the app. */
  function finish(unmounting: boolean): void {
    if (closed) return;
    closed = true;
    for (const t of timers) clearTimeout(t);
    if (poll !== null) clearInterval(poll);
    clearInterval(watch);
    try { handle?.destroy(); } catch { /* ignore */ }
    try { prep?.dispose(); } catch { /* ignore */ }
    removeEventListener('keydown', onKey, true);
    removeEventListener('touchend', onTouchEnd, true);
    removeEventListener('hashchange', onRoute);
    removeEventListener('popstate', onRoute);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('resize', onResize);
    if (resizeT !== null) clearTimeout(resizeT);
    // sound: the duck handler, the session mute, a frozen context
    if (savedEffect !== undefined) audio.onEffect = savedEffect;
    const cur = state.peek().settings;
    audio.setEnabled(cur.sound);
    music.setEnabled(cur.music);
    if (suspended) { suspended = false; audio.context?.resume().catch(() => {}); }
    wl.off();
    try { void gardenTargets()?.hooks.hold(false); } catch { /* ignore */ }
    for (const e of inerted) (e as HTMLElement).inert = false;
    inerted = [];
    if (!unmounting) endIntro();
    const f = prevFocus as HTMLElement | null;
    setTimeout(() => {
      try {
        if (f && f.isConnected && f !== document.body) f.focus({ preventScroll: true });
        else (document.activeElement as HTMLElement | null)?.blur?.();
      } catch { /* ignore */ }
    }, 0);
  }

  function later(f: () => void, ms: number): void {
    timers.push(setTimeout(f, ms));
  }
  return { mount, dispose, inert, down, click, skipPress, stagePointer };
}
