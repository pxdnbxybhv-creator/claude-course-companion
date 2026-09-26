// 入画 · Into the Painting — walk inside your own garden in 3D.
// This component owns the page chrome and the HUD (DOM, styled like the rest of the app); the 3D
// world (three.js) is loaded lazily from ./world so it never weighs on the main bundle.
import { useEffect, useRef, useState } from 'preact/hooks';
import { go } from '../../app/router';
import { useT } from '../../app/i18n';
import { lang as langSig, setSettings, state as appState, today } from '../../app/store';
import { ERRAND_COINS, play } from '../../app/play';
import { ledgerToday } from '../quests/helpers';
import { CoinBadge, fmtCoins } from '../../ui/coins';
import { Sheet, Segmented } from '../../ui/kit';
import { toLunar, festivalsOn as coreFestivals } from '../../core/lunar';
import { FESTIVALS } from './features';
import { CharacterSelect } from './characters/Select';
import { REGION, type RegionId } from './map';
import { CHARACTER } from '../../data/characters';
import type { FestivalKey } from './types';
import type { Arrival, HudBridge, Prompt, SayOpts, WaypointInfo, WorldHandle } from './world';
import './walk.css';

type Phase = 'loading' | 'ready' | 'nowebgl' | 'error';
type TimeMode = 'now' | 'day' | 'night';
interface Card { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal?: string }
interface Toast { id: number; zh: string; en: string; action?: { zh: string; en: string; run: () => void } }
interface Dialog extends SayOpts { id: number; resolve: (i: number) => void }

