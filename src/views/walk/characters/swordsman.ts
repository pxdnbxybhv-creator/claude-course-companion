// 侠客 · the Wandering Swordsman — ink-dark robe cut for travel, leather belt and wrist guards,
// a bamboo hat hung with a gauze veil that lifts when he runs, a sword slung across his back
// with a cinnabar tassel, and a long scarf tail. He runs with his arms swept back.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, conicalHat, put } from './rig';

export const swordsman: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.17, skin: '#ecd0b3', robe: '#343a44', skirt: '#2d323b', trim: '#15171a', hair: '#1a1918', sash: '#6a5640', sashTails: false,
    pants: '#262a31', shoe: '#18171a', hem: 0.19, flare: 0.22, sleeve: 'narrow', eyes: 'fierce', blush: 0.2, shoulder: 0.165,
  }, { stride: 0.95, runStride: 1.55, trailArms: true, runLean: 0.38, lean: 0.08, armSwing: 0.38 }, 5);
  const hc = h.headC;

  // leather wrist guards and belt buckle
  const leather = kit.toon('#5b4633');
  for (const a of [h.armL, h.armR]) put(a.el, kit.mesh(kit.cyl(0.058, 0.055, 0.08, 10), leather, OL * 0.6), 0, -0.13, 0);
  put(h.waist, new THREE.Mesh(kit.box(0.05, 0.045, 0.02), kit.toon('#b08a4a')), 0, 0, 0.15);
  // high boots
  for (const l of [h.legL, h.legR]) put(l.knee, kit.mesh(kit.cyl(0.052, 0.05, 0.13, 10, 'top'), kit.toon('#1d1c1e'), OL * 0.6), 0, -0.04, 0);

  // hat and veil
  const hat = conicalHat(kit, 0.29, 0.12, '#b9a270', { knob: true });
  put(h.head, hat, 0, hc + 0.1, 0, -0.06, 0, 0);
  const veilGeo = kit.add(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 24, 1, true, Math.PI * 0.28, Math.PI * 1.44).translate(0, -0.1, 0));
  const veil = put(hat, new THREE.Mesh(veilGeo, kit.toon('#e6e1d6', { double: true, opacity: 0.55 })), 0, -0.005, 0);
  const veilSpring = new Spring(30, 5);

  // sword on the back: scabbard, guard, grip, pommel, tassel
  const sword = kit.group(h.back, 0, -0.02, -0.03);
  sword.rotation.set(0, 0, 0.75);
  const dark = kit.toon('#221e1c'), bronze = kit.toon('#b08a4a');
  put(sword, kit.mesh(kit.cyl(0.022, 0.018, 0.62, 8), dark), 0, -0.05, 0);
  put(sword, new THREE.Mesh(kit.cyl(0.024, 0.024, 0.03, 8), bronze), 0, 0.2, 0);
  put(sword, new THREE.Mesh(kit.cyl(0.021, 0.024, 0.04, 8), bronze), 0, -0.34, 0);
  put(sword, kit.mesh(kit.box(0.1, 0.022, 0.04), bronze, OL * 0.6), 0, 0.27, 0);
  put(sword, kit.mesh(kit.cyl(0.015, 0.015, 0.13, 8), kit.toon('#3a3431'), OL * 0.6), 0, 0.35, 0);
  put(sword, new THREE.Mesh(kit.sphere(0.022), bronze), 0, 0.425, 0);
  const tasselG = kit.group(sword, 0, 0.43, 0);
  put(tasselG, kit.mesh(kit.cyl(0.004, 0.02, 0.12, 6, 'top'), kit.toon('#b93a2b'), OL * 0.5), 0, -0.01, 0);
  const tasselSpring = new Spring(24, 3);
  // strap across the chest
  put(h.chest, new THREE.Mesh(kit.box(0.03, 0.38, 0.012), leather), 0, 0.16, 0.14, -0.1, 0, -0.75);

  // scarf tail
  const scarf = new Ribbon(kit, '#50565f', 9, (u) => 0.06 * (1 - u * 0.5));
  h.body.add(scarf.mesh);
  scarf.twist = 1.2;
  put(h.chest, kit.mesh(kit.torus(0.075, 0.03, 6, 18).rotateX(Math.PI / 2), kit.toon('#50565f'), OL * 0.6), 0, 0.31, 0);
  const flow = new Spring(26, 6);

  h.onPose = (p, f) => {
    if (f.emote === 'bow' || f.emote === 'wave') {
      // 抱拳: right fist in left palm before the chest
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      m('shLx', -1.05); m('shLz', -0.48); m('elLx', -1.2); m('elLz', 0);
      m('shRx', -1.05); m('shRz', 0.5); m('elRx', -1.2);
      if (f.emote === 'wave') { m('bodyX', 0.12); m('headX', 0.1); }
    }
  };
  h.onAfter = (f) => {
    const trail = flow.step(Math.min(1.5, f.s.speed * 0.3 + (f.air ? 0.6 : 0)), f.dt);
    veil.rotation.x = veilSpring.step(-Math.min(0.5, f.s.speed * 0.09) + (f.air ? 0.2 : 0), f.dt);
    tasselG.rotation.z = -0.75 + tasselSpring.step(Math.sin(f.phase) * 0.4 * Math.min(1, f.gait), f.dt);
    scarf.update((u, c, s) => {
      const L = 0.55 * u;
      const w = Math.sin(f.t * 6 - u * 6) * 0.05 * u * (0.3 + trail);
      c.set(0.06 + w, 0.9 - L * (1 - trail * 0.6), -0.14 - L * (0.2 + trail * 0.8));
      s.set(1, 0, 0);
    });
  };
  return h;
};
