// 轻功 · jumping with a purpose. Climbs in every place (crates and a woodshed roof in the water
// town, boulders and a pine limb at the bamboo grove's edge, stones up to a lookout on Plum Ridge,
// a ledge by the waterfall, an old pine by the pagoda, scholar rocks on the lotus shore, the stone
// bridges' parapets), the 梅花桩 course in the bamboo, stepping stones across the river, and
// 铜钱 — about forty coin spots a day, picked from all of them, some only a companion's gift reaches.
import type { WorldCtx, WorldFeature } from '../../types';
import { hashString } from '../../../../core/rng';
import { toKey } from '../../../../core/date';
import { play, record } from '../../../../app/play';
import { today } from '../../../../app/store';
import { feature, type Bag } from '../kit';
import { Builder } from './build';
import { CoinField, type CoinSpot } from './coins';
import { DECK_COINS, SITES, type Site } from './sites';
import { POLE_COINS, buildPoles } from './poles';
import { buildStones } from './stones';
import { buildParapets } from './parapets';
import { buildLookout } from './lookout';
import { DAILY_SPOTS, pickDaily } from './logic';

const STORE = 'banmu.parkour.v1';
/** Today's taken coins in play state: a daily count per coin (it rolls over with the day, and goes in backups). */
const TAKEN = 'pk:';

/** The world's day (a preview of another day keeps its own coins). */
function dayOf(ctx: WorldCtx): string {
  const d = ctx.env.date;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Coins already picked up, by day, for as long as the page lives: the walk is torn down and rebuilt
 * each time you come back to it, and where the browser keeps nothing (a sandboxed frame) this is what
 * stops the same coins paying twice. Play state (daily counts) and localStorage are its mirrors.
 */
const takenByDay = new Map<string, Set<string>>();

/** Coins already picked up on `day` (`key`: the same day as a DateKey), from every record of them. */
function takenOn(day: string, key: string): Set<string> {
  let got = takenByDay.get(day);
  if (!got) {
    takenByDay.clear(); // only one day is ever wanted
    got = new Set();
    takenByDay.set(day, got);
  }
  for (const id of loadTaken(day)) got.add(id);
  const p = play.peek();
  if (p.daily.day === key) for (const k in p.daily.counts) if (k.startsWith(TAKEN)) got.add(k.slice(TAKEN.length));
  return got;
}

/** Remember a coin as taken today: here, in play state (while it is still that day) and in the browser. */
function markTaken(day: string, key: string, got: Set<string>, id: string): void {
  got.add(id);
  if (today.peek() === key) record(TAKEN + id);
  saveTaken(day, got);
}

/** Coins already picked up today (per viewer, in this browser). */
function loadTaken(day: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { day?: string; got?: unknown } | null;
    if (raw && raw.day === day && Array.isArray(raw.got)) return new Set(raw.got.filter((x): x is string => typeof x === 'string'));
  } catch { /* storage unavailable */ }
  return new Set();
}
function saveTaken(day: string, got: Set<string>): void {
  try { localStorage.setItem(STORE, JSON.stringify({ day, got: [...got] })); } catch { /* storage unavailable */ }
}

function buildSite(bag: Bag, ctx: WorldCtx, site: Site): void {
  const base = ctx.groundY(site.at.x, site.at.z);
  const b = new Builder(ctx, site.id, base);
  for (const p of site.props) b.add(p);
  b.finish(bag, ctx.regionGroup(site.region));
  if (import.meta.env.DEV) {
    // a prop set down inside a house or a clump of bamboo: say so (placement is by hand)
    for (const p of site.props) {
      if (p.kind === 'pine') continue;
      if (ctx.waterAt(p.x, p.z) !== null) continue;
      if (!ctx.isWalkable(p.x, p.z)) console.warn(`[parkour] ${site.id}: ${p.kind} at ${p.x},${p.z} is on unwalkable ground`);
    }
  }
}

const parkour = feature('parkour', (bag, ctx) => {
  const spots: CoinSpot[] = [];
  for (const site of SITES) {
    try {
      buildSite(bag, ctx, site);
      spots.push(...site.coins);
    } catch (e) { console.warn('[parkour] site', site.id, e); }
  }
  try { buildPoles(bag, ctx); spots.push(...POLE_COINS); } catch (e) { console.warn('[parkour] poles', e); }
  try { spots.push(...buildStones(bag, ctx)); } catch (e) { console.warn('[parkour] stones', e); }
  try { spots.push(...buildParapets(bag, ctx)); } catch (e) { console.warn('[parkour] parapets', e); }
  try { buildLookout(bag, ctx); } catch (e) { console.warn('[parkour] lookout', e); }
  // coins on what the places built: only where there is something to stand on
  for (const c of DECK_COINS) {
    const w = ctx.waterAt(c.x, c.z);
    if (w === null || ctx.groundY(c.x, c.z) > w + 0.1) spots.push(c);
  }

  const day = dayOf(ctx), key = toKey(ctx.env.date);
  const todays = pickDaily(spots, hashString(`coinspots:${day}`), DAILY_SPOTS);
  const taken = takenOn(day, key);
  const field = new CoinField(bag, ctx, todays, taken);
  field.onPick = (spot) => markTaken(day, key, taken, spot.id);
  bag.onDispose(() => field.dispose());
  bag.frame((dt, t) => field.update(dt, t));

  if (import.meta.env.DEV) {
    const w = window as unknown as { __parkour?: unknown };
    w.__parkour = { spots, todays, field, taken };
    bag.onDispose(() => { if (w.__parkour && (w.__parkour as { field: unknown }).field === field) delete w.__parkour; });
  }
});

export const PARKOUR_FEATURES: WorldFeature[] = [parkour];
