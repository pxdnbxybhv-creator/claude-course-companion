// 园丁 · the Gardener — a wide straw hat with a green band, an indigo farmer's jacket over rolled
// brown trousers, a linen apron, and a copper watering can that swings like a pendulum as he
// strides along. Standing, he wipes his brow, stretches his back with his hands on his hips, or
// squats to look at the soil. Watering tips the can; his skill (催花) takes the hoe from his
// back — two hands, up over the shoulder, and a great sweep along the ground.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Spring, bothHands, clamp, conicalHat, holdLevel, mix, put, smooth } from './rig';

export const gardener: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.1, skin: '#ecc39b', robe: '#3e6485', trim: '#2b3f55', hair: '#2a2420', sash: '#8b5e34', sashTails: false,
    pants: '#6e5a43', shoe: '#c29a58', hem: 0.3, flare: 0.2, sleeve: 'narrow', eyes: 'dot', mouth: 'smile', blush: 0.7,
  }, { stride: 0.8, bounce: 0.04, armSwing: 0.5 }, 2);
  const hc = h.headC;

  // straw hat with a band, tipped back
  const hat = conicalHat(kit, 0.3, 0.13, '#e3bf6f');
  put(hat, new THREE.Mesh(kit.cyl(0.13, 0.15, 0.05, 20, 'bottom', true), kit.toon('#5f9a5a', { double: true })), 0, 0.012, 0);
  put(h.head, hat, 0, hc + 0.1, -0.01, -0.22, 0, 0.05);

  // apron over the jacket, from chest to knee
  const linen = kit.toon('#ead6a8', { double: true });
  put(h.chest, kit.mesh(kit.box(0.17, 0.2, 0.012), linen, OL * 0.7), 0, 0.12, 0.147, -0.06, 0, 0);
  const apronGeo = kit.add(new THREE.CylinderGeometry(0.152, 0.215, 0.36, 16, 1, true, -Math.PI * 0.3, Math.PI * 0.6).translate(0, -0.18, 0));
  put(h.skirt, kit.mesh(apronGeo, linen, OL * 0.7), 0, -0.005, 0.012);
  // pocket with a trowel handle peeking out, and a sprig of flowers
  put(h.skirt, new THREE.Mesh(kit.box(0.08, 0.06, 0.01), kit.toon('#d3bd8a')), 0.06, -0.12, 0.2, -0.12, 0.2, 0);
  put(h.skirt, kit.mesh(kit.cyl(0.011, 0.011, 0.08, 6), kit.toon('#7a4f2c'), OL * 0.5), 0.075, -0.07, 0.2, 0.2, 0, -0.3);
  put(hat, new THREE.Mesh(kit.sphere(0.028, 1, 0.7, 1), kit.toon('#e0703f')), 0.13, 0.045, 0.02);
  put(hat, new THREE.Mesh(kit.sphere(0.022, 1, 0.7, 1), kit.toon('#f2c94c')), 0.15, 0.04, -0.03);

  // rolled trouser cuffs
  for (const leg of [h.legL, h.legR]) put(leg.knee, new THREE.Mesh(kit.torus(0.046, 0.014, 6, 14).rotateX(Math.PI / 2), kit.toon('#7b6a55')), 0, -0.07, 0);

  // the watering can
  const copper = kit.toon('#c47c3e');
  const can = kit.group(h.armR.hand, 0, -0.03, 0.02);
  put(can, kit.mesh(kit.cyl(0.065, 0.075, 0.13, 16), copper), 0, -0.1, 0.04);
  put(can, new THREE.Mesh(kit.torus(0.066, 0.008, 5, 18).rotateX(Math.PI / 2), kit.toon('#8a4f24')), 0, -0.035, 0.04);
  put(can, kit.mesh(kit.torus(0.06, 0.011, 6, 14, Math.PI), copper, OL * 0.6), 0, -0.02, 0.04, 0, Math.PI / 2, 0);
  put(can, kit.mesh(kit.tube([[0, -0.13, 0.1], [0, -0.09, 0.18], [0, -0.03, 0.25]], 0.012, 0.009, 10, 6), copper, OL * 0.6), 0, 0, 0);
  const rose = put(can, kit.mesh(kit.cyl(0.024, 0.012, 0.03, 10), copper, OL * 0.6), 0, -0.02, 0.26, -0.9, 0, 0);
  // three drops
  const dropM = kit.basic('#9cc6d8', { opacity: 0.85 });
  const drops = [0, 1, 2].map(() => { const d = new THREE.Mesh(kit.sphere(0.012, 1, 1.5, 1), dropM); can.add(d); d.visible = false; return d; });
  const swing = new Spring(26, 3.2);
  kit.keep(...drops);
  h.handProps.push(can);
  const want = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), eul = new THREE.Euler();

  // the hoe: across his back, or in both hands for the skill
  const hoe = kit.group();
  const wood = kit.toon('#a57443'), iron = kit.toon('#5c5550');
  put(hoe, kit.mesh(kit.cyl(0.014, 0.016, 1.05, 7), wood, OL * 0.55), 0, 0.3, 0);
  put(hoe, kit.mesh(kit.box(0.14, 0.012, 0.13), iron, OL * 0.55), 0, 0.82, 0.07, 0.25, 0, 0);
  put(hoe, new THREE.Mesh(kit.cyl(0.02, 0.02, 0.05, 8), iron), 0, 0.8, 0.0);
  let inHands = false;
  const stow = (hands: boolean) => {
    inHands = hands;
    if (hands) { hoe.position.set(0, -0.02, 0.01); hoe.rotation.set(-1.25, 0, 0); h.armR.hand.add(hoe); }
    else { hoe.position.set(0.1, -0.16, -0.07); hoe.rotation.set(0, 0, -0.95); h.back.add(hoe); }
  };
  stow(false);

  h.fidgets = [
    {
      id: 'brow', dur: 3, pose: (p, k, u) => {
        // the back of the left wrist across the brow, a puff of breath
        const m = h.mx.set(p, k).m;
        const wipe = Math.sin(clamp((u - 0.2) / 0.5) * Math.PI);
        m('shLx', -1.6); m('shLz', -0.55 + wipe * 0.5); m('elLx', -1.85); m('elLz', 0.2);
        m('headX', -0.08); m('headZ', 0.08 * wipe); m('torsoX', -0.03);
      },
    },
    {
      id: 'back', dur: 3.4, pose: (p, k, u) => {
        // hands on the small of the back, a lean back and a groan
        const m = h.mx.set(p, k).m;
        const arch = Math.sin(clamp(u / 0.85) * Math.PI);
        m('shLx', 0.55); m('shLz', 0.3); m('elLx', -1.3); m('elLz', -0.25);
        m('shRx', 0.55); m('shRz', -0.3); m('elRx', -1.3); m('elRz', 0.25);
        m('torsoX', -0.28 * arch); m('headX', -0.25 * arch); m('bodyX', -0.03 * arch);
      },
    },
    {
      id: 'soil', dur: 4.2, pose: (p, k, _u, secs) => {
        // squat and poke the soil with a finger
        const m = h.mx.set(p, k).m;
        m('bodyY', -0.2); m('bodyX', 0.12);
        m('hipLx', -1.4); m('knL', 2.1); m('hipRx', -1.3); m('knR', 2.0); m('hipLz', 0.25); m('hipRz', -0.25);
        m('torsoX', 0.3); m('headX', 0.35); m('headY', Math.sin(secs * 0.9) * 0.2);
        m('shLx', -0.7 + Math.sin(secs * 6) * 0.06); m('shLz', -0.1); m('elLx', -0.3);
        m('shRx', -0.4); m('shRz', -0.2); m('elRx', -0.9);
        m('skS', 0.8); m('skF', 1.1);
      },
    },
  ];

  h.onPose = (p, f) => {
    // the can arm swings less (it is heavy) and holds out a little — unless both hands are wanted
    const sk = f.emote === 'skill' ? f.env : 0;
    const lock = (1 - Math.max(bothHands(f, h.seat), sk)) * (f.fidget === 'back' || f.fidget === 'soil' ? 1 - f.fk : 1);
    p.shRz -= 0.12 * lock; p.shRx = mix(p.shRx, p.shRx * 0.5, lock); p.elRx = mix(p.elRx, Math.min(p.elRx, -0.25), lock);
    // a farmer's stride: a little rock of the shoulders with each step
    p.torsoZ += Math.sin(f.phase) * 0.05 * Math.min(1, f.gait);
    if (f.emote === 'water') {
      const m = h.mx.set(p, f.env).m;
      m('shRx', -1.1); m('shRz', -0.1); m('elRx', -0.2);
      m('shLx', -0.4); m('shLz', 0.2); m('elLx', -0.9);
    } else if (f.emote === 'skill') {
      // 催花: hoe up over the right shoulder, a great sweep down and across, a scrape, recover
      const m = h.mx.set(p, f.env).m;
      const up = smooth(f.u / 0.3), hit = smooth((f.u - 0.32) / 0.14), rec = smooth((f.u - 0.78) / 0.2);
      const arm = mix(mix(-0.6, -2.7, up), -0.75, hit) * (1 - rec) + -0.5 * rec;
      m('shRx', arm); m('shRz', 0.25 * (1 - hit) + 0.05); m('elRx', mix(-0.9, -0.15, hit));
      m('shLx', arm + 0.25); m('shLz', -0.35); m('elLx', mix(-1.1, -0.45, hit));
      m('torsoY', mix(0.45 * up, -0.35, hit) * (1 - rec)); m('torsoX', mix(-0.15 * up, 0.3, hit) * (1 - rec));
      m('bodyX', 0.08 * hit * (1 - rec)); m('headX', mix(-0.15 * up, 0.25, hit));
      m('hipLx', -0.45); m('hipRx', 0.3); m('knL', 0.3);
    }
  };
  h.onAfter = (f) => {
    const wantHoe = f.emote === 'skill' && f.env > 0.2;
    if (wantHoe !== inHands) stow(wantHoe);
    can.visible = !wantHoe && !h.holding && !h.mallet.visible;
    const pour = f.emote === 'water' ? f.env : 0;
    // the can hangs plumb from the hand wherever the arm goes (a wave lifts it, never flips it),
    // swinging like a pendulum behind the stride, and tips forward to pour
    const pend = Math.sin(f.phase - 0.9) * 0.4 * Math.min(1, f.gait) * (f.reduced ? 0.4 : 1);
    const lag = swing.step((h.armR.sh.rotation.x + h.armR.el.rotation.x) * 0.15 + pour * 0.75 + pend, f.dt);
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
