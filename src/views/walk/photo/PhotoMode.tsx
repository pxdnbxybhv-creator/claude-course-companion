// 拍照 · the photo mode's HUD. Everything else steps out of the way: a free camera (the stick or
// WASD to move, 升 / 降 or Space / C to rise and sink, drag to look, pinch / wheel / the 焦 slider to
// zoom), a strip of choices — 滤镜 filters previewed live, 画框 frames, 时辰 the hour and a stopped
// clock, 人物 the walker shown or not and posed — the rule-of-thirds grid, and the shutter. A
// picture is developed (filter, mount, seal, inscription), kept in the album (the last twelve) and
// offered to 保存 / 分享; 再拍 goes on shooting.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang as langSig, state as appState } from '../../../app/store';
import { record } from '../../../app/play';
import { hostSave } from '../../../app/hostSave';
import { audio } from '../../../audio/engine';
import type { WorldHandle } from '../world';
import type { PhotoTime } from '../world/photo';
import { cssFilter, PHOTO_FILTERS, PHOTO_FRAMES, VIGNETTE, type PhotoFilter, type PhotoFrame } from '../world/photoFx';
import { FOV_MAX, FOV_MIN, PHOTO_POSES, type PhotoPose } from '../world/photoMath';
import { addPhoto, albumLasts, listPhotos, removePhoto, ALBUM_KEEP, type AlbumPhoto } from './album';
import './photo.css';

type Tab = 'filter' | 'frame' | 'time' | 'walker';
interface Prefs { filter: PhotoFilter; frame: PhotoFrame; grid: boolean; inscribe: boolean; tab: Tab | null }
interface Developed { url: string; blob: Blob; name: string; w: number; h: number; kept: boolean }

