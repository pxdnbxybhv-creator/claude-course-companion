// Pure rules of the in-world mini-games (no DOM, no three.js): the fish of the lotus lake and the
// reel, pitch-pot flight and scoring, the river a lantern floats down, where Big Ginger hides today,
// and the lines of an in-world 飞花令. Tested in tests/minigames.test.ts.
import { hashString, makeRng, type Rng } from '../../../../core/rng';
import { ANCHORS, RIVER, RIVER_LAKE_BREAK, type RegionId, type XZ } from '../../map';
import { POEMS } from '../../../../data/poems';

// ───────────────────────────── fishing ─────────────────────────────

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legend' | 'junk';

export interface FishSpecies {
  id: string;
  zh: string;
  en: string;
  rarity: Rarity;
  /** Relative chance of a bite being this fish. */
  weight: number;
  /** Length range, cm. */
  cm: [number, number];
  /** How lively it is on the line (fish marker speed), 0.6 .. 2. */
  fight: number;
  /** Body colour for the catch card and the splash. */
  color: string;
  verseZh: string;
  srcZh: string;
  verseEn: string;
  /** Seasons (months 1..12) when it is more plentiful (×2). */
  peak?: number[];
  /** Only at night (×3 then, ×0.3 by day). */
  night?: boolean;
}

export const FISH: FishSpecies[] = [
  { id: 'crucian', zh: '鲫鱼', en: 'Crucian carp', rarity: 'common', weight: 30, cm: [9, 26], fight: 0.75, color: '#8a8a6a',
    verseZh: '青箬笠，绿蓑衣，斜风细雨不须归。', srcZh: '张志和《渔歌子》', verseEn: 'Green bamboo hat, green straw cape: in slanting wind and fine rain, no need to go home.' },
  { id: 'carp', zh: '鲤鱼', en: 'Carp', rarity: 'common', weight: 26, cm: [22, 58], fight: 1.0, color: '#b0874a',
    verseZh: '江南可采莲，莲叶何田田。鱼戏莲叶间。', srcZh: '汉乐府《江南》', verseEn: 'Lotus to pick south of the river, leaves so lush — and fish at play among them.' },
  { id: 'dace', zh: '白鲦', en: 'White minnow', rarity: 'common', weight: 18, cm: [6, 16], fight: 1.35, color: '#c9ccc4',
    verseZh: '鲦鱼出游从容，是鱼之乐也。', srcZh: '《庄子·秋水》', verseEn: '“See the minnows darting about at their ease — that is the joy of fish.”' },
  { id: 'blackcarp', zh: '青鱼', en: 'Black carp', rarity: 'uncommon', weight: 10, cm: [40, 110], fight: 1.2, color: '#3f4a52',
    verseZh: '潭中鱼可百许头，皆若空游无所依。', srcZh: '柳宗元《小石潭记》', verseEn: 'A hundred fish in the pool, all seeming to swim in empty air, resting on nothing.', night: true },
  { id: 'mandarin', zh: '鳜鱼', en: 'Mandarin fish', rarity: 'uncommon', weight: 8, cm: [20, 48], fight: 1.45, color: '#8f7a3a',
    verseZh: '西塞山前白鹭飞，桃花流水鳜鱼肥。', srcZh: '张志和《渔歌子》', verseEn: 'White egrets before Xisai Hill; peach petals on the stream, and the mandarin fish are fat.', peak: [3, 4, 5] },
  { id: 'sandal', zh: '一只草鞋', en: 'An old straw sandal', rarity: 'junk', weight: 5, cm: [24, 27], fight: 0.6, color: '#b89a64',
    verseZh: '竹杖芒鞋轻胜马，谁怕？', srcZh: '苏轼《定风波》', verseEn: 'Bamboo staff and straw sandals, lighter than a horse — who’s afraid?' },
  { id: 'koi', zh: '锦鲤', en: 'Golden koi', rarity: 'rare', weight: 2.6, cm: [30, 72], fight: 1.6, color: '#e08a2e',
    verseZh: '沙鸥翔集，锦鳞游泳。', srcZh: '范仲淹《岳阳楼记》', verseEn: 'Gulls gather and wheel; brocade scales swim below.' },
  { id: 'dragon', zh: '龙鱼', en: 'Dragon carp', rarity: 'legend', weight: 0.35, cm: [90, 160], fight: 1.95, color: '#c0412f',
    verseZh: '每暮春之际，有黄鲤鱼逆流而上，得者便化为龙。', srcZh: '《三秦记》', verseEn: 'Each late spring golden carp swim upstream; those who leap the Gate become dragons.' },
  { id: 'kun', zh: '鲲', en: 'The Kun', rarity: 'legend', weight: 0.08, cm: [999, 999], fight: 2.0, color: '#3d5a73',
    verseZh: '北冥有鱼，其名为鲲。鲲之大，不知其几千里也。', srcZh: '《庄子·逍遥游》', verseEn: 'In the northern dark there is a fish called Kun. How big? Nobody knows how many thousand li.' },
];

