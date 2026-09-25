// 家园 · life at the homestead: the pets (and the one that walks with you), the people you hire and
// name, a companion who drops by, the pet seller on market days, and the household ledger 家园簿 at
// the gate. Everything follows app/home.ts live: adopt, hire, rename or send away, and the world
// changes at once.
import type * as T from 'three';
import type { WorldFeature, WorldCtx } from '../../../types';
import { canvasTexture, feature, inked, loadBrush, reducedMotion, timeChoice, BRUSH_FONT, type Bag } from '../../kit';
import { merge, part } from '../../geo';
import { home, petPet } from '../../../../../app/home';
import { today } from '../../../../../app/store';
import { HOME_PLOT } from '../../../map';
import { Bubble, Fx } from './fx';
import { HomePets } from './pets';
import { Follower } from './follower';
import { People, Seller, Visitor } from './people';
import { adopt, arrivals, dismiss, feed, hire, rehome, renamePetFlow, renameResidentFlow, toggleFollow } from './actions';
import { book, saveBook, tidyBook } from './book';
import { closeAllCards, openLedger } from './card';
import { closeSound } from './sound';
import { settleDecay, stewardNews } from './logic';
import { inPlot } from './plot';

/** Settle the days apart: affection fades a little for every day a pet went unfed. Once a day. */
function settle(): void {
  const b = book();
  const t = today.value;
  if (b.marker === t) return;
  const before = home.value.pets;
  const after = settleDecay(before, b.marker, t);
  for (let i = 0; i < before.length; i++) {
    const loss = before[i].love - after[i].love;
    if (loss > 0) petPet(before[i].uid, -loss);
  }
  saveBook((x) => { x.marker = t; });
}

/** The ledger board by the gate: two posts, a little roof, a paper sheet brushed 「家园簿」. */
function ledgerBoard(bag: Bag, ctx: WorldCtx, group: T.Group, at: { x: number; z: number }): T.Vector3 {
  const { THREE } = ctx;
  const y = ctx.groundY(at.x, at.z);
  const wood = '#7a4f34';
  const board = inked(ctx, merge(THREE, [
    part(THREE, new THREE.CylinderGeometry(0.045, 0.05, 1.55, 6), wood, { p: [-0.42, 0.77, 0] }),
    part(THREE, new THREE.CylinderGeometry(0.045, 0.05, 1.55, 6), wood, { p: [0.42, 0.77, 0] }),
    part(THREE, new THREE.BoxGeometry(0.92, 0.62, 0.05), '#9a6a44', { p: [0, 1.08, 0] }),
    part(THREE, new THREE.BoxGeometry(1.12, 0.05, 0.34), '#3d5f7a', { p: [0, 1.5, 0], r: [0, 0, 0] }),
    part(THREE, new THREE.BoxGeometry(1.12, 0.05, 0.24), '#35546d', { p: [0, 1.56, 0] }),
    part(THREE, new THREE.BoxGeometry(0.2, 0.12, 0.03), '#b93a2b', { p: [0.3, 0.72, 0.02] }),
  ]), { width: 0.012 });
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.52),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(THREE, 256, 168, (g, w, h) => {
        g.fillStyle = '#f4ead4'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(35,30,25,0.35)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#231e19'; g.font = `84px ${BRUSH_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('家园簿', w / 2, h / 2 + 4);
        g.fillStyle = '#b93a2b'; g.fillRect(w - 40, h - 44, 24, 24);
      }),
    }),
  );
  face.position.set(0, 1.08, 0.03);
  board.add(face);
  board.position.set(at.x, y, at.z);
  // face the path (east, toward whoever comes up to the gate)
  board.rotation.y = Math.PI / 2;
  bag.add(board, group);
  bag.onDispose(ctx.addCollider({ x: at.x, z: at.z, r: 0.45, h: 1.6 }));
  return new THREE.Vector3(at.x + 0.9, y, at.z);
}

