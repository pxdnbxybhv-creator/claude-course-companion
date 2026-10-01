// 水月幻镜 · m8 contrast guard (art.md R7, PLAN §4.A tests, acceptance A-A1). Every companion — the hidden three
// included — must stand off the 月湖 paper on a phone: ≥ 40 % of the pixels that differ from the paper (ΔL > 0.04)
// differ strongly (ΔL > 0.25), baked with the real renderSpec at the phone's bake scale (k 1.84) and drawn at
// the camera's scale (1.67 device px per u, 中). The 月华 pearl reads as ≥ 40 device px across.
//
// It needs a real canvas, so it runs headless Chromium on a Vite dev server: set MIRROR_PIXELS=1 (and have
// playwright-core with /opt/pw-browsers/chromium, as the lab does). Otherwise it is skipped.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ON = process.env.MIRROR_PIXELS === '1';
const ROOT = join(__dirname, '..');

/** Runs in the page: bake and measure every companion and the 月华 pearl. */
const PAGE_FN = `(async () => {
  const atlas = await import('/src/views/mirror/paint/atlas.ts');
  const pidx = await import('/src/views/mirror/paint/index.ts');
  const pal = await import('/src/views/mirror/paint/palette.ts');
  const figs = await import('/src/views/mirror/paint/figures.ts');
  const things = await import('/src/views/mirror/paint/things.ts');
  const K = 1.8386, CAM = 1.6714, bg = pal.MAP_PAL.lake.paper;
  const [br, bgc, bb] = pal.rgbOf(bg);
  const L = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const Lp = L(br, bgc, bb);
  const draw = (id, spec) => {
    const e = pidx.edgeOf(id);
    const P = atlas.renderSpec(spec, 0, { k: K, seed: 1234, halo: Math.max(1, Math.round(K)), flash: false, rim: e.rim, outline: e.outline, volume: e.volume });
    const w = Math.max(1, Math.round(P.w * CAM)), h = Math.max(1, Math.round(P.h * CAM));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.drawImage(P.img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let marked = 0, strong = 0;
    for (let i = 0; i < d.length; i += 4) { const dl = Math.abs(L(d[i], d[i + 1], d[i + 2]) - Lp); if (dl < 0.04) continue; marked++; if (dl > 0.25) strong++; }
    return { marked, strong, w };
  };
  const chars = {};
  for (const [id, spec] of Object.entries(figs.CHAR_SPECS)) { const m = draw('char:' + id, spec); chars[id] = { marked: m.marked, strong: m.strong }; }
  const pearlPx = draw('drop:moonDrop', things.DROP_SPECS.moonDrop).w;
  return { chars, pearlPx };
})()`;

async function measureInBrowser(): Promise<{ chars: Record<string, { marked: number; strong: number }>; pearlPx: number }> {
  const require = createRequire(join(ROOT, 'package.json'));
  const pw = await import(require.resolve('playwright-core'));
  const chromium = pw.chromium ?? pw.default.chromium;
  const { createServer } = await import(require.resolve('vite'));
  const port = 5890 + Math.floor(Math.random() * 60);
  const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null }, clearScreen: false });
  await server.listen();
  const browser = await chromium.launch({ executablePath: process.env.MIRROR_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    // (a string, so vitest leaves the page's dynamic imports alone)
    return await page.evaluate(PAGE_FN) as { chars: Record<string, { marked: number; strong: number }>; pearlPx: number };
  } finally {
    await browser.close();
    await server.close();
  }
}

describe.skipIf(!ON)('contrast guard (MIRROR_PIXELS=1): every companion stands off the 月湖 paper', () => {
  it('≥ 40 % strong-contrast pixels for all 16; the 月华 pearl ≥ 40 device px', async () => {
    const r = await measureInBrowser();
    const low: string[] = [];
    for (const [id, m] of Object.entries(r.chars)) if (m.strong / Math.max(1, m.marked) < 0.4) low.push(`${id} ${((100 * m.strong) / Math.max(1, m.marked)).toFixed(1)}%`);
    expect(Object.keys(r.chars).length).toBe(16);
    expect(low).toEqual([]);
    expect(r.pearlPx).toBeGreaterThanOrEqual(40);
  }, 120_000);
});
