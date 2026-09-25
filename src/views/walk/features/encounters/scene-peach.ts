// 桃花源 — the Peach Blossom Spring. On the right day, light shows behind the waterfall at the
// mountain temple and peach petals float out on the pool. Step through the small opening and you are
// in a hidden valley: peach trees in bloom along a stream, cottages in good order, fields, chickens,
// and people who have not heard of the Han, let alone the Wei or the Jin. When you leave, the way
// closes behind you: 「寻向所志，遂迷，不复得路」.
//
// The valley is a pocket of the world: built only while you are inside it, on a floor of its own
// (a walkable deck, see regions/water-decks.ts) high above an empty stretch of country, walled by a
// ring of painted hills. Nobody else can see it — and nobody can walk in without the gap.
import type * as T from 'three';
import { ANCHORS } from '../../map';
import { registerDeck, segmentDeck } from '../../regions/water-decks';
import { glowTexture } from '../kit';
import { part } from '../geo';
import { makeNoise2 } from '../../../../core/rng';
import { C, L, type Scene, type Stage } from './stage';
import { WEAR, faceMe, inHand, mark, talkPrompt } from './scene-kit';
import { COL, cottageParts, fruitBasket, mesh, peachTreeParts } from './models';

/** Where the pocket valley sits: over open country east of the river, between the lake and the hills. */
const G = { x: 112, z: -58 };
const R = 14.5; // the walkable floor's radius (the ring of hills beyond)

