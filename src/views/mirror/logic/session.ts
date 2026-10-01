// 水月幻镜 · the session: the one logic module that writes the store and the purse (API.md §2.6).
// Every other logic module is pure; the UI calls these at the moments GDD §16 and §23 name, and each
// money move is one batch with its counter, then meta is written, then payOwed() settles the purse.
import { batch, signal } from '@preact/signals';
import { flushPlay, mirror, payOwed, saveMetaNow, updateMeta } from '../../../app/mirror';
import { codeActive, play, record, recordMax, refund, spend, unlocked } from '../../../app/play';
import { hashString } from '../../../core/rng';
import { todayKey } from '../../../core/date';
import { COMPANION_REG, DIFF_REG, type HeartFaceId, type MapId, type RimId, type VowId } from '../ids';
import type {
  CharacterId, CodexKey, DeathResult, DiffIndex, EndCause, MirrorMeta, MirrorSettings, RunReport, RunSave, TitleId, TutorFlags, Unlocks,
  VowRanks, WaveResult, WaveSetup,
} from '../types';
import { isHidden, RUN_VER } from '../types';
import { PAY, VOWS, HEAT_MAX, rateOf } from '../data';
import { heatOf, REVIVE } from './formulas';
import { bankSleeve, nextRun, reconcileTicket, releaseHeld, rollDay, settlePay, withDay } from './economy';
import { buyHeart, dailySpec, foldKills, masteryLevel, pickHeartFace, settleMeta, unlocksOf } from './meta';
import { beginWave, endWave, foldPartial, newRun, waveSetup } from './run';
import { migrateRun, validateRun } from './save';
import { hiddenOpen } from './hidden';
import { fullRanks, heartFor, lentOf, masteryFor, MASTERY_MAX, NEVER_LENT } from './lend';
import { endTuning, tuningActive } from './tuning';

/**
 * The difficulties and maps the lobby may offer: those earned, or every one of them while the
 * owner's code is active (for testing). It opens choices only — pay, bonuses and records follow
 * the ordinary rules.
 */
export function openOf(m: Pick<MirrorMeta, 'diffMax' | 'mapsOpen'> & Partial<Pick<MirrorMeta, 'bests'>>): {
  diffMax: DiffIndex; mapsOpen: 1 | 2 | 3;
  /** m8 (chars.md §3.4): the companions the mirror may take in — every one while the code is on (the 13 and
   *  the hidden three, in the mirror only: no char:* flag, nothing app-wide); otherwise the app's unlocked
   *  ones plus the hidden ones earned at 40重 (logic/hidden.ts). 今日镜 stays on `unlocked` (dailySpec). */
  chars: readonly CharacterId[];
} {
  if (codeActive.value) return { diffMax: (DIFF_REG.length - 1) as DiffIndex, mapsOpen: 3, chars: COMPANION_REG.map((c) => c.id) };
  return { diffMax: m.diffMax, mapsOpen: m.mapsOpen, chars: [...unlocked.value.filter((id) => !isHidden(id)), ...hiddenOpen({ bests: m.bests ?? {} })] };
}
/**
 * m8 (PLAN T1): is this mirror companion open in the main game? An app id in `unlocked`; never a hidden id
 * (the app's tables don't know them). The mirror's own sites read openOf(m).chars (SANDBOX S1).
 */
export function appOpen(id: CharacterId): boolean {
  return !isHidden(id) && unlocked.value.includes(id);
}

// ───────────────────────────────────────────── m8 · the code's overlays (chars.md §4.3, sandbox.md §8)
/**
 * 「按满阶 / 按自有」: while the code is on, does the next 入镜 take 心镜 at full rank and 心得 10 (true, the
 * default) or the earned values? A session signal: never saved, a reload turns it back on.
 */
