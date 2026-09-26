// 书生 · the Scholar — warm moon-white robe, 花青 trim, a vermilion sash, a bun with a jade pin and
// two hair ribbons that trail when he hurries; on his back a bamboo book-box (负笈) with scrolls.
// He walks upright and unhurried. Standing, he unrolls a scroll to read, clasps his hands behind
// him to recite (head swaying with the metre), or stretches and yawns. When he "plays" he reads a
// book; his skill (题诗) takes a big brush from the box and writes a line of cursive in the air,
// the ink hanging there a moment before it fades.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, Trail, clamp, mix, put, smooth } from './rig';

const XY: [number, number] = [0, 0];
/** A cursive glyph in the air, as (x right, y up) in −1..1: one unbroken 草书 line. */
const GLYPH: [number, number][] = [
  [-0.7, 0.75], [0.55, 0.9], [0.15, 0.35], [-0.55, -0.05], [0.65, 0.05], [0.05, -0.35], [-0.45, -0.9], [0.2, -0.55], [0.8, -0.85],
];
const at = (w: number): [number, number] => {
  const x = clamp(w) * (GLYPH.length - 1), i = Math.min(GLYPH.length - 2, Math.floor(x)), k = smooth(x - i);
  XY[0] = mix(GLYPH[i][0], GLYPH[i + 1][0], k); XY[1] = mix(GLYPH[i][1], GLYPH[i + 1][1], k);
  return XY;
};

/** The column of air he writes in (the figure's own space: +z ahead, −x to his right). */
const CX = -0.66, CY = 0.98, CZ = 0.46, SX = 0.24, SY = 0.34;
/** He turns his shoulders this much toward it; his right shoulder (in the torso's frame). */
const TURN = -0.3;
const SH = [-0.155, 0.86, 0];