export function taohua(s: Stage): Scene {
  const { ctx, THREE } = s;
  const fall = ANCHORS.waterfall, pool = ANCHORS.waterfallPool;
  // a spot beside the pool to stand, facing the falls
  const door = s.spot(pool.x - 2.4, pool.z - 3.2, 6);
  const doorLook = Math.atan2(fall.x - door.x, fall.z - door.z);
  // light behind the falling water
  const behind = new THREE.Vector3(fall.x, s.y(door.x, door.z) + 2.2, fall.z - 1.5);
  const light = s.glow(behind, '#ffe6b0', 5, 0.55);
  const light2 = s.glow(behind, '#ffd0d8', 2.4, 0.7);
  // peach petals floating out on the pool and down the stream (林尽水源)
  const NP = 40;
  const pp = new Float32Array(NP * 3);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petalTex = s.bag.own(glowTexture(THREE, 32, 0.4));
  const petals = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.16, map: petalTex, color: '#f6a9bb', transparent: true, depthWrite: false }));
  petals.frustumCulled = false;
  s.bag.add(petals, s.group);
  const wyPool = ctx.waterAt(pool.x, pool.z) ?? s.y(pool.x, pool.z);
  const phase = new Float32Array(NP);
  for (let i = 0; i < NP; i++) phase[i] = s.rng();
  s.frame((dt, t) => {
    const k = 0.9 + Math.sin(t * 1.3) * 0.1;
    light.material.opacity = s.finished ? Math.max(0, light.material.opacity - dt * 0.5) : 0.55 * k;
    light2.material.opacity = s.finished ? Math.max(0, light2.material.opacity - dt * 0.5) : 0.7 * k;
    petals.visible = !s.finished;
    if (!petals.visible) return;
    for (let i = 0; i < NP; i++) {
      // drifting slowly round the pool below the falls
      const a = phase[i] * Math.PI * 2 + t * (0.05 + phase[i] * 0.06);
      const rad = 0.6 + ((i * 7919) % 100) / 100 * 2.2;
      pp[i * 3] = pool.x + Math.cos(a) * rad; pp[i * 3 + 1] = wyPool + 0.04; pp[i * 3 + 2] = pool.z + Math.sin(a) * rad * 0.8;
    }
    pgeo.attributes.position.needsUpdate = true;
  });
  const m = mark(s, { root: (() => { const o = new THREE.Group(); o.position.copy(behind); s.bag.add(o, s.group); return o; })(), height: 0.4 } as never);

  let inside: Valley | null = null;
  let gone = false;
  const doorPos = new THREE.Vector3(door.x, door.y, door.z);
  const offDoor = s.prompt({
    id: 'qiyu-taohua', position: doorPos, radius: 2.8,
    labelZh: '飞瀑之后，仿佛有光', labelEn: 'Behind the falls, a glimmer of light', actionZh: '入', actionEn: 'Go in',
    async act() {
      if (gone) { ctx.hud.toast('寻向所志，遂迷，不复得路。', 'You look for the marks you left — and lose your way. The path is not to be found again.', 4200); return; }
      if (inside || !s.claim()) return;
      m.set(false);
      await s.curtain('初极狭，才通人。复行数十步，豁然开朗。', 'At first it was very narrow, just wide enough for one. A few dozen steps on, it opened out into light.', () => {
        inside = buildValley(s);
        ctx.player.teleport(inside.mouth.x, inside.mouth.z, inside.mouthHeading, inside.floorY);
        s.music('garden');
      }, 1500);
      s.unclaim();
      ctx.hud.toast('土地平旷，屋舍俨然，有良田美池桑竹之属。', 'Level land, houses in good order, fine fields and ponds, mulberry and bamboo.', 4200);
    },
  });

  /** Out again: the curtain, the pool, the card — and the way closes. */
  const leave = async (walkedOut: boolean) => {
    if (!inside || gone) return;
    const v = inside;
    gone = true;
    const back = async () => {
      v.dispose();
      inside = null;
      ctx.player.teleport(door.x, door.z, doorLook + Math.PI);
      s.releaseMusic();
    };
    if (walkedOut) await s.curtain('既出，得其船，便扶向路，处处志之……', 'Once out, he found his boat and went back the way he came, marking the path at every turn…', back, 1400);
    else await back();
    offDoor();
    s.prompt({
      id: 'qiyu-taohua-lost', position: doorPos, radius: 2.8,
      labelZh: '飞瀑', labelEn: 'The waterfall', actionZh: '寻', actionEn: 'Search',
      act() { ctx.hud.toast('寻向所志，遂迷，不复得路。', 'You look for the marks you left — and lose your way. The path is not to be found again.', 4200); },
    });
    const who = s.who;
    s.finish(who === 'poet'
      ? { zh: '诗仙在桃源里留下一首诗：「桃花流水窅然去，别有天地非人间。」', en: 'The Poet left a poem in the valley: “Peach petals on the water drift far away — here is another world, not of men.”', bonus: 80, seal: '桃' }
      : who === 'painter'
        ? { zh: '画师凭记忆画下桃源，回来展开一看，纸上只有一片云烟。', en: 'The Painter painted the valley from memory; back outside he unrolled it, and the paper held only mist.', bonus: 80, seal: '桃' }
        : who === 'taoist'
          ? { zh: '村中长者说那是一处洞天福地，送了道童一枚仙桃。', en: 'The village elder called it a Grotto-Heaven, and gave the Taoist child a peach of the immortals.', bonus: 80, seal: '桃' }
          : { seal: '桃' });
  };
  // walked (or was carried) out some other way — the map, a fall: the valley closes all the same
  s.frame(() => {
    if (!inside) return;
    const p = s.player();
    if (Math.hypot(p.x - G.x, p.z - G.z) > R + 10 || p.y < inside.floorY - 4) void leave(false);
  });

  /** The valley itself (people, talk, the exit), built on the way in. */
  function buildValley(st: Stage): Valley {
    const v = valley(st);
    const name = { elder: C('老丈', 'Elder'), woman: C('村妇', 'Village Woman'), child: C('小童', 'Child') };
    let toldElder = false;
    talkPrompt(st, v.elder, {
      id: 'qiyu-taohua-elder', labelZh: '村中长者', labelEn: 'The village elder', actionZh: '拜见', actionEn: 'Greet',
      async act() {
        if (!st.claim()) return;
        try {
          faceMe(st, v.elder);
          const who = st.who;
          if (toldElder) { await st.say(v.elder, name.elder, [L('此中之事，不足为外人道也。', 'What is here is not worth telling to those outside.')]); return; }
          toldElder = true;
          const k = await st.say(v.elder, name.elder, [
            L('客从何来？', 'Where have you come from, stranger?', [C('沿着溪水，从飞瀑后面进来的', 'Along the stream, through a gap behind the falls'), C('我也说不清', 'I hardly know')]),
          ]);
          if (k < 0) return;
          await st.say(v.elder, name.elder, [
            L('山外……如今是何世？', 'Outside the hills… what age is it now?', [C('说来话长', 'It is a long story'), C('（一一为具言所闻）', '(tell him all you know)')]),
          ]);
          await st.say(v.elder, name.elder, [
            L('（皆叹惋。）我们先世避秦时乱，率妻子邑人来此绝境，不复出焉，遂与外人间隔。', '(All sigh.) Our forebears fled the troubles of Qin, bringing wives and neighbours to this hidden place, and never left. So we lost touch with the world outside.'),
            L('原来秦之后还有汉，汉之后还有魏晋……我们竟全然不知。', 'So after Qin there was a Han, and after Han a Wei and a Jin… We knew nothing of it.'),
          ]);
          if (who === 'poet') {
            await st.say(v.elder, name.elder, [L('先生是读书人，给我们留一首诗吧。', 'You are a man of letters, sir — leave us a poem.')]);
            st.words('别有天地非人间', new THREE.Vector3(v.elder.root.position.x, v.floorY + 2.6, v.elder.root.position.z), { color: '#b83a4b', vertical: true, life: 6 });
            await st.say(null, C('诗仙', 'Poet'), [L('问余何意栖碧山，笑而不答心自闲。桃花流水窅然去，别有天地非人间。', 'You ask why I live in the green hills; I smile and do not answer, my heart at ease. Peach petals on the water drift far away — here is another world, not of men.')]);
          } else if (who === 'painter') {
            ctx.player.emote('skill');
            await st.say(v.elder, name.elder, [L('画吧，画吧。只是画了，也带不出去的。', 'Paint, then, paint. Only — what you paint here, you cannot take out.')]);
          } else if (who === 'taoist') {
            await st.say(v.elder, name.elder, [L('小道长，此乃洞天福地，与你有缘。这枚桃子，三千年一熟，你吃了吧。', 'Little master, this is a Grotto-Heaven, and it has a bond with you. This peach ripens once in three thousand years — eat it.')]);
            ctx.player.emote('eat');
          }
          await st.say(v.elder, name.elder, [L('既来了，便是客。家里设酒杀鸡作食，吃了再走。', 'Now you are here, you are our guest. We’ll set out wine and kill a chicken — eat before you go.')]);
          ctx.player.emote('eat');
        } finally {
          st.unclaim();
        }
      },
    });
    talkPrompt(st, v.woman, {
      id: 'qiyu-taohua-woman', labelZh: '提篮的村妇', labelEn: 'A woman with a basket', actionZh: '问好', actionEn: 'Say hello',
      async act() {
        if (!st.claim()) return;
        try {
          faceMe(st, v.woman);
          await st.say(v.woman, name.woman, [L('稀客，稀客！尝尝我们的桃子——这里的桃花，一年到头都开着，桃子也一年到头都熟。', 'A rare guest! Try our peaches — the blossom here never ends, and neither do the peaches.')]);
          ctx.player.emote('eat');
        } finally {
          st.unclaim();
        }
      },
    });
    talkPrompt(st, v.child, {
      id: 'qiyu-taohua-child', labelZh: '玩耍的小童', labelEn: 'A child at play', actionZh: '逗他', actionEn: 'Play',
      async act() {
        if (!st.claim()) return;
        try {
          faceMe(st, v.child);
          const k = await st.say(v.child, name.child, [L('你是从外面来的吗？外面是什么样的？', 'Did you come from outside? What is it like out there?', [C('外面有个很大的荷塘', 'There is a great lotus lake'), C('外面也有桃花', 'There are peach trees outside too')])]);
          if (k < 0) return;
          await st.say(v.child, name.child, [k === 0 ? L('荷塘？比我们的池子还大吗？', 'A lake? Bigger than our pond?') : L('真的？可阿爷说，外面的桃花会谢的。', 'Really? Grandpa says flowers outside fade.'), L('我长大了也想出去看看……可阿爷说，出去了，就回不来了。', 'When I grow up I want to go and see… but Grandpa says once you leave, you can never come back.')]);
        } finally {
          st.unclaim();
        }
      },
    });
    // the way out, at the mouth
    st.prompt({
      id: 'qiyu-taohua-out', position: v.mouthPos, radius: 2.6,
      labelZh: '来时的小口', labelEn: 'The narrow way you came', actionZh: '出', actionEn: 'Leave',
      async act() {
        if (!st.claim()) return;
        try {
          await st.say(v.elder, name.elder, [L('客人要走了？……此中之事，不足为外人道也。', 'Leaving? …What is here is not worth telling to those outside.')]);
        } finally {
          st.unclaim();
        }
        await leave(true);
      },
    });
    return v;
  }

  return { x: door.x, z: door.z, r: 16 };
}

