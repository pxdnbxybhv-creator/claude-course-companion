// 贺 — announces a finished quest anywhere in the app. Watches play.celebrations; when a quest is
// done, a leaf of xuan paper bleeds in like ink dropped on paper: a new companion's portrait on a
// spreading wash (with 「与之同游」), or a seal slamming down with a wooden thud. Tap, Esc or ~6 s
// dismiss it; several finish at once → shown one after another. Renders nothing when idle.
import { useEffect, useRef, useState } from 'preact/hooks';
import { celebrations, nextCelebration, selectCharacter } from '../../app/play';
import { go, route } from '../../app/router';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { audio } from '../../audio/engine';
import { QUEST, type QuestDef } from '../../data/quests';
import { CHARACTER, type CharacterDef } from '../../data/characters';
import { hashString, makeRng } from '../../core/rng';
import { Portrait, Seal } from './bits';
import { paintBloom, paintPaper, dprOf } from './paint';
import { albumRequest, sealLook } from './helpers';
import './celebrate.css';

const SHOW_MS = 6500;
const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

let seq = 0;

export function Celebrate() {
  const pending = celebrations.value.length;
  const [cur, setCur] = useState<{ id: string; key: number } | null>(null);
  useEffect(() => {
    if (cur || !pending) return;
    // A breath first, so the moment that finished the quest (a solved puzzle, a caught fish) is seen.
    const tm = setTimeout(() => {
      let id = nextCelebration();
      while (id && !QUEST[id]) id = nextCelebration();
      if (id) setCur({ id, key: ++seq });
    }, seq === 0 ? 700 : 450);
    return () => clearTimeout(tm);
  }, [cur, pending]);
  if (!cur) return null;
  return <Card key={cur.key} q={QUEST[cur.id]} onGone={() => setCur(null)} />;
}

