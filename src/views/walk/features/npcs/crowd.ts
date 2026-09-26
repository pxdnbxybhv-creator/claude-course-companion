// The crowd: people going about their day in every place — villagers strolling the lanes and over the
// bridge, vendors calling at the stalls, tea drinkers, washerwomen at the river steps, children chasing
// round the square, a boatman poling down the river, fishermen and a lotus picker on the lake, monks
// sweeping and one tapping a wooden fish, pilgrims on the temple stairs, scholars under the plum
// trees, farmers by the homestead path. After dark the painting keeps its life: a night market (夜市)
// of snack stalls and lantern viewers in the market street until ten (midnight on a festival night,
// when children run round the square with rabbit lanterns), couples strolling with lanterns round the
// square, on the lake causeway and the plum path, a lantern boat on the lotus pond, a lantern walker in
// the bamboo, the farmer going home with his lantern, the watchman with his clapper (「天干物燥，小心
// 火烛」) and the tea drinkers.
//
// Each place's crowd is one instanced figure (crowd-geo.ts) plus its outline, blob shadows and lantern
// halos — a handful of draws. They glance at you, some greet you, bow to 关公, stare at 嫦娥, and the
// children run after the cat; they gather to listen when someone plays ('banmu:music'), bow when a
// lord rides by ('banmu:bow') and sniff the air when flowers burst open ('banmu:bloom').
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { REGION, type RegionId, type XZ } from '../../map';
import type { CharacterId } from '../../../../data/characters';
import { Bag, dayRng, feature, glowTexture, outlineMat, propMat, reducedMotion, tr } from '../kit';
import { merge, part } from '../geo';
import { riverZ } from '../../regions/water-kit';
import { walkableNear } from '../minigames/cat';
import { BACK, CAPE, HAND, HAT, LANTERN_AT, crowdGeometry, crowdMaterials, packColor } from './crowd-geo';
import { Bubbles, type Speaker } from './bubbles';
import { CALLS, CHASE, FEST_CALLS, HELLO, HELLO_NIGHT, REACT, type CrowdRole } from './lines';
import { LANTERN_NIGHTS, forCompanion, onDuty, pingPong, type Line, type Shift } from './logic';
import { onSkillEvent, type SkillEvent } from './events';
import { crowdKeeps } from '../../world/quality';

// ───────────────────────────── who is where ─────────────────────────────

type Act = 'idle' | 'vend' | 'sweep' | 'wash' | 'woodfish' | 'admire' | 'drink' | 'pray' | 'hoe' | 'chat' | 'pole' | 'fish' | 'read' | 'pick';

interface Look {
  robe: string; trim: string; hair?: string; hat?: string;
  hatKind?: number; hand?: number; back?: number; beard?: boolean; cape?: number; scale?: number;
}

interface Spec {
  role: CrowdRole;
  shift: Shift;
  look: Look;
  act?: Act;
  /** Standing (or sitting) still here, facing heading (radians, 0 = +z). */
  at?: { x: number; z: number; h: number };
  /** Walking to and fro along this line (or round it, when loop). */
  path?: XZ[];
  loop?: boolean;
  speed?: number;
  /** Where along the path to start (m). */
  offset?: number;
  /** Children running round a ring. */
  ring?: { x: number; z: number; r: number };
  /** In a boat: along a river line (to and fro), or anchored at `at`. */
  boat?: 'river' | 'anchored' | 'circle';
  sit?: boolean;
  lift?: number;
  /** Carries a lit lantern at night. */
  lantern?: boolean;
  /** Face this point (for chatting, listening). */
  face?: XZ;
  /** Walks beside the walker listed just before (a couple, friends): same shift, no way of their own. */
  beside?: boolean;
}

const SKIN = '#f0d4b4';
const HAIR = '#26211d', GREY = '#cfc8bb';
// warm, lively cloth: indigo-teal 花青, ochre 赭石, rouge 胭脂, gamboge 藤黄, jade, apricot, vermilion
const C = {
  indigo: '#4d6b8a', teal: '#3f7a7a', ochre: '#9a6a3c', rouge: '#c2566a', gamboge: '#dcae4a', jade: '#7fa27a', apricot: '#d98c5f',
  vermilion: '#c24a36', undyed: '#e6dcc4', sky: '#7ea3bd', plum: '#9c4a6a', olive: '#7d8455', brown: '#6d4a33', white: '#eee9dd',
  dark: '#2f3b45', ink: '#2b2622', maroon: '#7a2e22', straw: '#c9ad72', monk: '#b8753c', grey: '#8d8a80',
};

const man = (robe: string, trim = C.dark, o: Partial<Look> = {}): Look => ({ robe, trim, hair: HAIR, hat: C.dark, hatKind: HAT.cap, ...o });
const woman = (robe: string, trim = C.maroon, o: Partial<Look> = {}): Look => ({ robe, trim, hair: HAIR, hat: C.gamboge, hatKind: HAT.bun, ...o });
const child = (robe: string, o: Partial<Look> = {}): Look => ({ robe, trim: C.maroon, hair: HAIR, hat: C.vermilion, hatKind: HAT.buns, scale: 0.72, ...o });
const monkLook = (o: Partial<Look> = {}): Look => ({ robe: C.monk, trim: '#6a3f22', hair: SKIN, hat: SKIN, hatKind: HAT.none, ...o });
const scholarLook = (robe: string, o: Partial<Look> = {}): Look => ({ robe, trim: '#3d5a73', hair: HAIR, hat: C.ink, hatKind: HAT.scholar, ...o });

/** A line through the town's river, from x0 to x1 (the boatman's water). */
function riverLine(x0: number, x1: number, step = 5): XZ[] {
  const out: XZ[] = [];
  for (let x = x0; x <= x1; x += step) out.push({ x, z: riverZ(x).z });
  return out;
}