const PREF_KEY = 'banmu.walk.photo';
function readPrefs(): Prefs {
  const base: Prefs = { filter: 'none', frame: 'none', grid: false, inscribe: true, tab: 'filter' };
  try {
    const p = JSON.parse(sessionStorage.getItem(PREF_KEY) ?? 'null') as Partial<Prefs> | null;
    if (!p) return base;
    return {
      filter: PHOTO_FILTERS.includes(p.filter as PhotoFilter) ? (p.filter as PhotoFilter) : base.filter,
      frame: PHOTO_FRAMES.includes(p.frame as PhotoFrame) ? (p.frame as PhotoFrame) : base.frame,
      grid: !!p.grid,
      inscribe: p.inscribe !== false,
      tab: p.tab === null || ['filter', 'frame', 'time', 'walker'].includes(p.tab as string) ? (p.tab as Tab | null) : base.tab,
    };
  } catch {
    return base;
  }
}
function writePrefs(p: Prefs): void {
  try { sessionStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

const FILTER_NAME: Record<PhotoFilter, [string, string]> = { none: ['原色', 'Natural'], ink: ['水墨', 'Ink wash'], warm: ['暖', 'Warm'], cool: ['冷', 'Cool'], paper: ['旧纸', 'Old paper'] };
const FRAME_NAME: Record<PhotoFrame, [string, string]> = { none: ['无', 'None'], scroll: ['画轴', 'Scroll'], album: ['册页', 'Album leaf'] };
const TIME_NAME: Record<PhotoTime, [string, string]> = { now: ['此刻', 'Now'], day: ['昼', 'Day'], dusk: ['暮', 'Dusk'], night: ['夜', 'Night'] };
const POSE_NAME: Record<PhotoPose, [string, string]> = { wave: ['挥手', 'Wave'], bow: ['作揖', 'Bow'], dance: ['起舞', 'Dance'], skill: ['绝技', 'Skill'], sit: ['小坐', 'Sit'], sleep: ['打盹', 'Doze'], talk: ['谈笑', 'Chat'] };

const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const embedded = () => { try { return window.self !== window.top; } catch { return true; } };
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** A 35 mm-equivalent focal length for a vertical field of view (the frame's height: 24 mm, or 36 mm when upright). */
function focal(fov: number): number {
  const upright = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  return Math.round((upright ? 18 : 12) / Math.tan((fov * Math.PI) / 360));
}

function canShareFile(blob: Blob, name: string): boolean {
  try {
    const f = new File([blob], name, { type: blob.type });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

function download(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export interface PhotoModeProps {
  world: WorldHandle;
  touch: boolean;
  /** The element the canvas sits in (the live filter is a CSS filter on it). */
  stage: HTMLElement | null;
  /** The joystick (touch), to move the camera. */
  stick: ComponentChildren;
  onClose(): void;
  /** A card of its own is open (the result, the album): the keys belong to it. */
  onModal(open: boolean): void;
  toast(zh: string, en: string): void;
}

export function PhotoMode(props: PhotoModeProps) {
  const t = useT();
  const lang = langSig.value;
  const api = props.world.photo;
  const [prefs] = useState(readPrefs);
  const [tab, setTab] = useState<Tab | null>(prefs.tab);
  const [filter, setFilter] = useState<PhotoFilter>(prefs.filter);
  const [frame, setFrame] = useState<PhotoFrame>(prefs.frame);
  const [grid, setGrid] = useState(prefs.grid);
  const [inscribe, setInscribe] = useState(prefs.inscribe);
  const [time, setTime] = useState<PhotoTime>('now');
  const [still, setStill] = useState(false);
  const [walker, setWalker] = useState(true);
  const [pose, setPose] = useState<PhotoPose | null>(null);
  const [fov, setFov] = useState(() => api.fov());
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Developed | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [lasts, setLasts] = useState(true);
  const busyRef = useRef(false);
  const touch = props.touch;

  useEffect(() => writePrefs({ filter, frame, grid, inscribe, tab }), [filter, frame, grid, inscribe, tab]);
  useEffect(() => { void albumLasts().then(setLasts); }, []);

  // the live look: a CSS filter on the stage (the saved picture gets the same colour matrices)
  useEffect(() => {
    const s = props.stage;
    if (!s) return;
    const f = cssFilter(filter);
    s.style.filter = f === 'none' ? '' : f;
    return () => { s.style.filter = ''; };
  }, [filter, props.stage]);

  useEffect(() => {
    api.onFov((f) => setFov(f));
    return () => api.onFov(null);
  }, [api]);
  useEffect(() => { api.setTime(time); }, [time]);
  useEffect(() => { api.pauseTime(still); }, [still]);
  useEffect(() => { api.setWalker(walker); }, [walker]);
  useEffect(() => { props.onModal(!!result || albumOpen); }, [result, albumOpen]);
  useEffect(() => () => props.onModal(false), []);
  // the developed picture's object URL goes when the card does
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const shoot = async () => {
    if (busyRef.current || result || albumOpen) return;
    const shot = api.capture();
    if (!shot) { props.toast('这一张没有拍成，再试一次', 'That one did not come out — try again'); return; }
    busyRef.current = true;
    setBusy(true);
    setFlash((n) => n + 1);
    try { audio.knock(); } catch { /* no sound */ }
    try {
      const { compose } = await import('./compose');
      const seal = (appState.value.settings.sealName || '').trim() || '半亩';
      const out = await compose(shot.canvas, { filter, frame, inscribe, lang, seal, place: shot.place, at: shot.at, touch: coarse() });
      shot.canvas.width = shot.canvas.height = 1;
      const kept = await addPhoto({ at: shot.at.getTime(), name: out.name, w: out.w, h: out.h, blob: out.blob, thumb: out.thumb });
      record('photo');
      setResult({ url: URL.createObjectURL(out.blob), blob: out.blob, name: out.name, w: out.w, h: out.h, kept });
    } catch (e) {
      console.error('[walk] photo', e);
      props.toast('冲洗时出了点差错，再拍一张吧', 'Something went wrong developing it — take another');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // keys: Enter shoots, G the grid, Esc / P close what is open (the card, the album) or leave
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (albumOpen || result) return; // their own handlers close them
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.repeat || albumOpen || result) return;
      if (e.code === 'KeyG') { e.preventDefault(); setGrid((g) => !g); return; }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !(tg && (tg.tagName === 'BUTTON' || tg.closest?.('button')))) {
        e.preventDefault();
        void shoot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choosePose = (p: PhotoPose | null) => {
    setPose(p);
    api.pose(p);
  };

  const vig = VIGNETTE[filter] ?? 0;
  const tabs: [Tab, string, string][] = [['filter', '滤镜', 'Filter'], ['frame', '画框', 'Frame'], ['time', '时辰', 'Time'], ['walker', '人物', 'Walker']];

  return (
    <div
      class={'ph' + (touch ? ' is-touch' : '')}
      role="region"
      aria-label={t('拍照', 'Photo mode')}
      // a chip clicked with the mouse lets go of the focus, so Space rises and Enter shoots again
      onClick={(e) => { const b = (e.target as HTMLElement).closest?.('button'); if (b && (e as MouseEvent).detail > 0 && !b.closest('.ph-card-wrap')) b.blur(); }}
    >
      {vig > 0 && <div class="ph-vignette" style={{ opacity: String(vig / 0.26) }} aria-hidden="true" />}
      {grid && (
        <div class="ph-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      )}
      {flash > 0 && <div class={'ph-flash' + (reducedMotion() ? ' is-soft' : '')} key={flash} aria-hidden="true" />}

      {/* --- top: leave, the title, the grid, the album */}
      <header class="ph-top">
        <button type="button" class="ph-chip ph-leave" onClick={props.onClose} aria-label={t('退出拍照', 'Leave photo mode')} title={t('退出拍照 (Esc)', 'Leave photo mode (Esc)')}>
          <span aria-hidden="true">✕</span><span class="ph-chip-label">{t('收起相机', 'Done')}</span>
        </button>
        <div class="ph-title" aria-hidden="true">
          <span class={lang === 'zh' ? 'brush' : 'latin'}>{t('取景', 'Framing')}</span>
          <small>{touch ? t('拖动环顾 · 双指变焦', 'Drag to look · pinch to zoom') : t('拖动环顾 · 滚轮变焦', 'Drag to look · scroll to zoom')}</small>
        </div>
        <div class="ph-top-right">
          <button type="button" class={'ph-chip ph-icon' + (grid ? ' is-on' : '')} aria-pressed={grid} onClick={() => setGrid((g) => !g)} aria-label={t('三分构图线', 'Rule-of-thirds grid')} title={t('三分构图线 (G)', 'Rule-of-thirds grid (G)')}>
            <GridIcon />
          </button>
          <button type="button" class="ph-chip ph-album-btn" onClick={() => setAlbumOpen(true)} aria-haspopup="dialog" aria-label={t('相册', 'Album')} title={t('相册', 'Album')}>
            <span class="brush" aria-hidden="true">册</span><span class="ph-chip-label">{t('相册', 'Album')}</span>
          </button>
        </div>
      </header>

      {/* --- zoom */}
      <Zoom fov={fov} onChange={(f) => api.setFov(f)} />

      {/* --- the choices */}
      <div class="ph-panel">
        {tab && (
          <div class="ph-chips" role="group" aria-label={t(tabs.find((x) => x[0] === tab)![1], tabs.find((x) => x[0] === tab)![2])}>
            {tab === 'filter' && PHOTO_FILTERS.map((f) => (
              <button type="button" key={f} class={'ph-opt ph-filter' + (filter === f ? ' is-on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                <i class="ph-swatch" style={{ filter: cssFilter(f) === 'none' ? undefined : cssFilter(f) }} aria-hidden="true" />
                <span>{t(FILTER_NAME[f][0], FILTER_NAME[f][1])}</span>
              </button>
            ))}
            {tab === 'frame' && (
              <>
                {PHOTO_FRAMES.map((f) => (
                  <button type="button" key={f} class={'ph-opt ph-frame' + (frame === f ? ' is-on' : '')} aria-pressed={frame === f} onClick={() => setFrame(f)}>
                    <i class={'ph-frame-glyph is-' + f} aria-hidden="true" />
                    <span>{t(FRAME_NAME[f][0], FRAME_NAME[f][1])}</span>
                  </button>
                ))}
                <span class="ph-sep" aria-hidden="true" />
                <button type="button" class={'ph-opt ph-toggle' + (inscribe ? ' is-on' : '')} aria-pressed={inscribe} onClick={() => setInscribe((v) => !v)} title={t('落款：地点、日期与印章', 'Sign it: place, date and seal')}>
                  <i class="ph-seal-dot" aria-hidden="true" />
                  <span>{t('落款', 'Sign')}</span>
                </button>
              </>
            )}
            {tab === 'time' && (
              <>
                {(['now', 'day', 'dusk', 'night'] as PhotoTime[]).map((h) => (
                  <button type="button" key={h} class={'ph-opt' + (time === h ? ' is-on' : '')} aria-pressed={time === h} disabled={!api.canSetTime && (h === 'day' || h === 'dusk')} onClick={() => setTime(h)}>
                    <span>{t(TIME_NAME[h][0], TIME_NAME[h][1])}</span>
                  </button>
                ))}
                <span class="ph-sep" aria-hidden="true" />
                <button type="button" class={'ph-opt ph-toggle' + (still ? ' is-on' : '')} aria-pressed={still} onClick={() => setStill((v) => !v)} title={t('定格：水、风、行人都停下', 'Hold time: water, wind and passers-by stand still')}>
                  <span aria-hidden="true">{still ? '▶' : '❙❙'}</span>
                  <span>{still ? t('时光已停', 'Time held') : t('定格时光', 'Hold time')}</span>
                </button>
              </>
            )}
            {tab === 'walker' && (
              <>
                <button type="button" class={'ph-opt ph-toggle' + (walker ? ' is-on' : '')} aria-pressed={walker} onClick={() => setWalker((v) => !v)}>
                  <span>{walker ? t('入镜', 'In frame') : t('隐去', 'Hidden')}</span>
                </button>
                <span class="ph-sep" aria-hidden="true" />
                <button type="button" class={'ph-opt' + (pose === null ? ' is-on' : '')} aria-pressed={pose === null} disabled={!walker} onClick={() => choosePose(null)}>
                  <span>{t('自然', 'At ease')}</span>
                </button>
                {PHOTO_POSES.map((p) => (
                  <button type="button" key={p} class={'ph-opt' + (pose === p ? ' is-on' : '')} aria-pressed={pose === p} disabled={!walker} onClick={() => choosePose(p)}>
                    <span>{t(POSE_NAME[p][0], POSE_NAME[p][1])}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        <div class="ph-tabs" role="tablist" aria-label={t('拍照选项', 'Photo options')}>
          {tabs.map(([k, zh, en]) => (
            <button type="button" role="tab" key={k} class={'ph-tab' + (tab === k ? ' is-on' : '')} aria-selected={tab === k} onClick={() => setTab((cur) => (cur === k ? null : k))}>
              {t(zh, en)}
              {k === 'filter' && filter !== 'none' && <i class="ph-dot" aria-hidden="true" />}
              {k === 'frame' && frame !== 'none' && <i class="ph-dot" aria-hidden="true" />}
              {k === 'time' && (time !== 'now' || still) && <i class="ph-dot" aria-hidden="true" />}
              {k === 'walker' && (!walker || pose) && <i class="ph-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      {/* --- move, shoot, rise and sink */}
      <div class="ph-bottom">
        <div class="ph-move">
          {touch ? props.stick : (
            <p class="ph-keys">
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {t('移动', 'move')} · <kbd>Shift</kbd> {t('快', 'fast')}<br />
              <kbd>{t('空格', 'Space')}</kbd>/<kbd>E</kbd> {t('升', 'up')} · <kbd>C</kbd>/<kbd>Q</kbd> {t('降', 'down')} · <kbd>Enter</kbd> {t('拍摄', 'shoot')}
            </p>
          )}
        </div>
        <button type="button" class={'ph-shutter' + (busy ? ' is-busy' : '')} onClick={() => void shoot()} disabled={busy} aria-label={busy ? t('冲洗中…', 'Developing…') : t('拍摄', 'Take the picture')}>
          <i aria-hidden="true" />
        </button>
        <div class="ph-lift">
          <LiftButton dir={1} label={t('升高', 'Rise')} glyph={t('升', '↑')} api={api} />
          <LiftButton dir={-1} label={t('降低', 'Sink')} glyph={t('降', '↓')} api={api} />
        </div>
      </div>
      {busy && <div class="ph-developing" role="status"><span class="ph-developing-dot" aria-hidden="true" />{t('冲洗中…', 'Developing…')}</div>}

      {result && (
        <ResultCard
          result={result}
          lasts={lasts}
          onAgain={() => setResult(null)}
          toast={props.toast}
        />
      )}
      {albumOpen && <Album onClose={() => setAlbumOpen(false)} toast={props.toast} lasts={lasts} />}
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="1.5" y="1.5" width="15" height="15" rx="2" />
      <path d="M6.5 1.5v15M11.5 1.5v15M1.5 6.5h15M1.5 11.5h15" opacity="0.7" />
    </svg>
  );
}

/** Held down: rise (or sink) until let go. */
function LiftButton(props: { dir: 1 | -1; label: string; glyph: string; api: WorldHandle['photo'] }) {
  const on = useRef(false);
  const start = (e: PointerEvent) => {
    e.preventDefault();
    on.current = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    props.api.lift(props.dir);
  };
  const stop = () => { if (on.current) { on.current = false; props.api.lift(0); } };
  useEffect(() => () => { if (on.current) props.api.lift(0); }, []);
  return (
    <button type="button" class="ph-liftbtn" aria-label={props.label} title={props.label} onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
      <span class="brush" aria-hidden="true">{props.glyph}</span>
    </button>
  );
}

/** 焦 — a vertical zoom: up is a longer lens. Even steps in the view's width (tan of the half-angle). */
function Zoom(props: { fov: number; onChange(f: number): void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const z = (f: number) => Math.log(Math.tan((f * Math.PI) / 360));
  const zMin = z(FOV_MIN), zMax = z(FOV_MAX);
  const frac = (z(props.fov) - zMin) / (zMax - zMin); // 0 at the top (tele) … 1 at the bottom (wide)
  const fromY = (y: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const u = Math.min(1, Math.max(0, (y - r.top) / r.height));
    props.onChange((Math.atan(Math.exp(zMin + u * (zMax - zMin))) * 360) / Math.PI);
  };
  const stepBy = (d: number) => {
    const u = Math.min(1, Math.max(0, frac + d));
    props.onChange((Math.atan(Math.exp(zMin + u * (zMax - zMin))) * 360) / Math.PI);
  };
  return (
    <div class="ph-zoom">
      <span class="ph-zoom-mm num" aria-hidden="true">{focal(props.fov)}mm</span>
      <div
        class="ph-zoom-track"
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t('焦距', 'Zoom')}
        aria-valuemin={FOV_MIN}
        aria-valuemax={FOV_MAX}
        aria-valuenow={Math.round(props.fov)}
        aria-valuetext={`${focal(props.fov)}mm`}
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = e.pointerId;
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ }
          fromY(e.clientY);
        }}
        onPointerMove={(e) => { if (drag.current === e.pointerId) fromY(e.clientY); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); stepBy(-0.05); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); stepBy(0.05); }
        }}
      >
        <i class="ph-zoom-fill" style={{ transform: `scaleY(${1 - frac})` }} aria-hidden="true" />
        <i class="ph-zoom-thumb" style={{ '--u': String(frac) }} aria-hidden="true" />
      </div>
      <span class="ph-zoom-label brush" aria-hidden="true">{t('焦', 'zoom')}</span>
    </div>
  );
}

/** Save a picture the best way this place allows: the host's save, a download, the share sheet, or long-press. */
async function savePicture(blob: Blob, name: string, toast: (zh: string, en: string) => void): Promise<void> {
  const r = await hostSave(name, blob);
  if (r === 'saved') { toast(`已保存 ${name}`, `Saved ${name}`); return; }
  if (r === 'declined') return;
  // phones: the share sheet holds "Save Image" (to Photos)
  if (coarse() && canShareFile(blob, name)) { await sharePicture(blob, name, toast, true); return; }
  if (!embedded() && download(blob, name)) { toast(`已保存 ${name}`, `Saved ${name}`); return; }
  toast('长按（或右键）图片即可保存', 'Long-press (or right-click) the picture to save it');
}

async function sharePicture(blob: Blob, name: string, toast: (zh: string, en: string) => void, fromSave = false): Promise<void> {
  try {
    const file = new File([blob], name, { type: blob.type });
    await navigator.share({ files: [file], title: '半亩 · 入画' });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return;
    if (fromSave) toast('长按（或右键）图片即可保存', 'Long-press (or right-click) the picture to save it');
    else toast('此处无法分享，请保存图片', 'Sharing isn’t available here — save the picture instead');
  }
}

/** The developed picture: 保存 · 分享 · 再拍. */
function ResultCard(props: { result: Developed; lasts: boolean; onAgain(): void; toast(zh: string, en: string): void }) {
  const t = useT();
  const r = props.result;
  const share = canShareFile(r.blob, r.name);
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    again.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); props.onAgain(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div class="ph-card-wrap" onClick={(e) => e.target === e.currentTarget && props.onAgain()}>
      <div class="ph-card" role="dialog" aria-modal="true" aria-label={t('照片', 'Photograph')}>
        <div class="ph-card-pic">
          <img src={r.url} width={r.w} height={r.h} alt={t('刚拍下的照片', 'The photograph just taken')} />
        </div>
        <p class="ph-card-note">
          {props.lasts ? t(`已收入相册（留最近 ${ALBUM_KEEP} 张）`, `Kept in the album (the last ${ALBUM_KEEP})`) : t('已收入本次相册（此处无法长久保存，记得存下）', 'Kept in this session’s album (it cannot last here — save it)')}
        </p>
        <div class="ph-card-actions">
          <button type="button" class="btn btn-primary" onClick={() => void savePicture(r.blob, r.name, props.toast)}>{t('保存', 'Save')}</button>
          {share && <button type="button" class="btn" onClick={() => void sharePicture(r.blob, r.name, props.toast)}>{t('分享', 'Share')}</button>}
          <button type="button" class="btn" ref={again} onClick={props.onAgain}>{t('再拍', 'Another')}</button>
        </div>
      </div>
    </div>
  );
}

/** 相册: the last twelve pictures; one opened large, to save, share or let go. */
function Album(props: { onClose(): void; toast(zh: string, en: string): void; lasts: boolean }) {
  const t = useT();
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<AlbumPhoto | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const load = () => listPhotos().then((ps) => setPhotos(ps)).catch(() => setPhotos([]));
  useEffect(() => { void load(); close.current?.focus(); }, []);
  useEffect(() => {
    if (!photos) return;
    const m = new Map(photos.map((p) => [p.id, URL.createObjectURL(p.thumb)]));
    setUrls(m);
    return () => { for (const u of m.values()) URL.revokeObjectURL(u); };
  }, [photos]);
  useEffect(() => {
    if (!open) { setBig(null); return; }
    const u = URL.createObjectURL(open.blob);
    setBig(u);
    return () => URL.revokeObjectURL(u);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      e.preventDefault();
      e.stopPropagation();
      if (open) setOpen(null);
      else props.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  const when = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return (
    <div class="ph-card-wrap" onClick={(e) => e.target === e.currentTarget && (open ? setOpen(null) : props.onClose())}>
      <div class="ph-album" role="dialog" aria-modal="true" aria-label={t('相册', 'Album')}>
        <header class="ph-album-head">
          <h2 class="brush">{open ? t('一帧', 'A picture') : t('相册', 'Album')}</h2>
          <small>{open ? when(open.at) : t(`最近 ${ALBUM_KEEP} 张`, `The last ${ALBUM_KEEP}`) + (props.lasts ? '' : t(' · 仅本次', ' · this session only'))}</small>
          <button type="button" class="ph-album-close" ref={close} onClick={() => (open ? setOpen(null) : props.onClose())} aria-label={open ? t('返回', 'Back') : t('收起', 'Close')}>{open ? '‹' : '✕'}</button>
        </header>
        {open ? (
          <div class="ph-album-one">
            <div class="ph-card-pic">{big && <img src={big} width={open.w} height={open.h} alt={t('相册中的照片', 'A photograph from the album')} />}</div>
            <div class="ph-card-actions">
              <button type="button" class="btn btn-primary" onClick={() => void savePicture(open.blob, open.name, props.toast)}>{t('保存', 'Save')}</button>
              {canShareFile(open.blob, open.name) && <button type="button" class="btn" onClick={() => void sharePicture(open.blob, open.name, props.toast)}>{t('分享', 'Share')}</button>}
              <button type="button" class="btn btn-ghost" onClick={() => { const id = open.id; setOpen(null); void removePhoto(id).then(load); }}>{t('删去', 'Delete')}</button>
            </div>
          </div>
        ) : photos === null ? (
          <p class="ph-album-empty muted">{t('翻开相册…', 'Opening the album…')}</p>
        ) : photos.length === 0 ? (
          <p class="ph-album-empty muted">{t('还没有照片。按下快门，拍下画中一景。', 'No photographs yet. Press the shutter and keep a scene from the painting.')}</p>
        ) : (
          <ul class="ph-album-grid">
            {photos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p)} aria-label={t(`照片 ${when(p.at)}`, `Photograph ${when(p.at)}`)}>
                  {urls.get(p.id) && <img src={urls.get(p.id)} alt="" loading="lazy" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
