// 嫦娥 · Chang'e — the lady of the moon: warm white and rouge-pink layered robes whose hem pools
// below her feet, the tall twin loops of a 飞仙髻 with pearl pins, long hair, and a 披帛 — a long
// celadon silk scarf over her arms and behind her back that floats and trails as she glides. She
// hovers a hand's breadth above the ground, bobbing softly, sleeves afloat, with a warm moon-glow
// about her. Standing, she gazes up at the moon with her hands at her breast, turns a slow
// sleeve-dance, or touches the pins in her hair. Her skill (奔月) lifts her sleeves and she rises,
// the silk streaming upward and the glow brightening.
import type * as THREE_NS from 'three';
import type { CharacterFactory } from './types';
import { Human, Kit, Ribbon, Spring, clamp, put, smooth } from './rig';

export const change: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.1, skin: '#f9e3d2', robe: '#fbf0e2', skirt: '#f0c7c8', trim: '#d2a95a', hair: '#1c1a1d', sash: '#f0c490',
    shoe: '#f0c7c8', hem: 0.0, flare: 0.3, sleeve: 'long', eyes: 'lady', blush: 0.55, girth: 0.9, shoulder: 0.135,
  }, { hover: 0.13, stride: 0.9, armSwing: 0.12, lean: 0.12, runLean: 0.22, bounce: 0 }, 11);
  const hc = h.headC;
  const hair = kit.toon('#1c1a1d');
  const pearl = kit.toon('#f8f0e0');

  // an outer skirt layer, shorter, in cream-gold
  put(h.skirt, kit.mesh(kit.lathe([[0.25, -0.36], [0.27, -0.37], [0.2, -0.2], [0.15, -0.02], [0.0, 0.02]], 22), kit.toon('#f6e2c2', { double: true })), 0, 0, 0);

  // 飞仙髻: two tall loops, a bun, pins and pearls, long hair behind
  put(h.head, kit.mesh(kit.sphere(0.08), hair), 0, hc + 0.18, -0.04);
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.torus(0.075, 0.024, 8, 20), hair), 0.06 * sx, hc + 0.3, -0.05, 0, 0.25 * sx, -0.3 * sx);
  put(h.head, kit.mesh(kit.lathe([[0, -0.52], [0.07, -0.46], [0.12, -0.22], [0.13, 0.0], [0.1, 0.08], [0, 0.1]], 14), hair), 0, hc - 0.05, -0.08, 0.08, 0, 0).scale.set(1, 1, 0.5);
  for (const [x, y, z] of [[0.1, 0.2, 0.03], [-0.1, 0.2, 0.03], [0, 0.25, 0.05]]) put(h.head, new THREE.Mesh(kit.sphere(0.017), pearl), x, hc + y, z);
  put(h.head, new THREE.Mesh(kit.cyl(0.006, 0.006, 0.26, 6), kit.toon('#dcc27a')), 0, hc + 0.22, -0.06, 0, 0, Math.PI / 2);
  // flowers in front of the loops
  put(h.head, new THREE.Mesh(kit.sphere(0.03, 1, 0.55, 1), kit.toon('#eaa0ae')), 0, hc + 0.27, 0.02);
  put(h.head, new THREE.Mesh(kit.sphere(0.018, 1, 0.55, 1), kit.toon('#f2c94c')), 0.05, hc + 0.25, 0.04);

  // 披帛: an arc behind the back and two long tails from the elbows
  // the silk shows its face to the front and back (the walk camera is behind her), turning a
  // little along its length so the side view is never a bare line
  const silk = '#a8d4c0';
  const w = (u: number) => 0.12 * (0.72 + 0.28 * Math.sin(u * Math.PI));
  const arc = new Ribbon(kit, silk, 16, w, 0.95);
  const tailL = new Ribbon(kit, silk, 14, (u) => 0.12 * (1 - u * 0.3), 0.95);
  const tailR = new Ribbon(kit, silk, 14, (u) => 0.12 * (1 - u * 0.3), 0.95);
  const Z = new THREE.Vector3(0, 0, 1);
  arc.face = Z; tailL.face = Z; tailR.face = Z;
  tailL.twist = 0.7; tailR.twist = -0.7;
  h.body.add(arc.mesh, tailL.mesh, tailR.mesh);
  const flow = new Spring(10, 4);
  const v = new THREE.Vector3();
  const anchor = (el: THREE_NS.Object3D, out: THREE_NS.Vector3) => {
    el.updateWorldMatrix(true, false);
    out.set(0, -0.08, 0);
    el.localToWorld(out);
    h.body.worldToLocal(out);
  };
  const aL = new THREE.Vector3(), aR = new THREE.Vector3();

  // a warm moon-glow (it really shows at night, and when she rises)
  const glowTex = kit.tex(64, 64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,244,214,0.9)'); grd.addColorStop(0.4, 'rgba(255,232,190,0.28)'); grd.addColorStop(1, 'rgba(255,225,180,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
  const glowMat = kit.add(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.3 }));
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(1.6, 1.9, 1);
  glow.position.set(0, 0.85, -0.1);
  h.body.add(glow);

  h.fidgets = [
    {
      id: 'moon', dur: 4.4, pose: (p, k, _u, secs) => {
        // hands at her breast, gazing up at the moon
        const m = h.mx.set(p, k).m;
        m('shLx', -0.85); m('shLz', -0.35); m('elLx', -1.5); m('shRx', -0.85); m('shRz', 0.35); m('elRx', -1.5);
        m('headX', -0.4); m('headZ', 0.1 + Math.sin(secs * 0.7) * 0.05); m('torsoX', -0.06);
      },
    },
    {
      id: 'sleeves', dur: 4.6, pose: (p, k, u, secs) => {
        // a slow turn with the sleeves lifted
        const m = h.mx.set(p, k).m;
        const a = secs * 1.6;
        m('shLx', -1.9 + Math.sin(a) * 0.3); m('shLz', 0.6); m('elLx', -0.4);
        m('shRx', -0.6); m('shRz', -1.1 + Math.sin(a) * 0.3); m('elRx', -0.3);
        m('bodyYaw', Math.sin(u * Math.PI * 2) * 0.7); m('headZ', 0.14);
      },
    },
    {
      id: 'pins', dur: 3.2, pose: (p, k, u) => {
        const m = h.mx.set(p, k).m;
        const tw = Math.sin(clamp((u - 0.2) / 0.6) * Math.PI * 2) * 0.08;
        m('shLx', -1.95); m('shLz', 0.7); m('elLx', -1.8 + tw); m('elLz', -0.3);
        m('headZ', -0.14); m('headX', 0.05);
      },
    },
  ];

  let rise = 0;
  h.onPose = (p, f) => {
    // arms held softly out from the body, one a little raised: a dancer's carriage
    p.shLz += 0.25; p.shRz -= 0.25; p.elLx -= 0.35; p.shRx -= 0.15; p.elRx -= 0.2;
    p.headZ += Math.sin(f.t * 0.7) * 0.05;
    // gliding: the sleeves float out behind her, the body inclined into the air
    const g = Math.min(1, f.gait);
    p.shLx += 0.35 * g; p.shRx += 0.35 * g; p.shLz += 0.15 * g; p.shRz -= 0.15 * g;
    if (f.emote === 'dance') {
      // the sleeves thrown up and let fall, slow as clouds
      const m = h.mx.set(p, f.env).m;
      const a = Math.sin(f.since * 1.8);
      m('shLx', -2.0 - a * 0.4); m('shLz', 0.7 + a * 0.3); m('elLx', -0.3);
      m('shRx', -2.0 + a * 0.4); m('shRz', -0.7 + a * 0.3); m('elRx', -0.3);
      m('headX', -0.2); m('headZ', a * 0.1); m('torsoY', a * 0.15);
    } else if (f.emote === 'play' || f.emote === 'wave') {
      // a slow turn with the sleeves lifted
      const m = h.mx.set(p, f.env).m;
      const a = f.t * 1.6;
      m('shLx', -1.9 + Math.sin(a) * 0.3); m('shLz', 0.6); m('elLx', -0.4);
      m('shRx', -0.6); m('shRz', -1.1 + Math.sin(a) * 0.3); m('elRx', -0.3);
      m('bodyYaw', f.emote === 'play' ? Math.sin(a * 0.5) * 0.9 : 0); m('headZ', 0.14);
    } else if (f.emote === 'skill') {
      // 奔月: the sleeves sweep up and out like wings, she looks up, and rises
      const m = h.mx.set(p, f.env).m;
      const up = smooth(f.u / 0.35), flut = Math.sin(f.t * 4) * 0.12;
      m('shLx', -0.6 - up * 0.4); m('shLz', 0.5 + up * 1.6 + flut); m('elLx', -0.2);
      m('shRx', -0.6 - up * 0.4); m('shRz', -0.5 - up * 1.6 - flut); m('elRx', -0.2);
      m('headX', -0.35 * up); m('torsoX', -0.08 * up); m('skF', 1.1); m('bodyX', -0.05 * up);
    }
    rise = f.emote === 'skill' ? Math.sin(clamp(f.u / 0.95) * Math.PI) * f.env : 0;
    p.lift += rise * 0.32;
  };
  h.onAfter = (f) => {
    const trail = flow.step(Math.min(1.4, f.s.speed * 0.32 + (f.air ? 0.4 : 0)), f.dt);
    const t = f.t;
    const upK = rise;
    arc.update((u, c, s) => {
      const a = u * Math.PI;
      const wv = Math.sin(t * 1.3 + u * 5) * 0.03;
      c.set(Math.cos(a) * (0.3 + upK * 0.1), 0.82 + Math.sin(a) * (0.3 + upK * 0.25) + wv, -0.2 - Math.sin(a) * (0.06 + trail * 0.18) + wv);
      s.set(Math.cos(a), Math.sin(a), 0);
    });
    anchor(h.armL.el, aL);
    anchor(h.armR.el, aR);
    for (const [r, a, sx] of [[tailL, aL, 1], [tailR, aR, -1]] as const) {
      r.update((u, c, s) => {
        const L = 0.95 * u;
        const wv = Math.sin(t * 1.8 - u * 4.5 + sx) * 0.07 * u;
        // rising, the silk streams down and out below her; otherwise it trails behind
        v.set(a.x + sx * (0.04 + u * (0.08 + upK * 0.25)) + wv * 0.5, a.y - L * (1 - trail * 0.55) - upK * L * 0.3, a.z - L * (0.12 + trail * 0.75) + wv);
        c.copy(v);
        c.y = Math.max(c.y, -0.1);
        s.set(sx, 0, 0);
      });
    }
    glowMat.opacity = 0.24 + Math.sin(t * 1.1) * 0.05 + upK * 0.5;
    glow.scale.set(1.6 + upK * 0.8, 1.9 + upK * 0.9, 1);
  };
  return h;
};
