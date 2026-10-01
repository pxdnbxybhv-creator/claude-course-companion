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
import { bakeScale, createPainter, viewOf } from '../paint';
import { arenaGeom, computeStats, nextScreen, openShop, unlocksOf } from '../logic';
import { realSession, type RunSession } from '../logic/session';
import { COMPANIONS } from '../data';
import type {
  BakeStage, BossEvent, CodexKey, DeathResult, DownInfo, Engine, EngineHooks, EngineSettings, HudState, MirrorAudio, MirrorSettings, Painter, Quality,
  RunReport, RunSave, WaveResult, WaveSetup,
} from '../types';
import type { HudRect } from '../engine/threats';
import { loadEngine } from './engineHost';
import { Controls, cursorDir, FpsMeter, Hud, skillInput, type HudApi } from './Hud';
import { appleTouch, FpsTip, fpsOf, heldTip, PauseSheet, type FrameNow } from './Pause';
import { setMirrorSettings } from '../logic/session';
import type { FrameStats } from '../engine';
import { Bake, Ritual } from './Ritual';
import { BossCard, Cards, Crate, HeartPick, Ready, ReviveDialog, StartPick } from './Screens';
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
import type { SandSession } from './sand/session';
import type { SandUi } from './sand/ui';
import type { MirrorEngine } from '../engine';

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
/** The run's sprite resolution (px per u) for this screen and the saved 视野: the camera's scale here ×
 *  a little headroom (paint/index.ts bakeScale). A desktop window may grow after the bake, so it bakes
 *  for the largest camera scale (a window ≥ 600 px on its short side). */
