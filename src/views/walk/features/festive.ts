// The new-year festivals: 春节 (two lanterns over the water, 福 on posts — one upside down —,
// couplets on the gate, fireworks, red envelopes to find), 元宵 (sky lanterns, a line of riddle
// lanterns, 汤圆), 元旦 (a countdown and fireworks). They keep the real clock (festivalNight): by
// day the lanterns hang unlit and the fireworks wait for dusk; 夜, or a preview, shows the night.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../types';
import { BRUSH_FONT, canvasTexture, entry, feature, festivalNight, findSpot, glowTexture, inked, landmarks, loadBrush, propMat, reducedMotion, reflects, tween, dayRng, type Bag } from './kit';
import { merge, part } from './geo';
import { bowl, burst, glints, hangLanterns, PAPER_APRICOT, PAPER_OCHRE, shoreLanterns, stoneTable, type Hook } from './props';
import { fireworks } from './fireworks';
import { newYearOf } from './calendar';
import * as sfx from './sfx';

const TAU = Math.PI * 2;
const RED = '#b9302a', GOLD = '#e0b04a';

/** Red paper with brushed characters: a diamond 福, a vertical couplet, a horizontal banner. */
function redPaper(ctx: WorldCtx, text: string, o: { vertical?: boolean; diamond?: boolean; w: number; h: number; ink?: string }): T.CanvasTexture {
  return canvasTexture(ctx.THREE, o.w, o.h, (g, w, h) => {
    g.fillStyle = RED;
    if (o.diamond) {
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      g.fillRect(-w * 0.35, -h * 0.35, w * 0.7, h * 0.7);
      g.strokeStyle = GOLD; g.lineWidth = 4;
      g.strokeRect(-w * 0.32, -h * 0.32, w * 0.64, h * 0.64);
      g.rotate(-Math.PI / 4);
      g.translate(-w / 2, -h / 2);
    } else {
      g.fillRect(0, 0, w, h);
      g.strokeStyle = GOLD; g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, h - 12);
    }
    // paper fibres
    g.globalAlpha = 0.08;
    g.fillStyle = '#000';
    for (let i = 0; i < 300; i++) g.fillRect((i * 97) % w, (i * 53) % h, 1, 3);
    g.globalAlpha = 1;
    g.fillStyle = o.ink ?? '#1b1916';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const chars = [...text];
    if (o.diamond) {
      g.font = `${Math.round(w * 0.5)}px ${BRUSH_FONT}`;
      g.fillText(text, w / 2, h / 2 + w * 0.02);
    } else if (o.vertical) {
      const step = (h - 24) / chars.length;
      g.font = `${Math.round(Math.min(w * 0.72, step * 0.86))}px ${BRUSH_FONT}`;
      chars.forEach((c, i) => g.fillText(c, w / 2, 12 + step * (i + 0.5)));
    } else {
      const step = (w - 24) / chars.length;
      g.font = `${Math.round(Math.min(h * 0.72, step * 0.86))}px ${BRUSH_FONT}`;
      chars.forEach((c, i) => g.fillText(c, 12 + step * (i + 0.5), h / 2));
    }
  });
}

function paperPlane(ctx: WorldCtx, tex: T.Texture, w: number, h: number): T.Mesh {
  const { THREE } = ctx;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }));
}

// ───────────────────────────── 春节 ─────────────────────────────

const WISHES: { zh: string; en: string; amount: string }[] = [
  { zh: '恭喜发财', en: 'Wishing you prosperity', amount: '¥8.88' },
  { zh: '岁岁平安', en: 'Peace, year after year', amount: '¥6.66' },
  { zh: '万事如意', en: 'May all go as you wish', amount: '¥9.99' },
  { zh: '身体健康', en: 'Good health', amount: '¥5.20' },
  { zh: '心想事成', en: 'May your wishes come true', amount: '¥16.8' },
  { zh: '步步高升', en: 'Onward and upward', amount: '¥0.01（心意到了）' },
];

