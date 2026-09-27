// /lab.html?scene=mirror-atlas&map=lake&k=2&group=mon,elite&invert=0&labels=1
// Every mirror sprite (水月幻镜) painted through the real painter, with its atlas id and bake time.
// group: char mon elite boss wpn item sum proj drop fx num (default: all). k: px per u.
import { createPainter, allAtlasIds } from '../../views/mirror/paint';
import type { AtlasId, RunSave } from '../../views/mirror/types';
import type { MapId } from '../../views/mirror/ids';
import { fillPaper } from '../../ink/paper';

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const map = (p.get('map') ?? 'lake') as MapId;
  const groups = (p.get('group') ?? 'char,mon,elite,boss,wpn,item,sum,proj,drop,fx').split(',');
  const invert = p.get('invert') === '1';
  const dpr = window.devicePixelRatio || 1;
  const scale = Number(p.get('scale') ?? 1);
  const painter = createPainter(map, (p.get('q') ?? 'high') as 'high', dpr);
  const ids = allAtlasIds().filter((id) => groups.includes(id.split(':')[0]));
  const t0 = performance.now();
  if (invert) {
    // 倒影: the endless stage bakes enemies inverted, and an inverted arena shows them
    painter.plan({ char: 'scholar', map, wave: 30, weapons: [] } as unknown as RunSave, 'endless');
    painter.paintArena({ shape: { kind: 'circle', r: 300 }, obstacles: [], minX: -300, minY: -300, maxX: 300, maxY: 300 }, 1, true);
  }
  await painter.bake(ids);
  const ms = performance.now() - t0;
  const cell = Number(p.get('cell') ?? 92);
  const W = innerWidth;
  const cols = Math.max(1, Math.floor((W - 16) / cell));
  const rows: { id: AtlasId; v: number }[] = [];
  for (const id of ids) for (let v = 0; v < Math.min(painter.variants(id), Number(p.get('v') ?? 4)); v++) rows.push({ id, v });
  const H = Math.ceil(rows.length / cols) * (cell + 14) + 60;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (invert) { g.fillStyle = '#15161a'; g.fillRect(0, 0, W, H); } else fillPaper(g, W, H);
  g.font = '10px system-ui';
  rows.forEach(({ id, v }, i) => {
    const x = 8 + (i % cols) * cell, y = 40 + Math.floor(i / cols) * (cell + 14);
    const s = painter.sprite(id, v);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.strokeRect(x, y, cell - 4, cell - 4);
    if (s) {
      const k = Math.min((cell - 8) / s.w, (cell - 8) / s.h, 2.2 * scale);
      const dw = s.w * k, dh = s.h * k;
      g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x + (cell - 4 - dw) / 2, y + (cell - 4 - dh) / 2, dw, dh);
      if (p.get('flash') === '1') { const f = painter.flash(id, v)!; g.globalAlpha = 0.5; g.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, x + (cell - 4 - dw) / 2, y + (cell - 4 - dh) / 2, dw, dh); g.globalAlpha = 1; }
    } else { g.fillStyle = '#c00'; g.fillText('missing', x + 4, y + 20); }
    g.fillStyle = invert ? '#ccc' : 'rgba(0,0,0,.6)';
    g.fillText(`${id}${painter.variants(id) > 1 ? ' ·' + v : ''}`, x, y + cell + 6);
  });
  g.fillStyle = invert ? '#eee' : '#000'; g.font = '13px system-ui';
  g.fillText(`${ids.length} ids · ${rows.length} frames · bake ${ms.toFixed(0)} ms (${(ms / Math.max(1, rows.length)).toFixed(1)} ms/frame) · dpr ${dpr} · map ${map}${invert ? ' · 倒影' : ''}`, 8, 22);
}
