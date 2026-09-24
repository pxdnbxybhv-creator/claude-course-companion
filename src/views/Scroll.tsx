// 长卷 · Scroll — mount the garden as a hanging scroll (or a square panel), or review the year in
// ink, and save / share it as an image.
import { useEffect, useRef, useState } from 'preact/hooks';
import { state, today, lang, activeHabits } from '../app/store';
import { useT } from '../app/i18n';
import { go } from '../app/router';
import { Segmented, Sheet, toast } from '../ui/kit';
import { renderPoster, posterSize, type PosterFormat, type PosterKind } from './scroll/poster';
import './scroll/scroll.css';

const PREF = 'banmu.scroll';

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(`${PREF}.${key}`);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try { localStorage.setItem(`${PREF}.${key}`, v); } catch { /* private mode */ }
}

/** Is the app currently dark (explicit setting, or the system when set to auto)? */
function useDark(theme: 'auto' | 'light' | 'dark'): boolean {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const [sys, setSys] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return theme === 'dark' || (theme === 'auto' && sys);
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

interface Rendered {
  url: string;
  blob: Blob;
  name: string;
  w: number;
  h: number;
}

export function ScrollView() {
  const t = useT();
  const s = state.value;
  const day = today.value;
  const l = lang.value;
  const empty = activeHabits.value.length === 0;
  const [kind, setKindRaw] = useState<PosterKind>(() => readPref('kind', ['garden', 'year'] as const, 'garden'));
  const [format, setFormatRaw] = useState<PosterFormat>(() => readPref('format', ['tall', 'square'] as const, 'tall'));
  const [salt, setSalt] = useState(0);
  const dark = useDark(s.settings.theme);
  const [out, setOut] = useState<Rendered | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const urlRef = useRef<string | null>(null);

  const setKind = (k: PosterKind) => { setKindRaw(k); writePref('kind', k); };
  const setFormat = (f: PosterFormat) => { setFormatRaw(f); writePref('format', f); };

  useEffect(() => {
    let live = true;
    setBusy(true);
    setFailed(false);
    // yield a frame so the "grinding ink" state paints before the heavy work starts
    const timer = setTimeout(async () => {
      try {
        const c = await renderPoster({ kind, format, state: s, today: day, lang: l, salt, dark });
        const blob = await canvasBlob(c);
        if (!live) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        const stamp = day.replace(/-/g, '');
        setOut({ url, blob, name: kind === 'year' ? `banmu-year-${stamp}.png` : `banmu-${stamp}.png`, w: c.width, h: c.height });
      } catch (e) {
        console.error('[scroll] render failed', e);
        if (live) setFailed(true);
      } finally {
        if (live) setBusy(false);
      }
    }, 40);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, format, salt, s, day, l, dark]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  useEffect(() => {
    if (!out) return;
    try {
      const file = new File([out.blob], out.name, { type: 'image/png' });
      setCanShare(typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] }));
    } catch {
      setCanShare(false);
    }
  }, [out]);

  function save() {
    if (!out) return;
    try {
      const a = document.createElement('a');
      a.href = out.url;
      a.download = out.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { /* downloads may be blocked (embedded); the sheet below always works */ }
    setSaveOpen(true);
  }

  async function share() {
    if (!out) return;
    try {
      const file = new File([out.blob], out.name, { type: 'image/png' });
      await navigator.share({ files: [file], title: t('半亩', 'Half-Acre') });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setCanShare(false);
      toast(t('此处无法分享，请保存图片', 'Sharing isn’t available here — save the image instead'));
    }
  }

  const size = posterSize(format);
  const alt = kind === 'year'
    ? t('岁时记：一年里每日功课的墨点', 'Year in Ink: a dot of ink for every day of the year')
    : t('立轴：你的园子裱成一幅水墨画', 'Your garden mounted as an ink painting');

  return (
    <div class="scroll-view">
      <header class="topbar">
        <div class="topbar-title">
          <h1 class="brush">{t('长卷', 'Scroll')}</h1>
          <span class="topbar-sub">{t('把园子裱成一幅画', 'Your garden, mounted as a painting')}</span>
        </div>
        <button class="btn btn-ghost btn-icon" onClick={() => go('settings')} aria-label={t('设置', 'Settings')} title={t('设置', 'Settings')}>
          <GearIcon />
        </button>
      </header>

      <div class="scroll-body page-wide">
        <div class={'scroll-stage' + (format === 'square' ? ' is-square' : '')}>
          <div class="scroll-frame" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
            {out && (
              <img
                class={'scroll-img' + (busy ? ' is-busy' : '')}
                src={out.url}
                width={out.w}
                height={out.h}
                alt={alt}
                draggable
              />
            )}
            {busy && (
              <div class="scroll-busy" role="status">
                <span class="scroll-busy-dot" aria-hidden="true" />
                <span>{t('研墨中…', 'Grinding ink…')}</span>
              </div>
            )}
            {failed && !busy && (
              <div class="scroll-busy" role="alert">
                <span>{t('画未成，请再试一次', 'The painting didn’t come out — try again')}</span>
                <button class="btn btn-small" onClick={() => setSalt((x) => x + 1)}>{t('重画', 'Repaint')}</button>
              </div>
            )}
          </div>
        </div>

        <div class="scroll-panel">
          <div class="scroll-controls">
            <div class="scroll-field">
              <span class="scroll-label">{t('画题', 'Poster')}</span>
              <Segmented<PosterKind>
                label={t('画题', 'Poster')}
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'garden', label: t('园景', 'Garden') },
                  { value: 'year', label: t('岁时记', 'Year in ink') },
                ]}
              />
            </div>
            <div class="scroll-field">
              <span class="scroll-label">{t('幅式', 'Format')}</span>
              <Segmented<PosterFormat>
                label={t('幅式', 'Format')}
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'tall', label: <span title="9:16">{t('立轴', 'Tall')}</span> },
                  { value: 'square', label: <span title="1:1">{t('斗方', 'Square')}</span> },
                ]}
              />
            </div>
          </div>
          <div class="scroll-actions">
            {kind === 'garden' && (
              <button class="btn scroll-reroll" onClick={() => setSalt((x) => x + 1)} disabled={busy} aria-label={t('换一首诗', 'Another poem')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
                {t('换诗', 'Poem')}
              </button>
            )}
            <button class="btn btn-primary scroll-save-btn" onClick={save} disabled={!out || busy}>
              {t('保存图片', 'Save image')}
            </button>
            {canShare && (
              <button class="btn" onClick={share} disabled={!out || busy}>
                {t('分享', 'Share')}
              </button>
            )}
          </div>
          {empty && kind === 'garden' && (
            <p class="scroll-note scroll-empty">
              {t('园中尚无草木，画里只有山水。', 'Your garden is still empty — only hills and water so far.')}{' '}
              <button class="link" onClick={() => go('garden')}>{t('去种一株', 'Plant a habit')}</button>
            </p>
          )}
          <p class="scroll-note">
            {kind === 'garden'
              ? format === 'tall'
                ? t('立轴 9:16，宜作手机壁纸。题诗随节气，落款钤印。', 'A 9:16 hanging scroll — made for a phone wallpaper. The poem follows the season.')
                : t('斗方 1:1，宜分享于朋友圈。题诗随节气，落款钤印。', 'A 1:1 square panel — made for sharing. The poem follows the season.')
              : t('一日一点：墨色愈浓，当日功课愈全；朱圈为今日。', 'One dot a day: the darker the ink, the more habits kept that day. Today is ringed in red.')}
          </p>
          <p class="scroll-hint muted">{t('亦可长按或右键画面直接保存', 'You can also long-press or right-click the picture to save it')}</p>
        </div>
      </div>

      <Sheet open={saveOpen} onClose={() => setSaveOpen(false)} title={t('保存图片', 'Save image')} label={t('保存图片', 'Save image')}>
        {out && (
          <div class="scroll-save">
            <img class="scroll-save-img" src={out.url} width={out.w} height={out.h} alt={alt} />
            <p class="scroll-save-hint">{t('长按或右键保存图片', 'Long-press or right-click to save')}</p>
            <div class="scroll-actions">
              <a class="btn btn-primary" href={out.url} download={out.name}>{t('下载 PNG', 'Download PNG')}</a>
              <button class="btn" onClick={() => setSaveOpen(false)}>{t('好', 'Done')}</button>
            </div>
            <p class="scroll-hint muted num">{out.name} · {out.w}×{out.h}</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
    </svg>
  );
}