export function spriteScale(quality: Quality, el?: Element | null): number {
  const dpr = Math.min(dprCapOf(quality), (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  let w = 0, h = 0;
  try { const r = el?.getBoundingClientRect(); w = r?.width ?? 0; h = r?.height ?? 0; } catch { /* no layout */ }
  if (!w || !h) { w = typeof window !== 'undefined' ? window.innerWidth : 390; h = typeof window !== 'undefined' ? window.innerHeight : 844; }
  let coarse = true;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* assume a phone */ }
  if (!coarse) { w = Math.max(w, 600); h = Math.max(h, 600); }
  return bakeScale(w, h, dpr, quality, viewOf(mirror.value.settings.view));
}
/** The engine's settings; the tutorial always auto-aims (its lines speak of auto-aim; the setting is kept). */
function engineSettings(practice = false): EngineSettings {
  const s = mirror.value.settings;
  const quality = qualityOf(s.quality);
  const reduceMotion = prefersReduced();
  return {
    quality, dprCap: dprCapOf(quality), reduceMotion, nums: s.nums, shake: s.shake && !reduceMotion, aim: practice ? 'auto' : s.aim, lang: lang.value === 'en' ? 'en' : 'zh',
    view: viewOf(s.view), fps: fpsOf(s),
  };
}
/** The engine's frame numbers (MirrorEngine: not in the Engine contract; a stub engine has none). */
type FrameEngine = Engine & { displayHz?: number; frameStats?: Readonly<FrameStats> };
/** A sheet, a coach hold or the revive dialog is up: the run's own keys wait (Space during a hold never casts the skill). */
const sheetOpen = () => !!document.querySelector('.sheet-backdrop, .mj-coach.is-hold, .mj-revive');
/** The HUD blocks the off-screen chevrons keep clear of (engine/threats.ts via MirrorEngine.setHudRects). */
const HUD_BLOCKS = ['.mj-hud-tl', '.mj-hud-tc', '.mj-hud-tr', '.mj-skill'] as const;
/** Each HUD block's box in css px from the canvas's top-left (the ones laid out and visible). */
export function hudRectsOf(root: ParentNode, canvasBox: { left: number; top: number }): HudRect[] {
  const out: HudRect[] = [];
  for (const sel of HUD_BLOCKS) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    out.push({ x: Math.round(r.left - canvasBox.left), y: Math.round(r.top - canvasBox.top), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
}

type Hold = 'pause' | 'intro' | 'coach' | 'dock' | 'sheet';
/** m8 模拟场: no coach and no first-time tips (TipsBrain would write meta.tutor.tips). */
const QUIET_BRAIN: CoachBrain = { bubble: null, whisper: null, foeHp: null, event: () => false, ok: () => {}, tick: () => {}, subscribe: () => () => {} };

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
  /** m8 模拟场: the sandbox's dock and death card (loaded with its chunk by MirrorView); with a sandbox session. */
  sand?: SandUi;
}) {
  const t = useT();
  const S = props.sess ?? realSession;
  const practice = !!props.practice && S.practice;
  // m8 模拟场: the sandbox session (in memory; no records, prefs or tips; its own death card, no revive)
  const sand = !!S.sandbox && !!props.sand;
  const SS = sand ? (S as unknown as SandSession) : null;
  const [sandDead, setSandDead] = useState(false);
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
  /** 破镜重圆: down with the revive on offer (the engine's phase 'down'), and whether the dialog shows yet
   *  (after the 1 s fall, at once under reduced motion). While down: no pause, no stick, no 技. */
  const [down, setDownState] = useState<{ wave: number; price: number } | null>(null);
  const downRef = useRef<{ wave: number; price: number } | null>(null);
  const [downAsk, setDownAsk] = useState(false);
  const askTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The iPhone / iPad frame-rate tip (m7 F) is due (Safari's 60 fps flag, or Low Power Mode's 30): shown
   *  on the next between-wave screen only, and stored as seen the moment it shows (知道了 closes it early). */
  const [fpsTipDue, setFpsTipDue] = useState<'p60' | 'p30' | null>(null);
  const fpsTipShown = useRef(false);
  /** The fight's music (wave or boss), for coming back after a revive. */
  const fightMusic = useRef<'wave' | 'boss'>('wave');
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
  const brain = useMemo<CoachBrain>(() => (sand ? QUIET_BRAIN : practice
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
    // the whole diff: H2 finishes on the bought id (the 青锋剑 wherever a reroll put it), not on a slot number
    if (act) emit({ k: 'act', ...act });
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
    if (!practice && !sand) { rememberPlayed(todayKey(), r.seed); rememberPanelBase(r); }
    waveDrawn.current = true;
    try {
      eng.start(r, setup);
      SS?.started();
      // the tutorial's wave script, or the real run's read-only first-time-tip watcher
      if (practice) attachScript(eng, tutorScript(setup.wave), cue);
      else if (!sand && tipDue(mirror.value, 'elite')) attachTipWatch(eng, (k) => { cue(k); });
    } catch (e) {
      onError(e, true);
      return;
    }
    fightMusic.current = setup.plan.boss ? 'boss' : 'wave';
    P.current.audio.music(fightMusic.current, r.map);
    wrap.current?.focus({ preventScroll: true });
  };

  // ── engine hooks (a stable object: everything it touches is a ref)
  const onWaveEnd = (res: WaveResult) => {
    const before = runRef.current.coins;
    const next = S.waveWon(res);
    if (!next || ended.current) return;
    // 镜宝 earned this wave: their codex pages are seen (见)
    if (res.relics?.length) S.markSeen(res.relics.map((id) => `item:${id}` as CodexKey));
    if (!practice && !sand) rememberPlayed(todayKey(), next.seed);
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
      // the 模拟场: its death card (重打此重 · 回场前 · 看记录) instead of results
      if (sand) { setSandDead(true); return; }
      ended.current = true;
      if (report) P.current.onEnd({ report, snap: image });
      else P.current.onLeave();
    }, reduced ? 300 : 1500);
  };
  const onError = (e: unknown, fatal: boolean) => {
    console.error('[mirror] engine', e);
    if (!fatal || ended.current) return;
    engine.current?.pause();
    if (sand) {
      ended.current = true;
      toast(t('镜裂了（模拟场），回场前。', 'The mirror cracked (sandbox). Back to setup.'), 4000);
      P.current.onLeave();
      return;
    }
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
  // ── 破镜重圆: the first death of a real run goes down; the dialog answers (API.md §3)
  const endDown = () => {
    clearTimeout(askTimer.current);
    downRef.current = null;
    setDownState(null);
    setDownAsk(false);
  };
  const onDowned = (d: DownInfo) => {
    const eng = engine.current;
    if (ended.current || !S.payRevive || practice) { eng?.giveUp(); return; }
    S.wentDown?.(d.wave); // a reload or 暂离 from here settles as a death
    downRef.current = { wave: d.wave, price: d.price };
    setDownState(downRef.current);
    setDownAsk(false);
    P.current.audio.music('results', runRef.current.map); // the band drops out under the shatter
    clearTimeout(askTimer.current);
    askTimer.current = setTimeout(() => { if (downRef.current) setDownAsk(true); }, prefersReduced() ? 0 : 900);
  };
  /** 花 50 文复活: charge (session: spend → record → purse written → run saved), then rise. */
  const onRevive = () => {
    const eng = engine.current;
    if (!downRef.current || !eng || !S.payRevive || ended.current) return;
    const res = S.payRevive();
    if (res === 'short') return; // the purse changed under the dialog: it shows the shortfall now
    endDown();
    if (res !== 'ok') { eng.giveUp(); return; } // already used (or no run in a wave): the death stands
    if (!eng.revive()) {
      // charged but the engine could not rise (disposed or failed meanwhile): the coins go back
      S.reviveFailed?.();
      eng.giveUp();
      if (!ended.current && eng.phase !== 'dead') onError(new Error('mirror: the revive failed'), true);
      return;
    }
    setRun({ ...runRef.current, revived: true });
    // no toast here: the centre title 破镜重圆 says you rose, the dialog said it was the run's one revive,
    // and a toast at the top would sit over the HP bar, the wave and the pause button just when you need them
    P.current.audio.music(fightMusic.current, runRef.current.map);
    wrap.current?.focus({ preventScroll: true });
  };
  /** 不了 / 结束这一局: the normal death (hooks.death → session.died → results). */
  const onDeclineRevive = () => {
    if (!downRef.current) return;
    endDown();
    engine.current?.giveUp();
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
    // the tutorial (and a session without the purse) never offers the revive: its death is at once
    ...(!practice && S.payRevive ? { downed: (d: DownInfo) => onDowned(d) } : {}),
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
      // the 模拟场 may start at any wave: the next boss and (from 30) the 倒影 rosters are baked up front too
      const ids = sand ? [...new Set([...p.plan(r, 'start'), ...p.plan(r, 'boss'), ...(r.wave >= 30 ? p.plan(r, 'endless') : [])])] : p.plan(r, 'start');
      try {
        await p.bake(ids, (d, n) => { if (!dead) setProgress(n ? (d / n) * 0.92 : 0.92); });
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
        toast(t('镜没能打开（没联网？），这一局还在，等会儿再来接着打。', 'The mirror could not open (offline?): the run waits; come back later.'), 4000);
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
      SS?.attach(engine.current as unknown as MirrorEngine);
      backdrop();
      setSkillLive(mod.stub || !!mod.content.skills[COMPANIONS[r.char].skill]);
      between(runRef.current);
      // the 模拟场's 「先到 · 直接开打」: the first wave starts at once (the shop and cards wait for the next one)
      if (SS && SS.setup.arrive === 'fight' && !SS.before()) void nextWave();
    })();
    return () => { dead = true; };
  }, [stage === 'bake']);

  // ── unmount: stop everything and save
  useEffect(() => () => {
    clearTimeout(askTimer.current);
    SS?.attach(null);
    try { engine.current?.dispose(); } catch { /* already */ }
    engine.current = null;
    try { painter.current?.dispose(); } catch { /* already */ }
    painter.current = null;
    if (!sand) saveMetaNow(); // (the 模拟场 never writes the store)
  }, []);

  // ── pause / resume
  const pause = () => {
    const s = stageRef.current;
    // down: the revive dialog is the only question (a blur or a letter waits behind it)
    if ((s !== 'wave' && s !== 'between') || pausedRef.current || downRef.current) return;
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
    if (practice || sand) {
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
  useEffect(() => openSheets.subscribe((n) => {
    // 模拟场: its own sheets (导入, 复制) hold the wave quietly; the pause sheet would sit on top of them and come back after 继续
    if (sand) {
      if (n > 0 && stageRef.current === 'wave') { if (!holds.current.has('sheet')) addHold('sheet'); }
      else if (n === 0 && holds.current.has('sheet')) dropHold('sheet');
      return;
    }
    if (n > 0 && stageRef.current === 'wave' && !pausedRef.current) pause();
  }), []);

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

  // keys mid-wave: WASD / arrows, Q / Space, Esc / P; m8 (hidden.md §2.5): Q / Space up releases a hidden
  // companion's verb (后羿's draw), Esc while held cancels it, and the right mouse button is the same verb as Q
  // aimed at the cursor (any companion; the canvas's context menu is off)
  useEffect(() => {
    if (stage !== 'wave') return;
    const held = new Set<string>();
    const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const push = () => { const v = keysVector(held); engine.current?.input.move(v.x, v.y); };
    /** The key or button holding a hidden companion's verb ('q', ' ', 'mouse'), or null. */
    let verb: string | null = null;
    const verbOf = () => skillInput(COMPANIONS[runRef.current.char].skill);
    /** Where a release aims: the cursor (手瞄, or the right button), else auto (zero). */
    const aimAt = (toCursor: boolean) => {
      const c = cursor.current;
      return (toCursor && c ? cursorDir(engine.current, c.x, c.y) : null) ?? { x: 0, y: 0 };
    };
    const manual = () => !practice && mirror.value.settings.aim === 'manual';
    const release = (dir: { x: number; y: number } | null, at: number) => { if (verb) { verb = null; engine.current?.skillRelease?.(dir, at); } };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === 'escape' && verb) { e.preventDefault(); release(null, e.timeStamp / 1000); return; }
      if (k === 'escape' && !document.querySelector('.sheet-backdrop')) { e.preventDefault(); pause(); return; }
      if (sheetOpen()) return;
      if (MOVE.has(k)) { e.preventDefault(); if (!held.has(k)) { held.add(k); push(); } return; }
      if (k === 'q' || k === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        const c = cursor.current;
        if (verbOf() !== 'tap') { if (!verb) { verb = k; engine.current?.skillPress?.(e.timeStamp / 1000); } return; }
        engine.current?.skill(manual() && c ? { kind: 'screen', sx: c.x, sy: c.y } : { kind: 'auto' });
        return;
      }
      if (k === 'escape' || k === 'p' || k === 'c') { e.preventDefault(); pause(); }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (verb === k) release(aimAt(manual()), e.timeStamp / 1000);
      if (held.delete(k)) push();
    };
    const clear = () => { if (held.size) { held.clear(); push(); } release(null, performance.now() / 1000); };
    const mouse = (e: MouseEvent) => {
      const r = canvas.current?.getBoundingClientRect();
      if (r) cursor.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onCanvas = (e: MouseEvent) => {
      const r = canvas.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
      return !(e.target as HTMLElement | null)?.closest?.('button, a, input, .sheet-backdrop, .mj-hud-tl, .mj-hud-tr');
    };
    const mdown = (e: MouseEvent) => {
      if (e.button !== 2 || !onCanvas(e) || sheetOpen()) return;
      e.preventDefault();
      mouse(e);
      const c = cursor.current;
      if (verbOf() !== 'tap') { if (!verb) { verb = 'mouse'; engine.current?.skillPress?.(e.timeStamp / 1000); } return; }
      if (c) engine.current?.skill({ kind: 'screen', sx: c.x, sy: c.y });
    };
    const mup = (e: MouseEvent) => {
      if (e.button !== 2 || verb !== 'mouse') return;
      // released off the canvas: cancelled
      release(onCanvas(e) ? aimAt(true) : null, e.timeStamp / 1000);
    };
    const menu = (e: MouseEvent) => { if (onCanvas(e)) e.preventDefault(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('mousemove', mouse);
    window.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    window.addEventListener('contextmenu', menu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mousemove', mouse);
      window.removeEventListener('mousedown', mdown);
      window.removeEventListener('mouseup', mup);
      window.removeEventListener('contextmenu', menu);
      clear();
    };
  }, [stage]);

  // the canvas follows its box
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { engine.current?.resize(); backdrop(); sendHudRects(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Where the HUD sits, for the off-screen chevrons (they stay clear of it; a threat under it counts as
   *  unseen). Sent when the wave's HUD mounts, on a resize, and whenever a HUD block changes size (the
   *  boss's scroll, the 镜奁 row, the marks). */
  const sendHudRects = () => {
    const eng = engine.current as (Engine & { setHudRects?: (r: readonly HudRect[] | null) => void }) | null;
    const c = canvas.current, w = wrap.current;
    if (!eng || typeof eng.setHudRects !== 'function' || !c || !w || stageRef.current !== 'wave') return;
    const cr = c.getBoundingClientRect();
    if (!(cr.width > 0 && cr.height > 0)) return;
    eng.setHudRects(hudRectsOf(w, cr));
  };
  useEffect(() => {
    if (stage !== 'wave') return;
    const w = wrap.current;
    sendHudRects();
    if (!w || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sendHudRects());
    for (const sel of HUD_BLOCKS) { const el = w.querySelector(sel); if (el) ro.observe(el); }
    return () => ro.disconnect();
  }, [stage, settings.left]);

  /** A setting changed in the pause sheet: the live ones reach the engine now (quality waits for the next
   *  entry; 视野 applies at once, the sprites re-baking behind the sheet). */
  const onSettings = () => {
    const s = engineSettings(practice);
    engine.current?.setSettings({ nums: s.nums, shake: s.shake, aim: s.aim, lang: s.lang, reduceMotion: s.reduceMotion, view: s.view, fps: s.fps });
    requestAnimationFrame(() => sendHudRects());
  };

  /** The engine's last second of frames and the display's rate (the pause sheet's 帧率 row). */
  const frameNow = (): FrameNow | null => {
    const e = engine.current as FrameEngine | null;
    const f = e?.frameStats;
    return e && f && f.fps > 0 ? { fps: f.fps, hz: e.displayHz ?? NaN } : null;
  };
  // an iPhone / iPad held to 60 by Safari while 帧率 asks for 120 or more, or to 30 by Low Power Mode: the
  // tip, once (a check every 2 s of a wave until the engine has a second of frames and knows the display)
  useEffect(() => {
    if (stage !== 'wave' || practice || fpsTipDue || mirror.value.settings.fpsTip || !appleTouch()) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const e = engine.current as FrameEngine | null;
      const hz = e?.displayHz ?? NaN;
      if (!(e?.frameStats && e.frameStats.fps > 0) || !(hz > 0)) return;
      clearInterval(id);
      const kind = heldTip(hz, fpsOf(mirror.value.settings), true);
      if (kind) setFpsTipDue(kind);
    }, 2000);
    return () => clearInterval(id);
  }, [stage]);
  // one between-wave screen: seen once it shows (never again, this run or later), gone with the next wave
  useEffect(() => {
    if (!fpsTipDue) { fpsTipShown.current = false; return; }
    if (stage === 'between') {
      if (!fpsTipShown.current) { fpsTipShown.current = true; setMirrorSettings({ fpsTip: true }); }
    } else if (fpsTipShown.current) setFpsTipDue(null);
  }, [stage, fpsTipDue]);
  const closeFpsTip = () => { setFpsTipDue(null); setMirrorSettings({ fpsTip: true }); };

  // ── m8 模拟场: 重打此重 / 重开此重 (the wave again from the run before it), back between waves, the dock's hold
  const sandStart = (x: { run: RunSave; setup: WaveSetup } | null) => {
    const eng = engine.current;
    if (!x || !eng || !SS) return;
    setSandDead(false);
    setRun(x.run);
    setStage('wave');
    setPaused(false);
    holds.current.clear();
    setHoldN(0);
    pauseAfterEnd.current = false;
    waveDrawn.current = true;
    try {
      eng.start(x.run, x.setup);
      SS.started();
    } catch (e) {
      onError(e, true);
      return;
    }
    fightMusic.current = x.setup.plan.boss ? 'boss' : 'wave';
    P.current.audio.music(fightMusic.current, x.run.map);
    wrap.current?.focus({ preventScroll: true });
  };
  const sandReplay = () => sandStart(SS?.replay() ?? null);
  const sandBetween = (r: RunSave) => {
    engine.current?.pause();
    holds.current.clear();
    setHoldN(0);
    setSandDead(false);
    S.commit(r);
    between(r);
  };
  const sandHold = (on: boolean) => {
    if (on) { if (stageRef.current === 'wave') addHold('dock'); } else if (holds.current.has('dock')) dropHold('dock');
  };
  const sandBack = () => { ended.current = true; P.current.onLeave(); };

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
    <div class={'mj-run' + (stage === 'between' ? ' is-between' : '') + (stage === 'wave' ? ' is-wave' : '') + (lowQ ? ' is-lowq' : '') + (inverted ? ' is-inverted' : '') + (down ? ' is-down' : '') + (fpsOf(settings) === 30 ? ' is-saver' : '')} ref={wrap} tabIndex={-1} aria-label={t('幻镜', 'Mirror')}>
      <canvas class="mj-canvas" ref={canvas} aria-hidden="true" />
      {stage === 'wave' && (
        <>
          <Hud api={hud} onPause={pause} wave={run.wave + 1} skill={COMPANIONS[run.char].skill} showSleeve={run.coins > 0} armor={armorNow} char={run.char} onWho={pause} />
          <Controls engine={() => engine.current} left={settings.left} manualAim={!practice && settings.aim === 'manual'} skill={COMPANIONS[run.char].skill} skillLive={skillLive} enabled={holdN === 0 && !paused && !intro && !down} />
          {settings.showFps === true && <FpsMeter engine={() => engine.current} />}
        </>
      )}
      {stage === 'ritual' && props.ritual && <Ritual kind={props.ritual} reduced={reduced} onDone={() => { if (stageRef.current === 'ritual') setStage('bake'); }} />}
      {stage === 'bake' && <Bake progress={progress} />}
      {stage === 'between' && (
        <div class="mj-between">
          {fpsTipDue && <FpsTip kind={fpsTipDue} onClose={closeFpsTip} />}
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
      {SS && props.sand && (stage === 'wave' || stage === 'between') && !sandDead && (
        <props.sand.Dock sess={SS} engine={() => engine.current as unknown as MirrorEngine | null} run={run} midWave={stage === 'wave'} onRun={onRun} onRestart={sandReplay} onBetween={sandBetween} onHold={sandHold} />
      )}
      {SS && props.sand && sandDead && <props.sand.Death sess={SS} onReplay={sandReplay} onBack={sandBack} />}
      {down && downAsk && stage === 'wave' && <ReviveDialog price={down.price} purse={coins.value} onRevive={onRevive} onEnd={onDeclineRevive} />}
      {intro && <BossCard ev={intro} tip={bossTip} onDone={() => { setIntro(null); setBossTip(null); dropHold('intro'); }} />}
      <Coach brain={brain} inWave={stage === 'wave'} left={settings.left} hidden={paused || stage === 'ritual' || stage === 'bake' || stage === 'dying' || !!intro || !!down} onOk={coachOk} />
      {SS && props.sand && <props.sand.Pause open={paused} run={run} midWave={midWave} live={paused && midWave ? liveHud() : null} onResume={resume} onBack={leave} />}
      <PauseSheet
        open={paused && !SS}
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
        frame={paused ? frameNow() : null}
      />
      <WhoSheet open={whoOpen} run={run} onClose={() => setWhoOpen(false)} />
    </div>
  );
}
