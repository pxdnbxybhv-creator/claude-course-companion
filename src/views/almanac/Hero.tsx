// The current solar term: its name in large brush, pinyin and English, the season's line, and
// its three pentads (七十二候) as a small timeline — all on a sheet of xuan paper with far hills.
import { useEffect, useRef } from 'preact/hooks';
import type { TermContext } from '../../core/solarterms';
import { seasonOfTerm } from '../../core/solarterms';
import { cnNumber } from '../../core/date';
import { TERMS } from '../../data/terms';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { paintHeroBackdrop } from './paint';
import { dpr, useSize } from './hooks';
import { chinaMD, termProgress, SEASON_ZH } from './model';

const MENG = ['孟', '仲', '季'];
const MENG_EN = ['Early', 'Mid', 'Late'];
const PENTAD_ZH = ['初候', '二候', '三候'];
const PENTAD_EN = ['First pentad', 'Second pentad', 'Third pentad'];

export function Hero(props: { now: Date; ctx: TermContext }) {
  const t = useT();
  const en = lang.value === 'en';
  const { ctx, now } = props;
  const i = ctx.current.index;
  const term = TERMS[i];
  const next = TERMS[ctx.next.index];
  const season = seasonOfTerm(i);
  const sub = Math.floor((i % 6) / 2);
  const p = termProgress(now, ctx.current, ctx.next);
  const start = chinaMD(ctx.current.at);

  const box = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const size = useSize(box);
  useEffect(() => {
    if (!cv.current || !size.w || !size.h) return;
    paintHeroBackdrop(cv.current, size.w, size.h, dpr(), season, 5 + i * 13);
  }, [size.w, size.h, season, i]);

  const days = ctx.daysToNext;
  const nextLine =
    days <= 0
      ? t(`今日${next.zh}`, `${next.en} begins today`)
      : days === 1
        ? t(`明日${next.zh}`, `${next.en} tomorrow`)
        : null;

  return (
    <section class="alm-hero alm-paper" ref={box} aria-labelledby="alm-term-title">
      <canvas class="alm-hero-bg" ref={cv} aria-hidden="true" />
      <div class="alm-hero-in">
        <p class="alm-kicker">
          <span>{t(`二十四节气 · 第${cnNumber(i + 1)}`, `Solar term ${i + 1} of 24`)}</span>
          <span class="alm-kicker-season">{t(`${MENG[sub]}${SEASON_ZH[season]}`, `${MENG_EN[sub]} ${season}`)}</span>
        </p>
        <div class="alm-hero-main">
          <h2 id="alm-term-title" class="alm-term-name brush" lang="zh-CN" aria-label={en ? `${term.en} · ${term.zh}` : term.zh}>
            {term.zh}
          </h2>
          <div class="alm-term-meta">
            <p class="alm-pinyin latin">{term.pinyin}</p>
            <p class="alm-term-en latin">{term.en}</p>
            <p class="alm-term-when">
              {t(`${start.m}月${start.d}日 ${start.hh} 交节`, `Began ${start.m}/${start.d}, ${start.hh} (China time)`)}
            </p>
            {(term.blurbZh || term.blurbEn) && (
              <div class="alm-blurb">
                {en ? (
                  <>
                    <p class="alm-blurb-a latin">{term.blurbEn}</p>
                    <p class="alm-blurb-b" lang="zh-CN">{term.blurbZh}</p>
                  </>
                ) : (
                  <>
                    <p class="alm-blurb-a">{term.blurbZh}</p>
                    <p class="alm-blurb-b latin" lang="en">{term.blurbEn}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <ol class="alm-pentads" aria-label={t('七十二候 · 本节气三候', 'The three pentads of this term')}>
          {term.pentads.slice(0, 3).map((pt, k) => {
            const state = k < ctx.pentad ? 'past' : k === ctx.pentad ? 'now' : 'future';
            const f = state === 'past' ? 1 : state === 'future' ? 0 : Math.min(1, Math.max(0, p * 3 - k));
            return (
              <li class={`alm-pentad is-${state}`} aria-current={state === 'now' ? 'true' : undefined}>
                <span class="alm-pentad-ord">{t(PENTAD_ZH[k], PENTAD_EN[k])}</span>
                <span class="alm-pentad-line" aria-hidden="true">
                  <span class="alm-pentad-fill" style={{ width: `${f * 100}%` }} />
                  {state === 'now' && <span class="alm-pentad-dot" style={{ left: `${f * 100}%` }} />}
                </span>
                {en ? (
                  <>
                    <span class="alm-pentad-a latin">{pt.en}</span>
                    <span class="alm-pentad-b" lang="zh-CN">{pt.zh}</span>
                  </>
                ) : (
                  <>
                    <span class="alm-pentad-a">{pt.zh}</span>
                    <span class="alm-pentad-b latin" lang="en">{pt.en}</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        <p class="alm-next">
          {nextLine ? (
            <span class="alm-next-a">{nextLine}</span>
          ) : en ? (
            <span class="alm-next-a latin">
              <b class="num">{days}</b> days to {next.en} <span class="alm-next-zh" lang="zh-CN">{next.zh}</span>
            </span>
          ) : (
            <span class="alm-next-a">
              距<span class="alm-next-term">{next.zh}</span>还有 <b class="num">{days}</b> 天
            </span>
          )}
          {!en && !nextLine && <span class="alm-next-b latin" lang="en">{days} days to {next.en}</span>}
        </p>
      </div>
    </section>
  );
}
