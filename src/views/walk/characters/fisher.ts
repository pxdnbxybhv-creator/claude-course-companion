// 渔翁 · the Old Fisherman — 斗笠 and 蓑衣 (a shaggy straw cape), a long white beard and white
// brows, a bamboo rod over his shoulder with the line swinging from its tip, and a fish creel
// at his hip. He stoops a little and walks slowly; casting swings the rod out over the water.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Spring, bothHands, conicalHat, put, strawTex } from './rig';

export const fisher: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.08, skin: '#e2bf9c', robe: '#8b8878', trim: '#4d4a40', hair: '#e9e6de', sash: '#5c5140', sashTails: false,
    pants: '#5d594e', shoe: '#9d8458', hem: 0.2, flare: 0.21, sleeve: 'narrow', eyes: 'old', brows: '#f1eee6', blush: 0.35,
  }, { stride: 0.66, stoop: 0.14, bounce: 0.018, armSwing: 0.28, legSwing: 0.45 }, 3);
  const hc = h.headC;

  // 斗笠
  put(h.head, conicalHat(kit, 0.33, 0.17, '#cbb27a', { knob: true }), 0, hc + 0.11, -0.01, -0.12, 0, 0);

  // 蓑衣: two shaggy tiers of straw over the shoulders
  const straw = kit.toon('#ffffff', { map: strawTex(kit, '#9c8b5e', 'rgba(60,45,20,0.55)', 40), double: true });
  const tier = (r0: number, r1: number, len: number) =>
    kit.lathe([[r1 - 0.012, -len - 0.004], [r1, -len], [(r0 + r1) / 2 + 0.025, -len * 0.5], [r0, 0], [0, 0.03]], 22);
  const cape1 = put(h.chest, kit.mesh(tier(0.09, 0.25, 0.3), straw, OL * 0.8), 0, 0.33, -0.005);
  const cape2 = put(h.skirt, kit.mesh(tier(0.19, 0.27, 0.22), straw, OL * 0.8), 0, -0.02, -0.01);
  // shaggy fringe: little straw tufts round the hems
  const tuft = kit.cyl(0.0, 0.018, 0.07, 4, 'top');
  const tuftM = kit.toon('#86764c');
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    put(cape1, new THREE.Mesh(tuft, tuftM), Math.sin(a) * 0.245, -0.29, Math.cos(a) * 0.245, Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    put(cape2, new THREE.Mesh(tuft, tuftM), Math.sin(a + 0.17) * 0.265, -0.21, Math.cos(a + 0.17) * 0.265, Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15);
  }
  void cape2;

  // the long white beard (and moustache), on a spring
  const white = kit.toon('#f1eee6');
  const beard = kit.group(h.head, 0, hc - 0.1, 0.13);
  put(beard, kit.mesh(kit.lathe([[0.0, -0.26], [0.03, -0.2], [0.065, -0.07], [0.07, 0.0], [0.0, 0.03]], 12), white, OL * 0.8), 0, 0, 0, 0.12, 0, 0);
  const mous = kit.tube([[-0.07, -0.03, 0], [-0.03, 0.01, 0.02], [0, 0.015, 0.025], [0.03, 0.01, 0.02], [0.07, -0.03, 0]], 0.012, 0.012, 12, 5);
  put(h.head, kit.mesh(mous, white, OL * 0.6), 0, hc - 0.06, 0.155);
  const beardSpring = new Spring(35, 5);

  // creel at the hip
  const creel = put(h.waist, kit.mesh(kit.lathe([[0, -0.12], [0.06, -0.12], [0.08, -0.06], [0.06, 0.0], [0.045, 0.02], [0, 0.02]], 14), kit.toon('#ffffff', { map: strawTex(kit, '#a78d5a', 'rgba(70,50,20,0.6)', 16) })), -0.19, -0.08, 0.02, 0, 0, 0.15);
  const creelSpring = new Spring(30, 4);

  // the rod: over the right shoulder, the line hanging from the tip
  const bamboo = kit.toon('#8f7b48');
  const rod = kit.group();
  put(rod, kit.mesh(kit.tube([[0, 0, 0], [0, 0.6, 0.02], [0, 1.2, 0.08], [0, 1.65, 0.2]], 0.014, 0.005, 16, 5), bamboo, OL * 0.55), 0, -0.18, 0);
  const lineGeo = kit.cyl(0.0022, 0.0022, 0.55, 3, 'top');
  const line = put(rod, new THREE.Mesh(lineGeo, kit.basic('#403a32')), 0, 1.47, 0.2);
  const float = put(line, new THREE.Mesh(kit.sphere(0.018, 1, 1.4, 1, 8, 6), kit.toon('#c0412f')), 0, -0.4, 0);
  void float;
  const lineSpring = new Spring(22, 3);
  kit.keep(creel, line);
  // his own rod: on the shoulder, or slung across the back while both hands are busy (rowing, a
  // bow); hidden while a feature has lent him its rod (so there are never two)
  h.handProps.push(rod);
  let slung = true;
  const sling = (on: boolean) => {
    slung = on;
    // across the back: centred on the shoulder blades, the line wound up
    if (on) { rod.rotation.set(0, 0, 0.5); rod.position.set(0.12, -0.15, -0.1); h.back.add(rod); }
    else { rod.position.set(0, -0.02, 0.02); h.armR.hand.add(rod); }
    line.visible = !on;
  };
  sling(false);
  const casting = (f: { emote: string | null; env: number }) => (f.emote === 'cast' || f.emote === 'throw' ? f.env : 0);
  const busy = (f: Parameters<typeof bothHands>[0]) => (casting(f) > 0 ? 0 : bothHands(f, h.seat));

  h.onPose = (p, f) => {
    // hold the rod on the shoulder: right hand up by the collar
    const k = 1 - Math.max(casting(f), busy(f));
    p.shRx = p.shRx + (-0.55 - p.shRx) * k; p.shRz = p.shRz + (0.18 - p.shRz) * k; p.elRx = p.elRx + (-1.85 - p.elRx) * k;
  };
  h.onAfter = (f) => {
    const want = busy(f) > 0.5;
    if (want !== slung) sling(want);
    const casting = f.emote === 'cast' || f.emote === 'throw' ? f.env : 0;
    // the rod's pitch in body space (0 = straight up, + = forward): back over the shoulder, or the cast
    const armAngle = h.armR.sh.rotation.x + h.armR.el.rotation.x;
    const wind = Math.min(1, f.u / 0.4), rel = Math.max(0, Math.min(1, (f.u - 0.4) / 0.2));
    const castPitch = -0.6 - 0.6 * wind + 1.9 * rel * rel * (3 - 2 * rel);
    const pitch = -0.95 * (1 - casting) + castPitch * casting;
    if (!slung) {
      rod.rotation.x = pitch - armAngle - h.torso.rotation.x;
      rod.rotation.z = 0.12 * (1 - casting);
    }
    line.rotation.x = lineSpring.step(slung ? -f.s.speed * 0.12 : -(rod.rotation.x + armAngle) - f.s.speed * 0.12, f.dt);
    beard.rotation.x = beardSpring.step(-f.s.speed * 0.08 + (f.air ? -0.4 : 0) - h.head.rotation.x * 0.5, f.dt);
    creel.rotation.x = creelSpring.step(Math.sin(f.phase) * 0.18 * Math.min(1, f.gait), f.dt);
  };
  return h;
};
