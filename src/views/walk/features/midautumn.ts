// 中秋 · Mid-Autumn: a huge golden moon over the hills and its glittering path on the pond, eight
// mooncakes hidden round the garden (eat them all!), a jade rabbit on the lawn, osmanthus in the
// air, red lanterns along the shore.
import type * as T from 'three';
import type { WorldCtx } from '../types';
import { Bag, BRUSH_FONT, canvasTexture, claims, distXZ, feature, findSpot, glowTexture, landmarks, loadBrush, pondDist, reducedMotion, shorePoint, tween, dayRng } from './kit';
import { merge, part } from './geo';
import { aroundPond, burst, flatRock, glints, lanternRow, lotusPad, plate, stoneTable, teaSet } from './props';
import * as sfx from './sfx';

const TAU = Math.PI * 2;

interface Flavour { zh: string; en: string; mark: string; lineZh: string; lineEn: string; kind: 'baked' | 'snow' | 'su' }

const FLAVOURS: Flavour[] = [
  { zh: '莲蓉', en: 'Lotus-seed paste', mark: '月', kind: 'baked',
    lineZh: '莲子磨得细如绸，甜而不腻——广式月饼的正宗。', lineEn: 'Lotus seeds ground smooth as silk: sweet, never cloying. The classic Cantonese filling.' },
  { zh: '五仁', en: 'Five kernels', mark: '福', kind: 'baked',
    lineZh: '杏仁、核桃、花生、芝麻、瓜子。爱它的人，是真的很爱。', lineEn: 'Almond, walnut, peanut, sesame, melon seed. Those who love it really love it.' },
  { zh: '豆沙', en: 'Red bean', mark: '花', kind: 'baked',
    lineZh: '红豆慢火熬成沙，绵密温和，像一个平常的好日子。', lineEn: 'Red beans simmered to a soft paste — gentle, like an ordinary good day.' },
  { zh: '蛋黄莲蓉', en: 'Salted yolk & lotus', mark: '圆', kind: 'baked',
    lineZh: '切开来，莲蓉里藏着一轮咸蛋黄——一口咬到小月亮。', lineEn: 'Cut it open: a salted yolk hides in the paste. You bit into a little moon.' },
  { zh: '冰皮', en: 'Snow skin', mark: '冰', kind: 'snow',
    lineZh: '不经烘烤，冰凉软糯，像月光凝成的。', lineEn: 'Never baked; cool and soft, as if made of moonlight.' },
  { zh: '鲜肉', en: 'Suzhou pork', mark: '鲜肉', kind: 'su',
    lineZh: '苏式酥皮一碰就掉渣，鲜肉馅要趁热吃。小心衣襟！', lineEn: 'Suzhou-style flaky pastry, savoury pork inside — eat it warm, mind the crumbs!' },
  { zh: '枣泥', en: 'Jujube paste', mark: '喜', kind: 'baked',
    lineZh: '枣泥深红，甜得醇厚，是北方的老味道。', lineEn: 'Deep-red jujube paste, rich and mellow — an old northern taste.' },
  { zh: '桂花', en: 'Osmanthus', mark: '桂', kind: 'baked',
    lineZh: '桂花糖馅，一口下去，满嘴秋香。', lineEn: 'Osmanthus sugar filling: one bite, and your mouth is full of autumn.' },
];

// ───────────────────────────── mooncake ─────────────────────────────

