// Today: the Gregorian date in large numerals, the lunar date, festivals, the moon painted in ink,
// and sunrise / sunset when a location is known.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DateKey } from '../../core/types';
import { moonInfo, sunTimes } from '../../core/astro';
import { useT } from '../../app/i18n';
import { lang, state } from '../../app/store';
import { paintMoon } from './paint';
import { dayDate, dayInfo, hhmm, lunarEn, lunarZh, MONTH_EN, MONTH_ZH, WEEK_EN, WEEK_ZH } from './model';
import { dpr, useDark } from './hooks';
import { LocationSheet, placeName, presetZone } from './LocationSheet';

export function MoonCanvas(props: { phase: number; size: number; south?: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useDark();
  useEffect(() => {
    if (ref.current) paintMoon(ref.current, { phase: props.phase, size: props.size, dpr: dpr(), dark, south: props.south });
  }, [props.phase, props.size, dark, props.south]);
  return <canvas ref={ref} class="alm-moon-cv" style={{ width: props.size, height: props.size }} role="img" aria-label={props.label} />;
}

export function Festivals(props: { list: { zh: string; en: string }[] }) {
  const en = lang.value === 'en';
  if (!props.list.length) return null;
  return (
    <ul class="alm-fests" aria-label={en ? 'Festivals' : '节日'}>
      {props.list.map((f) => (
        <li class="alm-tag">
          {en ? (
            <>
              <span class="latin">{f.en}</span> <span class="alm-tag-zh" lang="zh-CN">{f.zh}</span>
            </>
          ) : (
            f.zh
          )}
        </li>
      ))}
    </ul>
  );
}

function Dur(props: { min: number; en: boolean }) {
  const h = Math.floor(props.min / 60), m = Math.round(props.min % 60);
  return (
    <>
      <span class="latin">{h}</span>
      <small>{props.en ? 'h' : '时'}</small>
      <span class="latin">{String(m).padStart(2, '0')}</span>
      <small>{props.en ? 'm' : '分'}</small>
    </>
  );
}

/** HH:MM in the preset city's own zone when known, else in the device's zone. */
function clock(d: Date, tz?: string): string {
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    } catch {
      /* unknown zone: fall through */
    }
  }
  return hhmm(d);
}

export function Today(props: { dayKey: DateKey; now: Date }) {
  const t = useT();
  const en = lang.value === 'en';
  const info = dayInfo(props.dayKey);
  const L = info.lunar;
  const moon = moonInfo(props.now);
  const loc = state.value.settings.location;
  const [sheet, setSheet] = useState(false);

  return (
    <section class="alm-today alm-card" aria-labelledby="alm-today-h">
      <h2 id="alm-today-h" class="visually-hidden">{t('今日', 'Today')}</h2>
      <div class="alm-today-top">
        <div class="alm-today-date">
          <p class="alm-month-line">
            {en ? (
              <span class="latin">{MONTH_EN[info.m]} {info.y}</span>
            ) : (
              <>
                <span>{MONTH_ZH[info.m]}</span>
                <span class="num">{info.y}</span>
              </>
            )}
          </p>
          <p class="alm-bigday">
            <span class="alm-bigday-n latin">{info.d}</span>
            <span class="alm-weekday">{en ? <span class="latin">{WEEK_EN[info.weekday]}</span> : `星期${WEEK_ZH[info.weekday]}`}</span>
          </p>
        </div>
        <figure class="alm-moon">
          <MoonCanvas phase={moon.phase} size={84} south={!!loc && loc.lat < 0} label={t(moon.zh, moon.en)} />
          <figcaption>
            <span class="alm-moon-name">{en ? <span class="latin">{moon.en}</span> : moon.zh}</span>
            <span class="alm-moon-sub latin">
              {en ? '' : moon.en + ' · '}
              {Math.round(moon.illumination * 100)}%
            </span>
          </figcaption>
        </figure>
      </div>

      <div class="alm-lunar">
        {en ? (
          <>
            <p class="alm-lunar-a latin">{lunarEn(L)}</p>
            <p class="alm-lunar-b" lang="zh-CN">{`${L.yearGanZhi}年 · ${L.zodiac} · ${lunarZh(L)}`}</p>
          </>
        ) : (
          <>
            <p class="alm-lunar-a">
              农历 {L.yearGanZhi}年 <span class="alm-dot-sep">·</span> {L.zodiac} <span class="alm-dot-sep">·</span> {lunarZh(L)}
            </p>
            <p class="alm-lunar-b latin" lang="en">{lunarEn(L)}</p>
          </>
        )}
      </div>

      <Festivals list={info.festivals} />

      <div class="alm-sun">
        {loc ? <SunLine dayKey={props.dayKey} lat={loc.lat} lon={loc.lon} onEdit={() => setSheet(true)} /> : (
          <button class="alm-locate" onClick={() => setSheet(true)}>
            <svg class="alm-locate-glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M5 16 a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M2.5 19.5 H21.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M12 4.5 V6.5 M5.2 7.6 L6.6 9 M18.8 7.6 L17.4 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span>{t('设置位置以显示日出日落', 'Set location for sunrise & sunset')}</span>
          </button>
        )}
      </div>
      <LocationSheet open={sheet} onClose={() => setSheet(false)} />
    </section>
  );
}

function SunLine(props: { dayKey: DateKey; lat: number; lon: number; onEdit: () => void }) {
  const t = useT();
  const en = lang.value === 'en';
  const s = sunTimes(dayDate(props.dayKey), props.lat, props.lon);
  const loc = state.value.settings.location;
  const polar = !s.sunrise || !s.sunset;
  const tz = presetZone(loc);
  return (
    <div class="alm-sunline">
      <dl class="alm-sun-times">
        {polar ? (
          <div>
            <dt>{t('昼夜', 'Daylight')}</dt>
            <dd>{s.dayLength >= 1440 ? t('极昼', 'Midnight sun') : t('极夜', 'Polar night')}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>{t('日出', 'Sunrise')}</dt>
              <dd class="latin">{clock(s.sunrise!, tz)}</dd>
            </div>
            <div>
              <dt>{t('日落', 'Sunset')}</dt>
              <dd class="latin">{clock(s.sunset!, tz)}</dd>
            </div>
            <div>
              <dt>{t('昼长', 'Daylight')}</dt>
              <dd class="alm-dur"><Dur min={s.dayLength} en={en} /></dd>
            </div>
          </>
        )}
      </dl>
      <button class="alm-place" onClick={props.onEdit} aria-label={t('更改位置', 'Change location')}>
        {placeName(loc, en)}
      </button>
    </div>
  );
}