function crowdOf(region: RegionId): Spec[] {
  switch (region) {
    case 'village': {
      const S: Spec[] = [
        // vendors behind the market stalls, calling across the street
        ...[-1, 5.5, 14.5, 21, 27.5].map((x, i): Spec => ({ role: 'vendor', shift: 'day', act: 'vend', at: { x: x + 0.3, z: 100.4, h: Math.PI }, look: [man(C.ochre, C.dark, { cape: CAPE.apron }), woman(C.apricot), man(C.indigo, C.dark, { hatKind: HAT.none }), woman(C.jade, C.maroon, { hatKind: HAT.scarf, hat: C.indigo }), man(C.brown, C.dark, { hatKind: HAT.bamboo, hat: C.straw })][i] })),
        { role: 'vendor', shift: 'day', act: 'vend', at: { x: -1.2, z: 92.1, h: 0 }, look: woman(C.rouge, C.dark, { hatKind: HAT.scarf, hat: C.teal }) },
        // tea drinkers at the teahouse tables (they stay into the night)
        { role: 'tea', shift: 'always', act: 'drink', sit: true, lift: 0.14, at: { x: 13.35, z: 84.3, h: 0 }, look: man(C.grey, C.dark, { hair: GREY, beard: true, hand: HAND.cup }) },
        { role: 'tea', shift: 'always', act: 'drink', sit: true, lift: 0.14, at: { x: 14.05, z: 85.95, h: Math.PI }, look: man(C.teal, C.maroon, { hand: HAND.cup }) },
        { role: 'tea', shift: 'day', act: 'drink', sit: true, lift: 0.14, at: { x: 13.6, z: 91.75, h: Math.PI }, look: scholarLook(C.white, { hand: HAND.fan }) },
        // washerwomen on the river steps in the morning; neighbours chatting by the well later on
        { role: 'washer', shift: 'morning', act: 'wash', sit: true, at: { x: -22.2, z: 72.3, h: Math.PI }, look: woman(C.indigo, C.maroon, { hatKind: HAT.scarf, hat: C.undyed, hand: HAND.paddle }) },
        { role: 'washer', shift: 'morning', act: 'wash', sit: true, at: { x: -20.6, z: 71.8, h: Math.PI + 0.3 }, look: woman(C.rouge, C.dark, { hatKind: HAT.scarf, hat: C.indigo, hand: HAND.paddle }) },
        { role: 'villager', shift: 'afternoon', act: 'chat', at: { x: -9, z: 88.2, h: 0 }, face: { x: -7.4, z: 87.3 }, look: woman(C.gamboge, C.maroon, { back: BACK.basket }) },
        { role: 'villager', shift: 'afternoon', act: 'chat', at: { x: -7.4, z: 87.3, h: 0 }, face: { x: -9, z: 88.2 }, look: woman(C.plum, C.dark, { hatKind: HAT.scarf, hat: C.rouge }) },
        // children playing tag in the square
        ...[0, 1, 2].map((i): Spec => ({ role: 'child', shift: 'day', ring: { x: -2.5, z: 87, r: 2.4 + i * 0.35 }, offset: i * 2.1, speed: 2.4 + i * 0.25, look: child([C.vermilion, C.gamboge, C.sky][i], i === 2 ? { hatKind: HAT.bun } : {}) })),
        // strollers: round the square, along the market street, the south quay, over the bridge, the back lane, the east quay
        { role: 'villager', shift: 'day', loop: true, path: [{ x: -15, z: 84 }, { x: -3, z: 83.5 }, { x: 9, z: 86.5 }, { x: 9.5, z: 93.8 }, { x: -4, z: 95.5 }, { x: -15, z: 92 }], speed: 1.0, look: man(C.indigo, C.dark, { back: BACK.carry }) },
        { role: 'villager', shift: 'day', loop: true, path: [{ x: -15, z: 84 }, { x: -3, z: 83.5 }, { x: 9, z: 86.5 }, { x: 9.5, z: 93.8 }, { x: -4, z: 95.5 }, { x: -15, z: 92 }], offset: 30, speed: 0.85, look: woman(C.rouge, C.maroon, { back: BACK.basket }) },
        { role: 'villager', shift: 'day', path: [{ x: -6, z: 96.8 }, { x: 34, z: 96.2 }], speed: 1.05, look: woman(C.jade, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge, back: BACK.basket }) },
        { role: 'villager', shift: 'day', path: [{ x: -6, z: 96.4 }, { x: 34, z: 95.8 }], offset: 28, speed: 0.9, look: man(C.ochre, C.dark, { hatKind: HAT.bamboo, hat: C.straw, back: BACK.carry }) },
        { role: 'villager', shift: 'day', path: [{ x: -34, z: 76.8 }, { x: -24, z: 76.4 }, { x: -14, z: 75 }, { x: -5, z: 73.4 }], speed: 0.95, look: scholarLook(C.sky, { hand: HAND.fan }) },
        { role: 'villager', shift: 'day', path: [{ x: 0, z: 81 }, { x: 0, z: 71.5 }, { x: -1.1, z: 66 }, { x: -1.5, z: 61.5 }, { x: -2.5, z: 58.5 }, { x: -2.2, z: 54 }], speed: 0.9, look: man(C.olive, C.dark, { back: BACK.bundle, hatKind: HAT.bamboo, hat: C.straw }) },
        { role: 'villager', shift: 'day', path: [{ x: -38, z: 88 }, { x: -38, z: 98 }, { x: -27, z: 98.5 }], speed: 0.8, look: man(C.grey, C.dark, { hair: GREY, beard: true, hatKind: HAT.none }) },
        { role: 'villager', shift: 'day', path: [{ x: 7, z: 70.4 }, { x: 20, z: 70 }, { x: 33, z: 69.3 }], speed: 1.0, look: woman(C.apricot, C.dark, { hatKind: HAT.scarf, hat: C.jade }) },
        // the night: the watchman's round, and two lanterns out walking
        { role: 'watchman', shift: 'night', loop: true, path: [{ x: -14, z: 84.5 }, { x: 8, z: 85 }, { x: 8.5, z: 95.5 }, { x: -8, z: 96.5 }, { x: -16, z: 93 }], speed: 0.75, look: man(C.dark, C.maroon, { hand: HAND.clapper, back: BACK.gong, hatKind: HAT.cap, hat: C.ink }) },
        { role: 'lantern', shift: 'night', path: [{ x: -34, z: 76.8 }, { x: -24, z: 76.4 }, { x: -14, z: 75 }, { x: -5, z: 73.4 }], offset: 10, speed: 0.7, lantern: true, look: woman(C.rouge, C.maroon, { hand: HAND.lantern }) },
        { role: 'lantern', shift: 'night', path: [{ x: -6, z: 96.8 }, { x: 34, z: 96.2 }], offset: 20, speed: 0.7, lantern: true, look: man(C.indigo, C.dark, { hand: HAND.lantern }) },
        // a couple strolling round the square with a lantern, all night
        { role: 'lantern', shift: 'night', loop: true, path: [{ x: -15, z: 84 }, { x: -3, z: 83.5 }, { x: 9, z: 86.5 }, { x: 9.5, z: 93.8 }, { x: -4, z: 95.5 }, { x: -15, z: 92 }], offset: 12, speed: 0.55, lantern: true, look: woman(C.rouge, C.maroon, { hand: HAND.lantern, hatKind: HAT.bun, hat: C.gamboge }) },
        { role: 'lantern', shift: 'night', beside: true, look: scholarLook(C.sky, { hand: HAND.fan }) },
        // the night market (夜市): snack stalls, and people come out to see the lanterns
        ...[-1, 14.5, 27.5].map((x, i): Spec => ({ role: 'snack', shift: 'evening', act: 'vend', at: { x: x + 0.3, z: 100.4, h: Math.PI }, look: [man(C.white, C.dark, { cape: CAPE.apron, hat: C.ink }), woman(C.rouge, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge, cape: CAPE.apron }), man(C.brown, C.dark, { hair: GREY, beard: true, hatKind: HAT.bamboo, hat: C.straw })][i] })),
        { role: 'lantern', shift: 'evening', act: 'admire', lantern: true, at: { x: 3, z: 97.4, h: 0.35 }, look: woman(C.gamboge, C.maroon, { hand: HAND.lantern }) },
        { role: 'lantern', shift: 'evening', act: 'admire', lantern: true, at: { x: 3.8, z: 97.1, h: 0.1 }, look: child(C.vermilion, { hand: HAND.lantern }) },
        { role: 'lantern', shift: 'evening', act: 'admire', at: { x: 10.5, z: 97.6, h: -0.25 }, look: scholarLook(C.white, { hand: HAND.fan, beard: true }) },
        { role: 'lantern', shift: 'evening', act: 'chat', at: { x: 19.5, z: 97.2, h: 0 }, face: { x: 20.9, z: 97.6 }, look: man(C.teal, C.dark, { hatKind: HAT.cap, hat: C.ink }) },
        { role: 'lantern', shift: 'evening', act: 'chat', lantern: true, at: { x: 20.9, z: 97.6, h: 0 }, face: { x: 19.5, z: 97.2 }, look: woman(C.plum, C.dark, { hand: HAND.lantern, hatKind: HAT.scarf, hat: C.rouge }) },
        { role: 'lantern', shift: 'evening', act: 'chat', at: { x: -4.2, z: 89.8, h: 0 }, face: { x: -2.8, z: 90.6 }, look: woman(C.jade, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge }) },
        { role: 'lantern', shift: 'evening', act: 'chat', lantern: true, at: { x: -2.8, z: 90.6, h: 0 }, face: { x: -4.2, z: 89.8 }, look: man(C.ochre, C.dark, { hand: HAND.lantern, hatKind: HAT.bamboo, hat: C.straw }) },
        // on a festival night the children run round the square with rabbit lanterns
        ...[0, 1].map((i): Spec => ({ role: 'child', shift: 'fest', ring: { x: -2.5, z: 86.6, r: 2.5 + i * 0.5 }, offset: i * 3.3, speed: 1.3 + i * 0.2, lantern: true, look: child([C.rouge, C.gamboge][i], { hand: HAND.lantern }) })),
        // the boatman poling down the river (a lantern on his boat at night)
        { role: 'boatman', shift: 'always', boat: 'river', act: 'pole', path: riverLine(-44, 34), speed: 0.9, look: man(C.dark, C.ink, { hatKind: HAT.bamboo, hat: C.straw, hand: HAND.pole, cape: CAPE.straw }) },
      ];
      return S;
    }
    case 'lake':
      return [
        { role: 'fisher', shift: 'day', boat: 'anchored', act: 'fish', sit: true, at: { x: 76, z: 8, h: 2.2 }, look: man(C.grey, C.dark, { hair: GREY, beard: true, hatKind: HAT.bamboo, hat: C.straw, hand: HAND.rod, cape: CAPE.straw }) },
        { role: 'fisher', shift: 'always', boat: 'anchored', act: 'fish', sit: true, lantern: true, at: { x: 106, z: 25, h: -0.8 }, look: man(C.olive, C.dark, { hatKind: HAT.bamboo, hat: C.straw, hand: HAND.rod }) },
        { role: 'fisher', shift: 'day', boat: 'circle', act: 'pick', sit: true, ring: { x: 84, z: 25, r: 4 }, speed: 0.35, look: woman(C.rouge, C.maroon, { hatKind: HAT.bamboo, hat: C.straw, back: BACK.basket }) },
        { role: 'villager', shift: 'day', path: [{ x: 73, z: 40.5 }, { x: 90, z: 40.5 }, { x: 108, z: 40 }], speed: 0.8, look: scholarLook(C.white, { hand: HAND.fan }) },
        { role: 'villager', shift: 'day', beside: true, look: woman(C.plum, C.dark, {}) },
        // by night: a couple with a lantern on the causeway, a lantern boat among the lotus
        { role: 'lantern', shift: 'night', path: [{ x: 73, z: 40.5 }, { x: 90, z: 40.5 }, { x: 108, z: 40 }], offset: 6, speed: 0.5, lantern: true, look: woman(C.rouge, C.maroon, { hand: HAND.lantern }) },
        { role: 'lantern', shift: 'night', beside: true, look: scholarLook(C.white, { hand: HAND.fan }) },
        { role: 'lantern', shift: 'evening', boat: 'circle', sit: true, ring: { x: 84, z: 25, r: 4 }, speed: 0.25, lantern: true, look: woman(C.gamboge, C.maroon, { hatKind: HAT.bun }) },
      ];
    case 'mountain':
      return [
        { role: 'monk', shift: 'dawn', act: 'sweep', at: { x: 46, z: -104, h: 1.9 }, look: monkLook({ hand: HAND.broom }) },
        { role: 'monk', shift: 'day', act: 'sweep', at: { x: 33, z: -106, h: -1.2 }, look: monkLook({ hand: HAND.broom, robe: '#a8663a' }) },
        { role: 'woodfish', shift: 'always', act: 'woodfish', at: { x: 40, z: -109.5, h: 0 }, look: monkLook({ hand: HAND.mallet, back: BACK.woodfish, robe: '#b0703a', cape: CAPE.none }) },
        { role: 'pilgrim', shift: 'day', path: [{ x: 29, z: -88 }, { x: 30, z: -95 }, { x: 33, z: -101 }, { x: 39, z: -106 }], speed: 0.6, look: woman(C.indigo, C.maroon, { hatKind: HAT.scarf, hat: C.rouge, back: BACK.basket }) },
        { role: 'pilgrim', shift: 'day', path: [{ x: 29, z: -88 }, { x: 30, z: -95 }, { x: 33, z: -101 }, { x: 39, z: -106 }], offset: 9, speed: 0.55, look: man(C.grey, C.dark, { hair: GREY, beard: true, back: BACK.bundle, hatKind: HAT.none }) },
        { role: 'pilgrim', shift: 'day', act: 'pray', at: { x: 40, z: -101.5, h: Math.PI }, look: woman(C.apricot, C.maroon, {}) },
        { role: 'monk', shift: 'night', path: [{ x: 36.2, z: -104 }, { x: 43.4, z: -104 }], speed: 0.5, lantern: true, look: monkLook({ hand: HAND.lantern }) },
        { role: 'pilgrim', shift: 'evening', path: [{ x: 29, z: -88 }, { x: 30, z: -95 }, { x: 33, z: -101 }, { x: 39, z: -106 }], offset: 4, speed: 0.45, lantern: true, look: woman(C.plum, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge, hand: HAND.lantern }) },
      ];
    case 'plum':
      return [
        { role: 'scholar', shift: 'day', act: 'admire', at: { x: -64, z: -63, h: -1.4 }, look: scholarLook(C.white, { hand: HAND.fan, beard: true }) },
        { role: 'scholar', shift: 'day', act: 'read', at: { x: -60, z: -57.5, h: 2.6 }, look: scholarLook(C.sky, { back: BACK.book }) },
        { role: 'scholar', shift: 'day', path: [{ x: -80, z: -50 }, { x: -77, z: -58 }, { x: -70, z: -62 }, { x: -64, z: -66 }], speed: 0.7, look: scholarLook(C.jade, { hand: HAND.fan }) },
        { role: 'scholar', shift: 'night', act: 'admire', lantern: true, at: { x: -68, z: -70, h: 0.6 }, look: scholarLook(C.white, { hand: HAND.lantern }) },
        // a couple come up the path with a lantern to see the plum by moonlight
        { role: 'lantern', shift: 'night', path: [{ x: -80, z: -50 }, { x: -77, z: -58 }, { x: -70, z: -62 }, { x: -64, z: -66 }], offset: 3, speed: 0.45, lantern: true, look: woman(C.rouge, C.maroon, { hand: HAND.lantern, hatKind: HAT.bun, hat: C.gamboge }) },
        { role: 'lantern', shift: 'night', beside: true, look: scholarLook(C.jade, { hand: HAND.fan }) },
      ];
    case 'bamboo':
      return [
        { role: 'villager', shift: 'day', path: [{ x: -57, z: 30 }, { x: -66, z: 29 }, { x: -78, z: 27.5 }], speed: 0.75, look: scholarLook(C.teal, { hand: HAND.fan }) },
        { role: 'farmer', shift: 'day', path: [{ x: -56, z: 29.4 }, { x: -64, z: 28.6 }, { x: -73, z: 28.2 }], offset: 8, speed: 0.8, look: man(C.ochre, C.dark, { hatKind: HAT.bamboo, hat: C.straw, back: BACK.carry }) },
        // after dark: a lantern going slowly through the grove, and a woodcutter late home
        { role: 'lantern', shift: 'night', path: [{ x: -57, z: 30 }, { x: -66, z: 29 }, { x: -78, z: 27.5 }], offset: 5, speed: 0.5, lantern: true, look: scholarLook(C.teal, { hand: HAND.lantern }) },
        { role: 'farmer', shift: 'evening', path: [{ x: -56, z: 29.4 }, { x: -64, z: 28.6 }, { x: -73, z: 28.2 }], offset: 14, speed: 0.6, lantern: true, look: man(C.brown, C.dark, { hatKind: HAT.bamboo, hat: C.straw, back: BACK.bundle, hand: HAND.lantern }) },
      ];
    case 'home':
      return [
        { role: 'farmer', shift: 'dawn', act: 'hoe', at: { x: -29, z: -34, h: -1.3 }, look: man(C.indigo, C.dark, { hatKind: HAT.bamboo, hat: C.straw, hand: HAND.hoe }) },
        { role: 'farmer', shift: 'day', path: [{ x: -33, z: -6 }, { x: -35, z: -16 }, { x: -36.5, z: -21 }], speed: 0.8, look: woman(C.jade, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge, back: BACK.carry }) },
        // the farmer and his wife walking home with a lantern
        { role: 'farmer', shift: 'evening', path: [{ x: -33, z: -6 }, { x: -35, z: -16 }, { x: -36.5, z: -21 }], offset: 3, speed: 0.55, lantern: true, look: man(C.indigo, C.dark, { hatKind: HAT.bamboo, hat: C.straw, hand: HAND.lantern }) },
        { role: 'farmer', shift: 'evening', beside: true, look: woman(C.jade, C.maroon, { hatKind: HAT.scarf, hat: C.gamboge, back: BACK.basket }) },
      ];
    default:
      return [];
  }
}

