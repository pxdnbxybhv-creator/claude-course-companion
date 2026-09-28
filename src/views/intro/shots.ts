// 开篇 · 《月亮看见的》 — the shot table, every line on screen, the sync hits (pure data, spec §3–§5).
//
// Two cuts: the full cut (86.0 s) and the short cut (70.8 s, reduced motion and devices that
// measure slow). Both share 起 and 承 (0–49.2 s) exactly. Every Chinese line here is the spec's §5,
// verbatim; nothing on screen is written anywhere else (the date is the almanac's own line).
//
// Builder S reads HITS / ACTS / CUTS (score.ts, tests/intro-score.test.ts): an audible hit must have
// a sound within ±10 ms. tests/intro-shots.test.ts pins the tiling, the reading rule per line, the
// overlaps, the keep-rule memory and the layout rules.
import type { Cut } from '../../app/intro';
import type { SceneEnv } from '../../ink/scene-types';

// ---------------------------------------------------------------------------------------------- shots

export type ShotId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S7c' | 'S8' | 'S9' | 'S10' | 'S11' | 'S12' | 'S7s' | 'S9s' | 'S11s';
export interface Shot { id: ShotId; t0: number; t1: number; name: string }

const sh = (id: ShotId, t0: number, t1: number, name: string): Shot => ({ id, t0, t1, name });

const SHARED_SHOTS: Shot[] = [
  sh('S1', 0, 3.5, '触水'),
  sh('S2', 3.5, 7.9, '穿月'),
  sh('S3', 7.9, 19.0, '页边的塘'),
  sh('S4', 19.0, 26.4, '页成园'),
  sh('S5', 26.4, 39.5, '六十六回'),
  sh('S6', 39.5, 49.2, '清如许'),
];

const FULL_SHOTS: Shot[] = [
  ...SHARED_SHOTS,
  sh('S7', 49.2, 55.7, '镜中月'),
  sh('S7c', 55.7, 60.5, '一炷香'),
  sh('S8', 60.5, 67.1, '月宫'),
  sh('S9', 67.1, 71.4, '又一圈'),
  sh('S10', 71.4, 74.4, '信'),
  sh('S11', 74.4, 79.5, '入画'),
  sh('S12', 79.5, 86.0, '半亩'),
];

const SHORT_SHOTS: Shot[] = [
  ...SHARED_SHOTS,
  sh('S7s', 49.2, 54.2, '一窗'),
  sh('S9s', 54.2, 59.5, '又一圈'),
  sh('S11s', 59.5, 64.3, '入画'),
  sh('S12', 64.3, 70.8, '半亩'),
];

// ---------------------------------------------------------------------------------------------- text

export type TxtKind = 'cap' | 'quote' | 'label';
export interface Txt {
  id: string;
  kind: TxtKind;
  /** Each displayed line with its own in-time (film s). */
  lines: { zh: string; at: number }[];
  /** The whole caption's out-time. */
  out: number;
  /** Quotes: the WenKai by-line and the full accessible text (punctuation and attribution). */
  by?: string;
  aria?: string;
  /** Filled at run time: C22 (skyLine) and D (todayLine). The zh here is the sample the tests use. */
  live?: 'sky' | 'date';
}

/** Every string on screen, verbatim from spec §5. */
export const LINES = {
  C1a: '月亮每晚往下看。', C1b: '河里、井里、水缸里，都有一个它。',
  L1: '八月十四 · 秋分 · 雷始收声', C3a: '八月十四，', C3b: '它在读书笔记的页边看见了自己。',
  Q1: '半亩方塘一鉴开', Q1by: '宋·朱熹《观书有感》', Q1aria: '半亩方塘一鉴开。——宋·朱熹《观书有感》',
  slip: '半亩', N: '这塘就叫半亩吧。',
  C6a: '有个人种下一株梅，', C6b: '答应自己每天做一件小事。',
  C8a: '每做完一回，就画一个圈。', C8b: '月亮还当是在画它。',
  C10: '有几晚没有圈，水浑了，梅也淡了。',
  C12a: '月亮上的兔子一直在数。', C12b: '数到六十六，梅开满了。',
  Q3a: '问渠那得清如许', Q3b: '为有源头活水来', Q3by: '宋·朱熹', Q3aria: '问渠那得清如许？为有源头活水来。——宋·朱熹',
  C16: '铜镜里，有个假月亮在跟人打架。', X: '香没烧完，别的先放着。', Xs: '铜镜里打起来了。',
  C18a: '嫦娥一看，药一点没捣碎，', C18b: '月亮上倒多了好些坑。',
  C20: '刚才，有人碰了一下水面。', C21: '兔子抄了条近路，从画里走。',
  C22round: '园里的月亮，跟你窗外那个一样圆。', C22bent: '园里的月亮，跟你窗外那个一样弯。', C22half: '园里的月亮，跟你窗外那个一个样。',
  C22day: '你那边几点，画里就几点。',
  T: '半亩', K: '没有一张图，都是现画的。', D: '八月十八 · 秋分 · 蛰虫坯户',
  late: '研墨…', hint: '轻触水面', subOn: '一分多钟 · 有声音', subOff: '一分多钟',
} as const;

