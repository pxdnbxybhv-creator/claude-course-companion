import { describe, expect, it } from 'vitest';
import {
  dateFromJde, deltaT, jdeFromDate, julianDay, lunationAt, moonApparentLongitude, moonElongation, moonInfo,
  moonPhaseInstant, moonPhasesBetween, nutationLongitude, sunApparentLongitude, sunTimes,
} from '../src/core/astro';

const HOUR = 3600e3;
const DAY = 86400e3;

describe('time scales', () => {
  it('Julian Day and ΔT', () => {
    expect(julianDay(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(2451545);
    expect(julianDay(new Date(Date.UTC(1957, 9, 4, 19, 26, 24)))).toBeCloseTo(2436116.31, 6); // Meeus ex. 7.a
    expect(deltaT(2000)).toBeCloseTo(63.86, 2);
    expect(deltaT(1950)).toBeCloseTo(29.07, 2);
    expect(deltaT(1900)).toBeCloseTo(-2.79, 2);
    expect(deltaT(2026)).toBeGreaterThan(65);
    expect(deltaT(2026)).toBeLessThan(80);
    const d = new Date(Date.UTC(2026, 8, 24, 11, 13));
    expect(Math.abs(dateFromJde(jdeFromDate(d)).getTime() - d.getTime())).toBeLessThan(5);
  });
});

describe('ephemerides (Meeus, Astronomical Algorithms)', () => {
  it('nutation in longitude, ex. 22.a: 1987-04-10 0h TD → −3.788″', () => {
    expect(nutationLongitude(2446895.5) * 3600).toBeCloseTo(-3.788, 2);
  });

  it('apparent solar longitude, ex. 25.b: 1992-10-13 0h TD → 199°54′21.5″ (full VSOP87)', () => {
    const lambda = 199 + 54 / 60 + 21.55 / 3600;
    expect(Math.abs(sunApparentLongitude(2448908.5) - lambda) * 3600).toBeLessThan(0.5);
  });

  it('apparent lunar longitude, ex. 47.a: 1992-04-12 0h TD → 133.167265°', () => {
    expect(Math.abs(moonApparentLongitude(2448724.5) - 133.167265) * 3600).toBeLessThan(1);
  });
});

// US Naval Observatory, phases of the Moon 2026 (UT, to the minute): Full, Last, New, First, …
const USNO_PHASES_2026 =
  'F 01-03 10:03, L 01-10 15:48, N 01-18 19:52, Q 01-26 04:47, F 02-01 22:09, L 02-09 12:43, N 02-17 12:01, ' +
  'Q 02-24 12:27, F 03-03 11:38, L 03-11 09:38, N 03-19 01:23, Q 03-25 19:18, F 04-02 02:12, L 04-10 04:51, ' +
  'N 04-17 11:52, Q 04-24 02:32, F 05-01 17:23, L 05-09 21:10, N 05-16 20:01, Q 05-23 11:11, F 05-31 08:45, ' +
  'L 06-08 10:00, N 06-15 02:54, Q 06-21 21:55, F 06-29 23:56, L 07-07 19:29, N 07-14 09:43, Q 07-21 11:05, ' +
  'F 07-29 14:36, L 08-06 02:21, N 08-12 17:37, Q 08-20 02:46, F 08-28 04:18, L 09-04 07:51, N 09-11 03:27, ' +
  'Q 09-18 20:44, F 09-26 16:49, L 10-03 13:25, N 10-10 15:50, Q 10-18 16:12, F 10-26 04:12, L 11-01 20:28, ' +
  'N 11-09 07:02, Q 11-17 11:48, F 11-24 14:53, L 12-01 06:08, N 12-09 00:52, Q 12-17 05:42, F 12-24 01:28, ' +
  'L 12-30 18:59';

describe('moon phases', () => {
  it('match all 50 USNO phases of 2026 to the minute', () => {
    const ref = USNO_PHASES_2026.split(', ').map((s) => {
      const [k, md, hm] = s.split(' ');
      const [mo, d] = md.split('-').map(Number);
      const [h, mi] = hm.split(':').map(Number);
      return { quarter: 'NQFL'.indexOf(k), at: Date.UTC(2026, mo - 1, d, h, mi) };
    });
    const mine = moonPhasesBetween(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1)));
    expect(mine.map((e) => e.quarter)).toEqual(ref.map((r) => r.quarter));
    mine.forEach((e, i) => expect(Math.abs(e.at.getTime() - ref[i].at) / 1000, e.at.toISOString()).toBeLessThanOrEqual(60));
  });

  it('full moon of 2026-09-26 at 16:49 UT; new moon of 2000-01-06 18:14 UT (lunation 0)', () => {
    const full = moonPhaseInstant(lunationAt(new Date(Date.UTC(2026, 8, 20))), 2);
    expect(Math.abs(full.getTime() - Date.UTC(2026, 8, 26, 16, 49)) / 1000).toBeLessThan(60);
    expect(Math.abs(moonPhaseInstant(0).getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 1000).toBeLessThan(60);
  });

  it('lunationAt brackets the date by consecutive true new moons', () => {
    for (let t = Date.UTC(1990, 0, 1); t < Date.UTC(2040, 0, 1); t += 7.3 * DAY) {
      const k = lunationAt(new Date(t));
      expect(moonPhaseInstant(k).getTime()).toBeLessThanOrEqual(t);
      expect(moonPhaseInstant(k + 1).getTime()).toBeGreaterThan(t);
    }
  });

  it('elongation is 0/90/180/270° at the phase instants', () => {
    for (const q of [0, 1, 2, 3] as const) {
      const at = moonPhaseInstant(333, q);
      const e = moonElongation(jdeFromDate(at));
      expect(Math.abs(((e - q * 90 + 540) % 360) - 180)).toBeLessThan(1e-4);
    }
  });
});

describe('moonInfo', () => {
  const fullMoon = Date.UTC(2026, 8, 26, 16, 49);

  it('names the principal phase on the (local) day it happens', () => {
    const at = moonInfo(new Date(fullMoon));
    expect(at).toMatchObject({ zh: '满月', en: 'Full moon' });
    expect(at.phase).toBeCloseTo(0.5, 3);
    expect(at.illumination).toBeGreaterThan(0.999);
    // The day before / after, in any time zone, is gibbous.
    expect(moonInfo(new Date(fullMoon - 36 * HOUR))).toMatchObject({ zh: '盈凸月', en: 'Waxing gibbous' });
    expect(moonInfo(new Date(fullMoon + 36 * HOUR))).toMatchObject({ zh: '亏凸月', en: 'Waning gibbous' });
    // The name belongs to the whole local calendar day of the event.
    const d = new Date(fullMoon);
    expect(moonInfo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0)).zh).toBe('满月');
    expect(moonInfo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59)).zh).toBe('满月');
  });

  it('walks through all eight names over a lunation', () => {
    const k = 333;
    const names = [0, 1, 2, 3].flatMap((q) => {
      const at = moonPhaseInstant(k, q as 0 | 1 | 2 | 3).getTime();
      return [moonInfo(new Date(at)).zh, moonInfo(new Date(at + 3.5 * DAY)).zh];
    });
    expect(names).toEqual(['新月', '峨眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月']);
  });

  it('phase and illumination are continuous and consistent', () => {
    const newMoon = moonPhaseInstant(333).getTime();
    expect(moonInfo(new Date(newMoon)).illumination).toBeLessThan(0.001);
    const q1 = moonInfo(moonPhaseInstant(333, 1));
    expect(q1.phase).toBeCloseTo(0.25, 4);
    expect(q1.illumination).toBeCloseTo(0.5, 3);
    let prev = moonInfo(new Date(newMoon + HOUR)).phase;
    for (let t = newMoon + 2 * HOUR; t < newMoon + 29 * DAY; t += 6 * HOUR) {
      const p = moonInfo(new Date(t)).phase;
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
});

// USNO rise/set/transit, to the minute (local clock).
const SUN_CASES: { place: string; date: string; lat: number; lon: number; tz: number; rise: string; noon: string; set: string }[] = [
  { place: 'Beijing', date: '2026-06-21', lat: 39.9042, lon: 116.4074, tz: 8, rise: '04:46', noon: '12:16', set: '19:46' },
  { place: 'Beijing', date: '2026-12-21', lat: 39.9042, lon: 116.4074, tz: 8, rise: '07:32', noon: '12:12', set: '16:52' },
  { place: 'Beijing', date: '2026-03-20', lat: 39.9042, lon: 116.4074, tz: 8, rise: '06:19', noon: '12:22', set: '18:26' },
  { place: 'Beijing', date: '2026-09-24', lat: 39.9042, lon: 116.4074, tz: 8, rise: '06:03', noon: '12:07', set: '18:09' },
  { place: 'New York', date: '2026-06-21', lat: 40.7128, lon: -74.006, tz: -4, rise: '05:25', noon: '12:58', set: '20:31' },
  { place: 'Sydney', date: '2026-01-15', lat: -33.8688, lon: 151.2093, tz: 11, rise: '05:59', noon: '13:04', set: '20:09' },
  { place: 'Tromsø', date: '2026-02-10', lat: 69.6492, lon: 18.9553, tz: 0, rise: '07:39', noon: '10:58', set: '14:19' },
  { place: 'Equator', date: '2026-09-24', lat: 0, lon: -78.5, tz: 0, rise: '11:03', noon: '17:06', set: '23:09' },
];

describe('sunTimes (NOAA)', () => {
  it('is within 90 s of USNO for Beijing and elsewhere', () => {
    for (const c of SUN_CASES) {
      const [y, m, d] = c.date.split('-').map(Number);
      const s = sunTimes(new Date(y, m - 1, d), c.lat, c.lon);
      const at = (hm: string) => {
        const [h, mi] = hm.split(':').map(Number);
        return Date.UTC(y, m - 1, d, h - c.tz, mi);
      };
      const off = (a: Date | null, hm: string) => Math.abs(a!.getTime() - at(hm)) / 1000;
      expect(off(s.sunrise, c.rise), `${c.place} ${c.date} rise`).toBeLessThanOrEqual(90);
      expect(off(s.solarNoon, c.noon), `${c.place} ${c.date} noon`).toBeLessThanOrEqual(90);
      expect(off(s.sunset, c.set), `${c.place} ${c.date} set`).toBeLessThanOrEqual(90);
      expect(Math.abs(s.dayLength - (at(c.set) - at(c.rise)) / 60000)).toBeLessThanOrEqual(2);
    }
  });

  it('polar day and polar night', () => {
    const day = sunTimes(new Date(2026, 5, 21), 69.6492, 18.9553);
    expect(day).toMatchObject({ sunrise: null, sunset: null, dayLength: 1440 });
    const night = sunTimes(new Date(2026, 11, 21), 69.6492, 18.9553);
    expect(night).toMatchObject({ sunrise: null, sunset: null, dayLength: 0 });
    expect(night.solarNoon).toBeInstanceOf(Date);
    expect(sunTimes(new Date(2026, 5, 21), -78, 166).dayLength).toBe(0);
  });

  it('reads only the calendar day of `date`, not its time', () => {
    const a = sunTimes(new Date(2026, 8, 24, 0, 1), 39.9042, 116.4074);
    const b = sunTimes(new Date(2026, 8, 24, 23, 59), 39.9042, 116.4074);
    expect(a).toEqual(b);
    // sunrise < noon < sunset, all on the place's own date
    expect(a.sunrise!.getTime()).toBeLessThan(a.solarNoon.getTime());
    expect(a.solarNoon.getTime()).toBeLessThan(a.sunset!.getTime());
    expect(new Date(a.solarNoon.getTime() + 8 * HOUR).getUTCDate()).toBe(24);
  });
});
