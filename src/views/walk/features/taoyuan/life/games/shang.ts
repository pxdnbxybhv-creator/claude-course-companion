// 桃源 · 二期: 流觞 · Steering the cup (spec §5.6). 暮 at the 流觞渠: 秦守拙 draws the lots, 杜二 fills,
// five villagers sit at five bays (the day's seating, borrowed), your own seat is the sixth, near the
// end. Tap beside a cup to poke it away from that side; hold just ahead of it to brake (2 s a cup). A
// bay's eddy takes a slow, well-placed cup; two bumps on the bank spill it. A wrong bay is a forfeit, a
// cup that runs to the end goes to 杜二, and one stopped at your own seat is a 飞花令 line — or a drink.
// The fifth is 双觞: two cups at once. Then 桂娘 sets down 鸡黍. Own draws: the cups (one InstancedMesh)
// and their candles (one glow Cloud): 2.
//
// Owner: G. The last game built (spec §11: the first cut).
import { h } from '../../../minigames/ui';
import * as snd from '../../../minigames/sound';
import { feihuaTurns } from '../../../minigames/logic';
import { hashString, makeRng } from '../../../../../../core/rng';
import { Cloud } from '../../fx';
import { engine } from '../../engine';
import { CHANNEL, W, Y_T, floorAt, polyAt, polyLen } from '../../places';
import { play } from '../../../../../../app/play';
import { serveDish } from '../table';
import { FREE, eatKey } from '../keys';
import { CUP_GUESTS, FLOW_NAMES, FLOW_SPEED, flowOfDay, lingOfDay, seatsOfDay } from '../daily';
import { festivalNow } from '../board';
import type { Line, VillagerKey } from '../types';
import type { GameDef, Round } from './frame';
import { SHANG as R, brake, coinsFor, cupScore, makeCup, poke, shangSealFeat, stepCup, type Bay, type Cup } from './logic';
import { NAMES, SHANG } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });
const LEN = polyLen(CHANNEL);
/** The five bays and your own (the sixth), as fractions of the channel. */
const BAY_AT = [...R.bays, 0.93];
/** Left of the flow at s (unit, valley-local). */
const leftAt = (s: number) => { const p = polyAt(CHANNEL, s); return { x: p.dz, z: -p.dx }; };
/** The channel's turn at s (+: to the left). */
function bendAt(s: number): number {
  const a = polyAt(CHANNEL, Math.max(0, s - 0.6)), b = polyAt(CHANNEL, Math.min(LEN, s + 0.6));
  return a.dx * b.dz - a.dz * b.dx;
}
const BAYS: Bay[] = BAY_AT.map((f, i) => ({ s: f * LEN, u: i % 2 === 0 ? 0.18 : -0.18 }));
/** A point of the channel (s, u) in valley-local x, z. */
const chanAt = (s: number, u: number) => { const p = polyAt(CHANNEL, Math.max(0, Math.min(LEN, s))); const l = leftAt(s); return { x: p.x + l.x * u, z: p.z + l.z * u }; };

const FORFEIT: Partial<Record<VillagerKey, Line>> = {
  lusan: SHANG.lusan.forfeit, duer: SHANG.duer.forfeit, guiniang: SHANG.guiniang.forfeit, shigu: SHANG.shigu.forfeit,
  gegu: SHANG.gegu.forfeit, xiaoman: SHANG.xiaoman.forfeit, liupo: SHANG.liupo.forfeit,
};

