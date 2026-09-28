// 水月幻镜 · the tutorial 「初入镜中」, pure parts (d-tutorial §5.1): the fixed run, its setups and preset
// shop, the action classifier, the step machine (canonical order, early goals, skips, a random fuzz),
// H2's safety net, every line (variants, caps, banned words, no hanzi in English, slots equal to data),
// and who gets offered the tutorial.
import { describe, expect, it } from 'vitest';
import type { RunSave, WaveResult } from '../src/views/mirror/types';
import { STARTER_ITEMS, STARTER_WEAPONS, type ItemId, type WeaponId } from '../src/views/mirror/ids';
import { F, PAY, SKILLS, WEAPONS } from '../src/views/mirror/data';
import { termOf } from '../src/views/mirror/data/glossary';
import {
  buy, endWave, freeRerolls, gross, itemPrice, merge, openShop, pickCard, rerollCards, reroll, resolveCrate, sell, shopView, toggleLock, weaponPrice,
} from '../src/views/mirror/logic';
import { TUTOR_SEED, TUTOR_SHOP1, tutorPlan, tutorRun, tutorScript, tutorSetup, tutorShop1, tutorUnlocks } from '../src/views/mirror/tutor/run';
import { classify } from '../src/views/mirror/tutor/classify';
import { createTutorSession, shortfall } from '../src/views/mirror/tutor/session';
import {
  BUTTONS, END, LABEL_SLOTS, LINES, LINE_CAPS, OFFER, SETTINGS, TIPS, backWave, fillSlots, lineSlots, resolveLine, type Line,
} from '../src/views/mirror/tutor/lines';
import { CUE_STEPS, PHASE_STEPS, STEPS, initTut, reduce, view, type StepId, type TutState } from '../src/views/mirror/tutor/machine';
import type { MachineEvent } from '../src/views/mirror/tutor/events';
import { decideTutorOffer, isNewcomer } from '../src/views/mirror/tutor/offer';
import { defaultMeta } from '../src/app/mirror';

const DAY = '2026-09-28';
const won = (w: number, o: Partial<WaveResult> = {}): WaveResult => ({
  wave: w, moon: 18, xp: 20, field: 0, storeLeft: 0, levels: 1, crates: 0, hearts: [], sleeve: [], lives: 0, once: [], drunk: 0,
  stats: { kills: 20 }, killsBy: { blot: 12 }, byWeapon: {}, bosses: [], ms: 50_000, ...o,
});

describe('the fixed run', () => {
  it('is 书生 on 月湖 at 闲游 with one 青锋剑, no starting pick, no pay, no heart, the fixed seed', () => {
    const r = tutorRun(DAY);
    expect(r.char).toBe('scholar');
    expect(r.map).toBe('lake');
    expect(r.diff).toBe(0);
    expect(r.weapons).toEqual([{ id: 'qingfeng', t: 1 }]);
    expect(r.pending.start).toBeNull();
    expect(r.rate).toBe(0);
    expect(r.ticket).toBe(0);
    expect(r.free).toBe(false);
    expect(r.heart).toEqual({});
    expect(r.vows).toEqual({});
    expect(r.seed).toBe(TUTOR_SEED);
    expect(r.tutorial).toBe(true);
    expect(r.mutators).toEqual([]);
    expect(r.term).toBeNull();
    expect(tutorRun(DAY)).toEqual(r);
  });
  it('has gentle, untimed, empty plans; no coins, 镜蚀 or 节气; the wave script by number', () => {
    const r = tutorRun(DAY);
    for (const w of [1, 2, 3]) {
      const s = tutorSetup({ ...r, wave: w - 1, inWave: w });
      expect(s.wave).toBe(w);
      expect(s.coins).toEqual([]);
      expect(s.mutators).toEqual([]);
      expect(s.term).toBeNull();
      expect(s.plan.len).toBeNull();
      expect(s.plan.boss).toBeNull();
      expect(s.plan.groups).toEqual([]);
      expect(s.plan.elites).toEqual([]);
      expect(tutorScript(w)).toBe(`tut${w}`);
    }
    expect(tutorPlan(2).hpX).toBeLessThan(1);
  });
  it('presets the first shop with starter goods at their real prices, and openShop keeps it', () => {
    const s = createTutorSession(tutorRun(DAY));
    const r0 = s.startWave(s.run()).run;
    expect(r0.inWave).toBe(1);
    const r1 = s.waveWon(won(1))!;
    expect(r1.shop?.wave).toBe(2);
    expect(r1.shop?.slots.map((x) => x?.id)).toEqual(['qingfeng', 'songzi', 'sandals', 'bell']);
    for (const x of TUTOR_SHOP1) {
      if (x.kind === 'weapon') expect(STARTER_WEAPONS).toContain(x.id as WeaponId);
      else expect(STARTER_ITEMS).toContain(x.id as ItemId);
    }
    expect(openShop(r1, tutorUnlocks())).toBe(r1);
    const v = shopView(r1);
    expect(v.slots[0].price).toBe(weaponPrice('qingfeng', 1, 1, r1));
    expect(v.slots[1].price).toBe(itemPrice('songzi', 1, r1));
    expect(r1.shop?.free).toBe(freeRerolls(r1));
    expect(r1.shop?.free).toBeGreaterThanOrEqual(1);
    expect(tutorShop1(r1).shop?.slots).toEqual(r1.shop?.slots);
  });
});

