// 桃源 · 二期: the six valley games' shared frame (spec §5.0).
//   · A stand prompt at each game's place, open in its hours while life is open and nothing holds the
//     life claim (「酒坊前 · 曲池」 → 「踩曲」). It is not on the host, so a cook who also hosts keeps
//     「吃点什么」.
//   · The start card: the host and their two rule lines, today's twist, the best and the seal, the
//     mood glyph, 「慢些」 (the flag tyl:gentle) and 「开始」.
//   · A round: the life claim (its leaving() asks 「这局不玩了？」), freeze, the walker set at the stand,
//     a held camera, the host borrowed (given back by restore()), 鲁三's prop nod on the first round
//     ever; the game's own play(); then the grade, the 土产 (1, or 2 at 精, on the day's first 3
//     rounds), 文 through the one tyxi PaySource, 今日之约, the bests (gentle ones apart) and the seal
//     (never in gentle mode), and the result card with its period quotation.
//
// Owner: G. Mounted by life/index.ts (mountGames).
import './games.css';
import type * as T from 'three';
import type { WorldCtx } from '../../../../types';
import type { Bag } from '../../../kit';
import { reducedMotion } from '../../../kit';
import { play, record, recordMax, flag } from '../../../../../../app/play';
import { tyxiPay, TYXI_YUE_COINS } from '../../../../../games/economy';
import { pay, payLine } from '../../../../../games/purse';
import { h, panel, closeButton, onEscape, pop as popUi, type Panel } from '../../../minigames/ui';
import { engine } from '../../engine';
import { W, Y_T, standAt } from '../../places';
import { spotOf } from '../../folk';
import type { VillagerKey } from '../../hooks';
import type { TaoyuanWorld } from '../../world';
import { setGameDay } from '../../../../shidan/state';
import { GAME_IDS, GENTLE, GUI_GOT, YUE, bestGentleKey, bestKey, playKey, sealKey } from '../keys';
import { yueFor } from '../daily';
import type { GameGrade, GameId, KindId, LifeActivity, LifeApi, LifeMount, LifePart, Line, Mood, Part } from '../types';
import { coinsFor, goodsFor, gradeOf, openAt, sealEarned } from './logic';
import { FRAME, GAME_NAME, LUSAN, NAMES, QUOTES, STAND } from './games-text';
import { quGame } from './qu';
import { moGame } from './mo';
import { canGame } from './can';
import { yuanGame } from './yuan';
import { yingGame } from './ying';
import { shangGame } from './shang';

type XZ = { x: number; z: number };
type XYZ = { x: number; y: number; z: number };

/** The good each game pays (spec §2). */
export const GAME_KIND: Record<GameId, KindId> = { qu: 'qu', mo: 'yu', can: 'shen', yuan: 'dan', ying: 'jun', shang: 'shu' };
/** The seal glyph of each game (the 食单's 六戏 tab uses food.ts GAME_SEAL, the same glyphs). */
export const SEAL_GLYPH: Record<GameId, string> = { qu: '曲', mo: '溪', can: '蚕', yuan: '鸢', ying: '萤', shang: '觞' };
const KIND_NAME: Record<KindId, Line> = {
  yu: { zh: '鱼', en: 'a fish' }, shen: { zh: '桑葚', en: 'mulberries' }, qu: { zh: '曲', en: 'a yeast cake' },
  dan: { zh: '鹅蛋', en: 'a goose egg' }, jun: { zh: '菌', en: 'mushrooms' }, shu: { zh: '黍', en: 'millet' },
};

// ───────────────────────────── what a game module gives the frame, and what it gets

