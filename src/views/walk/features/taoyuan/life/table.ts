// 桃源 · 二期「常住」: the table — the menu card and the order flow (spec §3.1–3.3, §3.6–3.8).
//
// A cook with something on answers 「吃点什么」 (their prompt, through the story's life hook). The card
// shows the cook and their seal, one to four dishes with their painted tops and one tag each (the price:
// a first taste on the house, today's bowl on the house, a good to trade, what a required dish needs,
// 亲手 when you hold the dish's own good), today's four bowls of appetite, the six goods and the mood,
// 「聊两句」 and ✕. Picking a dish pays (the dish's own good first; ⇄ swaps it), records the serving
// (tyl:ate, the day's appetite, on a first taste tyl:eat + the day + who you ate it with), sets the
// visit's mood and plays the 特写 at the cook's station and your seat (P's playPV). Until the 特写
// lands — or under 「不看」 — it is the eating emote and a small card.
//
// The whole order, the card included, runs inside the `taoyuan-life` claim: 出谷 closes the card or
// skips the 特写 to its end, and restore() puts the walker, the camera and the cook back.
// Owner: F (food).
import './table.css';
import { CHARACTER, type CharacterId } from '../../../../../data/characters';
import { flag, markDay, play, record } from '../../../../../app/play';
import { h, onEscape, tr } from '../../minigames/ui';
import { bite, ding, pour } from '../../minigames/sound';
import { taoyuanHooks, type VillagerKey, type VillagerPrompt } from '../hooks';
import { B3_SEATS, VILLAGERS, metFlag, nameOf, spotOf, type Spot } from '../folk';
import { L as toLocal, W, Y_T, standAt } from '../places';
import { closeShidan } from '../../../shidan/state';
import { COOKS, DISHES, KINDS, MENU, MOOD_NAME, NEW_PAGE } from './food';
import { BELLY, FREE, GUI_USED, JIE, KIND_IDS, TEA, ateKey, eatKey, guiHeld, withKey } from './keys';
import {
  appetite, bowls, festivalServing, freeSeat, menuFor, moodAfter, ownBeat, payChoices, pickPayment, priceFor, priceStateOf,
  pvModeFor, reactionFor, seasonAt, stationFor, unitsOf, xinpeiSwap, type Appetite, type MenuOpts, type Price,
} from './table-logic';
import { thumbOf } from './paint';
import { playPV, skipPV } from './pv';
import type { WorldCtx } from '../../../types';
import type { CookKey, DishId, KindId, LifeActivity, LifeMount, Line, PVOpts, PvPlace } from './types';

/** Each world's table flow for one dish (流觞's supper: 「吃一碗」). */
const servers = new WeakMap<WorldCtx, (d: DishId) => Promise<'ok' | 'busy' | 'cannot'>>();

/**
 * Serve one dish through the table's normal flow — its price, its record, its 特写 — as if picked on
 * its cook's card (the 流觞 result card's 「吃一碗」 offers 鸡黍). Give back any life claim first.
 * 'busy': the table or anything else holds the claim, or life is shut; 'cannot': full, or nothing
 * to pay with.
 */
export function serveDish(ctx: WorldCtx, d: DishId): Promise<'ok' | 'busy' | 'cannot'> {
  return servers.get(ctx)?.(d) ?? Promise.resolve('busy');
}

const COOK_SET = new Set<VillagerKey>(['guiniang', 'duer', 'gegu', 'sang', 'ashu']);
const isCook = (k: VillagerKey): k is CookKey => COOK_SET.has(k);

/** The long tables' seats (the B3 feast's, on the two benches), in order. */
const TABLE_SEATS: Spot[] = Object.values(B3_SEATS).filter((s): s is Spot => !!s && !!s.sit && Math.abs(s.x - 4.6) < 1.2);
/** A 特写 that came back this quickly did not play (the phase-0 stub, or a failure): eat without it. */
const PV_STUB_MS = 150;

