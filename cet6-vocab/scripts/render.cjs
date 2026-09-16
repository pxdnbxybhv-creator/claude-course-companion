// Usage: node scripts/render.cjs templates/day01.html samples/day01-sample.pdf   (needs playwright: npm i playwright, or symlink a global install into node_modules/)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [,, input, output] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
  await p.goto('file://' + path.resolve(input), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const fonts = await p.evaluate(() => Array.from(document.fonts).map(f => f.family + ':' + f.status));
  console.log('fonts', fonts.join(' | '));
  await p.pdf({ path: output, width: '1194px', height: '834px', printBackground: true, preferCSSPageSize: true,
                margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await b.close(); console.log('pdf written', output);
})();
