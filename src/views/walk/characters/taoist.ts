// 道童 · the Taoist Child — small and big-headed, twin buns (双丫髻) tied with ribbons, a grey-blue
// Taoist robe with black trim, white socks, and a horsetail fly-whisk (拂尘) that flicks as he
// skips along. Playing twirls the whisk.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, mix, put } from './rig';

export const taoist: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 0.84, skin: '#f7e0c9', robe: '#a3b4be', trim: '#2c323c', hair: '#1d1a18', sash: '#2c323c', sashTails: true,
    pants: '#f1ede4', shoe: '#1f1d1c', hem: 0.1, flare: 0.23, sleeve: 'wide', eyes: 'dot', mouth: 'o', blush: 0.75, headR: 0.2,
  }, { stride: 0.62, bounce: 0.065, armSwing: 0.6, legSwing: 0.65 }, 6);
  const hc = h.headC;
  const hair = kit.toon('#1d1a18');

  // twin buns with little ribbons
  const ribs: Ribbon[] = [];
  // (the hair cap is 0.21 round the skull's centre: the ties sit on the buns, well outside it)
  const tie = kit.toon('#c0412f');
  for (const sx of [1, -1]) {
    put(h.head, kit.mesh(kit.sphere(0.07), hair), 0.12 * sx, hc + 0.19, -0.02);
    // a red band round each bun, square to the line from the skull's centre so it rings the bun
    const d = new THREE.Vector3(0.12 * sx, 0.19, -0.02).normalize();
    const band = put(h.head, kit.mesh(kit.torus(0.068, 0.015, 6, 18), tie, OL * 0.5), 0.114 * sx, hc + 0.18, -0.02);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const r = new Ribbon(kit, '#c0412f', 6, (u) => 0.036 * (1 - u * 0.35));
    h.head.add(r.mesh);
    r.twist = 0.5 * sx;
    ribs.push(r);
  }
  // a tuft of fringe
  put(h.head, kit.mesh(kit.sphere(0.07, 1.6, 0.5, 0.8), hair), 0, hc + 0.15, 0.13, 0.5, 0, 0);

  // the fly-whisk: a handle and a white horsetail
  const whisk = kit.group(h.armR.hand, 0, -0.02, 0.02);
  put(whisk, kit.mesh(kit.cyl(0.012, 0.014, 0.26, 8), kit.toon('#7b5a3a'), OL * 0.6), 0, 0.02, 0, 0, 0, 0);
  put(whisk, new THREE.Mesh(kit.cyl(0.02, 0.02, 0.03, 8), kit.toon('#c8a24e')), 0, -0.11, 0);
  const tail = kit.group(whisk, 0, -0.12, 0);
  put(tail, kit.mesh(kit.lathe([[0.0, -0.3], [0.03, -0.26], [0.045, -0.1], [0.025, 0.0], [0, 0.01]], 10), kit.toon('#f3f0e8'), OL * 0.6), 0, 0, 0);
  const tailSpring = new Spring(30, 4);
  const tailSide = new Spring(30, 4);
  whisk.rotation.x = 1.1;

  h.onPose = (p, f) => {
    // the whisk arm is carried a little forward
    p.elRx = mix(Math.min(p.elRx, -0.55), p.elRx, bothHands(f, h.seat));
    if (f.emote === 'play' || f.emote === 'cast') {
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      const a = f.t * 7;
      m('shRx', -1.6 + Math.sin(a) * 0.6); m('shRz', -0.3 + Math.cos(a) * 0.5); m('elRx', -0.6);
      m('shLx', -0.5); m('shLz', 0.5); m('elLx', -1.2);
      m('bodyZ', Math.sin(a) * 0.06); m('headZ', -Math.sin(a) * 0.08);
    }
  };
  h.onAfter = (f) => {
    const armA = h.armR.sh.rotation.x + h.armR.el.rotation.x;
    tail.rotation.x = tailSpring.step(-armA * 0.6 - 0.2 - f.s.speed * 0.15, f.dt);
    tail.rotation.z = tailSide.step(Math.sin(f.phase) * 0.3 * Math.min(1, f.gait) + (f.emote === 'play' ? Math.sin(f.t * 7) * 0.6 : 0), f.dt);
    ribs.forEach((r, i) => {
      const sx = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.2 * u;
        const w = Math.sin(f.t * 6 - u * 4 + i) * 0.02 * u;
        // from the outer side of the bun, hanging clear of the head (the skull is 0.21 round)
        c.set((0.19 + u * 0.05) * sx, hc + 0.15 - L * (1 - Math.min(0.6, f.s.speed * 0.15)), -0.04 - L * Math.min(0.9, 0.2 + f.s.speed * 0.2) + w);
        s.set(1, 0, 0.35 * sx).normalize();
      });
    });
  };
  return h;
};