const T = (id: string, kind: TxtKind, out: number, lines: [string, number][], extra: Partial<Txt> = {}): Txt =>
  ({ id, kind, out, lines: lines.map(([zh, at]) => ({ zh, at })), ...extra });

const S = LINES;
const SHARED_TEXT: Txt[] = [
  T('C1', 'cap', 8.4, [[S.C1a, 1.0], [S.C1b, 3.6]]),
  T('L1', 'label', 19.3, [[S.L1, 8.6]]),
  T('C3', 'cap', 14.9, [[S.C3a, 8.6], [S.C3b, 9.1]]),
  T('Q1', 'quote', 19.0, [[S.Q1, 14.5]], { by: S.Q1by, aria: S.Q1aria }),
  T('slip', 'label', 19.3, [[S.slip, 15.8]]),
  T('N', 'cap', 19.05, [[S.N, 15.5]]),
  T('C6', 'cap', 26.35, [[S.C6a, 19.8], [S.C6b, 21.8]]),
  T('C8', 'cap', 32.8, [[S.C8a, 26.5], [S.C8b, 29.0]]),
  T('C10', 'cap', 38.15, [[S.C10, 33.1]]),
  T('C12', 'cap', 44.85, [[S.C12a, 38.3], [S.C12b, 39.5]]),
  T('Q3', 'quote', 49.2, [[S.Q3a, 43.9], [S.Q3b, 45.2]], { by: S.Q3by, aria: S.Q3aria }),
];

/** The S12 text, from the shot's start (full 79.5, short 64.3). */
function endText(s: number, end: number): Txt[] {
  return [
    T('C22', 'cap', s + 5.3, [[S.C22round, s]], { live: 'sky' }),
    T('T', 'label', s + 3.6, [[S.T, s + 0.7]]),
    T('D', 'label', end, [[S.D, s + 2.1]], { live: 'date' }),
    T('K', 'label', end, [[S.K, s + 2.2]]),
  ];
}

const FULL_TEXT: Txt[] = [
  ...SHARED_TEXT,
  T('C16', 'cap', 55.65, [[S.C16, 50.6]]),
  T('X', 'cap', 59.85, [[S.X, 55.8]]),
  T('C18', 'cap', 67.05, [[S.C18a, 61.0], [S.C18b, 63.0]]),
  T('C20', 'cap', 71.4, [[S.C20, 67.1]]),
  T('C21', 'cap', 79.15, [[S.C21, 74.6]]),
  ...endText(79.5, 86.0),
];

const SHORT_TEXT: Txt[] = [
  ...SHARED_TEXT,
  T('Xs', 'cap', 54.15, [[S.Xs, 49.4], [S.X, 50.1]]),
  T('C20', 'cap', 58.5, [[S.C20, 54.2]]),
  T('C21', 'cap', 64.25, [[S.C21, 59.7]]),
  ...endText(64.3, 70.8),
];

// ---------------------------------------------------------------------------------------------- hits

/** A sync point (film s). `audible: false` marks a picture-only beat (the score need not answer it). */
export interface Hit { t: number; id: string; audible?: boolean }

const H = (t: number, id: string, audible = true): Hit => (audible ? { t, id } : { t, id, audible: false });

