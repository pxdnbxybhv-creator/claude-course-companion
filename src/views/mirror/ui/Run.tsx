// 水月幻镜 · a run on screen (API.md §4): ritual → 研墨 → between-wave screens ↔ waves, until 镜碎 or
// 暂离. The run lives in meta.active; every pick is a pure logic call committed at once, a wave goes
// through session.startWave / waveWon / died, and the engine only reports back through its hooks. The
// canvas and the engine live for the whole run (one engine, many waves). Unmount disposes both and
// saves; the between-wave state is already saved, and a wave cut short replays (resumeCheck counts it).
// The session is a seam (`sess`): the tutorial 「初入镜中」 plays through the same view with an
// in-memory session (tutor/session.ts), its wave scripts (engine/tutor.ts) and the coach
// (ui/Tutorial.tsx); real runs get the first-time tips through the same coach. The pause sheet, the
// boss card and a coach hold are one set of holds: the engine resumes only when the set is empty.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { mirror, saveMetaNow } from '../../../app/mirror';
import { openSheets, toast } from '../../../ui/kit';
import { coinToast } from '../../../ui/coins';
import { coins } from '../../../app/play';
import { todayKey } from '../../../core/date';
import { bakeScale, createPainter } from '../paint';
import { arenaGeom, computeStats, nextScreen, openShop, unlocksOf } from '../logic';
import { realSession, type RunSession } from '../logic/session';
import { COMPANIONS } from '../data';
import type {
  BakeStage, BossEvent, CodexKey, DeathResult, Engine, EngineHooks, EngineSettings, HudState, MirrorAudio, MirrorSettings, Painter, Quality,
  RunReport, RunSave, WaveResult,
} from '../types';
import { loadEngine } from './engineHost';
import { Controls, Hud, type HudApi } from './Hud';
import { PauseSheet } from './Pause';
import { Bake, Ritual } from './Ritual';
import { BossCard, Cards, Crate, HeartPick, Ready, StartPick } from './Screens';
import { Shop } from './Shop';
import { WhoSheet } from './Panel';
import { rememberPanelBase } from './panelView';
import { attachScript, attachTipWatch } from '../engine/tutor';
import { classify } from '../tutor/classify';
import { tutorScript } from '../tutor/run';
import type { RunEvent, RunScreen } from '../tutor/events';
import type { TutorSession } from '../tutor/session';
import { LINES } from '../tutor/lines';
import { Coach, TipsBrain, TutorBrain, TutorEnd, type CoachBrain } from './Tutorial';
import { tipDue } from './tips';
import { keysVector, voidNote } from './text';
import { calmNow, rememberPlayed } from './prefs';

export interface RunEnd { report: RunReport; snap: HTMLCanvasElement | null }
type Stage = 'ritual' | 'bake' | 'between' | 'wave' | 'dying';

/** Reduced motion: the OS setting or the mirror's own 减少动态. */
export const prefersReduced = calmNow;
/**
 * 自动 → a quality. Phones get mid (iOS reports few cores whatever the chip, so cores say little);
 * low only for a device that says it is weak (≤ 2 GB or ≤ 2 cores); a desktop or a large tablet with a
 * fine pointer gets high. Every quality draws at the screen's own resolution (dprCapOf): quality
 * decides the effects, and the engine lowers the resolution itself when frames run slow.
 */
export function qualityOf(q: MirrorSettings['quality']): Quality {
  if (q !== 'auto') return q;
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if ((typeof mem === 'number' && mem > 0 && mem <= 2) || cores <= 2) return 'low';
    if (coarse) return 'mid';
    return window.innerWidth >= 900 ? 'high' : 'mid';
  } catch { return 'mid'; }
}
/** The canvas's device-pixel-ratio cap: native up to 3 at every quality (a DPR-3 phone is never
 *  stretched); the engine's dynamic resolution steps down from it under load (engine/index.ts). */
export function dprCapOf(_q: Quality): number { return 3; }
/** The run's sprite resolution (px per u) for this screen: the camera's scale here × a little headroom
 *  (paint/index.ts bakeScale). A desktop window may grow after the bake, so it bakes for the largest
 *  camera scale (a window ≥ 600 px on its short side). */