export const lendOn = signal(true);
export function setLendOn(on: boolean): void { lendOn.value = on; }
/** Does the next 入镜 get the code's lent 心镜 and 心得? (the code on, and the toggle on). */
export const lent = (): boolean => codeActive.value && lendOn.value;
/** Is the owner's code on? For screens that must say so (the lobby's 「试 · 模拟场」 button, the 心镜 ribbon). */
export const codeOn = (): boolean => codeActive.value;

/** The 心镜 page's numbers: the ranks the next run gets per face, and the earned ones. `lent` when they differ by the code. */
export function heartView(m: Pick<MirrorMeta, 'heart'>): {
  ranks: Partial<Record<HeartFaceId, number>>; own: Partial<Record<HeartFaceId, number>>; lent: boolean; code: boolean;
} {
  const own: Partial<Record<HeartFaceId, number>> = { ...m.heart.ranks };
  if (!lent()) return { ranks: own, own, lent: false, code: codeActive.value };
  const ranks = { ...own };
  const full = fullRanks();
  for (const id in full) if (!NEVER_LENT.includes(id as HeartFaceId)) ranks[id as HeartFaceId] = full[id as HeartFaceId];
  return { ranks, own, lent: true, code: true };
}
/** A companion's 心得 as the screens show it: the level the next run gets, the earned level and xp. */
export function masteryView(m: Pick<MirrorMeta, 'mastery'>, char: CharacterId): { level: number; own: number; xp: number; lent: boolean } {
  const xp = m.mastery[char] ?? 0;
  const own = masteryLevel(xp);
  const on = lent();
  return { level: masteryFor(m, char, on), own, xp, lent: on && own < MASTERY_MAX };
}
/**
 * 'code' when a hidden companion is open only because the code is on (its tile says 「测试码开启」); else
 * null. The 13 are the app's (入画 opens them, and the app's own roster already follows the code), so they
 * carry no tag.
 */
export function charTag(m: Partial<Pick<MirrorMeta, 'bests'>>, id: CharacterId): 'code' | null {
  if (!codeActive.value || !isHidden(id)) return null;
  return hiddenOpen({ bests: m.bests ?? {} }).includes(id) ? null : 'code';
}

/** A fresh run seed (crypto when available; never Math.random). */
function freshSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0];
  }
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  return hashString(`${Date.now()}:${t}:${mirror.value.ticketsUsed}`);
}
const set = (m: MirrorMeta) => { mirror.value = m; saveMetaNow(); };

/** Clamp a vow selection to its ranks and the 20-heat cap. */
export function cleanVows(v: VowRanks): VowRanks {
  const out: VowRanks = {};
  for (const id in v) {
    const d = VOWS[id as VowId];
    const r = Math.max(0, Math.min(d?.ranks ?? 0, Math.floor(v[id as VowId] ?? 0)));
    if (r > 0) out[id as VowId] = r;
  }
  while (heatOf(out) > HEAT_MAX) {
    const k = Object.keys(out).pop() as VowId;
    if ((out[k] ?? 0) > 1) out[k]! -= 1; else delete out[k];
  }
  return out;
}

export interface EnterOpts { char: CharacterId; map: MapId; diff: DiffIndex; vows: VowRanks; daily: boolean; plain: boolean }

/**
 * 入镜 (§16.1), atomic: a paid ticket never used (the tab died mid-tap) is honoured first; else today's
 * free run; else spend(20) and record('mirror:paid') in one batch. Then the run is written with its
 * index and rate fixed, and meta is saved at once.
 */
