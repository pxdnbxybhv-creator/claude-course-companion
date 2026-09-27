// 水月幻镜 · the account between runs (GDD §17): unlocks from 镜缘 deeds, 心镜, mastery, 今日镜 and
// 候签, and the settlement of a run into meta (deeds, codex, tallies, bests, records, seals, titles,
// 镜屑, maps and 镜境 opened). Pure; first-time bonus *pay* is economy.settlePay's.
import {
  BOSS_REG, COMPANION_REG, DEED_REG, DIFF_REG, ELITE_REG, HEART_REG, ITEM_REG, MAP_REG, MONSTER_REG, MUTATOR_REG,
  STARTER_ITEMS, STARTER_WEAPONS, TERM_MOD_REG, TREASURE_REG, WEAPON_REG,
  type DeedId, type HeartFaceId, type ItemId, type RecordId, type RimId, type WeaponId,
} from '../ids';
import type {
  CharacterId, CodexKey, CodexStage, DailySpec, DateKey, EndCause, MirrorMeta, RunReport, RunSave, SealKey, TitleId, Unlocks,
} from '../types';
import { DIFFS, HEART, ITEMS, MAPS, MASTERY, PAY } from '../data';
import { hashString, makeRng } from '../../../core/rng';
import { addDays, fromKey } from '../../../core/date';
import { termContext } from '../../../core/solarterms';
import { computeStats } from './formulas';
import { MS_AT_30 } from './run';
import { dailyFor, newFirsts } from './economy';
import { pickDistinct } from './rng';

// ───────────────────────────────────────────── unlocks and deeds
/** Weapons and items open to this account: the starters plus every finished deed's unlock. */
export function unlocksOf(meta: Pick<MirrorMeta, 'deeds'>): Unlocks {
  const weapons = new Set<WeaponId>(STARTER_WEAPONS);
  const items = new Set<ItemId>(STARTER_ITEMS);
  for (const d of DEED_REG) {
    if ((meta.deeds[d.id] ?? 0) < d.goal) continue;
    if (WEAPON_REG.some((w) => w.id === d.unlocks)) weapons.add(d.unlocks as WeaponId);
    else items.add(d.unlocks as ItemId);
  }
  return { weapons, items };
}
export function deedProgress(meta: Pick<MirrorMeta, 'deeds'>, id: DeedId): { value: number; goal: number; done: boolean } {
  const d = DEED_REG.find((x) => x.id === id)!;
  const value = Math.min(d.goal, meta.deeds[id] ?? 0);
  return { value, goal: d.goal, done: value >= d.goal };
}
/** Mastery level 0..10 from cumulative XP (20, 50, 100, 170, 260, 370, 500, 650, 820, 1,000). */
export function masteryLevel(xp: number): number {
  let l = 0;
  for (const t of MASTERY) if (xp >= t) l++;
  return l;
}

// ───────────────────────────────────────────── 心镜
export function heartCost(meta: Pick<MirrorMeta, 'heart'>, face: HeartFaceId): number | null {
  const r = meta.heart.ranks[face] ?? 0;
  return HEART[face].costs[r] ?? null;
}
export function buyHeart(meta: MirrorMeta, face: HeartFaceId): MirrorMeta | null {
  const c = heartCost(meta, face);
  if (c === null || meta.dust < c) return null;
  return { ...meta, dust: meta.dust - c, heart: { ...meta.heart, ranks: { ...meta.heart.ranks, [face]: (meta.heart.ranks[face] ?? 0) + 1 } } };
}
export function pickHeartFace(meta: MirrorMeta, pair: number, side: 'A' | 'B'): MirrorMeta {
  if (!HEART_REG.some((f) => f.pair === pair && f.side === side)) return meta;
  return { ...meta, heart: { ...meta.heart, pick: { ...meta.heart.pick, [pair]: side } } };
}
/** The faces in force for a new run (one per pair, the picked side, default A), with ranks. Empty under 素镜. */
export function activeHeart(meta: Pick<MirrorMeta, 'heart'>): Partial<Record<HeartFaceId, number>> {
  const out: Partial<Record<HeartFaceId, number>> = {};
  if (meta.heart.plain) return out;
  for (const f of HEART_REG) {
    const side = meta.heart.pick[f.pair] ?? 'A';
    const r = meta.heart.ranks[f.id] ?? 0;
    if (f.side === side && r > 0) out[f.id] = r;
  }
  return out;
}