export const FISH_BY_ID: Record<string, FishSpecies> = Object.fromEntries(FISH.map((f) => [f.id, f]));

/** The chance of each species right now (sums to 1). */
export function fishOdds(o: { month: number; night: boolean }): { species: FishSpecies; p: number }[] {
  const w = FISH.map((f) => {
    let k = f.weight;
    if (f.peak?.includes(o.month)) k *= 2;
    if (f.night) k *= o.night ? 3 : 0.3;
    return k;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return FISH.map((species, i) => ({ species, p: w[i] / sum }));
}

export interface Catch { species: FishSpecies; cm: number }

/** Which fish took the bait, and how big (small ones are commoner). */
export function rollFish(rng: () => number, o: { month: number; night: boolean }): Catch {
  const odds = fishOdds(o);
  let u = rng();
  let species = odds[odds.length - 1].species;
  for (const e of odds) {
    if (u < e.p) { species = e.species; break; }
    u -= e.p;
  }
  const [a, b] = species.cm;
  const cm = Math.round((a + (b - a) * Math.pow(rng(), 1.7)) * 10) / 10;
  return { species, cm };
}

/** Seconds until a bite, shortened by the fisher's ability. */
export function biteDelay(rng: () => number, fishFactor = 1): number {
  return (2.2 + rng() * 5.5) / Math.max(1, fishFactor);
}

/**
 * The reel: a zone the player lifts (hold) against gravity, and the fish darting about. Keep the
 * fish inside the zone to fill the catch meter; let it out and the meter drains.
 */
export interface Reel {
  fish: number;       // 0..1 (bottom → top)
  fishV: number;
  fishGoal: number;
  zone: number;       // centre of the zone, 0..1
  zoneV: number;
  zoneW: number;      // full width, 0..1
  progress: number;   // 0..1; ≥ 1 caught, ≤ 0 escaped
  time: number;
}

export function newReel(zoneW: number): Reel {
  return { fish: 0.5, fishV: 0, fishGoal: 0.5, zone: 0.35, zoneV: 0, zoneW, progress: 0.3, time: 0 };
}

/** Zone width for a fish: lively fish get a narrower zone; the fisher's ability widens it. */
export function reelZone(fight: number, fishFactor = 1): number {
  return Math.min(0.46, (0.3 - (fight - 1) * 0.07) * (fishFactor > 1 ? 1 + (fishFactor - 1) * 0.5 : 1));
}

export function inZone(r: Reel): boolean {
  return Math.abs(r.fish - r.zone) <= r.zoneW / 2;
}

/** Advance the reel by dt (s). Returns 'caught', 'lost' or null (still fighting). */
export function stepReel(r: Reel, dt: number, holding: boolean, fight: number, rng: () => number): 'caught' | 'lost' | null {
  r.time += dt;
  // the fish picks a new place to dart to every so often (livelier fish more often and farther)
  if (rng() < dt * (0.6 + fight * 0.9)) r.fishGoal = Math.min(0.97, Math.max(0.03, r.fish + (rng() - 0.5) * (0.35 + fight * 0.35)));
  const pull = (r.fishGoal - r.fish) * (2.2 + fight * 2.2);
  r.fishV += (pull - r.fishV * 3.2) * dt;
  r.fish = Math.min(1, Math.max(0, r.fish + r.fishV * dt));
  // the zone: hold to lift, let go and it sinks
  r.zoneV += (holding ? 2.6 : -2.2) * dt;
  r.zoneV *= Math.pow(0.35, dt);
  r.zone += r.zoneV * dt;
  const h = r.zoneW / 2;
  if (r.zone < h) { r.zone = h; r.zoneV = Math.max(0, r.zoneV) * -0.3; }
  if (r.zone > 1 - h) { r.zone = 1 - h; r.zoneV = Math.min(0, r.zoneV) * -0.3; }
  // the meter
  r.progress += (inZone(r) ? 0.34 : -0.2 - fight * 0.04) * dt;
  if (r.progress >= 1) { r.progress = 1; return 'caught'; }
  if (r.progress <= 0) { r.progress = 0; return 'lost'; }
  return null;
}

// ───────────────────────────── pitch-pot 投壶 ─────────────────────────────

/** Pot geometry (metres, relative to the pot's centre on the ground). */
export const POT = { mouthR: 0.1, mouthY: 0.72, earOff: 0.19, earR: 0.05, rimR: 0.14, dist: 3.2, g: 9.81, launchY: 1.15, pitch: 0.62 };

export type PotHit = 'hu' | 'er' | 'yi' | 'miss';

/** Where an arrow thrown with yaw offset `aim` (rad, + to the right) and `power` 0..1 crosses the mouth height. */
export function throwFlight(aim: number, power: number, dist = POT.dist): { x: number; z: number; t: number } {
  const v = 4.2 + power * 2.2;
  const vh = v * Math.cos(POT.pitch), vy = v * Math.sin(POT.pitch);
  const dy = POT.launchY - POT.mouthY;
  // y(t) = launchY + vy t − g t²/2 = mouthY, the descending root
  const t = (vy + Math.sqrt(vy * vy + 2 * POT.g * dy)) / POT.g;
  const along = vh * t;
  // player at (0, dist) facing −z toward the pot at the origin; + aim swings to the right (+x)
  return { x: Math.sin(aim) * along, z: dist - Math.cos(aim) * along, t };
}

/** The arrow in flight at time t (pot-local metres; y above the ground), with its velocity. */
export function flightAt(aim: number, power: number, t: number, dist = POT.dist): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  const v = 4.2 + power * 2.2;
  const vh = v * Math.cos(POT.pitch), vy = v * Math.sin(POT.pitch);
  const s = Math.sin(aim), c = Math.cos(aim);
  return { x: s * vh * t, y: POT.launchY + vy * t - (POT.g * t * t) / 2, z: dist - c * vh * t, vx: s * vh, vy: vy - POT.g * t, vz: -c * vh };
}

/** The power that lands an arrow dead centre at this distance (for aim help and tests). */
export function idealPower(dist = POT.dist): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (throwFlight(0, m, dist).z > 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** 壶口 in the mouth, 贯耳 through an ear, 倚竿 leaning on the rim, or a miss. */
export function classifyThrow(x: number, z: number): PotHit {
  const r = Math.hypot(x, z);
  if (r <= POT.mouthR) return 'hu';
  for (const s of [-1, 1]) if (Math.hypot(x - s * POT.earOff, z) <= POT.earR) return 'er';
  if (r <= POT.rimR) return 'yi';
  return 'miss';
}

export const HIT_POINTS: Record<PotHit, number> = { hu: 10, er: 15, yi: 5, miss: 0 };

export interface PotScore {
  total: number;
  hits: number;
  /** Named feats: 有初 first arrow in, 连中 in a row, 贯耳 an ear, 全壶 all eight. */
  feats: { zh: string; en: string; pts: number }[];
}

/** Score a round of arrows (the traditional feats earn bonuses). */
export function scoreRound(results: PotHit[]): PotScore {
  let total = 0, hits = 0, run = 0, bestRun = 0, ears = 0;
  const feats: PotScore['feats'] = [];
  results.forEach((h) => {
    total += HIT_POINTS[h];
    if (h === 'miss') { run = 0; return; }
    hits++;
    run++;
    if (h === 'er') ears++;
    if (run >= 2) total += 3;
    bestRun = Math.max(bestRun, run);
  });
  if (results[0] && results[0] !== 'miss') { total += 5; feats.push({ zh: '有初', en: 'First arrow in', pts: 5 }); }
  if (bestRun >= 2) feats.push({ zh: `连中${bestRun}`, en: `${bestRun} in a row`, pts: 3 * (bestRun - 1) });
  if (ears) feats.push({ zh: '贯耳', en: 'Through the ear', pts: ears * 15 });
  if (results.length >= 8 && hits === results.length) { total += 20; feats.push({ zh: '全壶', en: 'Every arrow', pts: 20 }); }
  return { total, hits, feats };
}

// ───────────────────────────── the river ─────────────────────────────

export interface RiverPath {
  pts: XZ[];
  /** Cumulative length at each point. */
  acc: number[];
  length: number;
  /** Position, unit direction of flow and half-width at distance s along the path. */
  at(s: number): { x: number; z: number; dx: number; dz: number; w: number };
  /** Distance along the path of the point nearest to p, and how far p is from the centre line. */
  project(p: XZ): { s: number; d: number };
}

/** A polyline with a lookup by distance. */
export function makePath(pts: (XZ & { w?: number })[]): RiverPath {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const length = acc[acc.length - 1];
  const seg = (s: number) => {
    let i = 1;
    while (i < pts.length - 1 && acc[i] < s) i++;
    return i;
  };
  return {
    pts, acc, length,
    at(s) {
      const c = Math.max(0, Math.min(length, s));
      const i = seg(c);
      const a = pts[i - 1], b = pts[i];
      const L = acc[i] - acc[i - 1] || 1;
      const k = (c - acc[i - 1]) / L;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, w: (a.w ?? 3) + ((b.w ?? 3) - (a.w ?? 3)) * k };
    },
    project(p) {
      let best = { s: 0, d: Infinity };
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez || 1;
        const k = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2));
        const x = a.x + ex * k, z = a.z + ez * k;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < best.d) best = { s: acc[i - 1] + k * Math.sqrt(L2), d };
      }
      return best;
    },
  };
}

