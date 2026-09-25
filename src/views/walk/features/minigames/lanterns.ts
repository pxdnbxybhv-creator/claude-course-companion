// 放河灯 — river lanterns from the stone steps in the water town. Choose a lotus lantern, write a
// wish if you like (it never leaves this device — it is not even saved), set it on the water, and
// watch it float downstream along the river, glowing (lovely at night). Now and then other people's
// lanterns drift by from upstream.
import type * as T from 'three';
import { ANCHORS } from '../../map';
import { feature, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { record } from '../../../../app/play';
import { lanternDrift, lowerRiver } from './logic';
import { begin, end, h, night, panel, tr, type Panel } from './ui';
import { glowSprite, ripples } from './fx';
import * as snd from './sound';

interface Style { id: string; zh: string; en: string; petal: string; tip: string; base: string }
const STYLES: Style[] = [
  { id: 'lotus', zh: '莲花灯', en: 'Pink lotus', petal: '#f2c9c4', tip: '#b83a4b', base: '#5f8a6e' },
  { id: 'plain', zh: '素笺灯', en: 'White paper', petal: '#f4efe4', tip: '#d8cfbd', base: '#8b877c' },
  { id: 'gold', zh: '金盏灯', en: 'Gold cup', petal: '#f0d58c', tip: '#d9a62e', base: '#a8703a' },
];

const VERSES: { zh: string; en: string }[] = [
  { zh: '但愿人长久，千里共婵娟。\n—— 苏轼《水调歌头》', en: 'May we all live long, and share the same moon a thousand li apart.\n— Su Shi' },
  { zh: '请君试问东流水，别意与之谁短长。\n—— 李白《金陵酒肆留别》', en: 'Ask the river flowing east: which is longer, it or my parting thoughts?\n— Li Bai' },
  { zh: '春江潮水连海平，海上明月共潮生。\n—— 张若虚《春江花月夜》', en: 'The spring river’s tide is level with the sea; over the sea the bright moon rises with it.\n— Zhang Ruoxu' },
];

export const riverLanterns = feature('mg-lanterns', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('village');
  const path = lowerRiver();
  const steps = ctx.anchor(ANCHORS.lanternSteps);
  const s0 = path.project(steps).s;
  const still = reducedMotion();
  const rip = ripples(bag, group, 6);

  // a lotus lantern: two rings of petals round a candle, on a leaf
  const makeGeo = (st: Style) => {
    const ps: T.BufferGeometry[] = [part(THREE, new THREE.CylinderGeometry(0.2, 0.16, 0.05, 14), st.base, { p: [0, 0.02, 0] })];
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        const r = ring ? 0.07 : 0.12;
        const tilt = ring ? 0.35 : 0.75;
        ps.push(part(THREE, new THREE.SphereGeometry(0.075, 8, 6), ring ? st.petal : st.tip, {
          p: [Math.cos(a) * r, 0.1 + ring * 0.03, Math.sin(a) * r],
          r: [0, -a, tilt],
          s: [0.45, 1.25, 0.2],
        }));
      }
    }
    ps.push(part(THREE, new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), '#f4efe4', { p: [0, 0.1, 0] }));
    return merge(THREE, ps);
  };
  const geos = STYLES.map((st) => bag.own(makeGeo(st)));

  interface Floating { g: T.Group; glow: T.Sprite; s: number; lane: number; mine: boolean; born: number; fade: number; speed: number }
  const floating: Floating[] = [];
  const MAX = 8;

  function spawn(style: number, s: number, lane: number, mine: boolean, t: number): Floating | null {
    if (floating.length >= MAX) {
      const old = floating.findIndex((f) => !f.mine);
      if (old < 0) return null;
      bag.drop(floating[old].g);
      floating.splice(old, 1);
    }
    const g = new THREE.Group();
    const body = inked(ctx, geos[style], { width: 0.006 });
    g.add(body);
    const glow = glowSprite(bag, '#ffc98a', 0.9, 0.7);
    glow.position.y = 0.16;
    g.add(glow);
    const flame = glowSprite(bag, '#ffe2a8', 0.12, 1);
    flame.position.y = 0.17;
    g.add(flame);
    bag.add(g, group);
    const f: Floating = { g, glow, s, lane, mine, born: t, fade: 0, speed: 0.45 + Math.random() * 0.2 };
    floating.push(f);
    return f;
  }

  // ── the sheet: pick a lantern, write a wish
  let ui: { p: Panel } | null = null;
  let clock = 0;
  let released = 0;

  function open() {
    if (!begin(ctx, 'lanterns')) return;
    ctx.player.freeze(true);
    const p = panel(bag, 'mg-lanterns');
    const sheet = h('div', 'mg-sheet', undefined, p.root);
    h('h3', '', tr(ctx, '放河灯', 'Float a lantern'), sheet);
    const choices = h('div', 'mg-choices', undefined, sheet);
    let pick = 0;
    const btns = STYLES.map((st, i) => {
      const b = h('button', 'mg-choice', undefined, choices);
      b.type = 'button';
      const c = h('canvas', '', undefined, b);
      c.width = 112; c.height = 88;
      paintLantern(c, st);
      h('span', '', tr(ctx, st.zh, st.en), b);
      b.addEventListener('click', () => { pick = i; btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); snd.click(0.3); });
      return b;
    });
    btns[0].setAttribute('aria-pressed', 'true');
    const wish = h('input', 'mg-wish', undefined, sheet);
    wish.type = 'text';
    wish.maxLength = 24;
    wish.placeholder = tr(ctx, '写一句心愿（可不写）', 'Write a wish (optional)');
    wish.setAttribute('aria-label', tr(ctx, '心愿', 'Wish'));
    wish.autocomplete = 'off';
    // keep typing away from the world's keys
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) wish.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && (e as KeyboardEvent).key === 'Enter') go.click(); });
    h('p', 'mg-note', tr(ctx, '心愿只留在这台设备上，不会上传，也不会保存。', 'Your wish stays on this device — it is not uploaded, not even saved.'), sheet);
    const row = h('div', 'mg-row', undefined, sheet);
    const cancel = h('button', 'mg-text-btn', tr(ctx, '算了', 'Not now'), row);
    const go = h('button', 'mg-text-btn is-primary', tr(ctx, '放灯', 'Float it'), row);
    cancel.type = go.type = 'button';
    cancel.addEventListener('click', close);
    go.addEventListener('click', () => { const w = wish.value.trim().slice(0, 24); close(); float(pick, w); });
    ui = { p };
  }

  function close() {
    if (!ui) return;
    ui.p.close();
    ui = null;
    ctx.player.freeze(false);
    end(ctx, 'lanterns');
  }
  bag.onDispose(close);

  function float(style: number, wish: string) {
    ctx.player.emote('bow');
    const f = spawn(style, s0, -0.25, true, clock);
    if (!f) return;
    f.fade = 0;
    const at = path.at(s0);
    rip.spawn(at.x, steps.y, at.z, 0.9, 0.5);
    snd.splash(0.12);
    ctx.audio.pluck(4, 0.4);
    bag.later(600, () => ctx.audio.pluck(2, 0.35));
    record('lantern');
    released++;
    const v = VERSES[(released - 1) % VERSES.length];
    bag.later(1800, () => ctx.hud.showCard({
      titleZh: '河灯寄愿', titleEn: 'A lantern downstream',
      bodyZh: `${wish ? `「${wish}」\n\n` : ''}灯顺水去，愿随灯行。\n\n${v.zh}`,
      bodyEn: `${wish ? `“${wish}”\n\n` : ''}The lantern goes with the water; the wish goes with the lantern.\n\n${v.en}`,
      seal: '愿',
    }));
  }

  bag.interact({
    id: 'mg-lanterns', position: steps, radius: 2.6,
    labelZh: '河边石阶', labelEn: 'River steps', actionZh: '放河灯', actionEn: 'Float a lantern',
    act() { open(); },
  });

  // other people's lanterns, now and then (more often at night)
  let nextOther = 6;
  bag.frame((dt, t) => {
    clock = t;
    const p = ctx.player.position;
    if (ui && Math.hypot(p.x - steps.x, p.z - steps.z) > 10) close();
    const near = path.project(p).d < 70;
    const isNight = night(ctx);
    nextOther -= dt;
    if (nextOther <= 0) {
      nextOther = (isNight ? 18 : 40) + Math.random() * 20;
      if (near) {
        const ps = path.project(p).s;
        const f = spawn(Math.floor(Math.random() * STYLES.length), Math.max(0, ps - 35 - Math.random() * 15), (Math.random() - 0.5) * 0.9, false, t);
        if (f) f.speed = 0.55 + Math.random() * 0.25;
      }
    }
    for (let i = floating.length - 1; i >= 0; i--) {
      const f = floating[i];
      f.s += f.speed * dt * (still ? 0.7 : 1);
      const d = lanternDrift(path, f.s, f.lane, t + i * 7);
      const wy = ctx.waterAt(d.x, d.z) ?? f.g.position.y;
      const age = t - f.born;
      // a mine settles from the hands onto the water
      const drop = f.mine ? Math.max(0, 1 - age / 0.7) * 0.8 : 0;
      f.g.position.set(d.x, wy + 0.01 + drop + (still ? 0 : Math.sin(t * 1.4 + i) * 0.01), d.z);
      f.g.rotation.y = d.heading;
      if (!still) { f.g.rotation.z = Math.sin(t * 1.1 + i * 2) * 0.05; f.g.rotation.x = Math.sin(t * 0.9 + i) * 0.04; }
      const end = path.length - f.s;
      const k = Math.min(1, age / 1.5, end / 8);
      const mat = f.glow.material as T.SpriteMaterial;
      mat.opacity = k * (isNight ? 0.85 : 0.3) * (still ? 1 : 0.9 + Math.sin(t * 7 + i) * 0.1);
      f.glow.scale.setScalar(isNight ? 1.1 : 0.6);
      f.g.scale.setScalar(Math.max(0.01, k));
      if (end <= 0.5) { bag.drop(f.g); floating.splice(i, 1); }
    }
  });
});