const SHARED_HITS: Hit[] = [
  H(0, 'drip'), H(1.0, 'moon motif'), H(3.1, 'moon settles'), H(3.9, 'takeover', false),
  H(4.5, 'glints 1'), H(5.0, 'glints 2'), H(5.5, 'glints 3'), H(6.0, 'glints 4'), H(6.5, 'glints 5'), H(7.0, 'square glint'),
  H(9.0, 'thunder'), H(10.0, 'thunder 2'), H(11.0, 'thunder 3'), H(15.5, 'naming'), H(16.4, 'slip lifts'),
  H(19.6, 'moon wheel'), H(22.5, 'check-in 1'),
  H(26.5, '#2'), H(27.5, '#3'), H(28.5, '#6'), H(29.5, '#13'), H(30.5, '#22'), H(31.5, '#31'), H(32.5, '#39'),
  H(33.5, 'lapse'), H(33.7, 'rabbit leans', false), H(36.5, '#40 return'), H(37.5, '#50'), H(38.5, '#59'), H(39.5, '#66 bloom'),
  H(43.6, 'ear flick'), H(43.9, 'Q3 question', true), H(45.2, 'Q3 answer'),
];

const FULL_HITS: Hit[] = [
  ...SHARED_HITS,
  H(49.2, '笛 in 徵'), H(51.5, 'splat 1'), H(52.5, 'splat 2'), H(53.5, 'splat 3'), H(54.5, 'splat 4'),
  H(56.5, 'knock'), H(57.5, '炮'), H(59.8, 'twitch'), H(60.1, 'sneeze'), H(60.5, 'hard cut', false),
  H(61.0, 'fan rises'), H(61.5, 'thud 1'), H(62.5, 'thud 2'), H(63.5, 'rest', false), H(64.5, 'thud 3'),
  H(67.5, 'drip again'), H(68.3, 'ears'), H(73.5, '月 seal'), H(74.4, 'leap'), H(74.9, 'pagoda bell'),
  H(75.6, 'peach light'), H(76.0, 'plop'), H(77.5, 'lantern 1'), H(77.8, 'lantern 2'), H(78.1, 'lantern 3'),
  H(79.5, 'splash'), H(79.7, 'moon motif whole'), H(80.2, '半'), H(80.6, '亩'), H(81.5, '半亩 seal'),
  H(83.2, 'hop 1'), H(83.5, 'hop 2'), H(83.8, 'hop 3'), H(84.0, 'mailbox'), H(84.8, 'colophon alone'),
];

const SHORT_HITS: Hit[] = [
  ...SHARED_HITS,
  H(49.2, '笛 in 徵'), H(49.9, 'splat 1'), H(50.4, 'splat 2'), H(50.5, 'knock'), H(51.5, '炮'),
  H(54.6, 'drip again'), H(55.4, 'ears'), H(57.2, 'fan rises'), H(58.2, '月 seal'), H(59.5, 'leap'),
  H(64.3, 'splash'), H(64.5, 'moon motif whole'), H(65.0, '半'), H(65.4, '亩'), H(66.3, '半亩 seal'),
  H(68.0, 'hop 1'), H(68.3, 'hop 2'), H(68.6, 'hop 3'), H(68.8, 'mailbox'), H(69.6, 'colophon alone'),
];

// ---------------------------------------------------------------------------------------------- memory

/** A canvas layer under the keep rule (spec §8.3): painted from `from`, released at the end of the last shot that draws it. */
export interface LayerSpan { id: string; fle: number; from: number; until: number }

const FULL_LAYERS: LayerSpan[] = [
  { id: 'compositor', fle: 1.0, from: 0, until: 86 },
  { id: 'earth', fle: 0.6, from: 0, until: 19.0 },
  { id: 'notebook', fle: 1.0, from: 0, until: 26.4 },
  { id: 'night', fle: 1.0, from: 0, until: 55.7 },
  { id: 'ponds', fle: 0.56, from: 3.5, until: 55.7 },
  { id: 'plum', fle: 0.36, from: 7.9, until: 55.7 },
  { id: 'moon', fle: 0.1, from: 7.9, until: 74.4 },
  { id: 'rabbit', fle: 0.1, from: 7.9, until: 86 },
  { id: 'portrait', fle: 0.1, from: 19.0, until: 86 },
  { id: 'study', fle: 1.77, from: 39.5, until: 60.5 },
  { id: 'sky', fle: 0.55, from: 55.7, until: 60.5 },
  { id: 'moonground', fle: 1.0, from: 55.7, until: 67.1 },
  { id: 'earth2', fle: 0.6, from: 60.5, until: 74.4 },
  { id: 'letter', fle: 0.6, from: 60.5, until: 74.4 },
  { id: 'country', fle: 2.1, from: 67.1, until: 79.5 },
  { id: 'snapshot', fle: 0.5, from: 75.0, until: 86 },
];