describe('classify', () => {
  const base = (): RunSave => tutorShop1(endWave({ ...tutorRun(DAY), inWave: 1 }, won(1, { moon: 60 })));
  it('recognises each action from the real logic calls', () => {
    const r = base();
    const b = buy(r, 0)!;
    expect(classify(r, b)).toEqual({ a: 'buy', slot: 0 });
    const m = merge(b, 0, 1)!;
    expect(classify(b, m)).toEqual({ a: 'merge' });
    const two = buy(r, 0)!;
    expect(classify(two, sell(two, 1))).toEqual({ a: 'sell' });
    expect(classify(r, toggleLock(r, 2))).toEqual({ a: 'lock', slot: 2 });
    const rr = reroll(r, tutorUnlocks())!;
    expect(classify(r, rr)).toEqual({ a: 'reroll' });
    expect(classify(r, pickCard(r, 0))).toEqual({ a: 'card' });
    const withCrate: RunSave = { ...r, pending: { ...r.pending, cards: 0, crates: 1 } };
    expect(classify(withCrate, resolveCrate(withCrate, true, tutorUnlocks()))).toEqual({ a: 'crate' });
    expect(classify(r, r)).toBeNull();
    expect(classify(r, rerollCards(r) ?? r)).toBeNull();
    expect(classify(r, { ...r, moon: r.moon + 1 })).toBeNull();
  });
});

// ───────────────────────────────────────────── the machine
const cue = (key: string, v?: number): MachineEvent => ({ k: 'cue', key, v });
const scr = (s: string): MachineEvent => ({ k: 'screen', s: s as never });
function run(evs: MachineEvent[], st: TutState = initTut()): { st: TutState; shown: StepId[]; holds: string[]; whispers: string[]; grants: number } {
  const shown: StepId[] = [], holds: string[] = [], whispers: string[] = [];
  let grants = 0;
  for (const ev of evs) {
    const o = reduce(st, ev);
    st = o.state;
    if (o.hold) holds.push(ev.k === 'cue' ? ev.key : ev.k);
    if (o.grant) grants++;
    for (const w of o.whispers) whispers.push(w.line);
    const v = view(st);
    if (v && shown[shown.length - 1] !== v.id) shown.push(v.id);
  }
  return { st, shown, holds, whispers, grants };
}
const CANON: MachineEvent[] = [
  scr('ritual'), scr('bake'), scr('ready'), scr('wave'),
  cue('move'), cue('moved'), cue('kills3'), cue('pickups3'), { k: 'levelUp', level: 2 }, cue('clock'),
  scr('cards'), { k: 'act', a: 'card' },
  scr('shop'), { k: 'ok' }, { k: 'act', a: 'buy', slot: 0 }, { k: 'ui', tut: 'tab:wpn', selected: true }, { k: 'ui', tut: 'wslot:0', pressed: true },
  { k: 'act', a: 'merge' }, { k: 'ok' }, { k: 'act', a: 'lock', slot: 2 }, { k: 'act', a: 'reroll' }, { k: 'ui', tut: 'who' }, { k: 'who', open: true }, { k: 'ok' },
  scr('wave'), cue('pause'), cue('tele1'), { k: 'ok' }, cue('teleDodged', 1), cue('teleDodged', 2), cue('dodged2'), cue('lanterns'), cue('crowd'), cue('cast'),
  scr('shop'), { k: 'ok' },
  scr('wave'), cue('foe'), { k: 'ok' }, cue('tele'), { k: 'ok' }, cue('foeHp', 0.5), cue('foeDown'),
  scr('crate'), { k: 'act', a: 'crate' },
  scr('tutorEnd'),
];