const REGIONS_WITH_CROWDS: RegionId[] = ['village', 'lake', 'mountain', 'plum', 'bamboo', 'home'];

// ───────────────────────────── the living ─────────────────────────────

type React = 'none' | 'bow' | 'listen' | 'sniff' | 'stare' | 'wave' | 'chase';

interface Person extends Speaker {
  spec: Spec;
  i: number;
  h: number;
  active: boolean;
  /** Along the path (m). */
  d: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
  nextDwell: number;
  amp: number;
  ph: number;
  yaw: number;
  seed: number;
  react: React;
  reactT: number;
  reactDelay: number;
  src: XZ;
  goal: XZ | null;
  greeted: boolean;
  bowedHere: boolean;
  nextBark: number;
  moved: boolean;
  child: boolean;
  scale: number;
  boatI: number;
  /** Off their way (drawn to music, after the cat): walk back to it before going on. */
  away: boolean;
  /** Put on their way since they last came out (the first placement may jump: they were hidden). */
  placed: boolean;
  /** Seconds a walk back has been blocked. */
  stuck: number;
  /** Whom they walk beside (spec.beside). */
  lead: Person | null;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lineText = (ctx: WorldCtx, l: Line) => tr(ctx, l.zh, l.en);

export const crowd = feature('npc-crowd', (bag, ctx) => {
  const still = reducedMotion();
  const bubbles = new Bubbles(bag, 3);
  // a lantern festival tonight: more stalls, children with lanterns, festival calls
  const festKey = ctx.env.festivals.find((f) => LANTERN_NIGHTS.includes(f)) ?? null;
  const festLines = festKey ? FEST_CALLS[festKey] ?? null : null;
  const crowds = REGIONS_WITH_CROWDS.map((r) => buildCrowd(bag, ctx, r, bubbles, still, festLines)).filter((c): c is CrowdRuntime => !!c);
  bag.onDispose(onSkillEvent((e) => { for (const c of crowds) c.event(e); }));
  // who is about depends on the night (the visitor may switch it) — look again now and then
  let check = 0;
  bag.frame((dt, t) => {
    const now = performance.now();
    if (now >= check) {
      check = now + 1500;
      const night = safeNight(ctx);
      const hour = ctx.env.hour ?? ctx.env.date.getHours();
      for (const c of crowds) c.roster(hour, night, !!festKey);
    }
    for (const c of crowds) c.step(dt, t);
  });
  if (import.meta.env.DEV) {
    const w = window as unknown as { __crowd?: unknown };
    const dev = { info: () => crowds.map((c) => c.info()), people: () => crowds.flatMap((c) => c.people()), bubbles };
    w.__crowd = dev;
    // don't keep a disposed crowd reachable after the walk ends
    bag.onDispose(() => { if (w.__crowd === dev) delete w.__crowd; });
  }
});

/** Sample a way every `step` m against the ground: how many samples are blocked, and where (DEV checks). */
export function blockedAlong(ctx: WorldCtx, pts: readonly XZ[], step = 0.8, closed = false): { bad: number; n: number; where: string[] } {
  let bad = 0, n = 0;
  const where: string[] = [];
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    for (let s = 0; s <= L; s += step) {
      n++;
      const x = a.x + ((b.x - a.x) * s) / L, z = a.z + ((b.z - a.z) * s) / L;
      if (!ctx.isWalkable(x, z)) { bad++; if (where.length < 6) where.push(`${x.toFixed(1)},${z.toFixed(1)}`); }
    }
  }
  return { bad, n, where };
}

