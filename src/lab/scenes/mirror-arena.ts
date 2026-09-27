// /lab.html?scene=mirror-arena&map=lake&invert=0&view=cam&n=120&scale=1.1&q=mid
// A 水月幻镜 arena painted through the real painter. view=full shows the whole layer (arenaImage);
// view=cam composes a fight at the camera in the engine's draw order (arena → telegraphs → drops →
// enemies → summons → player → player shots → enemy shots → numbers) and times the draw.
import { createPainter, blit, blitRot } from '../../views/mirror/paint';
import type { MapId } from '../../views/mirror/ids';
import { MONSTER_REG } from '../../views/mirror/ids';
import type { ArenaGeom, AtlasId, Camera, Quality, RunSave } from '../../views/mirror/types';
import { makeRng } from '../../core/rng';
import { createMirrorAudio } from '../../views/mirror/audio/sfx';
import { SFX_NAMES } from '../../views/mirror/audio/voices';

/** A stand-in for logic's arenaGeom (GDD §12 numbers). */
function geomOf(map: MapId, seed: number): ArenaGeom {
  const r = makeRng(seed);
  if (map === 'lake') {
    const obstacles = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + r() * 0.5, d = 260 + r() * 300; return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 45 + r() * 15, kind: 'lotus' as const, blocks: 'enemyShots' as const }; });
    return { shape: { kind: 'circle', r: 760 }, obstacles, minX: -760, minY: -760, maxX: 760, maxY: 760 };
  }
  if (map === 'forest') {
    const obstacles = Array.from({ length: 14 }, () => ({ x: (r() - 0.5) * 1500, y: (r() - 0.5) * 900, r: 40 + r() * 30, kind: 'bamboo' as const, blocks: 'shots' as const }));
    return { shape: { kind: 'rect', w: 1700, h: 1100 }, obstacles, minX: -850, minY: -550, maxX: 850, maxY: 550 };
  }
  return { shape: { kind: 'octagon', r: 820 }, obstacles: [{ x: 0, y: 0, r: 90, kind: 'tree', blocks: 'all' }], minX: -820, minY: -820, maxX: 820, maxY: 820 };
}

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const map = (p.get('map') ?? 'lake') as MapId;
  const invert = p.get('invert') === '1';
  const q = (p.get('q') ?? 'mid') as Quality;
  const dpr = window.devicePixelRatio || 1;
  const painter = createPainter(map, q, dpr);
  const geom = geomOf(map, 7);
  const t0 = performance.now();
  painter.paintArena(geom, 7, invert);
  const arenaMs = performance.now() - t0;
  const g = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  let audioNote = '';
  if (p.get('audio') === '1') {
    // prime the mirror's voices, play each once, switch the music theme by map
    const au = createMirrorAudio();
    const ta = performance.now();
    await au.prime();
    audioNote = ` · audio prime ${(performance.now() - ta).toFixed(0)} ms`;
    for (const n of SFX_NAMES) au.sfx(n);
    au.pickup(3);
    au.music('wave', map);
    au.music('boss', map);
  }
  if (p.get('view') === 'full') {
    const img = painter.arenaImage(Math.min(W, H), Math.min(W, H));
    g.fillStyle = '#222'; g.fillRect(0, 0, W, H);
    g.drawImage(img, (W - img.width) / 2, (H - img.height) / 2);
    g.fillStyle = '#fff'; g.font = `${13 * dpr}px system-ui`;
    g.fillText(`${map}${invert ? ' 倒影' : ''} · paintArena ${arenaMs.toFixed(0)} ms`, 12 * dpr, 20 * dpr);
    return;
  }
  const run = { char: (p.get('char') ?? 'swordsman'), map, wave: invert ? 34 : 12, weapons: [] } as unknown as RunSave;
  const tb = performance.now();
  await painter.bake(painter.plan(run, 'start'));
  if (invert) await painter.bake(painter.plan(run, 'endless'));
  const bakeMs = performance.now() - tb;
  const rng = makeRng(3);
  const roster = MONSTER_REG.filter((m) => m.map === 'all' || m.map === map).map((m) => `mon:${m.id}` as AtlasId);
  // stains from an earlier fight
  for (let i = 0; i < 60; i++) painter.stamp(i % 7 ? 'splat' : 'burn', (rng() - 0.5) * 900, (rng() - 0.5) * 700, 14 + rng() * 14, i);
  painter.wash(0.08);
  const scale = Number(p.get('scale') ?? 1.1) * dpr;
  const cam: Camera = { x: 60, y: 40, scale, w: W, h: H, dpr };
  const n = Number(p.get('n') ?? 120);
  const foes = Array.from({ length: n }, () => ({ id: roster[Math.floor(rng() * roster.length)], x: cam.x + (rng() - 0.5) * W / scale, y: cam.y + (rng() - 0.5) * H / scale, v: Math.floor(rng() * 3), f: rng() < 0.5 }));
  const drops = Array.from({ length: 60 }, (_, i) => ({ id: (i % 12 === 0 ? 'drop:cashCoin' : i % 9 === 0 ? 'drop:moonThick' : 'drop:moonDrop') as AtlasId, x: cam.x + (rng() - 0.5) * W / scale, y: cam.y + (rng() - 0.5) * H / scale }));
  const eshots = Array.from({ length: 80 }, (_, i) => ({ id: (['proj:eFireball', 'proj:eSeed', 'proj:eOrb', 'proj:eFrost'] as AtlasId[])[i % 4], x: cam.x + (rng() - 0.5) * W / scale, y: cam.y + (rng() - 0.5) * H / scale, a: rng() * 6.28 }));
  const pshots = Array.from({ length: 60 }, (_, i) => ({ id: (['proj:flySword', 'proj:dartStar', 'proj:noteGlyph', 'proj:sunArrow'] as AtlasId[])[i % 4], x: cam.x + (rng() - 0.5) * W / scale, y: cam.y + (rng() - 0.5) * H / scale, a: rng() * 6.28 }));
  const frame = () => {
    painter.drawArena(g, cam);
    painter.drawTele(g, cam, { kind: 'circle', x: cam.x - 140, y: cam.y + 60, r: 90 }, 0.6);
    painter.drawTele(g, cam, { kind: 'line', x: cam.x + 60, y: cam.y - 150, dir: 0.4, len: 320, w: 40 }, 0.35);
    painter.drawTele(g, cam, { kind: 'ring', x: cam.x, y: cam.y, r: 170, r2: 200, gaps: [{ at: 0.6, w: 0.7 }, { at: 3.4, w: 0.7 }] }, 0.8);
    painter.drawTele(g, cam, { kind: 'cone', x: cam.x + 200, y: cam.y + 120, dir: 3.6, r: 160, deg: 70 }, 0.5);
    painter.drawTele(g, cam, { kind: 'fan', x: cam.x - 220, y: cam.y - 120, dir: 0.5, deg: 30, n: 3 }, 0.7);
    painter.drawZone(g, cam, 'flowerbed', cam.x + 110, cam.y + 170, 90, 0.65);
    painter.drawZone(g, cam, 'netMesh', cam.x - 260, cam.y + 170, 80, 0.7);
    for (const d of drops) { const s = painter.sprite(d.id); if (s) blit(g, cam, s, d.x, d.y); }
    for (const e of foes) { const s = painter.sprite(e.id, e.v); if (s) blit(g, cam, s, e.x, e.y, 1, e.f); }
    const sm = painter.sprite('sum:mohu'); if (sm) blit(g, cam, sm, cam.x - 60, cam.y + 30);
    const pl = painter.sprite(`char:${run.char}` as AtlasId, 1); if (pl) blit(g, cam, pl, cam.x, cam.y);
    const wp = painter.sprite('wpn:qingfeng'); if (wp) blitRot(g, cam, wp, cam.x + 14, cam.y, -0.5);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#d63a22'; g.beginPath(); g.arc(W / 2, H / 2, 2.5 * dpr, 0, 7); g.fill();
    for (const s of pshots) { const sp = painter.sprite(s.id); if (sp) blitRot(g, cam, sp, s.x, s.y, s.a, 1, 0.9); }
    for (const s of eshots) { const sp = painter.sprite(s.id); if (sp) blitRot(g, cam, sp, s.x, s.y, s.a, 1.5); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    painter.drawNumber(g, 1234, W * 0.3, H * 0.3, 'hit', 1, 'zh');
    painter.drawNumber(g, 45678, W * 0.36, H * 0.26, 'crit', 1, 'zh');
    painter.drawNumber(g, 45678, W * 0.36, H * 0.34, 'crit', 1, 'en');
    painter.drawNumber(g, 12, W * 0.62, H * 0.62, 'heal', 1, 'zh');
    painter.drawNumber(g, 5, W * 0.66, H * 0.3, 'coin', 1, 'zh');
    painter.drawNumber(g, 3, W * 0.7, H * 0.36, 'moon', 1, 'zh');
    painter.drawNumber(g, 8, W * 0.52, H * 0.46, 'player', 1, 'zh');
  };
  frame();
  // time the draw (a few frames)
  const reps = 20, tf = performance.now();
  for (let i = 0; i < reps; i++) frame();
  const drawMs = (performance.now() - tf) / reps;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, 26 * dpr);
  g.fillStyle = '#fff'; g.font = `${13 * dpr}px system-ui`;
  g.fillText(`${map}${invert ? ' 倒影' : ''} · q ${q} · paintArena ${arenaMs.toFixed(0)} ms · bake ${bakeMs.toFixed(0)} ms · draw ${drawMs.toFixed(2)} ms/frame (${n} foes, 60 drops, 140 shots)${audioNote}`, 10 * dpr, 18 * dpr);
}
