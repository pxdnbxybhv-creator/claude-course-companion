// 入画 · Into the Painting — walk inside your own garden in 3D.
// This component owns the page chrome and the HUD (DOM, styled like the rest of the app); the 3D
// world (three.js) is loaded lazily from ./world so it never weighs on the main bundle.
import { useEffect, useRef, useState } from 'preact/hooks';
import { go } from '../../app/router';
import { useT } from '../../app/i18n';
import { lang as langSig, setSettings, state as appState } from '../../app/store';
import { play } from '../../app/play';
import { Sheet, Segmented } from '../../ui/kit';
import { toLunar, festivalsOn as coreFestivals } from '../../core/lunar';
import { FESTIVALS } from './features';
import { CharacterSelect } from './characters/Select';
import { REGION, type RegionId } from './map';
import { CHARACTER } from '../../data/characters';
import type { FestivalKey } from './types';
import type { Arrival, HudBridge, Prompt, SayOpts, WorldHandle } from './world';
import './walk.css';

type Phase = 'loading' | 'ready' | 'nowebgl' | 'error';
type TimeMode = 'now' | 'day' | 'night';
interface Card { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal?: string }
interface Toast { id: number; zh: string; en: string; action?: { zh: string; en: string; run: () => void } }
interface Dialog extends SayOpts { id: number; resolve: (i: number) => void }

