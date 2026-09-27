// 食单 · the valley's menu book (spec §3.9) between the world and the page: the table keeps `lifeHere`
// (the walker is in the valley and everyday life is open: the chip shows in the 案卷 chip's slot), the
// chip opens the sheet, and the 设 tab writes the 特写 setting into play (backed up).
//
// Owner: F (food). WalkView (L) shows <ShidanChip/> and mounts <ShidanSheet/>, pausing the walk while
// `shidanSheet` is non-null, as it does for the casebook.
import { signal } from '@preact/signals';
import { play } from '../../../app/play';
import { PV_ALL, PV_OFF } from '../features/taoyuan/life/keys';
import type { GameId, Line } from '../features/taoyuan/life/types';

export type ShidanTab = 'dishes' | 'games' | 'set';

/** The sheet, open on a tab (non-null) or closed. */
export const shidanSheet = signal<ShidanTab | null>(null);

/** The walker is in the valley and everyday life is open (the table keeps it, once a second). */
export const lifeHere = signal(false);

export function openShidan(tab: ShidanTab = 'dishes'): void {
  shidanSheet.value = tab;
}

export function closeShidan(): void {
  shidanSheet.value = null;
}

// ───────────────────────────── the 特写 setting (flags tyl:pv:all / tyl:pv:off; neither: 头一回)

export type PvSetting = 'all' | 'first' | 'off';

export function pvSetting(f: Readonly<Record<string, true | undefined>>): PvSetting {
  return f[PV_OFF] ? 'off' : f[PV_ALL] ? 'all' : 'first';
}

/**
 * Choose the setting. A setting is the one flag pair that is ever taken back (play has no unflag: the
 * rest of play only ever rises), so this writes the flags directly, as revokeCode does.
 */
export function setPvSetting(v: PvSetting): void {
  const p = play.peek();
  const flags: Record<string, true> = { ...p.flags };
  delete flags[PV_ALL];
  delete flags[PV_OFF];
  if (v === 'all') flags[PV_ALL] = true;
  if (v === 'off') flags[PV_OFF] = true;
  if (!!p.flags[PV_ALL] === !!flags[PV_ALL] && !!p.flags[PV_OFF] === !!flags[PV_OFF]) return;
  play.value = { ...p, flags };
}

// ───────────────────────────── the 六戏 tab's day (the games fill it in)

/** Today's twist of a game and whether it carries today's 今日之约 (the games' frame registers this). */
export interface GameDay {
  twist?: Line | null;
  yue?: boolean;
}

/** (the games' frame) What a game's day holds, for the 六戏 tab; null takes it back. */
export const gameDay = signal<((g: GameId, day: string) => GameDay | null) | null>(null);

export function setGameDay(fn: ((g: GameId, day: string) => GameDay | null) | null): void {
  gameDay.value = fn;
}