function Card(props: { q: QuestDef; onGone: () => void }) {
  const { q } = props;
  const t = useT();
  const zh = lang.value === 'zh';
  const reduced = useRef(reducedMotion()).current;
  const companion: CharacterDef | null = 'character' in q.reward ? CHARACTER[q.reward.character] ?? null : null;
  const sealText = 'seal' in q.reward ? q.reward.seal : null;
  const [out, setOut] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLCanvasElement>(null);
  const bloom = useRef<HTMLCanvasElement>(null);
  const shownAt = useRef(performance.now());
  const closing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => void timers.current.push(setTimeout(fn, ms));

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setOut(true);
    later(props.onGone, reduced ? 160 : 420);
  };

  // auto-dismiss, paused while hovered / focused / the page is hidden
  const clock = useRef({ left: SHOW_MS, since: 0, tm: 0 as unknown as ReturnType<typeof setTimeout>, running: false });
  const resume = () => {
    const c = clock.current;
    if (c.running || closing.current) return;
    c.running = true;
    c.since = performance.now();
    c.tm = setTimeout(close, Math.max(400, c.left));
    setPaused(false);
  };
  const pause = () => {
    const c = clock.current;
    if (!c.running) return;
    c.running = false;
    clearTimeout(c.tm);
    c.left -= performance.now() - c.since;
    setPaused(true);
  };

  useEffect(() => {
    const el = root.current;
    const prev = document.activeElement as HTMLElement | null;
    el?.focus({ preventScroll: true });
    resume();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    const onVis = () => (document.visibilityState === 'hidden' ? pause() : resume());
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis);
    // sound: a guqin flourish for a new friend; a thud and a small chime for a seal (see the slam)
    if (companion) later(() => audio.chime(q.id === 'q-all' ? 21 : 7), reduced ? 60 : 380);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(clock.current.tm);
      timers.current.forEach(clearTimeout);
      if (prev && prev.isConnected && document.activeElement === el) prev.focus?.({ preventScroll: true });
    };
  }, []);

  // paint the paper leaf and the ink bloom
  useEffect(() => {
    const dpr = Math.min(2, dprOf());
    const pc = paper.current;
    if (pc) {
      const r = pc.getBoundingClientRect();
      pc.width = Math.max(1, Math.round(r.width * dpr));
      pc.height = Math.max(1, Math.round(r.height * dpr));
      try { paintPaper(pc, 41); } catch { /* the css paper colour shows */ }
    }
    const bc = bloom.current;
    if (bc) {
      const r = bc.getBoundingClientRect();
      bc.width = Math.max(1, Math.round(r.width * dpr));
      bc.height = Math.max(1, Math.round(r.height * dpr));
      try { paintBloom(bc, hashString(q.id), companion?.id === 'change' || companion?.id === 'rabbit'); } catch { /* no bloom */ }
    }
  }, []);

  const onStampReady = () => {
    // let the paper bleed in before the seal comes down
    const wait = reduced ? 0 : Math.max(0, 520 - (performance.now() - shownAt.current));
    later(() => {
      setStamped(true);
      const impact = reduced ? 0 : 300;
      later(() => audio.knock(), impact);
      later(() => audio.chime(1), impact + 160);
    }, wait);
  };

  const onBackdrop = (e: MouseEvent) => {
    // ignore the tail of whatever tap finished the quest
    if (performance.now() - shownAt.current < 500) return;
    if ((e.target as HTMLElement).closest('button')) return;
    close();
  };

  const walk = (e: MouseEvent) => {
    e.stopPropagation();
    if (!companion) return close();
    selectCharacter(companion.id);
    close();
    if (route.value !== 'walk') go('walk', e);
  };
  const album = (e: MouseEvent) => {
    e.stopPropagation();
    close();
    albumRequest.pending = true;
    if (route.value !== 'quests') go('quests', e);
    else document.getElementById('album')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  const later2 = (e: MouseEvent) => { e.stopPropagation(); close(); };

  const petals = useRef(makePetals(q.id)).current;

  return (
    <div
      ref={root}
      class={'cel' + (out ? ' is-out' : '') + (reduced ? ' is-reduced' : '') + (paused ? ' is-paused' : '') + (stamped ? ' is-stamped' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cel-title"
      aria-describedby="cel-desc"
      tabIndex={-1}
      onClick={onBackdrop}
    >
      <div class="cel-veil" aria-hidden="true" />
      <div class={'cel-leaf' + (companion ? ' is-companion' : ' is-seal')} onMouseEnter={pause} onMouseLeave={resume} onFocusIn={pause} onFocusOut={resume}>
        <canvas ref={paper} class="cel-paper" aria-hidden="true" />
        <div class="cel-frame" aria-hidden="true" />
        <p class="cel-kicker">{t('任务完成', 'Quest complete')}</p>
        <h2 id="cel-title" class={'cel-quest ' + (zh ? 'brush' : 'latin')}>{zh ? `「${q.zh}」` : q.en}</h2>

        {companion ? (
          <>
            <div class="cel-stage">
              <canvas ref={bloom} class="cel-bloom" aria-hidden="true" />
              <div class="cel-fan"><Portrait id={companion.id} locked={false} size={164} eager /></div>
              {!reduced && (
                <div class="cel-petals" aria-hidden="true">
                  {petals.map((p) => <i style={p} />)}
                </div>
              )}
            </div>
            <p class="cel-new">{t('新同伴', 'A new companion')}</p>
            <div class="cel-names">
              <span class={'cel-name ' + (zh ? 'brush' : 'latin')}>{zh ? companion.zh : companion.en}</span>
              <span class={'cel-name2 ' + (zh ? 'latin' : 'brush')}>{zh ? companion.en : companion.zh}</span>
            </div>
            <p class="cel-title">「{t(companion.titleZh, companion.titleEn)}」</p>
            <p id="cel-desc" class="cel-ability"><span aria-hidden="true">◈ </span>{t(companion.abilityZh, companion.abilityEn)}</p>
            <div class="cel-actions">
              <button type="button" class="cel-btn is-seal" onClick={walk}>{t('与之同游', 'Walk together')}</button>
              <button type="button" class="cel-btn" onClick={later2}>{t('稍后', 'Later')}</button>
            </div>
          </>
        ) : (
          <>
            <div class="cel-stage is-seal">
              <div class="cel-stamp"><Seal text={sealText ?? '印'} size={128} earned onReady={onStampReady} /></div>
              <div class={'cel-ring is-' + sealLook(sealText ?? '印').shape} aria-hidden="true" />
            </div>
            <p id="cel-desc" class="cel-sealnote">
              {t(`得印「${sealText ?? ''}」，已收入印谱。`, `Seal earned: ${'seal' in q.reward ? q.reward.sealEn : ''}. Added to your album.`)}
            </p>
            <div class="cel-actions">
              <button type="button" class="cel-btn is-seal" onClick={album}>{t('翻看印谱', 'Open the album')}</button>
              <button type="button" class="cel-btn" onClick={later2}>{t('好', 'OK')}</button>
            </div>
          </>
        )}
        <p class="cel-dismiss" aria-hidden="true">{t('轻触任意处关闭', 'Tap anywhere to close')}</p>
        <div class="cel-timer" aria-hidden="true"><i style={{ animationDuration: SHOW_MS + 'ms' }} /></div>
      </div>
    </div>
  );
}

/** A few rouge petals drifting across the leaf (deterministic per quest). */
function makePetals(id: string): Record<string, string>[] {
  const rng = makeRng(hashString('petals:' + id));
  return Array.from({ length: 9 }, () => ({
    left: `${Math.round(4 + rng() * 88)}%`,
    animationDelay: `${Math.round(500 + rng() * 2200)}ms`,
    animationDuration: `${Math.round(3200 + rng() * 2400)}ms`,
    '--drift': `${Math.round(-40 + rng() * 80)}px`,
    '--spin': `${Math.round(90 + rng() * 360)}deg`,
    '--s': (0.7 + rng() * 0.7).toFixed(2),
  }));
}