function safeNight(ctx: WorldCtx): boolean {
  try { return ctx.sky.isNight(); } catch { return false; }
}

interface CrowdRuntime {
  roster(hour: number, night: boolean, fest: boolean): void;
  step(dt: number, t: number): void;
  event(e: SkillEvent): void;
  info(): { region: RegionId; people: number; active: number };
  /** DEV: who is who, and where. */
  people(): { region: RegionId; i: number; role: CrowdRole; shift: Shift; active: boolean; x: number; z: number; away: boolean }[];
}

function buildCrowd(bag: Bag, ctx: WorldCtx, region: RegionId, bubbles: Bubbles, still: boolean, festLines: Line[] | null): CrowdRuntime | null {
  const { THREE } = ctx;
  const specs = crowdOf(region);
  if (!specs.length) return null;
  const group = ctx.regionGroup(region);
  const rng = dayRng(ctx, `crowd:${region}`);

  // ── at a lower picture quality (低) a fixed share of the strollers, children and lantern walkers
  //    stay home — never the people a place is made of (crowdKeeps in world/quality.ts)
  const share = Math.min(1, ctx.quality?.density ?? 1);
  // ── validate the ways: every walked line on open ground (nudged, or the walker stays home)
  const people: Person[] = [];
  let prev: Person | null = null;
  for (let si = 0; si < specs.length; si++) {
    const spec = specs[si];
    // a companion walks beside whoever was listed before (and stays home with them)
    const lead = spec.beside ? prev : null;
    prev = null;
    if (spec.beside && (!lead || !lead.spec.path)) continue;
    if (!spec.beside && !crowdKeeps(share, si, spec.role, region)) continue;
    if (spec.path && !spec.boat) {
      const pts = spec.path.map((p) => walkableNear(ctx, p.x, p.z, 2.5));
      const { bad, n, where } = blockedAlong(ctx, pts, 0.8, !!spec.loop);
      if (bad > n * 0.12) {
        if (import.meta.env.DEV) console.info(`[npcs] ${region}: a ${spec.role}'s way is blocked (${bad}/${n}) at ${where.join(' ')}, left at home`);
        continue;
      }
      spec.path = pts;
    }
    if (spec.at && !spec.boat && !spec.sit && !ctx.isWalkable(spec.at.x, spec.at.z)) {
      const p = walkableNear(ctx, spec.at.x, spec.at.z, 2);
      spec.at = { ...spec.at, x: p.x, z: p.z };
    }
    const sc = spec.look.scale ?? 1;
    const p0: Person = {
      spec, i: people.length, x: lead?.x ?? spec.at?.x ?? spec.ring?.x ?? spec.path?.[0].x ?? 0, y: 0, z: lead?.z ?? spec.at?.z ?? spec.ring?.z ?? spec.path?.[0].z ?? 0,
      top: 1.24 * sc + (spec.boat ? 0.3 : 0), h: spec.at?.h ?? 0, active: false,
      d: spec.offset ?? rng() * 20, dir: 1, speed: spec.speed ?? 0.9, pause: 0, nextDwell: 8 + rng() * 25,
      amp: 0, ph: rng() * TAU, yaw: 0, seed: rng() * 100, react: 'none', reactT: 0, reactDelay: 0, src: { x: 0, z: 0 }, goal: null,
      greeted: false, bowedHere: false, nextBark: 4 + rng() * 20, moved: true, child: sc < 0.9, scale: sc, boatI: -1,
      away: false, placed: false, stuck: 0, lead,
    };
    people.push(p0);
    prev = p0;
  }
  if (!people.length) return null;
  const N = people.length;

  // ── the figure: one instanced mesh and its outline
  const geo = crowdGeometry(THREE);
  const cols = new Float32Array(N * 4), look = new Float32Array(N * 4), pose = new Float32Array(N * 4), pose2 = new Float32Array(N * 4), misc = new Float32Array(N * 4);
  const attr = (name: string, arr: Float32Array, dynamic: boolean) => {
    const a = new THREE.InstancedBufferAttribute(arr, 4);
    if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  attr('aCols', cols, false);
  attr('aLook', look, false);
  const aPose = attr('aPose', pose, true), aPose2 = attr('aPose2', pose2, true), aMisc = attr('aMisc', misc, true);
  const mats = crowdMaterials(THREE, propMat(ctx).gradientMap, ctx.palette.ink);
  const body = new THREE.InstancedMesh(geo, mats.body, N);
  const outline = new THREE.InstancedMesh(geo, mats.outline, N);
  outline.instanceMatrix = body.instanceMatrix;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // everyone stays within the place: one sphere round it lets the camera cull the whole crowd
  // (behind the camera or far off, ~2k triangles a head, drawn twice with the outline, adds up)
  const home = REGION[region];
  const reach = new THREE.Sphere(new THREE.Vector3(home.center.x, home.elevation + 1, home.center.z), home.radius + 6);
  body.boundingSphere = reach;
  outline.boundingSphere = reach;
  body.frustumCulled = outline.frustumCulled = true;
  // 身临其境 (a real shadow map): they cast their shadows as they stand, walk and wave — the shadow
  // pass poses the figure just as the body's own shader does
  if (ctx.renderer.shadowMap.enabled) {
    const depth = new THREE.MeshDepthMaterial();
    const pose = mats.body.onBeforeCompile;
    depth.onBeforeCompile = (sh, r) => {
      // the depth shader only reads normals for displacement: read them always, then pose as the body does
      sh.vertexShader = sh.vertexShader
        .replace(/#ifdef USE_DISPLACEMENTMAP\s*#include <beginnormal_vertex>[\s\S]*?#endif/, '')
        .replace('#include <begin_vertex>', '#include <beginnormal_vertex>\n#include <begin_vertex>');
      pose.call(mats.body, sh, r);
    };
    depth.customProgramCacheKey = () => 'npc-crowd-depth';
    body.customDepthMaterial = depth;
    body.castShadow = true;
    bag.own(depth);
  }
  body.name = `npc-crowd:${region}`;
  outline.name = `npc-crowd-outline:${region}`;
  const root = new THREE.Group();
  root.name = `npc-crowd-root:${region}`;
  root.add(body, outline);
  for (const p of people) {
    const L = p.spec.look;
    cols.set([packColor(THREE, L.robe), packColor(THREE, L.trim), packColor(THREE, L.hair ?? HAIR), packColor(THREE, L.hat ?? L.trim)], p.i * 4);
    look.set([L.hatKind ?? HAT.none, L.hand ?? HAND.none, L.back ?? BACK.none, L.beard ? 1 : 0], p.i * 4);
    misc.set([p.spec.sit ? 1 : 0, 0, L.cape ?? CAPE.none, 0], p.i * 4);
  }

  // ── blob shadows under their feet
  const shTex = bag.own(glowTexture(THREE, 64, 0.35));
  const shadows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shTex, color: '#2a1e14', transparent: true, opacity: 0.32, depthWrite: false }),
    N,
  );
  shadows.boundingSphere = reach;
  shadows.frustumCulled = true;
  shadows.renderOrder = 1;
  root.add(shadows);

  // ── boats (for the boatman and the people on the lake)
  const boaters = people.filter((p) => p.spec.boat);
  let boats: T.InstancedMesh | null = null, boatsOl: T.InstancedMesh | null = null;
  if (boaters.length) {
    const bg = boatGeometry(ctx, region === 'village');
    boats = new THREE.InstancedMesh(bg, propMat(ctx), boaters.length);
    boatsOl = new THREE.InstancedMesh(bg, outlineMat(ctx, 0.022), boaters.length);
    boatsOl.instanceMatrix = boats.instanceMatrix;
    boats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boats.frustumCulled = boatsOl.frustumCulled = false;
    root.add(boats, boatsOl);
    boaters.forEach((p, k) => { p.boatI = k; });
  }

  // ── lantern halos at night
  const lit = people.filter((p) => p.spec.lantern || p.spec.boat === 'river');
  const haloPos = new Float32Array(Math.max(1, lit.length) * 3);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3).setUsage(THREE.DynamicDrawUsage));
  const haloTex = bag.own(glowTexture(THREE, 64, 0.12));
  const halos = new THREE.Points(haloGeo, new THREE.PointsMaterial({ map: haloTex, color: '#ffb86b', size: 1.5, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halos.frustumCulled = false;
  halos.visible = false;
  root.add(halos);

  bag.add(root, group);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), eul = new THREE.Euler();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const tmp = { x: 0, z: 0, heading: 0 };
  const goal = { x: 0, z: 0 };
  let night = false;
  let anyOn = false;
  let rosterDirty = true;

  function roster(hour: number, isNight: boolean, fest: boolean) {
    if (isNight !== night) rosterDirty = true;
    night = isNight;
    let changed = false;
    for (const p of people) {
      const on = onDuty(p.spec.shift, hour, isNight, fest);
      if (on !== p.active) {
        p.active = on; changed = true; p.moved = true;
        // out of sight in between: they may start straight on their way
        p.placed = false; p.away = false; p.react = 'none'; p.goal = null;
        if (on && p.lead) { p.x = p.lead.x; p.z = p.lead.z; }
      }
    }
    if (changed || rosterDirty) {
      rosterDirty = false;
      for (const p of people) if (!p.active) { body.setMatrixAt(p.i, zero); shadows.setMatrixAt(p.i, zero); if (boats && p.boatI >= 0) boats.setMatrixAt(p.boatI, zero); }
      body.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
      if (boats) boats.instanceMatrix.needsUpdate = true;
      halos.visible = night && lit.some((p) => p.active);
      for (const p of people) misc[p.i * 4 + 1] = night && (p.spec.lantern || p.spec.look.hand === HAND.lantern) ? 1.4 : 0;
      aMisc.needsUpdate = true;
    }
    anyOn = people.some((p) => p.active);
  }

  function event(e: SkillEvent) {
    if (!group.visible || !root.visible) return;
    const r = e.r ?? (e.kind === 'music' ? 16 : e.kind === 'bow' ? 11 : 9);
    for (const p of people) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d > r) continue;
      const kind: React = e.kind === 'music' ? 'listen' : e.kind === 'bow' ? 'bow' : 'sniff';
      p.react = kind;
      p.reactT = kind === 'listen' ? 14 : kind === 'bow' ? 2.2 : 3.2;
      p.reactDelay = kind === 'listen' ? d * 0.08 : d * 0.05;
      p.src = { x: e.x, z: e.z };
      p.goal = null;
      if (kind === 'listen' && (p.spec.path || p.spec.ring || p.lead) && !p.spec.boat) {
        // walk over and stand in a ring round the music
        const a = Math.atan2(p.x - e.x, p.z - e.z) + (p.seed % 1 - 0.5) * 0.6;
        const rr = 2.6 + (p.seed % 1.5);
        const gx = e.x + Math.sin(a) * rr, gz = e.z + Math.cos(a) * rr;
        if (ctx.isWalkable(gx, gz)) p.goal = { x: gx, z: gz };
      }
    }
    // one of them says something
    const list = e.kind === 'music' ? REACT.music : e.kind === 'bow' ? REACT.bow : REACT.bloom;
    const near = people.filter((p) => p.active && Math.hypot(p.x - e.x, p.z - e.z) < r).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
    if (near) bag.later(600, () => bubbles.say(near, lineText(ctx, list[Math.floor((near.seed * 7) % list.length)]), 2.6, true));
  }

  let woodfishBeat = 0;
  let farCheck = 0;
  function step(dt: number, t: number) {
    // far off (the place is a smudge in the mist), the crowd is not drawn at all
    if ((farCheck -= dt) <= 0) {
      farCheck = 0.5;
      const cam = ctx.camera.position;
      const far = Math.hypot(cam.x - home.center.x, cam.z - home.center.z) > home.radius + 55;
      if (root.visible === far) root.visible = !far;
    }
    if (!anyOn || !group.visible || !root.visible) return;
    const pp = ctx.player.position;
    const cd = Math.hypot(pp.x - (people[0].x), pp.z - (people[0].z));
    if (cd > 160) return;
    const who: CharacterId = ctx.player.character;
    const isGuan = who === 'guan', isChange = who === 'change', chaseMe = who === 'cat' || who === 'rabbit';
    let staredSaid = false;
    let hi = 0;
    for (const p of people) {
      if (!p.active) continue;
      const S = p.spec;
      const dx = pp.x - p.x, dz = pp.z - p.z;
      const dist = Math.hypot(dx, dz);
      const toMe = Math.atan2(dx, dz);
      let speed = 0;
      let react = p.react;
      if (react !== 'none') {
        if (p.reactDelay > 0) { p.reactDelay -= dt; react = 'none'; }
        else { p.reactT -= dt; if (p.reactT <= 0) { p.react = 'none'; react = 'none'; p.goal = null; } }
      }
      // companions: a bow for 关公, a long stare at 嫦娥, the children after the cat
      if (react === 'none' && !p.child && !S.boat) {
        if (isGuan && dist < 6 && !p.bowedHere) { p.bowedHere = true; p.react = react = 'bow'; p.reactT = 2.2; p.src = { x: pp.x, z: pp.z }; if (!bubbles.talking(p) && bubbles.quiet > 1.5) bubbles.say(p, lineText(ctx, pickOf(forCompanion(HELLO, who), p.seed)), 2.4); }
        else if (isChange && dist < 13) { react = 'stare'; if (!staredSaid && !p.greeted && dist < 8 && bubbles.quiet > 3) { staredSaid = true; p.greeted = true; bubbles.say(p, lineText(ctx, pickOf(forCompanion(HELLO, who), p.seed)), 2.6); } }
      }
      if (dist > 9) { p.bowedHere = false; if (!isChange) p.greeted = false; }
      if (dist > 16 && isChange) p.greeted = false;

      // ── move
      if (S.boat === 'river' && S.path) {
        p.d += S.speed! * dt * (still ? 0.6 : 1);
        pingPong(S.path, p.d, tmp);
        p.x = tmp.x; p.z = tmp.z; p.h = tmp.heading;
        speed = 0;
      } else if (S.boat === 'circle' && S.ring) {
        p.d += (S.speed ?? 0.3) * dt;
        const a = p.d / S.ring.r;
        p.x = S.ring.x + Math.cos(a) * S.ring.r; p.z = S.ring.z + Math.sin(a) * S.ring.r;
        p.h = Math.atan2(-Math.sin(a), Math.cos(a));
      } else if (S.boat === 'anchored' && S.at) {
        p.x = S.at.x + Math.sin(t * 0.05 + p.seed) * 0.6; p.z = S.at.z + Math.cos(t * 0.04 + p.seed) * 0.6;
        p.h = S.at.h + Math.sin(t * 0.1 + p.seed) * 0.25;
      } else if (S.ring) {
        // children: round and round — or after the cat (or the rabbit)
        const c = S.ring;
        const catNear = chaseMe && Math.hypot(pp.x - c.x, pp.z - c.z) < 12;
        if (react === 'listen' && p.goal) {
          speed = walkTo(p, p.goal, 1.6, dt);
          p.away = true;
        } else if (catNear) {
          p.away = true;
          const back = 1.1 + (p.i % 3) * 0.5;
          goal.x = pp.x - Math.sin(ctx.player.heading + (p.i % 3 - 1) * 0.7) * back;
          goal.z = pp.z - Math.cos(ctx.player.heading + (p.i % 3 - 1) * 0.7) * back;
          const far = Math.hypot(goal.x - c.x, goal.z - c.z) > 13;
          speed = far ? 0 : walkTo(p, goal, dist > 2.2 ? 2.9 : 0.9, dt);
          if (speed === 0) p.h = toMe;
          if (!p.greeted && bubbles.quiet > 2.2) { p.greeted = true; const l = CHASE[who]; if (l) bubbles.say(p, lineText(ctx, pickOf(l, p.seed)), 2.2); }
        } else {
          p.greeted = false;
          ringAt(c, p.d, p.seed, goal);
          const gd = Math.hypot(goal.x - p.x, goal.z - p.z);
          if (!p.placed) { p.x = goal.x; p.z = goal.z; p.placed = true; p.away = false; p.moved = true; }
          else if (p.away || gd > 1) {
            // back to the game first (running, never a jump), then round again
            p.away = true;
            speed = walkBack(p, goal, 2.6, dt);
            if (gd < 0.3) p.away = false;
          } else {
            p.d += (S.speed ?? 2.4) * dt * (still ? 0.5 : 1);
            ringAt(c, p.d, p.seed, goal);
            // follow the ring's point, never faster than a child runs
            const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
            const stepMax = RUN * dt;
            const st = Math.min(d, stepMax);
            if (d > 1e-5) { p.x += (dx / d) * st; p.z += (dz / d) * st; }
            speed = st / Math.max(dt, 1e-3);
            if (speed > 0.2) p.h = Math.atan2(dx, dz);
            p.moved = true;
          }
          if (dist < 14 && p.nextBark <= 0 && bubbles.quiet > 5) { p.nextBark = 14 + (p.seed % 9); bubbles.say(p, lineText(ctx, pickOf(CALLS.child!, p.seed + t)), 2); }
        }
      } else if (p.lead) {
        // beside their companion: a step to the side and a little behind; round to the other side when
        // they turn back; face them while they stop
        const Ld = p.lead;
        if (react === 'listen' && p.goal) speed = walkTo(p, p.goal, 1.1, dt);
        else if (react === 'bow' || react === 'stare' || react === 'sniff' || react === 'listen' || react === 'wave') speed = 0;
        else {
          const sh = Math.sin(Ld.h), ch = Math.cos(Ld.h);
          goal.x = Ld.x + ch * 0.62 - sh * 0.28; goal.z = Ld.z - sh * 0.62 - ch * 0.28;
          if (!ctx.isWalkable(goal.x, goal.z)) { goal.x = Ld.x - sh * 0.85; goal.z = Ld.z - ch * 0.85; }
          if (!p.placed) { p.x = goal.x; p.z = goal.z; p.h = Ld.h; p.placed = true; p.moved = true; }
          else {
            // keep up smoothly (no dead zone, so no stop-start), never faster than a brisk walk
            const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
            const st = Math.min(d, Math.max(1, (Ld.spec.speed ?? 0.9) * 1.8) * dt);
            if (d > 0.01) {
              const nx = p.x + (dx / d) * st, nz = p.z + (dz / d) * st;
              if (p.stuck > 2.5 || ctx.isWalkable(nx, nz)) { p.x = nx; p.z = nz; p.moved = true; speed = st / Math.max(dt, 1e-3); p.stuck = 0; }
              else p.stuck += dt;
            }
            if (speed > 0.25) p.h = rotateToward(p.h, d > 0.15 ? Math.atan2(dx, dz) : Ld.h, dt * 6);
          }
          if (speed <= 0.25) p.h = rotateToward(p.h, Math.hypot(Ld.x - p.x, Ld.z - p.z) > 0.2 && Ld.pause > 0 ? Math.atan2(Ld.x - p.x, Ld.z - p.z) : Ld.h, dt * 3);
        }
      } else if (S.path) {
        // walkers: along the lane, pausing now and then, stopping for you
        const inFront = dist < 1.7 && Math.cos(toMe - p.h) > 0.3;
        if (react === 'listen' && p.goal) { speed = walkTo(p, p.goal, 1.1, dt); p.away = true; }
        else if (react === 'bow' || react === 'stare' || react === 'sniff' || react === 'listen' || react === 'wave') speed = 0;
        else if (p.away) {
          // drawn off their way (to hear the music): walk back to where they left it, then go on
          if (S.loop) loopAt(S.path, p.d, tmp); else pingPong(S.path, p.d, tmp);
          goal.x = tmp.x; goal.z = tmp.z;
          if (Math.hypot(goal.x - p.x, goal.z - p.z) < 0.2) { p.away = false; p.stuck = 0; }
          else speed = walkBack(p, goal, 1.1, dt);
        }
        else if (inFront) { p.pause = Math.max(p.pause, 0.9); speed = 0; }
        else if (p.pause > 0) { p.pause -= dt; }
        else {
          const sp = (S.speed ?? 0.9) * (still ? 0.7 : 1);
          p.d += sp * dt;
          p.nextDwell -= sp * dt;
          if (p.nextDwell <= 0) { p.nextDwell = 14 + ((p.seed * 13.7 + p.d) % 26); p.pause = 2.5 + (p.seed % 3); }
          if (S.loop) loopAt(S.path, p.d, tmp); else pingPong(S.path, p.d, tmp);
          if (p.placed && Math.hypot(tmp.x - p.x, tmp.z - p.z) > 0.6) {
            // never a jump: if they are somehow off their way, they walk back to it
            p.d -= sp * dt;
            p.away = true;
          } else {
            p.x = tmp.x; p.z = tmp.z; p.h = p.placed ? rotateToward(p.h, tmp.heading, dt * 6) : tmp.heading;
            p.placed = true;
            speed = sp;
            p.moved = true;
          }
        }
      }
      // turn to face: whoever calls them, you when near and interested, the partner in a chat
      if (speed < 0.05 && !S.boat) {
        let want: number | null = null;
        if (react === 'bow' || react === 'listen' || react === 'sniff') want = Math.atan2(p.src.x - p.x, p.src.z - p.z);
        else if (react === 'stare' || (p.pause > 0 && dist < 3)) want = toMe;
        else if (S.face) want = Math.atan2(S.face.x - p.x, S.face.z - p.z);
        else if (S.at && !S.sit) want = S.at.h;
        if (want !== null && !S.sit) p.h = rotateToward(p.h, want, dt * 3);
      }

      // ── hello when you pass (not everyone; one bubble at a time)
      if (dist < 3.4 && !p.greeted && react === 'none' && !S.boat && !p.child && hi === 0 && bubbles.quiet > 2.5 && (p.seed % 2) < 1.2) {
        p.greeted = true;
        hi++;
        bubbles.say(p, lineText(ctx, pickOf(night ? HELLO[who] ?? HELLO_NIGHT : forCompanion(HELLO, who), p.seed)), 2.4);
        if (!S.sit && S.act !== 'wash') { p.react = 'wave'; p.reactT = 1.4; p.reactDelay = 0; }
      }
      // calls: vendors, the watchman, the boatman, the wooden fish
      p.nextBark -= dt;
      if (p.nextBark <= 0 && dist < 18) {
        const fest = festLines && night && (S.role === 'snack' || S.role === 'lantern') && Math.floor(p.seed + t * 0.37) % 2 === 0;
        const calls = fest ? festLines : CALLS[S.role];
        if (calls && S.role !== 'child' && bubbles.quiet > 3.5) {
          p.nextBark = (S.role === 'watchman' ? 9 : 13) + (p.seed % 8);
          if (bubbles.say(p, lineText(ctx, pickOf(calls, p.seed + t * 0.37)), S.role === 'watchman' ? 3.4 : 2.6)) {
            if (S.role === 'watchman') { try { ctx.audio.knock(); bag.later(260, () => ctx.audio.knock()); } catch { /* quiet */ } }
          }
        } else p.nextBark = 3;
      }

      // ── height
      if (S.boat) {
        const w = ctx.waterAt(p.x, p.z);
        p.y = (w ?? ctx.groundY(p.x, p.z)) + (S.sit ? 0.2 : 0.28) + (still ? 0 : Math.sin(t * 1.3 + p.seed) * 0.03);
      } else if (p.moved || speed > 0) {
        p.y = ctx.groundY(p.x, p.z) + (S.lift ?? 0);
        p.moved = false;
      }

      // ── pose
      const run = speed > 1.8;
      const stride = (run ? 1.5 : 1.05) * p.scale;
      p.amp += ((speed > 0.05 ? Math.min(1.25, speed / 1.1) : 0) - p.amp) * Math.min(1, dt * 6);
      p.ph += (speed * dt * TAU) / stride;
      if (p.amp < 0.02 && !run) p.ph *= 0.95;
      let bow = 0, armL = 0, armR = 0, roll = 0, sway = 0, headP = 0;
      const k = still ? 0 : 1;
      switch (S.act) {
        case 'vend': { const c = (t * 0.25 + p.seed) % 1; armR = c < 0.18 ? 1.2 + Math.sin(c * 40) * 0.2 * k : 0.25; armL = 0.2; break; }
        case 'sweep': armL = 0.75; armR = 0.6; roll = 0.25; sway = Math.sin(t * 2.2 + p.seed) * 0.14 * k; bow = 0.22; headP = 0.15; break;
        case 'wash': bow = 0.5; armR = 1.0 + Math.abs(Math.sin(t * 3.4 + p.seed)) * 0.7 * k; armL = 0.9; headP = 0.2; break;
        case 'woodfish': {
          armL = 1.05; roll = 0.2;
          const beat = (t * 1.4 + p.seed) % 6;
          const hit = beat < 4 ? Math.max(0, Math.sin((beat % 1) * Math.PI)) : 0;
          armR = 1.0 + hit * 0.45 * k; headP = 0.12;
          const bi = beat < 4 ? Math.floor(beat) : -1;
          if (bi !== woodfishBeat) { woodfishBeat = bi; if (bi >= 0 && dist < 12 && !still) { try { ctx.audio.knock(); } catch { /* quiet */ } } }
          break;
        }
        case 'admire': headP = -0.28; armL = -0.1; armR = S.look.hand === HAND.lantern ? 0.6 : (Math.sin(t * 0.3 + p.seed) > 0.6 ? 1.3 : 0.35); break;
        case 'drink': { const c = (t * 0.16 + p.seed) % 1; armR = c < 0.2 ? 1.95 : 0.75; armL = 0.6; headP = c < 0.2 ? -0.1 : 0.05; break; }
        case 'pray': { const c = Math.max(0, Math.sin(t * 0.8 + p.seed)); bow = 0.55 * c * c; armL = armR = 1.1; roll = 0.55; break; }
        case 'hoe': { const c = (t * 0.7 + p.seed) % 1; const up = c < 0.6 ? c / 0.6 : 1 - (c - 0.6) / 0.4; armL = armR = 0.5 + up * 1.7 * k; bow = 0.3 - up * 0.2; break; }
        case 'chat': armR = 0.35 + Math.max(0, Math.sin(t * 1.7 + p.seed)) * 0.5 * k; armL = 0.15; headP = Math.sin(t * 2.3 + p.seed) * 0.05 * k; break;
        case 'pole': { const c = Math.sin(t * 1.1 + p.seed); armL = 0.9 + c * 0.35 * k; armR = 0.8 + c * 0.35 * k; bow = 0.15 + c * 0.12 * k; break; }
        case 'fish': armR = 0.95; armL = 0.5; headP = 0.1; break;
        case 'pick': armR = 0.7 + Math.max(0, Math.sin(t * 0.9 + p.seed)) * 0.6 * k; armL = 0.4; bow = 0.25; break;
        case 'read': armL = 1.2; armR = 0.3; headP = 0.25; break;
        default:
          if (S.look.hand === HAND.lantern) armR = 0.55;
          else if (S.look.hand === HAND.fan) armR = 0.45 + Math.sin(t * 3 + p.seed) * 0.08 * k;
          else if (S.look.hand === HAND.clapper) { const c = (t * 0.45 + p.seed) % 1; armR = 0.7 + (c < 0.1 ? Math.sin(c * 31) * 0.5 : 0); armL = 0.7; }
          else if (S.look.back === BACK.basket) armL = 0.3;
      }
      switch (react) {
        case 'bow': { const e = envelope(2.2 - p.reactT, 2.2); bow = 0.7 * e; armL = armR = 1.2 * e + armL * (1 - e); roll = 0.55 * e; break; }
        case 'listen': sway = Math.sin(t * 1.9 + p.seed) * 0.11 * k; headP = 0.05; if (!S.act) { armL = armR = 0.15; } break;
        case 'sniff': { const e = envelope(3.2 - p.reactT, 3.2); bow = 0.28 * e; headP = 0.22 * e; armR = armR * (1 - e) + 1.5 * e; break; }
        case 'stare': armL = armR = 0.25; headP = -0.06; break;
        case 'wave': armR = 2.6 + Math.sin(t * 12) * 0.25 * k; break;
      }
      // the head: toward you when near, toward what they react to, idle glances otherwise
      let wantYaw = 0;
      if (react === 'listen' || react === 'sniff' || react === 'bow') wantYaw = wrap(Math.atan2(p.src.x - p.x, p.src.z - p.z) - p.h);
      else if (dist < (isChange ? 14 : 7)) wantYaw = wrap(toMe - p.h);
      else if (S.act === 'drink' && region === 'village') wantYaw = wrap(Math.atan2(12.8 - p.x, 88 - p.z) - p.h);
      else if (!still) wantYaw = Math.sin(t * 0.23 + p.seed) * 0.45;
      wantYaw = Math.max(-1.15, Math.min(1.15, wantYaw));
      p.yaw += (wantYaw - p.yaw) * Math.min(1, dt * 4);

      const o = p.i * 4;
      pose[o] = p.ph; pose[o + 1] = Math.min(1.25, p.amp); pose[o + 2] = bow; pose[o + 3] = p.yaw;
      pose2[o] = armL; pose2[o + 1] = armR; pose2[o + 2] = roll; pose2[o + 3] = sway;
      misc[o + 3] = headP;

      // the figure (in a boat: at the stern, or seated amidships)
      let fx = p.x, fz = p.z;
      if (S.boat) {
        const back = S.boat === 'river' ? -1.05 : -0.3;
        fx += Math.sin(p.h) * back; fz += Math.cos(p.h) * back;
      }
      q.setFromAxisAngle(yAxis, p.h);
      body.setMatrixAt(p.i, m4.compose(v3.set(fx, p.y, fz), q, s3.setScalar(p.scale)));
      if (S.boat) shadows.setMatrixAt(p.i, zero);
      else shadows.setMatrixAt(p.i, m4.compose(v3.set(fx, p.y - (S.lift ?? 0) + 0.03, fz), q, s3.set(p.scale * (S.sit ? 1.1 : 0.85), 1, p.scale * (S.sit ? 1.2 : 0.85))));
      if (boats && p.boatI >= 0) {
        const w = ctx.waterAt(p.x, p.z) ?? p.y;
        const rockZ = still ? 0 : Math.sin(t * 1.3 + p.seed) * 0.03;
        q.setFromEuler(eul.set(0, p.h, rockZ, 'YXZ'));
        boats.setMatrixAt(p.boatI, m4.compose(v3.set(p.x, w + 0.02 + (still ? 0 : Math.sin(t * 1.3 + p.seed) * 0.03), p.z), q, s3.setScalar(1)));
      }
    }
    body.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    if (boats) boats.instanceMatrix.needsUpdate = true;
    aPose.needsUpdate = aPose2.needsUpdate = aMisc.needsUpdate = true;
    // lantern halos
    if (halos.visible) {
      let n = 0;
      for (const p of lit) {
        const o = n++ * 3;
        if (!p.active) { haloPos[o] = 0; haloPos[o + 1] = -99; haloPos[o + 2] = 0; continue; }
        if (p.spec.boat) {
          const f = p.spec.boat === 'river' ? 1.3 : 1.05;
          haloPos[o] = p.x + Math.sin(p.h) * f; haloPos[o + 1] = p.y + (p.spec.boat === 'river' ? 0.75 : 0.45); haloPos[o + 2] = p.z + Math.cos(p.h) * f;
        } else {
          const s = p.scale, c = Math.cos(p.h), sn = Math.sin(p.h);
          const lx = LANTERN_AT.x * s, lz = LANTERN_AT.z * s;
          haloPos[o] = p.x + lx * c + lz * sn; haloPos[o + 1] = p.y + LANTERN_AT.y * s; haloPos[o + 2] = p.z - lx * sn + lz * c;
        }
      }
      haloGeo.attributes.position.needsUpdate = true;
    }
  }

  /** Walk toward a goal at `sp` m/s; returns the speed actually walked. */
  function walkTo(p: Person, g: XZ, sp: number, dt: number, force = false): number {
    const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return 0;
    const step = Math.min(d, sp * dt);
    const nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step;
    if (!force && !ctx.isWalkable(nx, nz)) return 0;
    p.x = nx; p.z = nz;
    p.h = rotateToward(p.h, Math.atan2(dx, dz), dt * 8);
    p.moved = true;
    return step / Math.max(dt, 1e-4);
  }

  /**
   * Walk back to a point on their way. They came from there, so the way back is open; if something
   * stands in it for a while (a building set down meanwhile), they squeeze past rather than freeze.
   */
  function walkBack(p: Person, g: XZ, sp: number, dt: number): number {
    const v = walkTo(p, g, sp, dt, p.stuck > 2.5);
    if (v === 0 && Math.hypot(g.x - p.x, g.z - p.z) >= 0.15) p.stuck += dt;
    else p.stuck = 0;
    return v;
  }

  return {
    roster, step, event,
    info: () => ({ region, people: N, active: people.filter((p) => p.active).length }),
    people: () => people.map((p) => ({ region, i: p.i, role: p.spec.role, shift: p.spec.shift, active: p.active, x: +p.x.toFixed(2), z: +p.z.toFixed(2), away: p.away })),
  };
}

