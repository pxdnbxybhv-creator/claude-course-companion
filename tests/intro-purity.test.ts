// 开篇 · purity (Builders A + I, spec §12): the film's pure parts (shots, beats, score, frameSpec)
// and the gate's decisions write nothing — state, play and mail stay deep-equal — and the film's
// sources reference no asset files (everything is painted and synthesised live).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { state } from '../src/app/store';
import { play } from '../src/app/play';
import { mail } from '../src/app/mail';
import { MOON_GATE, appTheme, chooseCut, decideIntro, existingUser, gateSubHint } from '../src/app/intro';

type Mod = Record<string, unknown>;
// The film's pure modules, as they land (a missing one is simply not run yet).
const PURE = import.meta.glob<Mod>(['../src/views/intro/shots.ts', '../src/views/intro/beats.ts', '../src/views/intro/score.ts']);

const snap = () => JSON.parse(JSON.stringify({ state: state.value, play: play.value, mail: mail.value }));

function exercise(m: Mod): number {
  let calls = 0;
  const call = (name: string, ...args: unknown[]) => {
    const f = m[name];
    if (typeof f !== 'function') return;
    calls++;
    (f as (...a: unknown[]) => unknown)(...args);
  };
  for (const cut of ['full', 'short']) {
    call('buildScore', cut);
    call('beatTable', cut);
    const CUTS = m.CUTS as Record<string, { end: number }> | undefined;
    const end = CUTS?.[cut]?.end ?? 86;
    if (typeof m.frameSpec === 'function') for (let t = 0; t <= end; t += 0.5) call('frameSpec', t, cut);
  }
  call('tailCue');
  call('subHint', true);
  call('subHint', false);
  for (const [w, h] of [[390, 844], [1280, 800], [844, 390], [320, 568]]) call('layoutFor', w, h);
  return calls;
}

describe('the PV writes nothing but its own flag', () => {
  it('the film\'s pure modules leave state, play and mail deep-equal', async () => {
    const before = snap();
    for (const load of Object.values(PURE)) exercise(await load());
    expect(snap()).toEqual(before);
  });
  it('the gate\'s decisions are pure too', () => {
    const before = snap();
    const i = { seen: null, onboarded: false, hasData: false, route: 'garden', intro: null, webdriver: false } as const;
    decideIntro(i);
    existingUser(i);
    chooseCut({ reduced: false, benchMsPerMpx: 200, cores: 8, mem: 8 });
    appTheme('garden', false, true);
    gateSubHint(true, true);
    for (let t = 3.5; t <= 4.3; t += 0.1) MOON_GATE.scale(t);
    MOON_GATE.at(390, 844);
    expect(snap()).toEqual(before);
  });
});

describe('no asset files: everything is painted and synthesised live', () => {
  const root = new URL('../src/views/intro/', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|css)$/.test(n)) files.push(p);
    }
  };
  walk(root);
  files.push(new URL('../src/app/intro.ts', import.meta.url).pathname);
  it('src/views/intro/** and the gate reference no image, video or audio file', () => {
    expect(files.length).toBeGreaterThan(2);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // url(#fragment) points at an inline SVG filter or gradient, not a file
      expect(src, f).not.toMatch(/url\(\s*(?!['"]?#)/);
      expect(src, f).not.toMatch(/\.(png|jpe?g|gif|webp|avif|bmp|ico|mp3|m4a|ogg|oga|wav|flac|aac|mp4|webm|mov)\b/i);
      expect(src, f).not.toMatch(/['"`][^'"`]*\.svg['"`]/i);
      expect(src, f).not.toMatch(/new Audio\(|<img\b|<video\b|<audio\b/);
    }
  });
});
