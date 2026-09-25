// 宜 / 忌 — a playful modern 黄历, with a red seal for 宜 and an ink seal for 忌.
import { useEffect, useRef } from 'preact/hooks';
import { makeSeal } from '../../ink/seal';
import { almanacFor, type AlmanacDay } from '../../data/almanac';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { dpr, useDark } from './hooks';

/** A seal stamp. `paper` = it sits on a painting, which stays on paper in dark mode too. */
export function SealMark(props: { text: string; size: number; kind: 'yi' | 'ji'; seed?: number; paper?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useDark() && !props.paper;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const color = props.kind === 'yi' ? (dark ? '#d4553a' : '#b93a2b') : dark ? '#ece4d2' : '#1b1916';
    const s = makeSeal(props.text, { size: props.size, dpr: dpr(), style: props.kind === 'yi' ? 'bai' : 'zhu', color, seed: props.seed ?? 7 });
    c.width = s.width;
    c.height = s.height;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(s, 0, 0);
  }, [props.text, props.size, props.kind, dark]);
  return <canvas ref={ref} class="alm-seal" style={{ width: props.size, height: props.size }} aria-hidden="true" />;
}

export function YiJiList(props: { day: AlmanacDay; compact?: boolean }) {
  const t = useT();
  const en = lang.value === 'en';
  const col = (kind: 'yi' | 'ji', items: { zh: string; en: string }[]) => (
    <div class={`alm-yj-col is-${kind}`}>
      <div class="alm-yj-head">
        <SealMark text={kind === 'yi' ? '宜' : '忌'} size={props.compact ? 28 : 38} kind={kind} seed={kind === 'yi' ? 11 : 23} />
        <span class="visually-hidden">{kind === 'yi' ? t('宜', 'Good for') : t('忌', 'Avoid')}</span>
        {en && <span class="alm-yj-label latin" aria-hidden="true">{kind === 'yi' ? 'good for' : 'avoid'}</span>}
      </div>
      <ul class="alm-yj-items">
        {items.map((it) => (
          <li>
            {en ? (
              <>
                <span class="alm-yj-a latin">{it.en}</span>
                <span class="alm-yj-b" lang="zh-CN">{it.zh}</span>
              </>
            ) : (
              <span class="alm-yj-a">{it.zh}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div class={'alm-yj' + (props.compact ? ' is-compact' : '')}>
      {col('yi', props.day.yi)}
      {col('ji', props.day.ji)}
    </div>
  );
}

export function YiJi(props: { dayKey: string; term: number }) {
  const t = useT();
  const day = almanacFor(props.dayKey, props.term);
  return (
    <section class="alm-card alm-yiji" aria-labelledby="alm-yj-h">
      <h2 id="alm-yj-h" class="alm-h">
        <span>{t('今日宜忌', 'Good for, and not')}</span>
        <span class="alm-h-sub">{t('一份温和的黄历', 'a gentle almanac')}</span>
      </h2>
      <YiJiList day={day} />
    </section>
  );
}
