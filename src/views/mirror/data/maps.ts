// 水月幻镜 · the three maps and their hazards (GDD §12; ⚖ map HP 1.00 / 1.00 / 1.05, pay 1 / 1.05 / 1.10).
import type { HazardId, MapId, MonsterId } from '../ids';
import type { HazardDef, MapDef } from '../types';

const SHARED: readonly MonsterId[] = ['blot', 'paperman', 'shard', 'lantern'];

export const MAPS: Readonly<Record<MapId, MapDef>> = {
  lake: {
    id: 'lake', shape: { kind: 'circle', r: 760 },
    obstacles: [{ kind: 'lotus', n: 6, r: [45, 60], blocks: 'enemyShots' }],
    hazards: ['moonglow', 'ripple'], hp: 1, pay: 1, knockX: 1,
    roster: [...SHARED, 'tadpole', 'shrimp', 'frog', 'crab', 'lotuspod', 'jelly', 'clam', 'egret', 'weed', 'drowned'],
    elites: ['turtle', 'whitesnake'], bosses: ['carp', 'mirage', 'moonwater'], rim: 'haishou',
    palette: { paper: '#eef0ec', ink: '#2b3440', accents: ['#6f8fb0', '#7fa88a', '#e8eef2', '#d98c9a'] },
    music: { bpm: [84, 104] }, unlock: null,
  },
  forest: {
    id: 'forest', shape: { kind: 'rect', w: 1700, h: 1100 },
    obstacles: [{ kind: 'bamboo', n: 14, r: [40, 70], blocks: 'shots' }],
    hazards: ['inkrain', 'gust'], hp: 1, pay: 1.05, knockX: 1,
    roster: [...SHARED, 'rat', 'foxfire', 'imp', 'umbrella', 'wolf', 'ghostlamp', 'spider', 'panda', 'stick', 'toadstool', 'woodghost'],
    elites: ['tiger', 'painted'], bosses: ['kui', 'fox', 'xingtian'], rim: 'guiju',
    palette: { paper: '#ebe8df', ink: '#1a2219', accents: ['#3f6b4a', '#6d9a6a', '#c0412f'] },
    music: { bpm: [96, 120] }, unlock: { map: 'lake', wave: 10 },
  },
  palace: {
    id: 'palace', shape: { kind: 'octagon', r: 820 },
    obstacles: [{ kind: 'tree', n: 1, r: [90, 90], blocks: 'all' }],
    hazards: ['jadefall', 'lowgrav', 'moonphase'], hp: 1.05, pay: 1.1, knockX: 1.4,
    roster: [...SHARED, 'shadowhare', 'crow', 'soldier', 'frost', 'guihua', 'toad', 'star', 'clerk', 'dancer', 'axeshade', 'skypup'],
    elites: ['general', 'hound'], bosses: ['wugang', 'goldtoad', 'eclipse'], rim: 'touguang',
    palette: { paper: '#f3f2ee', ink: '#23283a', accents: ['#9fb4cf', '#d9a62e', '#c0412f', '#e8eef2'] },
    music: { bpm: [100, 124] }, unlock: { map: 'forest', wave: 20 },
  },
};

export const HAZARDS: Readonly<Record<HazardId, HazardDef>> = {
  moonglow: { id: 'moonglow', map: 'lake', from: 1, p: { r: 110, speed: 40, dmg: 10, regen: 2 } },
  ripple: { id: 'ripple', map: 'lake', from: 3, every: 20, tele: 1.5, p: { speed: 300, push: 60 } },
  inkrain: { id: 'inkrain', map: 'forest', from: 4, every: 25, tele: 1.2, p: { n: 4, r: 90, life: 8, slow: 30 } },
  gust: { id: 'gust', map: 'forest', from: 8, every: 30, tele: 1.5, p: { speed: 40, dur: 2 } },
  jadefall: { id: 'jadefall', map: 'palace', from: 3, every: 8, tele: 1.5, p: { n: 2, r: 80, dmgX: 5 } },
  lowgrav: { id: 'lowgrav', map: 'palace', from: 1, p: { knockX: 1.4 } },
  moonphase: { id: 'moonphase', map: 'palace', from: 1, p: { luck: 10 } },
};
