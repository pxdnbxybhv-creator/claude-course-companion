// 道童 · the Taoist Child — small and big-headed, twin buns (双丫髻) tied with red ribbons, an
// apricot Taoist robe with dark trim, white socks, and a horsetail fly-whisk (拂尘) that flicks as
// he skips along — a hop in every other step. Standing, he swishes the whisk from shoulder to
// shoulder, hops on the spot, or yawns enormously. Playing twirls the whisk; his skill (御风符)
// pulls a yellow talisman from his sleeve, raises it between two fingers and flings it — it flies
// off spinning, glowing.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, clamp, mix, put, smooth } from './rig';

export const taoist: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 0.84, skin: '#f8dcc2', robe: '#e8b660', trim: '#3a2c24', hair: '#1d1a18', sash: '#3a2c24', sashTails: true,
    pants: '#f4ecdc', shoe: '#2a221c', hem: 0.1, flare: 0.23, sleeve: 'wide', eyes: 'dot', mouth: 'o', blush: 0.85, headR: 0.2,
  }, { stride: 0.6, bounce: 0.06, armSwing: 0.62, legSwing: 0.7 }, 6);
  const hc = h.headC;
  const hair = kit.toon('#1d1a18');

  // twin buns with little ribbons
  const ribs: Ribbon[] = [];
  const tie = kit.toon('#c8402f');
  for (const sx of [1, -1]) {
    put(h.head, kit.mesh(kit.sphere(0.07), hair), 0.12 * sx, hc + 0.19, -0.02);
    // a red band round each bun, square to the line from the skull's centre so it rings the bun
    const d = new THREE.Vector3(0.12 * sx, 0.19, -0.02).normalize();
    const band = put(h.head, kit.mesh(kit.torus(0.068, 0.015, 6, 18), tie, OL * 0.5), 0.114 * sx, hc + 0.18, -0.02);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const r = new Ribbon(kit, '#c8402f', 6, (u) => 0.036 * (1 - u * 0.35));
    h.head.add(r.mesh);
    r.twist = 0.5 * sx;
    ribs.push(r);
  }
  // a tuft of fringe
  put(h.head, kit.mesh(kit.sphere(0.07, 1.6, 0.5, 0.8), hair), 0, hc + 0.15, 0.13, 0.5, 0, 0);
  // a taiji disc on the back of the robe
  const taiji = kit.tex(64, 64, (g, w) => {
    const r = w / 2;
    g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(r, r, r - 1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a211b';
    g.beginPath(); g.arc(r, r, r - 1, -Math.PI / 2, Math.PI / 2); g.arc(r, r + r / 2, r / 2 - 0.5, Math.PI / 2, -Math.PI / 2, true); g.arc(r, r / 2, r / 2 - 0.5, Math.PI / 2, -Math.PI / 2); g.fill();
    g.beginPath(); g.arc(r, r / 2, r / 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(r, r + r / 2, r / 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a211b'; g.lineWidth = 2; g.beginPath(); g.arc(r, r, r - 1.5, 0, Math.PI * 2); g.stroke();
  });
  put(h.chest, new THREE.Mesh(kit.add(new THREE.CircleGeometry(0.075, 20)), kit.toon('#ffffff', { map: taiji })), 0, 0.17, -0.152, 0, Math.PI, 0);

  // the fly-whisk: a handle and a white horsetail
  const whisk = kit.group(h.armR.hand, 0, -0.02, 0.02);
  put(whisk, kit.mesh(kit.cyl(0.012, 0.014, 0.26, 8), kit.toon('#7b4f2e'), OL * 0.6), 0, 0.02, 0, 0, 0, 0);
  put(whisk, new THREE.Mesh(kit.cyl(0.02, 0.02, 0.03, 8), kit.toon('#d0a445')), 0, -0.11, 0);
  const tail = kit.group(whisk, 0, -0.12, 0);
  put(tail, kit.mesh(kit.lathe([[0.0, -0.3], [0.03, -0.26], [0.045, -0.1], [0.025, 0.0], [0, 0.01]], 10), kit.toon('#f7f1e4'), OL * 0.6), 0, 0, 0);
  const tailSpring = new Spring(30, 4);
  const tailSide = new Spring(30, 4);
  whisk.rotation.x = 1.1;
  h.handProps.push(whisk);

  // the talisman: yellow paper, cinnabar strokes; it flies free once flung
  const fu = kit.tex(32, 80, (g, w, hh) => {
    g.fillStyle = '#f2cf57'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#c0301f'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, 8); g.lineTo(26, 8); g.moveTo(16, 4); g.lineTo(16, 30);
    g.moveTo(7, 20); g.quadraticCurveTo(26, 22, 9, 36); g.lineTo(24, 42); g.moveTo(16, 42); g.lineTo(16, 70);
    g.moveTo(8, 54); g.lineTo(24, 50); g.moveTo(8, 64); g.quadraticCurveTo(16, 60, 24, 66); g.stroke();
    g.strokeStyle = '#c0301f'; g.lineWidth = 1.5; g.strokeRect(2, 2, w - 4, hh - 4);
  });
  const talisman = kit.group(h.scaler);
  put(talisman, new THREE.Mesh(kit.add(new THREE.PlaneGeometry(0.075, 0.19)), kit.toon('#ffffff', { map: fu, double: true, emissive: '#3a2a00' })), 0, 0, 0);
  const glowTex = kit.tex(64, 64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,226,140,0.95)'); grd.addColorStop(0.45, 'rgba(255,190,90,0.35)'); grd.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
  const glowMat = kit.add(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(0.5, 0.5, 1);
  talisman.add(glow);
  talisman.visible = false;
  const handW = new THREE.Vector3(), from = new THREE.Vector3();

  h.fidgets = [
    {
      id: 'swish', dur: 3.2, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        const a = Math.sin(secs * 3.4);
        m('shRx', -1.5); m('shRz', -0.2 + a * 0.7); m('elRx', -1.2);
        m('headY', a * 0.25); m('bodyZ', a * 0.04);
      },
    },
    {
      id: 'hop', dur: 2.4, pose: (p, k, _u, secs) => {
        // two little hops on the spot, arms flung up
        const m = h.mx.set(p, k).m;
        const hop = Math.max(0, Math.sin(secs * 5.2));
        m('bodyY', hop * 0.14); m('knL', 0.6 * (1 - hop)); m('knR', 0.6 * (1 - hop)); m('hipLx', -0.3 * (1 - hop)); m('hipRx', -0.3 * (1 - hop));
        m('shLz', 0.5 + hop * 0.6); m('shRz', -0.5 - hop * 0.6); m('headX', -0.1 * hop);
      },
    },
    {
      id: 'yawn', dur: 3, mouth: true, lid: 0.12, pose: (p, k, u) => {
        const m = h.mx.set(p, k).m;
        const up = Math.sin(clamp(u / 0.85) * Math.PI);
        m('shLx', -2.7 * up); m('shLz', 0.3); m('shRx', -2.7 * up); m('shRz', -0.3); m('elLx', -0.2); m('elRx', -0.2);
        m('headX', -0.3 * up); m('torsoX', -0.1 * up); m('bodyY', 0.02 * up);
      },
    },
  ];

  h.onPose = (p, f) => {
    // the whisk arm is carried a little forward
    p.elRx = mix(Math.min(p.elRx, -0.55), p.elRx, bothHands(f, h.seat));
    // skipping: every other step becomes a little hop, knees high
    const g = Math.min(1, f.gait);
    if (g > 0.1 && !f.air) {
      const s2 = Math.sin(f.phase * 0.5);
      p.bodyY += Math.max(0, Math.sin(f.phase)) * Math.max(0, s2) * 0.07 * g;
      p.knL += Math.max(0, Math.sin(f.phase)) * 0.35 * g; p.knR += Math.max(0, -Math.sin(f.phase)) * 0.35 * g;
      p.headZ += Math.sin(f.phase * 0.5) * 0.06 * g;
    }
    if (f.emote === 'dance') {
      // a child's dance: hop, hop, the whisk twirled overhead
      const m = h.mx.set(p, f.env).m;
      const hop = Math.abs(Math.sin(f.since * 5.2)), a = f.since * 8;
      m('bodyY', hop * 0.09); m('knL', 0.5 - hop * 0.4); m('knR', 0.5 - hop * 0.4); m('hipLx', -0.3 + hop * 0.2); m('hipRx', -0.3 + hop * 0.2);
      m('shRx', -2.5 + Math.sin(a) * 0.3); m('shRz', -0.3 + Math.cos(a) * 0.3); m('elRx', -0.3);
      m('shLx', -0.3); m('shLz', 0.9); m('elLx', -0.6);
    } else if (f.emote === 'play' || f.emote === 'cast') {
      const m = h.mx.set(p, f.env).m;
      const a = f.t * 7;
      m('shRx', -1.6 + Math.sin(a) * 0.6); m('shRz', -0.3 + Math.cos(a) * 0.5); m('elRx', -0.6);
      m('shLx', -0.5); m('shLz', 0.5); m('elLx', -1.2);
      m('bodyZ', Math.sin(a) * 0.06); m('headZ', -Math.sin(a) * 0.08);
    } else if (f.emote === 'skill') {
      // into the right sleeve (0–.2), the talisman up between two fingers before the face (.2–.45),
      // flung forward (.45–.55), the arm held out after it
      const m = h.mx.set(p, f.env).m;
      const pull = smooth(f.u / 0.18), raise = smooth((f.u - 0.2) / 0.2), fling = smooth((f.u - 0.46) / 0.08);
      m('shLx', mix(mix(-0.2, -0.9, pull), mix(-1.5, -1.75, fling), raise)); m('shLz', mix(mix(0.1, -0.7, pull), mix(-0.12, 0.1, fling), raise));
      m('elLx', mix(mix(-0.5, -1.6, pull), mix(-1.3, -0.1, fling), raise)); m('elLz', 0);
      m('shRx', -0.6 * raise); m('shRz', -0.4 * raise); m('elRx', -0.8);
      m('headX', mix(0.1, -0.15, raise)); m('torsoY', mix(0.25 * pull, -0.3, fling)); m('bodyX', 0.1 * fling);
      m('hipLx', -0.45 * fling); m('hipRx', 0.3 * fling); m('knL', 0.3 * fling);
    }
  };
  h.onAfter = (f) => {
    const armA = h.armR.sh.rotation.x + h.armR.el.rotation.x;
    tail.rotation.x = tailSpring.step(-armA * 0.6 - 0.2 - f.s.speed * 0.15, f.dt);
    const swish = f.fidget === 'swish' ? Math.sin(f.fs * 3.4 - 0.8) * 0.9 * f.fk : 0;
    tail.rotation.z = tailSide.step(Math.sin(f.phase) * 0.3 * Math.min(1, f.gait) + (f.emote === 'play' ? Math.sin(f.t * 7) * 0.6 : 0) + swish, f.dt);
    ribs.forEach((r, i) => {
      const sx = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.2 * u;
        const w = Math.sin(f.t * 6 - u * 4 + i) * 0.02 * u;
        c.set((0.19 + u * 0.05) * sx, hc + 0.15 - L * (1 - Math.min(0.6, f.s.speed * 0.15)), -0.04 - L * Math.min(0.9, 0.2 + f.s.speed * 0.2) + w);
        s.set(1, 0, 0.35 * sx).normalize();
      });
    });
    // the talisman: in the fingers, then away on the wind
    const sk = f.emote === 'skill' && f.env > 0.05;
    talisman.visible = sk && f.u > 0.14 && f.u < 0.98;
    if (talisman.visible) {
      const fly = clamp((f.u - 0.5) / 0.45);
      if (fly <= 0) {
        h.armL.hand.updateWorldMatrix(true, false);
        handW.set(0, -0.06, 0.02).applyMatrix4(h.armL.hand.matrixWorld);
        h.scaler.updateWorldMatrix(true, false);
        h.scaler.worldToLocal(handW);
        from.copy(handW);
        talisman.position.copy(handW);
        talisman.rotation.set(0, 0, 0.1);
        glowMat.opacity = smooth((f.u - 0.3) / 0.15) * 0.6;
      } else {
        const e = smooth(fly);
        talisman.position.set(mix(from.x, 0.2, e), from.y + fly * 1.1 + Math.sin(fly * Math.PI) * 0.3, mix(from.z, 2.6, e));
        talisman.rotation.set(fly * 6, fly * 9, 0.1);
        glowMat.opacity = 0.8 * (1 - smooth((fly - 0.6) / 0.4));
      }
      talisman.scale.setScalar(1 + fly * 0.4);
    }
  };
  return h;
};
