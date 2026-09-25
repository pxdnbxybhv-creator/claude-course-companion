// 琴师 · the Qin Player — a lady in pale lotus-root pink with long flowing sleeves, a high bun
// with a dangling hairpin (步摇) that swings as she walks, long hair down her back, and a guqin
// slung across her back in lacquer black with a cinnabar tassel. When she plays she kneels and
// lays the qin across her knees.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, put } from './rig';

export const musician: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.07, skin: '#f6e2d0', robe: '#f1e8e5', skirt: '#c8aab5', trim: '#5f7188', hair: '#1f1b1a', sash: '#9bb0bf',
    shoe: '#c8aab5', hem: 0.03, flare: 0.27, sleeve: 'long', eyes: 'lady', blush: 0.55, mouth: 'none', girth: 0.92, shoulder: 0.14,
  }, { stride: 0.68, armSwing: 0.22, legSwing: 0.45, lean: 0.03, bounce: 0.018 }, 4);
  const hc = h.headC;
  const hair = kit.toon('#1f1b1a');
  const gold = kit.toon('#c8a24e');

  // hair: a high bun of two loops, a side knot, long hair down the back
  put(h.head, kit.mesh(kit.sphere(0.085, 1.1, 0.9, 1), hair), 0, hc + 0.19, -0.04);
  put(h.head, kit.mesh(kit.torus(0.06, 0.026, 8, 18), hair), 0.02, hc + 0.3, -0.05, 0, 0.2, 0.25);
  put(h.head, kit.mesh(kit.sphere(0.05), hair), -0.14, hc + 0.1, -0.06);
  put(h.head, kit.mesh(kit.lathe([[0, -0.46], [0.07, -0.42], [0.11, -0.2], [0.13, 0.0], [0.1, 0.08], [0, 0.1]], 14), hair), 0, hc - 0.05, -0.08, 0.1, 0, 0).scale.set(1, 1, 0.5);
  // hairpin with a dangling string of beads (步摇)
  put(h.head, new THREE.Mesh(kit.cyl(0.007, 0.007, 0.22, 6), gold), 0.1, hc + 0.2, -0.04, 0, 0, -1.0);
  put(h.head, new THREE.Mesh(kit.sphere(0.022), kit.toon('#e7d9c0')), 0.19, hc + 0.26, -0.04);
  const tassel = kit.group(h.head, 0.19, hc + 0.25, -0.03);
  const beadM = kit.toon('#7fb39a');
  for (let i = 0; i < 3; i++) put(tassel, new THREE.Mesh(kit.sphere(0.011 - i * 0.002), i === 2 ? gold : beadM), 0, -0.035 - i * 0.03, 0);
  put(tassel, new THREE.Mesh(kit.cyl(0.0025, 0.0025, 0.1, 3, 'top'), gold), 0, 0, 0);
  const tasselSpring = new Spring(26, 3);
  // a flower at the side of the bun
  put(h.head, new THREE.Mesh(kit.sphere(0.028, 1, 0.6, 1), kit.toon('#d98f98')), -0.1, hc + 0.22, 0.0);

  // sash ribbons that float
  const ribs = [new Ribbon(kit, '#9bb0bf', 8, (u) => 0.045 * (1 - u * 0.3)), new Ribbon(kit, '#9bb0bf', 8, (u) => 0.04 * (1 - u * 0.3))];
  for (const r of ribs) h.body.add(r.mesh);
  ribs.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(24, 6);

  // the guqin: lacquer board, pale strings, a tassel
  const qin = kit.group();
  const lacquer = kit.toon('#3b2b25');
  const board = kit.shape([[-0.08, -0.46], [0.08, -0.46], [0.09, -0.2], [0.075, 0.1], [0.085, 0.3], [0.07, 0.46], [-0.07, 0.46], [-0.085, 0.3], [-0.075, 0.1], [-0.09, -0.2]], 0.035, 0.008);
  put(qin, kit.mesh(board, lacquer, OL * 0.8), 0, 0, 0);
  const strM = kit.basic('#e9dfc8');
  for (let i = 0; i < 7; i++) put(qin, new THREE.Mesh(kit.box(0.003, 0.84, 0.003), strM), -0.048 + i * 0.016, 0.0, 0.03);
  for (let i = 0; i < 13; i++) put(qin, new THREE.Mesh(kit.sphere(0.005, 1, 1, 0.5, 6, 4), strM), 0.068, -0.35 + i * 0.055, 0.028); // 徽 markers
  const qinTassel = put(qin, kit.mesh(kit.cyl(0.004, 0.018, 0.12, 6, 'top'), kit.toon('#b93a2b'), OL * 0.5), 0, -0.47, 0.0);
  const qinSpring = new Spring(28, 4);
  kit.keep(qinTassel);
  h.back.add(qin);
  const onBack = () => { qin.position.set(0, -0.08, -0.04); qin.rotation.set(0.12, Math.PI, 0.72); h.back.add(qin); };
  const onLap = () => { qin.position.set(0, 0.5, 0.37); qin.rotation.set(-Math.PI / 2 + 0.12, 0, Math.PI / 2); h.body.add(qin); };
  onBack();
  let lap = false;

  h.onPose = (p, f) => {
    if (f.emote === 'play') {
      // kneel and play: robe pooled, hands over the strings
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      const a = Math.sin(f.t * 7), b = Math.sin(f.t * 5.3 + 1);
      m('bodyY', -0.24); m('hipLx', -1.5); m('hipRx', -1.5); m('knL', 1.25); m('knR', 1.25);
      m('skX', -0.1); m('skS', 0.45); m('skF', 1.3);
      m('shLx', -0.6 + a * 0.08); m('shLz', -0.05); m('elLx', -0.85 + b * 0.1);
      m('shRx', -0.62 - b * 0.08); m('shRz', 0.05); m('elRx', -0.8 + a * 0.1);
      m('headX', 0.22); m('headZ', Math.sin(f.t * 0.9) * 0.08); m('bodyX', 0.1);
    }
  };
  h.onAfter = (f) => {
    const want = f.emote === 'play' && f.env > 0.5;
    if (want !== lap) { lap = want; if (lap) onLap(); else onBack(); }
    tassel.rotation.x = tasselSpring.step(-f.s.speed * 0.25 + Math.sin(f.phase) * 0.35 * Math.min(1, f.gait) - h.head.rotation.x, f.dt);
    tassel.rotation.z = Math.sin(f.phase * 0.5) * 0.25 * Math.min(1, f.gait);
    qinTassel.rotation.x = qinSpring.step(Math.sin(f.phase) * 0.5 * Math.min(1, f.gait), f.dt);
    const trail = flow.step(Math.min(1.2, f.s.speed * 0.3 + (f.air ? 0.5 : 0)), f.dt);
    ribs.forEach((r, i) => {
      const sx = i ? -0.05 : 0.07;
      r.update((u, c, s) => {
        const L = (i ? 0.42 : 0.5) * u;
        const w = Math.sin(f.t * 2.4 - u * 4 + i * 1.7) * 0.035 * u * (0.5 + trail);
        c.set(sx + w, 0.63 - L * (1 - trail * 0.45), 0.15 + u * 0.02 - L * trail * 0.8 - Math.abs(w) * 0.5);
        const a = u * 0.8 + i;
        s.set(Math.cos(a * 0.4), 0, Math.sin(a * 0.4) * 0.4).normalize();
      });
    });
  };
  return h;
};