function mooncakeTop(ctx: WorldCtx, f: Flavour): T.CanvasTexture {
  const { THREE } = ctx;
  const base = f.kind === 'snow' ? ['#f6ece8', '#ecd3cf', '#d7b3ad'] : f.kind === 'su' ? ['#f0dcae', '#e2c287', '#c9a262'] : ['#d9a152', '#c3843b', '#9c6128'];
  return canvasTexture(THREE, 256, 256, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 10, c, c, c);
    grd.addColorStop(0, base[0]);
    grd.addColorStop(0.75, base[1]);
    grd.addColorStop(1, base[2]);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
    if (f.kind === 'su') {
      // flaky layers and a red stamp
      g.strokeStyle = 'rgba(160,110,50,0.35)';
      for (let r = 30; r < c; r += 9) { g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
      g.fillStyle = '#c0412f';
      g.font = `bold 58px ${BRUSH_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('鲜肉', c, c + 2);
      return;
    }
    const emboss = (fn: () => void) => {
      g.save(); g.translate(3, 3); g.globalAlpha = 0.55; fn(); g.restore();
    };
    const dark = f.kind === 'snow' ? '#b88f88' : '#6e4119';
    const light = f.kind === 'snow' ? '#fffaf6' : '#f1c374';
    // scalloped rim: 12 petals
    const petals = (col: string, lw: number) => {
      g.strokeStyle = col;
      g.lineWidth = lw;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.beginPath();
        g.arc(c + Math.cos(a) * 96, c + Math.sin(a) * 96, 22, a - 1.7, a + 1.7);
        g.stroke();
      }
      g.beginPath(); g.arc(c, c, 74, 0, TAU); g.stroke();
      g.beginPath(); g.arc(c, c, 66, 0, TAU); g.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath(); g.arc(c + Math.cos(a) * 70, c + Math.sin(a) * 70, 2.2, 0, TAU); g.stroke();
      }
    };
    emboss(() => petals(dark, 6));
    g.save(); g.translate(-1.5, -1.5); petals(light, 3); g.restore();
    petals(base[1], 3);
    g.font = `${f.mark.length > 1 ? 50 : 84}px ${BRUSH_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = dark; g.globalAlpha = 0.7; g.fillText(f.mark, c + 3, c + 5);
    g.fillStyle = light; g.globalAlpha = 0.9; g.fillText(f.mark, c - 1.5, c + 0.5);
    g.fillStyle = base[1]; g.globalAlpha = 1; g.fillText(f.mark, c, c + 2);
  });
}

function mooncakeMesh(ctx: WorldCtx, f: Flavour, sideMat: T.Material): T.Mesh {
  const { THREE } = ctx;
  const r = 0.19, h = 0.085;
  const geo = new THREE.CylinderGeometry(r, r * 1.03, h, 48, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = f.kind === 'baked' ? 1 + 0.045 * Math.abs(Math.cos(a * 6)) - 0.02 : 1;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  geo.translate(0, h / 2, 0);
  const top = mooncakeTop(ctx, f);
  const topMat = new THREE.MeshLambertMaterial({ map: top, bumpMap: top, bumpScale: 2.2 });
  const mesh = new THREE.Mesh(geo, [sideMat, topMat, sideMat]);
  return mesh;
}

// ───────────────────────────── moon path on the water ─────────────────────────────

function moonPath(bag: Bag, moonDir: () => T.Vector3): T.Mesh {
  const ctx = bag.ctx;
  const { THREE, pond } = ctx;
  const geo = new THREE.CircleGeometry(1, 64);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uMoon: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uCenter: { value: new THREE.Vector2(pond.center.x, pond.center.z) },
    uRadii: { value: new THREE.Vector2(pond.radiusX, pond.radiusZ) },
    uColor: { value: new THREE.Color('#ffe2a0') },
    uStrength: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCam; uniform vec3 uMoon; uniform vec2 uCenter; uniform vec2 uRadii;
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vW;
      void main() {
        vec2 e = (vW.xz - uCenter) / uRadii;
        float edge = 1.0 - smoothstep(0.78, 1.0, length(e));
        vec3 v = normalize(vW - uCam);
        vec3 r = vec3(v.x, -v.y, v.z);
        float n = sin(vW.x * 3.1 + uTime * 1.1) * sin(vW.z * 4.3 - uTime * 0.9)
                + 0.5 * sin((vW.x - vW.z) * 8.7 + uTime * 1.9);
        float align = dot(r, uMoon) + 0.006 * n;
        float core = smoothstep(0.985, 0.9995, align);
        float halo = smoothstep(0.95, 1.0, align);
        float sp = pow(max(0.0, sin(vW.x * 17.0 + n * 2.5 + uTime * 0.7) * sin(vW.z * 21.0 - uTime * 1.3 + n * 3.0)), 4.0);
        float a = edge * (core * (0.2 + 1.5 * sp) + halo * halo * 0.1);
        gl_FragColor = vec4(uColor * a * uStrength, 1.0);
      }`,
  });
  const mesh = bag.add(new THREE.Mesh(geo, mat));
  mesh.position.set(pond.center.x, pond.waterY + 0.015, pond.center.z);
  mesh.scale.set(pond.radiusX, 1, pond.radiusZ);
  mesh.renderOrder = 2;
  const still = reducedMotion();
  bag.frame((_dt, t) => {
    uniforms.uTime.value = still ? 0 : t;
    uniforms.uCam.value.copy(ctx.camera.position);
    uniforms.uMoon.value.copy(moonDir());
    uniforms.uStrength.value = Math.min(1, uniforms.uStrength.value + 0.01);
  });
  return mesh;
}

// ───────────────────────────── jade rabbit ─────────────────────────────

function rabbitMesh(ctx: WorldCtx): T.Mesh {
  const { THREE, palette: P } = ctx;
  const w = '#f7f4ec', pink = '#e8b7b0';
  const g = merge(THREE, [
    part(THREE, new THREE.IcosahedronGeometry(0.16, 0), w, { p: [0, 0.14, 0], s: [0.85, 0.8, 1.1] }),
    part(THREE, new THREE.IcosahedronGeometry(0.1, 0), w, { p: [0, 0.27, 0.13] }),
    part(THREE, new THREE.BoxGeometry(0.04, 0.2, 0.025), w, { p: [0.035, 0.42, 0.1], r: [-0.25, 0, -0.15] }),
    part(THREE, new THREE.BoxGeometry(0.04, 0.2, 0.025), w, { p: [-0.035, 0.42, 0.1], r: [-0.25, 0, 0.15] }),
    part(THREE, new THREE.BoxGeometry(0.02, 0.14, 0.01), pink, { p: [0.036, 0.42, 0.115], r: [-0.25, 0, -0.15] }),
    part(THREE, new THREE.BoxGeometry(0.02, 0.14, 0.01), pink, { p: [-0.036, 0.42, 0.115], r: [-0.25, 0, 0.15] }),
    part(THREE, new THREE.IcosahedronGeometry(0.018, 0), P.rouge, { p: [0.06, 0.29, 0.19] }),
    part(THREE, new THREE.IcosahedronGeometry(0.018, 0), P.rouge, { p: [-0.06, 0.29, 0.19] }),
    part(THREE, new THREE.IcosahedronGeometry(0.012, 0), pink, { p: [0, 0.25, 0.225] }),
    part(THREE, new THREE.IcosahedronGeometry(0.05, 0), '#ffffff', { p: [0, 0.16, -0.17] }),
    part(THREE, new THREE.IcosahedronGeometry(0.045, 0), w, { p: [0.08, 0.04, 0.1], s: [0.8, 0.6, 1.3] }),
    part(THREE, new THREE.IcosahedronGeometry(0.045, 0), w, { p: [-0.08, 0.04, 0.1], s: [0.8, 0.6, 1.3] }),
  ]);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#40403a') }));
}

// ───────────────────────────── the feature ─────────────────────────────

export const midautumn = feature('midautumn', async (bag, ctx) => {
  if (!ctx.env.festivals.includes('midautumn')) return;
  const { THREE, pond } = ctx;
  const rng = dayRng(ctx, '815');
  const still = reducedMotion();
  await loadBrush(FLAVOURS.map((f) => f.mark).join('') + '但愿人长久千里共婵娟团圆');
  if (bag.disposed) return;

  // The moon: huge and golden, night falls for it. Features never own the sky, so we restore it.
  ctx.sky.forceNight(true);
  const spawn = ctx.player.position.clone();
  // Where the moon rises: beyond the pond as seen from where we arrive (月映水), a little aside.
  const across = new THREE.Vector3(pond.center.x - spawn.x, 0, pond.center.z - spawn.z);
  if (across.lengthSq() < 1) across.set(0, 0, -1);
  across.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.12);
  const moonDirV = new THREE.Vector3(across.x, 0.3, across.z).normalize();
  const rise = (k: number) => {
    const e = 1 - Math.pow(1 - k, 3);
    moonDirV.set(across.x, 0.05 + 0.21 * e, across.z).normalize();
    ctx.sky.setMoon({ visible: true, scale: 1.8 + 1.6 * e, glow: 1 + 0.8 * e, position: moonDirV.clone() });
  };
  if (still) rise(1);
  else tween(bag, 10000, rise);
  bag.onDispose(() => {
    ctx.sky.setMoon({ scale: 1, glow: 1 });
    ctx.sky.forceNight(false);
  });
  const moonDir = () => moonDirV;
  moonPath(bag, moonDir);

  // Red lanterns along the shore path.
  lanternRow(bag, aroundPond(ctx, 8, 1.7, rng() * TAU), pond.center);

  // ── eight mooncakes ──
  const sideMats = {
    baked: new THREE.MeshLambertMaterial({ color: '#b87632', flatShading: true }),
    snow: new THREE.MeshLambertMaterial({ color: '#efdcd6', flatShading: true }),
    su: new THREE.MeshLambertMaterial({ color: '#e9cf98', flatShading: true }),
  };
  Object.values(sideMats).forEach((m) => bag.own(m));
  const spots: { at: T.Vector3; rot: number }[] = [];
  const holders: T.Object3D[] = [];
  const hold = (o: T.Object3D) => { holders.push(o); bag.add(o); return o; };

  // Two stone tables near the water, with tea.
  const tA = findSpot(ctx, rng, { clear: 1.6, pondMargin: 2.2, maxR: ctx.bounds.radius * 0.6 });
  const tableA = stoneTable(ctx, tA, rng() * TAU);
  hold(tableA.group);
  const tea = teaSet(ctx);
  tea.position.set(tA.x - 0.12, tableA.top, tA.z + 0.2);
  hold(tea);
  spots.push({ at: new THREE.Vector3(tA.x + 0.2, tableA.top, tA.z - 0.08), rot: 0.3 }, { at: new THREE.Vector3(tA.x - 0.2, tableA.top, tA.z - 0.18), rot: 1.2 });
  const tB = findSpot(ctx, rng, { clear: 1.6, pondMargin: 2, minR: ctx.bounds.radius * 0.35 });
  const tableB = stoneTable(ctx, tB, rng() * TAU, 2);
  hold(tableB.group);
  spots.push({ at: new THREE.Vector3(tB.x, tableB.top, tB.z), rot: 2 });

  // Under the plum (or whichever of the user's plants is there).
  const plants = landmarks(ctx).filter((l) => l.kind === 'plant');
  const plum = plants.find((l) => l.plant === 'plum') ?? plants[Math.floor(rng() * plants.length)];
  if (plum) {
    const a = Math.atan2(pond.center.z - plum.position.z, pond.center.x - plum.position.x) + 0.5;
    const d = plum.radius + 0.35;
    const x = plum.position.x + Math.cos(a) * d, z = plum.position.z + Math.sin(a) * d;
    spots.push({ at: new THREE.Vector3(x, ctx.groundY(x, z), z), rot: 0.7 });
  } else {
    spots.push({ at: findSpot(ctx, rng, { clear: 0.8 }), rot: 0.7 });
  }

  // On a flat rock at the water's edge.
  const rockA = rng() * TAU;
  let rockAt = shorePoint(ctx, rockA, 0.35);
  for (let k = 0; k < 12 && !ctx.isWalkable(rockAt.x, rockAt.z); k++) rockAt = shorePoint(ctx, rockA + k * 0.5, 0.4);
  const rock = flatRock(ctx, rockAt, 0.6);
  hold(rock.mesh);
  claims(ctx).push({ x: rockAt.x, z: rockAt.z, r: 0.8 });
  spots.push({ at: new THREE.Vector3(rockAt.x, rock.top, rockAt.z), rot: 0 });

  // On the bridge or the pavilion, if the garden has one; else on a stone bench.
  const perch = landmarks(ctx).find((l) => l.kind === 'pavilion') ?? landmarks(ctx).find((l) => l.kind === 'bridge');
  if (perch) {
    const box = new THREE.Box3().setFromObject(perch.object);
    const top = perch.kind === 'bridge' ? box.max.y - 0.02 : box.min.y + 0.8;
    spots.push({ at: new THREE.Vector3(perch.position.x + (perch.kind === 'pavilion' ? 0.4 : 0.35), top, perch.position.z), rot: 1 });
  } else {
    const b = findSpot(ctx, rng, { clear: 1.2 });
    const bench = new THREE.Mesh(merge(THREE, [
      part(THREE, new THREE.BoxGeometry(1.3, 0.1, 0.42), '#8f8b80', { p: [0, 0.45, 0] }),
      part(THREE, new THREE.BoxGeometry(0.16, 0.42, 0.34), '#77736a', { p: [0.48, 0.21, 0] }),
      part(THREE, new THREE.BoxGeometry(0.16, 0.42, 0.34), '#77736a', { p: [-0.48, 0.21, 0] }),
    ]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    bench.position.copy(b);
    bench.rotation.y = rng() * TAU;
    hold(bench);
    spots.push({ at: new THREE.Vector3(b.x, b.y + 0.5, b.z), rot: 0.2 });
  }

  // The rabbit's: on the lawn, where the jade rabbit keeps an eye on it.
  const lawn = findSpot(ctx, rng, { clear: 2.5, pondMargin: 2.5, minR: 2 });
  spots.push({ at: lawn.clone(), rot: 0.4 });

  // Floating on a lotus leaf near the shore — lean over to reach it.
  const padA = rng() * TAU;
  let padShore = shorePoint(ctx, padA, 0);
  for (let k = 0; k < 12 && !ctx.isWalkable(shorePoint(ctx, padA + k * 0.5, 0.6).x, shorePoint(ctx, padA + k * 0.5, 0.6).z); k++) padShore = shorePoint(ctx, padA + k * 0.5 + 0.5, 0);
  const inward = new THREE.Vector3(pond.center.x - padShore.x, 0, pond.center.z - padShore.z).normalize();
  const padAt = new THREE.Vector3(padShore.x + inward.x * 0.7, pond.waterY + 0.02, padShore.z + inward.z * 0.7);
  const pad = lotusPad(ctx, 0.5);
  pad.position.copy(padAt);
  hold(pad);
  spots.push({ at: new THREE.Vector3(padAt.x, padAt.y + 0.01, padAt.z), rot: 0 });

  // Build the cakes on little plates (not on the lotus leaf, the rock or the lawn).
  const order = FLAVOURS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const cakes: { mesh: T.Object3D; at: T.Vector3; flavour: Flavour; eaten: boolean }[] = [];
  spots.slice(0, 8).forEach((s, i) => {
    const f = FLAVOURS[order[i]];
    const g = new THREE.Group();
    const withPlate = i <= 3 || i === 6; // the rock, the bridge / bench and the lotus leaf stay rustic
    if (withPlate) g.add(plate(ctx, 0.25));
    const cake = mooncakeMesh(ctx, f, sideMats[f.kind]);
    cake.position.y = withPlate ? 0.026 : 0;
    cake.rotation.y = s.rot;
    g.add(cake);
    g.position.copy(s.at);
    bag.add(g);
    cakes.push({ mesh: g, at: s.at.clone(), flavour: f, eaten: false });
  });
  const glint = glints(bag, cakes.map((c) => c.at), '#ffd98a', 0.55);
  let eaten = 0;
  const total = cakes.length;
  const label = { zh: '月饼', en: 'Mooncakes' };
  bag.counter('mooncakes', label, `0/${total}`);
  ctx.hud.toast('中秋快乐！园中藏着八块月饼，去找找看', 'Happy Mid-Autumn! Eight mooncakes are hidden in the garden', 4200);

  cakes.forEach((c, i) => {
    const off = bag.interact({
      id: `mooncake-${i}`,
      position: c.at,
      radius: i === 7 ? 2.1 : 1.5,
      labelZh: `${c.flavour.zh}月饼`, labelEn: `${c.flavour.en} mooncake`,
      actionZh: '吃月饼', actionEn: 'Eat',
      act() {
        if (c.eaten) return;
        c.eaten = true;
        off();
        eaten++;
        ctx.player.emote('eat');
        sfx.bite();
        ctx.audio.chime(eaten);
        glint.hide(i);
        const cake = c.mesh.children[c.mesh.children.length - 1];
        // three bites, then gone
        tween(bag, 900, (k) => {
          const s = 1 - Math.floor(k * 3) / 3 * 0.9;
          cake.scale.set(s, 1, s);
          cake.rotation.y += 0.02;
        }, () => { cake.visible = false; });
        burst(bag, c.at.clone().add(new THREE.Vector3(0, 0.1, 0)), c.flavour.kind === 'snow' ? '#f1e2dc' : '#c98b43', 18, { speed: 0.9, size: 0.02 });
        bag.later(700, () => burst(bag, c.at.clone().add(new THREE.Vector3(0, 0.1, 0)), '#d9a152', 10, { speed: 0.7, size: 0.018 }));
        bag.counter('mooncakes', label, `${eaten}/${total}`);
        bag.later(900, () => {
          if (eaten < total) {
            ctx.hud.showCard({
              titleZh: `${c.flavour.zh}月饼`, titleEn: `${c.flavour.en} mooncake`,
              bodyZh: `${c.flavour.lineZh}\n\n（已吃 ${eaten} / ${total}）`,
              bodyEn: `${c.flavour.lineEn}\n\n(${eaten} of ${total} eaten)`,
            });
          } else {
            ctx.audio.bell();
            ctx.hud.showCard({
              titleZh: '但愿人长久', titleEn: 'May we all be well',
              bodyZh: `最后一块是${c.flavour.zh}的。八块月饼，一块不剩！\n\n明月几时有？把酒问青天。\n……\n但愿人长久，千里共婵娟。\n\n——苏轼《水调歌头》`,
              bodyEn: `The last one was ${c.flavour.en.toLowerCase()}. All eight mooncakes, gone!\n\n“Bright moon, when did you first appear? Cup in hand, I ask the sky…\nMay we all live long, and share this moon’s beauty though a thousand miles apart.”\n\n— Su Shi, Prelude to Water Melody`,
              seal: '团圆',
            });
            tame = true;
          }
        });
      },
    });
  });

  // ── the jade rabbit ──
  const rabbit = rabbitMesh(ctx);
  bag.add(rabbit);
  const rGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 64, 0.1), color: '#fff6dc', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  rGlow.scale.set(0.9, 0.9, 1);
  bag.add(rGlow);
  const rb = { x: lawn.x + 1.2, z: lawn.z + 0.4, h: rng() * TAU, hop: 0, hopDur: 0.34, hopLen: 0.3, fx: 0, fz: 0, tx: 0, tz: 0, idle: 1, fleeing: false };
  let tame = false;
  let petted = false;
  const home = lawn.clone();
  const tryHop = (dirA: number, len: number) => {
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 2, -2, Math.PI]) {
      const a = dirA + da;
      const nx = rb.x + Math.sin(a) * len, nz = rb.z + Math.cos(a) * len;
      if (ctx.isWalkable(nx, nz) && pondDist(ctx, nx, nz, 0.4) >= 1 && Math.hypot(nx, nz) < ctx.bounds.radius * 0.9) {
        rb.fx = rb.x; rb.fz = rb.z; rb.tx = nx; rb.tz = nz; rb.h = a; rb.hop = 1e-4; return true;
      }
    }
    return false;
  };
  const petPos = new THREE.Vector3();
  let petOff: (() => void) | null = null;
  bag.frame((dt, t) => {
    dt = Math.min(dt, 0.1);
    const pp = ctx.player.position;
    const dp = Math.hypot(rb.x - pp.x, rb.z - pp.z);
    if (!tame) rb.fleeing = dp < 3.4 || (rb.fleeing && dp < 6);
    else rb.fleeing = false;
    if (rb.hop > 0) {
      rb.hop += dt / rb.hopDur;
      const k = Math.min(1, rb.hop);
      rb.x = rb.fx + (rb.tx - rb.fx) * k;
      rb.z = rb.fz + (rb.tz - rb.fz) * k;
      if (k >= 1) { rb.hop = 0; rb.idle = rb.fleeing ? 0.02 : 0.15 + rng() * (rng() < 0.3 ? 2.5 : 0.4); }
    } else {
      rb.idle -= dt;
      if (rb.idle <= 0) {
        if (rb.fleeing) {
          rb.hopDur = 0.2; rb.hopLen = 0.55;
          tryHop(Math.atan2(rb.x - pp.x, rb.z - pp.z) + (rng() - 0.5) * 0.8, rb.hopLen);
        } else if (tame && dp > 1.6) {
          rb.hopDur = 0.32; rb.hopLen = 0.3; // come to you
          tryHop(Math.atan2(pp.x - rb.x, pp.z - rb.z), rb.hopLen);
        } else if (!tame) {
          rb.hopDur = 0.34; rb.hopLen = 0.3;
          const toHome = Math.hypot(home.x - rb.x, home.z - rb.z) > 3.5;
          tryHop(toHome ? Math.atan2(home.x - rb.x, home.z - rb.z) : rb.h + (rng() - 0.5) * 2.2, rb.hopLen);
        } else rb.idle = 0.5;
      }
    }
    const k = rb.hop > 0 ? Math.min(1, rb.hop) : 0;
    const y = ctx.groundY(rb.x, rb.z) + Math.sin(k * Math.PI) * (rb.fleeing ? 0.22 : 0.12);
    rabbit.position.set(rb.x, y, rb.z);
    rabbit.rotation.set(rb.hop > 0 ? -Math.sin(k * TAU) * 0.25 : (still ? 0 : Math.max(0, Math.sin(t * 5)) * 0.08), rb.h, 0);
    const sq = rb.hop > 0 ? 1 + Math.sin(k * Math.PI) * 0.12 : 1 + (still ? 0 : Math.sin(t * 2.2) * 0.02);
    rabbit.scale.set(1.05 / Math.sqrt(sq), 1.05 * sq, 1.05 / Math.sqrt(sq));
    rGlow.position.set(rb.x, y + 0.2, rb.z);
    rGlow.visible = ctx.sky.isNight();
    if (tame && !petOff) {
      petPos.set(rb.x, y, rb.z);
      petOff = bag.interact({
        id: 'jade-rabbit', position: petPos, radius: 1.4,
        labelZh: '玉兔', labelEn: 'Jade rabbit', actionZh: '摸摸', actionEn: 'Pet',
        act() {
          ctx.player.emote('wave');
          ctx.audio.pluck(4, 0.5);
          if (!petted) {
            petted = true;
            ctx.hud.showCard({
              titleZh: '玉兔', titleEn: 'The Jade Rabbit',
              bodyZh: '它不跑了，把耳朵靠在你手心。\n\n“嫦娥姐姐让我下来看看：月饼好吃吗？”',
              bodyEn: 'It stops running and leans its ears into your hand.\n\n“Chang’e sent me down to ask: were the mooncakes good?”',
            });
          } else ctx.hud.toast('玉兔蹭了蹭你', 'The rabbit nuzzles you', 1800);
        },
      });
    }
    if (petOff) petPos.set(rb.x, y, rb.z);
  });

  // ── an osmanthus tree by table A, and its petals drifting everywhere ──
  const treeAt = findSpot(ctx, rng, { near: { x: tA.x, z: tA.z, r: 4, min: 2.6 }, clear: 1.2, pondMargin: 1.5 });
  const tree = new THREE.Group();
  const leaf = '#6f8a6c';
  const treeParts = [
    part(THREE, new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6), '#4a3b2c', { p: [0, 0.75, 0], r: [0, 0, 0.06] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.08, 0.8, 5), '#4a3b2c', { p: [0.25, 1.5, 0], r: [0, 0, -0.6] }),
  ];
  const blobs: [number, number, number, number][] = [[0, 2.1, 0, 0.9], [0.6, 1.8, 0.2, 0.65], [-0.5, 1.9, -0.2, 0.7], [0.1, 2.6, 0.1, 0.6], [0.2, 1.7, -0.6, 0.55]];
  for (const [x, y, z, r] of blobs) treeParts.push(part(THREE, new THREE.IcosahedronGeometry(r, 0), leaf, { p: [x, y, z], r: [x, y, z] }));
  tree.add(new THREE.Mesh(merge(THREE, treeParts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const flowerN = 90;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), new THREE.MeshLambertMaterial({ color: '#f0c050', emissive: new THREE.Color('#8a6214') }), flowerN);
  const fm = new THREE.Matrix4();
  for (let i = 0; i < flowerN; i++) {
    const [bx, by, bz, br] = blobs[i % blobs.length];
    const d = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(br * 0.92);
    fm.makeTranslation(bx + d.x, by + d.y, bz + d.z);
    flowers.setMatrixAt(i, fm);
  }
  tree.add(flowers);
  tree.position.copy(treeAt);
  tree.scale.setScalar(0.8);
  bag.add(tree);

  const petalN = still ? 24 : 70;
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.03, 0.02), new THREE.MeshBasicMaterial({ color: '#f0bd45', side: THREE.DoubleSide, fog: false }), petalN);
  petals.frustumCulled = false;
  bag.add(petals);
  const pet = Array.from({ length: petalN }, (_, i) => ({ x: 0, y: -1, z: 0, ph: rng() * TAU, sp: 0.18 + rng() * 0.2, nearTree: i % 2 === 0 }));
  const respawn = (p: typeof pet[number], top: boolean) => {
    const c = p.nearTree ? treeAt : ctx.player.position;
    const r = p.nearTree ? 2.2 : 7;
    p.x = c.x + (rng() - 0.5) * r * 2;
    p.z = c.z + (rng() - 0.5) * r * 2;
    p.y = (p.nearTree ? treeAt.y + 2.6 : ctx.groundY(p.x, p.z) + 3.5) * (top ? 1 : 0.2 + rng() * 0.8) + (top ? 0 : 0.5);
  };
  pet.forEach((p) => respawn(p, false));
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(), pv = new THREE.Vector3(), ps = new THREE.Vector3(1, 1, 1);
  bag.frame((dt, t) => {
    dt = Math.min(dt, 0.1);
    for (let i = 0; i < petalN; i++) {
      const p = pet[i];
      p.y -= p.sp * dt;
      p.x += Math.sin(t * 0.8 + p.ph) * dt * 0.25 + dt * 0.12;
      p.z += Math.cos(t * 0.6 + p.ph) * dt * 0.2;
      if (p.y < ctx.groundY(p.x, p.z) || (!p.nearTree && distXZ(p, ctx.player.position) > 9)) respawn(p, true);
      pe.set(t * 1.7 + p.ph, t * 1.1 + p.ph * 2, 0);
      pq.setFromEuler(pe);
      pm.compose(pv.set(p.x, p.y, p.z), pq, ps);
      petals.setMatrixAt(i, pm);
    }
    petals.instanceMatrix.needsUpdate = true;
  });
});