/** What a finished round hands back. */
export interface RoundResult {
  /** The score shown (and recorded as the best). */
  score: number;
  /** What the grade is read from (踩曲: accuracy 0…1; 摸鱼: points; the rest: the score). */
  measure: number;
  /** The seal's feat was done (the frame applies the gentle rule). */
  feat: boolean;
  /** The value today's 今日之约 is measured in (踩曲 score on today's call, fish, trays spinning, 尺, fireflies, cups right). */
  yue: number;
  /** 文 before the purse's rate (the game's own formula and cap: logic.ts coinsFor). */
  coins: number;
  /** 2 土产 whatever the grade (摸鱼's 鳜). */
  bonus?: boolean;
  /** Extra lines on the card (阿黍's tally). */
  lines?: Line[];
  /** The host's reaction after the round, in a toast. */
  say?: { who: VillagerKey; line: Line } | null;
  /** More bests (踩曲's per-call best). */
  bests?: { key: string; value: number }[];
  /** Flags the round earned (a 号子 opened, a kite frame). */
  flags?: string[];
  /** Run after the card (流觞's supper). */
  after?: () => void;
}

/** The running round, as a game module sees it. */
export interface Round {
  readonly g: GameId;
  readonly ctx: WorldCtx;
  readonly tv: TaoyuanWorld;
  readonly life: LifeApi;
  readonly bag: Bag;
  readonly day: string;
  readonly gentle: boolean;
  readonly mood: Mood | null;
  readonly part: Part;
  readonly hour: number;
  readonly still: boolean;
  /** The game's own layer (a `mg is-game tyg` panel). */
  readonly root: HTMLElement;
  /** The round was stopped (出谷, the way out, ✕): no pay. */
  readonly stopped: boolean;
  /** The 「这局不玩了？」 question is up: the game holds still. */
  readonly paused: boolean;
  /** Every frame of the round while not paused: dt, and the round's own clock t (s). */
  frame(fn: (dt: number, t: number) => void): void;
  onStop(fn: () => void): void;
  later(ms: number, fn: () => void): void;
  /** A line said in the game (a small toast in the panel): who is a villager key or null (the narrator). */
  say(who: VillagerKey | null, line: Line, ms?: number): void;
  pop(text: string, cls?: string): void;
  tr(l: Line): string;
  /** A line said, in the language's quote marks: 「…」 in Chinese, “…” in English. */
  quote(text: string): string;
  /** Hold the camera at `to`, looking at `look` (world), for the round. */
  view(to: XYZ, look: XYZ, secs?: number): void;
  /** A valley-local point on the floor, in world coordinates (y + dy). */
  at(x: number, z: number, dy?: number): T.Vector3;
  /** End the round with this result (the frame pays and shows the card). */
  finish(r: RoundResult): void;
  /** End the round with nothing (the game gave up itself). */
  quit(): void;
}

/** One game, as the frame drives it. */
export interface GameDef {
  id: GameId;
  /** Who hosts at this hour (捉萤: 小满 before 21, 阿黍 after). */
  host(hour: number): VillagerKey;
  /** The stand (valley-local): where the prompt is, where the walker is set, facing. */
  stand: XZ;
  face: XZ;
  /** Where the host is borrowed to (valley-local), facing. */
  hostAt: XZ;
  hostFace?: XZ;
  /** Auto-stop past 8 m from the stand (摸鱼, 纸鸢). */
  leash?: boolean;
  /** The two rule lines on the card: [who, line]. */
  rules(hour: number): { who: VillagerKey; line: Line }[];
  /** Today's twist (the card, the 食单). */
  twist(day: string): Line;
  /** Why it can't be played now (三娘 refuses 醺), or null. */
  refuse?(life: LifeApi): { who: VillagerKey; line: Line } | null;
  /** The host's line as the good is handed over (or null). */
  good?(hour: number): { who: VillagerKey; line: Line } | null;
  /** A choice on the start card (踩曲's 号子, 纸鸢's kite), or none. */
  options?(day: string): { label: Line; items: { id: string; name: Line; open: boolean }[]; pick: string } | null;
  /** Play one round (resolve by r.finish / r.quit; a stop resolves it too). */
  play(r: Round, option: string | null): void;
}

