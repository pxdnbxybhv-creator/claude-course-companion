// Hidden delights, every day: a cat asleep under one of your plants, a little shrine where a bow
// draws a fortune slip (签), and a guqin phrase that plays itself as you cross the water.
import type * as T from 'three';
import type { WorldCtx } from '../types';
import { feature, findSpot, glowTexture, landmarks, pondDist, reducedMotion, dayRng } from './kit';
import { merge, part } from './geo';
import * as sfx from './sfx';

const TAU = Math.PI * 2;
const PLANT_ZH: Record<string, string> = { plum: '梅', orchid: '兰', bamboo: '竹', chrysanthemum: '菊', pine: '松', lotus: '荷' };
const PLANT_EN: Record<string, string> = { plum: 'plum', orchid: 'orchid', bamboo: 'bamboo', chrysanthemum: 'chrysanthemum', pine: 'pine', lotus: 'lotus' };

// ───────────────────────────── 大橘, the cat ─────────────────────────────

function catMesh(ctx: WorldCtx): { body: T.Mesh; head: T.Mesh; group: T.Group } {
  const { THREE, palette: P } = ctx;
  const fur = '#d08a45', sock = '#f4efe4', pink = '#d9a3a0';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(merge(THREE, [
    part(THREE, new THREE.IcosahedronGeometry(0.2, 1), fur, { p: [0, 0.12, 0], s: [1.0, 0.6, 1.25] }),
    part(THREE, new THREE.TorusGeometry(0.2, 0.035, 4, 10, Math.PI * 1.2), fur, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0.6] }),
    part(THREE, new THREE.IcosahedronGeometry(0.04, 0), sock, { p: [0.12, 0.03, 0.2] }),
    part(THREE, new THREE.IcosahedronGeometry(0.04, 0), sock, { p: [0.03, 0.03, 0.24] }),
    part(THREE, new THREE.IcosahedronGeometry(0.04, 0), sock, { p: [-0.16, 0.03, -0.14] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.02, 0.3), '#a8662c', { p: [0.06, 0.24, -0.02], r: [0, 0.3, 0] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.02, 0.28), '#a8662c', { p: [-0.07, 0.235, 0.0], r: [0, -0.3, 0] }),
  ]), mat);
  const head = new THREE.Mesh(merge(THREE, [
    part(THREE, new THREE.IcosahedronGeometry(0.1, 1), fur, { s: [1.1, 0.9, 1] }),
    part(THREE, new THREE.ConeGeometry(0.035, 0.07, 3), fur, { p: [0.055, 0.09, 0], r: [0, 0, -0.3] }),
    part(THREE, new THREE.ConeGeometry(0.035, 0.07, 3), fur, { p: [-0.055, 0.09, 0], r: [0, 0, 0.3] }),
    part(THREE, new THREE.IcosahedronGeometry(0.045, 0), sock, { p: [0, -0.03, 0.07], s: [1.2, 0.7, 0.8] }),
    part(THREE, new THREE.IcosahedronGeometry(0.012, 0), pink, { p: [0, -0.005, 0.105] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.004, 0.004), P.ink, { p: [0.04, 0.02, 0.09] }),
    part(THREE, new THREE.BoxGeometry(0.03, 0.004, 0.004), P.ink, { p: [-0.04, 0.02, 0.09] }),
  ]), mat);
  head.position.set(0.02, 0.12, 0.24);
  const group = new THREE.Group();
  group.add(body, head);
  return { body, head, group };
}