type Flags = Readonly<Record<string, true | undefined>>;

/** One dish's tile on the card, now. */
interface TileState {
  d: DishId;
  price: Price;
  ap: Appetite;
  /** The good that will pay (a paid serving), or null. */
  pay: KindId | null;
  choices: KindId[];
  /** Can be ordered now. */
  can: boolean;
  /** The tag under the name. */
  tag: Line;
  /** The 亲手 beat will play. */
  own: KindId | null;
  /** What the cook says when it cannot be had (full, nothing to pay with). */
  why: Line | null;
}

export const mountTable: LifeMount = (bag, ctx, tv, life) => {
  const flags = (): Flags => play.peek().flags;
  const who = (): CharacterId => ctx.player.character;

  // ───────────── what is on

  /** Today's festival outside (the 暮 席): the first with a dish of its own, else the first. */
  const festival = () => {
    const fs = ctx.env.festivals ?? [];
    return fs.find((k) => k === 'midautumn' || k === 'dongzhi' || k === 'dragonboat' || k === 'spring' || k === 'lantern') ?? fs[0] ?? null;
  };
  const menuOpts = (): MenuOpts => ({ season: seasonAt(ctx.env.date ?? new Date()), solved: !!flags()['case:hz:solved'], festival: festival() });
  const menuNow = (k: CookKey): DishId[] => menuFor(k, life.part(), menuOpts());

  function tileOf(d: DishId, prefer: KindId | null): TileState {
    const f = flags();
    const price = priceFor(d, priceStateOf(d, f, life.today));
    const ap = appetite(d, life.today(BELLY), { festival: !!festival(), extraUsed: life.today(JIE) });
    const stock = (k: KindId) => life.stock(k);
    const choices = price.kind === 'pay' ? payChoices(d, price.accept, stock) : [];
    const pay = price.kind === 'pay' ? pickPayment(d, price.accept, stock, prefer) : null;
    const own = ownBeat(d, price, pay, stock);
    const cook = COOKS[DISHES[d].cook];
    if (price.kind === 'none') return { d, price, ap, pay, choices, can: false, tag: price.why === 'tea-done' ? MENU.teaDone : MENU.free, own: null, why: null };
    if (ap === 'full') return { d, price, ap, pay, choices, can: false, tag: MENU.full, own: null, why: cook.full };
    let tag: Line;
    if (price.kind === 'free') tag = price.why === 'first' ? MENU.first : price.why === 'daily' ? MENU.daily : MENU.free;
    else tag = price.why === 'first' ? MENU.needs[d] ?? MENU.repeat : MENU.repeat;
    if (ap === 'extra') tag = MENU.extra;
    const can = price.kind === 'free' || pay !== null;
    return { d, price, ap, pay, choices, can, tag, own, why: can ? null : cook.broke };
  }

  // ───────────── the activity (the claim's holder)

  let phase: 'idle' | 'menu' | 'serving' = 'idle';
  let stopped = false;
  let leavingNow = false;
  let pvRunning = false;
  let serving: Promise<void> | null = null;
  let card: { root: HTMLElement; close(): void } | null = null;
  let servedCard: { close(): void } | null = null;
  /** Under 不看 the card outlives the order (the walker is free after 1.0 s): closed by the next card or the way out. */
  let lingering: { close(): void } | null = null;
  let offEsc: (() => void) | null = null;

  const act: LifeActivity = {
    kind: 'table',
    async leaving() {
      leavingNow = true;
      if (phase === 'menu') { closeCard(); phase = 'idle'; return true; }
      if (phase === 'serving') {
        stopped = true;
        if (pvRunning) { skipPV(ctx); skipPV(ctx); }
        servedCard?.close();
        await Promise.race([serving, new Promise((r) => setTimeout(r, 1600))]);
      }
      phase = 'idle';
      return true;
    },
    stop() {
      stopped = true;
      closeCard();
      lingering?.close();
      if (pvRunning) { try { skipPV(ctx); skipPV(ctx); } catch { /* gone */ } }
      servedCard?.close();
      phase = 'idle';
    },
  };

  /** Give the claim back (unless 出谷 is taking it: index gives it back then). */
  function done(): void {
    phase = 'idle';
    if (!leavingNow) life.release(act);
  }

  // ───────────── a few words from someone

  const nameLine = (k: VillagerKey): Line => nameOf(k, !!flags()[metFlag(k)]);
  const fill = (s: string) => s.replace(/\{名\}/g, '');
  function say(k: VillagerKey, l: Line): Promise<number> {
    const n = nameLine(k);
    try { return ctx.hud.say({ nameZh: n.zh, nameEn: n.en, zh: fill(l.zh), en: fill(l.en) }); } catch { return Promise.resolve(-1); }
  }
  function toast(k: VillagerKey, l: Line, ms = 3200): void {
    const n = nameLine(k);
    ctx.hud.toast(`${n.zh}：「${l.zh}」`, `${n.en}: “${l.en}”`, ms);
  }

  // ───────────── the menu card

  const chosen = new Map<DishId, KindId>();

  function mountCard(cls: string): { root: HTMLElement; close(): void } {
    const root = h('div', `mg is-game ${cls}`);
    root.lang = ctx.lang === 'zh' ? 'zh' : 'en';
    let off: (() => void) | null = ctx.hud.mount(root);
    return { root, close: () => { off?.(); off = null; } };
  }

  function closeCard(): void {
    card?.close();
    card = null;
    offEsc?.();
    offEsc = null;
  }

  async function openMenu(k: CookKey): Promise<void> {
    if (phase !== 'idle' || !life.open()) return;
    // 三娘 won't serve anyone smelling of wine (spec §3.8): wash at the well first
    if (k === 'sang' && life.mood() === '醺' && DISHES.shengao.refuse) { await say('sang', DISHES.shengao.refuse); return; }
    if (!menuNow(k).length) return;
    if (!life.claim(act)) return;
    lingering?.close();
    stopped = false;
    leavingNow = false;
    phase = 'menu';
    chosen.clear();
    try { ctx.player.freeze(true); } catch { /* the walker is optional in tests */ }
    const shell = mountCard('tyl-menu');
    card = shell;
    offEsc = onEscape(() => closeMenu());
    renderMenu(k, null);
    (shell.root.querySelector('.tyl-tile-pick:not([aria-disabled="true"])') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function closeMenu(): void {
    if (phase !== 'menu') return;
    closeCard();
    done();
  }

  function renderMenu(k: CookKey, line: Line | null): void {
    if (!card) return;
    const root = card.root;
    root.textContent = '';
    const v = VILLAGERS[k];
    const met = !!flags()[metFlag(k)];
    const dishes = menuNow(k);
    const tiles = dishes.map((d) => tileOf(d, chosen.get(d) ?? null));
    // (spent: the cook says so as the card opens)
    const say0 = line ?? (tiles.length && tiles.every((t) => t.ap === 'full' || t.price.kind === 'none') ? COOKS[k].full : null);

    const box = h('div', 'tyl-card', undefined, root);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', tr(ctx, `${v.zh} · 吃点什么`, `${v.en} · something to eat`));

    const head = h('header', 'tyl-head', undefined, box);
    h('span', 'tyl-seal brush', COOKS[k].seal, head).setAttribute('aria-hidden', 'true');
    const whoEl = h('div', 'tyl-who', undefined, head);
    h('b', '', met ? tr(ctx, v.zh, v.en) : tr(ctx, v.epithet.zh, v.epithet.en), whoEl);
    h('small', '', tr(ctx, MENU.ask.zh, MENU.ask.en), whoEl);
    const m = life.mood();
    if (m) {
      const mood = h('span', 'tyl-mood', undefined, head);
      h('span', 'brush', m, mood);
      if (ctx.lang !== 'zh') h('small', '', MOOD_NAME[m].en, mood);
      mood.title = tr(ctx, `${MENU.mood.zh} · ${m}`, `${MENU.mood.en} · ${MOOD_NAME[m].en}`);
    }
    const x = h('button', 'tyl-x', '×', head);
    x.type = 'button';
    x.setAttribute('aria-label', tr(ctx, MENU.close.zh, MENU.close.en));
    x.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); });

    const sayEl = h('p', 'tyl-say', say0 ? tr(ctx, `「${fill(say0.zh)}」`, `“${fill(say0.en)}”`) : '', box);
    sayEl.setAttribute('role', 'status');

    const list = h('ul', 'tyl-tiles', undefined, box);
    list.dataset.n = String(tiles.length);
    for (const t of tiles) {
      const dish = DISHES[t.d];
      const li = h('li', 'tyl-tile' + (t.can ? '' : ' is-off') + (t.own ? ' is-own' : ''), undefined, list);
      const pick = h('button', 'tyl-tile-pick', undefined, li);
      pick.type = 'button';
      if (!t.can) pick.setAttribute('aria-disabled', 'true');
      const src = thumbOf(t.d);
      const img = h('img', 'tyl-thumb', undefined, pick);
      img.alt = '';
      img.width = 96;
      img.height = 96;
      if (src) img.src = src;
      h('b', 'tyl-name', tr(ctx, dish.zh, dish.en), pick);
      // (桃花茶: 杜二's own words stand in for the price tag — 「不收」 and 「这个不收。」 said the same twice)
      const teaLine = t.d === 'taocha' && t.can && dish.tile ? dish.tile : null;
      if (teaLine) h('small', 'tyl-tile-line', tr(ctx, `「${teaLine.zh}」`, `“${teaLine.en}”`), pick);
      else {
        const tag = h('span', 'tyl-tag', tr(ctx, t.tag.zh, t.tag.en), pick);
        if (t.own) h('span', 'tyl-own', `✓${tr(ctx, MENU.own.zh, MENU.own.en)}`, tag);
      }
      pick.setAttribute('aria-label', tr(ctx, `${dish.zh} · ${t.tag.zh}`, `${dish.en} · ${t.tag.en}`));
      pick.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!t.can) {
          if (t.why) {
            sayEl.textContent = tr(ctx, `「${fill(t.why.zh)}」`, `“${fill(t.why.en)}”`);
            li.classList.remove('is-shake');
            void li.offsetWidth;
            li.classList.add('is-shake');
          }
          return;
        }
        void order(k, t.d);
      });
      // the good that pays, and ⇄ to swap it
      if (t.price.kind === 'pay' && t.pay) {
        const pb = h('button', 'tyl-pay', undefined, li);
        pb.type = 'button';
        const kd = KINDS[t.pay];
        h('span', '', `${tr(ctx, MENU.payWith.zh, MENU.payWith.en)} ${tr(ctx, kd.zh, kd.en)}`, pb);
        if (t.choices.length > 1) h('span', 'tyl-cycle', '⇄', pb).setAttribute('aria-hidden', 'true');
        pb.disabled = t.choices.length < 2;
        pb.setAttribute('aria-label', tr(ctx, `用${kd.zh}付，${MENU.cycle.zh}`, `Pay with ${kd.en}; ${MENU.cycle.en.toLowerCase()}`));
        pb.addEventListener('click', (e) => {
          e.stopPropagation();
          const i = t.choices.indexOf(t.pay!);
          chosen.set(t.d, t.choices[(i + 1) % t.choices.length]);
          renderMenu(k, null);
        });
      }
    }

    const foot = h('div', 'tyl-foot', undefined, box);
    const belly = h('div', 'tyl-belly', undefined, foot);
    h('small', '', tr(ctx, MENU.appetite.zh, MENU.appetite.en), belly);
    const bw = h('span', 'tyl-bowls', undefined, belly);
    const units = life.today(BELLY);
    bw.setAttribute('aria-label', tr(ctx, `今天吃了 ${units / 2} 碗`, `${units / 2} of 4 bowls eaten today`));
    for (const b of bowls(units)) h('i', b >= 1 ? 'is-full' : b > 0 ? 'is-half' : '', undefined, bw);
    const goods = h('div', 'tyl-goods', undefined, foot);
    h('small', '', tr(ctx, MENU.goods.zh, MENU.goods.en), goods);
    const gl = h('span', 'tyl-goods-list', undefined, goods);
    for (const kd of KIND_IDS) {
      const n = life.stock(kd);
      const g = h('span', 'tyl-good' + (n ? '' : ' is-none'), undefined, gl);
      h('span', '', tr(ctx, KINDS[kd].zh, KINDS[kd].en), g);
      h('b', 'num', String(n), g);
    }

    const acts = h('div', 'tyl-acts', undefined, box);
    const chat = h('button', 'tyl-chat', tr(ctx, MENU.chat.zh, MENU.chat.en), acts);
    chat.type = 'button';
    chat.addEventListener('click', (e) => { e.stopPropagation(); void talk(k); });
  }

  /** 「聊两句」: give the claim back, then the villager's ordinary chat. */
  async function talk(k: CookKey): Promise<void> {
    if (phase !== 'menu') return;
    closeCard();
    done();
    try { await taoyuanHooks.story?.talk(k); } catch (e) { console.error('[walk] taoyuan table talk', e); }
  }

  // ───────────── the order

  function placeOf(cook: CookKey): PvPlace | null {
    try {
      const st = stationFor(cook, life.part());
      let seat = st.seat === 'tables' ? null : st.seat;
      let seatFace = st.seatFace ?? st.prop;
      if (!seat) {
        const occ: { x: number; z: number }[] = [];
        for (const k of Object.keys(VILLAGERS) as VillagerKey[]) {
          if (k === cook) continue;
          const p = taoyuanHooks.story?.villager(k)?.position();
          if (p) occ.push(toLocal(p.x, p.z));
        }
        const s = freeSeat(TABLE_SEATS, occ) ?? TABLE_SEATS[0];
        seat = { x: s.x, z: s.z };
        seatFace = s.face ?? st.prop;
      }
      const world = (p: { x: number; z: number }) => ({ ...W(p.x, p.z), y: Y_T + standAt(p.x, p.z) });
      const flat = (p: { x: number; z: number }) => W(p.x, p.z);
      return { cook, station: world(st.cook), stationFace: flat(st.prop), seat: world(seat), seatFace: flat(seatFace) };
    } catch (e) {
      console.error('[walk] taoyuan table place', e);
      return null;
    }
  }

  async function order(k: CookKey, d: DishId, o: { force?: boolean } = {}): Promise<void> {
    if (phase !== 'menu' && !o.force) return;
    const t = tileOf(d, chosen.get(d) ?? null);
    if (!t.can) return;
    phase = 'serving';
    closeCard();
    let finish!: () => void;
    serving = new Promise<void>((r) => { finish = r; });
    try {
      await serve(k, d, t);
    } catch (e) {
      console.error('[walk] taoyuan table', e);
    } finally {
      servedCard?.close();
      finish();
      serving = null;
      if (!stopped) done();
    }
  }

  async function serve(k: CookKey, d: DishId, t: TileState): Promise<void> {
    const f = flags();
    const me = who();
    const dish = DISHES[d];
    // pay
    let paid: KindId | null = null;
    // (a 鳜 from 摸鱼 paying for 柳枝炙鱼: 阿黍's other 亲手 line)
    const gui = guiHeld(play.peek().counters);
    let rare = false;
    if (t.price.kind === 'pay') {
      paid = t.pay;
      if (!paid || !life.use(paid)) return;
      rare = gui && paid === 'yu' && d === 'zhiyu' && t.own === 'yu';
      if (gui && paid === 'yu' && (rare || life.stock('yu') === 0)) record(GUI_USED);
    }
    // record
    const first = !f[eatKey(d)];
    record(ateKey(d));
    // (a festival's one serving beyond appetite is counted as that, not in the belly)
    if (t.ap === 'extra') record(JIE);
    else record(BELLY, unitsOf(d));
    if (t.price.kind === 'free' && t.price.why === 'daily') record(FREE);
    if (d === 'taocha') record(TEA);
    if (first) {
      flag(eatKey(d));
      markDay(eatKey(d));
      flag(withKey(d, me));
    }
    const mood = moodAfter(d, me);
    if (mood) life.setMood(mood);
    // 新醅: 杜二 takes an egg, and has a word for the child, the rabbit and the cat before he pours
    const swap = d === 'xinpei' ? xinpeiSwap(me) : null;
    if (d === 'xinpei' && paid === 'dan' && dish.eggLine) await say('duer', dish.eggLine);
    if (swap && !stopped) await say('duer', swap.line);
    if (stopped) return;

    // the 特写 (or, without it, the eating emote and a card)
    const react = reactionFor(me, d);
    const opts: PVOpts = {
      first,
      own: t.own,
      mode: pvModeFor(flags(), first),
      at: placeOf(k),
      season: dish.season ?? null,
      li: !!swap?.li,
      festival: festivalServing(d, life.part(), festival()),
      rare,
      react: react.line,
    };
    const t0 = performance.now();
    pvRunning = true;
    try { await playPV(ctx, tv, d, opts); } catch (e) { console.error('[walk] taoyuan 特写', e); }
    pvRunning = false;
    if (stopped) return;
    if (performance.now() - t0 < PV_STUB_MS) await served(d, first, react.line, t.own, !!swap?.li, opts.mode === 'none', rare);
    if (stopped) return;
    // a word after it: 葛姑 on the fourth plum, 阿黍 losing his fish, 桂娘 and the moon; 小满 on 阿黍's fish
    if (react.reply) toast(react.reply.by, react.reply.line, 3000);
    if (d === 'zhiyu' && dish.bark && spotOf('xiaoman', 'chang', life.part(), flags(), life.hour())) toast('xiaoman', dish.bark, 3400);
  }

  /**
   * Eating without the 特写: the emote, and a small card with the dish, its caption and the companion's word.
   * `quick` (the 不看 setting, spec §4.4): the order ends after 1.0 s and the card stays a while as a note.
   */
  function served(d: DishId, first: boolean, react: Line, own: KindId | null, li: boolean, quick = false, rare = false): Promise<void> {
    const dish = DISHES[d];
    const cookLine = own && dish.ownLine ? (rare && dish.ownRare ? dish.ownRare : dish.ownLine) : dish.vo[1];
    try { ctx.player.emote('eat'); } catch { /* optional */ }
    try { if (dish.pv === '饮') pour(); else bite(); } catch { /* the sound is optional */ }
    const shell = mountCard('tyl-served');
    const box = h('div', 'tyl-served-card', undefined, shell.root);
    box.setAttribute('role', 'status');
    const top = h('div', 'tyl-served-top', undefined, box);
    const img = h('img', 'tyl-served-thumb', undefined, top);
    img.alt = '';
    const src = thumbOf(d, 160, { li });
    if (src) img.src = src;
    const txt = h('div', 'tyl-served-txt', undefined, top);
    const nm = h('b', ctx.lang === 'zh' ? 'brush' : '', tr(ctx, dish.zh, dish.en), txt);
    h('span', 'tyl-seal brush', COOKS[dish.cook].seal, nm).setAttribute('aria-hidden', 'true');
    h('small', 'tyl-caption', tr(ctx, dish.caption.zh, dish.caption.en), txt);
    const cn = nameLine(dish.cook);
    h('p', 'tyl-served-vo', tr(ctx, `${cn.zh}：「${fill(cookLine.zh)}」`, `${cn.en}: “${fill(cookLine.en)}”`), box);
    const narr = react.zh.startsWith('（') && react.zh.endsWith('）');
    const me = h('p', 'tyl-served-me' + (narr ? ' is-narr' : ''), undefined, box);
    if (!narr) h('b', '', tr(ctx, meName().zh, meName().en), me);
    h('span', '', tr(ctx, narr ? react.zh : `「${react.zh}」`, narr ? react.en : `“${react.en}”`), me);
    if (first) {
      h('p', 'tyl-served-new', tr(ctx, NEW_PAGE.zh, NEW_PAGE.en), box);
      try { ding(2); } catch { /* optional */ }
    }
    return new Promise<void>((resolve) => {
      let tm: ReturnType<typeof setTimeout> | null = null;
      const close = () => {
        if (tm) clearTimeout(tm);
        tm = null;
        shell.close();
        if (servedCard === handle) servedCard = null;
        if (lingering === handle) lingering = null;
        resolve();
      };
      const handle = { close };
      servedCard = handle;
      // (under 不看, after 1.0 s the card is only a note: the walk's buttons come back under it)
      if (quick) setTimeout(() => { if (servedCard === handle) { servedCard = null; lingering = handle; shell.root.classList.remove('is-game'); } resolve(); }, 1000);
      box.addEventListener('click', close);
      tm = setTimeout(close, first ? 4200 : 3400);
    });
  }

  /** The walker's companion, who says the reaction. */
  function meName(): Line {
    const c = CHARACTER[ctx.player.character];
    return c ? { zh: c.zh, en: c.en } : { zh: '我', en: 'Me' };
  }

  // ───────────── the way out, and the world going (life/index.ts keeps the chip's lifeHere)

  bag.onDispose(tv.onLeave(() => closeShidan()));
  bag.onDispose(() => {
    act.stop();
    closeShidan();
    if (servers.get(ctx) === serveHere) servers.delete(ctx);
  });

  /** 流觞's supper: the table's own flow for one dish, as if picked on its cook's card. */
  async function serveHere(d: DishId): Promise<'ok' | 'busy' | 'cannot'> {
    if (phase !== 'idle' || !life.open()) return 'busy';
    if (!tileOf(d, null).can) return 'cannot';
    if (!life.claim(act)) return 'busy';
    stopped = false;
    leavingNow = false;
    phase = 'menu';
    chosen.clear();
    try { ctx.player.freeze(true); } catch { /* optional */ }
    await order(DISHES[d].cook, d, { force: true });
    if ((phase as string) !== 'idle') done();
    return 'ok';
  }
  servers.set(ctx, serveHere);

  // ───────────── the part: 「吃点什么」 on a cook with something on

  return {
    prompt(k: VillagerKey): VillagerPrompt | null {
      if (!isCook(k) || phase !== 'idle') return null;
      if (!menuNow(k).length) return null;
      const met = !!flags()[metFlag(k)];
      const v = VILLAGERS[k];
      return { label: met ? { zh: v.zh, en: v.en } : v.epithet, action: MENU.ask, act: () => openMenu(k) };
    },
    dev: {
      /** Open a cook's menu card where you stand (DEV). */
      menu: (k: CookKey) => openMenu(k),
      /** Order a dish straight away, as if picked on its cook's card (DEV). */
      eat: (d: DishId) => serveHere(d),
      /** The table's state now (DEV). */
      table: () => ({ phase, menu: (['guiniang', 'duer', 'gegu', 'sang', 'ashu'] as const).map((k) => [k, menuNow(k)]) }),
    },
  };
};
