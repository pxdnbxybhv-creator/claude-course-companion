// 水月幻镜 · the painter's palette (GDD §12, §20, §21). Pure data: safe in node.
//
// Readability grammar: danger is vermilion (朱砂); enemies are 焦墨 silhouettes with a thin paper halo
// and one accent; the player's effects are pale washes in class colours; 月华 is moon-white on top;
// only real money (铜钱) is round with a square hole and golden.
import { PIGMENTS } from '../../../ink/types';
import type { MapId } from '../ids';

export const INK = PIGMENTS.ink;
export const PAPER = '#f1e9d8';
export const CINNABAR = '#c0412f';
/** Enemy-shot rim and telegraph ink: the brightest red on screen. */
export const DANGER = '#d63a22';
export const MOON = '#f6f7fb';
export const SILVER = '#c9d3dc';
export const GOLD = '#d9a62e';
export const BRONZE = '#a8743a';
export const COPPER = '#b8792e';
export const JADE = '#7fb39a';
export const CURSE = '#6a3d7a';

/** Player washes by class family (GDD §20). */
export const CLASS_WASH = {
  sword: '#3f6f8f', // 剑 / 仙剑 石青 azure
  talisman: '#d9a62e', // 符箓 藤黄
  ink: '#3d5a73', // 墨宝 花青
  music: '#8fbf8a', // 乐器 淡绿
  moon: '#e8eef2', // 月 月白
  wine: '#8e2b3a',
  go: '#1b1916',
  heavy: '#3f6f8f',
  fist: '#8e2b3a',
  fortune: '#d9a62e',
} as const;

export interface MapPalette {
  /** The paper / ground. */
  paper: string;
  /** Wash tint over the paper (the water, the grove floor, the palace stone). */
  ground: string;
  /** Main ink (enemies and obstacle strokes lean toward it). */
  ink: string;
  /** Décor colours. */
  a1: string;
  a2: string;
  a3: string;
  /** What lies beyond the arena rim. */
  outside: string;
  /** The bronze of the mirror rim. */
  rim: string;
}

export const MAP_PAL: Record<MapId, MapPalette> = {
  // pale indigo ink, jade lotus, silver moon, a touch of lotus pink
  lake: { paper: '#eef0ea', ground: '#6f8ea6', ink: '#1d2430', a1: '#6f9f84', a2: '#e7a3b3', a3: '#d7dee6', outside: '#2b2f33', rim: '#9a7a4a' },
  // 焦墨 black-green, 石绿 moss, cinnabar fox-fire
  forest: { paper: '#ece6d4', ground: '#56705c', ink: '#161a15', a1: '#5f8a6e', a2: '#c0412f', a3: '#8c9a74', outside: '#262a24', rim: '#7d6a44' },
  // moon-white floor, cold blue, osmanthus gold, cinnabar pillars; void beyond the rim
  palace: { paper: '#f3f3ef', ground: '#8ea4bf', ink: '#1c2230', a1: '#d9a62e', a2: '#c0412f', a3: '#b9c8da', outside: '#121726', rim: '#b9c2cc' },
};

/** Companion looks for the arena token, matched to the painted busts (walk/characters/portrait.ts). */
export interface CharLook {
  skin: string;
  robe: string;
  trim: string;
  hair: string;
  /** The one accent (ids.ts COMPANION_REG). */
  accent: string;
}
export const CHAR_LOOK: Record<string, CharLook> = {
  scholar: { skin: '#f3d6b8', robe: '#f3e9d6', trim: '#2f5f78', hair: INK, accent: INK },
  gardener: { skin: '#ecc39b', robe: '#3e6485', trim: '#2b3f55', hair: '#2a2420', accent: INK },
  fisher: { skin: '#e6bd95', robe: '#a58a52', trim: '#6e5230', hair: '#efe9dd', accent: INK },
  musician: { skin: '#f7dcc6', robe: '#f8ebdc', trim: '#3f7f7a', hair: INK, accent: INK },
  swordsman: { skin: '#eccdab', robe: '#3d302a', trim: '#2e4a6b', hair: INK, accent: '#2e4a6b' },
  taoist: { skin: '#f8dcc2', robe: '#e8b660', trim: '#3a2c24', hair: INK, accent: '#d9a62e' },
  painter: { skin: '#f2d4b4', robe: '#e9d7b3', trim: '#3d5a73', hair: INK, accent: '#3d5a73' },
  player: { skin: '#f0d3b4', robe: '#739c8c', trim: '#2e3a35', hair: INK, accent: INK },
  cat: { skin: '#e0924a', robe: '#e0924a', trim: '#b8632a', hair: '#e0924a', accent: '#e08a3c' },
  rabbit: { skin: '#f7f4ee', robe: '#f7f4ee', trim: '#eab1b3', hair: '#f7f4ee', accent: INK },
  poet: { skin: '#f2d0b0', robe: '#f6ecda', trim: '#8e2b3a', hair: INK, accent: '#8e2b3a' },
  guan: { skin: '#bb4632', robe: '#2f7552', trim: '#cda146', hair: INK, accent: '#c0412f' },
  change: { skin: '#f9e3d2', robe: '#fbf0e2', trim: '#d2a95a', hair: INK, accent: '#e8eef2' },
};

/** '#rrggbb' → [r, g, b]. */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
export function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