const HINT_KEY = 'banmu.walk.hint';
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
  const [hint, setHint] = useState(() => !readHintSeen());
  const [touch] = useState(coarse);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastSeq = useRef(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const [arrival, setArrival] = useState<(Arrival & { key: number }) | null>(null);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout>>();
  const [curtain, setCurtain] = useState(false);
  const [frozen, setFrozen] = useState(false);
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
      arrive: (a) => {
        clearTimeout(arrivalTimer.current);
        setArrival({ ...a, key: Date.now() });
        arrivalTimer.current = setTimeout(() => setArrival(null), 5200);
      },
      curtain: (on) => setCurtain(on),
      frozen: (on) => setFrozen(on),
    };
    import('./world')
      .then((m) => (worldModule = m, m))
      .then((m) => m.createWorld({ host, lang, festival, time, hud, cancelled: () => cancelled }).then(
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
  }, [festival, time, lang]);

  useEffect(() => () => clearTimeout(arrivalTimer.current), []);

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

  // leaving the walk gives the painted plant bitmaps back (they are kept between rebuilds only)
  useEffect(() => () => {
    if (worldModule) worldModule.releasePlantBitmaps();
  }, []);

  // pause walking while a card, a dialogue, the map or a picker is open
  useEffect(() => {
    worldRef.current?.setPaused(!!card || sheet || mapOpen || charOpen || !!dialog);
  }, [card, sheet, phase, mapOpen, charOpen, dialog]);

  // M opens the map
  useEffect(() => {
    if (phase !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !card && !dialog) setMapOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, card, dialog]);

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

  // the first-visit hint fades after a while, or on the first key press
  useEffect(() => {
    if (!hint || phase !== 'ready') return;
    const done = () => { setHint(false); writeHintSeen(); };
    const id = setTimeout(done, 12000);
    const onKey = (e: KeyboardEvent) => { if (/^(Key[WASDE]|Arrow)/.test(e.code)) done(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [hint, phase]);

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
        <button type="button" class="walk-chip walk-leave" onClick={leave}>
          <span aria-hidden="true">‹</span> {t('出画', 'Leave')}
        </button>
        <div class="walk-title">
          <span class={lang === 'zh' ? 'brush' : 'latin'}>{t('入画', 'Into the Painting')}</span>
          <small>
            {lang === 'zh' ? `${lunar.monthName}${lunar.dayName}` : `Lunar ${lunar.month}/${lunar.day}`}
            {todayFest ? ` · ${t(todayFest.zh, todayFest.en)}` : ''}
          </small>
        </div>
        <div class="walk-tools">
          <button type="button" class="walk-chip walk-tool" onClick={(e) => { blurAfter(e); setCharOpen(true); }} aria-haspopup="dialog" aria-label={t('角色', 'Characters')} title={t('角色', 'Characters')}>
            <span class="brush" aria-hidden="true">{CHARACTER[play.value.character].zh.slice(0, 1)}</span>
            <span class="walk-tool-label">{t('角色', 'Who')}</span>
          </button>
          <button type="button" class="walk-chip walk-tool" disabled={phase !== 'ready'} onClick={(e) => { blurAfter(e); setMapOpen(true); }} aria-haspopup="dialog" aria-label={t('舆图', 'Map')} title={t('舆图 (M)', 'Map (M)')}>
            <span class="brush" aria-hidden="true">图</span>
            <span class="walk-tool-label">{t('舆图', 'Map')}</span>
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

      {phase === 'ready' && touch && <Joystick world={worldRef} />}
      {phase === 'ready' && touch && (
        <div class="walk-buttons">
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

      {phase === 'ready' && hint && (
        <button type="button" class="walk-hint" onClick={() => { setHint(false); writeHintSeen(); }}>
          {touch ? (
            <span>{t('左下摇杆行走 · 推到尽头快跑', 'Joystick bottom-left to walk · push to the edge to run')}<br />{t('拖动画面环顾 · 双指缩放 · 右下互动', 'Drag to look around · pinch to zoom · act bottom-right')}</span>
          ) : (
            <span>
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {t('行走', 'walk')} · <kbd>Shift</kbd> {t('快跑', 'run')} · <kbd>{t('空格', 'Space')}</kbd> {t('跳', 'jump')} · <kbd>E</kbd> {t('互动', 'interact')}
              <br />{t('拖动环顾 · 滚轮远近', 'Drag to look around · scroll to zoom')}
            </span>
          )}
          <small>{t('知道了', 'Got it')}</small>
        </button>
      )}

      {/* --- mini-game overlays go in here */}
      <div class="walk-layer" ref={layerRef} />

      {/* --- arriving somewhere: the place's name brushed across the sky */}
      {arrival && !curtain && (
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
          onTravel={(id) => { setMapOpen(false); void worldRef.current?.travel(id); }}
        />
      )}
      <CharacterSelect open={charOpen} onClose={() => setCharOpen(false)} />

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

/** 舆图 — the painted map: where you are, where you have been; tap a place you know to travel there. */
function WorldMap(props: { world: WorldHandle; mod: typeof import('./world'); onClose(): void; onTravel(id: RegionId): void }) {
  const t = useT();
  const lang = langSig.value;
  const ref = useRef<HTMLCanvasElement>(null);
  const [pick, setPick] = useState<RegionId | null>(null);
  const flags = play.value.flags;
  const visited = new Set<RegionId>((Object.keys(REGION) as RegionId[]).filter((id) => flags[`visit:${id}`]));
  const here = props.world.where();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const css = c.clientWidth || 360;
    const S = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
    if (c.width !== S) { c.width = S; c.height = S; }
    const draw = () => props.mod.paintAtlas(c, { visited, player: props.world.where(), lang });
    draw();
    // fonts may arrive a moment later
    document.fonts?.ready.then(draw).catch(() => {});
  }, [lang]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape' || e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); props.onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const onTap = (e: MouseEvent) => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const id = props.mod.atlasHit(c.width, ((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
    setPick(id);
  };
  const sel = pick ? REGION[pick] : null;
  const known = pick ? visited.has(pick) : false;
  return (
    <div class="walk-map-wrap" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="walk-map" role="dialog" aria-modal="true" aria-label={t('舆图', 'Map of the world')}>
        <header class="walk-map-head">
          <h2 class={lang === 'zh' ? 'brush' : 'latin'}>{t('舆图', 'Map')}</h2>
          <small>{t(`已至 ${visited.size} / 6 处`, `${visited.size} of 6 places visited`)}{here.region ? ' · ' + t(`此处：${REGION[here.region].zh}`, `Here: ${REGION[here.region].en}`) : ''}</small>
          <button type="button" class="walk-map-close" onClick={props.onClose} aria-label={t('收起', 'Close')}>✕</button>
        </header>
        <canvas ref={ref} class="walk-map-canvas" onClick={onTap} role="img" aria-label={t('一幅水墨舆图', 'An ink map of the world')} />
        <div class="walk-map-foot" aria-live="polite">
          {sel ? (
            <>
              <div class="walk-map-place">
                <b class={lang === 'zh' ? 'brush' : 'latin'}>{known ? t(sel.zh, sel.en) : t(`${sel.zh}？`, `${sel.en}?`)}</b>
                <span>{known ? t(sel.blurbZh, sel.blurbEn) : t('尚未到过。循着小路去看看吧。', 'Not yet visited — follow the paths to find it.')}</span>
              </div>
              {known && sel.id !== here.region && (
                <button type="button" class="btn btn-primary walk-map-go" onClick={() => props.onTravel(sel.id)} autoFocus>{t('驿站 · 前往', 'Travel there')}</button>
              )}
            </>
          ) : (
            <span class="muted">{t('点选到过的地方，可乘驿马前往。', 'Tap a place you have visited to travel there.')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A virtual joystick: an ink ring and a knob; push to the edge to run. */
function Joystick(props: { world: { current: WorldHandle | null } }) {
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