export function enter(o: EnterOpts): { ok: true; run: RunSave } | { ok: false; reason: 'short' | 'paused' } {
  realGuard();
  const today = todayKey();
  let m = withDay(mirror.value, today);
  if (m.active) return { ok: false, reason: 'paused' };
  const d = rollDay(m, today);
  const paidBefore = play.value.counters['mirror:paid'] ?? 0;
  let free = false;
  let ticket = 0;
  let runIndex: number;
  if (reconcileTicket(m, paidBefore)) {
    ticket = paidBefore;
    runIndex = Math.max(2, d.runs + 1);
  } else if (nextRun(d).free) {
    free = true;
    runIndex = 1;
  } else {
    let ok = false;
    batch(() => { ok = spend(PAY.FEE); if (ok) record('mirror:paid'); });
    if (!ok) return { ok: false, reason: 'short' };
    flushPlay(); // the purse and its ticket land before meta records the run (a hard kill never leaves it unpaid)
    ticket = play.value.counters['mirror:paid'] ?? paidBefore + 1;
    runIndex = Math.max(2, d.runs + 1);
  }
  const unlocks = unlocksOf(m);
  let { char, map, diff, vows } = o;
  // a companion still locked (a stale lobby, an older backup, the code revoked) can't be taken in (§11)
  if (!openOf(m).chars.includes(char)) char = 'scholar';
  let term = null, mutator = null, boon = null, seed = freshSeed();
  if (o.daily) {
    const spec = dailySpec(today, m, unlocked.value);
    if (!spec.chars.includes(char)) char = spec.chars[0];
    map = spec.map; diff = 1; vows = {};
    term = spec.term; mutator = spec.mutator; boon = spec.boon; seed = spec.seed;
  } else {
    const open = openOf(m);
    diff = Math.max(0, Math.min(open.diffMax, diff)) as DiffIndex;
    if (['lake', 'forest', 'palace'].indexOf(map) >= open.mapsOpen) map = 'lake';
    vows = cleanVows(vows);
  }
  // m8: the code lends 心镜 at full rank (never 回魂) and 心得 10 while 「按满阶」 is on; meta is never written
  const lend = lent();
  const run0 = newRun({
    seed, char, map, diff, vows, daily: o.daily, plain: o.plain, heart: o.plain ? {} : heartFor(m, lend),
    ticket, free, runIndex, rate: rateOf(runIndex),
    startedDay: d.day, term, mutator, boon, unlocks, mastery: masteryFor(m, char, lend),
  });
  const run: RunSave = lend ? { ...run0, lent: lentOf(m, char, o.plain) } : run0;
  const codex = { ...m.codex };
  for (const k of [`char:${char}`, `map:${map}`] as CodexKey[]) if (!codex[k]) codex[k] = 1;
  m = {
    ...m, active: run, codex, ticketsUsed: free ? m.ticketsUsed : Math.max(m.ticketsUsed, ticket),
    payDay: { ...d, runs: d.runs + 1, free: d.free || free },
    lobby: o.daily ? m.lobby : { char, map, diff, vows },
  };
  set(m);
  return { ok: true, run };
}

/**
 * m8 (sandbox.md §5.3): real play never sees a 模拟场 override. Leaving the sandbox always restores the tables
 * (ui/sand/session.ts leaveSand), so this should never fire; if it does, the tables are restored first.
 */
function realGuard(): void {
  if (!tuningActive()) return;
  const r = endTuning();
  try { console.warn('[mirror] tuning was still on at a real run: restored', r.restored); } catch { /* no console */ }
}

/** Save the run as it is (after every purchase, reroll, lock, sell, merge or pick). */
export function commit(run: RunSave): void {
  set({ ...mirror.value, active: run });
}

/** The lobby opens: roll the day, pay first-time bonuses an earlier full day held back, pay what is owed. */
export function lobbyVisit(): void {
  const today = todayKey();
  const m = releaseHeld(withDay(mirror.value, today), today);
  set(openOf(m).chars.includes(m.lobby.char) ? m : { ...m, lobby: { ...m.lobby, char: 'scholar' } });
  payOwed();
}

/**
 * On view mount (§23): a save that can't be read is dropped; one that can't migrate settles as 镜碎
 * ('migrate'); a stale inWave counts an interruption and the 3rd settles ('interrupt'). Otherwise the
 * run is saved clean and null is returned (续镜 lands on screenOf(run), replaying an interrupted wave).
 */
