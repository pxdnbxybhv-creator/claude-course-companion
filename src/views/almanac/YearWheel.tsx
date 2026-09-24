// The year wheel: the 24 solar terms at their true solar longitude (夏至 at the top, 冬至 at the
// bottom, as on the old south-up charts), four seasons as faint arcs, the sun as a cinnabar dot.
import { useState } from 'preact/hooks';
import type { TermContext } from '../../core/solarterms';
import { seasonOfTerm } from '../../core/solarterms';
import { TERMS } from '../../data/terms';
import { Sheet } from '../../ui/kit';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { Nums } from './Nums';
import { makeRng, smoothstep } from '../../core/rng';
import { chinaMD, sunLongitude, termsIn, SEASON_ZH, SEASON_EN, MONTH_EN } from './model';

const R = 150;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Screen angle (clockwise from top) of a solar longitude. */
const screen = (lon: number) => lon - 90;
const pt = (lon: number, r: number) => {
  const a = rad(screen(lon));
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};
const f = (n: number) => n.toFixed(2);

/** One tapered brush stroke along the ring from l1 to l2 (degrees, l2 > l1): 起笔 blot, 收笔 taper. */
function brushArc(l1: number, l2: number, r: number, w: number, seed: number): string {
  const rng = makeRng(seed);
  const n = 48;
  const outer: string[] = [], inner: string[] = [];
  let wob = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    wob = (wob + rng.gauss() * 0.18) * 0.82;
    const width = w * (t < 0.06 ? 0.55 + (t / 0.06) * 0.45 : 1) * (1 - smoothstep(0.62, 1, t) * 0.82) * (1 + wob * 0.12);
    const rr = r + wob * 0.7;
    const lon = l1 + (l2 - l1) * t;
    const [ox, oy] = pt(lon, rr + width / 2), [ix, iy] = pt(lon, rr - width / 2);
    outer.push(`${f(ox)} ${f(oy)}`);
    inner.push(`${f(ix)} ${f(iy)}`);
  }
  return `M${outer.join('L')}L${inner.reverse().join('L')}Z`;
}

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const MAJOR = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