export const cat = feature('cat', (bag, ctx) => {
  const { THREE } = ctx;
  const rng = dayRng(ctx, '606');
  const plants = landmarks(ctx).filter((l) => l.kind === 'plant' && l.plant !== 'lotus');
  const host = plants.length ? plants[Math.floor(rng() * plants.length)] : null;
  let at: T.Vector3;
  if (host) {
    const a = rng() * TAU;
    const d = host.radius * 0.6 + 0.3;
    at = new THREE.Vector3(host.position.x + Math.cos(a) * d, 0, host.position.z + Math.sin(a) * d);
    if (!ctx.isWalkable(at.x, at.z)) at = findSpot(ctx, rng, { near: { x: host.position.x, z: host.position.z, r: 1.5, min: 0.5 }, clear: 0.4, noClaim: true });
    at.y = ctx.groundY(at.x, at.z);
  } else at = findSpot(ctx, rng, { clear: 0.8, minR: ctx.bounds.radius * 0.4 });
  const { group, body, head } = catMesh(ctx);
  group.position.copy(at);
  group.rotation.y = rng() * TAU;
  group.scale.setScalar(1.35); // a big ginger cat (十只橘猫九只胖)
  bag.add(group);
  // Zzz
  const zTex = glowTexture(THREE, 32, 0.3);
  const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, color: '#cfc8b8', transparent: true, opacity: 0, depthWrite: false }));
  z.scale.set(0.08, 0.08, 1);
  bag.add(z);
  const still = reducedMotion();
  let awake = 0, stretched = false, petted = 0;
  const kindZh = PLANT_ZH[host?.plant ?? ''] ?? '', kindEn = PLANT_EN[host?.plant ?? ''] ?? 'plant';
  const whereZh = host ? (host.habitName ? `你的《${host.habitName}》这株${kindZh}下` : `这株${kindZh}下`) : '这里';
  const whereEn = host ? (host.habitName ? `under your ${kindEn}, “${host.habitName}”` : `under this ${kindEn}`) : 'here';
  bag.interact({
    id: 'cat', position: at, radius: 1.3,
    labelZh: '大橘', labelEn: 'Big Ginger', actionZh: '摸摸', actionEn: 'Pet',
    act() {
      awake = 6;
      sfx.purr(2.6, 0.7);
      petted++;
      if (petted === 1) {
        ctx.hud.showCard({
          titleZh: '大橘', titleEn: 'Big Ginger',
          bodyZh: `一只橘猫，四只白爪，大家叫它大橘。（十只橘猫九只胖。）\n它总在${whereZh}睡觉——大概因为你每天都来。\n\n咕噜，咕噜……`,
          bodyEn: `A ginger cat with four white paws. Everyone calls it Big Ginger (“nine ginger cats in ten are fat”).\nIt always sleeps ${whereEn} — probably because you come every day.\n\nPrrr, prrr…`,
        });
      } else ctx.hud.toast(petted % 3 === 0 ? '它翻了个身，露出肚皮' : '咕噜咕噜……', petted % 3 === 0 ? 'It rolls over, belly up' : 'Prrr… prrr…', 1800);
    },
  });
  const base = { hy: head.position.y, hz: head.position.z };
  bag.frame((dt, t) => {
    const d = Math.hypot(ctx.player.position.x - at.x, ctx.player.position.z - at.z);
    if (d < 2.2 && awake <= 0) {
      awake = 5;
      if (!stretched) { stretched = true; sfx.purr(1.6, 0.5); ctx.hud.toast('喵～', 'Mrrow~', 1400); }
    }
    awake = Math.max(0, awake - dt);
    const a = Math.min(1, awake);
    const breath = still ? 0 : Math.sin(t * (awake > 0 ? 3 : 1.6)) * 0.03;
    body.scale.set(1 + breath * 0.5, 1 + breath, 1 + a * (0.18 + (still ? 0 : Math.sin(t * 1.2) * 0.04)));
    head.position.y = base.hy + a * 0.1;
    head.position.z = base.hz + a * 0.05;
    head.rotation.x = -a * 0.35;
    head.rotation.z = still ? 0 : Math.sin(t * 0.5) * 0.05 * (1 - a);
    // a drowsy Zzz bubble rising when asleep
    const zk = (t * 0.35) % 1;
    z.position.set(at.x + 0.1 + zk * 0.15, at.y + 0.35 + zk * 0.45, at.z);
    (z.material as T.SpriteMaterial).opacity = awake > 0 ? 0 : Math.sin(zk * Math.PI) * 0.7;
    z.scale.setScalar(0.05 + zk * 0.07);
  });
});

// ───────────────────────────── the shrine and its fortune slips ─────────────────────────────

interface Lot { no: number; rankZh: string; rankEn: string; verseZh: string; verseEn: string; noteZh: string; noteEn: string }

