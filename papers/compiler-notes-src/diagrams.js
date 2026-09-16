/* 极简图形引擎：有限自动机、树、T 型图、流程框 —— 全部输出内联 SVG */
window.Diagrams = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function textWidth(s, size) {
    let w = 0;
    for (const ch of String(s)) w += (ch.charCodeAt(0) > 255 ? 1 : 0.6) * size;
    return w;
  }
  const MARKER = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#222"/></marker><marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker></defs>';

  function label(x, y, t, color, fs) {
    fs = fs || 11;
    const w = textWidth(t, fs) + 6;
    return `<rect x="${x - w / 2}" y="${y - fs * 0.7}" width="${w}" height="${fs * 1.4}" fill="#fff" fill-opacity="0.9"/>` +
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${color || '#222'}">${esc(t)}</text>`;
  }

  /* ---------- 有限自动机 ---------- */
  function fa(spec) {
    const r = spec.r || 17;
    const out = [];
    const byId = {};
    spec.states.forEach(s => byId[s.id] = s);
    for (const e of (spec.edges || [])) {
      const a = byId[e.from], b = byId[e.to];
      const stroke = e.color || '#222';
      const mk = e.color === '#c0392b' ? 'url(#arrR)' : 'url(#arr)';
      const dash = e.dash ? ' stroke-dasharray="4,3"' : '';
      if (a === b) {
        const dir = e.loop || 'top';
        const ang = { top: -90, bottom: 90, right: 0, left: 180 }[dir] * Math.PI / 180;
        const sp = 0.6;
        const p1x = a.x + r * Math.cos(ang - sp), p1y = a.y + r * Math.sin(ang - sp);
        const p2x = a.x + r * Math.cos(ang + sp), p2y = a.y + r * Math.sin(ang + sp);
        const d = r * 2.6;
        const c1x = a.x + d * Math.cos(ang - sp * 1.5), c1y = a.y + d * Math.sin(ang - sp * 1.5);
        const c2x = a.x + d * Math.cos(ang + sp * 1.5), c2y = a.y + d * Math.sin(ang + sp * 1.5);
        out.push(`<path d="M${p1x},${p1y} C${c1x},${c1y} ${c2x},${c2y} ${p2x},${p2y}" fill="none" stroke="${stroke}" stroke-width="1.3" marker-end="${mk}"${dash}/>`);
        if (e.label !== undefined) {
          const lx = a.x + (r * 2.75) * Math.cos(ang) + (e.dx || 0), ly = a.y + (r * 2.75) * Math.sin(ang) + (e.dy || 0);
          out.push(label(lx, ly, e.label, e.color, e.fs));
        }
        continue;
      }
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const curve = e.curve || 0;
      let d, lx, ly;
      if (!curve) {
        const sx = a.x + ux * r, sy = a.y + uy * r, ex = b.x - ux * (r + 1.5), ey = b.y - uy * (r + 1.5);
        d = `M${sx},${sy} L${ex},${ey}`;
        lx = (a.x + b.x) / 2 + nx * (-11) + (e.dx || 0);
        ly = (a.y + b.y) / 2 + ny * (-11) + (e.dy || 0);
      } else {
        const cx = (a.x + b.x) / 2 + nx * curve, cy = (a.y + b.y) / 2 + ny * curve;
        let vx = cx - a.x, vy = cy - a.y, vl = Math.hypot(vx, vy);
        const sx = a.x + vx / vl * r, sy = a.y + vy / vl * r;
        vx = cx - b.x; vy = cy - b.y; vl = Math.hypot(vx, vy);
        const ex = b.x + vx / vl * (r + 1.5), ey = b.y + vy / vl * (r + 1.5);
        d = `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
        const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex, my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
        const sg = curve > 0 ? 1 : -1;
        lx = mx + nx * sg * 11 + (e.dx || 0); ly = my + ny * sg * 11 + (e.dy || 0);
      }
      out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.3" marker-end="${mk}"${dash}/>`);
      if (e.label !== undefined) out.push(label(lx, ly, e.label, e.color, e.fs));
    }
    for (const s of spec.states) {
      const col = s.color || '#222';
      if (s.start) out.push(`<line x1="${s.x - r - 30}" y1="${s.y}" x2="${s.x - r - 1.5}" y2="${s.y}" stroke="#222" stroke-width="1.3" marker-end="url(#arr)"/>`);
      out.push(`<circle cx="${s.x}" cy="${s.y}" r="${r}" fill="${s.fill || '#fff'}" stroke="${col}" stroke-width="1.4"/>`);
      if (s.acc) out.push(`<circle cx="${s.x}" cy="${s.y}" r="${r - 3.5}" fill="none" stroke="${col}" stroke-width="1.2"/>`);
      if (s.label !== undefined && s.label !== '') out.push(`<text x="${s.x}" y="${s.y}" text-anchor="middle" dominant-baseline="central" font-size="${s.fs || 11}" fill="${col}">${esc(s.label)}</text>`);
      if (s.note) out.push(`<text x="${s.x + r + 7}" y="${s.y}" dominant-baseline="central" font-size="11" fill="#222">${esc(s.note)}</text>`);
    }
    for (const t of (spec.texts || [])) out.push(`<text x="${t.x}" y="${t.y}" font-size="${t.fs || 10.5}" fill="${t.color || '#444'}" text-anchor="${t.anchor || 'start'}" dominant-baseline="central"${t.italic ? ' font-style="italic"' : ''}>${esc(t.t)}</text>`);
    for (const b of (spec.boxes || [])) out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${b.color || '#999'}" stroke-width="1" stroke-dasharray="${b.dash || '0'}" rx="4"/>`);
    return `<svg xmlns="${NS}" viewBox="0 0 ${spec.w} ${spec.h}" class="fa" style="max-width:${spec.maxw || spec.w}px">${MARKER}${out.join('')}</svg>`;
  }

  /* ---------- 树 ---------- */
  function tree(root, opt) {
    opt = opt || {};
    const fs = opt.fs || 11, levelH = opt.levelH || 44, gap = opt.gap || 12;
    function measure(n) {
      n.tw = Math.max(textWidth(n.t, fs), n.a ? textWidth(n.a, fs - 1.5) : 0) + 14;
      if (!n.c || !n.c.length) { n.w = n.tw; return n.w; }
      let s = 0; n.c.forEach(c => s += measure(c)); s += gap * (n.c.length - 1);
      n.w = Math.max(s, n.tw); return n.w;
    }
    function place(n, x0, depth) {
      n.y = depth * levelH + 16;
      if (!n.c || !n.c.length) { n.x = x0 + n.w / 2; return; }
      const cw = n.c.reduce((a, c) => a + c.w, 0) + gap * (n.c.length - 1);
      let x = x0 + (n.w - cw) / 2;
      n.c.forEach(c => { place(c, x, depth + 1); x += c.w + gap; });
      n.x = (n.c[0].x + n.c[n.c.length - 1].x) / 2;
    }
    measure(root); place(root, 0, 0);
    const out = []; let maxD = 0;
    (function walk(n, d) {
      maxD = Math.max(maxD, d);
      (n.c || []).forEach(c => {
        out.push(`<line x1="${n.x}" y1="${n.y + 9 + (n.a ? 12 : 0)}" x2="${c.x}" y2="${c.y - 9}" stroke="#666" stroke-width="1"/>`);
        walk(c, d + 1);
      });
    })(root, 0);
    (function walk(n) {
      const cls = n.k || 'nt';
      if (n.hl) out.push(`<rect x="${n.x - n.tw / 2 + 2}" y="${n.y - 9}" width="${n.tw - 4}" height="${18 + (n.a ? 12 : 0)}" rx="4" fill="#fff3c4"/>`);
      out.push(`<text x="${n.x}" y="${n.y}" class="${cls}" text-anchor="middle" dominant-baseline="central" font-size="${fs}">${esc(n.t)}</text>`);
      if (n.a) out.push(`<text x="${n.x}" y="${n.y + 12.5}" class="attr" text-anchor="middle" dominant-baseline="central" font-size="${fs - 1.5}">${esc(n.a)}</text>`);
      (n.c || []).forEach(walk);
    })(root);
    const W = root.w + 16, H = (maxD + 1) * levelH + (opt.extra || 0);
    return `<svg xmlns="${NS}" viewBox="-8 0 ${W} ${H}" class="tree" style="max-width:${Math.min(W * (opt.scale || 1), opt.maxw || 520)}px">${out.join('')}</svg>`;
  }

  /* ---------- T 型图 ---------- */
  function tshape(x, y, S, T, H, o) {
    o = o || {};
    const w = o.w || 96, h = o.h || 30, sw = o.sw || 32;
    const fill = o.fill || '#fff';
    const d = `M${x},${y} h${w} v${h} h${-(w - sw) / 2} v${h} h${-sw} v${-h} h${-(w - sw) / 2} z`;
    const fs = o.fs || 12;
    return `<path d="${d}" fill="${fill}" stroke="${o.stroke || '#222'}" stroke-width="1.3"/>` +
      `<text x="${x + w * 0.2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#1e3a5f" font-weight="700">${esc(S)}</text>` +
      `<text x="${x + w * 0.8}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#1e3a5f" font-weight="700">${esc(T)}</text>` +
      `<text x="${x + w / 2}" y="${y + h * 1.5}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#8a4b08" font-weight="700">${esc(H)}</text>`;
  }
  function tdiag(spec) {
    const out = [];
    for (const it of spec.items) {
      if (it.T) out.push(tshape(it.x, it.y, it.S, it.T, it.H, it));
      else if (it.text !== undefined) out.push(`<text x="${it.x}" y="${it.y}" text-anchor="${it.anchor || 'middle'}" dominant-baseline="central" font-size="${it.fs || 11}" fill="${it.color || '#444'}"${it.italic ? ' font-style="italic"' : ''}>${esc(it.text)}</text>`);
      else if (it.arrow) out.push(`<text x="${it.x}" y="${it.y}" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#666">⟹</text>`);
      else if (it.line) out.push(`<line x1="${it.line[0]}" y1="${it.line[1]}" x2="${it.line[2]}" y2="${it.line[3]}" stroke="#999" stroke-width="1" stroke-dasharray="3,3"/>`);
    }
    return `<svg xmlns="${NS}" viewBox="0 0 ${spec.w} ${spec.h}" class="tdiag" style="max-width:${spec.maxw || spec.w}px">${MARKER}${out.join('')}</svg>`;
  }

  /* ---------- 通用框图 ---------- */
  function flow(spec) {
    const out = [];
    for (const b of (spec.boxes || [])) {
      const fill = b.fill || '#fff', stroke = b.stroke || '#1e3a5f';
      out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx === undefined ? 5 : b.rx}" fill="${fill}" stroke="${stroke}" stroke-width="${b.sw || 1.3}"${b.dash ? ` stroke-dasharray="${b.dash}"` : ''}/>`);
      const lines = String(b.t).split('\n');
      const fs = b.fs || 10.5;
      const y0 = b.y + b.h / 2 - (lines.length - 1) * fs * 0.65;
      lines.forEach((ln, i) => out.push(`<text x="${b.x + b.w / 2}" y="${y0 + i * fs * 1.3}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${b.color || '#1e3a5f'}"${b.bold ? ' font-weight="700"' : ''}${b.mono ? ' class="mono"' : ''}>${esc(ln)}</text>`));
    }
    for (const a of (spec.arrows || [])) {
      const pts = a.pts;
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]},${pts[i][1]}`;
      out.push(`<path d="${d}" fill="none" stroke="${a.color || '#444'}" stroke-width="${a.sw || 1.2}"${a.dash ? ` stroke-dasharray="${a.dash}"` : ''}${a.noHead ? '' : ' marker-end="url(#arr)"'}/>`);
      if (a.label !== undefined) {
        const lx = a.lx !== undefined ? a.lx : (pts[0][0] + pts[pts.length - 1][0]) / 2;
        const ly = a.ly !== undefined ? a.ly : (pts[0][1] + pts[pts.length - 1][1]) / 2;
        out.push(label(lx, ly, a.label, a.lcolor || '#8a4b08', a.fs || 9.5));
      }
    }
    for (const t of (spec.texts || [])) out.push(`<text x="${t.x}" y="${t.y}" font-size="${t.fs || 10.5}" fill="${t.color || '#444'}" text-anchor="${t.anchor || 'start'}" dominant-baseline="central"${t.italic ? ' font-style="italic"' : ''}${t.bold ? ' font-weight="700"' : ''}${t.mono ? ' class="mono"' : ''}>${esc(t.t)}</text>`);
    return `<svg xmlns="${NS}" viewBox="0 0 ${spec.w} ${spec.h}" class="flow" style="max-width:${spec.maxw || spec.w}px">${MARKER}${out.join('')}</svg>`;
  }

  function renderAll() {
    document.querySelectorAll('script[type="text/diagram"]').forEach(sc => {
      const target = document.getElementById(sc.dataset.target);
      if (!target) return;
      let spec;
      try { spec = new Function('return (' + sc.textContent + ')')(); }
      catch (err) { target.innerHTML = '<pre style="color:red">' + esc(err.message) + '</pre>'; return; }
      const kind = sc.dataset.kind;
      try {
        if (kind === 'fa') target.innerHTML = fa(spec);
        else if (kind === 'tree') target.innerHTML = tree(spec.root, spec.opt);
        else if (kind === 'tdiag') target.innerHTML = tdiag(spec);
        else if (kind === 'flow') target.innerHTML = flow(spec);
      } catch (err) { target.innerHTML = '<pre style="color:red">' + esc(err.stack) + '</pre>'; }
    });
  }
  return { fa, tree, tdiag, flow, renderAll };
})();