export const GAMES: Record<GameId, GameDef> = { qu: quGame, mo: moGame, can: canGame, yuan: yuanGame, ying: yingGame, shang: shangGame };

const L2 = (ctx: WorldCtx, l: Line) => (ctx.lang === 'zh' ? l.zh : l.en);
/** A line said, in the language's own quote marks: 「…」 in Chinese, “…” in English. */
const quoted = (ctx: WorldCtx, text: string) => (ctx.lang === 'zh' ? `「${text}」` : `“${text}”`);
const nameOf = (k: VillagerKey): Line => NAMES[k] ?? { zh: k, en: k };

/** A valley-local floor point in world coordinates. */
function floorPt(ctx: WorldCtx, x: number, z: number, dy = 0): T.Vector3 {
  const w = W(x, z);
  return new ctx.THREE.Vector3(w.x, Y_T + standAt(x, z) + dy, w.z);
}

/** Set or clear a flag (the gentle toggle; play.ts has no unflag). */
function setFlag(key: string, on: boolean): void {
  const p = play.peek();
  if (!!p.flags[key] === on) return;
  const flags: Record<string, true> = { ...p.flags };
  if (on) flags[key] = true; else delete flags[key];
  play.value = { ...p, flags };
}

export const mountGames: LifeMount = (bag, ctx, tv, life): LifePart => {
  const eng = engine(ctx);
  const still = reducedMotion();

  // ───────────── the 食单's 六戏 tab: today's twist and 今日之约
  setGameDay((g, day) => ({ twist: GAMES[g].twist(day), yue: yueFor(day).game === g }));
  bag.onDispose(() => setGameDay(null));

  // ───────────── the stands
  const stands = new Map<GameId, () => void>();
  let acc = 1;
  const checkStands = () => {
    const part = life.part();
    const free = life.open() && !life.current();
    for (const g of GAME_IDS) {
      const want = free && openAt(g, part);
      const on = stands.get(g);
      if (want && !on) {
        const d = GAMES[g];
        const s = STAND[g];
        stands.set(g, ctx.addInteractable({
          id: `tyl:game:${g}`, position: floorPt(ctx, d.stand.x, d.stand.z), radius: g === 'shang' ? 2.2 : 1.8,
          labelZh: s.label.zh, labelEn: s.label.en, actionZh: s.action.zh, actionEn: s.action.en,
          act: () => { void open(g); },
        }));
      } else if (!want && on) { on(); stands.delete(g); }
    }
  };
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    checkStands();
  });
  bag.onDispose(() => { for (const off of stands.values()) off(); stands.clear(); });

  // ───────────── the card, then the round

  let active: { g: GameId; activity: LifeActivity; halt: (silent: boolean) => void; ask: () => Promise<boolean>; round: () => RoundImpl | null } | null = null;

  async function open(g: GameId): Promise<void> {
    if (active || life.current() || !life.open()) return;
    const d = GAMES[g];
    const no = d.refuse?.(life) ?? null;
    if (no) { ctx.hud.toast(`${nameOf(no.who).zh}：「${no.line.zh}」`, `${nameOf(no.who).en}: "${no.line.en}"`, 3600); return; }
    let closeCard: (() => void) | null = null;
    let round: RoundImpl | null = null;
    const activity: LifeActivity = {
      kind: 'game',
      game: g,
      leaving: async () => {
        if (!round) { closeCard?.(); return true; }
        return ask();
      },
      stop: () => { closeCard?.(); round?.halt(true); },
    };
    const ask = async (): Promise<boolean> => {
      const r = round;
      if (!r || r.over) return true;
      r.pause(true);
      const i = await ctx.hud.say({ nameZh: '', nameEn: '', zh: FRAME.confirm.zh, en: FRAME.confirm.en, choices: [FRAME.stopIt, FRAME.keepOn] });
      if (i === 0) { r.halt(true); return true; }
      r.pause(false);
      return false;
    };
    if (!life.claim(activity)) return;
    active = { g, activity, halt: (s) => round?.halt(s), ask, round: () => round };
    const choice = await startCard(g, (off) => { closeCard = off; });
    closeCard = null;
    if (!choice || life.current() !== activity) {
      if (life.current() === activity) life.release(activity);
      active = null;
      return;
    }
    round = new RoundImpl(g, choice.option, activity);
    const result = await round.run();
    round = null;
    active = null;
    if (life.current() === activity) life.release(activity);
    if (result) settle(g, choice.gentle, choice.option, result);
  }

  // ───────────── the start card

  function startCard(g: GameId, setClose: (off: () => void) => void): Promise<{ gentle: boolean; option: string | null } | null> {
    const d = GAMES[g];
    return new Promise((resolve) => {
      const p = panel(bag, 'tyg tyg-start');
      let settled = false;
      const done = (v: { gentle: boolean; option: string | null } | null) => {
        if (settled) return;
        settled = true;
        offEsc();
        p.close();
        resolve(v);
      };
      setClose(() => done(null));
      const offEsc = onEscape(() => done(null));
      const card = h('div', 'tyg-card', undefined, p.root);
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'false');
      const hour = life.hour();
      const host = d.host(hour);
      const head = h('div', 'tyg-card-head', undefined, card);
      h('b', 'tyg-card-title brush', L2(ctx, GAME_NAME[g]), head);
      h('small', 'tyg-card-host', L2(ctx, nameOf(host)), head);
      const m = life.mood();
      if (m) { const mg = h('span', 'tyg-mood', m, head); mg.title = L2(ctx, FRAME.mood); }
      const rules = h('ol', 'tyg-rules', undefined, card);
      for (const r of d.rules(hour)) {
        const li = h('li', '', undefined, rules);
        h('span', 'tyg-who', L2(ctx, nameOf(r.who)), li);
        h('span', '', quoted(ctx, L2(ctx, r.line)), li);
      }
      const day = life.day();
      const tw = h('p', 'tyg-twist', undefined, card);
      h('span', 'tyg-tag', L2(ctx, FRAME.today), tw);
      h('span', '', L2(ctx, d.twist(day)), tw);
      const yue = yueFor(day);
      if (yue.game === g) {
        const y = h('p', 'tyg-yue', undefined, card);
        h('span', 'tyg-tag is-red', L2(ctx, FRAME.yue), y);
        h('span', '', `${L2(ctx, nameOf(yue.by))}${ctx.lang === 'zh' ? '：' : ': '}${quoted(ctx, L2(ctx, yue.line))}`, y);
        if (life.today(YUE) > 0) y.classList.add('is-done');
      }
      // the option (踩曲's 号子, 纸鸢's kite)
      const opts = d.options?.(day) ?? null;
      let pick = opts?.pick ?? null;
      if (opts) {
        const row = h('div', 'tyg-opts', undefined, card);
        h('span', 'tyg-tag', L2(ctx, opts.label), row);
        const btns: HTMLButtonElement[] = [];
        for (const it of opts.items) {
          const b = h('button', 'tyg-opt' + (it.id === pick ? ' is-on' : ''), L2(ctx, it.name), row);
          b.type = 'button';
          b.disabled = !it.open;
          b.addEventListener('click', () => { pick = it.id; btns.forEach((x) => x.classList.toggle('is-on', x === b)); });
          btns.push(b);
        }
      }
      const pb = play.peek().best;
      const best = pb[bestKey(g)] ?? 0, bestM = pb[bestGentleKey(g)] ?? 0;
      const foot = h('div', 'tyg-card-foot', undefined, card);
      const bestEl = h('small', 'tyg-best', undefined, foot);
      bestEl.textContent = best || bestM
        ? `${L2(ctx, FRAME.best)} ${best}${bestM ? ` · ${L2(ctx, FRAME.bestGentle)} ${bestM}` : ''}`
        : L2(ctx, FRAME.none);
      const sealed = !!play.peek().flags[sealKey(g)];
      const seal = h('span', 'tyg-seal brush' + (sealed ? '' : ' is-empty'), sealed ? SEAL_GLYPH[g] : '', foot);
      seal.setAttribute('aria-label', L2(ctx, sealed ? FRAME.sealed : FRAME.unsealed));
      const row = h('div', 'tyg-card-btns', undefined, card);
      const gl = h('label', 'tyg-gentle', undefined, row);
      const cb = h('input', '', undefined, gl);
      cb.type = 'checkbox';
      cb.checked = !!play.peek().flags[GENTLE];
      h('span', '', L2(ctx, FRAME.gentle), gl);
      gl.title = L2(ctx, FRAME.gentleNote);
      cb.addEventListener('change', () => setFlag(GENTLE, cb.checked));
      const go = h('button', 'tyg-go', L2(ctx, FRAME.start), row);
      go.type = 'button';
      go.addEventListener('click', () => done({ gentle: cb.checked, option: pick }));
      // (the ✕ in the card's own corner: at the screen's edge it sat on the chips, and on a narrow screen on the title)
      closeButton(card, ctx, () => done(null)).classList.add('tyg-card-x');
      requestAnimationFrame(() => { try { go.focus({ preventScroll: true }); } catch { /* ignore */ } });
    });
  }

  // ───────────── a round

  class RoundImpl implements Round {
    readonly ctx = ctx;
    readonly tv = tv;
    readonly life = life;
    readonly bag = bag;
    readonly day = life.day();
    readonly gentle: boolean;
    readonly mood = life.mood();
    readonly part = life.part();
    readonly hour = life.hour();
    readonly still = still;
    readonly root: HTMLElement;
    stopped = false;
    paused = false;
    over = false;
    private p: Panel;
    private fns: ((dt: number, t: number) => void)[] = [];
    private stops: (() => void)[] = [];
    private timers: ReturnType<typeof setTimeout>[] = [];
    private t = 0;
    private resolve: ((r: RoundResult | null) => void) | null = null;
    private offEsc: () => void;
    private offFrame: (() => void) | null = null;
    private stand: T.Vector3;
    constructor(readonly g: GameId, private option: string | null, activity: LifeActivity) {
      void activity;
      this.gentle = !!play.peek().flags[GENTLE];
      this.p = panel(bag, `tyg tyg-${g}`);
      this.root = this.p.root;
      closeButton(this.root, ctx, () => { void active?.ask(); });
      this.offEsc = onEscape(() => { void active?.ask(); });
      const d = GAMES[g];
      this.stand = floorPt(ctx, d.stand.x, d.stand.z);
    }
    run(): Promise<RoundResult | null> {
      const d = GAMES[this.g];
      return new Promise((resolve) => {
        this.resolve = resolve;
        // the walker at the stand, still; the host borrowed
        ctx.player.freeze(true);
        const heading = Math.atan2(d.face.x - d.stand.x, d.face.z - d.stand.z);
        ctx.player.teleport(this.stand.x, this.stand.z, heading);
        const host = d.host(this.hour);
        const hw = W(d.hostAt.x, d.hostAt.z);
        const hf = d.hostFace ? W(d.hostFace.x, d.hostFace.z) : W(d.stand.x, d.stand.z);
        life.borrow(host, { x: hw.x, z: hw.z, face: hf });
        // 鲁三's nod: the first round ever of this game, if he is about
        const pb = play.peek().best;
        if (pb[bestKey(this.g)] === undefined && pb[bestGentleKey(this.g)] === undefined && spotOf('lusan', 'chang', this.part, play.peek().flags, this.hour)) {
          this.later(1600, () => this.say('lusan', LUSAN.lusan[this.g], 3000));
        }
        let last = performance.now();
        this.offFrame = ctx.onFrame(() => {
          const now = performance.now();
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          if (this.stopped || this.over) return;
          if (d.leash && ctx.player.position.distanceTo(this.stand) > 8) { this.halt(true); return; }
          if (this.paused) return;
          this.t += dt;
          for (const fn of this.fns) { try { fn(dt, this.t); } catch (e) { console.error('[walk] taoyuan game frame', e); } }
        });
        try { d.play(this, this.option); } catch (e) { console.error('[walk] taoyuan game failed', e); this.halt(true); }
      });
    }
    pause(on: boolean): void { this.paused = on; }
    frame(fn: (dt: number, t: number) => void): void { this.fns.push(fn); }
    onStop(fn: () => void): void { this.stops.push(fn); }
    later(ms: number, fn: () => void): void {
      this.timers.push(setTimeout(() => { if (!this.stopped && !this.over) fn(); }, ms));
    }
    say(who: VillagerKey | null, line: Line, ms = 2600): void {
      const el = h('div', 'tyg-say', undefined, this.root);
      if (who) h('b', '', L2(ctx, nameOf(who)), el);
      h('span', '', who ? quoted(ctx, L2(ctx, line)) : L2(ctx, line), el);
      setTimeout(() => el.remove(), ms);
    }
    pop(text: string, cls = ''): void { popUi(this.p, text, cls); }
    tr(l: Line): string { return L2(ctx, l); }
    quote(text: string): string { return quoted(ctx, text); }
    view(to: XYZ, look: XYZ, secs = 1.2): void {
      void eng.cinematic({ to, look, secs: still ? 0 : secs, hold: 3600 });
    }
    at(x: number, z: number, dy = 0): T.Vector3 { return floorPt(ctx, x, z, dy); }
    finish(r: RoundResult): void {
      if (this.stopped || this.over) return;
      this.over = true;
      this.cleanup();
      this.resolve?.(r);
      this.resolve = null;
    }
    quit(): void { this.halt(true); }
    /** Stop now, with no pay (silent: no line). */
    halt(_silent: boolean): void {
      if (this.stopped || this.over) return;
      this.stopped = true;
      this.cleanup();
      this.resolve?.(null);
      this.resolve = null;
    }
    private cleanup(): void {
      this.offFrame?.();
      this.offFrame = null;
      this.offEsc();
      for (const tm of this.timers) clearTimeout(tm);
      this.timers = [];
      for (const fn of this.stops.splice(0)) { try { fn(); } catch (e) { console.error('[walk] taoyuan game stop', e); } }
      this.fns = [];
      this.p.close();
    }
  }

  // ───────────── the pay, the goods, the card

  function settle(g: GameId, gentle: boolean, option: string | null, r: RoundResult): void {
    void option;
    const d = GAMES[g];
    const day = life.day();
    const grade: GameGrade = gradeOf(g, r.measure);
    // the 土产: the day's first 3 rounds of this game
    const paid = life.today(playKey(g));
    // (a round that scored nothing — five cups spilled, not a leaf fed — earns no 土产)
    const want = r.score > 0 ? goodsFor(grade, paid, !!r.bonus) : 0;
    const kind = GAME_KIND[g];
    let kept = 0;
    if (want > 0) {
      record(playKey(g));
      kept = life.grant(kind, want);
      // (a 鳜 among the fish kept: 阿黍's 炙鱼 has a word for it)
      if (g === 'mo' && r.bonus && kept > 0) record(GUI_GOT);
    }
    // 文
    const pp = tyxiPay(g, r.coins, '', '');
    const out = pay(pp);
    // 今日之约
    const yue = yueFor(day);
    let yueMet = false, yueKept = 0;
    if (yue.game === g && r.yue >= yue.target && life.today(YUE) === 0) {
      record(YUE);
      yueMet = true;
      pay(tyxiPay(g, TYXI_YUE_COINS, FRAME.yue.zh, FRAME.yue.en, true));
      yueKept = life.grant(kind, 1);
    }
    // bests and the seal
    const prev = play.peek().best[gentle ? bestGentleKey(g) : bestKey(g)] ?? 0;
    recordMax(gentle ? bestGentleKey(g) : bestKey(g), r.score);
    for (const b of r.bests ?? []) recordMax(b.key, b.value);
    for (const f of r.flags ?? []) flag(f);
    const sealNow = sealEarned(gentle, r.feat) && !play.peek().flags[sealKey(g)];
    if (sealEarned(gentle, r.feat)) flag(sealKey(g));
    // the card
    const zh: string[] = [], en: string[] = [];
    zh.push(`${FRAME.score.zh} ${r.score} · ${FRAME.grade[grade].zh}`);
    en.push(`${FRAME.score.en} ${r.score} · ${FRAME.grade[grade].en}`);
    for (const l of r.lines ?? []) { zh.push(l.zh); en.push(l.en); }
    const kn = KIND_NAME[kind];
    if (want > 0) {
      if (kept > 0) { zh.push(`${FRAME.got.zh} ${kn.zh} ×${kept}`); en.push(`${FRAME.got.en} ${kn.en} ×${kept}`); }
      if (kept < want) { zh.push(FRAME.jarFull.zh); en.push(FRAME.jarFull.en); }
    } else { zh.push(FRAME.noGoods.zh); en.push(FRAME.noGoods.en); }
    const cz = payLine(pp, out, 'zh'), ce = payLine(pp, out, 'en');
    if (cz) { zh.push(cz); en.push(ce); }
    if (yueMet) {
      zh.push(`${FRAME.yueMet.zh} +${TYXI_YUE_COINS} 文${yueKept ? ` · ${kn.zh} ×${yueKept}` : ''}`);
      en.push(`${FRAME.yueMet.en} +${TYXI_YUE_COINS} coins${yueKept ? ` · ${kn.en} ×${yueKept}` : ''}`);
    }
    if (r.score > prev && r.score > 0) { zh.push(`—— ${FRAME.newBest.zh}`); en.push(`— ${FRAME.newBest.en}`); }
    if (sealNow) { zh.push(`${FRAME.seal.zh}「${SEAL_GLYPH[g]}」`); en.push(`${FRAME.seal.en}`); }
    const q = QUOTES[g];
    zh.push('', `「${q.poem}」`, `—— ${q.poet}`);
    en.push('', `“${q.en}”`, `— ${q.enBy}`);
    ctx.hud.showCard({
      titleZh: `${GAME_NAME[g].zh} · ${r.score}`, titleEn: `${GAME_NAME[g].en} · ${r.score}`,
      bodyZh: zh.join('\n'), bodyEn: en.join('\n'),
      seal: sealNow ? SEAL_GLYPH[g] : grade,
    });
    // the host's reaction, and the good handed over
    const say = (who: VillagerKey, l: Line, ms: number) => ctx.hud.toast(`${nameOf(who).zh}：「${l.zh}」`, `${nameOf(who).en}: "${l.en}"`, ms);
    if (r.say) say(r.say.who, r.say.line, 3600);
    const gl = kept > 0 ? d.good?.(life.hour()) ?? null : null;
    if (gl) bag.later(3800, () => say(gl.who, gl.line, 3400));
    if (r.after) bag.later(900, () => { try { r.after!(); } catch (e) { console.error('[walk] taoyuan game after', e); } });
  }

  return {
    dev: {
      game: (g: GameId) => open(g),
      gameNow: () => active?.g ?? null,
      gameStop: () => active?.halt(true),
      /** End the running round now with this score (and grade measure): the pay, the goods, the card. */
      gameEnd: (score: number, measure = score, feat = false) => active?.round()?.finish({ score, measure, feat, yue: score, coins: coinsFor(active.g, score) }),
      stands: () => [...stands.keys()],
    },
  };
};