const LOTS: Lot[] = [
  { no: 8, rankZh: '上上签', rankEn: 'Supreme fortune', verseZh: '一日一滴水，久久石自穿。\n今朝莫言小，明岁见青山。', verseEn: 'A drop a day, and in time the stone gives way.\nDo not call today small: next year, green hills.', noteZh: '今天的小事，照做就好。', noteEn: 'Just do today’s small thing.' },
  { no: 12, rankZh: '上上签', rankEn: 'Supreme fortune', verseZh: '种竹先种根，根深叶自繁。\n莫问何时长，春来笋满园。', verseEn: 'Plant bamboo, and first it plants its roots.\nDon’t ask when it will grow: come spring, shoots everywhere.', noteZh: '看不见的时候，它也在长。', noteEn: 'It grows even when you cannot see it.' },
  { no: 21, rankZh: '上签', rankEn: 'Good fortune', verseZh: '行到水穷处，坐看云起时。\n——王维', verseEn: 'Walk to where the water ends; sit and watch the clouds rise.\n— Wang Wei', noteZh: '断了一天不要紧。坐一坐，再起身。', noteEn: 'A missed day is nothing. Sit a while, then rise again.' },
  { no: 27, rankZh: '上签', rankEn: 'Good fortune', verseZh: '莫道桑榆晚，为霞尚满天。\n——刘禹锡', verseEn: 'Do not say the day is late: its glow still fills the sky.\n— Liu Yuxi', noteZh: '什么时候开始，都不晚。', noteEn: 'It is never too late to begin.' },
  { no: 33, rankZh: '中签', rankEn: 'Middling fortune', verseZh: '急雨难终日，细流可到海。\n不贪一时满，但求日日来。', verseEn: 'A downpour cannot last the day; a trickle reaches the sea.\nDon’t crave it all at once — just come each day.', noteZh: '别贪多，细水长流。', noteEn: 'Not too much at once. A steady trickle.' },
  { no: 41, rankZh: '上上签', rankEn: 'Supreme fortune', verseZh: '千里之行，始于足下。\n——《老子》', verseEn: 'A journey of a thousand li begins beneath your feet.\n— Laozi', noteZh: '先迈出第一步。', noteEn: 'Take the first step.' },
  { no: 56, rankZh: '中平签', rankEn: 'Even fortune', verseZh: '月有阴晴圆缺，此事古难全。\n——苏轼', verseEn: 'The moon waxes and wanes; nothing has ever been whole for long.\n— Su Shi', noteZh: '有缺的日子，也是日子。', noteEn: 'Days with gaps in them are still days.' },
  { no: 64, rankZh: '上签', rankEn: 'Good fortune', verseZh: '问渠那得清如许？\n为有源头活水来。\n——朱熹', verseEn: 'How does the pond stay so clear?\nFresh water flows in from the source.\n— Zhu Xi', noteZh: '池水清不清，看你今天来没来。', noteEn: 'The pond is as clear as you are faithful.' },
];

