// 琴师 · the Qin Player — a lady in warm white over a rouge-pink skirt, long flowing sleeves, a high
// bun with a dangling hairpin (步摇) that swings as she walks, long hair down her back, and a guqin
// in lacquer brown with a vermilion tassel, which she carries with care in both arms, cradled like
// a sleeping child. She walks in small, even lotus steps. Standing, she plucks a string and tilts
// her head to listen, gazes up at the sky, or sets her hairpin straight. When she plays (and for
// her skill, 高山流水) she kneels, lays the qin across her knees and plays — the skill with a great
// sweep of the hand along the strings.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, clamp, put, smooth } from './rig';

export const musician: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.07, skin: '#f7dcc6', robe: '#f8ebdc', skirt: '#e0a09a', trim: '#3f7f7a', hair: '#1f1b1a', sash: '#e2b457',
    shoe: '#d98b86', hem: 0.03, flare: 0.27, sleeve: 'long', eyes: 'lady', blush: 0.6, mouth: 'none', girth: 0.92, shoulder: 0.14,
  }, { stride: 0.52, armSwing: 0.06, legSwing: 0.4, lean: 0.02, bounce: 0.012 }, 4);
  const hc = h.headC;
  const hair = kit.toon('#1f1b1a');
  const gold = kit.toon('#d0a445');

  // hair: a high bun of two loops, a side knot, long hair down the back
  put(h.head, kit.mesh(kit.sphere(0.085, 1.1, 0.9, 1), hair), 0, hc + 0.19, -0.04);
  put(h.head, kit.mesh(kit.torus(0.06, 0.026, 8, 18), hair), 0.02, hc + 0.3, -0.05, 0, 0.2, 0.25);
  put(h.head, kit.mesh(kit.sphere(0.05), hair), -0.14, hc + 0.1, -0.06);
  put(h.head, kit.mesh(kit.lathe([[0, -0.46], [0.07, -0.42], [0.11, -0.2], [0.13, 0.0], [0.1, 0.08], [0, 0.1]], 14), hair), 0, hc - 0.05, -0.08, 0.1, 0, 0).scale.set(1, 1, 0.5);
  // hairpin with a dangling string of beads (步摇)
  put(h.head, new THREE.Mesh(kit.cyl(0.007, 0.007, 0.22, 6), gold), 0.1, hc + 0.2, -0.04, 0, 0, -1.0);
  put(h.head, new THREE.Mesh(kit.sphere(0.022), kit.toon('#f0dcb8')), 0.19, hc + 0.26, -0.04);
  const tassel = kit.group(h.head, 0.19, hc + 0.25, -0.03);
  const beadM = kit.toon('#6fb592');
  for (let i = 0; i < 3; i++) put(tassel, new THREE.Mesh(kit.sphere(0.011 - i * 0.002), i === 2 ? gold : beadM), 0, -0.035 - i * 0.03, 0);
  put(tassel, new THREE.Mesh(kit.cyl(0.0025, 0.0025, 0.1, 3, 'top'), gold), 0, 0, 0);
  const tasselSpring = new Spring(26, 3);
  // flowers at the side of the bun
  put(h.head, new THREE.Mesh(kit.sphere(0.03, 1, 0.6, 1), kit.toon('#e0707a')), -0.1, hc + 0.22, 0.0);
  put(h.head, new THREE.Mesh(kit.sphere(0.02, 1, 0.6, 1), kit.toon('#f2c94c')), -0.13, hc + 0.2, -0.04);

  // sash ribbons that float
  const ribs = [new Ribbon(kit, '#e2b457', 8, (u) => 0.045 * (1 - u * 0.3)), new Ribbon(kit, '#e2b457', 8, (u) => 0.04 * (1 - u * 0.3))];
  for (const r of ribs) h.body.add(r.mesh);
  ribs.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(24, 6);

  // the guqin: lacquer board, pale strings, a tassel
  const qin = kit.group();
  const lacquer = kit.toon('#4a2a1e');
  const board = kit.shape([[-0.08, -0.46], [0.08, -0.46], [0.09, -0.2], [0.075, 0.1], [0.085, 0.3], [0.07, 0.46], [-0.07, 0.46], [-0.085, 0.3], [-0.075, 0.1], [-0.09, -0.2]], 0.035, 0.008);
  put(qin, kit.mesh(board, lacquer, OL * 0.8), 0, 0, 0);
  const strM = kit.toon('#f1e4c4');
  for (let i = 0; i < 7; i++) put(qin, new THREE.Mesh(kit.box(0.003, 0.84, 0.003), strM), -0.048 + i * 0.016, 0.0, 0.03);
  for (let i = 0; i < 13; i++) put(qin, new THREE.Mesh(kit.sphere(0.005, 1, 1, 0.5, 6, 4), strM), 0.068, -0.35 + i * 0.055, 0.028); // 徽 markers
  const qinTassel = kit.group(qin, 0, -0.47, 0);
  put(qinTassel, kit.mesh(kit.cyl(0.004, 0.018, 0.12, 6, 'top'), kit.toon('#c23b2b'), OL * 0.5), 0, 0, 0);
  const qinSpring = new Spring(28, 4);
  // three places for it: cradled in her arms, slung on her back, across her knees
  type Place = 'arms' | 'back' | 'lap';
  let place: Place | null = null;
  const setPlace = (to: Place) => {
    if (to === place) return;
    place = to;
    if (to === 'back') { qin.position.set(0, -0.08, -0.04); qin.rotation.set(0.12, Math.PI, 0.72); h.back.add(qin); }
    else if (to === 'lap') { qin.position.set(0, 0.5, 0.37); qin.rotation.set(-Math.PI / 2 + 0.12, 0, Math.PI / 2); h.body.add(qin); }
    else { qin.position.set(-0.02, 0.1, 0.23); qin.rotation.set(0.25, 0.1, 0.95); h.chest.add(qin); }
  };
  setPlace('arms');

  const playing = (f: { emote: string | null }) => f.emote === 'play' || f.emote === 'skill';
  h.fidgets = [
    {
      id: 'pluck', dur: 4, pose: (p, k, u, secs) => {
        // the qin still cradled, the right hand plucks a string; the head tilts to listen
        const m = h.mx.set(p, k).m;
        const pl = u > 0.25 && u < 0.7 ? Math.max(0, Math.sin(secs * 7)) : 0;
        m('shRx', -0.9 - pl * 0.12); m('shRz', 0.35); m('elRx', -1.2);
        m('headX', 0.22); m('headZ', -0.18 * smooth(u * 3)); m('headY', 0.2);
      },
    },
    {
      id: 'sky', dur: 4, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        m('headX', -0.38); m('headY', -0.2 + Math.sin(secs * 0.6) * 0.1); m('headZ', 0.08); m('torsoX', -0.05);
      },
    },
    {
      id: 'pin', dur: 3, pose: (p, k, u) => {
        // straightening the hairpin with the right hand
        const m = h.mx.set(p, k).m;
        const tw = Math.sin(clamp((u - 0.25) / 0.5) * Math.PI * 2) * 0.1;
        m('shRx', -1.9); m('shRz', -0.75); m('elRx', -1.75 + tw); m('elRz', 0.3);
        m('headZ', 0.14); m('headX', 0.06);
      },
    },
  ];

  h.onPose = (p, f) => {
    // carrying the qin: both forearms under and over it before her chest, barely swinging
    const carry = place === 'arms' ? 1 - bothHands(f, h.seat) : 0;
    if (carry > 0) {
      const m = h.mx.set(p, carry).m;
      m('shLx', -0.55); m('shLz', -0.15); m('elLx', -1.45); m('elLz', 0.3);
      if (f.fidget !== 'pluck' && f.fidget !== 'pin') { m('shRx', -0.35); m('shRz', 0.4); m('elRx', -1.35); m('elRz', -0.1); }
    }
    // lotus steps: a small glide of the hips, the head steady
    p.bodyZ += Math.sin(f.phase) * 0.025 * Math.min(1, f.gait);
    p.headZ -= Math.sin(f.phase) * 0.02 * Math.min(1, f.gait);
    if (playing(f)) {
      // kneel and play: robe pooled, hands over the strings
      const m = h.mx.set(p, f.env).m;
      const sk = f.emote === 'skill';
      const a = Math.sin(f.t * (sk ? 11 : 7)), b = Math.sin(f.t * (sk ? 8.5 : 5.3) + 1);
      m('bodyY', -0.24); m('hipLx', -1.5); m('hipRx', -1.5); m('knL', 1.25); m('knR', 1.25);
      m('skX', -0.1); m('skS', 0.45); m('skF', 1.3);
      m('shLx', -0.6 + a * 0.08); m('shLz', -0.05); m('elLx', -0.85 + b * 0.1);
      m('shRx', -0.62 - b * 0.08); m('shRz', 0.05); m('elRx', -0.8 + a * 0.1);
      m('headX', 0.22); m('headZ', Math.sin(f.t * 0.9) * 0.08); m('bodyX', 0.1);
      if (sk) {
        // the glissando: the right hand sweeps the length of the strings and lifts away
        const g = smooth((f.u - 0.45) / 0.25), lift = Math.sin(clamp((f.u - 0.62) / 0.25) * Math.PI);
        m('shRz', 0.05 - g * 0.9); m('shRx', -0.62 - lift * 0.9); m('elRx', -0.8 + lift * 0.5);
        m('headZ', -0.15 * g); m('headX', 0.22 - lift * 0.3); m('torsoY', -0.15 * g);
      }
    }
  };
  h.onAfter = (f) => {
    const lap = playing(f) && f.env > 0.5;
    const back = !lap && (!!h.holding || bothHands(f, h.seat) > 0.5 || h.seat > 0.3);
    setPlace(lap ? 'lap' : back ? 'back' : 'arms');
    tassel.rotation.x = tasselSpring.step(-f.s.speed * 0.25 + Math.sin(f.phase) * 0.35 * Math.min(1, f.gait) - h.head.rotation.x, f.dt);
    tassel.rotation.z = Math.sin(f.phase * 0.5) * 0.25 * Math.min(1, f.gait);
    qinTassel.rotation.x = qinSpring.step(Math.sin(f.phase) * 0.5 * Math.min(1, f.gait), f.dt);
    const sk = f.emote === 'skill' ? f.env : 0;
    const trail = flow.step(Math.min(1.2, f.s.speed * 0.3 + (f.air ? 0.5 : 0) + sk * 0.7), f.dt);
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