export function YearWheel(props: { now: Date; ctx: TermContext; yearGanZhi: string; zodiac: string; zodiacEn: string }) {
  const t = useT();
  const en = lang.value === 'en';
  const { ctx, now } = props;
  const cur = ctx.current.index;
  const sunLon = sunLongitude(now, ctx.current, ctx.next);
  const year = new Date(now.getTime() + 8 * 3600_000).getUTCFullYear();
  const dates = new Map(termsIn(year).map((ti) => [ti.index, ti.at]));
  const [open, setOpen] = useState<number | null>(null);
  const curSeason = seasonOfTerm(cur);
  const [sx, sy] = pt(sunLon, R);

  return (
    <section class="alm-card alm-wheel" aria-labelledby="alm-wheel-h">
      <h2 id="alm-wheel-h" class="alm-h">
        <span>{t('岁时轮', 'The year wheel')}</span>
        <span class="alm-h-sub">{t('太阳每行十五度，为一节气', 'a term for every 15° of the sun’s path')}</span>
      </h2>
      <svg class="alm-wheel-svg" viewBox="-200 -200 400 400" role="group" aria-label={t('二十四节气圆图', 'Wheel of the 24 solar terms')}>
        <circle class="alm-wh-ring" r={R} />
        <circle class="alm-wh-ring-in" r={R - 60} />
        {SEASONS.map((s, k) => (
          <path class={`alm-wh-season${s === curSeason ? ' is-current' : ''}`} d={brushArc(315 + 90 * k + 3, 315 + 90 * (k + 1) - 3, R - 11, 7, 17 + k * 7)} />
        ))}
        {SEASONS.map((s, k) => {
          const [x, y] = pt(315 + 90 * k + 45, R - 84);
          return (
            <g class={`alm-wh-season-name${s === curSeason ? ' is-current' : ''}`} aria-hidden="true">
              <text class="brush" x={f(x)} y={f(en ? y - 5 : y)} text-anchor="middle" dominant-baseline="central">{SEASON_ZH[s]}</text>
              {en && <text class="alm-wh-season-en" x={f(x)} y={f(y + 15)} text-anchor="middle" dominant-baseline="central">{SEASON_EN[s]}</text>}
            </g>
          );
        })}
        {TERMS.map((term, i) => {
          const lon = (315 + 15 * i) % 360;
          const [t1x, t1y] = pt(lon, R - (MAJOR.has(i) ? 9 : 5));
          const [t2x, t2y] = pt(lon, R + (MAJOR.has(i) ? 9 : 5));
          // side labels sit a little further out, clear of the sun dot
          const [lx, ly] = pt(lon, R + (en ? 27 : 24) + (en ? 14 : 9) * Math.abs(Math.sin(rad(screen(lon)))));
          const [dx, dy] = pt(lon, R - 34);
          const at = dates.get(i);
          const md = at ? chinaMD(at) : null;
          const isCur = i === cur;
          const label = en ? `${term.en} ${term.zh}${md ? `, ${MONTH_EN[md.m - 1]} ${md.d}` : ''}` : `${term.zh}${md ? `，${md.m}月${md.d}日` : ''}`;
          return (
            <g
              class={`alm-wh-term${isCur ? ' is-current' : ''}${MAJOR.has(i) ? ' is-major' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(i))}
            >
              <line class="alm-wh-tick" x1={f(t1x)} y1={f(t1y)} x2={f(t2x)} y2={f(t2y)} />
              <title>{en ? `${term.en} · ${term.pinyin}` : `${term.zh} · ${term.en}`}</title>
              <circle class="alm-wh-hit" cx={f(lx)} cy={f(ly)} r="23.5" />
              <text class="alm-wh-label" x={f(lx)} y={f(en ? ly - 5 : ly)} text-anchor="middle" dominant-baseline="central">{term.zh}</text>
              {en && (
                <text class="alm-wh-py" x={f(lx)} y={f(ly + 10)} text-anchor="middle" dominant-baseline="central">{term.pinyin}</text>
              )}
              {md && (
                <text class="alm-wh-date" x={f(dx)} y={f(dy)} text-anchor="middle" dominant-baseline="central">
                  {md.m}/{md.d}
                </text>
              )}
            </g>
          );
        })}
        <circle class="alm-wh-sun-halo" cx={f(sx)} cy={f(sy)} r="10" />
        <circle class="alm-wh-sun" cx={f(sx)} cy={f(sy)} r="6" />
        <text class="alm-wh-year brush" x="0" y="-8" text-anchor="middle" dominant-baseline="central">{props.yearGanZhi}</text>
        <text class="alm-wh-year-sub" x="0" y="26" text-anchor="middle" dominant-baseline="central">
          {en ? `Year of the ${props.zodiacEn}` : `${props.zodiac}年 · ${year}`}
        </text>
      </svg>
      <p class="alm-wheel-cap">
        {en ? (
          <span class="latin">
            The sun is in <b>{TERMS[cur].en}</b> ({SEASON_EN[curSeason].toLowerCase()}) — tap a term to read about it.
          </span>
        ) : (
          <>太阳行至<b>{TERMS[cur].zh}</b>。轻点节气，可读其候。</>
        )}
      </p>
      <TermSheet index={open} onClose={() => setOpen(null)} at={open !== null ? dates.get(open) : undefined} />
    </section>
  );
}

function TermSheet(props: { index: number | null; at?: Date; onClose: () => void }) {
  const t = useT();
  const en = lang.value === 'en';
  if (props.index === null) return null;
  const term = TERMS[props.index];
  const md = props.at ? chinaMD(props.at) : null;
  return (
    <Sheet open onClose={props.onClose} title={term.zh} label={en ? term.en : term.zh}>
      <div class="alm-termsheet">
        <p class="alm-ts-en latin">
          <span class="alm-ts-pinyin">{term.pinyin}</span> {term.en}
        </p>
        {md && <p class="alm-ts-when">{en ? `This year: ${MONTH_EN[md.m - 1]} ${md.d}, ${md.hh} China time` : <Nums>{`今年 ${md.m}月${md.d}日 ${md.hh} 交节`}</Nums>}</p>}
        {(term.blurbZh || term.blurbEn) && (
          <div class="alm-ts-blurb">
            <p>{en ? <span class="latin">{term.blurbEn}</span> : term.blurbZh}</p>
            {en && <p class="alm-ts-blurb-b"><span lang="zh-CN">{term.blurbZh}</span></p>}
          </div>
        )}
        <ol class="alm-ts-pentads">
          {term.pentads.map((p, k) => (
            <li>
              <span class="alm-ts-ord">{t(['初候', '二候', '三候'][k] ?? '', ['First', 'Second', 'Third'][k] ?? '')}</span>
              <span class="alm-ts-zh">{en ? <span class="latin">{p.en}</span> : p.zh}</span>
              {en && <span class="alm-ts-pen" lang="zh-CN">{p.zh}</span>}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
