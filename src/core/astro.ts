// Small astronomy helpers. STUB — contract only.

export interface MoonInfo {
  /** 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter → 1 new. */
  phase: number;
  /** Illuminated fraction 0..1. */
  illumination: number;
  zh: string; // 新月 / 峨眉月 / 上弦月 / 盈凸月 / 满月 / 亏凸月 / 下弦月 / 残月
  en: string;
}

export function moonInfo(date: Date): MoonInfo {
  void date;
  return { phase: 0.5, illumination: 1, zh: '满月', en: 'Full moon' };
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Day length in minutes (0 in polar night, 1440 in midnight sun). */
  dayLength: number;
}

export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  void lat; void lon;
  return { sunrise: null, sunset: null, solarNoon: date, dayLength: 720 };
}
