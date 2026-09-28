#!/usr/bin/env node
// 开篇 · end-to-end checks of the opening film's gate and hand-off (spec §10, §12), in headless
// Chromium. Spins up its own Vite dev server on a free port (or PORT=…).
//
//   node scripts/intro-e2e.mjs                 # the checks below
//   node scripts/intro-e2e.mjs --single        # also dist-single/index.html in a sandboxed iframe
//                                              # (run `npm run build:single` first)
//   node scripts/intro-e2e.mjs --stub          # force the stand-in film (the skip tail at 4.0 s)
//   node scripts/intro-e2e.mjs --only back,swipe
//
// SwiftShader is slow: budgets are judged loosely here and measured for the report; the real
// numbers come from a phone. Exit code 1 when a check fails.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, rmSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const SINGLE = argv.includes('--single');
const STUB = argv.includes('--stub');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;

const cacheDir = join(tmpdir(), `banmu-vite-e2e-${process.pid}`);
const server = await createServer({ root: ROOT, logLevel: 'error', cacheDir, server: { port: Number(process.env.PORT) || 0, host: '127.0.0.1', hmr: false, watch: null }, clearScreen: false });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

try { (await import('node:fs')).mkdirSync(join(tmpdir(), 'pv-I', 'shots'), { recursive: true }); } catch { /* ignore */ }
let failed = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
  console.log(results[results.length - 1]);
}

/** Instrumentation, before any app code: audio contexts and source starts, a wake-lock stub, marks. */
const INIT = `(() => {
  ${STUB ? 'window.__introStub = true;' : ''}
  const W = window;
  W.__ctxs = []; W.__starts = []; W.__wake = [];
  const AC = W.AudioContext;
  if (AC) W.AudioContext = class extends AC { constructor(...a) { super(...a); W.__ctxs.push(this); } };
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.length > 1) W.__starts.push(performance.now()); return st.apply(this, a); };
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request(type) {
      W.__wake.push('request:' + type);
      return Promise.resolve({ release() { W.__wake.push('release'); return Promise.resolve(); }, addEventListener() {} });
    } } });
  } catch {}
  addEventListener('pointerdown', (e) => { W.__down = performance.now(); }, true);
  addEventListener('click', (e) => { if (e.target && e.target.classList && e.target.classList.contains('intro-start')) W.__click = performance.now(); }, true);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('intro-ring') && !W.__ring) W.__ring = performance.now(); })
    .observe(document, { childList: true, subtree: true });
})();`;

