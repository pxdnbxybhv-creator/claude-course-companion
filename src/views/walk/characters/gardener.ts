// 园丁 · the Gardener — a wide straw hat, a farmer's indigo jacket with rolled trousers, a linen
// apron, and a copper watering can that swings as he walks. Watering tips the can and a few
// drops fall from the rose.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Spring, bothHands, conicalHat, holdLevel, mix, put } from './rig';

export const gardener: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.1, skin: '#e9c7a3', robe: '#5f7488', trim: '#3c4a58', hair: '#2a2420', sash: '#8b6b45', sashTails: false,
    pants: '#4d4943', shoe: '#b99b62', hem: 0.3, flare: 0.2, sleeve: 'narrow', eyes: 'dot', mouth: 'smile', blush: 0.65,
  }, { stride: 0.78, bounce: 0.035 }, 2);
  const hc = h.headC;

  // straw hat with a band, tipped back
  const hat = conicalHat(kit, 0.3, 0.13, '#d8bb78');
  put(hat, new THREE.Mesh(kit.cyl(0.13, 0.15, 0.05, 20, 'bottom', true), kit.toon('#6f8a6a', { double: true })), 0, 0.012, 0);
  put(h.head, hat, 0, hc + 0.1, -0.01, -0.22, 0, 0.05);

  // apron over the jacket, from chest to knee
  const linen = kit.toon('#dccfae', { double: true });
  const bib = put(h.chest, kit.mesh(kit.box(0.17, 0.2, 0.012), linen, OL * 0.7), 0, 0.12, 0.147, -0.06, 0, 0);
  void bib;
  const apronGeo = kit.add(new THREE.CylinderGeometry(0.152, 0.215, 0.36, 16, 1, true, -Math.PI * 0.3, Math.PI * 0.6).translate(0, -0.18, 0));
  put(h.skirt, kit.mesh(apronGeo, linen, OL * 0.7), 0, -0.005, 0.012);
  // pocket with a trowel handle peeking out
  put(h.skirt, new THREE.Mesh(kit.box(0.08, 0.06, 0.01), kit.toon('#c8b88f')), 0.06, -0.12, 0.2, -0.12, 0.2, 0);
  put(h.skirt, kit.mesh(kit.cyl(0.011, 0.011, 0.08, 6), kit.toon('#7a5634'), OL * 0.5), 0.075, -0.07, 0.2, 0.2, 0, -0.3);

  // rolled trouser cuffs
  for (const leg of [h.legL, h.legR]) put(leg.knee, new THREE.Mesh(kit.torus(0.046, 0.014, 6, 14).rotateX(Math.PI / 2), kit.toon('#66615a')), 0, -0.07, 0);

  // the watering can
  const copper = kit.toon('#b07a45');
  const can = kit.group(h.armR.hand, 0, -0.03, 0.02);
  const body = put(can, kit.mesh(kit.cyl(0.065, 0.075, 0.13, 16), copper), 0, -0.1, 0.04);
  put(can, new THREE.Mesh(kit.torus(0.066, 0.008, 5, 18).rotateX(Math.PI / 2), kit.toon('#7d4f2a')), 0, -0.035, 0.04);
  put(can, kit.mesh(kit.torus(0.06, 0.011, 6, 14, Math.PI), copper, OL * 0.6), 0, -0.02, 0.04, 0, Math.PI / 2, 0);
  const spout = put(can, kit.mesh(kit.tube([[0, -0.13, 0.1], [0, -0.09, 0.18], [0, -0.03, 0.25]], 0.012, 0.009, 10, 6), copper, OL * 0.6), 0, 0, 0);
  const rose = put(can, kit.mesh(kit.cyl(0.024, 0.012, 0.03, 10), copper, OL * 0.6), 0, -0.02, 0.26, -0.9, 0, 0);
  void body; void spout;
  // three drops
  const dropM = kit.basic('#8fb4c8', { opacity: 0.85 });
  const drops = [0, 1, 2].map(() => { const d = new THREE.Mesh(kit.sphere(0.012, 1, 1.5, 1), dropM); can.add(d); d.visible = false; return d; });
  const swing = new Spring(40, 5);
  h.handProps.push(can);
  const want = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), eul = new THREE.Euler();

  h.onPose = (p, f) => {
    // the can arm swings less (it is heavy) and holds out a little — unless both hands are wanted
    const lock = 1 - bothHands(f, h.seat);
    p.shRz -= 0.12 * lock; p.shRx = mix(p.shRx, p.shRx * 0.5, lock); p.elRx = mix(p.elRx, Math.min(p.elRx, -0.25), lock);
    if (f.emote === 'water') {
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      m('shRx', -1.1); m('shRz', -0.1); m('elRx', -0.2);
      m('shLx', -0.4); m('shLz', 0.2); m('elLx', -0.9);
    }
  };
  h.onAfter = (f) => {
    const pour = f.emote === 'water' ? f.env : 0;
    // the can hangs plumb from the hand wherever the arm goes (a wave lifts it, never flips it),
    // swinging a little behind the arm, and tips forward to pour
    const lag = swing.step((h.armR.sh.rotation.x + h.armR.el.rotation.x) * 0.15 + pour * 0.75, f.dt);
    holdLevel(can, h.scaler, want.setFromEuler(eul.set(lag, 0, 0)), tmpQ);
    drops.forEach((d, i) => {
      d.visible = pour > 0.6;
      if (!d.visible) return;
      const k = (f.t * 1.8 + i / 3) % 1;
      d.position.set(Math.sin(i * 2.1) * 0.015, rose.position.y - 0.03 - k * 0.3, rose.position.z + 0.03 + k * 0.05);
    });
  };
  return h;
};