describe('the step machine', () => {
  it('walks the canonical script to the end, in order, holding where designed', () => {
    const r = run(CANON);
    expect(r.st.ended).toBe(true);
    expect(r.shown).toEqual(['R1', 'W1', 'W2', 'W3', 'W6', 'C1', 'H1', 'H2', 'H3a', 'H3', 'H4', 'H5', 'H6', 'H7', 'H7b', 'H8', 'D1', 'D2', 'D3', 'H9', 'B1', 'B2', 'K1']);
    expect(r.holds).toEqual(['tele1', 'foe', 'tele']);
    expect(r.grants).toBe(1);
    expect(r.whispers).toEqual(expect.arrayContaining(['W4', 'W5', 'H3done', 'H6done', 'P1', 'D1a', 'D1b', 'D3b', 'B5']));
  });
  it('advances only on the right actions', () => {
    let st = run([scr('ready'), scr('wave'), cue('move')]).st;
    expect(view(st)?.id).toBe('W1');
    for (const ev of [cue('teleHit'), cue('lanterns'), { k: 'act', a: 'buy', slot: 0 } as MachineEvent, { k: 'ok' } as MachineEvent, { k: 'ui', tut: 'who' } as MachineEvent]) st = reduce(st, ev).state;
    expect(view(st)?.id).toBe('W1');
    st = reduce(st, cue('moved')).state;
    expect(view(st)?.id).toBe('W2');
    // the shop: H2 wants slot 0; another buy only whispers
    let sh = run([scr('ready'), scr('wave'), scr('shop'), { k: 'ok' }]).st;
    expect(view(sh)?.id).toBe('H2');
    const o = reduce(sh, { k: 'act', a: 'buy', slot: 1 });
    expect(view(o.state)?.id).toBe('H2');
    expect(o.whispers.map((w) => w.line)).toEqual(['H2a']);
    sh = reduce(o.state, { k: 'act', a: 'sell' }).state;
    expect(view(sh)?.id).toBe('H2');
    sh = reduce(sh, { k: 'act', a: 'buy', slot: 0 }).state;
    expect(view(sh)?.id).toBe('H3a');
    // a hold ignores everything but its button
    let h = run([scr('ready'), scr('wave'), scr('shop')]).st;
    expect(view(h)?.mode).toBe('hold');
    for (const ev of [{ k: 'tick', dt: 999 } as MachineEvent, { k: 'act', a: 'reroll' } as MachineEvent]) h = reduce(h, ev).state;
    expect(view(h)?.id).toBe('H1');
  });
  it('takes goals met early: they are marked done and skipped with a 「好」', () => {
    const r = run([
      scr('ready'), scr('wave'), scr('shop'),
      { k: 'act', a: 'lock', slot: 2 }, { k: 'act', a: 'reroll' }, { k: 'act', a: 'merge' },
      { k: 'ok' }, { k: 'act', a: 'buy', slot: 0 }, { k: 'ok' }, { k: 'ui', tut: 'who' }, { k: 'ok' },
    ]);
    expect(r.shown).toEqual(['R1', 'H1', 'H2', 'H4', 'H7', 'H7b', 'H8']);
    expect(r.whispers.filter((w) => w === 'nice').length).toBe(3);
  });
  it('gives every in-wave step and every optional shop step a skip time; holds wait for their button', () => {
    for (const id of Object.values(CUE_STEPS)) {
      const d = STEPS[id];
      if (d.mode === 'hold') expect(d.btn).toBeTruthy();
      else expect(d.skipAt).toBeGreaterThan(0);
    }
    for (const id of ['H2', 'H3a', 'H3', 'H5', 'H6', 'H7'] as StepId[]) expect(STEPS[id].skipAt).toBeGreaterThan(0);
    // a step nobody finishes hides by itself, with its nudge first
    let st = run([scr('ready'), scr('wave'), cue('move')]).st;
    st = reduce(st, { k: 'tick', dt: 7 }).state;
    expect(view(st)?.line).toBe('W1n');
    st = reduce(st, { k: 'tick', dt: 20 }).state;
    expect(view(st)).toBeNull();
  });
  it('asks for H2\'s moonlight once, and the session adds exactly the shortfall once', () => {
    const r = run([scr('ready'), scr('wave'), scr('cards'), scr('shop'), { k: 'ok' }, scr('shop'), { k: 'tick', dt: 5 }]);
    expect(r.grants).toBe(1);
    const s = createTutorSession(tutorRun(DAY));
    s.startWave(s.run());
    s.waveWon(won(1, { moon: 0, xp: 0 }));
    const need = shortfall(s.run());
    const price0 = shopView(s.run()).slots[0].price;
    expect(need).toBe(Math.max(0, Math.ceil(price0 - s.run().moon)));
    const before = s.run().moon;
    const got = s.grant();
    expect(got).toBe(need);
    expect(s.run().moon).toBe(before + need);
    expect(s.grant()).toBe(0);
  });
  it('never throws and always ends under 2 000 random event runs; every step is shown or skipped', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    const noise: MachineEvent[] = [
      { k: 'ok' }, { k: 'tick', dt: 3 }, { k: 'tick', dt: 30 }, { k: 'act', a: 'buy', slot: 0 }, { k: 'act', a: 'buy', slot: 2 }, { k: 'act', a: 'merge' },
      { k: 'act', a: 'lock', slot: 1 }, { k: 'act', a: 'reroll' }, { k: 'act', a: 'sell' }, { k: 'act', a: 'card' }, { k: 'act', a: 'crate' },
      { k: 'ui', tut: 'who' }, { k: 'ui', tut: 'tab:wpn' }, { k: 'who', open: true }, { k: 'levelUp', level: 3 },
      ...['move', 'moved', 'kills3', 'pickups3', 'clock', 'pause', 'tele1', 'teleHit', 'teleDodged', 'dodged2', 'lanterns', 'crowd', 'cast', 'foe', 'tele', 'foeHp', 'foeDown', 'saved', 'elite'].map((k) => cue(k, 1)),
    ];
    const skeleton = CANON.filter((e) => e.k === 'screen');
    const seenAll = new Set<StepId>();
    for (let n = 0; n < 2000; n++) {
      let st = initTut();
      for (const sk of skeleton) {
        const k = Math.floor(rnd() * 6);
        for (let i = 0; i < k; i++) {
          st = reduce(st, noise[Math.floor(rnd() * noise.length)]).state;
          const w = view(st);
          if (w) seenAll.add(w.id);
        }
        st = reduce(st, sk).state;
        const v = view(st);
        if (v) seenAll.add(v.id);
        // a hold always has its button; the step is always one of this phase's or a cue's
        if (v?.mode === 'hold') expect(v.btn).toBeTruthy();
      }
      expect(st.ended).toBe(true);
      expect(view(st)).toBeNull();
    }
    const all = new Set<StepId>([...Object.values(PHASE_STEPS).flat(), ...Object.values(CUE_STEPS)] as StepId[]);
    for (const id of Object.keys(STEPS) as StepId[]) expect(all.has(id) || id === 'B2').toBe(true);
    expect(run(CANON).shown.length).toBe(Object.keys(STEPS).length);
    expect(seenAll.size).toBeGreaterThan(12);
  });
});

