// 画师 · the Painter — a black 幞头 cap whose two soft ties flutter behind him, a tea-white robe
// spattered with ink and a dot or two of colour, a brush tucked behind his ear, and a scroll
// tube slung on his back. Playing, he paints the air with a big brush.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, put } from './rig';

export const painter: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.12, skin: '#f0d7bd', robe: '#ddd3bb', trim: '#6b5a44', hair: '#23201d', sash: '#5f8a6e',
    shoe: '#2b2926', hem: 0.08, sleeve: 'wide', eyes: 'dot', blush: 0.45, mouth: 'none',
  }, { stride: 0.86 }, 7);
  const hc = h.headC;

  // ink spatters on the robe (a painted map on the skirt)
  const spatter = kit.tex(256, 128, (g, w, hh) => {
    g.fillStyle = '#ddd3bb'; g.fillRect(0, 0, w, hh);
    const blot = (x: number, y: number, r: number, c: string) => {
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + x; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.4, r * 0.25, 0, Math.PI * 2); g.fill(); }
    };
    blot(40, 90, 7, 'rgba(27,25,22,0.8)'); blot(150, 100, 5, 'rgba(27,25,22,0.75)'); blot(200, 70, 4, 'rgba(61,90,115,0.8)');
    blot(95, 105, 4, 'rgba(184,58,75,0.75)'); blot(230, 105, 6, 'rgba(27,25,22,0.7)'); blot(120, 60, 3, 'rgba(217,166,46,0.85)');
  });
  h.skirtMesh.material = kit.toon('#ffffff', { map: spatter });

  // 幞头: a black cap with a raised back and two soft ties
  const black = kit.toon('#1e1c1b');
  put(h.head, kit.mesh(kit.cap(h.headR + 0.018, Math.PI * 0.5, 22, 8), black), 0, hc + 0.01, -0.01, -0.3, 0, 0);
  put(h.head, kit.mesh(kit.sphere(0.085, 1.1, 1, 0.9), black), 0, hc + 0.17, -0.06);
  const ties = [new Ribbon(kit, '#1e1c1b', 7, (u) => 0.04 * (1 - u * 0.3)), new Ribbon(kit, '#1e1c1b', 7, (u) => 0.04 * (1 - u * 0.3))];
  for (const r of ties) h.head.add(r.mesh);
  ties.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(28, 6);

  // a brush behind the right ear
  const brush = kit.group(h.head, -0.16, hc + 0.07, -0.02);
  brush.rotation.set(0.3, 0, 0.9);
  put(brush, kit.mesh(kit.cyl(0.008, 0.008, 0.17, 6), kit.toon('#c9a870'), OL * 0.5), 0, 0, 0);
  put(brush, new THREE.Mesh(kit.cyl(0.001, 0.012, 0.04, 6), black), 0, -0.1, 0);

  // scroll tube across the back
  const tube = kit.group(h.back, 0, -0.06, -0.05);
  tube.rotation.set(0, 0, -0.9);
  put(tube, kit.mesh(kit.cyl(0.045, 0.045, 0.56, 12), kit.toon('#7d4f36')), 0, 0, 0);
  for (const y of [-0.28, 0.28]) put(tube, kit.mesh(kit.cyl(0.05, 0.05, 0.045, 12), kit.toon('#3b2a24'), OL * 0.6), 0, y, 0);
  put(tube, new THREE.Mesh(kit.torus(0.047, 0.007, 5, 14).rotateX(Math.PI / 2), kit.toon('#c8a24e')), 0, 0.12, 0);
  put(h.chest, new THREE.Mesh(kit.box(0.025, 0.36, 0.012), kit.toon('#6b5a44')), 0, 0.17, 0.14, -0.1, 0, 0.8);

  // a big brush for painting the air
  const bigBrush = kit.group(h.armR.hand, 0, -0.02, 0.02);
  put(bigBrush, kit.mesh(kit.cyl(0.014, 0.014, 0.34, 8), kit.toon('#b08d5a'), OL * 0.6), 0, 0.06, 0);
  put(bigBrush, kit.mesh(kit.lathe([[0, -0.1], [0.025, -0.05], [0.028, 0.0], [0.016, 0.02], [0, 0.02]], 10), black, OL * 0.6), 0, -0.12, 0);
  bigBrush.rotation.x = 1.3;
  bigBrush.visible = false;

  h.onPose = (p, f) => {
    if (f.emote === 'play') {
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      const a = f.t * 2.6;
      m('shRx', -1.3 + Math.sin(a) * 0.5); m('shRz', -0.3 + Math.sin(a * 2) * 0.35); m('elRx', -0.5);
      m('shLx', -0.4); m('shLz', 0.25); m('elLx', -1.1);
      m('torsoY', Math.sin(a) * 0.2); m('headY', Math.sin(a) * 0.2); m('bodyX', 0.06);
    }
  };
  h.onAfter = (f) => {
    bigBrush.visible = f.emote === 'play' && f.env > 0.3;
    brush.visible = !bigBrush.visible;
    const trail = flow.step(Math.min(1.3, f.s.speed * 0.3 + (f.air ? 0.6 : 0)), f.dt);
    ties.forEach((r, i) => {
      const sx = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.34 * u;
        const w = Math.sin(f.t * 5 - u * 5 + i * 2) * 0.03 * u * (0.4 + trail);
        c.set(0.05 * sx + w * sx + u * 0.06 * sx, hc + 0.12 - L * (1 - trail * 0.6), -0.15 - L * (0.2 + trail * 0.8));
        s.set(1, 0, 0.3 * sx).normalize();
      });
    });
  };
  return h;
};