function loopAt(pts: XZ[], d: number, out: { x: number; z: number; heading: number }) {
  let total = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; total += Math.hypot(b.x - a.x, b.z - a.z); }
  let r = ((d % total) + total) % total;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (r <= L) { const k = L ? r / L : 0; out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.heading = Math.atan2(b.x - a.x, b.z - a.z); return; }
    r -= L;
  }
}

/** How fast a child runs (m/s): the most a child moves in a frame, whatever the game does. */
const RUN = 3.4;

/** The point of a children's ring game after `d` metres round (it wobbles in and out). */
function ringAt(c: { x: number; z: number; r: number }, d: number, seed: number, out: XZ): void {
  const a = d / c.r + Math.sin(d * 0.21 + seed) * 0.4;
  const wob = 1 + Math.sin(d * 0.37 + seed) * 0.18;
  out.x = c.x + Math.cos(a) * c.r * wob; out.z = c.z + Math.sin(a) * c.r * wob;
}

function rotateToward(a: number, b: number, k: number): number {
  return a + wrap(b - a) * Math.min(1, k);
}

/** 0 → 1 → 0 over a reaction of `len` seconds (quick in, hold, ease out). */
function envelope(t: number, len: number): number {
  return Math.max(0, Math.min(1, t / 0.35, (len - t) / 0.5));
}