interface Valley {
  floorY: number;
  mouth: { x: number; z: number };
  mouthPos: T.Vector3;
  mouthHeading: number;
  elder: ReturnType<Stage['person']>;
  woman: ReturnType<Stage['person']>;
  child: ReturnType<Stage['person']>;
  dispose(): void;
}

/** Build the pocket valley (everything in one group, taken down on the way out). */
function valley(s: Stage): Valley {
  const { ctx, THREE } = s;
  const offs: (() => void)[] = [];
  // the floor: above the highest ground under the footprint, clear of everything below
  let top = -Infinity;
  for (let x = -24; x <= 24; x += 4) for (let z = -24; z <= 24; z += 4) top = Math.max(top, ctx.groundY(G.x + x, G.z + z));
  const Y = Math.ceil(top + 45);
  offs.push(registerDeck(segmentDeck('qiyu-taohua-floor', { x: G.x - R - 1.5, z: G.z }, { x: G.x + R + 1.5, z: G.z }, R + 1.5, Y)));
  const root = new THREE.Group();
  root.position.set(G.x, Y, G.z);
  s.bag.add(root, ctx.scene);
  const rng = s.rng.fork(7);
  const noise = makeNoise2(515);

  // ground: a disc of spring green, washes of yellow-green and ochre
  const disc = new THREE.CircleGeometry(R + 6, 48, 0, Math.PI * 2);
  disc.rotateX(-Math.PI / 2);
  const gp = part(THREE, disc, '#a9c46e');
  const gc = gp.getAttribute('color');
  const gpos = gp.getAttribute('position');
  const cA = new THREE.Color('#a9c46e'), cB = new THREE.Color('#c9cf7a'), cC = new THREE.Color('#b99a62'), tmp = new THREE.Color();
  for (let i = 0; i < gpos.count; i++) {
    const n = noise(gpos.getX(i) * 0.12, gpos.getZ(i) * 0.12);
    tmp.copy(cA).lerp(cB, Math.max(0, n)).lerp(cC, Math.max(0, -n) * 0.5);
    gc.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  const ground = mesh(ctx, [gp], 0);
  root.add(ground);

  // the ring of hills (jade below, misty at the crest), one mesh
  const segA = 64, segR = 5;
  const hv: number[] = [], hc: number[] = [];
  const cLow = new THREE.Color('#7fa35c'), cMid = new THREE.Color('#5f8a6e'), cTop = new THREE.Color('#c7d3b4');
  const ringPt = (i: number, j: number) => {
    const a = (i / segA) * Math.PI * 2;
    const u = j / segR;
    const r = R + 0.6 + u * 9;
    // a notch in the south where the narrow way comes in (the cleft of light)
    const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    const hTop = (11 + noise(Math.cos(a) * 3, Math.sin(a) * 3) * 5 + Math.sin(a * 5) * 1.5) * (1 - 0.8 * Math.exp(-((da / 0.2) ** 2)));
    const y = Math.pow(Math.sin(u * Math.PI * 0.5), 1.3) * hTop;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, k: y / 16 };
  };
  for (let i = 0; i < segA; i++) {
    for (let j = 0; j < segR; j++) {
      const q = [ringPt(i, j), ringPt(i + 1, j), ringPt(i + 1, j + 1), ringPt(i, j + 1)];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const p = q[idx];
        hv.push(p.x, p.y, p.z);
        tmp.copy(cLow).lerp(cMid, Math.min(1, p.k * 1.6)).lerp(cTop, Math.max(0, p.k - 0.55) * 1.8);
        hc.push(tmp.r, tmp.g, tmp.b);
      }
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hv, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
  hg.computeVertexNormals();
  const hills = mesh(ctx, [hg], 0);
  root.add(hills);
  // keep the walker inside: a ring of posts along the foot of the hills
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    offs.push(ctx.addCollider({ x: G.x + Math.cos(a) * (R + 0.4), z: G.z + Math.sin(a) * (R + 0.4), r: 1.3, h: 60 }));
  }

  // the mouth (south): a cleft of light in the hills
  const mouthA = Math.PI / 2;
  // you arrive well inside, looking up the valley (the camera behind you stays clear of the hills)
  const mouth = { x: G.x + Math.cos(mouthA) * (R - 8), z: G.z + Math.sin(mouthA) * (R - 8) };
  const mouthHeading = Math.atan2(G.x - mouth.x, G.z - mouth.z);
  const cleft = mesh(ctx, [
    part(THREE, new THREE.DodecahedronGeometry(2.2, 0), '#a8987a', { p: [-1.9, 1.4, 0], s: [0.8, 1.5, 0.8] }),
    part(THREE, new THREE.DodecahedronGeometry(2.0, 0), '#8f7f62', { p: [1.9, 1.3, 0], s: [0.8, 1.6, 0.8] }),
    part(THREE, new THREE.IcosahedronGeometry(0.9, 0), '#7f9a55', { p: [-1.6, 3.4, 0.2], s: [1.2, 0.5, 1] }),
    part(THREE, new THREE.IcosahedronGeometry(0.8, 0), '#8aa860', { p: [1.7, 3.5, 0.1], s: [1.1, 0.5, 1] }),
  ], 0.014);
  cleft.position.set(Math.cos(mouthA) * (R + 2.2), 0, Math.sin(mouthA) * (R + 2.2));
  cleft.rotation.y = -mouthA + Math.PI / 2;
  root.add(cleft);
  const glowMat = new THREE.SpriteMaterial({ map: s.bag.own(glowTexture(THREE, 64, 0.2)), color: '#fff3d6', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const gl = new THREE.Sprite(glowMat);
  gl.scale.set(2.2, 3.4, 1);
  gl.position.set(Math.cos(mouthA) * (R + 2.3), 1.6, Math.sin(mouthA) * (R + 2.3));
  root.add(gl);

  // the stream: from the mouth, winding across the valley (a ribbon of water)
  const sv: number[] = [], scol: number[] = [];
  const water = new THREE.Color('#8cc3bf'), shine = new THREE.Color('#d8efe8');
  const streamAt = (u: number) => ({ x: Math.sin(u * 5.2) * 3.2 + (u - 0.5) * 3, z: R - 1 - u * (2 * R - 2) });
  const N = 40;
  for (let i = 0; i < N; i++) {
    const p0 = streamAt(i / N), p1 = streamAt((i + 1) / N);
    const w = 0.7;
    const dx = p1.x - p0.x, dz = p1.z - p0.z, L2 = Math.hypot(dx, dz) || 1;
    const nx = -dz / L2 * w, nz = dx / L2 * w;
    const q = [[p0.x + nx, p0.z + nz], [p0.x - nx, p0.z - nz], [p1.x - nx, p1.z - nz], [p1.x + nx, p1.z + nz]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      sv.push(q[idx][0], 0.03, q[idx][1]);
      tmp.copy(water).lerp(shine, (idx === 0 || idx === 3) ? 0.35 : 0);
      scol.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3));
  sg.computeVertexNormals();
  const stream = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  stream.renderOrder = 1;
  root.add(stream);

  // peach trees along both banks (夹岸数百步，中无杂树), cottages, fields, bamboo — all one mesh
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const u = (i + 0.5) / 24;
    const p = streamAt(u);
    const side = i % 2 ? 1 : -1;
    const off = 2.2 + rng() * 1.8;
    const tx = p.x + side * off, tz = p.z + (rng() - 0.5) * 1.2;
    if (Math.hypot(tx, tz) > R - 1.2) continue;
    // keep the way in open: nothing right at the mouth, where you arrive and look in
    if (Math.abs(tx) < 4.2 && tz > R - 13) continue; // (a clear lane from the mouth, for you and the camera behind you)
    parts.push(...peachTreeParts(THREE, rng, tx, 0, tz, 0.95 + rng() * 0.3));
    offs.push(ctx.addCollider({ x: G.x + tx, z: G.z + tz, r: 0.28, h: 2 }));
  }
  const houses = [{ x: -8, z: -3, r: 0.4 }, { x: 7.5, z: -5.5, r: -0.5 }, { x: -3.5, z: -9.5, r: 0.1 }];
  for (const h of houses) {
    parts.push(...cottageParts(THREE, h.x, 0, h.z, h.r));
    offs.push(ctx.addCollider({ x: G.x + h.x, z: G.z + h.z, r: 1.8, h: 3 }));
  }
  // fields: rows of young rice (良田) and a pond (美池)
  for (const fz of [2, 5.2]) {
    for (let r = 0; r < 7; r++) parts.push(part(THREE, new THREE.BoxGeometry(3.4, 0.08, 0.16), r % 2 ? '#9cc25a' : '#b8d26e', { p: [6.5, 0.05, fz + r * 0.38] }));
  }
  parts.push(part(THREE, new THREE.CircleGeometry(1.8, 16), '#7fb8b4', { p: [-7.5, 0.04, 4.5], r: [-Math.PI / 2, 0, 0] }));
  // bamboo and mulberry (桑竹之属)
  for (let i = 0; i < 9; i++) {
    const bx = -11 + (i % 3) * 0.5 + rng() * 0.3, bz = 1 + Math.floor(i / 3) * 0.6;
    parts.push(part(THREE, new THREE.CylinderGeometry(0.05, 0.06, 3.2, 5), '#7a9a4a', { p: [bx, 1.6, bz] }));
    parts.push(part(THREE, new THREE.IcosahedronGeometry(0.5, 0), '#6f9a5a', { p: [bx, 3.1, bz], s: [0.8, 1.4, 0.8] }));
  }
  const scenery = mesh(ctx, parts, 0.014);
  root.add(scenery);
  const basket = fruitBasket(ctx, rng);
  basket.position.set(-6.2, 0, -1.2);
  root.add(basket);

  // chickens pecking (鸡犬相闻) and a yellow dog
  const hens: T.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const hen = mesh(ctx, [
      part(THREE, new THREE.SphereGeometry(0.13, 8, 6), i % 2 ? '#f4efe4' : '#b8733a', { p: [0, 0.18, 0], s: [0.9, 0.85, 1.2] }),
      part(THREE, new THREE.SphereGeometry(0.07, 8, 6), i % 2 ? '#f4efe4' : '#b8733a', { p: [0, 0.3, 0.12] }),
      part(THREE, new THREE.SphereGeometry(0.03, 5, 4), '#c0412f', { p: [0, 0.37, 0.13] }),
      part(THREE, new THREE.ConeGeometry(0.02, 0.05, 4), COL.gold, { p: [0, 0.29, 0.2], r: [Math.PI / 2, 0, 0] }),
      part(THREE, poly3(THREE), i % 2 ? '#e8e0d0' : '#8a4a24', { p: [0, 0.22, -0.14] }),
    ], 0.006);
    hen.position.set(-4 + i * 1.1, 0, -5 + (i % 2) * 0.8);
    root.add(hen);
    hens.push(hen);
  }
  const dog = mesh(ctx, [
    part(THREE, new THREE.SphereGeometry(0.2, 8, 6), '#d9a24a', { p: [0, 0.32, 0], s: [0.8, 0.8, 1.5] }),
    part(THREE, new THREE.SphereGeometry(0.13, 8, 6), '#d9a24a', { p: [0, 0.45, 0.3] }),
    part(THREE, new THREE.ConeGeometry(0.05, 0.1, 4), '#b8803a', { p: [0.07, 0.58, 0.28] }),
    part(THREE, new THREE.ConeGeometry(0.05, 0.1, 4), '#b8803a', { p: [-0.07, 0.58, 0.28] }),
    ...[[0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18]].map(([x, z]) => part(THREE, new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5), '#c99a4a', { p: [x, 0.11, z] })),
    part(THREE, new THREE.CylinderGeometry(0.02, 0.03, 0.22, 4), '#d9a24a', { p: [0, 0.42, -0.3], r: [-0.8, 0, 0] }),
  ], 0.008);
  dog.position.set(5.5, 0, -2);
  dog.rotation.y = -2.4;
  root.add(dog);

  // falling petals over the whole valley (one Points)
  const NP = 150;
  const pp = new Float32Array(NP * 3);
  const seedV = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { seedV[i * 3] = (rng() - 0.5) * 2 * R; seedV[i * 3 + 1] = rng() * 7; seedV[i * 3 + 2] = (rng() - 0.5) * 2 * R; }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petals = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.14, map: s.bag.own(glowTexture(THREE, 32, 0.4)), color: '#f4a3b6', transparent: true, depthWrite: false }));
  petals.frustumCulled = false;
  root.add(petals);

  // people: the elder by the houses, a woman with a basket, a child running round the pond, a farmer
  const P = (x: number, z: number) => new THREE.Vector3(G.x + x, Y, G.z + z);
  const elder = s.person(WEAR.elder, P(-5, -1.5), { x: G.x, z: G.z + 6 }, root.parent ?? ctx.scene);
  const woman = s.person(WEAR.villagerW, P(-6.8, -0.6), { x: G.x, z: G.z + 4 }, root.parent ?? ctx.scene);
  inHand(woman, fruitBasket(ctx, rng), 0, -0.2, 0.1);
  const child = s.person({ ...WEAR.boy, robe: '#f2a9b8' }, P(-5.5, 6.5), { x: G.x, z: G.z }, root.parent ?? ctx.scene, false);
  const farmer = s.person(WEAR.villagerM, P(6.5, 3.5), { x: G.x + 6.5, z: G.z }, root.parent ?? ctx.scene);
  farmer.armR.userData.posed = true;
  // the child runs round the pond, and stops when you come to talk
  let childA = 0;
  s.frame((dt, t) => {
    for (let i = 0; i < hens.length; i++) hens[i].rotation.x = Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.5;
    dog.rotation.z = Math.sin(t * 8) * 0.03;
    if (!s.still) farmer.armR.rotation.x = -1 + Math.sin(t * 2.2) * 0.6;
    const pl = ctx.player.position;
    const near = Math.hypot(pl.x - child.root.position.x, pl.z - child.root.position.z) < 3.2;
    if (!near && !s.still) {
      childA += dt * 0.55;
      const cx = G.x - 7.5 + Math.cos(childA) * 2.6, cz = G.z + 4.5 + Math.sin(childA) * 2.6;
      child.root.position.set(cx, Y, cz);
      child.root.rotation.y = childA + Math.PI;
      child.walking = 1;
    } else child.walking = 0;
    for (let i = 0; i < NP; i++) {
      const j = i * 3;
      const y = 7 - ((seedV[j + 1] + t * 0.45) % 7);
      pp[j] = seedV[j] + Math.sin(t * 0.6 + i) * 0.6;
      pp[j + 1] = y + 0.05;
      pp[j + 2] = seedV[j + 2] + Math.cos(t * 0.5 + i * 1.3) * 0.6;
    }
    pgeo.attributes.position.needsUpdate = true;
  });

  return {
    floorY: Y,
    mouth,
    mouthPos: new THREE.Vector3(G.x + Math.cos(mouthA) * (R - 1), Y, G.z + Math.sin(mouthA) * (R - 1)),
    mouthHeading,
    elder, woman, child,
    dispose() {
      for (const o of offs.splice(0)) o();
      for (const f of [elder, woman, child, farmer]) s.bag.drop(f.root);
      s.bag.drop(root);
    },
  };
}

/** A hen's tail: a little fan. */
function poly3(THREE: Stage['THREE']): T.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.08, 0.14, -0.06, -0.08, 0.14, -0.06, 0, 0, 0, -0.08, 0.14, -0.06, 0.08, 0.14, -0.06], 3));
  g.computeVertexNormals();
  return g;
}