export const shangGame: GameDef = {
  id: 'shang',
  host: () => 'qin',
  stand: { x: 5.2, z: 4.6 },
  face: { x: 6.9, z: 1 },
  hostAt: { x: 9.6, z: -3.9 },
  hostFace: { x: 7.5, z: 0 },
  rules: () => SHANG.qin.rules.map((line) => ({ who: 'qin' as const, line })),
  twist: (day) => {
    const f = FLOW_NAMES[flowOfDay(day)], ling = lingOfDay(day);
    return t(`${f.zh} · 令「${ling}」`, `${f.en} · today's character: ${ling}`);
  },
  good: () => ({ who: 'qin', line: SHANG.qin.good }),
  play(r: Round) {
    const { ctx, tv, life } = r;
    const TH = ctx.THREE;
    const fx = tv.fx;
    if (!fx) { r.quit(); return; }
    const rng = makeRng(hashString(`${r.day}:tyl:shang:${performance.now() | 0}`));
    const base = FLOW_SPEED[flowOfDay(r.day)] * (r.gentle ? 0.7 : 1);
    const ling = lingOfDay(r.day);
    const seats = seatsOfDay(r.day);
    const eng = engine(ctx);

    // ── the view: high three-quarter from the west, pitched 55°, FOV 45 (restore() gives the lens back)
    const mid = chanAt(LEN * 0.5, 0);
    const my = floorAt(mid.x, mid.z);
    const dist = 9;
    const mw = W(mid.x, mid.z);
    try { eng.lens(45); } catch { /* optional */ }
    r.view({ x: mw.x - dist * Math.cos((55 * Math.PI) / 180), y: Y_T + my + dist * Math.sin((55 * Math.PI) / 180), z: mw.z + 0.4 }, { x: mw.x, y: Y_T + my, z: mw.z + 0.4 }, 1.4);
    // the guests at their bays (borrowed; restore() gives them back)
    seats.forEach((k, i) => {
      const b = BAYS[i], l = leftAt(b.s), p = chanAt(b.s, 0);
      const side = b.u > 0 ? 1 : -1;
      const at = W(p.x + l.x * 0.95 * side, p.z + l.z * 0.95 * side);
      const face = W(p.x, p.z);
      life.borrow(k, { x: at.x, z: at.z, face });
    });
    // a festival day brings everyone (spec §5.6): the two guests without a bay stand back and watch
    if (festivalNow(ctx)) {
      CUP_GUESTS.filter((k) => !seats.includes(k)).forEach((k, j) => {
        const sAt = (j === 0 ? 0.425 : 0.6) * LEN, l = leftAt(sAt), p = chanAt(sAt, 0);
        const side = j === 0 ? 1 : -1;
        const at = W(p.x + l.x * 1.7 * side, p.z + l.z * 1.7 * side);
        life.borrow(k, { x: at.x, z: at.z, face: W(p.x, p.z) });
      });
    }

    // ── the cups (one InstancedMesh) and their candles (one glow Cloud)
    const cupGeo = new TH.CylinderGeometry(0.11, 0.06, 0.07, 12, 1, true);
    const cupMat = new TH.MeshLambertMaterial({ color: '#8a3a2a', side: TH.DoubleSide });
    const cupsMesh = new TH.InstancedMesh(cupGeo, cupMat, 2);
    cupsMesh.frustumCulled = false;
    cupsMesh.userData.pocket = true;
    fx.group.add(cupsMesh);
    const flames = new Cloud(fx, 4 + 6, 'glow');
    const warm = new TH.Color('#ffc46a'), halo = new TH.Color('#ff9a4a'), mark = new TH.Color('#fff1c6');
    r.onStop(() => { cupsMesh.removeFromParent(); cupGeo.dispose(); cupMat.dispose(); flames.dispose(); });

    // ── the HUD
    const pad = h('div', 'tyg-pad', undefined, r.root);
    const top = h('div', 'tyg-top mg-live', undefined, r.root);
    h('b', 'brush', r.tr(t('流觞', 'The cups')), top);
    const scoreEl = h('span', 'tyg-num', '0', top);
    const cupEl = h('small', '', '', top);
    const brakeBox = h('div', 'tyg-tension', undefined, r.root);
    h('span', '', r.tr(SHANG.brake), brakeBox);
    const bb = h('div', 'tyg-tension-bar', undefined, brakeBox);
    const bf = h('i', '', undefined, bb);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? SHANG.hint : SHANG.hintKeys), r.root);
    r.later(7000, () => hint.classList.add('is-fade'));

    // ── the round: five 觞 (the fifth two cups)
    type Lot = { want: number[] };
    const near = [0, 1].sort(() => rng() - 0.5), far = [3, 4].sort(() => rng() - 0.5);
    const two = [2, near[0] === 0 ? 1 : 0].sort((a, b) => a - b);
    const lots: Lot[] = [{ want: [near[0]] }, { want: [near[1]] }, { want: [far[0]] }, { want: [5] }, { want: two }];
    let li = -1;
    let cups: { c: Cup; want: number }[] = [];
    let score = 0, right = 0, events = 0;
    let wait = 1.2;
    let busy = false; // a line, a 飞花令 is up
    let over = false;
    const who = (bay: number): Line => (bay === 5 ? SHANG.qin.you : NAMES[seats[bay]] ?? t(seats[bay], seats[bay]));
    const nextLot = () => {
      li++;
      if (li >= lots.length) { end(); return; }
      const lot = lots[li];
      const names = lot.want.map((b) => who(b));
      const line = lot.want.length > 1 ? SHANG.qin.lotTwo : SHANG.qin.lot;
      r.say('qin', t(line.zh.replace('{who}', names.map((n) => n.zh).join('、')), line.en.replace('{who}', names.map((n) => n.en).join(' and '))), 2400);
      try { ctx.audio.knock?.(); } catch { /* optional */ }
      cups = lot.want.map((w, k) => ({ c: makeCup(0.2 - k * 0.9, 0), want: w }));
      cupEl.textContent = `${r.tr(SHANG.cup)} ${li + 1} / 5`;
    };
    const settleCup = async (x: { c: Cup; want: number }) => {
      const c = x.c;
      if (c.spilled) { r.say('duer', SHANG.duer.spill, 1600); return false; }
      if (c.end) { r.say('duer', SHANG.duer.missed, 1600); return false; }
      if (c.bay === null) return false;
      const got = cupScore(c, x.want, BAYS);
      if (c.bay !== x.want) {
        const k = c.bay === 5 ? null : seats[c.bay];
        if (k && FORFEIT[k]) r.say(k, FORFEIT[k]!, 2400);
        else r.pop(r.tr(SHANG.wrong), 'is-small');
        return false;
      }
      score += got;
      r.pop(`${r.tr(SHANG.right)} +${got}`);
      if (c.bay === 5) {
        busy = true;
        const ok = await feihua();
        busy = false;
        if (ok) { score += R.own; r.pop(`+${R.own}`, 'is-red'); }
        else { life.setMood('醺'); r.say(null, SHANG.drink, 2200); }
      }
      return true;
    };
    const feihua = (): Promise<boolean> => new Promise((resolve) => {
      const turn = feihuaTurns(ling, 1, rng)[0];
      if (!turn) { resolve(true); return; }
      const box = h('div', 'tyg-feihua', undefined, r.root);
      h('p', '', `${r.tr(NAMES.qin)}${ctx.lang === 'zh' ? '：' : ': '}${r.quote(r.tr(SHANG.qin.feihua).replace('{ling}', ling))}`, box);
      h('p', 'tyg-poet', turn.poet.text, box);
      const bar = h('i', 'tyg-feihua-bar', undefined, box);
      let done = false;
      const fin = (ok: boolean) => {
        if (done) return;
        done = true;
        box.remove();
        r.say('qin', ok ? SHANG.qin.feihuaRight : SHANG.qin.feihuaWrong, 1600);
        resolve(ok);
      };
      turn.options.forEach((o, i) => {
        const b = h('button', 'tyg-opt', o.text, box);
        b.type = 'button';
        b.addEventListener('click', () => fin(i === turn.answer));
      });
      bar.style.animationDuration = '6s';
      r.later(6000, () => fin(false));
      r.onStop(() => { done = true; box.remove(); resolve(false); });
    });

    // ── input: a tap beside a cup pokes it; a hold just ahead of it brakes
    const ray = new TH.Raycaster(), ndc = new TH.Vector2(), hit = new TH.Vector3();
    const plane = new TH.Plane(new TH.Vector3(0, 1, 0), -(Y_T + my + 0.15));
    const G0 = W(0, 0);
    const onWater = (cx: number, cy: number): { x: number; z: number } | null => {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, ctx.camera);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x - G0.x, z: hit.z - G0.z } : null;
    };
    /** A water point in the channel frame of a cup: along (ds) and across (du). */
    const rel = (c: Cup, p: { x: number; z: number }) => {
      const q = polyAt(CHANNEL, Math.max(0, Math.min(LEN, c.s)));
      const l = leftAt(c.s);
      const cp = chanAt(c.s, c.u);
      const dx = p.x - cp.x, dz = p.z - cp.z;
      return { ds: dx * q.dx + dz * q.dz, du: dx * l.x + dz * l.z };
    };
    const moving = () => cups.filter((x) => x.c.bay === null && !x.c.spilled && !x.c.end && x.c.s >= 0);
    let braking: Cup | null = null, ptr = -1;
    const pd = (e: PointerEvent) => {
      e.preventDefault();
      if (busy) return;
      const p = onWater(e.clientX, e.clientY);
      if (!p) return;
      let best: { c: Cup; d: number; ds: number; du: number } | null = null;
      for (const x of moving()) { const q = rel(x.c, p); const d = Math.hypot(q.ds, q.du); if (!best || d < best.d) best = { c: x.c, d, ds: q.ds, du: q.du }; }
      if (!best || best.d > 1.2) return;
      if (best.ds > 0.05 && best.ds <= R.brakeAhead && Math.abs(best.du) < 0.3) { braking = best.c; ptr = e.pointerId; return; }
      if (best.d > R.pokeR) return;
      const wob = r.mood === '醺' ? (rng() * 2 - 1) * R.pokeWobble : 0;
      poke(best.c, best.d, best.du >= 0 ? 1 : -1, { wobble: wob });
      try { snd.splash(0.15); } catch { /* optional */ }
    };
    const pu = (e: PointerEvent) => { if (e.pointerId === ptr) { braking = null; ptr = -1; } };
    pad.addEventListener('pointerdown', pd);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    let keyBrake = false;
    /** The cup the keys steer: the one nearest ahead of its bay. */
    const keyCup = (): Cup | null => {
      let best: Cup | null = null, bd = Infinity;
      for (const x of moving()) { const d = BAYS[x.want].s - x.c.s; const v = d >= -0.3 ? d : 99; if (v < bd) { bd = v; best = x.c; } }
      return best;
    };
    /** Which way is screen-left in the channel's frame at s (+1: +u). */
    const v3 = new TH.Vector3();
    const screenLeftU = (c: Cup): 1 | -1 => {
      const a = chanAt(c.s, 0.3), b = chanAt(c.s, -0.3);
      const ax = v3.set(G0.x + a.x, Y_T + my, G0.z + a.z).project(ctx.camera).x;
      const bx = v3.set(G0.x + b.x, Y_T + my, G0.z + b.z).project(ctx.camera).x;
      return ax < bx ? 1 : -1;
    };
    const kd = (e: KeyboardEvent) => {
      if (document.querySelector('.walk-say-wrap') || busy) return;
      if (!['KeyA', 'KeyD', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      const c = keyCup();
      if (!c) return;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') { keyBrake = true; return; }
      if (e.repeat) return;
      const toLeft = e.code === 'KeyA' || e.code === 'ArrowLeft';
      const lu = screenLeftU(c);
      // poke from the far side, so it moves the way you pressed
      const side = (toLeft ? -lu : lu) as 1 | -1;
      const wob = r.mood === '醺' ? (rng() * 2 - 1) * R.pokeWobble : 0;
      poke(c, 0, side, { key: true, wobble: wob });
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'KeyS' || e.code === 'ArrowDown') keyBrake = false; };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    r.onStop(() => {
      pad.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    });

    // ── the loop
    const m4 = new TH.Matrix4();
    let settling = false;
    r.frame((dt, tt) => {
      if (over) return;
      if (li < 0 || (!cups.length && !settling)) {
        wait -= dt;
        if (wait <= 0 && !busy) nextLot();
      }
      // the cups
      const kc = keyBrake ? keyCup() : null;
      for (const x of cups) {
        const c = x.c;
        if (c.s < 0) { c.s += base * dt; continue; }
        brake(c, !busy && (c === braking || c === kc), dt);
        if (busy) continue;
        const ev = stepCup(c, dt, { base, bend: bendAt(c.s), len: LEN, bays: BAYS });
        if (ev === 'bump') { try { snd.clink('yi'); } catch { /* optional */ } }
      }
      const live = cups.filter((x) => x.c.s >= 0);
      if (cups.length && !settling && live.length === cups.length && cups.every((x) => x.c.bay !== null || x.c.spilled || x.c.end)) {
        settling = true;
        const these = cups;
        void (async () => {
          let all = true;
          for (const x of these) { const ok = await settleCup(x); if (!ok) all = false; }
          events++;
          if (all) right++;
          cups = [];
          settling = false;
          wait = 1.6;
        })();
      }
      // draw
      for (let i = 0; i < 2; i++) {
        const x = cups[i];
        if (!x || x.c.s < 0 || x.c.spilled || x.c.end) { m4.makeTranslation(0, -999, 0); cupsMesh.setMatrixAt(i, m4); flames.set(i * 2, 0, -50, 0, 0, 0); flames.set(i * 2 + 1, 0, -50, 0, 0, 0); continue; }
        const p = chanAt(x.c.s, x.c.u);
        const y = floorAt(p.x, p.z) + 0.15 + Math.sin(tt * 2 + i) * 0.01;
        m4.makeTranslation(p.x, y, p.z);
        cupsMesh.setMatrixAt(i, m4);
        const fl = 0.8 + 0.2 * Math.sin(tt * 17 + i * 3);
        flames.set(i * 2, p.x, y + 0.1, p.z, 0.09, fl, warm);
        flames.set(i * 2 + 1, p.x, y + 0.1, p.z, 0.5, 0.35 * fl, halo);
      }
      cupsMesh.instanceMatrix.needsUpdate = true;
      // the named bays glow faintly
      for (let j = 0; j < 6; j++) {
        const want = cups.some((x) => x.want === j);
        const p = chanAt(BAYS[j].s, BAYS[j].u);
        flames.set(4 + j, p.x, floorAt(p.x, p.z) + 0.12, p.z, 0.35, want ? 0.5 + 0.2 * Math.sin(tt * 4) : 0.08, mark);
      }
      flames.flush();
      const bc = braking ?? kc ?? keyCup();
      bf.style.width = `${((bc?.brake ?? R.brakeFor) / R.brakeFor) * 100}%`;
      scoreEl.textContent = String(score);
    });

    const end = () => {
      if (over) return;
      over = true;
      const gegu = seats.includes('gegu') && right === 4;
      const tally = gegu ? { who: 'gegu' as VillagerKey, line: SHANG.gegu.tally } : { who: 'qin' as VillagerKey, line: right === 0 ? SHANG.qin.tallyNone : t(SHANG.qin.tally.zh.replace('{n}', '五').replace('{m}', '零一两三四五'[right]), SHANG.qin.tally.en.replace('{n}', 'Five').replace('{m}', String(right))) };
      r.say(tally.who, tally.line, 2600);
      r.later(2200, () => {
        const final = score;
        r.finish({
          score: final,
          measure: final,
          feat: shangSealFeat(right, events),
          yue: right,
          coins: coinsFor('shang', final),
          lines: [t(`五觞停对 ${right} 觞`, `${right} of 5 cups stopped right`)],
          say: { who: 'qin', line: right === 5 ? SHANG.qin.win : SHANG.qin.lose },
          after: () => supper(),
        });
      });
    };

    /**
     * 桂娘 sets down 鸡黍 (spec §5.6): if it was never tasted, or today's free bowl is unused,
     * 「吃一碗」 serves it through the table's own flow and its 特写 (F's serveDish).
     */
    const supper = () => {
      r.bag.later(4400, () => {
        ctx.hud.toast(`桂娘：「${SHANG.guiniang.supper.zh}」`, `Gui Niang: "${SHANG.guiniang.supper.en}"`, 3200);
        const offer = !play.peek().flags[eatKey('jishu')] || r.life.today(FREE) < 1;
        if (!offer || !r.life.open() || r.life.current()) return;
        // (not is-game: the stick and the walk buttons stay, and the walker may simply go on)
        const box = h('div', 'mg tyg tyg-eat');
        const b = h('button', 'tyg-go', r.tr(SHANG.eat), box);
        b.type = 'button';
        const off = ctx.hud.mount(box);
        const tm = setTimeout(off, 9000);
        r.bag.onDispose(() => { clearTimeout(tm); off(); });
        b.addEventListener('click', () => { clearTimeout(tm); off(); void serveDish(ctx, 'jishu'); });
      });
    };
    void rng;
  },
};