export function resumeCheck(): RunReport | null {
  const m = mirror.value;
  if (!m.active) return null;
  if (newerSave()) return null; // a later build's run: left alone for that build (the lobby asks for a reload)
  const valid = validateRun(m.active);
  if (!valid) { set({ ...m, active: null }); return null; }
  const run = migrateRun(valid);
  if (!run) return settle({ ...valid, inWave: null }, 'migrate');
  if (run.inWave !== null) {
    // the tab closed while down (破镜重圆 on offer, unanswered): that is a death, never an interruption
    if (run.downAt === run.inWave) return settle(clearDown({ ...run, inWave: null }), 'death');
    const r = clearDown({ ...run, inWave: null, interruptions: run.interruptions + 1 });
    if (r.interruptions >= 3) return settle(r, 'interrupt');
    commit(r);
    return null;
  }
  if (run.downAt !== undefined) { commit(clearDown(run)); return null; }
  if (run !== m.active) commit(run);
  return null;
}
/** The run without its `downAt` mark (the key removed, not set to undefined). */
function clearDown(run: RunSave): RunSave {
  if (!('downAt' in run)) return run;
  const { downAt: _gone, ...rest } = run;
  return rest;
}

/**
 * Is the paused run from a newer build (an old tab or a stale service worker after an update)? Then
 * this build must not play, migrate or settle it: 续镜 is replaced by 「此局存于新版，请刷新」.
 */
export function newerSave(): boolean {
  const run = mirror.value.active;
  return !!run && typeof run.ver === 'number' && run.ver > RUN_VER;
}

/** Start the next wave: inWave is saved before the engine runs. */
export function startWave(run: RunSave): { run: RunSave; setup: WaveSetup } {
  realGuard();
  const r = beginWave(run);
  const setup = waveSetup(r, mirror.value, new Date());
  commit(r);
  return { run: r, setup };
}

/**
 * A won wave: fold it, bank its sleeve and tallies in the same write, then pay the purse. Only the wave
 * in play counts: a duplicate, a late hook after 暂离 or a settle, or a wrong wave number changes
 * nothing and returns the run as it is (null when there is none).
 */
export function waveWon(res: WaveResult): RunSave | null {
  const m0 = mirror.value;
  if (!m0.active || m0.active.inWave === null || m0.active.inWave !== res.wave) return m0.active;
  const today = todayKey();
  const run = endWave(m0.active, res);
  const b = bankSleeve(m0, run, res.sleeve, today);
  set({ ...foldKills(b.meta, res.killsBy), active: b.run });
  payOwed();
  return b.run;
}

/** Settle a run once, however it ended: meta and pay in one write, then the refund, counters and purse. */
function settle(run: RunSave, cause: EndCause): RunReport {
  const today = todayKey();
  const s = settleMeta(mirror.value, run, cause, today);
  const p = settlePay(s.meta, run, today);
  batch(() => {
    if (p.pay.back > 0) refund(p.pay.back);
    record('mirror:runs');
    recordMax('mirror:best', run.wave);
    if (run.wave >= 30) record('mirror:clear');
  });
  flushPlay(); // the refund and counters land before meta forgets the run
  set({ ...p.meta, active: null });
  payOwed();
  return { ...s.report, pay: p.pay };
}

/**
 * 镜碎 during a wave: the partial counts for deeds and tallies; its sleeve sinks with the glass. A death
 * that is not the wave in play (after 暂离, a settle, or twice) is ignored: null.
 */
export function died(d: DeathResult): RunReport | null {
  const m = mirror.value;
  if (!m.active || m.active.inWave === null || m.active.inWave !== d.wave) return null;
  const run = foldPartial(m.active, d.partial);
  mirror.value = foldKills(m, d.partial.killsBy);
  return settle(run, 'death');
}
/** 弃镜: 镜碎 at the last cleared wave. */
export function abandon(): RunReport {
  const m = mirror.value;
  if (!m.active) throw new Error('mirror: no active run');
  return settle({ ...m.active, inWave: null }, 'abandon');
}
/**
 * 暂离 mid-wave: that wave will replay; the third such exit settles the run. Leaving while down (the
 * revive on offer, unanswered) is a death: stepping away never dodges one.
 */