export const homeLife = feature('home-life', async (bag, ctx) => {
  await loadBrush('家园簿');
  if (bag.disposed) return;
  settle();
  tidyBook(new Set(home.value.pets.map((p) => p.uid)));
  const group = ctx.regionGroup('home');
  const still = reducedMotion();
  const fx = new Fx(bag, group);
  const bubble = new Bubble(bag, group);
  const pets = new HomePets(bag, ctx, group, fx, bubble);
  const follower = new Follower(bag, ctx, (uid) => pets.where(uid));

  // the hour the homestead lives by: the real clock (read once a second), or the one the visitor chose
  let hourNow = ctx.env.hour;
  const clock = () => { if (timeChoice(ctx) === 'now') { const d = new Date(); hourNow = d.getHours() + d.getMinutes() / 60; } else hourNow = ctx.env.hour; };
  clock();
  const hour = () => hourNow;
  const news = () => stewardNews(today.value, home.value.pets, home.value.residents.filter((m) => m.role !== 'steward'), home.value.name);
  const people = new People(bag, ctx, group, fx, hour, news);
  const visitor = new Visitor(bag, ctx, group, fx, hour);
  const seller = new Seller(bag, ctx, group, hour);

  const gate = HOME_PLOT.gate;
  const boardFront = ledgerBoard(bag, ctx, group, { x: gate.x + 1.5, z: gate.z - 2.7 });
  const api = {
    feed: (uid: string) => { feed(ctx, uid); },
    follow: (uid: string) => toggleFollow(ctx, uid),
    renamePet: (uid: string) => renamePetFlow(ctx, uid),
    rehome: (uid: string) => rehome(ctx, uid),
    renameResident: (uid: string) => renameResidentFlow(ctx, uid),
    dismiss: (uid: string) => dismiss(ctx, uid),
    adopt: (species: Parameters<typeof adopt>[1]) => adopt(ctx, species, undefined, { x: gate.x - 1.2, z: gate.z - 1.5 }),
    hire: (role: Parameters<typeof hire>[1]) => hire(ctx, role),
    hour,
  };
  bag.interact({
    id: 'home-ledger', position: boardFront, radius: 1.8,
    labelZh: '家园簿 · 宠物与家人', labelEn: 'Household Ledger · pets & people', actionZh: '翻开', actionEn: 'Open',
    act: () => { openLedger(ctx, api); },
  });

  // follow home.value: the follower first (it takes over from where the pet stood at home)
  const sync = () => {
    if (bag.disposed) return;
    const fu = follower.uid;
    const before = fu ? follower.where() : null;
    follower.sync();
    // a pet sent home while you are at home stays where it stood
    if (fu && follower.uid !== fu && before && inPlot(before.x, before.z)) arrivals.set(fu, before);
    pets.sync();
    people.sync();
  };
  sync();
  let pending = false;
  bag.onDispose(home.subscribe(() => { if (!pending) { pending = true; queueMicrotask(() => { pending = false; sync(); }); } }));
  visitor.arrive();
  seller.arrive();
  bag.onDispose(() => { closeAllCards(); pets.dispose(); people.dispose(); visitor.dispose(); seller.dispose(); follower.dispose(); closeSound(); });

  if (import.meta.env.DEV) (window as unknown as { __homeLife?: unknown }).__homeLife = { pets, people, follower, visitor, seller };
  const wp = new ctx.THREE.Vector3();
  let tick = 0;
  const env = { px: 0, pz: 0, py: 0, inside: false, night: false, still, t: 0 };
  bag.frame((dt, t) => {
    tick += dt;
    if (tick > 1) { tick = 0; clock(); }
    const P = ctx.player.position;
    follower.update(dt, t, still);
    if (Math.hypot(P.x - HOME_PLOT.x, P.z - HOME_PLOT.z) > HOME_PLOT.size + 30) return; // far away: nobody to see
    env.px = P.x; env.pz = P.z; env.py = P.y;
    env.inside = inPlot(P.x, P.z, -0.3);
    env.night = ctx.sky.isNight();
    env.t = t;
    pets.update(dt, t, env);
    people.update(dt, t, still, P.x, P.z, env.night);
    visitor.update(dt, t, still);
    fx.update(dt);
    bubble.update(dt, wp);
  });
});

export const HOME_LIFE_FEATURES: WorldFeature[] = [homeLife];
