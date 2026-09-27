// 桃源 · 二期: 采桑喂蚕 · Feeding the silkworms (spec §5.3). 三娘 at the silk-room door, 晨 and 昼;
// refused while 醺 (her worms hate wine). A DOM canvas (no draws; the room dims): four trays (蚁蚕 二眠
// 三眠 大蚕), a branch of five leaf slots along the bottom, a drying rack, the basket and your berry jar.
// Tender leaves to the small, old to the big, wet ones dried first, spotted ones thrown out. From 45 s
// the trays sleep (眠) in turn; drops in a hurry wake the noise meter; at 70 s the big worms climb the
// straw, and every tray that never went hungry in the last 20 s spins a cocoon.
//
// Owner: G.
import { h } from '../../../minigames/ui';
import * as snd from '../../../minigames/sound';
import { makeRng, hashString } from '../../../../../../core/rng';
import { LEAVES_NAMES, leavesOfDay, sleeperOfDay } from '../daily';
import type { Line } from '../types';
import type { GameDef, Round } from './frame';
import { CAN as R, cocoons, coinsFor, feed, leafAt, makeTrays, noise, stepTrays, trayState, type Leaf } from './logic';
import { CAN } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });
const TRAY_NAMES = CAN.trays;

export const canGame: GameDef = {
  id: 'can',
  host: () => 'sang',
  // (2.5 m east of 三娘's 晨/昼 spot (−21.5, 8.9), on the side you come from the square: her own
  //  「搭话」 (radius 2.2) never wins at the stand; clear of the kitchen shed's posts, beside the camera)
  stand: { x: -19.0, z: 9.4 },
  face: { x: -22.6, z: 7.6 },
  hostAt: { x: -21.4, z: 9.1 },
  hostFace: { x: -19.0, z: 9.4 },
  rules: () => CAN.sang.rules.map((line) => ({ who: 'sang' as const, line })),
  twist: (day) => {
    const l = LEAVES_NAMES[leavesOfDay(day)], s = TRAY_NAMES[sleeperOfDay(day)];
    return t(`${l.zh}；${s.zh}先眠`, `${l.en}; the ${s.en.toLowerCase()} tray sleeps first`);
  },
  refuse: (life) => (life.mood() === '醺' ? { who: 'sang', line: CAN.sang.drunk } : null),
  good: () => null,
  play(r: Round) {

    const mix = leavesOfDay(r.day);
    const first = sleeperOfDay(r.day);
    const rng = makeRng(hashString(`${r.day}:tyl:can:${performance.now() | 0}`));

    // the view: the doorway; the room dims behind the canvas
    r.view(r.at(-19.6, 9.2, 1.8), r.at(-22.6, 7.6, 1.1));
    h('div', 'tyg-dim', undefined, r.root);
    const box = h('div', 'tyg-can-box', undefined, r.root);
    const top = h('div', 'tyg-top mg-live', undefined, r.root);
    h('b', 'brush', r.tr(t('喂蚕', 'Feeding the worms')), top);
    const scoreEl = h('span', 'tyg-num', '0', top);
    const clock = h('small', 'tyg-clock', '', top);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? CAN.hint : CAN.hintKeys), r.root);
    r.later(7000, () => hint.classList.add('is-fade'));
    const cv = h('canvas', 'tyg-can-cv', undefined, box);
    const g = cv.getContext('2d');
    if (!g) { r.quit(); return; }
    const dpr = Math.min(2, devicePixelRatio || 1);
    let Wp = 0, Hp = 0;
    const size = () => {
      const w = Math.min(innerWidth * 0.94, 560), hh = Math.min(innerHeight * 0.72, w * 0.95);
      Wp = w; Hp = hh;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${hh}px`;
    };
    size();
    addEventListener('resize', size);
    r.onStop(() => removeEventListener('resize', size));

    // ── places (in unit coordinates of the canvas)
    type Box = { x: number; y: number; w: number; h: number };
    const trayBox: Box[] = [0, 1, 2, 3].map((i) => ({ x: 0.03 + (i % 2) * 0.345, y: 0.03 + Math.floor(i / 2) * 0.345, w: 0.33, h: 0.33 }));
    const rackBox: Box[] = [0, 1, 2].map((i) => ({ x: 0.74, y: 0.03 + i * 0.12, w: 0.23, h: 0.11 }));
    const basketBox: Box = { x: 0.74, y: 0.41, w: 0.23, h: 0.13 };
    const jarBox: Box = { x: 0.74, y: 0.57, w: 0.23, h: 0.13 };
    const slotBox: Box[] = [0, 1, 2, 3, 4].map((i) => ({ x: 0.03 + i * 0.19, y: 0.77, w: 0.17, h: 0.2 }));
    const inBox = (b: Box, ux: number, uy: number) => ux >= b.x && ux <= b.x + b.w && uy >= b.y && uy <= b.y + b.h;

    // ── the state
    const trays = makeTrays();
    const slots: ({ leaf: Leaf } | null)[] = [0, 1, 2, 3, 4].map(() => ({ leaf: leafAt(0, mix, rng) }));
    const regrow: number[] = [0, 0, 0, 0, 0];
    const rack: ({ at: number } | null)[] = [null, null, null];
    let score = 0, berries = 0, tt = 0;
    const drops: number[] = [];
    let level = 0, lastBurst = -1, hushTo = 0;
    const words: { tray: number; text: string; until: number; bad: boolean }[] = [];
    let held: { from: 'slot' | 'rack'; i: number; x: number; y: number; drag: boolean } | null = null;
    let sel = 0; // the keyboard's selection: 0–4 the branch, 5–7 the rack
    let over = false;
    const dryFor = r.gentle ? R.dryGentle : R.dry;

    const leafOf = (from: 'slot' | 'rack', i: number): Leaf | null => {
      if (from === 'slot') return slots[i]?.leaf ?? null;
      const k = rack[i];
      return k ? (tt - k.at >= dryFor ? ((k as { dry?: Leaf }).dry ?? 'nen') : 'shi') : null;
    };
    const takeFrom = (from: 'slot' | 'rack', i: number) => {
      if (from === 'slot') { slots[i] = null; regrow[i] = tt + R.regrow; } else rack[i] = null;
    };
    const drop = () => {
      drops.push(tt);
      while (drops.length > 12) drops.shift();
      try { snd.at('pluck', snd.now(), { note: 1 + Math.floor(rng() * 3), level: 0.2 }); } catch { /* optional */ }
    };
    const word = (tray: number, l: Line, bad = false) => words.push({ tray, text: r.tr(l), until: tt + 0.7, bad });
    /** Put the held leaf somewhere: a tray (0–3), the rack, the basket, the jar. */
    const put = (from: 'slot' | 'rack', i: number, to: { tray?: number; rack?: boolean; basket?: boolean; jar?: boolean }) => {
      const leaf = leafOf(from, i);
      if (!leaf || over) return;
      if (to.jar) {
        if (leaf !== 'shen') return;
        takeFrom(from, i); drop(); berries++; score += R.berry;
        r.pop(`${r.tr(CAN.jar)} +${R.berry}`, 'is-small');
        return;
      }
      if (to.basket) { takeFrom(from, i); drop(); if (leaf === 'huang') r.pop(r.tr(CAN.spotted), 'is-small'); return; }
      if (to.rack) {
        if (from === 'rack' || leaf !== 'shi') return;
        const k = rack.findIndex((x) => !x);
        if (k < 0) return;
        takeFrom(from, i); drop();
        const dry: Leaf = rng() < 0.5 ? 'nen' : 'lao';
        rack[k] = Object.assign({ at: tt }, { dry });
        return;
      }
      if (to.tray !== undefined) {
        const ti = to.tray;
        if (!trays[ti].on) return;
        takeFrom(from, i); drop();
        if (tt < hushTo) { word(ti, t('……', '…'), true); return; }
        const out = feed(trays, ti, leaf, tt, { first });
        score += out.score;
        if (out.word === 'right') word(ti, CAN.right);
        else if (out.word === 'ok') word(ti, CAN.ok);
        else if (out.word === 'full') word(ti, CAN.full, true);
        else if (out.word === 'wet') { word(ti, CAN.sang.wet, true); r.say('sang', CAN.sang.wet, 1400); }
        else if (out.word === 'asleep') { word(ti, t('眠', 'Asleep'), true); r.say('sang', CAN.sang.asleep, 1600); }
        else if (out.word === 'spotted') word(ti, CAN.spotted, true);
        else word(ti, CAN.wrong, true);
        if (out.score) r.pop(`${out.score > 0 ? '+' : ''}${out.score}`, out.score < 0 ? 'is-small' : '');
      }
    };

    // ── input: drag a leaf to a place, or tap the leaf then tap the place
    const unit = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
    const targetAt = (ux: number, uy: number): { tray?: number; rack?: boolean; basket?: boolean; jar?: boolean } | null => {
      for (let i = 0; i < 4; i++) if (inBox(trayBox[i], ux, uy)) return { tray: i };
      if (rackBox.some((b) => inBox(b, ux, uy))) return { rack: true };
      if (inBox(basketBox, ux, uy)) return { basket: true };
      if (inBox(jarBox, ux, uy)) return { jar: true };
      return null;
    };
    const sourceAt = (ux: number, uy: number): { from: 'slot' | 'rack'; i: number } | null => {
      for (let i = 0; i < 5; i++) if (inBox(slotBox[i], ux, uy) && slots[i]) return { from: 'slot', i };
      for (let i = 0; i < 3; i++) if (inBox(rackBox[i], ux, uy) && rack[i]) return { from: 'rack', i };
      return null;
    };
    const pd = (e: PointerEvent) => {
      e.preventDefault();
      const u = unit(e);
      const src = sourceAt(u.x, u.y);
      if (held && !held.drag) {
        // a tap on a place while a leaf is picked up: put it there
        const tg = targetAt(u.x, u.y);
        if (tg && !(src && tg.rack && src.from === 'rack')) { put(held.from, held.i, tg); held = null; return; }
      }
      if (src) { held = { ...src, x: u.x, y: u.y, drag: false }; cv.setPointerCapture?.(e.pointerId); }
      else held = null;
    };
    const pm = (e: PointerEvent) => {
      if (!held) return;
      const u = unit(e);
      if (Math.hypot(u.x - held.x, u.y - held.y) > 0.03) held.drag = true;
      held.x = u.x; held.y = u.y;
    };
    const pu = (e: PointerEvent) => {
      if (!held || !held.drag) return;
      const u = unit(e);
      const tg = targetAt(u.x, u.y);
      if (tg) put(held.from, held.i, tg);
      held = null;
    };
    cv.addEventListener('pointerdown', pd);
    cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerup', pu);
    const kd = (e: KeyboardEvent) => {
      if (document.querySelector('.walk-say-wrap')) return;
      const from: 'slot' | 'rack' = sel < 5 ? 'slot' : 'rack';
      const i = sel < 5 ? sel : sel - 5;
      let used = true;
      if (/^Digit[1-4]$/.test(e.code)) put(from, i, { tray: Number(e.code.slice(5)) - 1 });
      else if (e.code === 'KeyR') put(from, i, { rack: true });
      else if (e.code === 'KeyX') put(from, i, { basket: true });
      else if (e.code === 'KeyB') { const k = slots.findIndex((s) => s?.leaf === 'shen'); if (k >= 0) put('slot', k, { jar: true }); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') sel = (sel + 7) % 8;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') sel = (sel + 1) % 8;
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', kd, true);
    r.onStop(() => {
      cv.removeEventListener('pointerdown', pd);
      cv.removeEventListener('pointermove', pm);
      cv.removeEventListener('pointerup', pu);
      window.removeEventListener('keydown', kd, true);
    });

    // ── the loop (rules every frame; the painter at ≤30 fps)
    let paintAcc = 1;
    r.frame((dt, tn) => {
      tt = tn;
      if (tt >= 20) { trays[2].on = true; trays[3].on = true; }
      const lost = stepTrays(trays, dt, tt, { gentle: r.gentle, first });
      if (lost) { score -= lost; r.pop(`-${lost}`, 'is-small'); }
      const nz = noise(level, drops, tt, dt, lastBurst);
      level = nz.level; lastBurst = nz.burst;
      if (nz.hush) {
        hushTo = tt + R.noisePause;
        for (const tr of trays) tr.pausedTo = Math.max(tr.pausedTo, hushTo);
        r.say('sang', CAN.sang.noise, 1600);
      }
      for (let i = 0; i < 5; i++) if (!slots[i] && tt >= regrow[i]) slots[i] = { leaf: leafAt(tt, mix, rng) };
      scoreEl.textContent = String(score);
      clock.textContent = String(Math.max(0, Math.ceil(R.round - tt)));
      paintAcc += dt;
      if (paintAcc >= 1 / 30) { paintAcc = 0; paint(); }
      if (tt >= R.round && !over) {
        over = true;
        const spun = cocoons(trays, tt);
        score += spun * R.cocoon;
        const final = Math.max(0, score);
        r.finish({
          score: final,
          measure: final,
          feat: spun === 4,
          yue: spun,
          coins: coinsFor('can', final),
          lines: [t(`${CAN.cocoon.zh} ${spun} / 4 · 桑葚 ${berries}`, `${CAN.cocoon.en} ${spun} / 4 · berries ${berries}`)],
          say: { who: 'sang', line: final >= 35 ? CAN.sang.win : CAN.sang.lose },
        });
      }
    });

    // ── the painter
    const LEAF_COL: Record<Leaf, string> = { nen: '#9cc36a', lao: '#4f7a3a', shi: '#7fb3a8', huang: '#b4a24a', shen: '#3a2340' };
    const drawLeaf = (x: number, y: number, s: number, leaf: Leaf, dim = false) => {
      g.save();
      g.translate(x, y);
      g.globalAlpha = dim ? 0.45 : 1;
      if (leaf === 'shen') {
        g.fillStyle = LEAF_COL.shen;
        for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(Math.cos(k) * s * 0.18, Math.sin(k * 1.7) * s * 0.25, s * 0.14, 0, Math.PI * 2); g.fill(); }
      } else {
        g.fillStyle = LEAF_COL[leaf];
        g.beginPath();
        g.moveTo(0, -s * 0.5);
        g.bezierCurveTo(s * 0.45, -s * 0.3, s * 0.4, s * 0.3, 0, s * 0.5);
        g.bezierCurveTo(-s * 0.4, s * 0.3, -s * 0.45, -s * 0.3, 0, -s * 0.5);
        g.fill();
        g.strokeStyle = 'rgba(40,50,30,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(0, s * 0.45); g.stroke();
        if (leaf === 'shi') { g.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc((k - 1.5) * s * 0.12, (k % 2 ? -1 : 1) * s * 0.12, s * 0.04, 0, Math.PI * 2); g.fill(); } }
        if (leaf === 'huang') { g.fillStyle = 'rgba(120,80,20,0.8)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(Math.cos(k * 2.3) * s * 0.18, Math.sin(k * 1.9) * s * 0.25, s * 0.05, 0, Math.PI * 2); g.fill(); } }
      }
      g.restore();
    };
    const paint = () => {
      const w = cv.width, hh = cv.height;
      const X = (u: number) => u * w, Yp = (v: number) => v * hh;
      g.clearRect(0, 0, w, hh);
      g.font = `${Math.round(13 * dpr)}px "LXGW WenKai", "KaiTi", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // the trays
      for (let i = 0; i < 4; i++) {
        const b = trayBox[i], tr = trays[i];
        const st = trayState(i, first, tt);
        const cx = X(b.x + b.w / 2), cy = Yp(b.y + b.h / 2), rr = Math.min(X(b.w), Yp(b.h)) * 0.46;
        g.globalAlpha = tr.on ? 1 : 0.35;
        g.fillStyle = st === 'asleep' ? '#cfc6b0' : '#e7d9b6';
        g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a6d45'; g.lineWidth = 2 * dpr; g.stroke();
        // worms: more and bigger by size; heads up before sleep; still while asleep; climbing at 上簇
        const n = 4 + i, len = rr * (0.18 + i * 0.05);
        g.strokeStyle = '#f6f1e4'; g.lineCap = 'round'; g.lineWidth = (2 + i) * dpr;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + i;
          const wx = cx + Math.cos(a) * rr * 0.5, wy = cy + Math.sin(a) * rr * 0.45;
          const wob = st === 'awake' && !(tt < tr.pausedTo) ? Math.sin(tt * 4 + k) * 0.35 : 0;
          const head = st === 'warn' || (tr.hunger >= 1 && st === 'awake') ? -Math.PI / 2 + Math.sin(tt * 3 + k) * 0.3 : a + wob;
          g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(head) * len, wy + Math.sin(head) * len); g.stroke();
        }
        if (tt >= R.spinFrom && tr.on) {
          g.strokeStyle = '#c9a85a'; g.lineWidth = 1.5 * dpr;
          for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(cx - rr * 0.6 + k * rr * 0.24, cy + rr * 0.6); g.lineTo(cx - rr * 0.5 + k * rr * 0.2, cy - rr * 0.6); g.stroke(); }
          if (tr.fullAt < tt - R.spinWindow) { g.fillStyle = '#fbf8ef'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(cx - rr * 0.3 + k * rr * 0.3, cy - rr * 0.1, rr * 0.08, rr * 0.12, 0, 0, Math.PI * 2); g.fill(); } }
        }
        // the name and the hunger
        g.globalAlpha = tr.on ? 1 : 0.4;
        g.fillStyle = '#3a2f22';
        g.fillText(r.tr(TRAY_NAMES[i]) + (st === 'asleep' ? r.tr(t(' · 眠', ' · asleep')) : ''), cx, Yp(b.y) + 9 * dpr);
        const bw = X(b.w) * 0.7, bx = cx - bw / 2, by = Yp(b.y + b.h) - 8 * dpr;
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(bx, by, bw, 4 * dpr);
        g.fillStyle = tr.hunger >= 0.8 ? '#b5412f' : tr.hunger >= 0.4 ? '#c9953a' : '#6f8f55';
        g.fillRect(bx, by, bw * tr.hunger, 4 * dpr);
        if (tt < tr.pausedTo) { g.fillStyle = 'rgba(80,80,80,0.25)'; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
      }
      // words over the trays
      for (let k = words.length - 1; k >= 0; k--) {
        const wd = words[k];
        if (wd.until < tt) { words.splice(k, 1); continue; }
        const b = trayBox[wd.tray];
        g.fillStyle = wd.bad ? '#6a5a4a' : '#b5412f';
        g.font = `bold ${Math.round(16 * dpr)}px "LXGW WenKai", "KaiTi", serif`;
        g.fillText(wd.text, X(b.x + b.w / 2), Yp(b.y + b.h / 2) - (0.7 - (wd.until - tt)) * 30 * dpr);
      }
      g.font = `${Math.round(12 * dpr)}px "LXGW WenKai", "KaiTi", serif`;
      // the rack, the basket, the jar
      for (let i = 0; i < 3; i++) {
        const b = rackBox[i];
        g.fillStyle = '#d9c7a0'; g.fillRect(X(b.x), Yp(b.y), X(b.w), Yp(b.h));
        g.strokeStyle = '#8a6d45'; g.lineWidth = 1; g.strokeRect(X(b.x), Yp(b.y), X(b.w), Yp(b.h));
        const k = rack[i];
        if (k) { const leaf = leafOf('rack', i)!; drawLeaf(X(b.x + b.w / 2), Yp(b.y + b.h / 2), Yp(b.h) * 0.8, leaf, held?.from === 'rack' && held.i === i); }
        if (sel === 5 + i) { g.strokeStyle = '#b5412f'; g.lineWidth = 2 * dpr; g.strokeRect(X(b.x), Yp(b.y), X(b.w), Yp(b.h)); }
      }
      g.fillStyle = '#3a2f22';
      g.fillText(r.tr(CAN.rack), X(0.855), Yp(0.39));
      g.fillStyle = '#c8b387'; g.fillRect(X(basketBox.x), Yp(basketBox.y), X(basketBox.w), Yp(basketBox.h));
      g.fillStyle = '#3a2f22'; g.fillText(r.tr(CAN.basket), X(basketBox.x + basketBox.w / 2), Yp(basketBox.y + basketBox.h / 2));
      g.fillStyle = '#6a5a70'; g.fillRect(X(jarBox.x), Yp(jarBox.y), X(jarBox.w), Yp(jarBox.h));
      g.fillStyle = '#f4efe4'; g.fillText(`${r.tr(CAN.jar)} ${berries}`, X(jarBox.x + jarBox.w / 2), Yp(jarBox.y + jarBox.h / 2));
      // the noise meter
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(X(0.74), Yp(0.72), X(0.23), 5 * dpr);
      g.fillStyle = level > 0.6 ? '#b5412f' : '#8a7a6a'; g.fillRect(X(0.74), Yp(0.72), X(0.23) * Math.min(1, level), 5 * dpr);
      // the branch
      g.strokeStyle = '#6d5238'; g.lineWidth = 4 * dpr;
      g.beginPath(); g.moveTo(X(0.01), Yp(0.8)); g.quadraticCurveTo(X(0.5), Yp(0.76), X(0.99), Yp(0.82)); g.stroke();
      for (let i = 0; i < 5; i++) {
        const b = slotBox[i], s = slots[i];
        if (s) drawLeaf(X(b.x + b.w / 2), Yp(b.y + b.h / 2), Yp(b.h) * 0.85, s.leaf, held?.from === 'slot' && held.i === i);
        if (sel === i) { g.strokeStyle = '#b5412f'; g.lineWidth = 2 * dpr; g.strokeRect(X(b.x), Yp(b.y), X(b.w), Yp(b.h)); }
      }
      // the leaf in hand
      if (held) { const leaf = leafOf(held.from, held.i); if (leaf) drawLeaf(X(held.x), Yp(held.y), Yp(0.16), leaf); }
    };
    paint();
    void Wp; void Hp;
  },
};
