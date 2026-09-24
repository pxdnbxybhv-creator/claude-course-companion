// One day, opened from the calendar: its full lunar date, term & pentad, festivals, moon,
// 宜/忌 — and what the user did that day.
import type { DateKey } from '../../core/types';
import { cnNumber, diffDays } from '../../core/date';
import { termContext } from '../../core/solarterms';
import { moonInfo } from '../../core/astro';
import { TERMS } from '../../data/terms';
import { almanacFor } from '../../data/almanac';
import { Sheet, PlantGlyph } from '../../ui/kit';
import { useT } from '../../app/i18n';
import { lang, state } from '../../app/store';
import { dayDate, dayInfo, lunarEn, MONTH_EN, WEEK_EN, WEEK_ZH } from './model';
import { Festivals, MoonCanvas } from './Today';
import { YiJiList } from './YiJi';

const PENTAD_ZH = ['初候', '二候', '三候'];

export function DaySheet(props: { dayKey: DateKey | null; todayKey: DateKey; onClose: () => void }) {
  const t = useT();
  const en = lang.value === 'en';
  const key = props.dayKey;
  if (!key) return null;
  const info = dayInfo(key);
  const L = info.lunar;
  const date = dayDate(key);
  const ctx = termContext(date);
  const term = TERMS[ctx.current.index];
  const pentad = term.pentads[ctx.pentad];
  const moon = moonInfo(date);
  const yj = almanacFor(key, ctx.current.index);
  const s = state.value;
  const doneHabits = s.habits.filter((h) => (s.checkins[h.id] ?? []).includes(key));
  const note = s.notes[key];
  const rel = diffDays(props.todayKey, key);
  const relText = rel === 0 ? t('今天', 'Today') : rel === 1 ? t('明天', 'Tomorrow') : rel === -1 ? t('昨天', 'Yesterday') : rel > 0 ? t(`${rel} 天后`, `in ${rel} days`) : t(`${-rel} 天前`, `${-rel} days ago`);
  const title = en ? `${WEEK_EN[info.weekday]}, ${MONTH_EN[info.m]} ${info.d}` : `${cnNumber(info.m + 1)}月${cnNumber(info.d)}日 · 星期${WEEK_ZH[info.weekday]}`;

  return (
    <Sheet open onClose={props.onClose} title={<span class={en ? 'latin alm-sheet-title-en' : ''}>{title}</span>} label={title}>
      <div class="alm-day">
        <p class="alm-day-rel">{relText} <span class="latin">· {info.y}</span></p>
        <div class="alm-day-top">
          <div class="alm-day-lunar">
            {en ? (
              <>
                <p class="alm-day-a latin">{lunarEn(L)}</p>
                <p class="alm-day-b" lang="zh-CN">{`${L.yearGanZhi}年 ${L.monthName}${L.dayName}`}</p>
              </>
            ) : (
              <>
                <p class="alm-day-a">农历 {L.yearGanZhi}年 · {L.zodiac} · {L.monthName}{L.dayName}</p>
                <p class="alm-day-b latin" lang="en">{lunarEn(L)}</p>
              </>
            )}
            <p class="alm-day-term">
              {en ? (
                <>
                  <span class="latin">{term.en}</span> <span lang="zh-CN" class="alm-day-zh">{term.zh}</span>
                  {pentad?.en && <span class="alm-day-pentad latin"> · {pentad.en}</span>}
                </>
              ) : (
                <>
                  <span class="alm-day-termname">{term.zh}</span>
                  <span class="alm-day-pentad"> · {PENTAD_ZH[ctx.pentad]} · {pentad?.zh}</span>
                </>
              )}
              {info.term !== null && <span class="alm-day-begins">{t('（交节日）', ' — begins today')}</span>}
            </p>
          </div>
          <figure class="alm-day-moon">
            <MoonCanvas phase={moon.phase} size={56} label={t(moon.zh, moon.en)} south={!!s.settings.location && s.settings.location.lat < 0} />
            <figcaption>{en ? <span class="latin">{moon.en}</span> : moon.zh}</figcaption>
          </figure>
        </div>
        <Festivals list={info.festivals} />

        <YiJiList day={yj} compact />

        <div class="alm-day-mine">
          <h3 class="alm-day-h">{t('这一天的我', 'My day')}</h3>
          {doneHabits.length > 0 && (
            <ul class="alm-day-habits">
              {doneHabits.map((h) => (
                <li>
                  <PlantGlyph kind={h.plant} size={30} />
                  <span>{h.name}</span>
                </li>
              ))}
            </ul>
          )}
          {note && <blockquote class="alm-day-note">{note}</blockquote>}
          {!doneHabits.length && !note && (
            <p class="alm-day-empty">
              {rel > 0 ? t('尚未到来。', 'Yet to come.') : t('这一天，还是一张白纸。', 'This day is still blank paper.')}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