// ───────────────────────────────────────────── the words
const HANZI = /[㐀-鿿豈-﫿]/;
const BANNED: readonly RegExp[] = [
  /至多/, /皆/, /其/, /致(?!命)/, /若/, /即/, /于/, /毕/, /进行/, /使得/, /提升/, /触发系数/, /重抽/, /精怪/,
  /之(?![后前间一])/, /(?<!或)者/, /(?<![可所])以(?![上下内后前])/, /劫火/, /\bu\b/, /u\/s/,
];
const ALL: [string, Line][] = [...Object.entries(LINES), ...Object.entries(TIPS)] as [string, Line][];
const FLAT: [string, { zh: string; en: string }][] = [
  ...Object.entries(BUTTONS), ...Object.entries(OFFER), ...Object.entries(SETTINGS),
  ['end.title', END.title], ['end.sub', END.sub], ['end.enter', END.enter], ['end.back', END.back], ['end.foot', END.foot],
  ...END.lines.map((x, i) => [`end.${i}`, x] as [string, { zh: string; en: string }]),
];

describe('the lines', () => {
  const slots = lineSlots({ meltN: 9 });
  const ctxs = [
    { lang: 'zh' as const, input: 'touch' as const, left: false }, { lang: 'zh' as const, input: 'keys' as const, left: true },
    { lang: 'en' as const, input: 'touch' as const, left: true }, { lang: 'en' as const, input: 'keys' as const, left: false },
  ];
  it('every step and tip has zh and en, and the touch / keys variants where the controls differ', () => {
    for (const [id, l] of ALL) {
      expect(l.base.zh.length, id).toBeGreaterThan(0);
      expect(l.base.en.length, id).toBeGreaterThan(0);
    }
    for (const id of ['W1', 'W1n', 'P1', 'D3', 'B3'] as const) expect(LINES[id].touch, id).toBeTruthy();
    for (const id of ['R1', 'C1', 'H2', 'H5', 'H6', 'H8', 'K1'] as const) expect(LINES[id].keys, id).toBeTruthy();
    for (const d of Object.values(STEPS)) { expect(LINES[d.line]).toBeTruthy(); if (d.nudge) expect(LINES[d.nudge]).toBeTruthy(); }
  });
  it('resolves every slot, fits the caps, and uses no banned word, bare u or hanzi in English', () => {
    for (const [id, l] of ALL) {
      for (const c of ctxs) {
        const text = resolveLine(l, { ...c, slots });
        expect(text, `${id} ${c.lang}`).not.toMatch(/\{\w+\}/);
        const cap = LINE_CAPS[l.where][c.lang];
        expect([...text].length, `${id} ${c.lang} ${c.input}: ${text}`).toBeLessThanOrEqual(cap);
        if (c.lang === 'en') expect(text, id).not.toMatch(HANZI);
        else {
          for (const re of BANNED) expect(re.test(text), `${id}: ${re} in ${text}`).toBe(false);
          expect((text.match(/——/g) ?? []).length).toBeLessThanOrEqual(1);
        }
      }
    }
    for (const [id, x] of FLAT) {
      const zh = fillSlots(x.zh, slots, 'zh'), en = fillSlots(x.en, slots, 'en');
      expect(zh, id).not.toMatch(/\{\w+\}/);
      expect(en, id).not.toMatch(/\{\w+\}/);
      expect(en, id).not.toMatch(HANZI);
      for (const re of BANNED) expect(re.test(zh), `${id}: ${re} in ${zh}`).toBe(false);
    }
  });
  it('fills its numbers from data', () => {
    const s = lineSlots();
    expect(s.cd).toBe(SKILLS.yizi.cd);
    expect(s.d1).toBe(WEAPONS.qingfeng.dmg[0]);
    expect(s.d2).toBe(WEAPONS.qingfeng.dmg[1]);
    expect(F.sellFrac).toBe(0.25);
    expect(s.sellFrac).toEqual({ zh: '四分之一', en: 'a quarter' });
    expect(s.fee).toBe(PAY.FEE);
    expect(s.e).toBe(Math.round(F.curseEnemy * 1000) / 10);
    expect(s.d).toBe(F.curseDmg);
    expect(s.m).toBe(Math.round(F.curseMoon * 1000) / 10);
    const W = backWave();
    expect(gross(W, 1, 'lake', 0, 0)).toBeGreaterThanOrEqual(PAY.FEE);
    expect(gross(W - 1, 1, 'lake', 0, 0)).toBeLessThan(PAY.FEE);
    expect(W).toBe(10); // the lobby's rules lead line: 「过第十重，镜钱回本。」
    const r = resolveLine(LINES.H3done, { lang: 'zh', input: 'keys', left: false, slots: s });
    expect(r).toContain(`${WEAPONS.qingfeng.dmg[0]} 变成 ${WEAPONS.qingfeng.dmg[1]}`);
    expect(resolveLine(LINES.D3b, { lang: 'en', input: 'keys', left: false, slots: s })).toContain(`${SKILLS.yizi.cd} seconds`);
  });
  it('names buttons and stats by their glossary labels', () => {
    const s = lineSlots();
    for (const [slot, id] of Object.entries(LABEL_SLOTS)) expect((s[slot] as { zh: string }).zh, slot).toBe(termOf(id).zh);
    expect(resolveLine(LINES.H6, { lang: 'zh', input: 'touch', left: false, slots: s })).toContain(`「${termOf('reroll').zh}」`);
    expect(resolveLine(LINES.H7, { lang: 'zh', input: 'touch', left: false, slots: s })).toContain(`「${termOf('panel').zh}」`);
    expect(resolveLine(LINES.K1, { lang: 'zh', input: 'touch', left: false, slots: lineSlots({ meltN: 7 }) })).toContain(`「${termOf('melt').zh}」就换成 7`);
  });
  it('speaks of the side the controls are on', () => {
    const s = lineSlots();
    expect(resolveLine(LINES.W1, { lang: 'zh', input: 'touch', left: false, slots: s })).toContain('左半边');
    expect(resolveLine(LINES.W1, { lang: 'zh', input: 'touch', left: true, slots: s })).toContain('右半边');
    expect(resolveLine(LINES.D3, { lang: 'zh', input: 'touch', left: true, slots: s })).toContain('左下角');
    expect(resolveLine(LINES.D3, { lang: 'en', input: 'touch', left: false, slots: s })).toContain('bottom right');
  });
});

