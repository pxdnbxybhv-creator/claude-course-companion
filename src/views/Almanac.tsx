// 时令 · Almanac — the solar term and its pentads, today in two calendars, the moon, 宜/忌,
// a poem for the season, the month, and the year's wheel of 24 terms.
import { useT } from '../app/i18n';
import { lang, today } from '../app/store';
import { termContext } from '../core/solarterms';
import { cnYearDigits } from '../core/date';
import { Hero } from './almanac/Hero';
import { Today } from './almanac/Today';
import { YiJi } from './almanac/YiJi';
import { Poem } from './almanac/Poem';
import { MonthCalendar } from './almanac/MonthCalendar';
import { YearWheel } from './almanac/YearWheel';
import { dayDate, dayInfo } from './almanac/model';
import { useMedia } from './almanac/hooks';
import { InkDivider } from '../ui/kit';
import './almanac/almanac.css';

export function AlmanacView() {
  const t = useT();
  const en = lang.value === 'en';
  const key = today.value;
  const now = new Date();
  const ctx = termContext(dayDate(key));
  const info = dayInfo(key);
  const L = info.lunar;
  const wide = useMedia('(min-width: 960px)');

  const hero = <Hero day={dayDate(key)} ctx={ctx} />;
  const todayCard = <Today dayKey={key} now={now} />;
  const yiji = <YiJi dayKey={key} term={ctx.current.index} />;
  const poem = <Poem dayKey={key} term={ctx.current.index} />;
  const cal = <MonthCalendar todayKey={key} key={key} />;
  const wheel = <YearWheel now={now} ctx={ctx} yearGanZhi={L.yearGanZhi} zodiac={L.zodiac} zodiacEn={L.zodiacEn} />;

  return (
    <div class="alm">
      <header class="topbar alm-topbar">
        <div class="topbar-title">
          {en ? <h1 class="alm-title latin">Almanac</h1> : <h1 class="brush">时令</h1>}
          <span class="topbar-sub">
            {en ? `${info.y} · Year of the ${L.zodiacEn}` : `${cnYearDigits(info.y)} · ${L.yearGanZhi}${L.zodiac}年`}
          </span>
        </div>
      </header>
      {wide ? (
        <div class="alm-cols page-wide">
          <div class="alm-col">
            {hero}
            {yiji}
            <InkDivider />
            {cal}
          </div>
          <div class="alm-col">
            {todayCard}
            <InkDivider />
            {poem}
            <InkDivider />
            {wheel}
          </div>
        </div>
      ) : (
        <div class="alm-stack page-wide">
          {hero}
          {todayCard}
          <InkDivider />
          {yiji}
          <InkDivider />
          {poem}
          <InkDivider />
          {cal}
          <InkDivider />
          {wheel}
        </div>
      )}
      <p class="alm-foot">
        {t('农历与节气按北京时间推算', 'Lunar dates and solar terms follow China Standard Time (UTC+8)')}
      </p>
    </div>
  );
}
