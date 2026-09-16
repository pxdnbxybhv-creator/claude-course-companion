// 拼接各章 HTML，用 paged.js 分页，再由 Chromium 输出 PDF
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const parts = ['00_front.html', 'ch0.html', 'ch1.html', 'ch2.html', 'appendix.html'];
const out = process.argv[2] || 'out.pdf';
const only = process.argv[3]; // 可选：只渲染某一部分，便于快速预览

(async () => {
  const body = parts
    .filter(p => !only || p === only || p === '00_front.html' && only !== 'nofront')
    .map(p => fs.readFileSync(path.join(__dirname, p), 'utf8')).join('\n');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>编译器是怎样炼成的</title>
<style>${fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8')}</style>
<style>${fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')}</style>
<script src="diagrams.js"></script>
<script>
  window.PagedConfig = { auto: false };
  window.__diagErrors = [];
</script>
<script src="lib/paged.polyfill.min.js"></script>
</head><body>
${body}
<script>
  (async () => {
    try {
      Diagrams.renderAll();
      await document.fonts.ready;
      const flow = await window.PagedPolyfill.preview();
      window.__pages = flow && flow.total;
    } catch (e) { window.__err = String(e && e.stack || e); }
    window.__pagedDone = true;
  })();
</script>
</body></html>`;
  fs.writeFileSync(path.join(__dirname, 'index.html'), html);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForFunction(() => window.__pagedDone === true, null, { timeout: 300000 });
  const n = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
  const dbg = await page.evaluate(() => ({ err: window.__err, pages: window.__pages, bodyKids: document.body.children.length }));
  if (dbg.err) console.error('PAGE ERROR:', dbg.err);
  console.log('debug:', JSON.stringify(dbg));
  const errs = await page.evaluate(() => Array.from(document.querySelectorAll('.diagram pre')).map(p => p.textContent));
  if (errs.length) console.error('DIAGRAM ERRORS:\n' + errs.join('\n'));
  await page.pdf({ path: path.join(__dirname, out), preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log(`rendered ${n} pages -> ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