// ───────────────────────────────────────────── 今日镜 (§17.7)
/** 候签 index of a day: term·3 + pentad. */
export function slipOf(day: DateKey): number {
  const tc = termContext(fromKey(day));
  return tc.current.index * 3 + tc.pentad;
}
/** Today's mirror: seed hashString('mirror:' + day) fixes the map, 3 companions, a 灵 boon, the 节气 and one 镜蚀. */
export function dailySpec(day: DateKey, meta: Pick<MirrorMeta, 'mapsOpen' | 'deeds'>, unlocked: readonly CharacterId[]): DailySpec {
  const seed = hashString('mirror:' + day);
  const rng = makeRng(seed);
  const maps = MAP_REG.slice(0, Math.max(1, Math.min(3, meta.mapsOpen))).map((m) => m.id);
  const map = maps[Math.floor(rng() * maps.length)];
  const order = COMPANION_REG.map((c) => c.id).filter((id) => unlocked.includes(id));
  const chars = pickDistinct(rng, order.length ? order : ['scholar' as CharacterId], 3);
  const u = unlocksOf(meta);
  const boons = ITEM_REG.map((i) => i.id).filter((id) => ITEMS[id].tier === 2 && !ITEMS[id].curse && u.items.has(id));
  const boon = boons[Math.floor(rng() * boons.length)];
  const mutator = MUTATOR_REG[Math.floor(rng() * MUTATOR_REG.length)].id;
  const tc = termContext(fromKey(day));
  return { day, seed, map, chars, boon, term: TERM_MOD_REG[tc.current.index].id, mutator, slip: tc.current.index * 3 + tc.pentad };
}

// ───────────────────────────────────────────── settlement
const RECORD_LOWER: readonly RecordId[] = ['fastestClear'];
const bossesOf = (W: number) => { let n = 0; for (let w = 10; w <= W; w += 10) n++; return n; };
function stageAtLeast(codex: MirrorMeta['codex'], key: CodexKey, s: CodexStage): void {
  if ((codex[key] ?? 0) < s) codex[key] = s;
}
function killStage(n: number): CodexStage {
  return n >= 100 ? 3 : n >= 10 ? 2 : n >= 1 ? 1 : 0;
}
/** Codex categories and the chapter rim each earns once every page in it reaches 识. */
const CHAPTERS: readonly { rim: RimId; keys: () => CodexKey[] }[] = [
  { rim: 'ruishou', keys: () => MONSTER_REG.map((m) => `mon:${m.id}` as CodexKey) },
  { rim: 'huaniao', keys: () => ITEM_REG.map((m) => `item:${m.id}` as CodexKey) },
  { rim: 'bagua', keys: () => WEAPON_REG.map((m) => `wpn:${m.id}` as CodexKey) },
  { rim: 'panchi', keys: () => BOSS_REG.map((m) => `boss:${m.id}` as CodexKey) },
  { rim: 'lianhu', keys: () => COMPANION_REG.map((m) => `char:${m.id}` as CodexKey) },
  { rim: 'yuegong', keys: () => [...ELITE_REG.map((m) => `elite:${m.id}` as CodexKey), ...TREASURE_REG.map((m) => `trs:${m.id}` as CodexKey)] },
];

/** Fold a won wave's kills into the codex tallies (session.waveWon and the fatal wave). */
export function foldKills(meta: MirrorMeta, killsBy: Readonly<Record<string, number>>): MirrorMeta {
  const tally = { ...meta.tally };
  const codex = { ...meta.codex };
  for (const id in killsBy) {
    const n = Math.max(0, Math.floor(killsBy[id] ?? 0));
    if (!n) continue;
    const kind = MONSTER_REG.some((m) => m.id === id) ? 'mon' : ELITE_REG.some((m) => m.id === id) ? 'elite'
      : TREASURE_REG.some((m) => m.id === id) ? 'trs' : BOSS_REG.some((m) => m.id === id) ? 'boss' : null;
    if (!kind) continue;
    const k = `kill:${id}` as const;
    tally[k] = (tally[k] ?? 0) + n;
    stageAtLeast(codex, `${kind}:${id}` as CodexKey, killStage(tally[k]!));
  }
  return { ...meta, tally, codex };
}

/**
 * Settle a finished run into meta (not its pay): deeds and the unlocks they open, codex, tallies,
 * bests, records, seals, titles, mastery, 镜屑, 今日镜 (候签, 七日镜, 月印), maps and 镜境 opened.
 */
