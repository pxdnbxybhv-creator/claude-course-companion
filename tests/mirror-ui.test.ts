// 水月幻镜 · the UI's pure helpers (src/views/mirror/ui/text.ts): words for every stat and term, the
// results scroll's pay lines, the stick / keys / 技 drag maths, the codex's 187 pages and their
// pictures, and the day arithmetic behind 「镜中人已候 N 日」.
import { describe, expect, it } from 'vitest';
import {
  CODEX_TABS, CODEX_TOTAL, codexKeys, daysBetween, fmtClock, fmtStat, fmtStatValue, keysVector, lockHint, nameOf, pageAtlas, pageId,
  payLines, payTable, rateMark, rateWord, skillDrag, STAT_NAMES, stickVector, STICK_R, TERM_TEXT, tFor, CLASS_NAMES, bossName,
  screenKeyGate, voidNote, waitedSince, type KeyLike,
} from '../src/views/mirror/ui/text';
import { STAT_IDS, WCLASSES, PAY } from '../src/views/mirror/data';
import { TERM_MOD_REG, BOSS_REG, ENDLESS_BOSS_REG, WEAPON_REG, ITEM_REG, STARTER_WEAPONS, STARTER_ITEMS } from '../src/views/mirror/ids';
import { endlessBossesOf, gross } from '../src/views/mirror/logic';
import { specOf } from '../src/views/mirror/paint';
import type { PayBreakdown } from '../src/views/mirror/types';

const zh = tFor('zh');
const en = tFor('en');

describe('mirror ui · words', () => {
  it('names every stat and class in both languages', () => {
    for (const id of STAT_IDS) {
      expect(STAT_NAMES[id][0]).toMatch(/[一-鿿]/);
      expect(STAT_NAMES[id][1]).toMatch(/[A-Za-z]/);
    }
    for (const c of WCLASSES) expect(CLASS_NAMES[c][0].length).toBeGreaterThan(0);
  });
  it('writes a stat change with its sign and unit', () => {
    expect(fmtStat('aspd', 10, zh)).toBe('+10% 攻速');
    expect(fmtStat('armor', -2, en)).toBe('−2 Armour');
    expect(fmtStat('range', 30, zh)).toBe('+30 射程'); // no `u`: distances are bare numbers
    expect(fmtStat('critDmg', 30, zh)).toBe('+0.3 暴击倍数'); // stored 30, read as +0.3 of a crit multiplier
    expect(fmtStatValue('dodge', 12.34)).toBe('12.34%');
    expect(fmtStatValue('critDmg', 50)).toBe('+0.5');
    expect(fmtStatValue('range', 30)).toBe('30');
  });
  it('describes every 节气 modifier in both languages', () => {
    for (const t of TERM_MOD_REG) {
      expect(TERM_TEXT[t.id]?.[0], t.id).toMatch(/[一-鿿]/);
      expect(TERM_TEXT[t.id]?.[1], t.id).toMatch(/[a-z]/);
    }
  });
  it('names the rate of the next run plainly', () => {
    expect(rateWord(0.5, true, zh)).toContain('免费');
    expect(rateWord(1, false, zh)).toBe('全额');
    expect(rateWord(0.5, false, en)).toBe('half pay');
    expect(rateWord(0.25, false, zh)).toBe('四分之一');
    expect(rateMark(0.25)).toBe('×¼');
  });
  it('finds names and verses for every boss, the endless two included', () => {
    for (const b of [...BOSS_REG, ...ENDLESS_BOSS_REG]) {
      const n = bossName(b.id, zh);
      expect(n.name).toBe(b.zh);
      expect(n.verse.length).toBeGreaterThan(0);
    }
    expect(nameOf('qingfeng', zh)).toBe('青锋剑');
    expect(nameOf('nope', en)).toBe('nope');
  });
});