async function fresh(o = {}) {
  const ctx = await browser.newContext({
    viewport: { width: o.w ?? 390, height: o.h ?? 844 }, deviceScaleFactor: 1, locale: 'zh-CN', hasTouch: o.touch ?? true,
    reducedMotion: o.reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(INIT);
  if (o.seed) await ctx.addInitScript(o.seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  if (o.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu }); }
  return { ctx, page, errors, requests };
}
const on = (page) => page.evaluate(() => !!document.querySelector('.intro-film'));
const phase = (page) => page.evaluate(() => document.querySelector('.intro-film') ? (document.documentElement.classList.contains('intro-on') ? 'on' : 'card?') : 'off');
const waitOff = (page, ms = 30000) => page.waitForFunction(() => !document.querySelector('.intro-film'), null, { timeout: ms });
const clean = (page) => page.evaluate(() => ({
  inert: document.querySelectorAll('[inert]').length,
  html: document.documentElement.classList.contains('intro-on'),
  tabbar: getComputedStyle(document.querySelector('.tabbar')).display,
  scrollY: scrollY,
}));
async function tapStart(page) {
  await page.waitForSelector('.intro-start');
  const b = await page.locator('.intro-start').boundingBox();
  await page.tap('.intro-start', { position: { x: b.width * 0.5, y: b.height * 0.4 } });
}
const want = (k) => !only || only.includes(k);

try {
  // ---------------------------------------------------------------- who sees it
  if (want('gate')) {
    let { ctx, page } = await fresh();
    await page.goto(origin + '/#garden');
    await page.waitForSelector('.garden-canvas');
    check('webdriver without ?intro=1 shows no card', !(await on(page)));
    await ctx.close();
    ({ ctx, page } = await fresh());
    await page.goto(origin + '/?intro=0#garden');
    await page.waitForSelector('.garden-canvas');
    check('?intro=0 shows no card', !(await on(page)));
    check('?intro=0 is stripped from the URL', !page.url().includes('intro='));
    await ctx.close();
    ({ ctx, page } = await fresh());
    await page.goto(origin + '/?intro=1&hour=21#garden');
    await page.waitForSelector('.intro-film');
    check('?intro=1 shows the card and is stripped (the rest kept)', !page.url().includes('intro=') && page.url().includes('hour=21'));
    const m = await page.evaluate(() => {
      const c = performance.getEntriesByName('intro:card')[0]?.startTime, s = performance.getEntriesByName('app:shell')[0]?.startTime;
      return { card: c, shell: s, focus: document.activeElement?.className, label: document.querySelector('.intro-film')?.getAttribute('aria-label'), lang: document.querySelector('.intro-film')?.getAttribute('lang') };
    });
    // both marks are layout effects: children's run first, the App's last, so a card marked before the shell is in its commit (one paint)
    check('the card is in the same render as the shell', m.card !== undefined && m.shell !== undefined && m.card <= m.shell, `card ${m.card?.toFixed(0)} ms, shell ${m.shell?.toFixed(0)} ms after navigation start`);
    check('dialog semantics and initial focus on the start button', m.label === '开篇' && m.lang === 'zh-CN' && /intro-start/.test(m.focus ?? ''), JSON.stringify(m));
    const hint = await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.intro-hint')).opacity) > 0.5, null, { timeout: 6000 }).then(() => true, () => false);
    check('the hint appears (fonts, the held garden, the night backdrop; ≤ 3 s)', hint);
    await ctx.close();
  }

  // ---------------------------------------------------------------- the tap, sound, wake lock, the hand-off
  if (want('tap')) {
    const { ctx, page, errors, requests } = await fresh({ touch: true });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => ({ ...localStorage }));
    await tapStart(page);
    await page.waitForTimeout(600);
    const a = await page.evaluate(() => {
      const W = window;
      return {
        running: W.__ctxs.some((c) => c.state === 'running'), ring: W.__ring - W.__down, drip: (W.__starts.find((t) => t >= W.__click) ?? NaN) - W.__click,
        wake: [...W.__wake], theme: W.__banmuMusic ? W.__banmuMusic.stats().theme : 'no stats',
      };
    });
    check('touch tap unlocks audio (a running AudioContext)', a.running);
    check('ring ≤ 50 ms after pointerdown', a.ring >= 0 && a.ring <= 50, `${a.ring.toFixed(1)} ms`);
    check('a sound starts soon after the click (the drip)', Number.isFinite(a.drip) && a.drip <= 150, `${a.drip.toFixed?.(1)} ms (budget 50 ms on a phone; SwiftShader)`);
    check('wake lock requested at the click', a.wake.includes('request:screen'), a.wake.join(','));
    check('no route music under the film (music theme null)', a.theme === null, String(a.theme));
    // a long task after the click: the gate's animations are timed from the click and keep their clock
    const lt = await page.evaluate(async () => {
      const an = document.getAnimations().filter((x) => x.effect && x.effect.target && x.effect.target.closest && x.effect.target.closest('.intro-film'));
      const clock = an.find((x) => x.effect.target.classList.contains('intro-slot')) ?? an[0];
      const t0 = clock?.currentTime ?? 0, p0 = performance.now();
      while (performance.now() - p0 < 500) { /* a 500 ms long task */ }
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r()));
      return { adv: (clock?.currentTime ?? 0) - t0 - (performance.now() - p0 - 500), props: [...new Set(an.flatMap((x) => x.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))))] };
    });
    check('S1 keeps its clock through a 500 ms long task (WAAPI from the click)', lt.adv >= 480, `advanced ${Math.round(lt.adv)} ms`);
    check('S1 animates only transform and opacity (compositor)', lt.props.every((p) => ['transform', 'opacity', 'visibility'].includes(p)), lt.props.join(','));
    // swipe on the stage: nothing scrolls, nothing reloads
    const cdp = await ctx.newCDPSession(page);
    const pt = (y) => [{ x: 200, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(300) });
    for (let y = 320; y <= 700; y += 40) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('a vertical swipe leaves scrollY at 0', (await page.evaluate(() => scrollY)) === 0);
    // the takeover marks it seen
    await page.waitForFunction(() => localStorage.getItem('banmu.intro') === '1', null, { timeout: 15000 }).catch(() => {});
    check('the seen flag is written at the takeover', (await page.evaluate(() => localStorage.getItem('banmu.intro'))) === '1');
    // skip: the tail, then the Welcome
    const skip = await page.evaluate(() => { const b = document.querySelector('.intro-skip'); b?.click(); return !!b; });
    await waitOff(page, 30000).catch(() => {});
    const c = await clean(page);
    check('skip ends the film cleanly (no inert, no html.intro-on, the tab bar back)', skip && c.inert === 0 && !c.html && c.tabbar !== 'none', JSON.stringify(c));
    const after = await page.evaluate(() => ({ ...localStorage }));
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
    check('the PV writes only banmu.intro', changed.length === 1 && changed[0] === 'banmu.intro', changed.join(','));
    const w = await page.evaluate(() => (window).__wake);
    check('wake lock released at the end', w.includes('release'), w.join(','));
    const welcome = await page.waitForSelector('.welcome', { timeout: 8000 }).then(() => true, () => false);
    check('the Welcome sheet follows the film', welcome);
    check('no games chunk was fetched during the film', !requests.some((u) => /GomokuView|SnakeView/.test(u)));
    // close the Welcome → onboarded → the courier brings the 初见礼
    await page.evaluate(() => { const b = [...document.querySelectorAll('.welcome-actions button, .sheet button')].find((x) => /种下第一株/.test(x.textContent)); b?.click(); });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    const courier = await page.waitForFunction(() => /驿使送来一封信/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false);
    check('after onboarding the courier announces the 初见礼', courier);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- early skip (on the card)
  if (want('early')) {
    const { ctx, page, errors } = await fresh({ reduced: true });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(800);
    await page.click('.intro-skip');
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.intro-film')).opacity));
    check('reduced motion: the card\'s 0.6 s close still fades (WAAPI), mid-fade opacity in .3–.7', mid >= 0.3 && mid <= 0.7, mid.toFixed(2));
    await waitOff(page, 5000).catch(() => {});
    const c = await clean(page);
    const seen = await page.evaluate(() => localStorage.getItem('banmu.intro'));
    check('略过 on the card closes it, marks it seen, and the Welcome follows', c.inert === 0 && !c.html && seen === '1' && (await page.waitForSelector('.welcome', { timeout: 6000 }).then(() => true, () => false)));
    check('no console errors (early skip)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- a late or missing film chunk
  if (want('late')) {
    for (const mode of ['late', 'missing']) {
      const { ctx, page, errors } = await fresh();
      await page.route(/\/src\/views\/intro\/(Film|stub)\.ts/, async (route) => {
        if (mode === 'missing') return route.abort();
        await new Promise((r) => setTimeout(r, 7800));
        return route.continue();
      });
      await page.goto(origin + '/?intro=1#garden');
      await page.waitForSelector('.intro-film');
      await page.waitForTimeout(900);
      await tapStart(page);
      if (mode === 'late') {
        const ink = await page.waitForSelector('.intro-late', { timeout: 9000 }).then(() => true, () => false);
        const held = await page.evaluate(() => {
          const a = document.getAnimations().find((x) => x.effect?.target?.classList?.contains('intro-slot'));
          return { state: a?.playState, t: a?.currentTime };
        });
        check('a late chunk holds at 3.5 (paused, before the limb match) with 研墨…', ink && held.state === 'paused' && held.t >= 3400 && held.t < 3700, JSON.stringify(held));
        const resumed = await page.waitForFunction(() => localStorage.getItem('banmu.intro') === '1', null, { timeout: 12000 }).then(() => true, () => false);
        check('…when it arrives the film resumes from 3.5 and takes over', resumed);
        await waitOff(page, 20000).catch(() => {});
      } else {
        await waitOff(page, 12000).catch(() => {});
        const c = await clean(page);
        const seen = await page.evaluate(() => localStorage.getItem('banmu.intro'));
        check('a missing chunk: the card closes quietly by 8 s, NOT marked seen, the app is usable', !(await on(page)) && seen === null && c.inert === 0 && !c.html, JSON.stringify({ ...c, seen }));
        check('…and the Welcome follows', await page.waitForSelector('.welcome', { timeout: 6000 }).then(() => true, () => false));
      }
      const own = errors.filter((e) => !/Failed to fetch dynamically imported module|net::ERR_FAILED|Failed to load resource/.test(e));
      check(`no console errors (${mode})`, own.length === 0, own.join(' | '));
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- back / a route change mid-film
  if (want('back')) {
    for (const how of ['back', 'hash']) {
      const { ctx, page, errors } = await fresh();
      await page.goto(origin + '/?intro=1#garden');
      await page.waitForSelector('.intro-film');
      await page.evaluate(() => history.pushState(null, '', '#garden'));
      await page.waitForTimeout(1500);
      await tapStart(page);
      await page.waitForTimeout(how === 'back' ? 1500 : 4400);
      if (how === 'back') await page.evaluate(() => history.back());
      else await page.evaluate(() => { location.hash = '#almanac'; });
      await waitOff(page, 12000).catch(() => {});
      const c = await clean(page);
      check(`${how === 'back' ? 'history.back() before' : 'a hash change after'} the takeover ends it cleanly`, !(await on(page)) && c.inert === 0 && !c.html && c.tabbar !== 'none', JSON.stringify(c));
      check(`no console errors (${how})`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- a real (non-webdriver) visitor
  if (want('existing')) {
    const human = `Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });`;
    let { ctx, page } = await fresh({ seed: human });
    await page.goto(origin + '/#garden');
    check('a fresh visitor on the garden gets the card', await page.waitForSelector('.intro-film', { timeout: 8000 }).then(() => true, () => false));
    await ctx.close();
    ({ ctx, page } = await fresh({ seed: human }));
    await page.goto(origin + '/#almanac');
    await page.waitForTimeout(1500);
    check('a shared deep link: no card, not marked seen', !(await on(page)) && (await page.evaluate(() => localStorage.getItem('banmu.intro'))) === null);
    await ctx.close();
    const seed = human + `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('banmu.v1', JSON.stringify({ version: 1, onboarded: true })); } } catch {}`;
    ({ ctx, page } = await fresh({ seed }));
    await page.goto(origin + '/#garden');
    await page.waitForSelector('.garden-canvas');
    await page.waitForTimeout(600);
    check('an existing user is never interrupted', !(await on(page)));
    const toast = await page.waitForFunction(() => /半亩添了一段开篇/.test(document.body.innerText), null, { timeout: 6000 }).then(() => true, () => false);
    check('…gets the one-time toast 「半亩添了一段开篇」 · 看看, and is marked seen', toast && (await page.evaluate(() => localStorage.getItem('banmu.intro'))) === '1');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.toast-action')].find((x) => /看看/.test(x.textContent)); b?.click(); });
    check('…「看看」 opens the film', await page.waitForSelector('.intro-film', { timeout: 4000 }).then(() => true, () => false));
    await page.reload();
    await page.waitForSelector('.garden-canvas');
    await page.waitForTimeout(2500);
    check('…and never again', !(await on(page)) && !/半亩添了一段开篇/.test(await page.evaluate(() => document.body.innerText)));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Settings replay
  if (want('replay')) {
    const seed = `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('banmu.v1', JSON.stringify({ version: 1, onboarded: true })); } } catch {}`;
    const { ctx, page, errors } = await fresh({ seed });
    await page.goto(origin + '/?intro=0#settings');
    await page.waitForSelector('.set-replay');
    const sub = await page.textContent('.set-replay');
    check('Settings has 「重看开篇」 · 月亮看见的 · 一分多钟', /重看开篇/.test(sub) && /月亮看见的 · 一分多钟/.test(sub), sub.trim());
    await page.click('.set-replay');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(1200);
    await tapStart(page);
    await page.waitForTimeout(1500);
    check('the tap navigates to #garden behind the film', /#garden$/.test(page.url()));
    // the real film runs over a minute: take the tail once it has taken over (the stub ends by itself)
    await page.waitForFunction(() => Number(document.querySelector('.intro-stage')?.dataset.t ?? 0) >= 6 || !document.querySelector('.intro-film'), null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('.intro-skip')?.click());
    await page.waitForTimeout(1700);
    await page.screenshot({ path: join(tmpdir(), 'pv-I', 'shots', 'replay-tail.png') }).catch(() => {});
    await waitOff(page, 20000).catch(() => {});
    const c = await clean(page);
    const welcome = await page.$('.welcome');
    check('the replay ends in the garden, cleanly, with no Welcome', !(await on(page)) && c.inert === 0 && !welcome, JSON.stringify(c));
    check('no console errors (replay)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- the whole film, for real
  const filmT = (page) => page.evaluate(() => Number(document.querySelector('.intro-stage')?.dataset.t ?? NaN));
  const filmCut = (page) => page.evaluate(() => document.querySelector('.intro-stage')?.dataset.cut ?? null);
  const untilT = (page, t, ms = 60000) => page.waitForFunction((x) => Number(document.querySelector('.intro-stage')?.dataset.t ?? 0) >= x, t, { timeout: ms, polling: 50 });
  const SHOTS = join(tmpdir(), 'pv-I', 'shots');
  try { (await import('node:fs')).mkdirSync(SHOTS, { recursive: true }); } catch { /* ignore */ }
  const snap = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});

  if (want('full')) {
    const { ctx, page, errors, requests } = await fresh({ touch: true });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => ({ ...localStorage }));
    await page.evaluate(() => {
      window.__long = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask' }); } catch { /* ignore */ }
    });
    const w0 = Date.now();
    await tapStart(page);
    await untilT(page, 4.5, 20000).catch(() => {});
    const cut = await filmCut(page);
    check('the real film takes over (stage clock running)', (await filmT(page)) >= 4.5, `cut ${cut}`);
    const times = cut === 'full' ? [6, 12, 17, 24, 33, 42, 46, 52, 58, 62, 66, 69, 73, 77, 80.5, 82, 82.7, 83.6, 85.2]
      : [6, 12, 17, 24, 33, 42, 46, 51.8, 56, 58.6, 61, 64.6, 66.5, 67.5, 68.2, 69.8];
    for (const t of times) {
      if (!(await untilT(page, t, 40000).then(() => true, () => false))) break;
      await snap(page, `full-${cut}-${String(t).replace('.', '_')}`);
    }
    const seen = await page.evaluate(() => {
      // after the settle (short 67.9 / full 83.1) the stage is clear over the header: sample the canvas there
      const c = document.querySelector('.intro-canvas'), h1 = document.querySelector('.garden-title h1');
      if (!c || !h1) return null;
      const r = h1.getBoundingClientRect(), k = c.width / c.getBoundingClientRect().width;
      try { return c.getContext('2d').getImageData(Math.round((r.left + r.width / 2) * k), Math.round((r.top + r.height / 2) * k), 1, 1).data[3]; } catch { return null; }
    });
    check('after the settle the app shows through the stage (canvas clear over the header)', seen === 0, `alpha ${seen}`);
    const done = await page.waitForFunction(() => document.documentElement.dataset.introDone, null, { timeout: 60000 }).then((h) => h.jsonValue(), () => null);
    const wall = (Date.now() - w0) / 1000;
    const end = cut === 'full' ? 86.0 : 70.8;
    check('the film plays to its end', typeof done === 'string' && done.startsWith('end@') && Number(done.split('@')[1]) >= end - 0.5, `${done}, ${wall.toFixed(1)} s wall`);
    check('wall time from the tap ≤ end + 3 s hold cap + slack', wall <= end + 3 + 6, `${wall.toFixed(1)} s`);
    await waitOff(page, 8000).catch(() => {});
    await page.waitForTimeout(400);
    await snap(page, `full-${cut}-after`);
    const c = await clean(page);
    check('the film hands over cleanly (no inert, no html.intro-on, the tab bar back)', !(await on(page)) && c.inert === 0 && !c.html && c.tabbar !== 'none', JSON.stringify(c));
    const after = await page.evaluate(() => ({ ...localStorage }));
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
    check('over a full real run the PV writes only banmu.intro', changed.length === 1 && changed[0] === 'banmu.intro', changed.join(','));
    const a = await page.evaluate(() => ({ starts: window.__starts.length, wake: [...window.__wake], long: window.__long, theme: window.__banmuMusic ? window.__banmuMusic.stats().theme : 'no stats' }));
    check('the reel played (buffer sources started through the film)', a.starts >= 20, `${a.starts} starts`);
    check('wake lock released at the end of a full run', a.wake.includes('release'), a.wake.join(','));
    const long = a.long.filter((d) => d > 100);
    check('long tasks during the film (measured, SwiftShader)', true, `${a.long.length} > 50 ms, ${long.length} > 100 ms, max ${Math.max(0, ...a.long).toFixed(0)} ms`);
    check('the Welcome sheet follows a full run', await page.waitForSelector('.welcome', { timeout: 8000 }).then(() => true, () => false));
    check('no games chunk was fetched during a full run', !requests.some((u, i) => /GomokuView|SnakeView/.test(u)));
    check('no console errors (full run)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- rotation mid-S3
  if (want('rotate')) {
    const { ctx, page, errors } = await fresh();
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    await tapStart(page);
    await untilT(page, 12, 30000).catch(() => {});
    const gaps = page.evaluate(() => new Promise((res) => {
      const ts = []; const t0 = performance.now();
      const step = (t) => { ts.push(t); if (t - t0 < 2500) requestAnimationFrame(step); else res(ts.slice(1).map((x, i) => x - ts[i])); };
      requestAnimationFrame(step);
    }));
    await page.setViewportSize({ width: 844, height: 390 });
    const d = await gaps;
    await page.waitForTimeout(300);
    await snap(page, 'rotate-844x390');
    const r = await page.evaluate(() => {
      const st = document.querySelector('.intro-stage');
      const cap = [...document.querySelectorAll('.intro-cap-line')].find((e) => Number(getComputedStyle(e).opacity) > 0.5 && e.getBoundingClientRect().width > 0);
      const b = st.getBoundingClientRect();
      return { tf: st.style.transform, w: b.width, h: b.height, x: b.left, y: b.top, cap: cap ? parseFloat(getComputedStyle(cap).fontSize) : null, capText: cap?.textContent ?? '' };
    });
    check('rotation: the stage keeps its composition, contain-fitted into the new viewport', /scale/.test(r.tf) && r.h <= 391 && r.w <= 845 && Math.abs(r.w / r.h - 390 / 844) < 0.02, JSON.stringify(r));
    check('rotation: the caption stays readable (≥ 16 px)', r.cap !== null && r.cap >= 16, String(r.cap));
    check('rotation: frame gaps (measured, SwiftShader)', true, `max ${Math.max(...d).toFixed(0)} ms over ${d.length} frames`);
    await page.evaluate(() => document.querySelector('.intro-skip')?.click());
    await waitOff(page, 10000).catch(() => {});
    const c = await clean(page);
    check('rotation: the skip still ends cleanly', !(await on(page)) && c.inert === 0 && !c.html, JSON.stringify(c));
    check('no console errors (rotate)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- a hidden tab resumes at the shot's start
  if (want('hidden')) {
    const { ctx, page, errors } = await fresh();
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    await tapStart(page);
    await untilT(page, 21.5, 40000).catch(() => {});
    const setVis = (v) => page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    const t0 = await filmT(page);
    await setVis('hidden');
    await page.waitForTimeout(1500);
    const tHidden = await filmT(page);
    await setVis('visible');
    await page.waitForTimeout(250);
    const tBack = await filmT(page);
    await page.waitForTimeout(1200);
    const tLater = await filmT(page);
    check('hidden: the film clock stops while hidden', Math.abs(tHidden - t0) < 0.3, `${t0} → ${tHidden}`);
    check('hidden: it resumes at the current shot\'s start (S4 19.0) and plays on', tBack >= 18.9 && tBack < 20 && tLater > tBack + 0.6, `back ${tBack}, then ${tLater}`);
    const w = await page.evaluate(() => [...window.__wake]);
    check('hidden: the wake lock is held (requested, not released) after the return', w.includes('request:screen') && !w.includes('release'), w.join(','));
    await page.evaluate(() => document.querySelector('.intro-skip')?.click());
    await waitOff(page, 10000).catch(() => {});
    check('no console errors (hidden)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- reduced motion: the short cut as stills
  if (want('stills')) {
    const { ctx, page, errors } = await fresh({ reduced: true });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    await tapStart(page);
    await untilT(page, 10.2, 30000).catch(() => {});
    const cut = await filmCut(page);
    check('reduced motion plays the short cut', cut === 'short', String(cut));
    const shot = async () => page.locator('.intro-canvas').screenshot().catch(() => null);
    const a = await shot();
    await page.waitForTimeout(700);
    const b = await shot();
    await snap(page, 'stills-10');
    check('reduced motion: a still holds (the canvas does not move within a still)', a && b && Buffer.compare(a, b) === 0);
    const tA = await filmT(page);
    await page.mouse.click(200, 400);
    await page.waitForTimeout(250);
    const tB = await filmT(page);
    check('reduced motion: a tap on the stage advances to the next still', tB >= 15.2 && tB < 16.5, `${tA} → ${tB}`);
    await page.waitForTimeout(900);
    await snap(page, 'stills-next');
    await page.evaluate(() => document.querySelector('.intro-skip')?.click());
    await waitOff(page, 10000).catch(() => {});
    const c = await clean(page);
    check('reduced motion: the skip ends cleanly', !(await on(page)) && c.inert === 0 && !c.html, JSON.stringify(c));
    check('no console errors (stills)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- an English UI: the date fades in place
  if (want('english')) {
    const seed = `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('banmu.v1', JSON.stringify({ version: 1, settings: { lang: 'en' } })); } } catch {}`;
    const { ctx, page, errors } = await fresh({ seed });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(2500);
    await tapStart(page);
    await untilT(page, 6, 30000).catch(() => {});
    await page.evaluate(() => document.querySelector('.intro-skip')?.click());
    await page.waitForTimeout(1500);
    await snap(page, 'english-tail');
    await waitOff(page, 10000).catch(() => {});
    const d = await page.evaluate(() => document.querySelector('.garden-date')?.textContent ?? '');
    check('English UI: the film stays Chinese and .garden-date keeps its English text after', /[A-Za-z]/.test(d), d.trim());
    check('no console errors (english)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- frame times at 4× throttle (S1)
  if (want('frames')) {
    const { ctx, page } = await fresh({ cpu: 4 });
    await page.goto(origin + '/?intro=1#garden');
    await page.waitForSelector('.intro-film');
    await page.waitForTimeout(4000);
    await tapStart(page);
    const f = await page.evaluate(() => new Promise((res) => {
      const ts = []; const t0 = performance.now();
      const step = (t) => { ts.push(t); if (t - t0 < 3000) requestAnimationFrame(step); else res(ts); };
      requestAnimationFrame(step);
    }));
    const d = f.slice(1).map((t, i) => t - f[i]);
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    check('S1 frame times at 4× throttle (measured)', true, `avg ${avg.toFixed(1)} ms, max ${Math.max(...d).toFixed(0)} ms over ${d.length} frames`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- the single file in a sandboxed iframe
  if (SINGLE) {
    const file = join(ROOT, 'dist-single/index.html');
    if (!existsSync(file)) check('dist-single/index.html exists (npm run build:single)', false);
    else {
      const html = readFileSync(file);
      const srv = httpServer((req, res) => {
        if (req.url.startsWith('/app')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" src="/app/index.html?intro=1#garden" style="border:0;width:390px;height:844px"></iframe></body>');
      });
      await new Promise((r) => srv.listen(0, '127.0.0.1', r));
      const { ctx, page, errors } = await fresh({ touch: false });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`);
      const frame = await (await page.waitForSelector('#f')).contentFrame();
      const card = await frame.waitForSelector('.intro-film', { timeout: 20000 }).then(() => true, () => false);
      check('single file in a sandboxed iframe: the card shows', card);
      const storageThrows = await frame.evaluate(() => { try { void localStorage.length; return false; } catch { return true; } });
      check('…storage throws there (and the gate went on)', storageThrows);
      await frame.waitForTimeout(800);
      await frame.click('.intro-skip');
      const off = await frame.waitForFunction(() => !document.querySelector('.intro-film'), null, { timeout: 6000 }).then(() => true, () => false);
      check('…the skip works', off);
      const own = errors.filter((e) => !/Failed to read the 'localStorage'|SecurityError|sandboxed|allow-same-origin/.test(e));
      check('…no console errors of ours', own.length === 0, own.slice(0, 3).join(' | '));
      await ctx.close();
      srv.close();
    }
  }
} catch (e) {
  check('the run itself', false, e.stack || String(e));
} finally {
  await browser.close();
  await server.close();
  try { rmSync(cacheDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