describe('who is offered the tutorial', () => {
  const m = defaultMeta(DAY);
  it('follows ?tutor, webdriver, the flag, a paused run and a history', () => {
    expect(decideTutorOffer({ meta: m, webdriver: false, param: '0' })).toBeNull();
    expect(decideTutorOffer({ meta: { ...m, tutor: { offered: true, done: true, tips: {} } }, webdriver: true, param: '1' })).toBe('sheet');
    expect(decideTutorOffer({ meta: m, webdriver: true, param: null })).toBeNull();
    expect(decideTutorOffer({ meta: { ...m, tutor: { offered: true, done: false, tips: {} } }, webdriver: false, param: null })).toBeNull();
    expect(decideTutorOffer({ meta: { ...m, active: tutorRun(DAY) }, webdriver: false, param: null })).toBe('ribbon');
    expect(decideTutorOffer({ meta: m, webdriver: false, param: null })).toBe('sheet');
    const vet = { ...m, codex: { 'char:scholar': 1 as const }, ticketsUsed: 3 };
    expect(isNewcomer(vet)).toBe(false);
    expect(decideTutorOffer({ meta: vet, webdriver: false, param: null })).toBe('ribbon');
    expect(decideTutorOffer({ meta: { ...m, bests: { 'scholar|lake|1|0': { wave: 4, heat: 0, at: DAY } } }, webdriver: false, param: null })).toBe('ribbon');
  });
});
