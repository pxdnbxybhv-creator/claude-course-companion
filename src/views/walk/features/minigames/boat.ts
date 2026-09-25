// 泛舟采莲 — a little black-awning boat (乌篷船) moored at the dock. Step in, and the stick rows:
// the boat turns toward where you push and glides with momentum, leaving a gentle wake; it will not
// leave the lake. Lotus pods stand among the leaves — row up to one and pick it, and a line of a
// lotus-picking song drifts up. Land again at the dock or the water pavilion.
import type * as T from 'three';
import { ANCHORS, LAKE } from '../../map';
import { dayRng, feature, inked, reducedMotion, reflects } from '../kit';
import { merge, part } from '../geo';
import { burst } from '../props';
import { record } from '../../../../app/play';
import { begin, button, end, h, hold, onEscape, panel, tr, type Hold, type Panel } from './ui';
import { ripples } from './fx';
import { dockSpot } from './fishing';
import * as snd from './sound';

const SONGS: { zh: string; en: string }[] = [
  { zh: '采莲南塘秋，莲花过人头。\n低头弄莲子，莲子清如水。——《西洲曲》', en: 'Picking lotus in the south pond in autumn, the flowers taller than my head;\nI bow to play with the seeds — clear as water. — “West Isle Song”' },
  { zh: '小娃撑小艇，偷采白莲回。\n不解藏踪迹，浮萍一道开。——白居易《池上》', en: 'A little one poles a little boat, sneaking back with white lotus;\nnot knowing to hide the trail — a lane opens in the duckweed. — Bai Juyi' },
  { zh: '荷叶罗裙一色裁，芙蓉向脸两边开。\n乱入池中看不见，闻歌始觉有人来。——王昌龄《采莲曲》', en: 'Lotus leaves and silk skirts cut from one green; blossoms open either side of her face.\nLost in the pond, unseen — only the song tells you someone is there. — Wang Changling' },
  { zh: '争渡，争渡，惊起一滩鸥鹭。——李清照《如梦令》', en: 'Row hard, row hard — and up from the shallows start the gulls and egrets. — Li Qingzhao' },
  { zh: '接天莲叶无穷碧，映日荷花别样红。——杨万里', en: 'Lotus leaves to the sky, an endless green; lotus flowers in the sun, a red like no other. — Yang Wanli' },
  { zh: '江南可采莲，莲叶何田田。\n鱼戏莲叶间。——汉乐府《江南》', en: 'South of the river the lotus is ripe for picking, the leaves so lush;\nfish play among the leaves. — Han yuefu' },
];