describe('mirror ui · the pay lines of the scroll', () => {
  const base: PayBreakdown = {
    W: 20, base: 35, diffX: 1, mapX: 1, heatX: 1, gross: 35, capped: false, rate: 1, rated: 35, room: 300, income: 35, back: 0,
    coins: 3, firsts: 10, firstsHeld: 0, fee: 20, net: 28,
  };
  it('shows the chain from base to net and nothing it does not need', () => {
    const lines = payLines(base, false, zh);
    const labels = lines.map((l) => l.label).join('|');
    expect(labels).toContain('已过 20 重');
    expect(labels).not.toContain('镜境');
    expect(labels).toContain('返照钱');
    expect(labels).toContain('首次奖励');
    expect(lines[lines.length - 1].value).toBe('+28');
    expect(lines.find((l) => l.label === '入镜钱')?.value).toBe('−20');
  });
  it('explains the ceiling, the fee-back floor and the free run', () => {
    const lines = payLines({ ...base, diffX: 1.6, heatX: 1.2, room: 10, income: 10, back: 10, rated: 35, free: undefined } as unknown as PayBreakdown, false, zh);
    const labels = lines.map((l) => l.label).join('|');
    expect(labels).toContain('× 镜境');
    expect(labels).toContain('× 镜誓');
    expect(labels).toContain('今天还能结算 10 / 300');
    expect(labels).toContain('退回本钱');
    const free = payLines({ ...base, fee: 0, rate: 0.5, rated: 18, income: 18, net: 21 }, true, en);
    expect(free.some((l) => l.label.includes('free run'))).toBe(true);
    expect(free[free.length - 1].value).toBe('+21');
  });
  it('the ⓘ table says the first boss wins the fee back', () => {
    const rows = payTable((W) => gross(W, 1, 'lake', 0, endlessBossesOf(W)));
    expect(rows.find((r) => r.W === 10)?.pay).toBe(PAY.FEE);
    expect(rows.find((r) => r.W === 9)!.pay).toBeLessThan(PAY.FEE);
    expect(rows.every((r) => r.pay <= PAY.RUN_CAP)).toBe(true);
  });
});

describe('mirror ui · input maths', () => {
  it('the stick has an 8 px dead zone, full speed from 20 px, and its knob draws out to the 56 px radius', () => {
    expect(stickVector(5, 5)).toMatchObject({ x: 0, y: 0 });
    const full = stickVector(200, 0);
    expect(full.x).toBeCloseTo(1);
    expect(full.knobX).toBeCloseTo(STICK_R);
    const half = stickVector(0, 14);
    expect(half.y).toBeGreaterThan(0.4);
    expect(half.y).toBeLessThan(0.6);
    expect(stickVector(0, 20).y).toBeCloseTo(1);
    expect(stickVector(0, 20).knobY).toBeCloseTo(20); // the knob follows the thumb to the rim
    expect(Math.hypot(stickVector(40, 40).x, stickVector(40, 40).y)).toBeLessThanOrEqual(1);
    expect(stickVector(NaN, 1)).toMatchObject({ x: 0, y: 0 });
  });
  it('WASD and arrows make a unit vector; opposite keys cancel', () => {
    expect(keysVector(new Set(['w']))).toEqual({ x: 0, y: -1 });
    const d = keysVector(new Set(['arrowright', 's']));
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(keysVector(new Set(['a', 'd']))).toEqual({ x: 0, y: 0 });
  });
  it('a short drag on 技 is a tap; a long one aims', () => {
    expect(skillDrag(4, 6).aim).toBe(false);
    const a = skillDrag(0, -60);
    expect(a.aim).toBe(true);
    expect(a.y).toBeCloseTo(-1);
  });
});

describe('mirror ui · codex', () => {
  it('holds 187 pages in seven tabs, plus the 候签 album', () => {
    expect(CODEX_TOTAL).toBe(187); // 185 + the two 镜宝 (忘尘镜, 龙渊剑)
    expect(CODEX_TABS.map((x) => x.id)).toContain('slip');
    const all = CODEX_TABS.flatMap((x) => codexKeys(x.id));
    expect(new Set(all).size).toBe(all.length);
    expect(codexKeys('mon').length).toBe(36 + 6 + 2);
  });
  it('every pictured page has an atlas id the painter knows', () => {
    for (const tab of CODEX_TABS) {
      for (const k of codexKeys(tab.id)) {
        const a = pageAtlas(k);
        if (tab.id === 'map' || tab.id === 'arch') { expect(a).toBeNull(); continue; }
        expect(a, k).not.toBeNull();
        expect(specOf(a!), `${k} → ${a}`).not.toBeNull();
        expect(pageId(k).length).toBeGreaterThan(0);
      }
    }
  });
  it('locked gear has a deed hint; starters have none', () => {
    for (const w of WEAPON_REG) expect(lockHint(w.id, zh) === null).toBe(STARTER_WEAPONS.includes(w.id));
    for (const i of ITEM_REG) expect(lockHint(i.id, en) === null).toBe(STARTER_ITEMS.includes(i.id));
    expect(lockHint('longquan', zh)?.goal).toBe(500);
  });
});