export const shrine = feature('shrine', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '707');
  const at = findSpot(ctx, rng, { minR: ctx.bounds.radius * 0.45, clear: 1.3, pondMargin: 2.5 });
  const face = Math.atan2(-at.x, -at.z); // look toward the garden's heart
  const stone = '#8b877c', roof = '#34322e';
  const g = merge(THREE, [
    part(THREE, new THREE.BoxGeometry(0.9, 0.3, 0.7), stone, { p: [0, 0.15, 0] }),
    part(THREE, new THREE.BoxGeometry(0.7, 0.62, 0.52), '#a29d90', { p: [0, 0.61, -0.04] }),
    part(THREE, new THREE.BoxGeometry(0.3, 0.4, 0.02), P.cinnabar, { p: [0, 0.56, 0.225] }),
    part(THREE, new THREE.ConeGeometry(0.72, 0.36, 4), roof, { p: [0, 1.1, -0.04], r: [0, Math.PI / 4, 0], s: [1.25, 1, 1] }),
    part(THREE, new THREE.BoxGeometry(1.05, 0.05, 0.1), roof, { p: [0, 0.93, 0.34] }),
    part(THREE, new THREE.CylinderGeometry(0.1, 0.08, 0.1, 8), '#6f6a60', { p: [0, 0.35, 0.5] }),
    part(THREE, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3), P.ochre, { p: [-0.025, 0.5, 0.5] }),
    part(THREE, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3), P.ochre, { p: [0, 0.5, 0.5] }),
    part(THREE, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3), P.ochre, { p: [0.025, 0.5, 0.5] }),
  ]);
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.position.copy(at);
  mesh.rotation.y = face;
  bag.add(mesh);
  // incense glow and a thread of smoke
  const tip = new THREE.Vector3(0, 0.61, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(at);
  const smokeN = 6;
  const smokeMat = new THREE.SpriteMaterial({ map: glowTexture(THREE, 64, 0.2), color: '#d8d2c4', transparent: true, opacity: 0.25, depthWrite: false });
  const smoke: T.Sprite[] = [];
  for (let i = 0; i < smokeN; i++) { const s = new THREE.Sprite(smokeMat); bag.add(s); smoke.push(s); }
  const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 32, 0.3), color: '#ff8a4a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ember.scale.set(0.08, 0.08, 1);
  ember.position.copy(tip);
  bag.add(ember);
  const still = reducedMotion();
  bag.frame((_dt, t) => {
    for (let i = 0; i < smokeN; i++) {
      const k = ((still ? 0.5 : t * 0.12) + i / smokeN) % 1;
      smoke[i].position.set(tip.x + Math.sin(k * 6 + t * 0.3) * 0.06 * k, tip.y + k * 0.9, tip.z + Math.cos(k * 5) * 0.04 * k);
      smoke[i].scale.setScalar(0.05 + k * 0.25);
    }
    smokeMat.opacity = 0.18;
    ember.material.opacity = 0.7 + Math.sin(t * 3) * 0.2;
  });
  // Today's slip is today's: bowing again shows the same one.
  const d = ctx.env.date;
  const lot = LOTS[(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % LOTS.length];
  let drawn = false;
  const front = new THREE.Vector3(0, 0, 1.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(at);
  bag.interact({
    id: 'shrine', position: front, radius: 1.5,
    labelZh: '土地祠', labelEn: 'Little shrine', actionZh: '拜', actionEn: 'Bow',
    act() {
      ctx.player.emote('bow');
      ctx.audio.knock();
      bag.later(900, () => sfx.rustle(0.8));
      bag.later(1500, () => {
        ctx.audio.pluck(0, 0.5);
        ctx.hud.showCard({
          titleZh: `第${lot.no}签 · ${lot.rankZh}`, titleEn: `Slip ${lot.no} · ${lot.rankEn}`,
          bodyZh: `${lot.verseZh}\n\n解曰：${lot.noteZh}${drawn ? '\n\n（心诚则灵，一日一签。）' : ''}`,
          bodyEn: `${lot.verseEn}\n\nReading: ${lot.noteEn}${drawn ? '\n\n(One slip a day — sincerity makes it so.)' : ''}`,
          seal: '签',
        });
        drawn = true;
      });
    },
  });
});

// ───────────────────────────── a guqin phrase on the bridge ─────────────────────────────

/** Degrees on the pentatonic scale: a little phrase in the spirit of 《仙翁操》. */
const PHRASE = [0, 2, 4, 5, 4, 2, 1, 2, 0, -1, 0, 2, 4, 7, 5, 4, 2, 0];

export const bridgeMusic = feature('bridge-music', (bag, ctx) => {
  let on = false, told = false, step = 0, travelled = 0;
  const last = new ctx.THREE.Vector3();
  bag.frame(() => {
    const p = ctx.player.position;
    // Walkable ground inside the pond's ellipse is a bridge or stepping stones.
    const over = pondDist(ctx, p.x, p.z) < 0.97;
    if (over && !on) {
      on = true;
      travelled = 0.8;
      last.copy(p);
      if (!told) { told = true; ctx.hud.toast('一步一音', 'Each step, a note', 2000); }
    } else if (!over && on) {
      on = false;
    }
    if (!on) return;
    travelled += Math.hypot(p.x - last.x, p.z - last.z);
    last.copy(p);
    if (travelled >= 0.85) {
      travelled = 0;
      const deg = PHRASE[step % PHRASE.length];
      ctx.audio.pluck(deg, step % 4 === 0 ? 0.65 : 0.45);
      step++;
    }
  });
});

export const HIDDEN = [cat, shrine, bridgeMusic];