export const boating = feature('mg-boat', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const group = ctx.regionGroup('lake');
  const still = reducedMotion();
  const rip = ripples(bag, group, 10);
  const inLake = (x: number, z: number, m = 0.94) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < m * m && ctx.waterAt(x, z) !== null;

  // ── the mooring: open water a few metres off the dock, to one side of the fishing spot
  const { stand: dockStand, dir } = dockSpot(ctx);
  const side = { x: -dir.z, z: dir.x };
  let moor = { x: dockStand.x + dir.x * 3, z: dockStand.z + dir.z * 3 };
  outer: for (const sd of [-3.5, 3.5, -2, 2, 0]) {
    for (const fw of [2.5, 3.5, 4.5]) {
      const x = dockStand.x + dir.x * fw + side.x * sd, z = dockStand.z + dir.z * fw + side.z * sd;
      if (inLake(x, z, 0.97)) { moor = { x, z }; break outer; }
    }
  }
  const moorHeading = Math.atan2(side.x, side.z);
  const pav = ctx.anchor(ANCHORS.waterPavilion);
  const landings = [
    { x: dockStand.x, z: dockStand.z, zh: '渡口', en: 'the dock' },
    { x: pav.x, z: pav.z, zh: '水榭', en: 'the water pavilion' },
  ];

  // ── the boat: a shallow hull, a black awning, a plank seat, a sculling oar
  const hullGeo = merge(THREE, [
    part(THREE, new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#6b4b33', { s: [0.62, 0.34, 1.75] }),
    part(THREE, new THREE.TorusGeometry(1, 0.05, 5, 30), '#3b2a20', { r: [Math.PI / 2, 0, 0], s: [0.62, 1.75, 1] }),
    part(THREE, new THREE.CircleGeometry(1, 24), '#8a6b4a', { p: [0, -0.06, 0], r: [-Math.PI / 2, 0, 0], s: [0.56, 1.62, 1] }),
    // the awning (乌篷): a half barrel of woven black bamboo
    part(THREE, new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14, 1, true, -Math.PI / 2, Math.PI), '#2c2823', { p: [0, 0.02, 0.45], r: [-Math.PI / 2, 0, 0] }),
    part(THREE, new THREE.TorusGeometry(0.55, 0.025, 4, 14, Math.PI), '#4a443c', { p: [0, 0.02, 0.98] }),
    part(THREE, new THREE.TorusGeometry(0.55, 0.025, 4, 14, Math.PI), '#4a443c', { p: [0, 0.02, -0.1] }),
    // the plank seat in the stern
    part(THREE, new THREE.BoxGeometry(0.95, 0.05, 0.3), '#a0805a', { p: [0, -0.05, -0.75] }),
    // a small lantern hook at the bow
    part(THREE, new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), '#3b2a20', { p: [0, 0.3, 1.45], r: [0.3, 0, 0] }),
  ]);
  const boat = new THREE.Group();
  const hull = inked(ctx, hullGeo, { width: 0.012 });
  boat.add(hull);
  const oarPivot = new THREE.Group();
  oarPivot.position.set(0.25, 0.1, -1.55);
  const oar = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.025, 0.025, 2.2, 5), '#8a6b4a', { p: [0, 0, -0.6], r: [Math.PI / 2 - 0.45, 0, 0] }),
    part(THREE, new THREE.BoxGeometry(0.16, 0.02, 0.5), '#6b4b33', { p: [0, -0.48, -1.55], r: [-0.45, 0, 0] }),
  ]), { width: 0.008 });
  oarPivot.add(oar);
  boat.add(oarPivot);
  const seat = new THREE.Object3D();
  seat.position.set(0, -0.08, -0.62);
  boat.add(seat);
  boat.position.set(moor.x, (ctx.waterAt(moor.x, moor.z) ?? LAKE.waterY) + 0.12, moor.z);
  boat.rotation.y = moorHeading;
  bag.add(reflects(boat), group);

  // ── lotus pods among leaves (the same all day)
  const rng = dayRng(ctx, 'lotus-pods');
  const pods: { g: T.Group; x: number; z: number; picked: boolean }[] = [];
  const podGeo = merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.012, 0.016, 1.05, 5), '#6f8a4a', { p: [0, 0.52, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.1, 0.045, 0.1, 12), '#7f9a55', { p: [0, 1.08, 0] }),
    part(THREE, new THREE.CircleGeometry(0.095, 12), '#a9b87a', { p: [0, 1.131, 0], r: [-Math.PI / 2, 0, 0] }),
    ...Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2, r = i === 6 ? 0 : 0.055;
      return part(THREE, new THREE.CircleGeometry(0.014, 6), '#3a3a24', { p: [Math.cos(a) * r, 1.133, Math.sin(a) * r], r: [-Math.PI / 2, 0, 0] });
    }),
  ]);
  const leafGeo = merge(THREE, [part(THREE, new THREE.CircleGeometry(0.5, 14, 0.3, Math.PI * 2 - 0.3), P.malachite, { r: [-Math.PI / 2, 0, 0] })]);
  for (let i = 0; i < 40 && pods.length < 12; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.8;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
    if (!inLake(x, z, 0.85) || Math.hypot(x - moor.x, z - moor.z) < 6 || pods.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
    const g = new THREE.Group();
    const y = ctx.waterAt(x, z) ?? LAKE.waterY;
    g.position.set(x, y, z);
    const pod = inked(ctx, podGeo, { width: 0.006 });
    pod.rotation.z = (rng() - 0.5) * 0.25;
    g.add(pod);
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(leafGeo, pod.material as T.Material);
      leaf.position.set((rng() - 0.5) * 1.4, 0.02 + k * 0.004, (rng() - 0.5) * 1.4);
      leaf.rotation.y = rng() * Math.PI * 2;
      leaf.scale.setScalar(0.7 + rng() * 0.6);
      g.add(leaf);
    }
    bag.add(reflects(g), group);
    pods.push({ g, x, z, picked: false });
  }

  // ── rowing
  let ui: { p: Panel; status: HTMLElement; pick: HTMLButtonElement; land: HTMLButtonElement; hPick: Hold; hLand: Hold; offEsc: () => void } | null = null;
  let escaped = false;
  let shore: { x: number; z: number; zh: string; en: string } | null = null, shoreT = 0;
  let heading = moorHeading, speed = 0, strokeT = 0, wakeT = 0, awayT = 0, picked = 0, songI = Math.floor(rng() * SONGS.length);
  const boardSpot = new THREE.Vector3(moor.x, 0, moor.z);

  function board() {
    if (!begin(ctx, 'boat')) return;
    ctx.player.freeze(true);
    ctx.player.ride(seat);
    ctx.player.emote('sit');
    snd.splash(0.2);
    const p = panel(bag, 'mg-boat');
    const dock = h('div', 'mg-dock', undefined, p.root);
    const status = h('div', 'mg-status mg-live', tr(ctx, '推动摇杆划船', 'Push the stick to row'), dock);
    h('small', '', tr(ctx, '靠近莲蓬可采；到渡口或水榭可上岸', 'Row up to a lotus pod to pick it; land at the dock or the pavilion'), status);
    const row = h('div', 'mg-row', undefined, dock);
    const pick = button(row, '采', tr(ctx, '', 'Pick'));
    const land = button(row, '岸', tr(ctx, '', 'Land'), 'is-quiet');
    ui = { p, status, pick, land, hPick: hold(pick), hLand: hold(land), offEsc: onEscape(() => { escaped = true; }) };
    ui.pick.style.display = 'none';
    ui.land.style.display = 'none';
  }

  function disembark(to: { x: number; z: number; zh: string; en: string }) {
    if (!ui) return;
    ui.hPick.dispose();
    ui.hLand.dispose();
    ui.offEsc();
    ui.p.close();
    ui = null;
    speed = 0;
    ctx.player.ride(null);
    // step onto the nearest walkable ground by the landing
    let tx = to.x, tz = to.z;
    for (let k = 0; k < 16 && !ctx.isWalkable(tx, tz); k++) {
      tx += (boat.position.x - to.x) * -0.05 + Math.cos(k) * 0.4;
      tz += (boat.position.z - to.z) * -0.05 + Math.sin(k) * 0.4;
    }
    ctx.player.teleport(tx, tz, Math.atan2(tx - boat.position.x, tz - boat.position.z));
    ctx.player.freeze(false);
    end(ctx, 'boat');
    ctx.hud.toast(`在${to.zh}上岸`, `Ashore at ${to.en}`, 1600);
  }
  bag.onDispose(() => {
    if (!ui) return;
    ui.hPick.dispose(); ui.hLand.dispose(); ui.offEsc(); ui.p.close(); ui = null;
    try { ctx.player.ride(null); ctx.player.freeze(false); } catch { /* the world is going */ }
    end(ctx, 'boat');
  });

  function pickPod(i: number) {
    const pd = pods[i];
    pd.picked = true;
    snd.snap();
    ctx.player.emote('water');
    burst(bag, new THREE.Vector3(pd.x, pd.g.position.y + 1, pd.z), '#9fb46a', 10, { speed: 0.8, size: 0.02, life: 1 });
    pd.g.children[0].visible = false;
    record('lotus');
    picked++;
    const song = SONGS[songI++ % SONGS.length];
    ctx.audio.pluck([0, 2, 4, 7][picked % 4], 0.55);
    if (picked === 1) ctx.hud.showCard({ titleZh: '采莲', titleEn: 'Picking lotus', bodyZh: song.zh, bodyEn: song.en, seal: '莲' });
    else ctx.hud.toast(song.zh.split('\n')[0], song.en.split('\n')[0], 3200);
  }

  bag.interact({
    id: 'mg-boat', position: boardSpot, radius: 3.2,
    labelZh: '乌篷船', labelEn: 'Little boat', actionZh: '上船', actionEn: 'Board',
    act() { board(); },
  });

  const camDir = new THREE.Vector3();
  bag.frame((dt, t) => {
    const riding = !!ui;
    const wy = ctx.waterAt(boat.position.x, boat.position.z) ?? LAKE.waterY;
    // bob on the water
    boat.position.y = wy + 0.12 + (still ? 0 : Math.sin(t * 1.3) * 0.02);
    hull.rotation.z = still ? 0 : Math.sin(t * 0.9) * 0.025 + (riding ? Math.sin(t * 1.7) * 0.01 : 0);
    hull.rotation.x = still ? 0 : Math.sin(t * 0.7 + 1) * 0.015 - speed * 0.01;
    boardSpot.set(boat.position.x, boat.position.y, boat.position.z);
    // lotus pods sway a little
    if (!still) for (let i = 0; i < pods.length; i++) pods[i].g.children[0].rotation.x = Math.sin(t * 0.8 + i) * 0.04;

    if (!riding) {
      // left somewhere: after a while it quietly drifts home to the mooring
      const d = Math.hypot(ctx.player.position.x - boat.position.x, ctx.player.position.z - boat.position.z);
      if (Math.hypot(boat.position.x - moor.x, boat.position.z - moor.z) > 1 && d > 25) {
        awayT += dt;
        if (awayT > 15) { boat.position.x = moor.x; boat.position.z = moor.z; heading = moorHeading; boat.rotation.y = heading; awayT = 0; }
      } else awayT = 0;
      return;
    }
    // camera-relative steering: turn toward where the stick points, push forward as it lines up
    const ix = ctx.input.x, iy = ctx.input.y;
    const mag = Math.min(1, Math.hypot(ix, iy));
    let thrust = 0;
    if (mag > 0.12) {
      ctx.camera.getWorldDirection(camDir);
      const fx = camDir.x, fz = camDir.z;
      const fl = Math.hypot(fx, fz) || 1;
      const cfx = fx / fl, cfz = fz / fl;
      const rx = -cfz, rz = cfx;
      const wx = cfx * iy + rx * ix, wz = cfz * iy + rz * ix;
      const want = Math.atan2(wx, wz);
      let dd = want - heading;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      heading += Math.max(-1.3 * dt, Math.min(1.3 * dt, dd));
      thrust = mag * Math.max(0, Math.cos(dd));
    }
    speed += (thrust * 2.4 - speed * 0.7) * dt;
    speed = Math.max(0, Math.min(3, speed));
    const nx = boat.position.x + Math.sin(heading) * speed * dt, nz = boat.position.z + Math.cos(heading) * speed * dt;
    if (inLake(nx, nz) && !pods.some((p) => !p.picked && Math.hypot(p.x - nx, p.z - nz) < 0.9)) {
      boat.position.x = nx;
      boat.position.z = nz;
    } else if (speed > 0.4) {
      speed *= 0.2;
      snd.click(0.6);
      rip.spawn(nx, wy, nz, 0.6, 0.5);
    } else speed = 0;
    boat.rotation.y = heading;
    // strokes and wake
    if (thrust > 0.1) {
      strokeT += dt;
      oarPivot.rotation.y = still ? 0 : Math.sin(strokeT * 5.2) * 0.35;
      if (strokeT > 1.2) { strokeT = 0; snd.paddle(0.5); ctx.player.emote('row'); }
    }
    wakeT += dt * speed;
    if (wakeT > 1.1) {
      wakeT = 0;
      const bx = boat.position.x - Math.sin(heading) * 1.7, bz = boat.position.z - Math.cos(heading) * 1.7;
      rip.spawn(bx, wy, bz, 0.9 + speed * 0.3, 0.35);
    }
    // what is near: a pod to pick, a place to land
    let near = -1, nd = 2.6;
    for (let i = 0; i < pods.length; i++) {
      if (pods[i].picked) continue;
      const d = Math.hypot(pods[i].x - boat.position.x, pods[i].z - boat.position.z);
      if (d < nd) { nd = d; near = i; }
    }
    let landing: (typeof landings)[number] | null = null;
    for (const l of landings) if (Math.hypot(l.x - boat.position.x, l.z - boat.position.z) < 6.5) landing = l;
    // or any bit of shore right beside the boat
    shoreT -= dt;
    if (!landing && shoreT <= 0) {
      shoreT = 0.3;
      shore = null;
      for (let r = 1.6; r <= 3.2 && !shore; r += 0.8) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const x = boat.position.x + Math.cos(a) * r, z = boat.position.z + Math.sin(a) * r;
          if (ctx.isWalkable(x, z) && ctx.waterAt(x, z) === null) { shore = { x, z, zh: '岸边', en: 'the shore' }; break; }
        }
      }
    }
    if (!landing) landing = shore;
    const u = ui!;
    u.pick.style.display = near >= 0 ? '' : 'none';
    u.land.style.display = landing ? '' : 'none';
    const pk = u.hPick.pressed(), ld = u.hLand.pressed() || escaped;
    if (escaped && !landing) ctx.hud.toast('划到岸边才能下船', 'Row to the shore to get off', 1600);
    escaped = false;
    if (pk || ld) {
      if (pk && near >= 0) pickPod(near);
      else if (landing) disembark(landing);
    }
  });
});
