// 投壶 — pitch-pot in the water-town square. A bronze pot with two ears; eight arrows a round.
// Steer the aim (drag the slider, the stick or ← →) against a trembling hand, hold to swing the
// power up and down, let go to throw. In the mouth 10, through an ear (贯耳) 15, leaning on the rim
// (倚竿) 5; the first arrow in (有初), runs (连中) and all eight (全壶) earn more. 棋士 aims steadier.
import type * as T from 'three';
import { ANCHORS } from '../../map';
import { feature, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { record, recordMax, play } from '../../../../app/play';
import { POT, classifyThrow, flightAt, scoreRound, HIT_POINTS, type PotHit } from './logic';
import { ability, begin, button, closeButton, end, frameOn, h, hold, onEscape, panel, pop, tr, type Hold, type Panel } from './ui';
import * as snd from './sound';
import { pitchpotPay } from '../../../games/economy';
import { pay, payLine } from '../../../games/purse';

const ARROWS = 8;

export const pitchPot = feature('mg-pitchpot', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const group = ctx.regionGroup('village');
  const a = ctx.anchor(ANCHORS.pitchPot);
  const pot = new THREE.Vector3(a.x, ctx.groundY(a.x, a.z), a.z);
  const still = reducedMotion();

  // where to throw from: the first open side, POT.dist away
  let u = { x: 1, z: 0 };
  for (const c of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: -1, z: 0 }, { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }]) {
    let ok = true;
    for (let k = 0.8; k <= POT.dist + 0.6 && ok; k += 0.4) if (!ctx.isWalkable(pot.x + c.x * k, pot.z + c.z * k)) ok = false;
    if (ok) { u = c; break; }
  }
  const L = Math.hypot(u.x, u.z);
  u = { x: u.x / L, z: u.z / L };
  const stand = new THREE.Vector3(pot.x + u.x * POT.dist, 0, pot.z + u.z * POT.dist);
  stand.y = ctx.groundY(stand.x, stand.z);
  const heading = Math.atan2(-u.x, -u.z); // facing the pot
  const right = { x: -Math.cos(heading), z: Math.sin(heading) };
  const toWorld = (x: number, y: number, z: number, out: T.Vector3) => out.set(pot.x + right.x * x + u.x * z, pot.y + y, pot.z + right.z * x + u.z * z);

  // ── the bronze pot on a little stone base, with two ears, and a mat to stand on
  const bronze = '#7d6a3e', patina = '#5f8a6e', dark = '#3a3226';
  const lathe = (pts: [number, number][], n = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
  const potGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.34, 0.38, 0.1, 8), '#8b877c', { p: [0, 0.05, 0] }),
    part(THREE, lathe([[0.001, 0.1], [0.16, 0.1], [0.24, 0.2], [0.27, 0.34], [0.22, 0.48], [0.11, 0.56], [0.085, 0.62], [0.095, 0.7], [0.12, 0.72], [0.1, 0.72], [0.08, 0.66], [0.001, 0.64]]), bronze),
    part(THREE, new THREE.TorusGeometry(0.255, 0.018, 5, 22), patina, { p: [0, 0.36, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.2, 0.012, 5, 20), dark, { p: [0, 0.22, 0], r: [Math.PI / 2, 0, 0] }),
    // the ears: two short tubes beside the neck
    part(THREE, new THREE.CylinderGeometry(0.05, 0.045, 0.14, 10, 1, true), bronze, { p: [POT.earOff, 0.62, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.05, 0.045, 0.14, 10, 1, true), bronze, { p: [-POT.earOff, 0.62, 0] }),
    part(THREE, new THREE.BoxGeometry(0.1, 0.03, 0.03), bronze, { p: [POT.earOff / 2 + 0.04, 0.6, 0] }),
    part(THREE, new THREE.BoxGeometry(0.1, 0.03, 0.03), bronze, { p: [-POT.earOff / 2 - 0.04, 0.6, 0] }),
    // the dark inside of the mouth
    part(THREE, new THREE.CircleGeometry(0.085, 14), '#14110d', { p: [0, 0.69, 0], r: [-Math.PI / 2, 0, 0] }),
  ]);
  const potMesh = inked(ctx, potGeo, { width: 0.01 });
  potMesh.position.copy(pot);
  potMesh.rotation.y = heading; // ears left and right as you face it
  bag.add(potMesh, group);
  bag.onDispose(ctx.addCollider({ x: pot.x, z: pot.z, r: 0.42, h: 0.8 }));
  // a woven mat marking the throwing line
  const mat = inked(ctx, merge(THREE, [
    part(THREE, new THREE.BoxGeometry(0.9, 0.02, 0.5), '#c9b27a', { p: [0, 0.01, 0] }),
    part(THREE, new THREE.BoxGeometry(0.9, 0.024, 0.04), P.cinnabar, { p: [0, 0.012, -0.22] }),
  ]), { width: 0.006 });
  mat.position.copy(stand);
  mat.rotation.y = heading;
  bag.add(mat, group);
  // a quiver of arrows standing beside the mat
  const quiver = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.07, 0.06, 0.45, 10, 1, true), '#6a4a36', { p: [0, 0.22, 0] }),
    ...[-0.03, 0, 0.03].map((x, i) => part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4), '#c8b07a', { p: [x, 0.5, (i - 1) * 0.02], r: [0.05 * (i - 1), 0, 0.08 * (i - 1)] })),
  ]), { width: 0.006 });
  quiver.position.set(stand.x + right.x * 0.7, stand.y, stand.z + right.z * 0.7);
  bag.add(quiver, group);

  // ── arrows (reused every round)
  const arrowGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.006, 0.006, 0.75, 5), '#c8b07a', { p: [0, 0, 0] }),
    part(THREE, new THREE.ConeGeometry(0.014, 0.05, 5), P.ink, { p: [0, 0.4, 0] }),
    part(THREE, new THREE.BoxGeometry(0.002, 0.12, 0.035), P.cinnabar, { p: [0, -0.3, 0] }),
    part(THREE, new THREE.BoxGeometry(0.035, 0.12, 0.002), P.cinnabar, { p: [0, -0.3, 0] }),
  ]);
  const arrowMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const arrows: T.Mesh[] = [];
  for (let i = 0; i < ARROWS; i++) {
    const m = new THREE.Mesh(arrowGeo, arrowMat);
    m.visible = false;
    bag.add(m, group);
    arrows.push(m);
  }
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3(), w3 = new THREE.Vector3();
  const pointAlong = (m: T.Mesh, vx: number, vy: number, vz: number) => {
    // local velocity → world direction
    w3.set(right.x * vx + u.x * vz, vy, right.z * vx + u.z * vz).normalize();
    m.quaternion.setFromUnitVectors(up, w3);
  };

  // ── the game
  let ui: { p: Panel; top: HTMLElement; score: HTMLElement; best: HTMLElement; ticks: HTMLElement[]; status: HTMLElement; aim: HTMLElement; needle: HTMLElement; charge: HTMLElement; fill: HTMLElement; btn: HTMLButtonElement; hold: Hold; offEsc: () => void; offDrag: () => void } | null = null;
  let results: PotHit[] = [];
  let aimBase = 0, aimNow = 0, power = 0, chargeT = 0;
  let phase: 'aim' | 'charge' | 'flying' | 'over' = 'aim';
  let flying: { m: T.Mesh; aim: number; power: number; t: number; hit: PotHit; tHit: number; lx: number; lz: number } | null = null;
  const steady = () => { const ab = ability(ctx); return ab.kind === 'aim' ? ab.factor : 1; };

  const updateTop = () => {
    if (!ui) return;
    const sc = scoreRound(results);
    ui.score.textContent = String(sc.total);
    ui.ticks.forEach((tk, i) => tk.classList.toggle('is-used', i < results.length));
    ui.best.textContent = tr(ctx, `最佳 ${play.value.best.pitchpot ?? 0}`, `Best ${play.value.best.pitchpot ?? 0}`);
  };

  function newRound() {
    results = [];
    for (const m of arrows) m.visible = false;
    phase = 'aim';
    aimBase = 0;
    updateTop();
    if (ui) {
      ui.status.textContent = tr(ctx, '左右调准，按住蓄力，松手投出', 'Steer the aim, hold for power, release to throw');
      (ui.btn.querySelector('.mg-btn-glyph') as HTMLElement).textContent = '投';
    }
  }

  function start() {
    if (!begin(ctx, 'pitchpot')) return;
    ctx.player.freeze(true);
    // stand a little left of the line, so the pot shows past your shoulder (you throw from the right hand)
    ctx.player.teleport(stand.x - right.x * 0.45, stand.z - right.z * 0.45, heading);
    frameOn(ctx, pot.x, pot.z, pot.y + 0.5);
    const p = panel(bag, 'mg-pitchpot');
    const top = h('div', 'mg-pot-top mg-live', undefined, p.root);
    h('span', '', tr(ctx, '投壶', 'Pitch-pot'), top);
    const arrowsBox = h('span', 'mg-arrows', undefined, top);
    const ticks = Array.from({ length: ARROWS }, () => h('i', '', undefined, arrowsBox));
    const score = h('b', '', '0', top);
    const best = h('small', '', '', top);
    const dock = h('div', 'mg-dock', undefined, p.root);
    const status = h('div', 'mg-status', '', dock);
    const aim = h('div', 'mg-aim mg-live', undefined, dock);
    h('span', '', undefined, aim);
    const needle = h('i', '', undefined, aim);
    const charge = h('div', 'mg-charge', undefined, dock);
    const fill = h('i', '', undefined, charge);
    const btn = button(dock, '投', tr(ctx, '', 'Throw'));
    closeButton(p.root, ctx, stop);
    // drag the aim slider
    let dragging = false;
    const setFromX = (clientX: number) => {
      const r = aim.getBoundingClientRect();
      aimBase = Math.max(-0.25, Math.min(0.25, ((clientX - r.left) / r.width - 0.5) * 0.5));
    };
    const pd = (e: PointerEvent) => { dragging = true; setFromX(e.clientX); e.preventDefault(); };
    const pm = (e: PointerEvent) => { if (dragging) setFromX(e.clientX); };
    const pu = () => { dragging = false; };
    aim.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    const offDrag = () => { aim.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); };
    ui = { p, top, score, best, ticks, status, aim, needle, charge, fill, btn, hold: hold(btn), offEsc: onEscape(stop), offDrag };
    newRound();
    if (steady() > 1) ctx.hud.toast('棋士出手，稳如泰山', 'The board-game master’s hand is steady', 2000);
  }

  function stop() {
    if (!ui) return;
    ui.hold.dispose();
    ui.offEsc();
    ui.offDrag();
    ui.p.close();
    ui = null;
    flying = null;
    ctx.player.freeze(false);
    end(ctx, 'pitchpot');
  }
  bag.onDispose(() => { if (ui) stop(); });

  function throwArrow() {
    const m = arrows[results.length];
    // where it crosses the mouth's height decides the result
    let tHit = 0;
    // descending crossing of the mouth height
    for (let t = 0; t < 3; t += 0.002) { const f = flightAt(aimNow, power, t); if (f.vy < 0 && f.y <= POT.mouthY) { tHit = t; break; } }
    const f = flightAt(aimNow, power, tHit);
    const hit = classifyThrow(f.x, f.z);
    flying = { m, aim: aimNow, power, t: 0, hit, tHit, lx: f.x, lz: f.z };
    m.visible = true;
    ctx.player.emote('throw');
    snd.whoosh(power);
    phase = 'flying';
  }

  function settle() {
    if (!flying || !ui) return;
    const { hit, m } = flying;
    results.push(hit);
    snd.clink(hit);
    const pts = HIT_POINTS[hit];
    if (hit !== 'miss') record('pitchpot');
    const first = results.length === 1 && hit !== 'miss';
    let run = 0;
    for (let i = results.length - 1; i >= 0 && results[i] !== 'miss'; i--) run++;
    const label = hit === 'er' ? tr(ctx, '贯耳！', 'Through the ear!') : hit === 'hu' ? (first ? tr(ctx, '有初！', 'First in!') : run >= 2 ? tr(ctx, `连中${run}`, `${run} in a row`) : tr(ctx, '中！', 'In!')) : hit === 'yi' ? tr(ctx, '倚竿', 'On the rim') : tr(ctx, '未中', 'Miss');
    if (!still || hit !== 'miss') pop(ui.p, `${label}${pts ? ` +${pts}` : ''}`, hit === 'er' ? 'is-red' : hit === 'miss' ? 'is-small' : '');
    if (hit === 'er') ctx.audio.pluck(4, 0.6);
    // leave the arrow where it went: standing in the pot, leaning on the rim, or lying on the ground
    if (hit !== 'miss') {
      const f = flightAt(flying.aim, flying.power, flying.tHit);
      const ex = hit === 'er' ? Math.sign(flying.lx) * POT.earOff : hit === 'hu' ? flying.lx * 0.5 : flying.lx;
      const ez = hit === 'hu' ? flying.lz * 0.5 : hit === 'er' ? 0 : flying.lz;
      // the tip goes in along the flight, steepened: the fletching leans back toward the thrower
      const steep = hit === 'yi' ? 0.9 : 0.35;
      pointAlong(m, f.vx * steep, f.vy, f.vz * steep);
      w3.copy(up).applyQuaternion(m.quaternion);
      toWorld(ex, POT.mouthY, ez, v3);
      m.position.copy(v3).addScaledVector(w3, hit === 'yi' ? -0.36 : 0.15 - 0.4);
    }
    flying = null;
    updateTop();
    if (results.length >= ARROWS) {
      phase = 'over';
      const sc = scoreRound(results);
      const prev = play.value.best.pitchpot ?? 0;
      recordMax('pitchpot', sc.total);
      updateTop();
      const feats = sc.feats.map((f) => (ctx.lang === 'zh' ? f.zh : f.en)).join(' · ');
      const isBest = sc.total > prev && sc.total > 0;
      // coins: 3 an arrow in, 20 more for all eight
      const pp = pitchpotPay(sc.hits, ARROWS);
      const out = pay(pp);
      const coinZh = payLine(pp, out, 'zh'), coinEn = payLine(pp, out, 'en');
      if (sc.hits >= 6) ctx.audio.chime(5); else snd.ding(sc.hits >= 3 ? 3 : 1);
      bag.later(700, () => {
        ctx.hud.showCard({
          titleZh: `投壶 · ${sc.total} 分`, titleEn: `Pitch-pot · ${sc.total}`,
          bodyZh: `八矢中${sc.hits}${feats ? `\n${feats}` : ''}${isBest ? '\n—— 新的最好成绩！' : ''}${coinZh ? `\n${coinZh}` : ''}\n\n「投壶者，主人与客燕饮讲艺之礼也。」\n—— 《礼记》`,
          bodyEn: `${sc.hits} of 8 arrows in${feats ? `\n${feats}` : ''}${isBest ? '\n— A new personal best!' : ''}${coinEn ? `\n${coinEn}` : ''}\n\n“Pitch-pot is the rite of host and guest feasting and practising an art.”\n— The Book of Rites`,
          seal: sc.hits === ARROWS ? '全' : '壶',
        });
        if (ui) {
          ui.status.textContent = tr(ctx, '再来一局？', 'Another round?');
          (ui.btn.querySelector('.mg-btn-glyph') as HTMLElement).textContent = '再';
        }
      });
    } else phase = 'aim';
  }

  bag.interact({
    id: 'mg-pitchpot', position: new THREE.Vector3(pot.x + u.x * 1.6, pot.y, pot.z + u.z * 1.6), radius: 2.9,
    labelZh: '铜壶', labelEn: 'Bronze pot', actionZh: '投壶', actionEn: 'Pitch-pot',
    act() { start(); },
  });

  bag.frame((dt, t) => {
    if (!ui) return;
    if (Math.hypot(ctx.player.position.x - stand.x, ctx.player.position.z - stand.z) > 8) { stop(); return; }
    const H = ui.hold;
    // the trembling hand (steadier for the board-game master)
    const A = 0.04 / steady();
    const tremor = still ? A * 0.4 * Math.sin(t * 0.8) : A * (Math.sin(t * 1.9) + 0.55 * Math.sin(t * 3.3 + 1.3));
    aimBase = Math.max(-0.25, Math.min(0.25, aimBase + ctx.input.x * dt * 0.22));
    aimNow = aimBase + tremor;
    ui.needle.style.left = `${50 + (aimNow / 0.25) * 50}%`;
    switch (phase) {
      case 'aim':
        if (H.pressed()) { phase = 'charge'; chargeT = 0; }
        ui.fill.style.width = '0%';
        break;
      case 'charge': {
        chargeT += dt;
        const period = 1.25 * (steady() > 1 ? 1.2 : 1);
        const k = (chargeT / period) % 2;
        power = k <= 1 ? k : 2 - k;
        ui.fill.style.width = `${Math.round(power * 100)}%`;
        if (H.released() || !H.down) throwArrow();
        break;
      }
      case 'flying': {
        H.pressed();
        if (!flying) break;
        flying.t += dt;
        const f = flightAt(flying.aim, flying.power, flying.t);
        toWorld(f.x, f.y, f.z, v3);
        flying.m.position.copy(v3);
        pointAlong(flying.m, f.vx, f.vy, f.vz);
        if (flying.hit !== 'miss' && flying.t >= flying.tHit) settle();
        else if (flying.hit === 'miss' && f.y <= 0.03) {
          flying.m.position.y = pot.y + 0.03;
          pointAlong(flying.m, f.vx, 0, f.vz);
          settle();
        }
        break;
      }
      case 'over':
        if (H.pressed()) newRound();
        break;
    }
  });
});
