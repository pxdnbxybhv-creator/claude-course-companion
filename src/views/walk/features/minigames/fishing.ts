// 钓鱼 — fishing from the dock at the lotus lake. Hold to swing the rod back, let go to cast; the
// float lands with a plip and bobs; a nibble or two (don't strike yet!), then it dips under — strike!
// Then the reel: keep the fish inside the pale band (hold to lift it) until the meter fills, and a
// fish leaps out of the lake into the catch card, with a line of verse. 渔翁 bites sooner, reels easier.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { ANCHORS, LAKE } from '../../map';
import { feature, reducedMotion } from '../kit';
import { burst } from '../props';
import { record, recordMax, flag, play } from '../../../../app/play';
import { FISH, biteDelay, fishAlbum, newReel, reelZone, rollFish, stepReel, inZone, type Catch, type Reel } from './logic';
import { ability, begin, button, closeButton, end, frameOn, h, hold, night, onEscape, panel, pop, tr, type Hold, type Panel } from './ui';
import { fishMesh, ripples } from './fx';
import * as snd from './sound';

type Phase = 'ready' | 'charge' | 'flying' | 'wait' | 'bite' | 'reel' | 'landing';

/** Where to stand at the dock and which way the water lies. */
export function dockSpot(ctx: WorldCtx): { stand: T.Vector3; dir: { x: number; z: number } } {
  const a = ANCHORS.dock;
  const dx = LAKE.x - a.x, dz = LAKE.z - a.z;
  const L = Math.hypot(dx, dz);
  const dir = { x: dx / L, z: dz / L };
  // walk out along the jetty while there is something to stand on
  let s = 0;
  for (let k = 0.5; k <= 8; k += 0.5) {
    if (ctx.isWalkable(a.x + dir.x * k, a.z + dir.z * k)) s = k; else break;
  }
  const x = a.x + dir.x * s, z = a.z + dir.z * s;
  return { stand: new ctx.THREE.Vector3(x, ctx.groundY(x, z), z), dir };
}