/** A small painted lantern for the chooser. */
function paintLantern(c: HTMLCanvasElement, st: Style): void {
  const g = c.getContext('2d');
  if (!g) return;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  // water line
  g.strokeStyle = 'rgba(61,90,115,0.35)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(8, H * 0.78); g.quadraticCurveTo(W / 2, H * 0.72, W - 8, H * 0.8); g.stroke();
  // glow
  const gr = g.createRadialGradient(W / 2, H * 0.5, 2, W / 2, H * 0.5, 40);
  gr.addColorStop(0, 'rgba(255,214,150,0.9)');
  gr.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // petals
  const petal = (x: number, y: number, rot: number, w: number, hh: number, col: string) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-w, -hh * 0.5, 0, -hh); g.quadraticCurveTo(w, -hh * 0.5, 0, 0);
    g.fillStyle = col; g.fill();
    g.strokeStyle = 'rgba(27,25,22,0.55)'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  };
  g.fillStyle = st.base;
  g.beginPath(); g.ellipse(W / 2, H * 0.72, 34, 7, 0, 0, Math.PI * 2); g.fill();
  for (const [rot, col] of [[-1.1, st.tip], [1.1, st.tip], [-0.6, st.petal], [0.6, st.petal], [0, st.petal]] as [number, string][]) {
    petal(W / 2, H * 0.72, rot, 11, 34, col);
  }
  g.fillStyle = '#ffe2a8';
  g.beginPath(); g.ellipse(W / 2, H * 0.4, 3, 6, 0, 0, Math.PI * 2); g.fill();
}