export function spriteScale(quality: Quality, el?: Element | null): number {
  const dpr = Math.min(dprCapOf(quality), (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  let w = 0, h = 0;
  try { const r = el?.getBoundingClientRect(); w = r?.width ?? 0; h = r?.height ?? 0; } catch { /* no layout */ }
  if (!w || !h) { w = typeof window !== 'undefined' ? window.innerWidth : 390; h = typeof window !== 'undefined' ? window.innerHeight : 844; }
  let coarse = true;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* assume a phone */ }
  if (!coarse) { w = Math.max(w, 600); h = Math.max(h, 600); }
  return bakeScale(w, h, dpr, quality);
}
/** The engine's settings; the tutorial always auto-aims (its lines speak of auto-aim; the setting is kept). */
function engineSettings(practice = false): EngineSettings {
  const s = mirror.value.settings;
  const quality = qualityOf(s.quality);
  const reduceMotion = prefersReduced();
  return { quality, dprCap: dprCapOf(quality), reduceMotion, nums: s.nums, shake: s.shake && !reduceMotion, aim: practice ? 'auto' : s.aim, lang: lang.value === 'en' ? 'en' : 'zh' };
}
/** A sheet or a coach hold is up: the run's own keys wait (Space during a hold never casts the skill). */
const sheetOpen = () => !!document.querySelector('.sheet-backdrop, .mj-coach.is-hold');

type Hold = 'pause' | 'intro' | 'coach';

export function RunView(props: {
  initial: RunSave; ritual: 'paid' | 'free' | 'tutor' | null; audio: MirrorAudio; onEnd: (e: RunEnd) => void; onLeave: (note?: string) => void;
  /** The session (default: the real one, logic/session.ts). The tutorial passes its in-memory one. */
  sess?: RunSession;
  /** The tutorial's practice run: the coach, no records, the end card instead of the wave-3 shop. */
  practice?: boolean;
  /** Everything the run reports (tutor/events.ts), for a listener outside. */
  onEvent?: (e: RunEvent) => void;
  /** The tutorial's end card: 「去入镜」 (true) or 「回镜前」 (false). */
  onTutorEnd?: (enter: boolean) => void;
}) {
  const t = useT();
  const S = props.sess ?? realSession;
  const practice = !!props.practice && S.practice;
  const [run, setRunState] = useState(props.initial);
  const runRef = useRef(run);
  const setRun = (r: RunSave) => { runRef.current = r; setRunState(r); };
  const [stage, setStageState] = useState<Stage>(props.ritual ? 'ritual' : 'bake');
  const stageRef = useRef(stage);
  const setStage = (s: Stage) => { stageRef.current = s; setStageState(s); };
  const [progress, setProgress] = useState(0);
  const [bg, setBg] = useState<number | null>(null);
  const bgP = useRef<Promise<void> | null>(null);
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const setPaused = (p: boolean) => { pausedRef.current = p; setPausedState(p); };
  /** A pause asked for during the engine's 1.2 s wave end: the wave is already won, so it finishes and
   *  the sheet opens over the next screen (pausing there would turn a won wave into a replay). */
  const pauseAfterEnd = useRef(false);
  const [confirm, setConfirm] = useState<'leave' | 'abandon' | null>(null);
  const [intro, setIntroState] = useState<(BossEvent & { kind: 'intro' }) | null>(null);
  const introRef = useRef<typeof intro>(null);
  const setIntro = (v: typeof intro) => { introRef.current = v; setIntroState(v); };
  const [whoOpen, setWhoOpenState] = useState(false);
  const setWhoOpen = (o: boolean) => { setWhoOpenState(o); emit({ k: 'who', open: o }); };
  /** The holds on the engine (pause sheet, boss card, coach): it resumes only when none is left. */
  const holds = useRef(new Set<Hold>());
  const [holdN, setHoldN] = useState(0);
  const addHold = (h: Hold) => { holds.current.add(h); engine.current?.pause(); setHoldN(holds.current.size); };
  const dropHold = (h: Hold) => {
    holds.current.delete(h);
    setHoldN(holds.current.size);
    if (!holds.current.size && stageRef.current === 'wave' && engine.current?.phase === 'wave') engine.current.resume();
  };
  /** The boss card's first-time tip (real runs), fixed when the card comes up. */
  const [bossTip, setBossTip] = useState<{ line: string; go: string } | null>(null);
  /** False when the loaded content has no 镜技 for this companion (its lane failed to load): the 技
   *  button then shows as spent instead of looking live and doing nothing. */
  const [skillLive, setSkillLive] = useState(true);
  /** 文 that sank with the glass (the fatal wave's sleeve), for the 镜碎 overlay. */
  const [sank, setSank] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const painter = useRef<Painter | null>(null);
  const hud = useRef<HudApi | null>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const ended = useRef(false);
  const P = useRef(props);
  P.current = props;
  const unlocks = useMemo(() => (props.sess ? S.unlocks() : unlocksOf(mirror.value)), []);
  // ── the coach: the tutorial's step machine, or the real runs' first-time tips
  const brain = useMemo<CoachBrain>(() => (practice
    ? new TutorBrain(S as TutorSession, {
      left: () => mirror.value.settings.left, unlocks,
      onRun: (r) => setRun(r),
      onCloseWho: () => setWhoOpen(false),
    })
    : new TipsBrain({ run: () => runRef.current, unlocks, busy: () => holds.current.size > 0 || !!document.querySelector('.sheet-backdrop') })), []);
  /** Report an event to the coach and the listener; true when the coach wants the engine held. */
  const emit = (ev: RunEvent): boolean => {
    try { P.current.onEvent?.(ev); } catch { /* a listener's */ }
    let hold = false;
    try { hold = brainRef.current?.event(ev) === true; } catch (e) { console.warn('[mirror] coach', e); }
    return hold;
  };
  const brainRef = useRef<CoachBrain | null>(null);
  brainRef.current = brain;
  /** A script's cue or the tip watcher's: true holds the engine (it pauses after this step). */
  const cue = (key: string, v?: number): boolean => {
    const hold = emit({ k: 'cue', key, v });
    if (hold) { holds.current.add('coach'); setHoldN(holds.current.size); }
    return hold;
  };
  const coachOk = () => {
    brain.ok();
    if (holds.current.has('coach') && !(brain.bubble && brain.bubble.mode === 'hold')) dropHold('coach');
  };
  const settings = mirror.value.settings;
  const reduced = prefersReduced();
  const lowQ = useMemo(() => qualityOf(settings.quality) === 'low', []);

  /** Until this engine has drawn a wave its canvas is blank (opaque black): the screens before the
   *  first wave of a sitting (择器, 第 1 重, or the shop after 续镜) sit on the pond the painter
   *  already inked behind 研墨 instead. The engine's first frame paints over it. */
  const waveDrawn = useRef(false);
  const backdrop = () => {
    const c = canvas.current, p = painter.current;
    if (waveDrawn.current || !c || !p || c.width < 2 || c.height < 2) return;
    try {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(p.arenaImage(c.width, c.height), 0, 0);
    } catch { /* the plain paper shows */ }
  };

  // ── the arena ink so far (画卷 and 存画)
  const snap = (): HTMLCanvasElement | null => {
    try { return engine.current?.snapshot(720, 720) ?? painter.current?.arenaImage(720, 720) ?? null; } catch { return null; }
  };
  const end = (report: RunReport) => {
    if (ended.current) return;
    ended.current = true;
    P.current.onEnd({ report, snap: snap() });
  };

  // ── between waves: the next screen from run.pending (the shop opens here, idempotently)
  const between = (r0: RunSave) => {
    let r = r0;
    const s = nextScreen(r);
    if (s === 'shop') {
      const o = openShop(r, unlocks);
      if (o !== r) { r = o; S.commit(r); }
      const seen = (r.shop?.slots ?? []).filter((x) => !!x).map((x) => `${x!.kind === 'weapon' ? 'wpn' : 'item'}:${x!.id}` as CodexKey);
      if (seen.length) S.markSeen(seen);
      backgroundBake(r);
    }
    setRun(r);
    setStage('between');
    if (pauseAfterEnd.current) { pauseAfterEnd.current = false; setPaused(true); }
    P.current.audio.music('shop', r.map);
  };
  /** The next boss in the wave-9/19/29/39 shops; the other rosters (倒影) in the wave-30 shop. */
  const backgroundBake = (r: RunSave) => {
    const p = painter.current;
    if (!p || bgP.current) return;
    const stageName: BakeStage | null = r.wave === 30 ? 'endless' : (r.wave + 1) % 10 === 0 ? 'boss' : null;
    if (!stageName) return;
    const ids = p.plan(r, stageName).filter((id) => !p.has(id));
    if (!ids.length) return;
    setBg(0);
    bgP.current = p.bake(ids, (d, n) => setBg(n ? d / n : 1))
      .catch((e) => console.warn('[mirror] bake', e))
      .finally(() => { bgP.current = null; setBg(null); });
  };

  const onRun = (r: RunSave, sfx?: 'buy' | 'reroll' | 'merge') => {
    const prev = runRef.current;
    S.commit(r);
    const act = classify(prev, r);
    P.current.audio.sfx(sfx ?? 'uiTap');
    between(r);
    settleFocus();
    if (act) emit({ k: 'act', a: act.a, slot: act.slot });
  };
  /** After a pick made with the pointer, focus leaves the clicked button (Enter / Space then mean the
   *  screen's default, never that button again); a keyboard user's focus stays where it was. */
  const settleFocus = () => {
    const a = document.activeElement as HTMLElement | null;
    const w = wrap.current;
    if (!a || !w || a === w || !w.contains(a)) return;
    let visible = true;
    try { visible = a.matches(':focus-visible'); } catch { /* an engine without :focus-visible */ }
    if (!visible) w.focus({ preventScroll: true });
  };

  const nextWave = async () => {
    if (stageRef.current !== 'between') return;
    if (bgP.current) await bgP.current;
    const eng = engine.current;
    if (!eng || stageRef.current !== 'between') return;
    const { run: r, setup } = S.startWave(runRef.current);
    setRun(r);
    setStage('wave');
    setPaused(false);
    holds.current.clear();
    setHoldN(0);
    pauseAfterEnd.current = false;
    if (!practice) { rememberPlayed(todayKey(), r.seed); rememberPanelBase(r); }
    waveDrawn.current = true;
    try {
      eng.start(r, setup);
      // the tutorial's wave script, or the real run's read-only first-time-tip watcher
      if (practice) attachScript(eng, tutorScript(setup.wave), cue);
      else if (tipDue(mirror.value, 'elite')) attachTipWatch(eng, (k) => { cue(k); });
    } catch (e) {
      onError(e, true);
      return;
    }
    P.current.audio.music(setup.plan.boss ? 'boss' : 'wave', r.map);
    wrap.current?.focus({ preventScroll: true });
  };

  // ── engine hooks (a stable object: everything it touches is a ref)
  const onWaveEnd = (res: WaveResult) => {
    const before = runRef.current.coins;
    const next = S.waveWon(res);
    if (!next || ended.current) return;
    if (!practice) rememberPlayed(todayKey(), next.seed);
    const banked = next.coins - before;
    if (banked > 0 && !practice) coinToast(banked, { note: t('入囊', 'into your purse') });
    between(next);
  };
  const onDeath = (d: DeathResult) => {
    if (ended.current) return;
    setSank(d.partial.sleeve.reduce((n, c) => n + c.worth, 0));
    setStage('dying');
    const image = snap();
    const report = S.died(d);
    P.current.audio.music('results', runRef.current.map);
    setTimeout(() => {
      if (ended.current) return;
      ended.current = true;
      if (report) P.current.onEnd({ report, snap: image });
      else P.current.onLeave();
    }, reduced ? 300 : 1500);
  };
  const onError = (e: unknown, fatal: boolean) => {
    console.error('[mirror] engine', e);
    if (!fatal || ended.current) return;
    engine.current?.pause();
    if (practice) {
      // the tutorial has nothing to give back: a line, and back to the lobby
      ended.current = true;
      toast(t(LINES.snag.base.zh, LINES.snag.base.en), 4000);
      P.current.onLeave();
      return;
    }
    // say what the void really gave back: the fee (once a day), today's free run, or nothing
    const free = runRef.current.free;
    const purse = coins.value;
    const report = S.engineFailed();
    if (report) end(report);
    else {
      ended.current = true;
      toast(voidNote({ free, refunded: Math.max(0, coins.value - purse), freeBack: free && !mirror.value.payDay.free }, t), 4000);
      P.current.onLeave();
    }
  };
  const hooks = useMemo<EngineHooks>(() => ({
    hud: (s) => { hud.current?.push(s); emit({ k: 'hud', s }); },
    levelUp: (l) => { hud.current?.levelUp(l); emit({ k: 'levelUp', level: l }); },
    crate: (n) => { hud.current?.crate(n); emit({ k: 'crate', total: n }); },
    coin: (_d, sleeve) => hud.current?.coin(sleeve),
    boss: (ev) => {
      emit({ k: 'boss', ev });
      if (ev.kind !== 'intro') return;
      holds.current.add('intro');
      setHoldN(holds.current.size);
      setBossTip(!practice && brainRef.current instanceof TipsBrain ? brainRef.current.bossTip() : null);
      setIntro(ev);
    },
    waveEnd: (r) => onWaveEnd(r),
    death: (d) => onDeath(d),
    error: (e, fatal) => onError(e, fatal),
  }), []);

  // ── 研墨: bake the start plan, paint the arena, prime the voices, build the engine
  useEffect(() => {
    if (stage !== 'bake') return;
    let dead = false;
    void (async () => {
      const r = runRef.current;
      const es = engineSettings(practice);
      const p = painter.current ?? (painter.current = createPainter(r.map, es.quality, Math.min(es.dprCap, window.devicePixelRatio || 1), spriteScale(es.quality, wrap.current)));
      const engP = loadEngine();
      engP.catch(() => {});
      const primed = P.current.audio.prime();
      try {
        await p.bake(p.plan(r, 'start'), (d, n) => { if (!dead) setProgress(n ? (d / n) * 0.92 : 0.92); });
        if (dead) return;
        p.paintArena(arenaGeom(r.map, r.seed), r.seed, r.wave >= 30);
        await Promise.race([primed, new Promise((k) => setTimeout(k, 1500))]);
        setProgress(1);
      } catch (e) {
        console.warn('[mirror] bake', e);
      }
      let mod;
      try {
        mod = await engP;
      } catch (e) {
        if (dead) return;
        // the engine's code could not load (offline before it was ever cached): a run already under
        // way stays paused for later; one that has not cleared a wave is void (GDD §23)
        if (runRef.current.wave < 1) { onError(e, true); return; }
        console.error('[mirror] engine failed to load', e);
        ended.current = true;
        toast(t('镜未能打开（离线？），此照仍在，稍后续镜。', 'The mirror could not open (offline?): the run waits; come back later.'), 4000);
        P.current.onLeave();
        return;
      }
      if (dead || !canvas.current) return;
      try {
        engine.current = mod.createEngine(canvas.current, r, { painter: p, audio: P.current.audio, content: mod.content, hooks, settings: es });
      } catch (e) {
        onError(e, true);
        return;
      }
      backdrop();
      setSkillLive(mod.stub || !!mod.content.skills[COMPANIONS[r.char].skill]);
      between(runRef.current);
    })();
    return () => { dead = true; };
  }, [stage === 'bake']);

  // ── unmount: stop everything and save
  useEffect(() => () => {
    try { engine.current?.dispose(); } catch { /* already */ }
    engine.current = null;
    try { painter.current?.dispose(); } catch { /* already */ }
    painter.current = null;
    saveMetaNow();
  }, []);

  // ── pause / resume
  const pause = () => {
    const s = stageRef.current;
    if ((s !== 'wave' && s !== 'between') || pausedRef.current) return;
    if (s === 'wave' && engine.current?.phase === 'ending') { pauseAfterEnd.current = true; return; }
    if (s === 'wave') addHold('pause');
    else engine.current?.pause();
    setPaused(true);
    emit({ k: 'pause', open: true });
  };
  const resume = () => {
    setPaused(false);
    setConfirm(null);
    emit({ k: 'pause', open: false });
    if (stageRef.current === 'wave') dropHold('pause');
    wrap.current?.focus({ preventScroll: true });
  };
  const leave = () => {
    if (practice) {
      // leaving the tutorial: nothing to save or settle (its flags stay as they are)
      engine.current?.pause();
      ended.current = true;
      P.current.onLeave();
      return;
    }
    if (stageRef.current === 'wave') {
      engine.current?.pause();
      const res = S.leaveMidWave();
      if (res.report) { end(res.report); return; }
      ended.current = true;
      P.current.onLeave(t(`此重将重来 · 已中断 ${res.interruptions}/3 次`, `This wave will replay · ${res.interruptions}/3 interruptions`));
      return;
    }
    ended.current = true;
    saveMetaNow();
    P.current.onLeave();
  };
  const giveUp = () => {
    engine.current?.pause();
    const report = S.abandon();
    if (report) end(report);
    else { ended.current = true; P.current.onLeave(); }
  };

  // auto-pause when the page hides or loses focus mid-wave
  useEffect(() => {
    if (stage !== 'wave') return;
    const vis = () => { if (document.visibilityState === 'hidden') pause(); };
    const blur = () => pause();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', blur);
    };
  }, [stage]);

  // a sheet from elsewhere (a letter arriving) pauses the wave, as a blur does
  useEffect(() => openSheets.subscribe((n) => { if (n > 0 && stageRef.current === 'wave' && !pausedRef.current) pause(); }), []);

  // between waves, Esc / P opens the pause sheet (the screens own their other keys)
  useEffect(() => {
    if (stage !== 'between') return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Esc pauses even over a coach hold (its tip comes back after 继续); a real sheet owns its own Esc
      if (k === 'escape' && !document.querySelector('.sheet-backdrop')) { e.preventDefault(); pause(); return; }
      if (sheetOpen()) return;
      if (k === 'escape' || k === 'p') { e.preventDefault(); pause(); }
      else if (k === 'c') { e.preventDefault(); setWhoOpen(true); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [stage]);

  // keys mid-wave: WASD / arrows, Q / Space, Esc / P
  useEffect(() => {
    if (stage !== 'wave') return;
    const held = new Set<string>();
    const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const push = () => { const v = keysVector(held); engine.current?.input.move(v.x, v.y); };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === 'escape' && !document.querySelector('.sheet-backdrop')) { e.preventDefault(); pause(); return; }
      if (sheetOpen()) return;
      if (MOVE.has(k)) { e.preventDefault(); if (!held.has(k)) { held.add(k); push(); } return; }
      if (k === 'q' || k === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        const c = cursor.current;
        engine.current?.skill(!practice && mirror.value.settings.aim === 'manual' && c ? { kind: 'screen', sx: c.x, sy: c.y } : { kind: 'auto' });
        return;
      }
      if (k === 'escape' || k === 'p' || k === 'c') { e.preventDefault(); pause(); }
    };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (held.delete(k)) push(); };
    const clear = () => { if (held.size) { held.clear(); push(); } };
    const mouse = (e: MouseEvent) => {
      const r = canvas.current?.getBoundingClientRect();
      if (r) cursor.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('mousemove', mouse);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mousemove', mouse);
      clear();
    };
  }, [stage]);

  // the canvas follows its box
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { engine.current?.resize(); backdrop(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** A setting changed in the pause sheet: the live ones reach the engine now (quality waits for the next entry). */
  const onSettings = () => {
    const s = engineSettings(practice);
    engine.current?.setSettings({ nums: s.nums, shake: s.shake, aim: s.aim, lang: s.lang, reduceMotion: s.reduceMotion });
  };

  const scr = stage === 'between' ? nextScreen(run) : null;
  const armorNow = useMemo(() => computeStats(run).armor, [run]);
  const midWave = stage === 'wave';
  /** The tutorial ends after its third wave: the end card stands where that shop would be. */
  const tutorEnd = practice && scr === 'shop' && run.wave >= 3;
  // the screen the coach and the tips follow
  const screenNow: RunScreen = stage === 'between' ? (tutorEnd ? 'tutorEnd' : (scr as RunScreen)) : stage;
  useEffect(() => { emit({ k: 'screen', s: screenNow }); }, [screenNow]);
  const liveHud = (): HudState | null => hud.current?.last() ?? null;
  // 倒影: from wave 31 the arena is painted inverted (engine/index.ts), so the HUD turns paper-light
  const inverted = (run.inWave ?? run.wave + 1) > 30;
  return (
    <div class={'mj-run' + (stage === 'between' ? ' is-between' : '') + (stage === 'wave' ? ' is-wave' : '') + (lowQ ? ' is-lowq' : '') + (inverted ? ' is-inverted' : '')} ref={wrap} tabIndex={-1} aria-label={t('幻镜', 'Mirror')}>
      <canvas class="mj-canvas" ref={canvas} aria-hidden="true" />
      {stage === 'wave' && (
        <>
          <Hud api={hud} onPause={pause} wave={run.wave + 1} skill={COMPANIONS[run.char].skill} showSleeve={run.coins > 0} armor={armorNow} char={run.char} onWho={pause} />
          <Controls engine={() => engine.current} left={settings.left} manualAim={!practice && settings.aim === 'manual'} skill={COMPANIONS[run.char].skill} skillLive={skillLive} enabled={holdN === 0 && !paused && !intro} />
        </>
      )}
      {stage === 'ritual' && props.ritual && <Ritual kind={props.ritual} reduced={reduced} onDone={() => { if (stageRef.current === 'ritual') setStage('bake'); }} />}
      {stage === 'bake' && <Bake progress={progress} />}
      {stage === 'between' && (
        <div class="mj-between">
          {scr === 'start' && <StartPick run={run} onRun={onRun} onPause={pause} />}
          {scr === 'cards' && <Cards run={run} onRun={onRun} onPause={pause} onWho={() => setWhoOpen(true)} />}
          {scr === 'crate' && <Crate run={run} unlocks={unlocks} onRun={onRun} onPause={pause} />}
          {scr === 'heart' && <HeartPick run={run} unlocks={unlocks} onRun={onRun} onPause={pause} />}
          {scr === 'ready' && <Ready run={run} onGo={() => void nextWave()} onPause={pause} baking={bg} />}
          {scr === 'shop' && !tutorEnd && <Shop run={run} unlocks={unlocks} onRun={onRun} onNext={() => void nextWave()} onLeave={practice ? pause : leave} baking={bg} onPause={pause} onWho={() => setWhoOpen(true)} />}
          {tutorEnd && <TutorEnd onEnter={() => { ended.current = true; P.current.onTutorEnd?.(true); }} onLobby={() => { ended.current = true; P.current.onTutorEnd?.(false); }} />}
        </div>
      )}
      {stage === 'dying' && (
        <div class="mj-shatter" role="status">
          <svg class="mj-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 48 L12 8 M50 48 L90 14 M50 48 L96 62 M50 48 L70 96 M50 48 L22 92 M50 48 L4 56 M30 28 L40 20 M72 30 L80 38 M76 72 L86 70 M24 70 L30 80" />
          </svg>
          <p class="brush">{t('镜碎', 'The glass breaks')}</p>
          {sank > 0 && <p class="mj-shatter-note">{t(`袖中铜钱 ${sank} 文，随镜沉池`, `The ${sank} coins in your sleeve sink with the glass`)}</p>}
        </div>
      )}
      {intro && <BossCard ev={intro} tip={bossTip} onDone={() => { setIntro(null); setBossTip(null); dropHold('intro'); }} />}
      <Coach brain={brain} inWave={stage === 'wave'} left={settings.left} hidden={paused || stage === 'ritual' || stage === 'bake' || stage === 'dying' || !!intro} onOk={coachOk} />
      <PauseSheet
        open={paused}
        run={run}
        midWave={midWave}
        onResume={resume}
        onLeave={leave}
        onAbandon={giveUp}
        onSettings={onSettings}
        confirm={confirm}
        setConfirm={setConfirm}
        live={paused && midWave ? liveHud() : null}
        practice={practice}
      />
      <WhoSheet open={whoOpen} run={run} onClose={() => setWhoOpen(false)} />
    </div>
  );
}
