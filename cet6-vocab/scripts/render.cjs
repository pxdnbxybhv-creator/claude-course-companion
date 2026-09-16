// Usage: node scripts/render.cjs build/day01.html build/day01.pdf
// Loads the HTML in Chromium, runs templates/paginate.js (already linked from the page),
// then prints at exactly iPad Pro 11" landscape logical size.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [, , input, output] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('console', m => { if (m.type() === 'warning') console.log('  [page]', m.text()); });
  await p.goto('file://' + path.resolve(input), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.documentElement.dataset.paginated === '1', { timeout: 15000 });
  const outline = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('section.page')).map(sec => ({
      labels: Array.from(sec.querySelectorAll('h2.scene, h2.hwt'))
        .map(h => h.dataset.short || h.textContent.trim())
        .filter((v, i, a) => a.indexOf(v) === i),
      opener: sec.classList.contains('opener'),
    }));
  });
  require('fs').writeFileSync(output.replace(/\.pdf$/, '.pages.json'), JSON.stringify(outline, null, 1));
  const report = await p.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('section.page'));
    const over = pages.map((s, i) => {
      const c = s.querySelector('.content');
      const spill = c ? c.scrollWidth > c.clientWidth + 1 : false;
      const last = c && c.lastElementChild;
      return { page: i + 1, spill, tall: s.scrollHeight > s.clientHeight + 1,
               n: c ? c.children.length : 0,
               last: last ? (last.className + ' | ' + last.textContent.trim().slice(0, 40)) : '' };
    }).filter(r => r.spill || r.tall);
    return { pages: pages.length, over };
  });
  console.log(`  ${report.pages} pages` + (report.over.length ? `, OVERFLOW on ${JSON.stringify(report.over)}` : ', no overflow'));
  await p.pdf({ path: output, width: '1194px', height: '834px', printBackground: true,
                preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await b.close();
  console.log('  wrote', output);
})();