export function settleMeta(meta: MirrorMeta, run: RunSave, cause: EndCause, today: DateKey): { meta: MirrorMeta; report: Omit<RunReport, 'pay'> } {
  const W = run.wave;
  const zhaopo = W >= 30;
  const rs = { ...run.runStats, cleared30: zhaopo ? 1 : run.runStats.cleared30 ?? 0 };
  const before = unlocksOf(meta);
  // deeds
  const deeds = { ...meta.deeds };
  for (const d of DEED_REG) {
    // 墨龙图's second way (hold 4 墨宝) is open to every companion, not only its own
    const altHit = 'alt' in d && !!d.alt && (rs[d.alt.stat] ?? 0) >= d.alt.goal;
    if ('char' in d && d.char && d.char !== run.char && !altHit) continue;
    if ('minDiff' in d && d.minDiff !== undefined && run.diff < d.minDiff) continue;
    let v = Math.max(0, rs[d.stat] ?? 0);
    if (altHit) v = d.goal;
    const prev = deeds[d.id] ?? 0;
    deeds[d.id] = Math.min(d.goal, d.mode === 'sum' ? prev + v : Math.max(prev, v));
  }
  const after = unlocksOf({ deeds });
  const unlocks: (WeaponId | ItemId)[] = [
    ...[...after.weapons].filter((w) => !before.weapons.has(w)), ...[...after.items].filter((i) => !before.items.has(i)),
  ];
  // codex and tallies
  const codex = { ...meta.codex };
  const tally = { ...meta.tally };
  stageAtLeast(codex, `char:${run.char}`, zhaopo ? 3 : 2);
  stageAtLeast(codex, `map:${run.map}`, zhaopo ? 3 : 2);
  tally[`play:${run.char}`] = (tally[`play:${run.char}`] ?? 0) + 1;
  if (zhaopo) tally[`win:${run.char}`] = (tally[`win:${run.char}`] ?? 0) + 1;
  for (const wp of run.weapons) {
    stageAtLeast(codex, `wpn:${wp.id}`, zhaopo ? 3 : 2);
    if (zhaopo) tally[`hold:${wp.id}`] = (tally[`hold:${wp.id}`] ?? 0) + 1;
  }
  for (const id in run.items) {
    if (!(run.items[id as ItemId] ?? 0)) continue;
    stageAtLeast(codex, `item:${id as ItemId}`, zhaopo ? 3 : 2);
    if (zhaopo) tally[`hold:${id}`] = (tally[`hold:${id}`] ?? 0) + 1;
  }
  // bests and records
  const bests = { ...meta.bests };
  const bk = `${run.char}|${run.map}|${run.diff}|${run.heat}${run.plain ? '|p' : ''}` as keyof MirrorMeta['bests'];
  if (!run.daily && (bests[bk]?.wave ?? -1) < W) bests[bk] = { wave: W, heat: run.heat, at: today };
  const records = { ...meta.records };
  const newRecords: RecordId[] = [];
  const rec = (id: RecordId, v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v) || v <= 0) return;
    const cur = records[id];
    const better = cur === undefined || (RECORD_LOWER.includes(id) ? v < cur : v > cur);
    if (better) { records[id] = v; newRecords.push(id); }
  };
  // wave time up to wave 30 only (endless waves after it don't count against the record)
  const ms30 = rs[MS_AT_30] ?? (W === 30 ? run.ms : 0);
  if (zhaopo && ms30 > 0) rec('fastestClear', Math.round(ms30 / 6000) / 10);
  rec('bigHit', rs.peakHit);
  rec('mostSummons', rs.peakSummons);
  rec('mostSwords', rs.peakSwordsAir);
  rec('highestDrunk', rs.peakDrunk);
  rec('noHitStreak', rs.peakNoHit);
  if (W > 30) rec('deepest', W);
  rec('mostMoon', rs.moonCollected);
  // seals and titles
  const seals = { ...meta.seals };
  const newSeals: SealKey[] = [];
  const seal = (k: SealKey) => { if (!seals[k]) { seals[k] = true; newSeals.push(k); } };
  if (zhaopo) {
    seal(`${run.char}|${run.diff}`);
    for (const h of [5, 10, 15, 20]) if (run.heat >= h) seal(`vow|${h}`);
    if (DIFF_REG.every((_, i) => seals[`${run.char}|${i}` as SealKey])) seal(`heart|${run.char}`);
  }
  const titles = [...meta.titles];
  const newTitles: TitleId[] = [];
  const title = (t: TitleId) => { if (!titles.includes(t)) { titles.push(t); newTitles.push(t); } };
  const st = computeStats(run);
  if (zhaopo && st.summonCap >= 8) title('paintImmortal');
  if (zhaopo && st.swords >= 6) title('swordImmortal');
  if ((rs.peakNet ?? 0) >= 50) title('netAll');
  if (zhaopo && run.char === 'cat' && run.lives >= 1) title('nineLives');
  if (W >= 50) title('mirrorMan');
  if (zhaopo && run.diff === 5) title('voidWalker');
  // mastery
  const bosses = bossesOf(W);
  const mBefore = meta.mastery[run.char] ?? 0;
  const mAfter = mBefore + W + 5 * bosses + (zhaopo ? 20 : 0);
  const lvlBefore = masteryLevel(mBefore), lvlAfter = masteryLevel(mAfter);
  if (lvlAfter >= 1) title(`rujing:${run.char}`);
  if (lvlAfter >= 10) title(`xian:${run.char}`);
  // 镜屑
  const firstBoss = newFirsts(meta, run).filter((k) => k.startsWith('boss:')).length;
  let dust = Math.round((W + 5 * bosses + 10 * firstBoss) * (1 + run.heat / 10) * (run.plain ? 1.2 : 1) * (run.diff === 0 ? 0.5 : 1));
  // 今日镜
  let daily = dailyFor(meta, today);
  const slips = { ...meta.slips };
  let slip: number | null = null;
  if (run.daily) {
    daily = { ...daily, best: Math.max(daily.best, W) };
    if (W >= 10) {
      const idx = slipOf(run.startedDay);
      if (!slips[idx]) { slips[idx] = today; slip = idx; }
      const since = addDays(today, -6);
      const weekDays = [...new Set([...daily.weekDays.filter((d) => d >= since), today])].sort();
      daily = { ...daily, weekDays };
      const weekDue = !daily.weekPaid || daily.weekPaid < addDays(today, -6);
      if (weekDays.length >= PAY.weekNeed && weekDue) { dust += PAY.weekDust; daily = { ...daily, weekPaid: today }; }
    }
    if (W >= 30) seal(`moon|${run.startedDay}`);
  }
  const nSlips = Object.keys(slips).length;
  if (nSlips >= 36) title('migrant');
  if (nSlips >= 72) title('seasons');
  // maps and 镜境
  let mapsOpen = meta.mapsOpen;
  for (const m of MAP_REG) {
    const u = MAPS[m.id].unlock;
    if (u && run.map === u.map && W >= u.wave) mapsOpen = Math.max(mapsOpen, MAP_REG.findIndex((x) => x.id === m.id) + 1) as 1 | 2 | 3;
  }
  let diffMax = meta.diffMax;
  for (const d of DIFFS) if (d.unlock && run.diff >= d.unlock.diff && W >= d.unlock.wave && d.index > diffMax) diffMax = d.index;
  // rims: the maps you have opened, and codex chapters complete at 识
  const rims = [...meta.rims];
  for (let i = 0; i < mapsOpen; i++) { const r = MAPS[MAP_REG[i].id].rim; if (!rims.includes(r)) rims.push(r); }
  for (const c of CHAPTERS) if (!rims.includes(c.rim) && c.keys().every((k) => (codex[k] ?? 0) >= 2)) rims.push(c.rim);
  const next: MirrorMeta = {
    ...meta, deeds, codex, tally, bests, records, seals, titles, dust: meta.dust + dust, slips, daily, mapsOpen, diffMax, rims,
    mastery: { ...meta.mastery, [run.char]: mAfter }, rim: meta.rim ?? rims[0] ?? null,
  };
  const report: Omit<RunReport, 'pay'> = {
    run, cause, W, zhaopo, dust,
    mastery: { char: run.char, before: mBefore, after: mAfter, level: lvlAfter, levelUp: lvlAfter > lvlBefore },
    unlocks, records: newRecords, firsts: newFirsts(meta, run), seals: newSeals, titles: newTitles, slip,
  };
  return { meta: next, report };
}

/** Boss waves cleared by a run (10, 20, 30, 40 …). */
export const clearedBosses = (run: Pick<RunSave, 'wave'>) => bossesOf(run.wave);
