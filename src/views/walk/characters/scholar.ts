// 书生 · the Scholar — moon-white robe, indigo trim, a cinnabar sash, a bun with a jade pin and
// two hair ribbons that trail when he hurries; on his back a bamboo book-box (负笈) with scrolls.
// When he "plays" he reads.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, put } from './rig';

export const scholar: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.14, skin: '#f2dcc3', robe: '#e9e8df', trim: '#4b5a6b', hair: '#23201d', sash: '#a8463a', shoe: '#2b2926',
    eyes: 'dot', blush: 0.5, sleeve: 'wide',
  }, {}, 1);
  const hair = kit.toon('#23201d');
  const jade = kit.toon('#6f9a80');
  const hc = h.headC;

  // bun, pin, ribbons
  put(h.head, kit.mesh(kit.sphere(0.078, 1, 0.95, 1), hair), 0, hc + 0.19, -0.05);
  put(h.head, new THREE.Mesh(kit.cyl(0.008, 0.008, 0.25, 6), jade), 0, hc + 0.2, -0.05, 0, 0.3, Math.PI / 2);
  const ribM = '#4b5a6b';
  const ribbons = [new Ribbon(kit, ribM, 7, (u) => 0.04 * (1 - u * 0.35)), new Ribbon(kit, ribM, 7, (u) => 0.035 * (1 - u * 0.4))];
  for (const r of ribbons) h.head.add(r.mesh);
  ribbons.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(30, 7);

  // book box on the back: a bamboo case, a little canopy, two scrolls
  const bamboo = kit.tex(64, 64, (g, w, hh) => {
    g.fillStyle = '#c9ad78'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(80,55,25,0.55)'; g.lineWidth = 2;
    for (let x = 4; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
    g.strokeStyle = 'rgba(60,40,20,0.7)'; g.lineWidth = 4;
    for (const y of [10, 54]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const box = kit.group(h.back, 0, -0.08, -0.07);
  box.rotation.x = 0.08;
  put(box, kit.mesh(kit.box(0.24, 0.3, 0.14), kit.toon('#ffffff', { map: bamboo })), 0, 0, 0);
  const frame = kit.toon('#6b4a2a');
  for (const sx of [-1, 1]) put(box, kit.mesh(kit.cyl(0.011, 0.011, 0.42, 6), frame, OL * 0.6), 0.125 * sx, 0.04, -0.07);
  const canopy = put(box, kit.mesh(kit.cap(0.2, 0.55, 18, 4), kit.toon('#d8cdb4', { double: true }), OL * 0.7), 0, 0.24, 0.02);
  canopy.scale.set(1, 0.35, 0.8);
  const scrollM = kit.toon('#efe6d0');
  put(box, kit.mesh(kit.cyl(0.025, 0.025, 0.16, 10), scrollM, OL * 0.7), -0.05, 0.19, 0.0, 0, 0, 0.12);
  put(box, kit.mesh(kit.cyl(0.022, 0.022, 0.14, 10), kit.toon('#b9c6c9'), OL * 0.7), 0.05, 0.18, -0.02, 0.1, 0, -0.2);
  // two straps over the shoulders and down the chest, like a pack's
  const strapM = kit.toon('#6b4a2a');
  for (const sx of [1, -1]) {
    put(h.chest, kit.mesh(kit.box(0.028, 0.3, 0.012), strapM, OL * 0.5), 0.075 * sx, 0.14, 0.143, -0.12, 0, 0.1 * sx);
    put(h.chest, new THREE.Mesh(kit.box(0.028, 0.012, 0.3), strapM), 0.085 * sx, 0.29, -0.0, 0, 0, 0.12 * sx);
  }

  // an open book, only while reading
  const book = kit.group(h.chest, 0, 0.24, 0.34);
  const page = kit.box(0.13, 0.004, 0.18);
  const cover = kit.toon('#3c4d5e');
  const pl = put(book, kit.mesh(page, kit.toon('#f3ecdc'), OL * 0.5), 0.06, 0, 0, 0, 0, 0.2);
  const pr = put(book, kit.mesh(page, kit.toon('#f3ecdc'), OL * 0.5), -0.06, 0, 0, 0, 0, -0.2);
  put(pl, new THREE.Mesh(kit.box(0.125, 0.004, 0.165), cover), 0, -0.004, 0);
  put(pr, new THREE.Mesh(kit.box(0.125, 0.004, 0.165), cover), 0, -0.004, 0);
  book.rotation.set(-1.05, 0, 0);
  book.visible = false;

  h.onPose = (p, f) => {
    if (f.emote === 'play') {
      // reading: book held up before the face, head bowed to it, a slow nod
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      m('shRx', -0.55); m('shRz', 0.3); m('elRx', -1.25);
      m('shLx', -0.5); m('shLz', -0.3); m('elLx', -1.3);
      m('headX', 0.34 + Math.sin(f.t * 1.4) * 0.04); m('headY', Math.sin(f.t * 0.7) * 0.1); m('torsoX', 0.06);
    }
  };
  h.onAfter = (f) => {
    book.visible = f.emote === 'play' && f.env > 0.3;
    const trail = flow.step(Math.min(1.4, f.s.speed * 0.28 + (f.air ? 0.6 : 0)), f.dt);
    ribbons.forEach((r, i) => {
      const side = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.3 * u;
        const wave = Math.sin(f.t * 5 - u * 5 + i) * 0.03 * u * (0.4 + trail);
        c.set(0.03 * side + wave * side, hc + 0.18 - L * (1 - trail * 0.55), -0.1 - L * (0.25 + trail * 0.75));
        s.set(1, 0, 0);
      });
    });
  };
  return h;
};
