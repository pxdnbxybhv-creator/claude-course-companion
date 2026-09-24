#!/usr/bin/env node
// Screenshot tool for visual iteration. Spins up its own Vite dev server on a free port,
// so several people (or agents) can run it at once.
//
//   node scripts/snap.mjs <urlPath> <out.png> [<urlPath> <out.png> …] [--w 1200] [--h 800] [--dpr 2] [--wait 300] [--full] [--dark]
//
//   node scripts/snap.mjs "/lab.html?scene=plant&kind=plum&growth=0.3,0.6,1" .snaps/plum.png
//   node scripts/snap.mjs "/#/garden" .snaps/garden.png --w 390 --h 844 --dpr 3
//
// Pages may set `window.__labReady = true` when finished drawing; otherwise we wait for
// network idle + --wait ms. Console errors and page errors are printed to stderr.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const args = process.argv.slice(2);
const opts = { w: 1200, h: 800, dpr: 2, wait: 300, full: false, dark: false, timeout: 20000 };
const pairs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (k === 'full' || k === 'dark') opts[k] = true;
    else opts[k] = Number(args[++i]);
  } else pairs.push(a);
}
if (pairs.length < 2 || pairs.length % 2) {
  console.error('usage: snap.mjs <urlPath> <out.png> [...pairs] [--w --h --dpr --wait --full --dark]');
  process.exit(2);
}

// A private cache dir per run: several snap processes may run at once.
const cacheDir = join(tmpdir(), `banmu-vite-${process.pid}`);
const server = await createServer({ logLevel: 'error', cacheDir, server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, clearScreen: false });
await server.listen();
const addr = server.httpServer.address();
const origin = `http://127.0.0.1:${addr.port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
let failures = 0;
try {
  const context = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: opts.dpr,
    colorScheme: opts.dark ? 'dark' : 'light',
    locale: 'zh-CN',
  });
  for (let i = 0; i < pairs.length; i += 2) {
    const [path, out] = [pairs[i], pairs[i + 1]];
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(origin + path, { waitUntil: 'networkidle', timeout: opts.timeout });
    try {
      await page.waitForFunction(() => window.__labReady === true || !document.querySelector('[data-lab]'), null, { timeout: opts.timeout });
    } catch { errors.push('[snap] timed out waiting for window.__labReady'); }
    await page.waitForTimeout(opts.wait);
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage: opts.full });
    console.log(`saved ${out} (${Date.now() - t0} ms)`);
    for (const e of errors) console.error(e);
    if (errors.some((e) => e.includes('pageerror'))) failures++;
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