const HINT_KEY = 'banmu.walk.hint.v2';
/** The 疾 switch is remembered for the session. */
const RUN_KEY = 'banmu.walk.run';
function readRun(): boolean {
  try { return sessionStorage.getItem(RUN_KEY) === '1'; } catch { return false; }
}
function writeRun(on: boolean): void {
  try { sessionStorage.setItem(RUN_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}
type SkillUi = { glyph: string; zh: string; en: string; cooldown: number; active?: boolean };
/** The lazily loaded world module, once it has been loaded. */
let worldModule: typeof import('./world') | null = null;
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function readHintSeen(): boolean {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}
function writeHintSeen(): void {
  try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
}

function queryFestival(): FestivalKey | null {
  try {
    const f = new URLSearchParams(location.search).get('fest');
    return f && FESTIVALS.some((x) => x.key === f) ? (f as FestivalKey) : null;
  } catch {
    return null;
  }
}

export function WalkView() {
  const t = useT();
  const lang = langSig.value;
  const quality = appState.value.settings.quality;
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldHandle | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [counters, setCounters] = useState<{ id: string; zh: string; en: string; value?: string }[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [festival, setFestival] = useState<FestivalKey | null>(queryFestival);
  const [time, setTime] = useState<TimeMode>('now');
  const [sheet, setSheet] = useState(false);
  const [purseOpen, setPurseOpen] = useState(false);
  const [hint, setHint] = useState(() => !readHintSeen());
  const [touch] = useState(coarse);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastSeq = useRef(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const [arrival, setArrival] = useState<(Arrival & { key: number }) | null>(null);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout>>();
  const [curtain, setCurtain] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [skillUi, setSkillUi] = useState<SkillUi | null>(null);
  const [runOn, setRunOn] = useState(readRun);
  const [shiftHeld, setShiftHeld] = useState(false);
  // coins arriving: the purse shows +N floating up
  const purse = play.value.coins;
  const lastPurse = useRef(purse);
  const [gains, setGains] = useState<{ id: number; n: number; lane: number }[]>([]);
  const gainSeq = useRef(0);
  /** Each +N goes away on its own clock (a second gain never cancels the first one's). */
  const gainTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const dialogSeq = useRef(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [charOpen, setCharOpen] = useState(false);
  const musicOn = appState.value.settings.music;
  const dialog = dialogs[0] ?? null;
  const answer = (i: number) => {
    setDialogs((ds) => {
      const [head, ...rest] = ds;
      if (head) head.resolve(i);
      return rest;
    });
  };

  const showToast = (tt: Omit<Toast, 'id'>, ms: number) => {
    clearTimeout(toastTimer.current);
    setToast({ ...tt, id: ++toastSeq.current });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  // --- build (and rebuild on festival / time / language change) the world
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let world: WorldHandle | null = null;
    setPhase('loading');
    setProgress(0);
    setPrompt(null);
    setCounters([]);
    setCard(null);
    const hud: HudBridge = {
      toast: (zh, en, ms = 2600) => showToast({ zh, en }, ms),
      toastAction: (zh, en, action) => showToast({ zh, en, action }, 5200),
      setCounter: (id, label, value) => setCounters((cs) => {
        const rest = cs.filter((c) => c.id !== id);
        return label ? [...rest, { id, zh: label.zh, en: label.en, value }].sort((a, b) => (a.id < b.id ? -1 : 1)) : rest;
      }),
      showCard: (c) => setCard(c),
      prompt: (p) => setPrompt(p),
      progress: (f) => setProgress(f),
      mount: (node) => {
        const layer = layerRef.current;
        if (!layer) return () => {};
        layer.appendChild(node);
        return () => node.remove();
      },
      say: (o) => new Promise<number>((resolve) => {
        if (cancelled) { resolve(-1); return; }
        setDialogs((ds) => [...ds, { ...o, id: ++dialogSeq.current, resolve }]);
      }),
      // the banner's own clock starts when it is actually on screen (after the travel curtain lifts)
      arrive: (a) => setArrival({ ...a, key: Date.now() }),
      curtain: (on) => setCurtain(on),
      frozen: (on) => setFrozen(on),
      skill: (o) => setSkillUi((cur) => {
        if (!o) return null;
        // cooldowns tick every frame: only re-render on a visible change
        const cd = Math.round(o.cooldown * 40) / 40;
        if (cur && cur.glyph === o.glyph && cur.cooldown === cd && !!cur.active === !!o.active && cur.zh === o.zh) return cur;
        return { ...o, cooldown: cd };
      }),
    };
    import('./world')
      .then((m) => (worldModule = m, m))
      .then((m) => m.createWorld({ host, lang, festival, time, quality, hud, cancelled: () => cancelled }).then(
        (w) => {
          if (cancelled) { w.dispose(); return; }
          world = w;
          worldRef.current = w;
          setPhase('ready');
        },
        (err: unknown) => {
          if (cancelled) return;
          if (err instanceof m.WebGLUnavailable) setPhase('nowebgl');
          else { console.error('[walk] could not build the world', err); setPhase('error'); }
        },
      ))
      .catch((err) => {
        if (cancelled) return;
        console.error('[walk] could not load the world', err);
        setPhase('error');
      });
    return () => {
      cancelled = true;
      worldRef.current = null;
      if (world) world.dispose();
      // a world going away answers whatever it was still asking
      setDialogs((ds) => { for (const d of ds) d.resolve(-1); return []; });
      setCurtain(false);
      setFrozen(false);
      setArrival(null);
    };
  }, [festival, time, lang, quality]);

  // an arrival banner shows once the curtain is up, and goes when its brushed-in animation is done
  const arrivalShown = !!arrival && !curtain;
  useEffect(() => {
    if (!arrivalShown) return;
    arrivalTimer.current = setTimeout(() => setArrival(null), 5200);
    return () => clearTimeout(arrivalTimer.current);
  }, [arrivalShown, arrival?.key]);

  // the dialogue box: Esc steps away, Enter / Space / E goes on, number keys choose
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      const n = dialog.choices?.length ?? 0;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); answer(-1); return; }
      if (!n && ['Enter', 'Space', 'KeyE', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); answer(0); return; }
      const d = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (d && +d[2] <= n) { e.preventDefault(); e.stopPropagation(); answer(+d[2] - 1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // the 疾 switch reaches the world (again after every rebuild) and is remembered for the session
  useEffect(() => {
    worldRef.current?.setRun(runOn);
    writeRun(runOn);
  }, [runOn, phase]);
  // Shift held: the run chip lights (it inverts the switch while held)
  useEffect(() => {
    if (touch) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(e.type === 'keydown'); };
    const off = () => setShiftHeld(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off); };
  }, [touch]);
  // coins arriving float up from the purse
  useEffect(() => {
    const d = purse - lastPurse.current;
    lastPurse.current = purse;
    if (d <= 0 || phase !== 'ready') return;
    const id = ++gainSeq.current;
    // gains close together take the next free lane (one under another), never the same spot
    setGains((g) => {
      const kept = g.slice(-2);
      let lane = 0;
      while (kept.some((x) => x.lane === lane)) lane++;
      return [...kept, { id, n: d, lane }];
    });
    const tm = setTimeout(() => {
      gainTimers.current.delete(tm);
      setGains((g) => g.filter((x) => x.id !== id));
    }, 1900);
    gainTimers.current.add(tm);
  }, [purse]);
  useEffect(() => () => {
    for (const tm of gainTimers.current) clearTimeout(tm);
    gainTimers.current.clear();
  }, []);

  // leaving the walk gives the painted plant bitmaps back (they are kept between rebuilds only)
  useEffect(() => () => {
    if (worldModule) worldModule.releasePlantBitmaps();
  }, []);

  // pause walking while a card, a dialogue, the map or a picker is open
  useEffect(() => {
    worldRef.current?.setPaused(!!card || sheet || purseOpen || mapOpen || charOpen || !!dialog);
  }, [card, sheet, purseOpen, phase, mapOpen, charOpen, dialog]);

  // held by a game, a boat or the homestead's building (not by a skill's own mount, 关公's 赤兔: the
  // skill button stays up then, and travel simply sets him down)
  const heldByOther = frozen && !skillUi;
  // M opens the map (not over a card, a dialogue, a sheet or the picker, nor while a game or the
  // homestead's building holds the walker: the map closes itself with M or Esc)
  useEffect(() => {
    if (phase !== 'ready' || card || dialog || sheet || purseOpen || charOpen || heldByOther || mapOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest?.('.sheet, [aria-modal="true"], [role="dialog"]'))) return;
      setMapOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, card, dialog, sheet, purseOpen, charOpen, heldByOther, mapOpen]);

  // close the card with Esc / Enter / E / Space
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'Enter', 'KeyE', 'Space', 'NumpadEnter'].includes(e.code) || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCard(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [card]);

  // the first-visit hint fades after a while, or once you start moving: a walking key, the joystick,
  // or dragging the view round
  const hintOff = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!hint || phase !== 'ready') return;
    const done = () => { hintOff.current = null; setHint(false); writeHintSeen(); };
    hintOff.current = done;
    const id = setTimeout(done, 12000);
    const onKey = (e: KeyboardEvent) => { if (/^(Key[WASDE]|Arrow)/.test(e.code)) done(); };
    const stage = hostRef.current;
    let from: [number, number] | null = null;
    const down = (e: PointerEvent) => { from = [e.clientX, e.clientY]; };
    const drag = (e: PointerEvent) => { if (from && Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 14) done(); };
    const up = () => { from = null; };
    window.addEventListener('keydown', onKey);
    stage?.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      clearTimeout(id);
      if (hintOff.current === done) hintOff.current = null;
      window.removeEventListener('keydown', onKey);
      stage?.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [hint, phase]);

  // the skills feature hides the button itself while a game or a boat holds the walker; on its own
  // mount (Red Hare) it stays, to get off again
  const showSkill = phase === 'ready' && !!skillUi && !card && !dialog && !mapOpen && !charOpen;
  // the map and the companions wait, as the M key does, while someone is speaking, a card is up or a
  // game or the homestead's building holds the walker (travelling would strand what is open)
  const busy = phase !== 'ready' || !!dialog || !!card || heldByOther;
  const lunar = toLunar(new Date());
  const todayFest = coreFestivals(new Date())[0];
  const preview = festival ? FESTIVALS.find((f) => f.key === festival) : null;
  const leave = (e: Event) => go('garden', e);
  const blurAfter = (e: Event) => (e.currentTarget as HTMLElement | null)?.blur?.();

  return (
    <section class={'walk' + (touch ? ' is-touch' : '')} aria-label={t('入画', 'Into the Painting')}>
      <div class="walk-stage" ref={hostRef} />

      {/* --- top bar */}
      <header class="walk-top">
        <div class="walk-left">
          <button type="button" class="walk-chip walk-leave" onClick={leave}>
            <span aria-hidden="true">‹</span> {t('出画', 'Leave')}
          </button>
          <button type="button" class="walk-chip walk-purse" disabled={busy} onClick={(e) => { blurAfter(e); setPurseOpen(true); }} aria-haspopup="dialog" title={t('钱囊', 'Purse')}>
            <span role="status" aria-live="polite"><CoinBadge size={17} /></span>
            {gains.map((g) => <span key={g.id} class="walk-purse-gain num" style={{ '--lane': String(g.lane) }} aria-hidden="true">+{fmtCoins(g.n)}</span>)}
          </button>
        </div>
        <div class="walk-title">
          <span class={lang === 'zh' ? 'brush' : 'latin'}>{t('入画', 'Into the Painting')}</span>
          <small>
            {lang === 'zh' ? `${lunar.monthName}${lunar.dayName}` : `Lunar ${lunar.month}/${lunar.day}`}
            {todayFest ? ` · ${t(todayFest.zh, todayFest.en)}` : ''}
          </small>
        </div>
        <div class="walk-tools">
          <button type="button" class="walk-chip walk-tool" disabled={busy} onClick={(e) => { blurAfter(e); setCharOpen(true); }} aria-haspopup="dialog" aria-label={t('同伴', 'Companions')} title={t('同伴', 'Companions')}>
            <span class="brush" aria-hidden="true">{CHARACTER[play.value.character].zh.slice(0, 1)}</span>
            <span class="walk-tool-label">{t('同伴', 'Companions')}</span>
          </button>
          <button type="button" class="walk-chip walk-tool walk-travel" disabled={busy} onClick={(e) => { blurAfter(e); setMapOpen(true); }} aria-haspopup="dialog" aria-label={t('舆图 · 传送', 'Map · travel')} title={t('舆图 · 传送 (M)', 'Map · travel (M)')}>
            <span class="brush" aria-hidden="true">驿</span>
            <span class="walk-tool-label">{t('传送', 'Travel')}</span>
          </button>
          <button
            type="button"
            class={'walk-chip walk-tool walk-music' + (musicOn ? ' is-on' : '')}
            aria-pressed={musicOn}
            aria-label={musicOn ? t('关闭音乐', 'Music off') : t('打开音乐', 'Music on')}
            title={t('音乐', 'Music')}
            onClick={(e) => { blurAfter(e); setSettings({ music: !musicOn }); }}
          >
            <span class="brush" aria-hidden="true">乐</span>
          </button>
          <button type="button" class="walk-chip walk-fest" onClick={(e) => { blurAfter(e); setSheet(true); }} aria-haspopup="dialog" aria-label={t('节日', 'Festivals')}>
            <span class="walk-fest-glyph brush" aria-hidden="true">节</span>
            <span class="walk-fest-label">{t('节日', 'Festivals')}</span>
          </button>
        </div>
      </header>

      {preview && (
        <div class="walk-banner" role="status">
          <span>{t(`预览 · ${preview.zh}`, `Preview · ${preview.en}`)}</span>
          <button type="button" onClick={() => setFestival(null)} aria-label={t('回到今日', 'Back to today')}>✕</button>
        </div>
      )}

      {counters.length > 0 && (
        <ul class="walk-counters" aria-live="polite">
          {counters.map((c) => (
            <li key={c.id}><span>{t(c.zh, c.en)}</span>{c.value !== undefined && <b>{c.value}</b>}</li>
          ))}
        </ul>
      )}

      {toast && (
        <div class="walk-toast" key={toast.id} role="status">
          <span>{t(toast.zh, toast.en)}</span>
          {toast.action && (
            <button type="button" onClick={() => { toast.action!.run(); setToast(null); }}>{t(toast.action.zh, toast.action.en)}</button>
          )}
        </div>
      )}

      {/* --- what you can do here */}
      {phase === 'ready' && prompt && !card && !dialog && (
        <div class="walk-prompt" aria-live="polite">
          <span class="walk-prompt-label">{t(prompt.labelZh, prompt.labelEn)}</span>
          {!touch && (
            <button type="button" class="walk-prompt-act" onClick={(e) => { blurAfter(e); worldRef.current?.act(); }}>
              <kbd>E</kbd> {t(prompt.actionZh, prompt.actionEn)}
            </button>
          )}
        </div>
      )}

      {phase === 'ready' && touch && <Joystick world={worldRef} onStart={() => hintOff.current?.()} />}
      {phase === 'ready' && touch && (
        <div class="walk-buttons">
          <button
            type="button"
            class={'walk-run' + (runOn ? ' is-on' : '')}
            aria-pressed={runOn}
            aria-label={runOn ? t('疾行：开', 'Run: on') : t('疾行：关', 'Run: off')}
            onPointerDown={(e) => { e.preventDefault(); setRunOn((v) => !v); }}
          >
            <span class="brush" aria-hidden="true">疾</span>
          </button>
          {showSkill && <SkillButton ui={skillUi!} touch onUse={() => worldRef.current?.skill()} />}
          <button type="button" class="walk-jump" aria-label={t('跳', 'Jump')} onPointerDown={(e) => { e.preventDefault(); worldRef.current?.jump(); }}>
            <span class="brush" aria-hidden="true">跃</span>
          </button>
          <button
            type="button"
            class={'walk-act' + (prompt || frozen ? ' is-on' : '')}
            disabled={!prompt && !frozen}
            onClick={() => worldRef.current?.act()}
            aria-label={prompt ? t(prompt.actionZh, prompt.actionEn) : t('互动', 'Interact')}
          >
            <span class={lang === 'zh' ? 'brush' : 'latin'}>{prompt ? t(prompt.actionZh, prompt.actionEn) : '·'}</span>
          </button>
        </div>
      )}
      {phase === 'ready' && !touch && (
        <div class="walk-deck">
          <button
            type="button"
            class={'walk-chip walk-run-chip' + (runOn !== shiftHeld ? ' is-on' : '')}
            aria-pressed={runOn}
            title={t('疾行：常跑（按住 Shift 反转）', 'Run: always run (hold Shift to invert)')}
            onClick={(e) => { blurAfter(e); setRunOn((v) => !v); }}
          >
            <span class="brush" aria-hidden="true">疾</span>
            <span>{runOn ? t('常跑', 'Running') : t('行走', 'Walking')}</span>
            <kbd>Shift</kbd>
          </button>
          {showSkill && <SkillButton ui={skillUi!} touch={false} onUse={() => worldRef.current?.skill()} />}
        </div>
      )}

      {phase === 'ready' && hint && (
        <button type="button" class="walk-hint" onClick={() => { setHint(false); writeHintSeen(); }}>
          {touch ? (
            <span>
              {t('摇杆行走，推到尽头或点「疾」奔跑', 'Joystick to walk; push to the edge or tap 疾 to run')}
              {/* the skill button shows the companion's own glyph (题, 剑, 符…), never the word 技 */}
              <br />{t(`「跃」跳上石栏屋檐 · 金圈「${skillUi?.glyph ?? CHARACTER[play.value.character].skill.glyph}」是同伴绝技`, `跃 jumps onto rails and eaves · the gold-ringed ${skillUi?.glyph ?? CHARACTER[play.value.character].skill.glyph} is your companion’s skill`)}
              <br />{t('点亮驿碑后，可从「驿」舆图传送', 'Light a waypoint stele, then travel from the 驿 map')}
            </span>
          ) : (
            <span>
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {t('行走', 'walk')} · <kbd>Shift</kbd> {t('奔跑', 'run')} · <kbd>{t('空格', 'Space')}</kbd> {t('跳上高处', 'jump up')} · <kbd>Q</kbd> {t('绝技', 'skill')} · <kbd>E</kbd> {t('互动', 'interact')}
              <br /><kbd>M</kbd> {t('舆图：点亮驿碑后可直接传送', 'map: travel to any waypoint stele you have lit')} · {t('拖动环顾 · 滚轮远近', 'drag to look · scroll to zoom')}
            </span>
          )}
          <small>{t('知道了', 'Got it')}</small>
        </button>
      )}

      {/* --- mini-game overlays go in here */}
      <div class="walk-layer" ref={layerRef} />

      {/* --- arriving somewhere: the place's name brushed across the sky */}
      {arrival && arrivalShown && (
        <div class="walk-arrive" key={arrival.key} role="status" aria-live="polite">
          <span class="walk-arrive-name brush">{arrival.zh}</span>
          <span class="walk-arrive-en latin">{arrival.en}</span>
          <span class="walk-arrive-blurb">{t(arrival.blurbZh, arrival.blurbEn)}</span>
          {arrival.first && <span class="walk-arrive-seal brush" aria-hidden="true">初至</span>}
        </div>
      )}

      {/* --- somebody speaks */}
      {dialog && (
        <div class="walk-say-wrap">
          <div class="walk-say" role="dialog" aria-modal="false" aria-label={t(dialog.nameZh, dialog.nameEn)} key={dialog.id}>
            <div class="walk-say-name"><span class={lang === 'zh' ? 'brush' : 'latin'}>{t(dialog.nameZh, dialog.nameEn)}</span></div>
            <p class="walk-say-text">{t(dialog.zh, dialog.en)}</p>
            {dialog.choices && dialog.choices.length > 0 ? (
              <div class="walk-say-choices">
                {dialog.choices.map((c, i) => (
                  <button type="button" key={i} class="walk-say-choice" onClick={() => answer(i)} autoFocus={i === 0}>
                    {!touch && <kbd>{i + 1}</kbd>} {t(c.zh, c.en)}
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" class="walk-say-next" onClick={() => answer(0)} autoFocus aria-label={t('继续', 'Continue')}>▸</button>
            )}
            <button type="button" class="walk-say-close" onClick={() => answer(-1)} aria-label={t('离开', 'Leave')}>✕</button>
          </div>
        </div>
      )}

      <div class={'walk-curtain' + (curtain ? ' is-on' : '')} aria-hidden="true" />

      {mapOpen && worldModule && worldRef.current && (
        <WorldMap
          world={worldRef.current}
          mod={worldModule}
          onClose={() => setMapOpen(false)}
          onTravel={(id) => {
            setMapOpen(false);
            // nobody is left talking to thin air: whatever was still being asked is answered first
            setDialogs((ds) => { for (const d of ds) d.resolve(-1); return []; });
            void worldRef.current?.travel(id);
          }}
        />
      )}
      <CharacterSelect open={charOpen} onClose={() => setCharOpen(false)} />
      <PurseSheet open={purseOpen} onClose={() => setPurseOpen(false)} />

      {/* --- a small hanging scroll */}
      {card && (
        <div class="walk-card-wrap" onClick={(e) => e.target === e.currentTarget && setCard(null)}>
          <div class="walk-card" role="dialog" aria-modal="true" aria-label={t(card.titleZh, card.titleEn)}>
            <div class="walk-card-rod" aria-hidden="true" />
            <h2 class={lang === 'zh' ? 'brush' : 'latin'}>{t(card.titleZh, card.titleEn)}</h2>
            <p class="walk-card-body">{t(card.bodyZh, card.bodyEn)}</p>
            {card.seal && <span class="walk-seal brush" aria-hidden="true">{card.seal}</span>}
            <button type="button" class="btn walk-card-close" onClick={() => setCard(null)} autoFocus>{t('收起', 'Close')}</button>
            <div class="walk-card-rod is-bottom" aria-hidden="true" />
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div class="walk-loading" role="status">
          <div class="walk-inkstone" aria-hidden="true"><i /></div>
          <p class={lang === 'zh' ? 'brush' : 'latin'}>{t('研墨中…', 'Grinding ink…')}</p>
          <div class="walk-progress" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} /></div>
        </div>
      )}
      {(phase === 'nowebgl' || phase === 'error') && (
        <div class="walk-loading walk-fail" role="alert">
          <p class="brush">{t('画卷未能展开', 'The painting could not unroll')}</p>
          <p class="muted">
            {phase === 'nowebgl'
              ? t('这台设备或浏览器不支持 WebGL，无法走进立体的园子。园中的花木仍在，回去看看吧。', 'This device or browser has no WebGL, so the 3D garden cannot open. Your plants are still growing in the garden.')
              : t('展开时出了点差错。请稍后再试。', 'Something went wrong while unrolling it. Please try again later.')}
          </p>
          <button type="button" class="btn btn-primary" onClick={leave}>{t('回到园中', 'Back to the garden')}</button>
        </div>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('节日彩蛋', 'Festival surprises')} label={t('节日', 'Festivals')}>
        <p class="muted walk-sheet-lead">{t('逢年过节，园中另有惊喜。在这里可以提前看看每一个。', 'On festival days the garden holds a surprise. Peek at any of them here.')}</p>
        <div class="walk-sheet-row">
          <span class="walk-sheet-label">{t('时辰', 'Time')}</span>
          <Segmented<TimeMode>
            value={time}
            onChange={setTime}
            label={t('时辰', 'Time')}
            options={[{ value: 'now', label: t('此刻', 'Now') }, { value: 'day', label: t('昼', 'Day') }, { value: 'night', label: t('夜', 'Night') }]}
          />
        </div>
        <div class="walk-fest-grid">
          <button type="button" class={'walk-fest-item' + (!festival ? ' is-on' : '')} aria-pressed={!festival} onClick={() => { setFestival(null); setSheet(false); }}>
            <span class="brush">{t('今日', 'Today')}</span>
            <small>{todayFest ? t(todayFest.zh, todayFest.en) : t('寻常日子', 'An ordinary day')}</small>
          </button>
          {FESTIVALS.map((f) => (
            <button type="button" key={f.key} class={'walk-fest-item' + (festival === f.key ? ' is-on' : '')} aria-pressed={festival === f.key} onClick={() => { setFestival(f.key); setSheet(false); }}>
              <span class="brush">{t(f.zh, f.en)}</span>
              <small>{t('预览', 'Preview')}</small>
            </button>
          ))}
        </div>
        {FESTIVALS.length === 0 && <p class="muted">{t('节日彩蛋还在路上。', 'The festival surprises are still on their way.')}</p>}
      </Sheet>
    </section>
  );
}

/**
 * 舆图 — the painted map: where you are, the places you have been, and the waypoint steles (驿碑).
 * Tap a lit stele (or its place) to travel there; an unlit one says 「尚未到访」.
 */
function WorldMap(props: { world: WorldHandle; mod: typeof import('./world'); onClose(): void; onTravel(id: RegionId): void }) {
  const t = useT();
  const lang = langSig.value;
  const ref = useRef<HTMLCanvasElement>(null);
  const [pick, setPick] = useState<RegionId | null>(null);
  const flags = play.value.flags;
  const visited = new Set<RegionId>((Object.keys(REGION) as RegionId[]).filter((id) => flags[`visit:${id}`]));
  const here = props.world.where();
  const wps: WaypointInfo[] = props.world.waypoints();
  const litN = wps.filter((w) => w.lit).length;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const css = c.clientWidth || 360;
    const S = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
    if (c.width !== S) { c.width = S; c.height = S; }
    const draw = () => props.mod.paintAtlas(c, { visited, player: props.world.where(), lang, waypoints: wps, picked: pick, ui: S / css });
    draw();
    // fonts may arrive a moment later
    document.fonts?.ready.then(draw).catch(() => {});
  }, [lang, pick]);
  /** Standing at that very stele (in its place and within a few steps): nowhere to travel. */
  const isHere = (id: RegionId | null) => {
    const w = id ? wps.find((x) => x.id === id) : null;
    return !!w && id === here.region && Math.hypot(here.x - w.x, here.z - w.z) < 12;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); props.onClose(); return; }
      // Enter travels to the picked, lit stele (just as the 传送 button would)
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && pick && wps.find((w) => w.id === pick)?.lit && !isHere(pick)) {
        e.preventDefault(); e.stopPropagation(); props.onTravel(pick);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pick]);
  const onTap = (e: MouseEvent) => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const id = props.mod.atlasHit(c.width, ((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, wps, c.width / Math.max(1, r.width));
    setPick(id);
  };
  const sel = pick ? REGION[pick] : null;
  const wp = pick ? wps.find((w) => w.id === pick) ?? null : null;
  const lit = !!wp?.lit;
  const known = pick ? visited.has(pick) : false;
  const hereNow = isHere(pick);
  return (
    <div class="walk-map-wrap" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="walk-map" role="dialog" aria-modal="true" aria-label={t('舆图', 'Map of the world')}>
        <header class="walk-map-head">
          <h2 class={lang === 'zh' ? 'brush' : 'latin'}>{t('舆图', 'Map')}</h2>
          <small>{t(`驿站已通 ${litN} / ${wps.length}`, `${litN} of ${wps.length} waypoints lit`)}{here.region ? ' · ' + t(`此处：${REGION[here.region].zh}`, `Here: ${REGION[here.region].en}`) : ''}</small>
          <button type="button" class="walk-map-close" onClick={props.onClose} aria-label={t('收起', 'Close')}>✕</button>
        </header>
        <canvas ref={ref} class="walk-map-canvas" onClick={onTap} role="img" aria-label={t('一幅水墨舆图：驿碑标在各处', 'An ink map of the world, with its waypoint steles')} />
        <ul class="walk-map-list" aria-label={t('驿站', 'Waypoints')}>
          {wps.map((w) => (
            <li key={w.id}>
              <button type="button" class={'walk-map-wp' + (w.lit ? ' is-lit' : '') + (pick === w.id ? ' is-picked' : '')} onClick={() => setPick(w.id)} aria-pressed={pick === w.id}>
                <i aria-hidden="true" />{t(REGION[w.id].zh, REGION[w.id].en)}
              </button>
            </li>
          ))}
        </ul>
        <div class="walk-map-foot" aria-live="polite">
          {sel ? (
            <>
              <div class={'walk-map-place' + (lit ? '' : ' is-dim')}>
                <b class={lang === 'zh' ? 'brush' : 'latin'}>{lit || known ? t(sel.zh, sel.en) : t(`${sel.zh}？`, `${sel.en}?`)}{wp ? <small>{t(` · ${wp.zh}驿碑`, ` · ${wp.en} stele`)}</small> : null}</b>
                <span>{lit ? t(sel.blurbZh, sel.blurbEn) : t('尚未到访 · 循着小路走到那里的驿碑前，点亮它的灯。', 'Not yet visited · follow the paths to its stele and light the lantern.')}</span>
              </div>
              {lit && !hereNow && (
                <button type="button" class="btn btn-primary walk-map-go" onClick={() => props.onTravel(sel.id)} autoFocus>
                  <span class="brush" aria-hidden="true">驿</span> {t('传送', 'Travel')}
                </button>
              )}
              {lit && hereNow && <span class="walk-map-here">{t('就在此处', 'You are here')}</span>}
            </>
          ) : (
            <span class="muted">{t('点选已点亮的驿碑（有灯火的），即可传送前往。', 'Tap a lit waypoint stele (the ones with a lantern glow) to travel there.')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 钱囊 — the purse chip opens this: what is in it, what came in today and from where, where coins come
 * from in one line, and the way to the quest book (its 钱囊 and 奇遇录 in full).
 */
function PurseSheet(props: { open: boolean; onClose(): void }) {
  const t = useT();
  if (!props.open) return null;
  const { rows, total } = ledgerToday(play.value, today.value);
  return (
    <Sheet open onClose={props.onClose} title={t('钱囊', 'Purse')} label={t('钱囊', 'Purse')}>
      <div class="walk-purse-sheet">
        <p class="walk-purse-n"><CoinBadge size={22} /><span>{t('文', 'coins')}</span></p>
        <p class={'walk-purse-today' + (total > 0 ? ' is-up' : '')}>
          {total > 0 ? t(`今日进账 +${fmtCoins(total)} 文`, `Today +${fmtCoins(total)}`) : t('今日尚无进账', 'Nothing in yet today')}
        </p>
        {rows.length > 0 && (
          <ul class="walk-purse-rows" aria-label={t('今日进账', "Today's takings")}>
            {rows.map((r) => <li key={r.key}><span>{t(r.zh, r.en)}</span><b class="num">+{fmtCoins(r.coins)}</b></li>)}
          </ul>
        )}
        <p class="walk-purse-how">
          <b>{t('钱从何来', 'Where coins come from')}</b>
          {t(`日课每件 ${ERRAND_COINS} 文，任务、奇遇各有赏钱；游艺、打卡、燃香，屋檐高处拾遗，乡邻打赏，家园收成，都能进账。`,
            `Errands (${ERRAND_COINS} each), quests and chance encounters pay; so do games, check-ins and incense, finds up on the roofs, the neighbours' tips and the homestead's harvest.`)}
        </p>
        <p class="walk-purse-how">
          <b>{t('钱往何处', 'What coins are for')}</b>
          {t('家园起屋、种树、养宠，水乡摊上买些小玩意。', 'The homestead (houses, trees, pets) and the water-town stalls.')}
        </p>
        <button type="button" class="btn walk-purse-book" onClick={(e) => { props.onClose(); go('quests', e); }}>
          {t('任务簿 · 钱囊与奇遇录', 'Quest book · purse and encounters')}<span aria-hidden="true"> ›</span>
        </button>
      </div>
    </Sheet>
  );
}

/** 技 — the companion's skill: its glyph, a cooldown sweeping back, a glow while it lasts, its name on hover / long-press. */
function SkillButton(props: { ui: SkillUi; touch: boolean; onUse(): void }) {
  const t = useT();
  const u = props.ui;
  const [tip, setTip] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout>>();
  const hide = useRef<ReturnType<typeof setTimeout>>();
  const seen = useRef('');
  // a new skill (another companion) introduces itself for a moment
  useEffect(() => {
    const k = u.glyph + u.zh;
    if (seen.current === k) return;
    seen.current = k;
    setTip(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setTip(false), 2600);
  }, [u.glyph, u.zh]);
  useEffect(() => () => { clearTimeout(hold.current); clearTimeout(hide.current); }, []);
  const release = () => {
    clearTimeout(hold.current);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setTip(false), 900);
  };
  const cooling = u.cooldown > 0.001;
  return (
    <div class={'walk-skill-wrap' + (props.touch ? ' is-touch' : '')}>
      <button
        type="button"
        class={'walk-skill' + (u.active ? ' is-active' : '') + (cooling ? ' is-cooling' : ' is-ready')}
        style={{ '--cd': String(u.cooldown) }}
        aria-label={t(`绝技：${u.zh}`, `Skill: ${u.en}`) + (cooling ? t('（冷却中）', ' (recharging)') : '')}
        onPointerDown={(e) => {
          e.preventDefault();
          props.onUse();
          clearTimeout(hold.current);
          hold.current = setTimeout(() => { clearTimeout(hide.current); setTip(true); }, 420);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onClick={(e) => { if ((e as MouseEvent).detail === 0) props.onUse(); (e.currentTarget as HTMLElement).blur(); }}
        onMouseEnter={() => { if (!props.touch) { clearTimeout(hide.current); setTip(true); } }}
        onMouseLeave={() => { if (!props.touch) setTip(false); }}
      >
        <span class="brush walk-skill-glyph" aria-hidden="true">{u.glyph}</span>
        {!props.touch && <kbd aria-hidden="true">Q</kbd>}
      </button>
      {tip && <span class="walk-skill-tip" role="tooltip"><b class="brush">{u.glyph}</b>{t(u.zh, u.en)}</span>}
    </div>
  );
}

/** A virtual joystick: an ink ring and a knob; push to the edge to run. */
function Joystick(props: { world: { current: WorldHandle | null }; onStart?(): void }) {
  const t = useT();
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const active = useRef<number | null>(null);
  const R = 46;
  const set = (x: number, y: number) => {
    const w = props.world.current;
    const m = Math.hypot(x, y);
    const k = m > R ? R / m : 1;
    x *= k; y *= k;
    setKnob([x, y]);
    if (w) {
      w.input.stickX = x / R;
      w.input.stickY = -y / R;
      w.input.stickRun = m > R * 1.05;
    }
  };
  const move = (e: PointerEvent) => {
    if (active.current !== e.pointerId || !baseRef.current) return;
    const r = baseRef.current.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  const end = (e: PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    set(0, 0);
  };
  useEffect(() => () => {
    const w = props.world.current;
    if (w) { w.input.stickX = 0; w.input.stickY = 0; w.input.stickRun = false; }
  }, []);
  return (
    <div
      class="walk-stick"
      ref={baseRef}
      role="application"
      aria-label={t('摇杆：拖动行走', 'Joystick: drag to walk')}
      onPointerDown={(e) => {
        e.preventDefault();
        active.current = e.pointerId;
        props.onStart?.();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}
export default WalkView;