export const spring = feature('spring', async (bag, ctx) => {
  if (!ctx.env.festivals.includes('spring')) return;
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '101');
  await loadBrush('福天增岁月人寿春满乾坤门万象更新恭喜发财');
  if (bag.disposed) return;
  const night = festivalNight(bag);
  // Two lanterns held out over the water: one cinnabar (the accent), one warm ochre paper.
  hangLanterns(bag, shoreLanterns(bag, 2), { colors: [P.cinnabar, PAPER_OCHRE] });
  const fw = fireworks(bag, { onlyAtNight: true });
  if (night) bag.later(2500, () => fw.salvo(3)); // a welcome
  ctx.hud.toast('新春快乐！园子里藏着六个红包', 'Happy Spring Festival! Six red envelopes are hidden in the garden', 4200);

  // 福 on posts, one of them upside down (倒福 → 福到).
  const fuTex = redPaper(ctx, '福', { diamond: true, w: 256, h: 256 });
  bag.own(fuTex);
  const postGeo = merge(THREE, [part(THREE, new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), '#4a3c2b', { p: [0, 0.8, 0] })]);
  bag.own(postGeo);
  // three, not a crowd: the seal red is an accent
  const upside = Math.floor(rng() * 3);
  for (let i = 0; i < 3; i++) {
    const at = findSpot(ctx, rng, { clear: 0.8, pondMargin: 1.5, maxR: ctx.bounds.radius * 0.75 });
    const post = inked(ctx, postGeo, { width: 0.01 });
    post.position.copy(at);
    bag.add(post);
    const face = Math.atan2(-at.x, -at.z);
    const fu = paperPlane(ctx, fuTex, 0.62, 0.62);
    fu.position.set(at.x + Math.sin(face) * 0.08, at.y + 1.25, at.z + Math.cos(face) * 0.08);
    fu.rotation.set(0, face, i === upside ? Math.PI : 0);
    bag.add(fu);
    if (i === upside) {
      let seen = false;
      bag.interact({
        id: 'fu-upside-down', position: at.clone().add(new THREE.Vector3(Math.sin(face) * 0.6, 0, Math.cos(face) * 0.6)), radius: 1.6,
        labelZh: '倒贴的福', labelEn: 'An upside-down 福', actionZh: '看看', actionEn: 'Look',
        act() {
          ctx.player.emote('jump');
          ctx.audio.chime(3);
          ctx.hud.toast('福到了！', 'Fortune has arrived!', 2200);
          if (!seen) {
            seen = true;
            ctx.hud.showCard({
              titleZh: '福到了', titleEn: 'Fortune has arrived',
              bodyZh: '谁把福字贴倒了？\n“福倒了”——“福到了”！\n\n倒贴福字是故意的：一个谐音，一年的好兆头。',
              bodyEn: 'Who stuck the 福 (fortune) upside down?\n“福倒了, fortune is upside down” sounds just like “福到了, fortune has arrived!”\n\nIt is on purpose: one pun, a whole year of luck.',
              seal: '福',
            });
          }
        },
      });
    }
  }

  // Couplets on the moon gate (or on a little gateway of their own).
  const gate = landmarks(ctx).find((l) => l.kind === 'gate');
  const up = redPaper(ctx, '天增岁月人增寿', { vertical: true, w: 96, h: 640 });
  const down = redPaper(ctx, '春满乾坤福满门', { vertical: true, w: 96, h: 640 });
  const across = redPaper(ctx, '万象更新', { w: 400, h: 96 });
  let gx: number, gz: number, gy: number, face: number, half: number, top: number;
  if (gate) {
    const box = new THREE.Box3().setFromObject(gate.object);
    gx = gate.position.x; gz = gate.position.z;
    gy = ctx.groundY(gx, gz);
    const toSpawn = Math.atan2(ctx.player.position.x - gx, ctx.player.position.z - gz);
    face = Math.round(toSpawn / (Math.PI / 2)) * (Math.PI / 2);
    half = 1.6; top = Math.min(box.max.y - gy - 0.3, 2.9);
    const depth = Math.abs(Math.sin(face)) > 0.5 ? (box.max.x - box.min.x) / 2 : (box.max.z - box.min.z) / 2;
    gx += Math.sin(face) * (Math.min(depth, 0.5) + 0.02);
    gz += Math.cos(face) * (Math.min(depth, 0.5) + 0.02);
  } else {
    const at = findSpot(ctx, rng, { clear: 2, pondMargin: 2, minR: ctx.bounds.radius * 0.4 });
    gx = at.x; gz = at.z; gy = at.y;
    face = Math.atan2(-at.x, -at.z);
    half = 0.85; top = 2.5;
    const frame = inked(ctx, merge(THREE, [
      part(THREE, new THREE.BoxGeometry(0.16, 2.8, 0.16), '#3a2f24', { p: [half, 1.4, -0.1] }),
      part(THREE, new THREE.BoxGeometry(0.16, 2.8, 0.16), '#3a2f24', { p: [-half, 1.4, -0.1] }),
      part(THREE, new THREE.BoxGeometry(2.2, 0.18, 0.2), '#3a2f24', { p: [0, 2.75, -0.1] }),
      part(THREE, new THREE.ConeGeometry(1.55, 0.45, 4), P.ink, { p: [0, 3.05, -0.1], r: [0, Math.PI / 4, 0], s: [1, 1, 0.35] }),
    ]), { width: 0.016 });
    frame.position.set(gx, gy, gz);
    frame.rotation.y = face;
    bag.add(frame);
  }
  const place = (m: T.Mesh, lx: number, ly: number) => {
    m.position.set(gx + Math.cos(face) * lx, gy + ly, gz - Math.sin(face) * lx);
    m.rotation.y = face;
    bag.add(m);
  };
  // Facing the door, 上联 on the right, 下联 on the left; 横批 above.
  place(paperPlane(ctx, up, 0.3, 2.0), -(half + 0.05), top - 1.15);
  place(paperPlane(ctx, down, 0.3, 2.0), half + 0.05, top - 1.15);
  place(paperPlane(ctx, across, 1.2, 0.29), 0, top + 0.12);
  const coupletAt = new THREE.Vector3(gx + Math.sin(face) * 1.2, gy, gz + Math.cos(face) * 1.2);
  bag.interact({
    id: 'couplets', position: coupletAt, radius: 1.8,
    labelZh: '春联', labelEn: 'Spring couplets', actionZh: '读', actionEn: 'Read',
    act() {
      ctx.audio.pluck(2, 0.5);
      ctx.hud.showCard({
        titleZh: '万象更新', titleEn: 'All things renewed',
        bodyZh: '上联：天增岁月人增寿\n下联：春满乾坤福满门\n\n天添一岁，人添一寿；春满天地，福满家门。',
        bodyEn: 'Heaven adds a year, and people add years of life;\nspring fills heaven and earth, and fortune fills the house.\n\n(Red couplets go up by the door on New Year’s Eve.)',
      });
    },
  });

  // Six red envelopes (红包) to find.
  const envTex = canvasTexture(THREE, 64, 96, (g, w, h) => {
    g.fillStyle = RED; g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.22, 0, TAU); g.fill();
    g.fillStyle = RED; g.font = `${Math.round(w * 0.3)}px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('福', w / 2, h * 0.43);
    g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.2); g.quadraticCurveTo(w / 2, h * 0.34, w, h * 0.2); g.stroke();
  });
  const envGeo = new THREE.BoxGeometry(0.14, 0.21, 0.015);
  const envMat = [
    new THREE.MeshLambertMaterial({ color: RED }), new THREE.MeshLambertMaterial({ color: RED }),
    new THREE.MeshLambertMaterial({ color: RED }), new THREE.MeshLambertMaterial({ color: RED }),
    new THREE.MeshLambertMaterial({ map: envTex, emissive: new THREE.Color('#401010') }), new THREE.MeshLambertMaterial({ color: RED }),
  ];
  const plants = landmarks(ctx).filter((l) => l.kind === 'plant' && l.plant !== 'lotus');
  const envs: { mesh: T.Mesh; at: T.Vector3; got: boolean }[] = [];
  for (let i = 0; i < WISHES.length; i++) {
    let at: T.Vector3;
    const host = plants[i];
    if (host && i < 3) {
      const a = rng() * TAU;
      const x = host.position.x + Math.cos(a) * (host.radius + 0.3), z = host.position.z + Math.sin(a) * (host.radius + 0.3);
      at = ctx.isWalkable(x, z) ? new THREE.Vector3(x, ctx.groundY(x, z), z) : findSpot(ctx, rng, { clear: 0.6 });
    } else at = findSpot(ctx, rng, { clear: 0.6, pondMargin: 0.8 });
    const m = new THREE.Mesh(envGeo, envMat);
    m.position.set(at.x, at.y + 0.3, at.z);
    bag.add(m);
    envs.push({ mesh: m, at: at.clone().setY(at.y + 0.3), got: false });
  }
  const gl = glints(bag, envs.map((e) => e.at), '#ffcf7a', 0.5);
  let got = 0;
  const label = { zh: '红包', en: 'Red envelopes' };
  bag.counter('hongbao', label, `0/${envs.length}`);
  envs.forEach((e, i) => {
    const off = bag.interact({
      id: `hongbao-${i}`, position: e.at, radius: 1.4,
      labelZh: '红包', labelEn: 'Red envelope', actionZh: '拾红包', actionEn: 'Pick up',
      act() {
        if (e.got) return;
        e.got = true; off(); got++;
        gl.hide(i);
        sfx.rustle(0.8);
        ctx.audio.chime(got);
        ctx.player.emote(got === envs.length ? 'jump' : 'wave');
        burst(bag, e.at, GOLD, 14, { speed: 1.4, size: 0.02 });
        tween(bag, 500, (k) => { e.mesh.position.y = e.at.y + k * 0.6; e.mesh.scale.setScalar(1 - k); }, () => (e.mesh.visible = false));
        bag.counter('hongbao', label, `${got}/${envs.length}`);
        const w = WISHES[i];
        const done = got === envs.length;
        ctx.hud.showCard({
          titleZh: w.zh, titleEn: w.en,
          bodyZh: `红包里有 ${w.amount}，和一句话：\n“${w.zh}！”${done ? '\n\n六个红包都收下了。新年快乐，岁岁平安！' : ''}`,
          bodyEn: `Inside: ${w.amount.replace('（心意到了）', ' (it’s the thought that counts)')} and a note:\n“${w.en}!”${done ? '\n\nAll six found. Happy New Year — peace, year after year!' : ''}`,
          seal: done ? '吉' : undefined,
        });
      },
    });
  });
  const still = reducedMotion();
  bag.frame((_dt, t) => {
    if (still) return;
    envs.forEach((e, i) => { if (!e.got) { e.mesh.rotation.y = t * 0.8 + i; e.mesh.position.y = e.at.y + Math.sin(t * 1.5 + i) * 0.04; } });
  });
});

// ───────────────────────────── 元宵 ─────────────────────────────

const RIDDLES: { qZh: string; qEn: string; aZh: string; aEn: string }[] = [
  { qZh: '千条线，万条线，\n掉到水里看不见。\n（打一自然现象）', qEn: 'A thousand threads, ten thousand threads;\nthey fall into the water and vanish.\n(Something in nature)', aZh: '雨', aEn: 'Rain' },
  { qZh: '小时四条腿，长大两条腿，\n老了三条腿。\n（打一动物）', qEn: 'Four legs when small, two when grown,\nthree when old.\n(A creature)', aZh: '人（老了拄拐杖）', aEn: 'A person (the third leg is a walking stick)' },
  { qZh: '身穿绿衣裳，肚里水汪汪，\n生的子儿多，个个黑脸膛。\n（打一水果）', qEn: 'Dressed in green, belly full of water,\nmany children, every one with a black face.\n(A fruit)', aZh: '西瓜', aEn: 'A watermelon' },
  { qZh: '一口咬掉牛尾巴。\n（打一字）', qEn: 'One mouth (口) bites off the ox’s (牛) tail.\n(A character)', aZh: '告（“牛”去尾，加“口”）', aEn: '告 — 牛 without its tail, over 口' },
  { qZh: '有面无口，有脚无手，\n虽不好吃，家家都有。\n（打一物）', qEn: 'A face (top) but no mouth, legs but no hands;\nnot good to eat, yet every home has one.\n(A thing)', aZh: '桌子', aEn: 'A table' },
];

/** Two bamboo posts with a sagging cord between them; returns `n` evenly spaced hooks along the cord. */
function riddleLine(bag: Bag, n: number, rng: () => number): Hook[] {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const half = (n + 1) * 0.55;
  const H = 2.25, SAG = 0.28;
  let a = 0, b = 0;
  let c = findSpot(ctx, rng, { clear: half + 0.6, pondMargin: 2.2 });
  // along the shore (perpendicular to the way to the pond), both posts on open ground
  let dir = Math.atan2(c.z - ctx.pond.center.z, c.x - ctx.pond.center.x) + Math.PI / 2;
  for (let k = 0; k < 12; k++) {
    const d = dir + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25;
    const ok = [-1, 1].every((s) => ctx.isWalkable(c.x + Math.cos(d) * half * s, c.z + Math.sin(d) * half * s));
    if (ok) { dir = d; break; }
    if (k === 11) c = findSpot(ctx, rng, { clear: half + 0.6, pondMargin: 2.2 });
  }
  a = Math.cos(dir); b = Math.sin(dir);
  const postGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.035, 0.05, H, 6), '#6b5a3e', { p: [0, H / 2, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6), '#4a3c2b', { p: [0, H * 0.45, 0] }),
    part(THREE, new THREE.SphereGeometry(0.05, 6, 4), '#4a3c2b', { p: [0, H, 0] }),
  ]);
  bag.own(postGeo);
  const ends = [-1, 1].map((s) => {
    const x = c.x + a * half * s, z = c.z + b * half * s, y = ctx.groundY(x, z);
    const post = inked(ctx, postGeo, { width: 0.01 });
    post.position.set(x, y, z);
    bag.add(post);
    return new THREE.Vector3(x, y + H - 0.04, z);
  });
  const at = (t: number) => new THREE.Vector3().lerpVectors(ends[0], ends[1], t).setY(ends[0].y + (ends[1].y - ends[0].y) * t - SAG * Math.sin(Math.PI * t));
  const cord = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 17 }, (_, i) => at(i / 16)));
  bag.add(new THREE.Line(cord, new THREE.LineBasicMaterial({ color: P.ink, transparent: true, opacity: 0.75 })));
  return Array.from({ length: n }, (_, i) => { const p = at((i + 1) / (n + 1)); return { x: p.x, y: p.y, z: p.z }; });
}

export const lantern = feature('lantern', async (bag, ctx) => {
  if (!ctx.env.festivals.includes('lantern')) return;
  const { THREE, pond, palette: P } = ctx;
  const rng = dayRng(ctx, '115');
  await loadBrush('元宵灯谜汤圆');
  if (bag.disposed) return;
  festivalNight(bag);
  ctx.hud.toast('元宵快乐！去猜灯谜吧', 'Happy Lantern Festival! Go and guess the lantern riddles', 4000);

  // Sky lanterns (孔明灯) rising in a slow, endless stream.
  const still = reducedMotion();
  const n = still ? 10 : 22;
  const geo = new THREE.CylinderGeometry(0.3, 0.21, 0.55, 4, 2, true);
  geo.rotateY(Math.PI / 4);
  { // glowing from the flame below: bright at the mouth, deeper orange at the top
    const gp = geo.attributes.position, cols = new Float32Array(gp.count * 3);
    const lo = new THREE.Color('#ffe09a'), hi = new THREE.Color('#d8642a'), c = new THREE.Color();
    for (let i = 0; i < gp.count; i++) { c.lerpColors(lo, hi, (gp.getY(i) + 0.275) / 0.55); cols.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const sky = bag.add(reflects(new THREE.InstancedMesh(geo, skyMat, n)));
  sky.frustumCulled = false;
  const glowPos = new Float32Array(n * 3);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3).setUsage(THREE.DynamicDrawUsage));
  const glow = bag.add(reflects(new THREE.Points(gGeo, new THREE.PointsMaterial({ size: 1.8, map: glowTexture(THREE, 64, 0.1), color: '#ffb060', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))));
  glow.frustumCulled = false;
  bag.frame(() => { glow.visible = ctx.sky.isNight(); });
  // Half rise from round the pond, half far off across it, so the stream is in view as you walk.
  const way = entry(ctx);
  const origin = (i: number): [number, number] => {
    if (i % 2 === 0) { const a = rng() * TAU, r = 0.7 + rng() * 1.2; return [pond.center.x + Math.cos(a) * pond.radiusX * r, pond.center.z + Math.sin(a) * pond.radiusZ * r]; }
    const a = Math.atan2(-way.dz, -way.dx) + (rng() - 0.5) * 1.6, r = 18 + rng() * 22;
    return [pond.center.x + Math.cos(a) * r, pond.center.z + Math.sin(a) * r];
  };
  const TOP = 30;
  const ls = Array.from({ length: n }, (_, i) => {
    const [x, z] = origin(i);
    return { x, y: rng() * TOP, z, v: 0.25 + rng() * 0.3, ph: i * 1.3, i };
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  bag.frame((dt, t) => {
    dt = Math.min(dt, 0.1);
    for (let i = 0; i < n; i++) {
      const l = ls[i];
      l.y += l.v * dt * (still ? 0.5 : 1);
      l.x += Math.sin(t * 0.2 + l.ph) * dt * 0.3 + dt * 0.15;
      if (l.y > TOP) { l.y = 0.5; [l.x, l.z] = origin(l.i); }
      e.set(Math.sin(t * 0.5 + l.ph) * 0.06, l.ph, Math.cos(t * 0.4 + l.ph) * 0.06);
      q.setFromEuler(e);
      const s = Math.min(1, l.y / 1.5);
      m.compose(v.set(l.x, Math.max(pond.waterY, ctx.groundY(l.x, l.z)) + l.y, l.z), q, one.set(s, s, s));
      sky.setMatrixAt(i, m);
      glowPos[i * 3] = l.x; glowPos[i * 3 + 1] = v.y; glowPos[i * 3 + 2] = l.z;
    }
    sky.instanceMatrix.needsUpdate = true;
    gGeo.attributes.position.needsUpdate = true;
  });

  // Riddle lanterns: five paper lanterns on a cord between two bamboo posts, each with a slip of paper.
  const hooks = riddleLine(bag, RIDDLES.length, rng);
  const { lanterns } = hangLanterns(bag, hooks, { colors: [PAPER_APRICOT, PAPER_OCHRE, P.cinnabar, PAPER_OCHRE, PAPER_APRICOT], size: 1.1, drop: 0.12 });
  const slipTex = canvasTexture(THREE, 32, 128, (g, w, h) => { g.fillStyle = '#f1e2b8'; g.fillRect(0, 0, w, h); g.fillStyle = '#b9302a'; g.fillRect(3, 3, w - 6, 8); });
  const slipMat = new THREE.MeshLambertMaterial({ map: slipTex, side: THREE.DoubleSide });
  const slipGeo = new THREE.PlaneGeometry(0.07, 0.3);
  let solved = 0;
  const label = { zh: '灯谜', en: 'Riddles' };
  bag.counter('riddles', label, `0/${RIDDLES.length}`);
  lanterns.forEach((c, i) => {
    const slip = new THREE.Mesh(slipGeo, slipMat);
    slip.position.set(c.x, c.y - 0.5, c.z);
    bag.add(slip);
    const r = RIDDLES[i];
    let stage = 0;
    const at = new THREE.Vector3(c.x, ctx.groundY(c.x, c.z), c.z);
    const it: Interactable = {
      id: `riddle-${i}`, position: at, radius: 1.5,
      labelZh: `灯谜 · 其${'一二三四五'[i]}`, labelEn: `Lantern riddle ${i + 1}`,
      actionZh: '猜灯谜', actionEn: 'Read the riddle',
      act() {
        sfx.rustle(0.6);
        if (stage === 0) {
          stage = 1;
          it.actionZh = '揭晓谜底'; it.actionEn = 'Reveal the answer';
          ctx.hud.showCard({ titleZh: `灯谜 · 其${'一二三四五'[i]}`, titleEn: `Riddle ${i + 1}`, bodyZh: `${r.qZh}\n\n（想好了，再来揭晓）`, bodyEn: `${r.qEn}\n\n(Think it over, then come back to reveal)` });
        } else {
          if (stage === 1) { solved++; bag.counter('riddles', label, `${solved}/${RIDDLES.length}`); ctx.audio.chime(solved); slip.visible = false; }
          stage = 2;
          it.actionZh = '再看谜底'; it.actionEn = 'See the answer';
          ctx.hud.showCard({ titleZh: '谜底', titleEn: 'The answer', bodyZh: `${r.qZh}\n\n谜底：${r.aZh}${solved === RIDDLES.length ? '\n\n五个灯谜都猜完啦！' : ''}`, bodyEn: `${r.qEn}\n\nAnswer: ${r.aEn}${solved === RIDDLES.length ? '\n\nAll five riddles solved!' : ''}`, seal: solved === RIDDLES.length ? '元宵' : undefined });
        }
      },
    };
    bag.interact(it);
  });

  // A bowl of 汤圆 on a stone table.
  const tAt = findSpot(ctx, rng, { clear: 1.6, pondMargin: 2 });
  const table = stoneTable(ctx, tAt, rng() * TAU);
  bag.add(table.group);
  const b = bowl(ctx, '#e9e0cc', 0.16);
  b.position.set(tAt.x, table.top, tAt.z);
  bag.add(b);
  const balls = new THREE.InstancedMesh(merge(THREE, [part(THREE, new THREE.IcosahedronGeometry(0.035, 1), '#fbf8f0')]), propMat(ctx), 5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    m.makeTranslation(tAt.x + Math.cos(a) * 0.055, table.top + 0.1, tAt.z + Math.sin(a) * 0.055);
    balls.setMatrixAt(i, m);
  }
  bag.add(balls);
  let ate = false;
  bag.interact({
    id: 'tangyuan', position: new THREE.Vector3(tAt.x, table.top, tAt.z), radius: 1.6,
    labelZh: '一碗汤圆', labelEn: 'A bowl of tangyuan', actionZh: '吃汤圆', actionEn: 'Eat',
    act() {
      if (ate) { ctx.hud.toast('碗已经空了', 'The bowl is empty', 1500); return; }
      ate = true;
      ctx.player.emote('eat');
      ctx.audio.chime(2);
      balls.visible = false;
      ctx.hud.showCard({ titleZh: '汤圆', titleEn: 'Tangyuan', bodyZh: '黑芝麻馅，烫口，慢慢吃。\n团团圆圆。', bodyEn: 'Black-sesame filling — hot, so go slowly.\nRound, like a family gathered together.' });
    },
  });
});

// ───────────────────────────── 元旦 ─────────────────────────────

export const newyear = feature('newyear', (bag, ctx) => {
  if (!ctx.env.festivals.includes('newyear')) return;
  const night = festivalNight(bag);
  const fw = fireworks(bag, { every: [2.5, 5], onlyAtNight: true });
  const year = newYearOf(ctx.env.date);
  const beat = (n: number) => bag.later(1500 + (3 - n) * 1000, () => {
    ctx.hud.toast(String(n), String(n), 900);
    ctx.audio.pluck(n === 1 ? 4 : n === 2 ? 2 : 0, 0.6);
  });
  beat(3); beat(2); beat(1);
  bag.later(4500, () => {
    if (night) fw.salvo(6);
    ctx.audio.bell();
    ctx.hud.showCard({
      titleZh: `元旦快乐 · ${year}`, titleEn: `Happy New Year ${year}`,
      bodyZh: '一元复始，万象更新。\n\n新的一年，新的一页——园子里每一株草木，都在等你。',
      bodyEn: 'One cycle ends, and everything begins anew.\n\nA new year, a new page — every plant in the garden is waiting for you.',
      seal: '新',
    });
  });
});

export const FESTIVE = [spring, lantern, newyear];