/** The river below the lake, from where it leaves the lake to the edge of the world (flowing west). */
export function lowerRiver(): RiverPath {
  return makePath(RIVER.slice(RIVER_LAKE_BREAK));
}

/** A lantern's drift: along the flow, swaying gently across it, never leaving the banks. */
export function lanternDrift(path: RiverPath, s: number, lane: number, t: number): { x: number; z: number; heading: number } {
  const p = path.at(s);
  // the side-to-side sway, within 55 % of the half-width
  const off = Math.max(-0.55, Math.min(0.55, lane + Math.sin(t * 0.23 + s * 0.08) * 0.18)) * p.w;
  return { x: p.x - p.dz * off, z: p.z + p.dx * off, heading: Math.atan2(p.dx, p.dz) + Math.sin(t * 0.4 + lane * 5) * 0.4 };
}

// ───────────────────────────── where Big Ginger hides today ─────────────────────────────

export interface CatSpot {
  id: string;
  region: RegionId;
  x: number;
  z: number;
  whereZh: string;
  whereEn: string;
  /** The clue an NPC gives. */
  clueZh: string;
  clueEn: string;
}

const off = (a: XZ, dx: number, dz: number) => ({ x: a.x + dx, z: a.z + dz });

/** Spots away from the garden (the garden cat of hidden.ts sleeps under a plant there). */
export const CAT_SPOTS: CatSpot[] = [
  { id: 'market', region: 'village', ...off(ANCHORS.market, 3.2, 1.6), whereZh: '集市的竹筐里', whereEn: 'in a basket at the market',
    clueZh: '今早集市上卖鱼的直嚷嚷，说少了一条小鱼干……', clueEn: 'The fishmonger at the market was shouting this morning — a dried fish has gone missing…' },
  { id: 'teahouse', region: 'village', ...off(ANCHORS.teahouse, -3.4, 3.6), whereZh: '茶馆门前的条凳边', whereEn: 'by the bench in front of the teahouse',
    clueZh: '我店门口的条凳边上暖和，总有个胖影子趴着。', clueEn: 'It is warm by the benches outside my shop. There is often a fat shadow lying there.' },
  { id: 'steps', region: 'village', ...off(ANCHORS.lanternSteps, 2.6, -2.2), whereZh: '河边的石阶上', whereEn: 'on the river steps',
    clueZh: '河边石阶上，有猫在看水里的灯影。', clueEn: 'Someone on the river steps was watching lantern light on the water — someone with whiskers.' },
  { id: 'dock', region: 'lake', ...off(ANCHORS.dock, -2.4, 3.4), whereZh: '渡口的渔篓旁', whereEn: 'by the fish creel at the dock',
    clueZh: '老渔翁说，他的鱼篓最近总是轻了。', clueEn: 'The old fisherman says his creel keeps getting lighter.' },
  { id: 'pavilion', region: 'lake', ...off(ANCHORS.waterPavilion, -3, 3), whereZh: '水榭边的荷叶下', whereEn: 'under the lotus leaves by the water pavilion',
    clueZh: '荷塘水榭那边，荷叶底下有什么在打呼噜。', clueEn: 'Over at the water pavilion, something under the lotus leaves is snoring.' },
  { id: 'clearing', region: 'bamboo', ...off(ANCHORS.bambooClearing, 3, -3.2), whereZh: '竹林石桌下', whereEn: 'under the stone table in the bamboo',
    clueZh: '竹林里的琴声停了一会儿——有只猫跳上了琴桌。', clueEn: 'The qin in the bamboo stopped for a moment — a cat had jumped onto the table.' },
  { id: 'shrine', region: 'bamboo', ...off(ANCHORS.bambooShrine, 2.6, 2), whereZh: '竹林小祠旁', whereEn: 'beside the little shrine in the bamboo',
    clueZh: '竹林深处的小祠，供果少了一个。', clueEn: 'At the shrine deep in the bamboo, one offering has vanished.' },
  { id: 'bench', region: 'plum', ...off(ANCHORS.plumBench, 2.2, 1.8), whereZh: '梅岭石凳旁', whereEn: 'by the stone bench on Plum Ridge',
    clueZh: '梅岭上有落梅，也有一串梅花似的小脚印。', clueEn: 'On Plum Ridge there are fallen petals — and a trail of little plum-blossom pawprints.' },
  { id: 'temple', region: 'mountain', ...off(ANCHORS.templeGate, -3.2, 2.4), whereZh: '山门石狮脚下', whereEn: 'at the foot of the temple gate',
    clueZh: '山门的师父说，有只猫天天来听经。', clueEn: 'The monk at the temple gate says a cat comes every day to hear the sutras.' },
  { id: 'pool', region: 'mountain', ...off(ANCHORS.waterfallPool, -4, 3), whereZh: '瀑布潭边', whereEn: 'by the waterfall pool',
    clueZh: '山上瀑布边凉快，胖子最怕热。', clueEn: 'It is cool by the waterfall up the mountain, and fat cats hate the heat.' },
];