function pickOf<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(Math.floor(seed * 7.31)) % list.length];
}

/** A small wooden boat (a canopied 乌篷 for the river, an open skiff on the lake); +z is the bow. */
function boatGeometry(ctx: WorldCtx, canopy: boolean): T.BufferGeometry {
  const { THREE } = ctx;
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.5, 0); hullShape.quadraticCurveTo(-0.55, -0.3, 0, -0.34); hullShape.quadraticCurveTo(0.55, -0.3, 0.5, 0); hullShape.lineTo(-0.5, 0);
  const L = canopy ? 3.4 : 2.6;
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: L, bevelEnabled: false, steps: 1 });
  hull.translate(0, 0.1, -L / 2);
  // taper bow and stern
  const pa = hull.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const z = pa.getZ(i), f = Math.abs(z) / (L / 2);
    const taper = 1 - Math.max(0, f - 0.55) * 1.5;
    pa.setX(i, pa.getX(i) * taper);
    pa.setY(i, pa.getY(i) + Math.max(0, f - 0.6) * 0.35);
  }
  hull.computeVertexNormals();
  const parts: T.BufferGeometry[] = [
    part(THREE, hull, '#6b4a33'),
    part(THREE, new THREE.BoxGeometry(0.9, 0.04, L * 0.7), '#8a6a48', { p: [0, 0.08, 0] }),
  ];
  if (canopy) {
    const arch = new THREE.CylinderGeometry(0.58, 0.58, 1.3, 10, 1, true, -Math.PI / 2, Math.PI);
    parts.push(part(THREE, arch, '#3a342c', { p: [0, 0.18, 0.2], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] }));
    // the lantern hanging at the bow
    parts.push(part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), '#6b4a33', { p: [0, 0.5, 1.3] }));
    parts.push(part(THREE, new THREE.SphereGeometry(0.11, 8, 6), '#d8563a', { p: [0, 0.75, 1.3], s: [1, 1.25, 1] }));
  } else {
    parts.push(part(THREE, new THREE.CylinderGeometry(0.2, 0.16, 0.16, 8), '#c9ad72', { p: [0, 0.2, 0.7] }));
    parts.push(part(THREE, new THREE.SphereGeometry(0.08, 8, 6), '#d8563a', { p: [0, 0.45, 1.05], s: [1, 1.25, 1] }));
    parts.push(part(THREE, new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), '#6b4a33', { p: [0, 0.3, 1.05] }));
  }
  return merge(THREE, parts);
}
