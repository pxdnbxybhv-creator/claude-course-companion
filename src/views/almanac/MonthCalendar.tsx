// Month calendar: Gregorian numerals with the lunar day / solar term / festival beneath, an ink
// ensō around today, ink dots for days with finished habits. Swipe or use the arrows; tap a day.
import { useMemo, useRef, useState, useLayoutEffect } from 'preact/hooks';
import type { DateKey } from '../../core/types';
import { fromKey } from '../../core/date';
import { TERMS } from '../../data/terms';
import { useT } from '../../app/i18n';
import { lang, state } from '../../app/store';
import { cellLabel, monthGrid, MONTH_EN, MONTH_ZH, WEEK_EN, WEEK_ZH, lunarZh, lunarEn, type DayInfo } from './model';
import { ensoPath } from './paint';
import { DaySheet } from './DaySheet';

const ENSO = ensoPath(7);
const termName = (i: number) => TERMS[i];

/** day → number of habits completed that day. */
export function useDoneCounts(): Map<DateKey, number> {
  const checkins = state.value.checkins;
  return useMemo(() => {
    const m = new Map<DateKey, number>();
    for (const days of Object.values(checkins)) for (const d of days) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  }, [checkins]);
}

export function MonthCalendar(props: { todayKey: DateKey }) {
  const t = useT();
  const en = lang.value === 'en';
  const weekStart = en ? 0 : 1;
  const today = fromKey(props.todayKey);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth(), dir: 0 });
  const [focusKey, setFocusKey] = useState<DateKey>(props.todayKey);
  const [open, setOpen] = useState<DateKey | null>(null);
  const done = useDoneCounts();
  const habitCount = Math.max(1, state.value.habits.filter((h) => !h.archived).length);
  const grid = monthGrid(ym.y, ym.m, weekStart);
  const tableRef = useRef<HTMLTableElement>(null);
  const wantFocus = useRef(false);

  // keep the roving focus inside the shown month
  const inMonth = grid.days.some((d) => d.key === focusKey);
  const rovingKey = inMonth ? focusKey : (grid.days.find((d) => d.key === props.todayKey) ?? grid.days[0]).key;

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-key="${rovingKey}"]`)?.focus();
  });

  const shift = (delta: number) => {
    setYm((s) => {
      const d = new Date(s.y, s.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth(), dir: delta };
    });
  };
  const isCurrent = ym.y === today.getFullYear() && ym.m === today.getMonth();

  // swipe
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // swallow the click this gesture may produce — but only briefly, or a later tap would be lost
      swiped.current = true;
      setTimeout(() => (swiped.current = false), 400);
      shift(dx < 0 ? 1 : -1);
    }
  };

  const onKey = (e: KeyboardEvent, day: DayInfo) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let target: Date | null = null;
    if (step) target = new Date(day.y, day.m, day.d + step);
    else if (e.key === 'Home') target = new Date(day.y, day.m, day.d - ((day.weekday - weekStart + 7) % 7));
    else if (e.key === 'End') target = new Date(day.y, day.m, day.d + (6 - ((day.weekday - weekStart + 7) % 7)));
    else if (e.key === 'PageUp') target = new Date(day.y, day.m - 1, Math.min(day.d, 28));
    else if (e.key === 'PageDown') target = new Date(day.y, day.m + 1, Math.min(day.d, 28));
    if (!target) return;
    e.preventDefault();
    const k = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    if (target.getMonth() !== ym.m || target.getFullYear() !== ym.y) {
      setYm({ y: target.getFullYear(), m: target.getMonth(), dir: target > new Date(ym.y, ym.m, 1) ? 1 : -1 });
    }
    setFocusKey(k);
    wantFocus.current = true;
  };

  const first = grid.days[0].lunar, last = grid.days[grid.days.length - 1].lunar;
  const lunarSpan = first.monthName === last.monthName ? first.monthName : `${first.monthName} – ${last.monthName}`;
  const notable = grid.days.filter((d) => d.term !== null || d.festivals.length);
  const heads = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const titleId = `alm-cal-${ym.y}-${ym.m}`;

  return (
    <section class="alm-card alm-cal" aria-labelledby={titleId}>
      <div class="alm-cal-head">
        <h2 id={titleId} class="alm-cal-title">
          {en ? (
            <span class="latin">
              {MONTH_EN[ym.m]} <span class="alm-cal-year">{ym.y}</span>
            </span>
          ) : (
            <>
              <span class="brush">{MONTH_ZH[ym.m]}</span>
              <span class="alm-cal-year latin">{ym.y}</span>
            </>
          )}
          <span class="alm-cal-lunar">
            {en ? <span lang="zh-CN">{`${first.yearGanZhi} · ${lunarSpan}`}</span> : `农历${lunarSpan}`}
          </span>
        </h2>
        <div class="alm-cal-nav">
          {!isCurrent && (
            <button class="btn btn-ghost btn-small alm-cal-today" onClick={() => { setYm({ y: today.getFullYear(), m: today.getMonth(), dir: today > new Date(ym.y, ym.m, 1) ? 1 : -1 }); setFocusKey(props.todayKey); }}>
              {t('今日', 'Today')}
            </button>
          )}
          <button class="btn btn-ghost btn-icon" onClick={() => shift(-1)} aria-label={t('上个月', 'Previous month')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <button class="btn btn-ghost btn-icon" onClick={() => shift(1)} aria-label={t('下个月', 'Next month')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
      </div>

      <div
        class="alm-cal-swipe"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        onClickCapture={(e) => {
          if (swiped.current) {
            swiped.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <table class={`alm-cal-grid dir-${ym.dir < 0 ? 'prev' : ym.dir > 0 ? 'next' : 'none'}`} key={`${ym.y}-${ym.m}`} ref={tableRef} aria-labelledby={titleId}>
          <thead>
            <tr>
              {heads.map((w) => (
                <th scope="col" abbr={en ? WEEK_EN[w] : `星期${WEEK_ZH[w]}`} class={w === 0 || w === 6 ? 'is-weekend' : ''}>
                  {en ? WEEK_EN[w].slice(0, 3) : WEEK_ZH[w]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.weeks.map((week) => (
              <tr>
                {week.map((day) => {
                  if (!day) return <td class="is-blank" />;
                  const lab = cellLabel(day, termName);
                  const isToday = day.key === props.todayKey;
                  const n = done.get(day.key) ?? 0;
                  const weekend = day.weekday === 0 || day.weekday === 6;
                  const note = state.value.notes[day.key];
                  const aria = en
                    ? `${WEEK_EN[day.weekday]}, ${MONTH_EN[day.m]} ${day.d}. Lunar ${lunarEn(day.lunar)}.${lab.kind === 'term' || lab.kind === 'festival' ? ' ' + lab.en + '.' : ''}${n ? ` ${n} habit${n > 1 ? 's' : ''} done.` : ''}${isToday ? ' Today.' : ''}`
                    : `${day.m + 1}月${day.d}日 星期${WEEK_ZH[day.weekday]}，农历${lunarZh(day.lunar)}${lab.kind === 'term' || lab.kind === 'festival' ? '，' + lab.zh : ''}${n ? `，完成${n}项` : ''}${isToday ? '，今天' : ''}`;
                  return (
                    <td>
                      <button
                        class={`alm-cell${isToday ? ' is-today' : ''}${weekend ? ' is-weekend' : ''} lab-${lab.kind}`}
                        data-key={day.key}
                        tabIndex={day.key === rovingKey ? 0 : -1}
                        aria-label={aria}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => { setFocusKey(day.key); setOpen(day.key); }}
                        onKeyDown={(e) => onKey(e, day)}
                      >
                        {isToday && (
                          <svg class="alm-enso" viewBox="0 0 100 100" aria-hidden="true"><path d={ENSO} /></svg>
                        )}
                        <span class="alm-cell-n latin">{day.d}</span>
                        <span class="alm-cell-l" lang="zh-CN">{lab.zh}</span>
                        {(n > 0 || note) && !isToday && (
                          <span
                            class={`alm-cell-dot${!n ? ' is-note' : ''}`}
                            style={n ? { '--r': Math.min(1, n / habitCount).toFixed(2) } : undefined}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notable.length > 0 && (
        <ul class="alm-cal-legend" aria-label={t('本月节令', 'This month')}>
          {notable.map((d) => {
            const items = [
              ...(d.term !== null ? [{ zh: TERMS[d.term].zh, en: TERMS[d.term].en, term: true }] : []),
              ...d.festivals.filter((f) => d.term === null || f.zh.replace('节', '') !== TERMS[d.term].zh).map((f) => ({ zh: f.zh, en: f.en, term: false })),
            ];
            return (
              <li>
                <button class="alm-legend-item" onClick={() => setOpen(d.key)}>
                  <span class="alm-legend-d latin">{en ? `${MONTH_EN[d.m].slice(0, 3)} ${d.d}` : `${d.d}日`}</span>
                  {items.map((it) => (
                    <span class={'alm-legend-name' + (it.term ? ' is-term' : '')}>
                      {en ? <><span class="latin">{it.en}</span> <span class="alm-legend-zh" lang="zh-CN">{it.zh}</span></> : it.zh}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <DaySheet dayKey={open} todayKey={props.todayKey} onClose={() => setOpen(null)} />
    </section>
  );
}