/** Today's hiding place: the same all day, a different place most days. */
export function catSpotFor(day: string): CatSpot {
  const rng = makeRng(hashString('ginger:' + day));
  return CAT_SPOTS[Math.floor(rng() * CAT_SPOTS.length)];
}

// ───────────────────────────── 飞花令 with the poet ─────────────────────────────

/** Characters the poet sets as the 令 (each has plenty of lines in poems.ts). */
export const LING = ['月', '花', '春', '风', '山', '水', '云', '雪', '夜', '人'];

/** Every clause (句) of the collected poems, with its source. */
export function clauses(): { text: string; src: string }[] {
  const out: { text: string; src: string }[] = [];
  const seen = new Set<string>();
  for (const p of POEMS) {
    for (const line of p.lines) {
      for (const c of line.split(/[，。？！；、]/)) {
        const t = c.trim();
        if (t.length < 4 || t.length > 9 || seen.has(t)) continue;
        seen.add(t);
        out.push({ text: t, src: `${p.author}《${p.title}》` });
      }
    }
  }
  return out;
}

export interface FeihuaTurn {
  /** The poet's line (contains the 令). */
  poet: { text: string; src: string };
  /** Three lines to choose from; exactly one contains the 令. */
  options: { text: string; src: string }[];
  answer: number;
}

/** `n` turns for one 令字, drawn without repeats. */
export function feihuaTurns(ling: string, n: number, rng: Rng, used = new Set<string>()): FeihuaTurn[] {
  const all = clauses();
  const withL = all.filter((c) => c.text.includes(ling) && !used.has(c.text));
  const without = all.filter((c) => !c.text.includes(ling));
  const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(withL);
  shuffle(without);
  const turns: FeihuaTurn[] = [];
  while (turns.length < n && withL.length >= 2 && without.length >= 2) {
    const poet = withL.pop()!, right = withL.pop()!;
    used.add(poet.text); used.add(right.text);
    const options = shuffle([right, without.pop()!, without.pop()!]);
    turns.push({ poet, options, answer: options.indexOf(right) });
  }
  return turns;
}

/** 令字 with enough lines for `n` turns. */
export function playableLing(n: number): string[] {
  const all = clauses();
  return LING.filter((l) => all.filter((c) => c.text.includes(l)).length >= n * 2);
}
