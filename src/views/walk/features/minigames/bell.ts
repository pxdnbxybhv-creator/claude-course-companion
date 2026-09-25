// 敲钟 — the temple bell. A log (撞木) hangs on two ropes beside the great bronze bell: hold to haul
// it back, let go, and it swings into the bronze. A deep hum that beats and breathes, echoing off the
// far hills; the bell sways, a ring of sound spreads over the ground, birds start from the trees.
// The first time, 张继's night bell; every strike after counts toward the hundred and eight.
import type * as T from 'three';
import { ANCHORS } from '../../map';
import { feature, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { flag } from '../../../../app/play';
import { begin, button, closeButton, end, h, hold, onEscape, panel, pop, tr, type Hold, type Panel } from './ui';
import { chirps } from '../sfx';
import * as snd from './sound';

/** The bell the scenery built (named 'bell'), if any. */
function findBell(root: T.Object3D): T.Object3D | null {
  let hit: T.Object3D | null = null;
  root.traverse((o) => {
    if (hit) return;
    if (o.name === 'bell' || o.userData?.name === 'bell' || o.userData?.landmark === 'bell') hit = o;
  });
  return hit;
}

export const templeBell = feature('mg-bell', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const group = ctx.regionGroup('mountain');
  const still = reducedMotion();
  const anchor = ctx.anchor(ANCHORS.bellTower);
  const hall = ANCHORS.templeHall;

  // ── the bell: the scenery's, or our own on a timber frame
  group.updateMatrixWorld(true);
  let ownFrame: T.Object3D | null = null;
  let bell = findBell(group) ?? findBell(ctx.scene);
  const ours = !bell;
  const centre = new THREE.Vector3();
  let radius = 0.75, bottom = 0, top = 0;
  if (bell) {
    const box = new THREE.Box3().setFromObject(bell);
    box.getCenter(centre);
    const size = box.getSize(new THREE.Vector3());
    radius = Math.max(0.3, Math.min(1.5, Math.max(size.x, size.z) / 2));
    bottom = box.min.y;
    top = box.max.y;
  } else {
    const gy = ctx.groundY(anchor.x, anchor.z);
    const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    const bronze = '#6a5a36';
    const bellGeo = merge(THREE, [
      part(THREE, lathe([[0.001, 1.45], [0.35, 1.44], [0.5, 1.35], [0.56, 1.1], [0.6, 0.6], [0.7, 0.15], [0.74, 0.0], [0.7, 0.0], [0.64, 0.12], [0.55, 0.55]]), bronze),
      part(THREE, new THREE.TorusGeometry(0.62, 0.03, 5, 24), '#4f4428', { p: [0, 0.45, 0], r: [Math.PI / 2, 0, 0] }),
      part(THREE, new THREE.TorusGeometry(0.575, 0.025, 5, 24), '#4f4428', { p: [0, 1.0, 0], r: [Math.PI / 2, 0, 0] }),
      part(THREE, new THREE.TorusGeometry(0.12, 0.04, 6, 12), '#4f4428', { p: [0, 1.55, 0] }),
      // the striking boss (撞座), a lotus medallion on each side
      part(THREE, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), '#8a7442', { p: [0.62, 0.3, 0], r: [0, 0, Math.PI / 2] }),
      part(THREE, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), '#8a7442', { p: [-0.62, 0.3, 0], r: [0, 0, Math.PI / 2] }),
    ]);
    const b = inked(ctx, bellGeo, { width: 0.014 });
    b.name = 'bell';
    const hang = 0.95;
    b.position.set(anchor.x, gy + hang, anchor.z);
    const frame = inked(ctx, merge(THREE, [
      part(THREE, new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), '#5a3d2b', { p: [-1.4, 1.6, 0] }),
      part(THREE, new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), '#5a3d2b', { p: [1.4, 1.6, 0] }),
      part(THREE, new THREE.BoxGeometry(3.4, 0.24, 0.28), '#4a3224', { p: [0, 3.1, 0] }),
      part(THREE, new THREE.ConeGeometry(2.6, 0.9, 4), '#34322e', { p: [0, 3.65, 0], r: [0, Math.PI / 4, 0], s: [1.2, 1, 0.55] }),
      part(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), P.ink, { p: [0, 2.72, 0] }),
      part(THREE, new THREE.BoxGeometry(0.5, 0.5, 0.5), '#8b877c', { p: [-1.4, 0.1, 0] }),
      part(THREE, new THREE.BoxGeometry(0.5, 0.5, 0.5), '#8b877c', { p: [1.4, 0.1, 0] }),
    ]), { width: 0.014 });
    frame.position.set(anchor.x, gy, anchor.z);
    bag.add(frame, group);
    bag.add(b, group);
    ownFrame = frame;
    bag.onDispose(ctx.addCollider({ x: anchor.x, z: anchor.z, r: 0.8, h: 2.4 }));
    bell = b;
    centre.set(anchor.x, gy + hang + 0.7, anchor.z);
    radius = 0.72;
    bottom = gy + hang;
    top = gy + hang + 1.6;
  }
  void top;
  const bellObj = bell;
  const restQ = bellObj.quaternion.clone();

  // ── where you stand, and the log between you and the bronze (toward the hall, else east)
  let u = { x: hall.x - centre.x, z: hall.z - centre.z };
  let L = Math.hypot(u.x, u.z) || 1;
  u = { x: u.x / L, z: u.z / L };
  const tryDirs = [u, { x: -u.z, z: u.x }, { x: u.z, z: -u.x }, { x: -u.x, z: -u.z }];
  for (const d of tryDirs) {
    const k = radius + 2.1;
    if (ctx.isWalkable(centre.x + d.x * k, centre.z + d.z * k)) { u = d; break; }
  }
  // beside the log (the ringer stands to one side and hauls the rope), facing the bell
  L = radius + 1.5;
  const perp = { x: -u.z, z: u.x };
  let sideK = 1;
  if (!ctx.isWalkable(centre.x + u.x * L + perp.x, centre.z + u.z * L + perp.z)) sideK = -1;
  const stand = new THREE.Vector3(centre.x + u.x * L + perp.x * sideK, 0, centre.z + u.z * L + perp.z * sideK);
  stand.y = ctx.groundY(stand.x, stand.z);
  const heading = Math.atan2(centre.x - stand.x, centre.z - stand.z);
  const strikeY = bottom + (centre.y - bottom) * 0.55;
  const pivotY = strikeY + 1.5;

  if (ownFrame) {
    // our frame's posts stand across the swing, clear of the log
    ownFrame.rotation.y = Math.atan2(u.x, u.z);
    for (const sgn of [-1, 1]) bag.onDispose(ctx.addCollider({ x: centre.x + u.z * 1.4 * sgn, z: centre.z - u.x * 1.4 * sgn, r: 0.3, h: 3 }));
  }
  // the log swings in the plane of u about a pivot above; at rest its head just clears the bell
  const logPivot = new THREE.Group();
  const restD = radius + 0.95;
  logPivot.position.set(centre.x + u.x * restD, pivotY, centre.z + u.z * restD);
  logPivot.rotation.y = Math.atan2(u.x, u.z);
  const logLen = 1.6;
  const logGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.11, 0.12, logLen, 10), '#7a5a3c', { p: [0, -1.5, 0], r: [Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.CircleGeometry(0.11, 10), '#b89a70', { p: [0, -1.5, -logLen / 2 - 0.001], r: [Math.PI, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.12, 0.018, 4, 12), P.cinnabar, { p: [0, -1.5, 0.35] }),
    part(THREE, new THREE.TorusGeometry(0.12, 0.018, 4, 12), P.cinnabar, { p: [0, -1.5, -0.35] }),
    // two ropes to the beam
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 1.5, 4), '#c9b27a', { p: [0, -0.75, 0.45] }),
    part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 1.5, 4), '#c9b27a', { p: [0, -0.75, -0.45] }),
    // a tail rope to pull
    part(THREE, new THREE.CylinderGeometry(0.014, 0.014, 0.9, 4), '#c9b27a', { p: [0, -1.85, logLen / 2 + 0.05], r: [0.5, 0, 0] }),
  ]);
  const log = inked(ctx, logGeo, { width: 0.01 });
  logPivot.add(log);
  bag.add(logPivot, group);

  // a ring of sound spreading over the ground
  const ringMat = new THREE.MeshBasicMaterial({ color: '#f4efe4', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.94, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings: { m: T.Mesh; age: number }[] = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringGeo, ringMat.clone());
    m.visible = false;
    bag.add(m, group);
    return { m, age: 1 };
  });
  ringMat.dispose();

  // ── the game
  let ui: { p: Panel; status: HTMLElement; fill: HTMLElement; btn: HTMLButtonElement; hold: Hold; offEsc: () => void } | null = null;
  let angle = 0, vel = 0, pull = 0, armed = true, sway = 0, swayV = 0, strikes = 0, told = false;
  const ringAt = (k: number) => rings[k % rings.length];

  function start() {
    if (!begin(ctx, 'bell')) return;
    ctx.player.freeze(true);
    ctx.player.teleport(stand.x, stand.z, heading);
    const p = panel(bag, 'mg-bell');
    const dock = h('div', 'mg-dock', undefined, p.root);
    const status = h('div', 'mg-status mg-live', tr(ctx, '按住，把撞木拉回来；松手撞钟', 'Hold to haul the log back; let go to strike'), dock);
    const charge = h('div', 'mg-charge', undefined, dock);
    const fill = h('i', '', undefined, charge);
    const btn = button(dock, '撞', tr(ctx, '', 'Strike'));
    closeButton(p.root, ctx, stop);
    ui = { p, status, fill, btn, hold: hold(btn), offEsc: onEscape(stop) };
  }
  function stop() {
    if (!ui) return;
    ui.hold.dispose();
    ui.offEsc();
    ui.p.close();
    ui = null;
    ctx.player.freeze(false);
    end(ctx, 'bell');
  }
  bag.onDispose(() => { if (ui) stop(); });

  function strike(force: number) {
    strikes++;
    snd.templeBell(force);
    swayV += force * 0.12;
    const r = ringAt(strikes);
    r.age = 0;
    r.m.visible = true;
    r.m.position.set(centre.x, ctx.groundY(centre.x, centre.z) + 0.05, centre.z);
    if (force > 0.5) bag.later(900, () => chirps(5, 0.35));
    flag('bell');
    if (ui) {
      pop(ui.p, tr(ctx, `第${strikes}响`, `Strike ${strikes}`), strikes === 108 ? 'is-red' : 'is-small');
      ui.status.textContent = strikes >= 108 ? tr(ctx, '一百零八响，烦恼尽消', 'A hundred and eight — every worry rung away') : tr(ctx, '钟声远去……再撞一次？', 'The sound rolls away… again?');
    }
    if (!told) {
      told = true;
      bag.later(2600, () => ctx.hud.showCard({
        titleZh: '夜半钟声', titleEn: 'The Midnight Bell',
        bodyZh: '月落乌啼霜满天，\n江枫渔火对愁眠。\n姑苏城外寒山寺，\n夜半钟声到客船。\n\n—— 张继《枫桥夜泊》',
        bodyEn: 'The moon sets, a crow cries, frost fills the sky;\nriver maples, fishing fires, and I, sleepless.\nFrom Cold Mountain Temple outside Gusu\nthe midnight bell reaches the traveller’s boat.\n\n— Zhang Ji, “Night Mooring by Maple Bridge”',
        seal: '钟',
      }));
    }
  }

  bag.interact({
    id: 'mg-bell', position: stand, radius: 2.4,
    labelZh: '古钟', labelEn: 'The old bell', actionZh: '撞钟', actionEn: 'Ring the bell',
    act() { start(); },
  });

  const axis = new THREE.Vector3(-u.z, 0, u.x); // the bell sways about the axis across the swing
  const q = new THREE.Quaternion();
  bag.frame((dt) => {
    const d = Math.hypot(ctx.player.position.x - centre.x, ctx.player.position.z - centre.z);
    if (ui && d > 10) stop();
    if (d > 60 && !ui) return;
    // the log: a damped pendulum; hauling back pulls it toward you (negative angle)
    const H = ui?.hold;
    if (H?.pressed()) armed = true;
    if (H?.down && armed) {
      pull = Math.min(1, pull + dt * (1.1 - pull * 0.7));
      angle += (-pull * 0.75 - angle) * Math.min(1, dt * 6);
      vel = 0;
      if (ui) ui.fill.style.width = `${Math.round(pull * 100)}%`;
    } else {
      if (H?.released() && pull > 0.05) { vel = 0; armed = false; }
      vel += -angle * 9 * dt - vel * 0.4 * dt;
      const before = angle;
      angle += vel * dt;
      // contact with the bronze at angle 0 moving forward
      if (before < 0 && angle >= 0 && vel > 0.25) {
        const force = Math.min(1, vel / 2.4);
        strike(force);
        vel = -vel * 0.35;
        angle = 0;
        pull = 0;
        if (ui) ui.fill.style.width = '0%';
      }
      if (angle > 0) { angle = 0; vel = Math.min(0, vel); }
      if (!H?.down && Math.abs(angle) < 0.02 && Math.abs(vel) < 0.05) armed = true;
    }
    logPivot.rotation.x = angle; // a negative angle swings the log back, away from the bell
    // the bell sways after a strike, the rings spread
    swayV += -sway * 6 * dt - swayV * 0.8 * dt;
    sway += swayV * dt;
    q.setFromAxisAngle(axis, still ? 0 : -sway * (ours ? 1 : 0.4));
    bellObj.quaternion.copy(restQ).premultiply(q);
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.age += dt / 3.2;
      if (r.age >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(1 + r.age * 34);
      (r.m.material as T.MeshBasicMaterial).opacity = (1 - r.age) * 0.28;
    }
  });
  bag.onDispose(() => bellObj.quaternion.copy(restQ));
});