export function leaveMidWave(): { interruptions: number; report: RunReport | null } {
  const m = mirror.value;
  if (!m.active) return { interruptions: 0, report: null };
  if (m.active.inWave === null) return { interruptions: m.active.interruptions, report: null };
  if (m.active.downAt === m.active.inWave) return { interruptions: m.active.interruptions, report: settle(clearDown({ ...m.active, inWave: null }), 'death') };
  const r = { ...m.active, inWave: null, interruptions: m.active.interruptions + 1 };
  if (r.interruptions >= 3) return { interruptions: r.interruptions, report: settle(r, 'interrupt') };
  commit(r);
  return { interruptions: r.interruptions, report: null };
}
/**
 * An engine failure before wave 2 voids the run: a paid run gets refund(20), a free run gives the day's
 * free run back, at most once a day; a void run doesn't count toward the day's run index.
 */
export function voidRun(): void {
  const today = todayKey();
  const m = withDay(mirror.value, today);
  const run = m.active;
  if (!run) return;
  const d = { ...m.payDay };
  const sameDay = run.startedDay === d.day;
  let back = 0;
  if (!d.refunded) {
    if (run.free) { if (sameDay) d.free = false; } else back = PAY.FEE;
    d.refunded = true;
  }
  if (sameDay) d.runs = Math.max(0, d.runs - 1);
  if (back) { refund(back); flushPlay(); } // the refund lands before meta drops the run
  set({ ...m, payDay: d, active: null });
}
// ───────────────────────────────────────────── 破镜重圆: the run's one paid revive (API.md §3)
/**
 * `downed` fired: remember the wave, so a closed tab or a 暂离 settles as a death, not an interruption.
 * Only the wave in play is marked.
 */
export function wentDown(wave: number): void {
  const a = mirror.value.active;
  if (!a || a.inWave === null || a.inWave !== wave) return;
  commit({ ...a, downAt: wave });
}
/**
 * 以 50 文 重圆, atomic: spend(REVIVE.price) and record('mirror:revive') in one batch, the purse written,
 * then the run saved as revived. 'ok': charged and saved — now call engine.revive(). 'short': nothing
 * changed. 'used': this run has had its revive (or is the tutorial's). 'none': no run, or none in a wave.
 * The owner's code changes none of this: the 50 文 always go through spend().
 */
export function payRevive(): 'ok' | 'short' | 'used' | 'none' {
  const a = mirror.value.active;
  if (!a || a.inWave === null) return 'none';
  if (a.revived === true || a.tutorial === true) return 'used';
  let ok = false;
  batch(() => { ok = spend(REVIVE.price); if (ok) record('mirror:revive'); });
  if (!ok) return 'short';
  flushPlay(); // the coins land before the run says "revived"
  commit({ ...clearDown(a), revived: true });
  return 'ok';
}
/**
 * The engine could not rise after payRevive() said 'ok' (disposed or failed meanwhile): the 50 文 go
 * back and the run is no longer marked revived. The death that follows settles as usual.
 */
export function reviveFailed(): void {
  const a = mirror.value.active;
  if (!a || a.revived !== true) return;
  refund(REVIVE.price);
  flushPlay();
  const { revived: _r, ...rest } = a;
  commit(rest);
}
/** The engine gave up (a second throw within 5 s): void before wave 2, else settle as 镜碎 ('error'). */
export function engineFailed(): RunReport | null {
  const run = mirror.value.active;
  if (!run) return null;
  if (run.wave < 1) { voidRun(); return null; }
  return settle({ ...run, inWave: null }, 'error');
}

