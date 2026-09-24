// 今日 · 本周 — a row of painted incense sticks for the last seven days, and today's sessions.
import { lang, state, today } from '../../app/store';
import { useT } from '../../app/i18n';
import { weekday } from '../../core/date';
import { hashString, makeRng } from '../../core/rng';
import type { FocusSession } from '../../core/types';
import { clockOf, formatMinutes, recentDays, sessionsOn, type DaySummary } from './stats';

const WD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const COL = 44, TOP = 10, BASE = 104, VB_H = 132, MAX_STICKS = 5;

/** One hand-painted incense stick as a tapered, slightly bowed polygon. */
function stickPath(x: number, h: number, lean: number, seed: number, base = BASE): string {
  const rng = makeRng(seed);
  const BASE_ = base;
  const topX = x + lean, topY = BASE_ - h;
  const bow = rng.range(-1.1, 1.1);
  const w0 = rng.range(1.5, 1.8), w1 = rng.range(0.8, 1.0);
  const mx = (x + topX) / 2 + bow, my = (BASE_ + topY) / 2;
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(x - w0)} ${BASE_}`,
    `Q${f(mx - (w0 + w1) / 2)} ${f(my)} ${f(topX - w1)} ${f(topY + 0.6)}`,
    `Q${f(topX)} ${f(topY - 1)} ${f(topX + w1)} ${f(topY + 0.6)}`,
    `Q${f(mx + (w0 + w1) / 2)} ${f(my)} ${f(x + w0)} ${BASE_}`,
    'Z',
  ].join(' ');
}

function DaySticks(props: { d: DaySummary; i: number; scale: number; isToday: boolean }) {
  const { d, i, scale } = props;
  const cx = COL / 2 + i * COL;
  const shown = d.sessions.slice(-MAX_STICKS);
  const n = shown.length;
  const spread = Math.min(5, 14 / Math.max(1, n - 1));
  const rng = makeRng(hashString(d.day));
  const ashW = 10 + Math.min(n, 4) * 3;
  return (
    <g>
      {/* the little bed of ash the sticks stand in */}
      <path
        d={`M${cx - ashW / 2} ${BASE + 1.5} Q${cx} ${BASE - 0.5 + rng.range(-0.6, 0.6)} ${cx + ashW / 2} ${BASE + 1.2} Q${cx} ${BASE + 3.6} ${cx - ashW / 2} ${BASE + 1.5}Z`}
        class="fx-ash"
        opacity={n ? 0.55 : 0.22}
      />
      {shown.map((s, k) => {
        const off = n > 1 ? (k - (n - 1) / 2) * spread : 0;
        const h = Math.max(10, (Math.min(s.minutes, scale) / scale) * (BASE - TOP - 6));
        const lean = off * 0.35 + rng.range(-1.2, 1.2);
        return (
          <g class={s.completed ? 'fx-stick' : 'fx-stick is-out'}>
            <path d={stickPath(cx + off, h, lean, hashString(String(s.start)))} fill="url(#fx-stick-ink)" />
            {/* a crumb of pale ash where it burned down to */}
            {s.completed && <ellipse cx={cx + off + lean} cy={BASE - h + 0.6} rx="1.5" ry="2.1" class="fx-ash-tip" />}
          </g>
        );
      })}
      {d.sessions.length > MAX_STICKS && (
        <text x={cx} y={TOP - 1} class="fx-more" text-anchor="middle">+{d.sessions.length - MAX_STICKS}</text>
      )}
    </g>
  );
}

export function History() {
  const t = useT();
  const zh = lang.value === 'zh';
  const td = today.value;
  const focus = state.value.focus;
  const days = recentDays(focus, td, 7);
  const todays = sessionsOn(focus, td);
  const todayDone = days[6];
  const weekMin = days.reduce((a, d) => a + d.minutes, 0);
  const weekCount = days.reduce((a, d) => a + d.count, 0);
  const scale = Math.max(60, ...days.flatMap((d) => d.sessions.map((s) => s.minutes)));
  const summary = zh
    ? `近七日共燃 ${weekCount} 炷，${formatMinutes(weekMin, true)}`
    : `${weekCount} stick${weekCount === 1 ? '' : 's'} in the last seven days, ${formatMinutes(weekMin, false)}`;

  return (
    <div class="fx-hist">
      <h2 class="section-title">
        <span>{t('近七日', 'This week')}</span>
        <span class="spacer" />
        <span class="fx-hist-total num">{formatMinutes(weekMin, zh)}</span>
      </h2>
      <figure class="fx-week">
        <svg viewBox={`0 0 ${COL * 7} ${VB_H}`} role="img" aria-label={summary}>
          <defs>
            <linearGradient id="fx-stick-ink" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stop-color="currentColor" stop-opacity="0.95" />
              <stop offset="0.7" stop-color="currentColor" stop-opacity="0.78" />
              <stop offset="1" stop-color="currentColor" stop-opacity="0.5" />
            </linearGradient>
          </defs>
          {days.map((d, i) => (
            <DaySticks d={d} i={i} scale={scale} isToday={i === 6} />
          ))}
          {days.map((d, i) => (
            <text
              x={COL / 2 + i * COL}
              y={VB_H - 6}
              text-anchor="middle"
              class={'fx-wd' + (i === 6 ? ' is-today' : '')}
            >
              {(zh ? WD_ZH : WD_EN)[weekday(d.day)]}
            </text>
          ))}
          <circle cx={COL / 2 + 6 * COL} cy={VB_H - 1.5} r="1.6" class="fx-today-dot" />
        </svg>
      </figure>

      <h2 class="section-title">
        <span>{t('今日', 'Today')}</span>
        <span class="spacer" />
        <span class="fx-hist-total">
          {todayDone.count
            ? t(`已燃 ${todayDone.count} 炷 · ${todayDone.minutes} 分钟`, `${todayDone.count} stick${todayDone.count === 1 ? '' : 's'} · ${todayDone.minutes} min`)
            : ''}
        </span>
      </h2>
      {todays.length === 0 ? (
        <p class="fx-empty">{t('今日尚未燃香。', 'No incense yet today.')}</p>
      ) : (
        <ul class="fx-list">
          {todays.slice().reverse().map((s) => <SessionRow s={s} />)}
        </ul>
      )}
    </div>
  );
}

function SessionRow({ s }: { s: FocusSession }) {
  const t = useT();
  return (
    <li class={'fx-row' + (s.completed ? '' : ' is-out')}>
      <span class="fx-row-time num">{clockOf(s.start)}</span>
      <span class="fx-row-main">
        <span class="fx-row-intent">{s.intent || t('静心', 'Quiet focus')}</span>
        <span class="fx-row-sub">
          {s.minutes} {t('分钟', 'min')} · {s.completed ? t('燃尽', 'burned through') : t('中途熄灭', 'put out early')}
        </span>
      </span>
      <svg class="fx-row-mark" viewBox="0 0 12 28" aria-hidden="true">
        <path d={stickPath(6, s.completed ? 22 : 11, 0.6, hashString(String(s.start)), 26)} />
      </svg>
    </li>
  );
}
