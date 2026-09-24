// Where are you? — for sunrise & sunset. Geolocation (asked only on tap, with a timeout; it is
// refused inside sandboxed frames), a handful of cities, or coordinates typed by hand.
import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../../core/types';
import { Sheet, toast } from '../../ui/kit';
import { useT } from '../../app/i18n';
import { lang, setSettings, state } from '../../app/store';

type Loc = NonNullable<Settings['location']>;

export const PRESETS: { zh: string; en: string; lat: number; lon: number }[] = [
  { zh: '北京', en: 'Beijing', lat: 39.9, lon: 116.4 },
  { zh: '上海', en: 'Shanghai', lat: 31.23, lon: 121.47 },
  { zh: '广州', en: 'Guangzhou', lat: 23.13, lon: 113.26 },
  { zh: '成都', en: 'Chengdu', lat: 30.57, lon: 104.07 },
  { zh: '哈尔滨', en: 'Harbin', lat: 45.8, lon: 126.53 },
  { zh: '香港', en: 'Hong Kong', lat: 22.32, lon: 114.17 },
  { zh: '台北', en: 'Taipei', lat: 25.03, lon: 121.56 },
  { zh: '新加坡', en: 'Singapore', lat: 1.35, lon: 103.82 },
  { zh: '伦敦', en: 'London', lat: 51.51, lon: -0.13 },
  { zh: '纽约', en: 'New York', lat: 40.71, lon: -74.01 },
];

function coords(l: { lat: number; lon: number }): string {
  const ns = l.lat >= 0 ? 'N' : 'S', ew = l.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(l.lat).toFixed(2)}°${ns} ${Math.abs(l.lon).toFixed(2)}°${ew}`;
}

/** A human name for a saved location: the preset city if it is one, else coordinates. */
export function placeName(l: Settings['location'], en: boolean): string {
  if (!l) return '';
  const p = PRESETS.find((c) => c.zh === l.label || c.en === l.label);
  if (p) return en ? p.en : p.zh;
  return l.label && l.label !== 'gps' ? l.label : coords(l);
}

function locate(): Promise<Loc> {
  return new Promise((resolve, reject) => {
    try {
      const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
      if (!geo) return reject(new Error('unsupported'));
      const timer = setTimeout(() => reject(new Error('timeout')), 12_000);
      geo.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 });
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 6 * 3600_000 },
      );
    } catch (e) {
      reject(e);
    }
  });
}

export function LocationSheet(props: { open: boolean; onClose: () => void }) {
  const t = useT();
  const en = lang.value === 'en';
  const cur = state.value.settings.location;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  useEffect(() => {
    if (!props.open) return;
    setFailed(false);
    setLat(cur ? String(cur.lat) : '');
    setLon(cur ? String(cur.lon) : '');
  }, [props.open]);

  const save = (l: Loc) => {
    setSettings({ location: l });
    props.onClose();
    toast(t(`已设为 ${placeName(l, false)}`, `Location set: ${placeName(l, true)}`));
  };

  const useMine = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const l = await locate();
      save(l);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const latN = Number(lat), lonN = Number(lon);
  const valid = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180;

  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('日出日落 · 位置', 'Location')} label={t('设置位置', 'Set location')}>
      <p class="alm-loc-note">
        {t('位置只保存在本机，用于计算日出日落。', 'Stored only on this device, used for sunrise and sunset.')}
      </p>
      <button class="btn btn-primary alm-loc-gps" onClick={useMine} disabled={busy}>
        {busy ? t('定位中…', 'Locating…') : t('使用当前位置', 'Use my location')}
      </button>
      {failed && (
        <p class="alm-loc-fail" role="status">
          {t('无法获取位置 — 请选一座城市，或手动输入经纬度。', 'Could not get your location — pick a city or enter coordinates.')}
        </p>
      )}
      <p class="alm-loc-h">{t('城市', 'Cities')}</p>
      <div class="chip-row alm-loc-cities">
        {PRESETS.map((c) => (
          <button
            class="chip"
            aria-pressed={!!cur && cur.lat === c.lat && cur.lon === c.lon}
            onClick={() => save({ lat: c.lat, lon: c.lon, label: c.zh })}
          >
            {en ? c.en : c.zh}
          </button>
        ))}
      </div>
      <p class="alm-loc-h">{t('经纬度', 'Coordinates')}</p>
      <form
        class="alm-loc-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save({ lat: Math.round(latN * 100) / 100, lon: Math.round(lonN * 100) / 100 });
        }}
      >
        <label class="field">
          <span>{t('纬度（北正南负）', 'Latitude (N +, S −)')}</span>
          <input inputMode="decimal" value={lat} placeholder="31.23" onInput={(e) => setLat((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>{t('经度（东正西负）', 'Longitude (E +, W −)')}</span>
          <input inputMode="decimal" value={lon} placeholder="121.47" onInput={(e) => setLon((e.target as HTMLInputElement).value)} />
        </label>
        <button class="btn" type="submit" disabled={!valid}>{t('保存', 'Save')}</button>
      </form>
      {cur && (
        <button
          class="btn btn-ghost alm-loc-clear"
          onClick={() => {
            setSettings({ location: undefined });
            props.onClose();
          }}
        >
          {t('清除位置', 'Clear location')}
        </button>
      )}
    </Sheet>
  );
}
