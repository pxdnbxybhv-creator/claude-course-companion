// 开篇 · the gate (Builder I, spec §12): who sees the film, the seen flag when storage throws, the
// URL flags, the sub-hint, RING, the App's music theme while the film is on, the cut choice from a
// measurement, and the limb match's geometry (MOON_GATE).
import { readFileSync, existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MOON_GATE, RING, SLOW_MS_PER_MPX, appTheme, chooseCut, decideIntro, endIntro, existingUser, gardenTargets, gateSubHint, initIntro,
  intro, introOn, introToast, loadFilm, markSeen, parseIntroParam, readSeen, stripIntro, _resetSeenForTests, type GateInput,
} from '../src/app/intro';
import type { Route } from '../src/app/router';
import { emptyState, state } from '../src/app/store';

const G = globalThis as Record<string, unknown>;
const saved: Record<string, PropertyDescriptor | undefined> = {};
function stub(name: string, value: unknown): void {
  if (!(name in saved)) saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  };
}

beforeEach(() => {
  _resetSeenForTests();
  state.value = emptyState();
});
afterEach(() => {
  for (const [k, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete G[k];
    delete saved[k];
  }
  endIntro();
  introToast.value = false;
  _resetSeenForTests();
});

const fresh: GateInput = { seen: null, onboarded: false, hasData: false, route: 'garden', intro: null, webdriver: false };

describe('decideIntro: every row of §9.1', () => {
  it('a fresh visitor on the garden sees it', () => {
    expect(decideIntro(fresh)).toBe('first');
  });
  it('?intro=0 turns it off, even for a fresh visitor', () => {
    expect(decideIntro({ ...fresh, intro: '0' })).toBe(null);
  });
  it('?intro=1 forces it, over webdriver, the flag, an existing user and another route', () => {
    expect(decideIntro({ seen: '1', onboarded: true, hasData: true, route: 'walk', intro: '1', webdriver: true })).toBe('url');
  });
  it('webdriver (Playwright, snap, QA) keeps it off', () => {
    expect(decideIntro({ ...fresh, webdriver: true })).toBe(null);
    expect(existingUser({ ...fresh, webdriver: true, onboarded: true })).toBe(false);
  });
  it('the seen flag keeps it off', () => {
    expect(decideIntro({ ...fresh, seen: '1' })).toBe(null);
  });
  it('existing users (onboarded, or with data, or a demo) never see it, and are marked seen with one toast', () => {
    for (const i of [{ ...fresh, onboarded: true }, { ...fresh, hasData: true }]) {
      expect(decideIntro(i)).toBe(null);
      expect(existingUser(i)).toBe(true);
      expect(existingUser({ ...i, seen: '1' })).toBe(false);
      expect(existingUser({ ...i, intro: '0' })).toBe(false);
    }
  });
  it('a shared deep link does not play it, and does not mark it seen', () => {
    for (const r of ['walk', 'focus', 'settings', 'mirror']) {
      expect(decideIntro({ ...fresh, route: r })).toBe(null);
      expect(existingUser({ ...fresh, route: r })).toBe(false);
    }
  });
});

describe('the seen flag survives storage that throws', () => {
  it('writes and reads banmu.intro when storage works', () => {
    const ls = memStorage();
    stub('window', { localStorage: ls });
    expect(readSeen()).toBe(null);
    markSeen();
    expect(ls.getItem('banmu.intro')).toBe('1');
    _resetSeenForTests();
    expect(readSeen()).toBe('1');
  });
  it('a throwing localStorage getter (an opaque-origin sandbox): memory holds it, no second auto-play', () => {
    const w = {};
    Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
    stub('window', w);
    expect(readSeen()).toBe(null);
    expect(() => markSeen()).not.toThrow();
    expect(readSeen()).toBe('1');
    expect(decideIntro({ ...fresh, seen: readSeen() })).toBe(null);
  });
  it('a throwing setItem (a full or blocked store): memory holds it', () => {
    stub('window', { localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } } });
    expect(() => markSeen()).not.toThrow();
    expect(readSeen()).toBe('1');
  });
});