export const scholar: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.14, skin: '#f3d6b8', robe: '#f3e9d6', trim: '#2f5f78', hair: '#23201d', sash: '#b8402e', shoe: '#3a2c22',
    eyes: 'dot', blush: 0.55, sleeve: 'wide',
  }, { armSwing: 0.32, lean: 0.03, bounce: 0.022 }, 1);
  const hair = kit.toon('#23201d');
  const jade = kit.toon('#5fa283');
  const hc = h.headC;

  // bun, pin, ribbons
  put(h.head, kit.mesh(kit.sphere(0.078, 1, 0.95, 1), hair), 0, hc + 0.19, -0.05);
  put(h.head, new THREE.Mesh(kit.cyl(0.008, 0.008, 0.25, 6), jade), 0, hc + 0.2, -0.05, 0, 0.3, Math.PI / 2);
  const ribM = '#2f5f78';
  const ribbons = [new Ribbon(kit, ribM, 7, (u) => 0.04 * (1 - u * 0.35)), new Ribbon(kit, ribM, 7, (u) => 0.035 * (1 - u * 0.4))];
  for (const r of ribbons) h.head.add(r.mesh);
  ribbons.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(30, 7);

  // book box on the back: a bamboo case, a little canopy, two scrolls
  const bamboo = kit.tex(64, 64, (g, w, hh) => {
    g.fillStyle = '#d6b273'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(96,58,24,0.55)'; g.lineWidth = 2;
    for (let x = 4; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
    g.strokeStyle = 'rgba(80,44,20,0.75)'; g.lineWidth = 4;
    for (const y of [10, 54]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const box = kit.group(h.back, 0, -0.08, -0.07);
  box.rotation.x = 0.08;
  put(box, kit.mesh(kit.box(0.24, 0.3, 0.14), kit.toon('#ffffff', { map: bamboo })), 0, 0, 0);
  const frame = kit.toon('#6e4526');
  for (const sx of [-1, 1]) put(box, kit.mesh(kit.cyl(0.011, 0.011, 0.42, 6), frame, OL * 0.6), 0.125 * sx, 0.04, -0.07);
  const canopy = put(box, kit.mesh(kit.cap(0.2, 0.55, 18, 4), kit.toon('#e6d2a6', { double: true }), OL * 0.7), 0, 0.24, 0.02);
  canopy.scale.set(1, 0.35, 0.8);
  put(box, kit.mesh(kit.cyl(0.025, 0.025, 0.16, 10), kit.toon('#f3e6c6'), OL * 0.7), -0.05, 0.19, 0.0, 0, 0, 0.12);
  put(box, kit.mesh(kit.cyl(0.022, 0.022, 0.14, 10), kit.toon('#c2553f'), OL * 0.7), 0.05, 0.18, -0.02, 0.1, 0, -0.2);
  // two straps over the shoulders, following the robe from the breast to the box
  const strapM = kit.toon('#6e4526');
  for (const sx of [1, -1]) {
    const x = 0.085 * sx;
    const pts: [number, number, number][] = [[x * 1.15, 0.07, 0.158], [x * 1.05, 0.17, 0.163], [x, 0.25, 0.142], [x, 0.303, 0.075], [x, 0.318, 0.0], [x, 0.3, -0.075], [x, 0.25, -0.142], [x * 1.05, 0.18, -0.163]];
    put(h.chest, kit.mesh(kit.tube(pts, 0.012, 0.012, 20, 5), strapM, OL * 0.45), 0, 0, 0);
  }

  // an open book, only while reading
  const book = kit.group(h.chest, 0, 0.24, 0.34);
  const page = kit.box(0.13, 0.004, 0.18);
  const cover = kit.toon('#2f5f78');
  const paper = kit.toon('#f6ecd6');
  const pl = put(book, kit.mesh(page, paper, OL * 0.5), 0.06, 0, 0, 0, 0, 0.2);
  const pr = put(book, kit.mesh(page, paper, OL * 0.5), -0.06, 0, 0, 0, 0, -0.2);
  put(pl, new THREE.Mesh(kit.box(0.125, 0.004, 0.165), cover), 0, -0.004, 0);
  put(pr, new THREE.Mesh(kit.box(0.125, 0.004, 0.165), cover), 0, -0.004, 0);
  book.rotation.set(-1.05, 0, 0);
  book.visible = false;

  // a hand scroll, unrolled between the hands while he reads standing (a fidget)
  const scrollTex = kit.tex(128, 32, (g, w, hh) => {
    g.fillStyle = '#f4e9cf'; g.fillRect(0, 0, w, hh);
    g.fillStyle = 'rgba(40,28,20,0.72)';
    for (let c = 0; c < 11; c++) for (let r = 0; r < 4; r++) if ((c * 7 + r * 3) % 5) g.fillRect(8 + c * 10.5, 5 + r * 6, 5, 3.4);
    g.fillStyle = 'rgba(185,58,43,0.85)'; g.fillRect(112, 22, 6, 6);
  });
  const scroll = kit.group(h.chest, 0, 0.13, 0.3);
  scroll.rotation.x = -0.55;
  const sheet = kit.group(scroll);
  put(sheet, new THREE.Mesh(kit.box(1, 0.12, 0.003).translate(-0.5, 0, 0), kit.toon('#ffffff', { map: scrollTex, double: true })), 0, 0, 0);
  const rodM = kit.toon('#7a4a2a');
  put(scroll, kit.mesh(kit.cyl(0.011, 0.011, 0.15, 8), rodM, OL * 0.5), 0, 0, 0);
  const rodR = put(scroll, kit.mesh(kit.cyl(0.011, 0.011, 0.15, 8), rodM, OL * 0.5), 0, 0, 0);
  kit.keep(rodR);
  scroll.visible = false;

  // the big brush for 题诗, and the ink it leaves in the air
  const brush = kit.group(h.armR.hand, 0, -0.1, 0.02);
  put(brush, kit.mesh(kit.cyl(0.012, 0.012, 0.3, 8), kit.toon('#a9793e'), OL * 0.6), 0, 0.03, 0);
  put(brush, kit.mesh(kit.lathe([[0, -0.09], [0.022, -0.045], [0.025, 0.0], [0.014, 0.018], [0, 0.018]], 10), hair, OL * 0.6), 0, -0.13, 0);
  brush.rotation.x = 0.35;
  brush.visible = false;
  const ink = new Trail(kit, '#1d1611', 96, 0.042, 0.9, 0.028);
  h.scaler.add(ink.mesh);
  let writing = false, inkW = 0, lastU = 0;

  h.fidgets = [
    {
      id: 'scroll', dur: 5.5, pose: (p, k, u, secs) => {
        const m = h.mx.set(p, k).m;
        m('shLx', -0.55); m('shLz', 0.05); m('elLx', -1.35); m('elLz', 0);
        m('shRx', -0.55); m('shRz', -0.05); m('elRx', -1.35);
        m('headX', 0.3 + Math.sin(secs * 1.3) * 0.03); m('headY', mix(0.18, -0.12, u)); m('torsoX', 0.04);
      },
    },
    {
      id: 'recite', dur: 5, mouth: true, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        // hands clasped behind the back, head nodding to the metre
        m('shLx', 0.42); m('shLz', 0.22); m('elLx', -1.1); m('elLz', -0.5);
        m('shRx', 0.42); m('shRz', -0.22); m('elRx', -1.1); m('elRz', 0.5);
        m('headX', -0.12 + Math.sin(secs * 2.4) * 0.07); m('headZ', Math.sin(secs * 1.2) * 0.1); m('bodyX', -0.03);
      },
    },
    {
      id: 'yawn', dur: 3.2, mouth: true, lid: 0.15, pose: (p, k, u) => {
        const m = h.mx.set(p, k).m;
        const up = Math.sin(clamp(u / 0.8) * Math.PI);
        m('shLx', -2.6 * up); m('shLz', 0.35); m('elLx', -0.3); m('shRx', -2.6 * up); m('shRz', -0.35); m('elRx', -0.3);
        m('headX', -0.28 * up); m('torsoX', -0.08 * up); m('bodyX', -0.04 * up);
      },
    },
  ];

  h.onPose = (p, f) => {
    if (f.emote === 'talk') {
      // lecturing: the left hand behind the back, the right raised to make the point
      const m = h.mx.set(p, f.env).m;
      const a = Math.sin(f.since * 3.4);
      m('shLx', 0.42); m('shLz', 0.22); m('elLx', -1.1); m('elLz', -0.5);
      m('shRx', -1.15 + a * 0.12); m('shRz', 0.1); m('elRx', -1.35 + Math.max(0, a) * 0.2);
      m('headX', -0.06 + Math.sin(f.since * 5) * 0.04); m('bodyX', -0.02);
    }
    if (f.emote === 'play') {
      // reading: book held up before the face, head bowed to it, a slow nod
      const m = h.mx.set(p, f.env).m;
      m('shRx', -0.55); m('shRz', 0.3); m('elRx', -1.25);
      m('shLx', -0.5); m('shLz', -0.3); m('elLx', -1.3);
      m('headX', 0.34 + Math.sin(f.t * 1.4) * 0.04); m('headY', Math.sin(f.t * 0.7) * 0.1); m('torsoX', 0.06);
    } else if (f.emote === 'skill') {
      // 题诗: turned a little to his right, the arm reaching out to a column of air beside him (well
      // clear of his face), one unbroken line of cursive, a lift of the brush to finish
      const m = h.mx.set(p, f.env).m;
      const [x, y] = at((f.u - 0.16) / 0.6);
      const lift = smooth((f.u - 0.78) / 0.15), reach = smooth(f.u / 0.16);
      // aim the arm (and the brush along it) at the glyph's point, in the turned torso's frame
      const cs = Math.cos(TURN), sn = Math.sin(TURN);
      const gx = CX + x * SX, gy = CY + y * SY + lift * 0.12, gz = CZ;
      const lx = gx * cs - gz * sn, lz = gx * sn + gz * cs;
      let dx = lx - SH[0], dy = gy - SH[1], dz = lz - SH[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const aim = Math.atan2(-dz, -dy), side = Math.asin(clamp(dx, -1, 1));
      m('shRx', mix(-0.4, aim, reach)); m('shRz', mix(-0.15, side, reach)); m('elRx', -0.22 - lift * 0.35); m('elRz', 0);
      m('shLx', 0.3); m('shLz', 0.25); m('elLx', -1.2); m('elLz', -0.4); // the left hand holds back the sleeve
      m('torsoY', TURN * reach); m('headX', -0.02 - y * 0.1); m('headY', (-0.32 - x * 0.1) * reach); m('bodyX', 0.03);
      m('hipLx', -0.2); m('hipRx', 0.25); m('hipRz', -0.12);
    }
  };
  h.onAfter = (f) => {
    book.visible = f.emote === 'play' && f.env > 0.3;
    // the scroll: unrolls as the fidget starts, rolls up as it ends
    const reading = f.fidget === 'scroll' && f.fk > 0.05;
    scroll.visible = reading;
    if (reading) {
      const open = smooth(f.fk * 1.4 - 0.25);
      const wd = 0.03 + open * 0.3;
      sheet.scale.set(wd, 1, 1);
      rodR.position.x = -wd;
      scroll.position.x = wd / 2;
    }
    // the skill: brush out, ink follows the tip while writing, then hangs and fades
    const sk = f.emote === 'skill';
    brush.visible = sk && f.u < 0.95;
    // (a new stroke when the skill starts — or starts over without a pause between)
    if (sk && (!writing || f.u < lastU - 0.3)) { writing = true; ink.reset(); inkW = 0; }
    lastU = sk ? f.u : 0;
    if (!sk && writing) { writing = false; ink.reset(); }
    if (sk) {
      // the line goes down in the column in fine steps, however long the frame was (so it is the
      // same glyph at 60 fps or at 10)
      const w = clamp((Math.min(f.u, 0.78) - 0.16) / 0.6);
      for (; inkW <= w; inkW += 0.006) {
        const [x, y] = at(inkW);
        ink.point(CX + x * SX, CY + y * SY, CZ);
      }
      ink.draw(f.u < 0.8 ? 1 : 1 - smooth((f.u - 0.8) / 0.2));
    }
    const trail = flow.step(Math.min(1.4, f.s.speed * 0.28 + (f.air ? 0.6 : 0) + (sk ? 0.4 : 0)), f.dt);
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