export const fishing = feature('mg-fishing', (bag, ctx) => {
  const { THREE } = ctx;
  const group = ctx.regionGroup('lake');
  const { stand, dir } = dockSpot(ctx);
  const heading = Math.atan2(dir.x, dir.z);
  const still = reducedMotion();
  const rip = ripples(bag, group, 6);

  // the rod (bamboo, jointed), a line, a red-and-white float
  const rodYaw = new THREE.Group();
  const rodPivot = new THREE.Group();
  rodYaw.add(rodPivot);
  const rodGeo = new THREE.CylinderGeometry(0.007, 0.018, 2.3, 6);
  rodGeo.translate(0, 1.15, 0);
  const rod = new THREE.Mesh(rodGeo, new THREE.MeshLambertMaterial({ color: '#9b7d4a' }));
  rodPivot.add(rod);
  const tip = new THREE.Object3D();
  tip.position.set(0, 2.3, 0);
  rodPivot.add(tip);
  rodYaw.visible = false;
  bag.add(rodYaw, group);

  const floatGeo = new THREE.CapsuleGeometry(0.035, 0.09, 4, 8);
  const floatMesh = new THREE.Mesh(floatGeo, new THREE.MeshLambertMaterial({ color: '#c0412f' }));
  const floatCap = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f4efe4' }));
  floatCap.position.y = -0.045;
  floatMesh.add(floatCap);
  floatMesh.visible = false;
  bag.add(floatMesh, group);

  const LINE_N = 14;
  const linePos = new Float32Array(LINE_N * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#2a2621', transparent: true, opacity: 0.75 }));
  line.frustumCulled = false;
  line.visible = false;
  bag.add(line, group);

  let phase: Phase = 'ready';
  let ui: { p: Panel; status: HTMLElement; btn: HTMLButtonElement; charge: HTMLElement; chargeFill: HTMLElement; reelBox: HTMLElement; zone: HTMLElement; fish: HTMLElement; meter: HTMLElement; hold: Hold; offEsc: () => void } | null = null;
  let power = 0, chargeT = 0;
  const floatAt = new THREE.Vector3(), floatFrom = new THREE.Vector3();
  let flyT = 0;
  let waitLeft = 0, nibbles = 0, nibbleAt = 0, biteLeft = 0, sinkT = 0;
  let reel: Reel | null = null;
  let hooked: Catch | null = null;
  let clickAcc = 0, toneAcc = 0;
  const rng = Math.random;
  let pitch = 0.9, pitchGoal = 0.9;

  const waterY = (x: number, z: number) => ctx.waterAt(x, z) ?? LAKE.waterY;

  const setStatus = (zh: string, en: string, subZh = '', subEn = '') => {
    if (!ui) return;
    ui.status.textContent = tr(ctx, zh, en);
    if (subZh) h('small', '', tr(ctx, subZh, subEn), ui.status);
  };
  const setButton = (glyph: string, sub: string, hot = false) => {
    if (!ui) return;
    (ui.btn.querySelector('.mg-btn-glyph') as HTMLElement).textContent = glyph;
    (ui.btn.querySelector('.mg-btn-sub') as HTMLElement).textContent = sub;
    ui.btn.classList.toggle('is-hot', hot);
  };

  const toReady = () => {
    phase = 'ready';
    floatMesh.visible = false;
    line.visible = false;
    pitchGoal = 0.9;
    ui?.charge.style.setProperty('visibility', 'hidden');
    ui?.reelBox.style.setProperty('display', 'none');
    setStatus('按住蓄力，松手抛竿', 'Hold to swing back, release to cast');
    setButton('抛', tr(ctx, '', 'Cast'));
  };

  const fishFactor = () => { const a = ability(ctx); return a.kind === 'fish' ? a.factor : 1; };

  // the hand the rod is in: re-found whenever the walker changes (a new model has a new hand)
  let handObj: T.Object3D | null = null;
  let handOf: string | null = null;
  const takeRod = () => { handObj = ctx.player.holdProp('rod'); handOf = ctx.player.character; };
  function start() {
    if (!begin(ctx, 'fishing')) return;
    ctx.player.freeze(true);
    ctx.player.teleport(stand.x, stand.z, heading);
    rodYaw.visible = true;
    // the rod goes in the walker's own hand (the fisher's own rod is put away meanwhile)
    takeRod();
    frameOn(ctx, stand.x + dir.x * 5, stand.z + dir.z * 5, stand.y + 0.4);
    const p = panel(bag, 'mg-fishing');
    const dock = h('div', 'mg-dock', undefined, p.root);
    const status = h('div', 'mg-status mg-live', '', dock);
    const charge = h('div', 'mg-charge', undefined, dock);
    const chargeFill = h('i', '', undefined, charge);
    charge.style.visibility = 'hidden';
    const btn = button(dock, '抛', '');
    const reelBox = h('div', 'mg-reel', undefined, p.root);
    const track = h('div', 'mg-reel-track', undefined, reelBox);
    const zone = h('div', 'mg-reel-zone', undefined, track);
    const fish = h('div', 'mg-reel-fish', '鱼', track);
    const meterBox = h('div', 'mg-reel-meter', undefined, reelBox);
    const meter = h('i', '', undefined, meterBox);
    reelBox.style.display = 'none';
    closeButton(p.root, ctx, stop);
    const albumBtn = h('button', 'mg-x mg-album-btn', '谱', p.root);
    albumBtn.type = 'button';
    albumBtn.setAttribute('aria-label', tr(ctx, '鱼谱', 'Fish album'));
    albumBtn.title = tr(ctx, '鱼谱', 'Fish album');
    albumBtn.addEventListener('click', (e) => { e.stopPropagation(); openAlbum(); });
    ui = { p, status, btn, charge, chargeFill, reelBox, zone, fish, meter, hold: hold(btn), offEsc: onEscape(stop) };
    toReady();
    if (fishFactor() > 1) ctx.hud.toast('渔翁在此，鱼儿闻讯而来', 'The old fisherman is here — the fish come sooner', 2200);
  }

  // ── 鱼谱: every fish of the lake, caught or still to come
  let album: { el: HTMLElement; off: () => void } | null = null;
  function openAlbum() {
    if (!ui || album) return;
    const pages = fishAlbum(play.value.flags, play.value.best);
    const got = pages.filter((pg) => pg.caught).length;
    const el = h('div', 'mg-sheet mg-album', undefined, ui.p.root);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', tr(ctx, '鱼谱', 'Fish album'));
    const head = h('h3', '', tr(ctx, '鱼谱', 'Fish album'), el);
    h('small', '', ` ${got}/${pages.length}`, head);
    const grid = h('ul', 'mg-album-grid', undefined, el);
    for (const pg of pages) {
      const s = pg.species;
      const li = h('li', pg.caught ? 'is-caught' : '', undefined, grid);
      const c = h('canvas', '', undefined, li);
      c.width = 96; c.height = 48;
      paintFish(c, pg.caught ? s.color : '#b9b1a2', s.id, pg.caught);
      h('b', '', pg.caught ? tr(ctx, s.zh, s.en) : '？？', li);
      if (pg.caught) {
        const size = s.id === 'kun' ? tr(ctx, '不知其几千里', 'beyond measure') : s.rarity === 'junk' ? '' : pg.bestCm ? tr(ctx, `最长 ${pg.bestCm} 厘米`, `best ${pg.bestCm} cm`) : '';
        if (size) h('small', '', size, li);
        h('p', '', ctx.lang === 'zh' ? s.verseZh : s.verseEn, li);
      } else h('p', 'is-hint', tr(ctx, pg.hintZh, pg.hintEn), li);
    }
    const row = h('div', 'mg-row', undefined, el);
    const close = h('button', 'mg-text-btn is-primary', tr(ctx, '收起', 'Close'), row);
    close.type = 'button';
    const shut = () => { if (!album) return; album.off(); album.el.remove(); album = null; };
    close.addEventListener('click', (e) => { e.stopPropagation(); shut(); });
    const k = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } };
    window.addEventListener('keydown', k, true);
    album = { el, off: () => window.removeEventListener('keydown', k, true) };
    close.focus();
  }

  function stop() {
    if (!ui) return;
    if (album) { album.off(); album = null; }
    ui.hold.dispose();
    ui.offEsc();
    ui.p.close();
    ui = null;
    phase = 'ready';
    floatMesh.visible = false;
    line.visible = false;
    rodYaw.visible = false;
    ctx.player.holdProp(null);
    handObj = null;
    handOf = null;
    ctx.player.freeze(false);
    end(ctx, 'fishing');
  }
  bag.onDispose(() => { if (ui) stop(); });

  function cast() {
    phase = 'flying';
    flyT = 0;
    const reach = 3 + power * 7;
    // the farthest water within reach, in front of the dock
    let x = stand.x + dir.x * reach, z = stand.z + dir.z * reach;
    for (let k = reach; k > 1.5; k -= 0.5) {
      x = stand.x + dir.x * k; z = stand.z + dir.z * k;
      if (ctx.waterAt(x, z) !== null) break;
    }
    // a little sideways scatter
    const side = (rng() - 0.5) * 1.6;
    x += -dir.z * side; z += dir.x * side;
    floatAt.set(x, waterY(x, z), z);
    tip.getWorldPosition(floatFrom);
    floatMesh.visible = true;
    line.visible = true;
    ctx.player.emote('cast');
    snd.whirr(power);
    pitchGoal = 0.45;
    ui!.charge.style.visibility = 'hidden';
    setStatus('', '');
    setButton('收', tr(ctx, '', 'Reel in'));
  }

  function landed() {
    phase = 'wait';
    snd.splash(0.18);
    rip.spawn(floatAt.x, floatAt.y, floatAt.z, 0.7, 0.6);
    waitLeft = biteDelay(rng, fishFactor());
    nibbles = rng() < 0.7 ? 1 + Math.floor(rng() * 2) : 0;
    nibbleAt = waitLeft * (0.35 + rng() * 0.3);
    pitchGoal = 0.8;
    setStatus('静候鱼讯……', 'Waiting for a bite…', '浮漂沉下去时再提竿', 'Strike when the float goes under');
  }

  function strike() {
    // the moment the float dips: hooked!
    const month = ctx.env.date.getMonth() + 1;
    hooked = rollFish(rng, { month, night: night(ctx) });
    const s = hooked.species;
    reel = newReel(reelZone(s.fight, fishFactor()));
    phase = 'reel';
    clickAcc = toneAcc = 0;
    ui!.reelBox.style.display = '';
    ui!.fish.classList.toggle('is-rare', s.rarity === 'rare' || s.rarity === 'legend');
    ui!.fish.textContent = s.rarity === 'junk' ? '履' : s.rarity === 'legend' ? '龙' : '鱼';
    pitchGoal = 1.25;
    snd.splash(0.35);
    rip.spawn(floatAt.x, floatAt.y, floatAt.z, 1.2, 0.7);
    if (s.rarity === 'legend') setStatus('水下有大家伙！稳住！', 'Something huge below — steady!', '按住抬起浅色框，罩住鱼', 'Hold to lift the pale band over the fish');
    else setStatus('上钩了！', 'Hooked!', '按住抬起浅色框，罩住鱼', 'Hold to lift the pale band over the fish');
    setButton('收', tr(ctx, '', 'Hold'), false);
    if (!still) pop(ui!.p, tr(ctx, '中！', 'Hooked!'), 'is-red');
  }

  function missed(early: boolean) {
    phase = 'wait';
    ctx.hud.toast(early ? '太早了，鱼吓跑了' : '慢了一步，鱼儿溜走了', early ? 'Too soon — the fish took fright' : 'Too slow — it slipped away', 1800);
    waitLeft = biteDelay(rng, fishFactor()) + 1;
    nibbles = rng() < 0.5 ? 1 : 0;
    nibbleAt = waitLeft * 0.5;
    setButton('收', tr(ctx, '', 'Reel in'));
    setStatus('静候鱼讯……', 'Waiting for a bite…');
  }

  function caught(c: Catch) {
    phase = 'landing';
    ui!.reelBox.style.display = 'none';
    const s = c.species;
    snd.splash(0.85);
    rip.spawn(floatAt.x, floatAt.y, floatAt.z, 1.8, 0.8);
    // the fish leaps out of the lake toward you
    const len = s.id === 'kun' ? 1.6 : Math.max(0.12, Math.min(1.2, c.cm / 100));
    const f = fishMesh(bag, s.color, s.id === 'sandal' ? 0.25 : len);
    if (s.id === 'sandal') f.scale.set(1.2, 0.35, 1);
    bag.add(f, group);
    const from = floatAt.clone(), to = new THREE.Vector3(stand.x + dir.x * 0.9, stand.y + 0.9, stand.z + dir.z * 0.9);
    let t = 0;
    const off = ctx.onFrame((dt) => {
      t += dt / 1.05;
      const k = Math.min(1, t);
      f.position.lerpVectors(from, to, k);
      f.position.y += Math.sin(k * Math.PI) * 1.6;
      f.rotation.set(still ? 0 : Math.sin(t * 20) * 0.3, heading + Math.PI, still ? 0 : -k * Math.PI * 1.5);
      if (k >= 1) {
        off();
        burst(bag, to, '#dfe8ea', 14, { speed: 1.4, size: 0.02, life: 1 });
        bag.drop(f);
        land(c);
      }
    });
    bag.onDispose(off);
  }

  function land(c: Catch) {
    const s = c.species;
    const junk = s.rarity === 'junk';
    const key = `fishcm:${s.id}`;
    const prevBest = play.value.best[key] ?? 0;
    const hadIt = !!play.value.flags[`fish:${s.id}`];
    if (!junk) record('fish');
    flag(`fish:${s.id}`);
    if (s.id !== 'kun') recordMax(key, c.cm);
    const album = FISH.filter((f) => play.value.flags[`fish:${f.id}`]).length;
    const size = s.id === 'kun' ? { zh: '不知其几千里也', en: 'Nobody knows how many thousand li' } : { zh: `${c.cm} 厘米`, en: `${c.cm} cm` };
    const rec = !junk && s.id !== 'kun' && prevBest > 0 && c.cm > prevBest ? { zh: '\n—— 新纪录！', en: '\n— A new record!' } : { zh: '', en: '' };
    const first = !hadIt ? { zh: '（鱼谱新添一页）', en: '(A new page in your fish album)' } : { zh: '', en: '' };
    const rarityZh = { common: '', uncommon: '难得 · ', rare: '稀有 · ', legend: '传说 · ', junk: '' }[s.rarity];
    const rarityEn = { common: '', uncommon: 'Uncommon · ', rare: 'Rare · ', legend: 'Legendary · ', junk: '' }[s.rarity];
    if (s.rarity === 'rare' || s.rarity === 'legend') { ctx.audio.chime(s.rarity === 'legend' ? 7 : 4); snd.ding(5); } else snd.ding(junk ? 1 : 3);
    ctx.player.emote(junk ? 'bow' : 'jump');
    ctx.hud.showCard({
      titleZh: junk ? `钓到了${s.zh}` : `${rarityZh}${s.zh}`,
      titleEn: junk ? `You caught ${s.en.toLowerCase()}` : `${rarityEn}${s.en}`,
      bodyZh: `${junk ? '' : size.zh + rec.zh + '\n'}${first.zh}\n「${s.verseZh}」\n—— ${s.srcZh}\n\n鱼谱 ${album}/${FISH.length}`,
      bodyEn: `${junk ? '' : size.en + rec.en + '\n'}${first.en}\n“${s.verseEn}”\n\nFish album ${album}/${FISH.length}`,
      seal: junk ? '笑' : '渔',
    });
    bag.later(600, () => { if (ui) toReady(); });
  }

  function lost() {
    ui!.reelBox.style.display = 'none';
    snd.splash(0.5);
    rip.spawn(floatAt.x, floatAt.y, floatAt.z, 1.2, 0.6);
    ctx.hud.toast(hooked?.species.rarity === 'legend' ? '断线了……那到底是什么？' : '脱钩了！再来一竿', hooked?.species.rarity === 'legend' ? 'The line snapped… what WAS that?' : 'It got off the hook — cast again', 2200);
    hooked = null;
    toReady();
  }

  // ───────── the interactable, and every frame ─────────
  bag.interact({
    id: 'mg-fishing', position: stand, radius: 2.6,
    labelZh: '渡口', labelEn: 'The dock', actionZh: '垂钓', actionEn: 'Fish',
    act() { start(); },
  });

  const tipW = new THREE.Vector3();
  const handW = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  bag.frame((dt, t) => {
    if (!rodYaw.visible) return;
    // rod follows the walker's hand
    const pp = ctx.player.position;
    const hd = ctx.player.heading;
    const rx = Math.cos(hd), rz = -Math.sin(hd); // the walker's right
    // a different walker now (the picker, or 与之同游 on a celebration): the rod goes to the new hand
    if (ui && handOf !== ctx.player.character) takeRod();
    if (handObj) {
      handObj.getWorldPosition(handW);
      rodYaw.position.copy(handW);
    } else rodYaw.position.set(pp.x - rx * 0.2 + Math.sin(hd) * 0.12, pp.y + 0.72, pp.z - rz * 0.2 + Math.cos(hd) * 0.12);
    rodYaw.rotation.y = hd;
    pitch += (pitchGoal - pitch) * Math.min(1, dt * (phase === 'flying' ? 14 : 6));
    let jig = 0;
    if (phase === 'reel' && reel && !still) jig = Math.sin(t * 23) * 0.03 + (reel.fish - 0.5) * 0.12;
    rodPivot.rotation.x = Math.PI / 2 - pitch + jig;
    tip.getWorldPosition(tipW);

    if (!ui) return;
    // travelled away (the map, a teleport): put the rod down
    if (Math.hypot(pp.x - stand.x, pp.z - stand.z) > 8) { stop(); return; }
    const H = ui.hold;
    switch (phase) {
      case 'ready':
        if (H.pressed()) { phase = 'charge'; chargeT = 0; ui.charge.style.visibility = 'visible'; setStatus('……', '…'); }
        break;
      case 'charge': {
        chargeT += dt;
        // fills in 1.1 s, then swings back and forth (let go at the top for a long cast)
        const u = chargeT / 1.1;
        power = u <= 1 ? u : 1 - Math.abs(((u - 1) % 2) - 1) * 0.7;
        ui.chargeFill.style.width = `${Math.round(power * 100)}%`;
        pitchGoal = 0.9 + power * 1.4; // the rod swings back over the shoulder
        if (H.released() || !H.down) cast();
        break;
      }
      case 'flying': {
        flyT += dt / 0.75;
        const k = Math.min(1, flyT);
        tmp.lerpVectors(floatFrom, floatAt, k);
        tmp.y += Math.sin(k * Math.PI) * (1.2 + power * 1.5);
        floatMesh.position.copy(tmp);
        if (k >= 1) landed();
        H.pressed();
        break;
      }
      case 'wait': {
        waitLeft -= dt;
        const bob = still ? 0 : Math.sin(t * 2.1) * 0.012;
        let dip = 0;
        if (nibbles > 0 && waitLeft < nibbleAt + 0.25 && waitLeft > nibbleAt - 0.1) {
          dip = -0.03; // a nibble: twitch
        } else if (nibbles > 0 && waitLeft <= nibbleAt - 0.1) {
          nibbles--;
          rip.spawn(floatAt.x, floatAt.y, floatAt.z, 0.35, 0.4);
          snd.click(0.25);
          nibbleAt = waitLeft * 0.5;
        }
        // sparse ripples from fish under the leaves
        if (!still && rng() < dt * 0.25) {
          const a = rng() * Math.PI * 2, r = 1.5 + rng() * 5;
          tmp.set(floatAt.x + Math.cos(a) * r, 0, floatAt.z + Math.sin(a) * r);
          if (ctx.waterAt(tmp.x, tmp.z) !== null) rip.spawn(tmp.x, waterY(tmp.x, tmp.z), tmp.z, 0.4 + rng() * 0.4, 0.3);
        }
        floatMesh.position.set(floatAt.x, floatAt.y + 0.03 + bob + dip, floatAt.z);
        if (H.pressed()) {
          if (dip < 0) missed(true);
          else { toReady(); snd.whirr(0.3); }
          break;
        }
        if (waitLeft <= 0) {
          phase = 'bite';
          biteLeft = 1.25 * (fishFactor() > 1 ? 1.3 : 1);
          sinkT = 0;
          snd.bite();
          rip.spawn(floatAt.x, floatAt.y, floatAt.z, 0.8, 0.7);
          setStatus('咬钩了！快提竿！', 'A bite! Strike now!');
          setButton('提', tr(ctx, '', 'Strike!'), true);
        }
        break;
      }
      case 'bite': {
        biteLeft -= dt;
        sinkT += dt;
        floatMesh.position.set(floatAt.x + (still ? 0 : Math.sin(t * 30) * 0.02), floatAt.y - Math.min(0.12, sinkT * 0.5), floatAt.z);
        if (H.pressed()) { strike(); break; }
        if (biteLeft <= 0) missed(false);
        break;
      }
      case 'reel': {
        if (!reel || !hooked) break;
        const holding = H.down;
        H.pressed(); H.released();
        const res = stepReel(reel, Math.min(dt, 0.05), holding, hooked.species.fight, rng);
        // HUD
        const pct = (v: number) => `${(1 - v) * 100}%`;
        ui.zone.style.top = pct(reel.zone + reel.zoneW / 2);
        ui.zone.style.height = `${reel.zoneW * 100}%`;
        ui.zone.classList.toggle('is-on', inZone(reel));
        ui.fish.style.top = pct(reel.fish);
        ui.meter.style.height = `${reel.progress * 100}%`;
        ui.btn.classList.toggle('is-down', holding);
        // the float darts about with the fish; the reel clicks while you wind
        const sway = (reel.fish - 0.5) * 1.2;
        floatMesh.position.set(floatAt.x - dir.z * sway, floatAt.y - 0.05, floatAt.z + dir.x * sway);
        if (!still && rng() < dt * 3) rip.spawn(floatMesh.position.x, floatAt.y, floatMesh.position.z, 0.3, 0.35);
        clickAcc += dt * (holding ? 14 : 3);
        if (clickAcc > 1) { clickAcc = 0; snd.click(holding ? 0.5 : 0.2); }
        toneAcc += dt;
        if (toneAcc > 0.3 && inZone(reel)) { toneAcc = 0; snd.tension(reel.progress); }
        if (res === 'caught') { const c = hooked; hooked = null; caught(c); }
        else if (res === 'lost') lost();
        break;
      }
      case 'landing':
        H.pressed();
        break;
    }
    // the line: rod tip → float, sagging unless taut
    if (line.visible) {
      const end = floatMesh.position;
      const taut = phase === 'reel' || phase === 'bite' ? 0.05 : phase === 'flying' ? 0.1 : 0.45;
      for (let i = 0; i < LINE_N; i++) {
        const k = i / (LINE_N - 1);
        linePos[i * 3] = tipW.x + (end.x - tipW.x) * k;
        linePos[i * 3 + 1] = tipW.y + (end.y - tipW.y) * k - Math.sin(k * Math.PI) * taut * Math.hypot(end.x - tipW.x, end.z - tipW.z) * 0.12;
        linePos[i * 3 + 2] = tipW.z + (end.z - tipW.z) * k;
      }
      lineGeo.attributes.position.needsUpdate = true;
    }
  });
});

