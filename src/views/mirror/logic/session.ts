// 水月幻镜 · the session: the one logic module that writes the store and the purse (API.md §2.6).
// Every other logic module is pure; the UI calls these at the moments GDD §16 and §23 name, and each
// money move is one batch with its counter, then meta is written, then payOwed() settles the purse.
import { batch } from '@preact/signals';
import { flushPlay, mirror, payOwed, saveMetaNow, updateMeta } from '../../../app/mirror';
import { codeActive, play, record, recordMax, refund, spend, unlocked } from '../../../app/play';
import { hashString } from '../../../core/rng';
import { todayKey } from '../../../core/date';
import { DIFF_REG, type HeartFaceId, type MapId, type RimId, type VowId } from '../ids';
import type {
  CharacterId, CodexKey, DeathResult, DiffIndex, EndCause, MirrorMeta, MirrorSettings, RunReport, RunSave, TitleId, VowRanks,
  WaveResult, WaveSetup,
} from '../types';
import { RUN_VER } from '../types';
import { PAY, VOWS, HEAT_MAX, rateOf } from '../data';
import { heatOf } from './formulas';
import { bankSleeve, nextRun, reconcileTicket, releaseHeld, rollDay, settlePay, withDay } from './economy';
import { activeHeart, buyHeart, dailySpec, foldKills, masteryLevel, pickHeartFace, settleMeta, unlocksOf } from './meta';
import { beginWave, endWave, foldPartial, newRun, waveSetup } from './run';
import { migrateRun, validateRun } from './save';

/**
 * The difficulties and maps the lobby may offer: those earned, or every one of them while the
 * owner's code is active (for testing). It opens choices only — pay, bonuses and records follow
 * the ordinary rules.
 */
export function openOf(m: Pick<MirrorMeta, 'diffMax' | 'mapsOpen'>): { diffMax: DiffIndex; mapsOpen: 1 | 2 | 3 } {
  if (codeActive.value) return { diffMax: (DIFF_REG.length - 1) as DiffIndex, mapsOpen: 3 };
  return { diffMax: m.diffMax, mapsOpen: m.mapsOpen };
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
  // a companion still locked in the main game (a stale lobby, an older backup) can't be taken in (§11)
  if (!unlocked.value.includes(char)) char = 'scholar';
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
  const run = newRun({
    seed, char, map, diff, vows, daily: o.daily, plain: o.plain, heart: o.plain ? {} : activeHeart(m),
    ticket, free, runIndex, rate: rateOf(runIndex),
    startedDay: d.day, term, mutator, boon, unlocks, mastery: masteryLevel(m.mastery[char] ?? 0),
  });
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

/** Save the run as it is (after every purchase, reroll, lock, sell, merge or pick). */
export function commit(run: RunSave): void {
  set({ ...mirror.value, active: run });
}

/** The lobby opens: roll the day, pay first-time bonuses an earlier full day held back, pay what is owed. */
export function lobbyVisit(): void {
  const today = todayKey();
  const m = releaseHeld(withDay(mirror.value, today), today);
  set(unlocked.value.includes(m.lobby.char) ? m : { ...m, lobby: { ...m.lobby, char: 'scholar' } });
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
    const r = { ...run, inWave: null, interruptions: run.interruptions + 1 };
    if (r.interruptions >= 3) return settle(r, 'interrupt');
    commit(r);
    return null;
  }
  if (run !== m.active) commit(run);
  return null;
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
/** 暂离 mid-wave: that wave will replay; the third such exit settles the run. */
export function leaveMidWave(): { interruptions: number; report: RunReport | null } {
  const m = mirror.value;
  if (!m.active) return { interruptions: 0, report: null };
  if (m.active.inWave === null) return { interruptions: m.active.interruptions, report: null };
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