const SHORT_LAYERS: LayerSpan[] = [
  { id: 'compositor', fle: 1.0, from: 0, until: 70.8 },
  { id: 'earth', fle: 0.6, from: 0, until: 19.0 },
  { id: 'notebook', fle: 1.0, from: 0, until: 26.4 },
  { id: 'night', fle: 1.0, from: 0, until: 54.2 },
  { id: 'ponds', fle: 0.56, from: 3.5, until: 54.2 },
  { id: 'plum', fle: 0.36, from: 7.9, until: 54.2 },
  { id: 'moon', fle: 0.1, from: 7.9, until: 59.5 },
  { id: 'rabbit', fle: 0.1, from: 7.9, until: 70.8 },
  { id: 'portrait', fle: 0.1, from: 19.0, until: 70.8 },
  { id: 'study', fle: 1.1, from: 39.5, until: 54.2 },
  { id: 'earth2', fle: 0.6, from: 49.2, until: 59.5 },
  { id: 'country', fle: 1.2, from: 54.2, until: 64.3 },
  { id: 'snapshot', fle: 0.5, from: 59.8, until: 70.8 },
];

/** One full-screen layer in MB per device class (spec §8.3). */
export const DEVICE_FLE_MB = { 'iPhone P': 5.3, 'iPad L': 8.0, 'desktop L': 12.8 } as const;

/** Live FLE at film time t under the keep rule. */
export function liveFle(cut: Cut, t: number): number {
  return CUTS[cut].layers.filter((l) => l.from <= t && t < l.until).reduce((z, l) => z + l.fle, 0);
}

/** FLE of every layer a shot's frames may need (the per-shot table of spec §8.3). */
export function shotFle(cut: Cut, id: ShotId): number {
  const s = CUTS[cut].shots.find((x) => x.id === id);
  if (!s) return 0;
  return CUTS[cut].layers.filter((l) => l.from < s.t1 && l.until > s.t0).reduce((z, l) => z + l.fle, 0);
}

// ---------------------------------------------------------------------------------------------- the cuts

export const TAIL = 2.5, SKIP_AFTER = 0.4, HOLD_CAP = 3.0;
/** The film takes over from the gate here (the earliest resume point). */
export const TAKEOVER = 3.9;

export interface CutSpec {
  end: number;
  shots: Shot[];
  text: Txt[];
  hits: Hit[];
  acts: number[];
  /** Shot starts, the earliest 3.9 (the takeover). */
  resume: number[];
  layers: LayerSpan[];
}

const resumeOf = (shots: Shot[]) => [TAKEOVER, ...shots.filter((s) => s.t0 > TAKEOVER).map((s) => s.t0)];

export const CUTS: Record<Cut, CutSpec> = {
  full: { end: 86.0, shots: FULL_SHOTS, text: FULL_TEXT, hits: FULL_HITS, acts: [0, 19.0, 49.2, 67.1], resume: resumeOf(FULL_SHOTS), layers: FULL_LAYERS },
  short: { end: 70.8, shots: SHORT_SHOTS, text: SHORT_TEXT, hits: SHORT_HITS, acts: [0, 19.0, 49.2, 54.2], resume: resumeOf(SHORT_SHOTS), layers: SHORT_LAYERS },
};

export const HITS: Record<Cut, Hit[]> = { full: FULL_HITS, short: SHORT_HITS };
export const ACTS: Record<Cut, number[]> = { full: CUTS.full.acts, short: CUTS.short.acts };
export const TEXT: Record<Cut, Txt[]> = { full: FULL_TEXT, short: SHORT_TEXT };

/** Where the short cut's S12 sits relative to the full cut's (−15.2 s). */
export const END_SHIFT: Record<Cut, number> = { full: 0, short: 64.3 - 79.5 };

/** The shot at film time t (the last shot holds at the end). */
export function shotAt(cut: Cut, t: number): { shot: Shot; u: number; i: number } {
  const shots = CUTS[cut].shots;
  let i = shots.findIndex((s) => t < s.t1);
  if (i < 0) i = shots.length - 1;
  const s = shots[i];
  return { shot: s, u: Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0))), i };
}