describe('mirror ui · time', () => {
  it('counts whole days between keys, across months and years', () => {
    expect(daysBetween('2026-09-20', '2026-09-27')).toBe(7);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('bad', '2026-01-01')).toBe(0);
  });
  it('the wave timer reads seconds, then m:ss', () => {
    expect(fmtClock(9.2)).toBe('10');
    expect(fmtClock(0)).toBe('0');
    expect(fmtClock(75)).toBe('1:15');
  });
});

describe('mirror ui · 心镜 words', () => {
  it('describes every face in both languages', async () => {
    const { HEART_REG } = await import('../src/views/mirror/ids');
    const { HEART_TEXT } = await import('../src/views/mirror/ui/text');
    for (const f of HEART_REG) {
      expect(HEART_TEXT[f.id]?.[0], f.id).toMatch(/[一-鿿]/);
      expect(HEART_TEXT[f.id]?.[1], f.id).toMatch(/[a-z]/);
    }
  });
});

describe('mirror ui · between-wave keys', () => {
  /** A stand-in element: closest() matches selectors that start with its tag (or attribute). */
  const el = (tag: string) => ({ closest: (sel: string) => (sel.split(',').some((x) => x.trim().startsWith(tag)) ? {} : null) });
  const key = (k: string, o: Partial<KeyLike> = {}): KeyLike => ({ key: k, target: el('div'), ...o });
  it('offers plain keys to the screen, never while a sheet is up or with a modifier', () => {
    expect(screenKeyGate(key('1'), false)).toBe('offer');
    expect(screenKeyGate(key('Enter'), false)).toBe('offer');
    expect(screenKeyGate(key('1'), true)).toBe('skip');
    expect(screenKeyGate(key('r', { ctrlKey: true }), false)).toBe('skip');
    expect(screenKeyGate(key('r', { target: el('input') }), false)).toBe('skip');
  });
  it('a held key never repeats: R and digits are ignored, Enter / Space are eaten', () => {
    expect(screenKeyGate(key('r', { repeat: true }), false)).toBe('skip');
    expect(screenKeyGate(key('2', { repeat: true }), false)).toBe('skip');
    expect(screenKeyGate(key('Enter', { repeat: true, target: el('button') }), false)).toBe('swallow');
    expect(screenKeyGate(key(' ', { repeat: true }), false)).toBe('swallow');
  });
  it('Enter / Space on a focused button are left to that button, so one press opens one crate', () => {
    expect(screenKeyGate(key('Enter', { target: el('button') }), false)).toBe('skip');
    expect(screenKeyGate(key(' ', { target: el('button') }), false)).toBe('skip');
    // a hotkey still works while a button holds focus
    expect(screenKeyGate(key('2', { target: el('button') }), false)).toBe('offer');
    expect(screenKeyGate({ key: 'Enter', target: null }, false)).toBe('offer');
  });
});

describe('mirror ui · what a void run gave back', () => {
  it('names the refund only when the purse grew', () => {
    expect(voidNote({ free: false, refunded: 20, freeBack: false }, zh)).toContain('20 文已退回');
    expect(voidNote({ free: false, refunded: 0, freeBack: false }, zh)).toContain('不再退');
    expect(voidNote({ free: false, refunded: 0, freeBack: false }, zh)).not.toContain('已退回');
  });
  it('a free run speaks of the free run, not of money', () => {
    expect(voidNote({ free: true, refunded: 0, freeBack: true }, zh)).toContain('今天的免费局还在');
    expect(voidNote({ free: true, refunded: 0, freeBack: false }, en)).not.toMatch(/fee|coins are back/);
    for (const o of [{ free: true, refunded: 0, freeBack: true }, { free: true, refunded: 0, freeBack: false }]) {
      expect(voidNote(o, zh)).not.toContain('本钱');
    }
  });
});

describe('mirror ui · 「镜中人已候 N 日」', () => {
  it('counts from the later of this run\'s last play and its start day', () => {
    expect(waitedSince('2026-09-01', '2026-09-27')).toBe('2026-09-27');
    expect(waitedSince('2026-09-20', '2026-09-01')).toBe('2026-09-20');
    expect(waitedSince(null, '2026-09-01')).toBe('2026-09-01');
    expect(waitedSince('junk', '2026-09-01')).toBe('2026-09-01');
    expect(daysBetween(waitedSince('2026-09-01', '2026-09-27'), '2026-09-27')).toBe(0);
  });
});
