// 一炷香 — one stick of incense, the old unit of time (about half an hour), as a focus timer.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../app/i18n';
import { state } from '../app/store';
import { makeSeal, sealReady } from '../ink/seal';
import { IncenseCanvas } from './focus/IncenseCanvas';
import { Setup } from './focus/Setup';
import { Burning } from './focus/Burning';
import { History } from './focus/History';
import { DoneSheet } from './focus/Done';
import { active, completion, viewShown } from './focus/session';
import { cnInt } from './focus/timer';
import './focus/focus.css';

export function FocusView() {
  const t = useT();
  const s = active.value;
  const [minutes, setMinutes] = useState(() => state.value.settings.focusMinutes);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    viewShown.value = true;
    return () => { viewShown.value = false; };
  }, []);

  const phase = s ? (s.pausedAt !== null ? 'paused' : 'burning') : completion.value ? 'done' : 'idle';
  const shownMinutes = s ? s.minutes : minutes;
  const intent = s?.intent;

  const again = () => {
    const el = rootRef.current?.querySelector<HTMLInputElement>('.fx-intent input');
    el?.focus();
  };

  const sceneLabel = s
    ? t(`香炉中一炷香正在燃烧${s.pausedAt !== null ? '（已暂停）' : ''}。拖动可拨动香烟。`, `A stick of incense burning in a bronze censer${s.pausedAt !== null ? ' (paused)' : ''}. Drag to stir the smoke.`)
    : t('香炉与一炷未燃的香', 'A bronze censer with an unlit stick of incense');

  return (
    <section class="fx" data-phase={phase} ref={rootRef} aria-label={t('一炷香 · 专注', 'Focus')}>
      <h1 class="visually-hidden">{t('一炷香', 'One stick of incense')}</h1>
      <div class="fx-stage">
        <div class="fx-mount">
          <IncenseCanvas label={sceneLabel} />
          <div class="fx-inscription" aria-hidden="true">
            <span class="fx-ins-title brush">一炷香</span>
            <span class="fx-ins-col">
              <span class="fx-ins-sub">{intent && /^[\u3000-\u9fff\uff00-\uffef\s]+$/.test(intent) && intent.length <= 12 ? `为${intent}` : `${cnInt(shownMinutes)}分`}</span>
              <InscriptionSeal />
            </span>
          </div>
        </div>
      </div>

      <div class="fx-controls">
        <div class="fx-intro">
          <p class="fx-intro-title brush" aria-hidden="true">一炷香</p>
          <p class="fx-intro-text">{t('古人焚香计时，一炷香约莫半个钟头。点一炷，做一件事。', 'Of old, time was told by incense: one stick burns about half an hour. Light one; do one thing.')}</p>
        </div>
        {s ? <Burning /> : <Setup minutes={minutes} onMinutes={setMinutes} />}
      </div>

      <aside class="fx-side" aria-label={t('香迹', 'Incense log')}>
        <History />
      </aside>

      <DoneSheet onAgain={again} />
    </section>
  );
}

/** A small cinnabar leisure seal under the inscription. */
function InscriptionSeal() {
  const ref = useRef<HTMLSpanElement>(null);
  const seal = state.value.settings.sealName || '半亩';
  useEffect(() => {
    let off = false;
    sealReady(seal).then(() => {
      if (off || !ref.current) return;
      try {
        const c = makeSeal(seal, { size: 26, dpr: Math.min(2.5, window.devicePixelRatio || 1), style: 'bai', seed: 3, wear: 0.45 });
        c.style.width = c.style.height = '26px';
        ref.current.replaceChildren(c);
      } catch {
        /* the inscription reads fine without its seal */
      }
    });
    return () => { off = true; };
  }, [seal]);
  return <span class="fx-seal" ref={ref} />;
}