describe('?intro=0 / ?intro=1', () => {
  it('parses and strips the flag, keeping the rest of the query', () => {
    expect(parseIntroParam('?intro=1&demo=1')).toBe('1');
    expect(parseIntroParam('?intro=0')).toBe('0');
    expect(parseIntroParam('?intro=2')).toBe(null);
    expect(parseIntroParam('')).toBe(null);
    expect(stripIntro('?intro=1&hour=21')).toBe('?hour=21');
    expect(stripIntro('?intro=0')).toBe('');
  });

  function browser(search: string, replace: (u: string) => void, webdriver = false) {
    stub('window', { localStorage: memStorage() });
    stub('location', { search, pathname: '/app/', hash: '#garden' });
    stub('history', { state: null, replaceState: (_s: unknown, _t: string, u: string) => replace(u) });
    stub('navigator', { webdriver });
    stub('document', { documentElement: { classList: { toggle() {} } } });
  }

  it('initIntro strips ?intro=1 and starts the card (webdriver or not)', () => {
    const urls: string[] = [];
    browser('?intro=1&hour=21', (u) => urls.push(u), true);
    initIntro();
    expect(urls).toEqual(['/app/?hour=21#garden']);
    expect(intro.value.phase).toBe('title');
    expect(intro.value.from).toBe('url');
    expect(introOn.value).toBe(true);
  });
  it('a throwing history.replaceState does not stop the gate', () => {
    browser('?intro=1', () => { throw new Error('SecurityError'); });
    expect(() => initIntro()).not.toThrow();
    expect(introOn.value).toBe(true);
  });
  it('?intro=0 keeps a fresh visitor out', () => {
    browser('?intro=0', () => {});
    initIntro();
    expect(introOn.value).toBe(false);
  });
  it('a fresh visitor plays; an existing user is marked seen and gets the toast', () => {
    browser('', () => {});
    initIntro();
    expect(intro.value).toMatchObject({ phase: 'title', from: 'first' });
    endIntro();
    _resetSeenForTests();
    browser('', () => {});
    state.value = { ...emptyState(), onboarded: true };
    initIntro();
    expect(introOn.value).toBe(false);
    expect(readSeen()).toBe('1');
    expect(introToast.value).toBe(true);
  });
  it('webdriver without ?intro=1 shows no card', () => {
    browser('', () => {}, true);
    initIntro();
    expect(introOn.value).toBe(false);
    expect(introToast.value).toBe(false);
  });
});

describe('the card', () => {
  it('sub-hint: 一分多钟 · 有声音, or 一分多钟 with sound and music both off', () => {
    expect(gateSubHint(true, true)).toBe('一分多钟 · 有声音');
    expect(gateSubHint(false, true)).toBe('一分多钟 · 有声音');
    expect(gateSubHint(true, false)).toBe('一分多钟 · 有声音');
    expect(gateSubHint(false, false)).toBe('一分多钟');
  });
  it('RING is the one ripple spec: the gate and the film read it', () => {
    expect(RING).toMatchObject({ n: 3, stagger: 0.18, dur: 1.2, ry: 0.36, alpha: 0.7, px: 1.4 });
    const gate = readFileSync(new URL('../src/views/intro/IntroHost.tsx', import.meta.url), 'utf8');
    expect(gate).toMatch(/RING\.(n|stagger|dur|ry|px|rx)/);
    expect(gate).not.toMatch(/0\.18|1\.2 ?\*|0\.36/); // no hard-coded copies of the spec
    const rings = new URL('../src/views/intro/paint/rings.ts', import.meta.url);
    if (existsSync(rings)) expect(readFileSync(rings, 'utf8')).toMatch(/\bRING\b/);
  });
  it('no garden registered: no targets', () => {
    expect(gardenTargets()).toBe(null);
  });
  it('the film chunk loads (the stub until Film.ts lands) and has the contract', async () => {
    const m = await loadFilm();
    expect(typeof m.prepareFilm).toBe('function');
    expect(typeof m.startFilm).toBe('function');
  }, 30_000); // a cold import of the film chunk takes seconds on a CI runner
});

describe('appTheme: no route music under the film', () => {
  const ROUTES: Route[] = ['garden', 'focus', 'almanac', 'scroll', 'settings', 'games', 'snake', 'tictactoe', 'gomoku', 'xiangqi', 'klotski', 'tangram', 'feihua', 'quests', 'walk', 'mirror'];
  it('null for every route while the film is on', () => {
    for (const r of ROUTES) for (const b of [false, true]) expect(appTheme(r, b, true)).toBe(null);
  });
  it('after it: the garden theme, the walk rule and the burning rule unchanged', () => {
    expect(appTheme('garden', false, false)).toBe('garden');
    expect(appTheme('settings', false, false)).toBe('garden');
    expect(appTheme('almanac', false, false)).toBe('garden');
    expect(appTheme('walk', false, false)).toBe('walk');
    expect(appTheme('mirror', true, false)).toBe('walk');
    expect(appTheme('garden', true, false)).toBe(null);
    expect(appTheme('focus', false, false)).toBe(null);
    for (const r of ['games', 'quests', 'snake', 'feihua'] as Route[]) expect(appTheme(r, false, false)).toBe('hall');
    expect(appTheme('games', true, false)).toBe(null);
  });
});