/** Where a hidden-tab return resumes: the current shot's start, never before the takeover. */
export function resumeAt(cut: Cut, t: number): number {
  const r = CUTS[cut].resume;
  let best = r[0];
  for (const x of r) if (x <= t + 1e-9) best = x;
  return best;
}

/** Pure description of a frame: its shot and the text on screen (the director and the lab read it). */
export function frameSpec(t: number, cut: Cut): { shot: ShotId; u: number; text: { id: string; lines: string[] }[] } {
  const { shot, u } = shotAt(cut, t);
  const text = CUTS[cut].text
    .filter((x) => x.lines[0].at <= t && t < x.out)
    .map((x) => ({ id: x.id, lines: x.lines.filter((l) => l.at <= t).map((l) => l.zh) }));
  return { shot: shot.id, u, text };
}

// ---------------------------------------------------------------------------------------------- the skip tail

/** The skip tail's plan: before the takeover it is the gate's close; the rabbit hops only from S8 on. */
export function tailPlan(cut: Cut, t: number): { kind: 'gate' | 'tail'; rabbit: boolean; dur: number } {
  if (t < TAKEOVER) return { kind: 'gate', rabbit: false, dur: 0.6 };
  const s8 = CUTS[cut].shots.find((s) => s.id === 'S8' || s.id === 'S9s')!;
  return { kind: 'tail', rabbit: t >= s8.t0, dur: TAIL };
}

// ---------------------------------------------------------------------------------------------- live lines

const lit = (p: number) => (1 - Math.cos(2 * Math.PI * p)) / 2;

/**
 * C22: the moon line when it is night and the garden's disc (inset by its radius) lies inside
 * `visible` (canvas coordinates), with 圆 / 弯 / 一个样 by the lit fraction; otherwise the hour line.
 */
export function skyLine(env: SceneEnv, body: { kind: 'sun' | 'moon'; x: number; y: number; r: number } | null, visible: { x: number; y: number; w: number; h: number }): string {
  const moon = env.tod === 'night' && body?.kind === 'moon' && body.r > 0
    && body.x - body.r >= visible.x && body.x + body.r <= visible.x + visible.w
    && body.y - body.r >= visible.y && body.y + body.r <= visible.y + visible.h;
  if (!moon) return LINES.C22day;
  const f = lit(env.moonPhase);
  return f >= 0.8 ? LINES.C22round : f <= 0.35 ? LINES.C22bent : LINES.C22half;
}

/** The card's sub-hint (both cuts run over a minute). */
export function subHint(soundOn: boolean): string {
  return soundOn ? LINES.subOn : LINES.subOff;
}

// ---------------------------------------------------------------------------------------------- layout

export type LayoutCls = 'P' | 'L' | 'shortL';

/** P when h/w ≥ 1.3; L when w/h ≥ 1.3 (short L when also h < 500); `mix` 0 (P) … 1 (L) in between. */
export function layoutFor(w: number, h: number): { cls: LayoutCls; mix: number } {
  const a = w / Math.max(1, h);
  const mix = Math.max(0, Math.min(1, (a - 1 / 1.3) / (1.3 - 1 / 1.3)));
  const cls: LayoutCls = mix < 0.5 ? 'P' : h < 500 ? 'shortL' : 'L';
  return { cls, mix };
}

/** Caption size (px): min(19, (w − 32)/16) in P, min(23, 5.5% h) in L, 16 in short L. */
export function captionPx(w: number, h: number): number {
  const { cls } = layoutFor(w, h);
  if (cls === 'shortL') return 16;
  if (cls === 'L') return Math.min(23, 0.055 * h);
  return Math.min(19, (w - 32) / 16);
}

/** Pitch of a brush column glyph, in em (glyph plus its gap). */
export const COLUMN_PITCH = 1.08;

/**
 * A brush column's glyph size (px) for `n` glyphs asked at `size` px: min(size, 7.2% h), and the
 * column never longer than 60 % of h (short L: it fits y 6–58 %).
 */
export function columnPx(size: number, n: number, w: number, h: number): number {
  const { cls } = layoutFor(w, h);
  const span = cls === 'shortL' ? 0.52 : 0.6;
  return Math.min(size, 0.072 * h, (span * h) / (n * COLUMN_PITCH));
}

/** The y band (fractions of h) a column may use in short L. */
export const SHORT_L_BAND = [0.06, 0.58] as const;
