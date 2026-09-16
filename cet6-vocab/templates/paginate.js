/* Measure-and-pack pagination.
   The template emits one flat list of blocks in #flow; this walks them, fills a
   fixed-height two-column box per page, and starts a new page when the content
   would spill into a third column. Cards therefore never split across a page,
   and a heading is never left stranded at the bottom of one. */
(function () {
  // Web fonts change every measurement, so never paginate before they are ready.
  const run = () => {
  const body = document.body;
  const flow = document.getElementById('flow');
  if (!flow) return;
  const day = body.dataset.day, title = body.dataset.title, progress = body.dataset.progress;
  const blocks = Array.from(flow.children);
  flow.remove();

  let pageNo = document.querySelectorAll('section.page').length; // the opener is page 1
  const pages = [];
  function newPage() {
    pageNo += 1;
    const sec = document.createElement('section');
    sec.className = 'page';
    sec.innerHTML =
      '<header class="run"><span><b>Day ' + day + '</b>　' + title + '</span>' +
      '<span class="hdr-right"></span></header>' +
      '<div class="content"></div>' +
      '<footer class="run"><span>Day ' + day + ' · 第 ' + pageNo + ' 页</span>' +
      '<div class="progress"><i style="width:' + progress + '%"></i></div>' +
      '<span>Day ' + day + ' / 30</span></footer>';
    body.appendChild(sec);
    pages.push(sec);
    return sec.querySelector('.content');
  }
  const isHead = el => el.matches('h2.scene, h2.hwt, p.intro');
  // A column-span block re-balances everything above it, so checking only the block
  // just appended is not enough: verify every child still sits inside the content box.
  function overflows(c) {
    const box = c.getBoundingClientRect();
    if (c.scrollWidth > c.clientWidth + 1) return true;
    const gap = parseFloat(getComputedStyle(c).columnGap) || 30;
    const colW = (box.width - gap) / 2;
    for (const el of c.children) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (r.right > box.right + 1 || r.bottom > box.bottom + 1) return true;
      // break-inside:avoid is not always honoured next to a column-span block; a
      // block sitting in one column but measuring two columns wide has been split.
      if (!el.classList.contains('span2') && r.width > colW + 3) return true;
    }
    return false;
  }

  let content = newPage();
  for (const b of blocks) {
    content.appendChild(b);
    if (!overflows(content)) continue;
    if (content.children.length === 1) {           // single block taller than a page: keep it
      console.warn('block taller than one page:', b.className, b.textContent.slice(0, 30));
      content = newPage();
      continue;
    }
    content.removeChild(b);
    // do not strand a heading (or a heading + its intro) at the foot of a page
    const moved = [];
    while (content.lastElementChild && isHead(content.lastElementChild)) {
      moved.unshift(content.removeChild(content.lastElementChild));
    }
    content = newPage();
    moved.forEach(m => content.appendChild(m));
    content.appendChild(b);
  }
  // running head: name the scene(s) present on each page
  for (const sec of pages) {
    const labels = Array.from(sec.querySelectorAll('h2.scene, h2.hwt'))
      .map(h => h.dataset.short || h.textContent.trim()).filter(Boolean);
    const uniq = labels.filter((v, i) => labels.indexOf(v) === i).slice(0, 2);
    sec.querySelector('.hdr-right').textContent = uniq.length ? uniq.join('　·　') : '（续）';
  }
  document.documentElement.dataset.pages = pageNo;
  document.documentElement.dataset.paginated = '1';
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  else window.addEventListener('load', run);
})();