describe('chooseCut: from a measurement, cores only as a tie-break', () => {
  it('reduced motion → the short cut as held stills', () => {
    expect(chooseCut({ reduced: true, benchMsPerMpx: 50, cores: 16, mem: 16 })).toEqual({ cut: 'short', tier: 'still' });
  });
  it('slow paint → short/low', () => {
    expect(chooseCut({ reduced: false, benchMsPerMpx: SLOW_MS_PER_MPX + 1, cores: 8, mem: 8 })).toEqual({ cut: 'short', tier: 'low' });
  });
  it('an iPhone (bench 180, cores 4, no deviceMemory) → full/high', () => {
    expect(chooseCut({ reduced: false, benchMsPerMpx: 180, cores: 4, mem: null })).toEqual({ cut: 'full', tier: 'high' });
  });
  it('a cheap 8-core Android that measures slow (600, mem 3) → short/low', () => {
    expect(chooseCut({ reduced: false, benchMsPerMpx: 600, cores: 8, mem: 3 })).toEqual({ cut: 'short', tier: 'low' });
  });
  it('within 15 % under the threshold the mirror\'s thresholds decide', () => {
    const near = SLOW_MS_PER_MPX * 0.9;
    expect(chooseCut({ reduced: false, benchMsPerMpx: near, cores: 2, mem: null }).cut).toBe('short');
    expect(chooseCut({ reduced: false, benchMsPerMpx: near, cores: 8, mem: 2 }).cut).toBe('short');
    expect(chooseCut({ reduced: false, benchMsPerMpx: near, cores: 4, mem: 4 }).cut).toBe('full');
    expect(chooseCut({ reduced: false, benchMsPerMpx: SLOW_MS_PER_MPX * 0.8, cores: 2, mem: 1 }).cut).toBe('full');
  });
  it('no measurement: the tie-break alone', () => {
    expect(chooseCut({ reduced: false, benchMsPerMpx: null, cores: 2, mem: null })).toEqual({ cut: 'short', tier: 'low' });
    expect(chooseCut({ reduced: false, benchMsPerMpx: null, cores: 4, mem: null })).toEqual({ cut: 'full', tier: 'high' });
  });
});

describe('MOON_GATE: the limb becomes the rim', () => {
  const sizes: [string, number, number][] = [['P', 390, 844], ['L', 1280, 800], ['P small', 320, 568], ['short L', 844, 390], ['square', 800, 800]];
  it('scale runs 1 → S over 3.5–4.3', () => {
    expect(MOON_GATE.scale(0)).toBe(1);
    expect(MOON_GATE.scale(3.5)).toBe(1);
    expect(MOON_GATE.scale(4.3)).toBeCloseTo(MOON_GATE.S, 9);
    expect(MOON_GATE.scale(9)).toBeCloseTo(MOON_GATE.S, 9);
    for (let t = 3.5; t < 4.3; t += 0.05) expect(MOON_GATE.scale(t + 0.05)).toBeGreaterThanOrEqual(MOON_GATE.scale(t));
  });
  it('the P and L gates match the spec, and origin() agrees with at()', () => {
    const p = MOON_GATE.at(390, 844), l = MOON_GATE.at(1280, 800);
    expect(p.x / 390).toBeCloseTo(0.57, 9);
    expect(p.r / 390).toBeCloseTo(0.15, 9);
    expect(l.y / 800).toBeCloseTo(0.42, 9);
    expect(l.r / 800).toBeCloseTo(0.12, 9);
    expect(MOON_GATE.origin(MOON_GATE.P, 390, 844).y).toBeCloseTo(p.oy, 6);
    expect(MOON_GATE.origin(MOON_GATE.L, 1280, 800).y).toBeCloseTo(l.oy, 6);
    // the origin sits below the centre (P ≈ cy + 2.6 r, L ≈ cy + 2.2 r), so the disc grows upward
    expect((p.oy - p.y) / p.r).toBeCloseTo(2.6, 1);
    expect((l.oy - l.y) / l.r).toBeCloseTo(2.2, 1);
  });
  it('at 4.3 the lower limb lies on rimY, and the rim circle passes through (cx, rimY)', () => {
    for (const [, w, h] of sizes) {
      const g = MOON_GATE.at(w, h), S = MOON_GATE.scale(4.3);
      const limb = g.oy + S * (g.y + g.r - g.oy);
      expect(limb).toBeCloseTo(g.rimY, 6);
      const rim = MOON_GATE.rim(w, h);
      expect(rim.x).toBeCloseTo(g.x, 9);
      expect(rim.y + rim.r).toBeCloseTo(g.rimY, 6);
      const cy = g.oy + S * (g.y - g.oy);
      expect(cy).toBeCloseTo(rim.y, 6);
      expect(S * g.r).toBeCloseTo(rim.r, 6);
    }
  });
  it('the white never covers more than 40 % of the frame during the limb match', () => {
    for (const [, w, h] of sizes) {
      const g = MOON_GATE.at(w, h);
      let peak = 0;
      for (let t = 3.5; t <= 4.3001; t += 0.02) {
        const s = MOON_GATE.scale(t), R = s * g.r, cy = g.oy + s * (g.y - g.oy), cx = g.x;
        let area = 0;
        for (let y = 0.5; y < h; y += 1) {
          const d = y - cy;
          if (Math.abs(d) >= R) continue;
          const hw = Math.sqrt(R * R - d * d);
          area += Math.max(0, Math.min(w, cx + hw) - Math.max(0, cx - hw));
        }
        peak = Math.max(peak, area / (w * h));
      }
      expect(peak).toBeLessThanOrEqual(0.4);
    }
  });
});