/** A little brushed fish (or a sandal) for the album. */
function paintFish(c: HTMLCanvasElement, color: string, id: string, caught: boolean): void {
  const g = c.getContext('2d');
  if (!g) return;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.globalAlpha = caught ? 1 : 0.55;
  g.fillStyle = color;
  g.strokeStyle = 'rgba(27,25,22,0.7)';
  g.lineWidth = 1.4;
  if (id === 'sandal') {
    g.beginPath(); g.ellipse(W / 2, H / 2, 30, 11, -0.15, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(W / 2 - 14, H / 2 - 6); g.quadraticCurveTo(W / 2, H / 2 + 8, W / 2 + 14, H / 2 - 8); g.stroke();
    return;
  }
  const L = id === 'kun' ? 40 : 30, T = id === 'dace' ? 7 : id === 'kun' ? 13 : 10;
  const cx = W / 2 - 4, cy = H / 2;
  g.beginPath();
  g.moveTo(cx - L, cy);
  g.quadraticCurveTo(cx - L * 0.2, cy - T * 1.5, cx + L * 0.7, cy - 1);
  g.lineTo(cx + L + 6, cy - T);
  g.lineTo(cx + L + 3, cy);
  g.lineTo(cx + L + 6, cy + T);
  g.lineTo(cx + L * 0.7, cy + 1);
  g.quadraticCurveTo(cx - L * 0.2, cy + T * 1.4, cx - L, cy);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = caught ? '#1b1916' : 'rgba(27,25,22,0.4)';
  g.beginPath(); g.arc(cx - L * 0.72, cy - 2, 1.8, 0, Math.PI * 2); g.fill();
  if (id === 'dragon') { g.strokeStyle = '#1b1916'; g.beginPath(); g.moveTo(cx - L + 2, cy + 2); g.quadraticCurveTo(cx - L - 8, cy + 8, cx - L - 10, cy + 2); g.stroke(); }
}