// ───────────────────────────────────────────── small lobby writes
export function setLobby(p: Partial<MirrorMeta['lobby']>): void {
  updateMeta((m) => ({ ...m, lobby: { ...m.lobby, ...p, vows: p.vows ? cleanVows(p.vows) : m.lobby.vows } }));
}
export function setMirrorSettings(p: Partial<MirrorSettings>): void {
  updateMeta((m) => ({ ...m, settings: { ...m.settings, ...p } }));
}
/** Buy a 心镜 rank with 镜屑 (between runs only). */
export function heartBuy(face: HeartFaceId): boolean {
  const next = buyHeart(mirror.value, face);
  if (!next) return false;
  set(next);
  return true;
}
export function heartPick(pair: number, side: 'A' | 'B'): void {
  set(pickHeartFace(mirror.value, pair, side));
}
export function setPlain(plain: boolean): void {
  updateMeta((m) => ({ ...m, heart: { ...m.heart, plain } }));
}
export function setTitle(t: TitleId | null): void {
  updateMeta((m) => ({ ...m, title: t === null || m.titles.includes(t) ? t : m.title }));
}
export function setRim(r: RimId | null): void {
  updateMeta((m) => ({ ...m, rim: r === null || m.rims.includes(r) ? r : m.rim }));
}
/** A codex page seen for the first time (shop, crate, spawn): stage 见. */
export function markSeen(keys: readonly CodexKey[]): void {
  const m = mirror.value;
  if (keys.every((k) => (m.codex[k] ?? 0) >= 1)) return;
  const codex = { ...m.codex };
  for (const k of keys) if (!codex[k]) codex[k] = 1;
  mirror.value = { ...m, codex };
}

// ───────────────────────────────────────────── the run's session (the RunView seam)
/**
 * What a run on screen calls at each moment (ui/Run.tsx). The real one below is this module: it writes
 * meta.active, the purse and the counters. The tutorial's (tutor/session.ts) keeps its run in memory
 * and writes nothing but its own flags. `practice` tells the view which one it has.
 */
export interface RunSession {
  readonly practice: boolean;
  /** m8: the 模拟场's session (ui/sand/session.ts): no meta, no purse, no counters (sandbox.md §6.1). */
  readonly sandbox?: true;
  commit(run: RunSave): void;
  startWave(run: RunSave): { run: RunSave; setup: WaveSetup };
  waveWon(res: WaveResult): RunSave | null;
  died(d: DeathResult): RunReport | null;
  leaveMidWave(): { interruptions: number; report: RunReport | null };
  abandon(): RunReport | null;
  engineFailed(): RunReport | null;
  markSeen(keys: readonly CodexKey[]): void;
  /** What the account has open, for the shop, crates and 镜心 (fixed for the run). */
  unlocks(): Unlocks;
  /** 破镜重圆 (optional: the tutorial's session has none, so its run is never offered the revive). */
  wentDown?(wave: number): void;
  payRevive?(): 'ok' | 'short' | 'used' | 'none';
  reviveFailed?(): void;
}
/** The real session: this module's writers, unchanged. */
export const realSession: RunSession = {
  practice: false,
  commit, startWave, waveWon, died, leaveMidWave, abandon, engineFailed, markSeen,
  unlocks: () => unlocksOf(mirror.value),
  wentDown, payRevive, reviveFailed,
};

// ───────────────────────────────────────────── the tutorial's flags
const tutorNow = (m: MirrorMeta): TutorFlags => m.tutor ?? { offered: false, done: false, tips: {} };
/** Set the tutorial's flags (`done` always implies `offered`); written at once. */
export function setTutor(p: Partial<Pick<TutorFlags, 'offered' | 'done'>>): void {
  updateMeta((m) => {
    const cur = tutorNow(m);
    const done = p.done ?? cur.done;
    return { ...m, tutor: { ...cur, done, offered: (p.offered ?? cur.offered) || done } };
  });
}
/** 重看新手提示: every first-time tip shows again. */
export function resetTips(): void {
  updateMeta((m) => ({ ...m, tutor: { ...tutorNow(m), tips: {} } }));
}
