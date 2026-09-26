// 信 · the mailbox: the 初见礼 (玉兔 and 300 文, every player once), claims in one change, backups,
// 清空一切, the owner's code, the old 八月十五 rabbit, the 桃源 letters' due days, and 名号.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  play, emptyPlay, celebrations, unlocked, isUnlockedIn, selectCharacter, redeemCode, revokeCode, _acceptCodeForTests,
  sanitizePlay, questValue, CODE_FLAG,
} from '../src/app/play';
import { state, emptyState, exportJSON, importJSON, resetAll, replaceState, setSettings, today, backupExtras } from '../src/app/store';
import {
  mail, inBox, claimed, claimLetter, deliver, deliverDue, ensureFirstGift, markRead, unread, arrivals, hasGift, openMail, mailUi, closeMail,
  sanitizeMail, _mailForTests, FIRST_GIFT,
} from '../src/app/mail';
import { LETTER, LETTERS } from '../src/data/letters';
import { CHARACTERS, CHARACTER } from '../src/data/characters';
import { QUEST } from '../src/data/quests';
import { cleanName, NAME_MAX } from '../src/core/names';
import { fillName, displayName } from '../src/app/name';
import { askName, nameAsk, provideNameScope, registerNameHost } from '../src/app/nameAsk';
import { HAO } from '../src/views/mail/hao';
import { dismissToast, toast } from '../src/ui/kit';
import { splitLetter, pickPs, claimSets, letterDate } from '../src/views/mail/letter';

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const DAY = '2026-09-26';

beforeEach(() => {
  today.value = DAY;
  state.value = { ...emptyState(), onboarded: true };
  play.value = emptyPlay();
  celebrations.value = [];
  _mailForTests.reset();
  closeMail();
});

describe('the 初见礼', () => {
  it('arrives once, unread, and never writes play', () => {
    expect(inBox(FIRST_GIFT)).toBe(false);
    expect(ensureFirstGift()).toBe(true);
    expect(ensureFirstGift()).toBe(false);
    expect(deliver(FIRST_GIFT)).toBe(false);
    expect(deliverDue()).toEqual([]);
    expect(mail.value.box.filter((e) => e.id === FIRST_GIFT)).toHaveLength(1);
    expect(mail.value.box[0]).toEqual({ id: FIRST_GIFT, at: DAY });
    expect(unread.value).toBe(1);
    expect(arrivals.value).toEqual([FIRST_GIFT]);
    expect(play.value.flags).toEqual({});
    expect(play.value.coins).toBe(0);
  });

  it('carries 玉兔 and 300 文, asks the name, and says so in the catalog', () => {
    const l = LETTER[FIRST_GIFT];
    expect(l.attach).toMatchObject({ coins: 300, character: 'rabbit' });
    expect(l.askName).toBe(true);
    expect(CHARACTER.rabbit.unlock).toBe('gift');
    expect(CHARACTER.rabbit.letter).toBe(FIRST_GIFT);
    expect(hasGift(l)).toBe(true);
    expect(hasGift(LETTER['ty-shide'])).toBe(false);
  });

  it('is claimed once: 300 coins counted as income from letters, 玉兔 earned and announced', () => {
    ensureFirstGift();
    const earned0 = play.value.counters.earned ?? 0;
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(claimLetter(FIRST_GIFT)).toBe('already');
    const p = play.value;
    expect(p.coins).toBe(300);
    expect((p.counters.earned ?? 0) - earned0).toBe(300);
    expect(p.counters['src:mail']).toBe(300);
    expect(p.daily.counts['src:mail']).toBe(300);
    expect(p.daily.counts.earned).toBe(300);
    expect(p.flags['mail:chujian']).toBe(true);
    expect(p.flags['char:rabbit']).toBe(true);
    expect(claimed(FIRST_GIFT)).toBe(true);
    expect(unlocked.value).toContain('rabbit');
    expect(selectCharacter('rabbit')).toBe(true);
    expect(celebrations.value).toEqual(['gift:chujian']);
    // opened by the claim
    expect(unread.value).toBe(0);
    // a double tap, a second claim through play itself: nothing more
    claimLetter(FIRST_GIFT);
    expect(play.value.coins).toBe(300);
    expect(play.value.counters['src:mail']).toBe(300);
  });

  it('a letter not in the box, or one that carries nothing, cannot be claimed', () => {
    expect(claimLetter(FIRST_GIFT)).toBe('none');
    expect(claimLetter('no-such-letter')).toBe('none');
    deliver('ty-shide');
    expect(unread.value).toBe(1);
    expect(claimLetter('ty-shide')).toBe('none');
    expect(unread.value).toBe(0);
    expect(play.value.flags).toEqual({});
  });

  it('the twelfth companion by letter brings 嫦娥 in the same step, announced right behind her', () => {
    const p = emptyPlay();
    for (const c of CHARACTERS) if (c.unlock !== 'default' && c.unlock !== 'gift' && c.id !== 'change') p.done[c.unlock] = '2026-09-20';
    play.value = p;
    expect(questValue(QUEST['q-all'], play.value, state.value)).toBe(11);
    ensureFirstGift();
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(play.value.done['q-all']).toBe(DAY);
    expect(unlocked.value).toContain('change');
    expect(celebrations.value).toEqual(['gift:chujian', 'q-all']);
  });

  it('with the owner’s code on, the claim still earns 玉兔, and she stays when the code goes', () => {
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    // the code never touches letters, gifts or the story
    expect(Object.keys(play.value.flags).filter((k) => /^(mail|char|item|ty|case|met):|^visit:taoyuan$/.test(k))).toEqual([]);
    expect(isUnlockedIn(play.value, 'rabbit')).toBe(true);
    expect(questValue(QUEST['q-all'], play.value, state.value)).toBe(1);
    ensureFirstGift();
    const c0 = play.value.coins;
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(play.value.coins - c0).toBe(300);
    expect(play.value.counters['src:mail']).toBe(300);
    expect(play.value.flags['char:rabbit']).toBe(true);
    // the gift counts as earned for 群贤毕至; the code does not
    expect(questValue(QUEST['q-all'], play.value, state.value)).toBe(2);
    selectCharacter('rabbit');
    revokeCode();
    expect(play.value.flags[CODE_FLAG]).toBeUndefined();
    expect(unlocked.value).toEqual(['scholar', 'rabbit']);
    expect(play.value.character).toBe('rabbit');
  });
});

describe('backups, erasing, the demo', () => {
  it('registers once in backups and rides along', () => {
    expect(backupExtras.filter((b) => b.key === 'mail')).toHaveLength(1);
    ensureFirstGift();
    markRead(FIRST_GIFT);
    const json = JSON.parse(exportJSON());
    expect(json.mail.box).toEqual([{ id: FIRST_GIFT, at: DAY, read: DAY }]);
  });

  it('a wave-6 backup brings back the box and the claim: nothing is sent or paid again', async () => {
    ensureFirstGift();
    claimLetter(FIRST_GIFT);
    const json = exportJSON();
    resetAll();
    await settle();
    expect(importJSON(json)).toBe(true);
    await settle();
    expect(mail.value.box.filter((e) => e.id === FIRST_GIFT)).toHaveLength(1);
    expect(claimed(FIRST_GIFT)).toBe(true);
    expect(claimLetter(FIRST_GIFT)).toBe('already');
    expect(play.value.coins).toBe(300);
  });

  it('an older backup without the box: the letter comes again, already taken if its play says so', async () => {
    ensureFirstGift();
    claimLetter(FIRST_GIFT);
    const old = JSON.parse(exportJSON()) as Record<string, unknown>;
    delete old.mail;
    _mailForTests.reset();
    expect(importJSON(JSON.stringify(old))).toBe(true);
    await settle();
    const e = mail.value.box.find((x) => x.id === FIRST_GIFT);
    expect(e?.read).toBe(DAY);
    expect(claimLetter(FIRST_GIFT)).toBe('already');
    expect(play.value.coins).toBe(300);
    expect(play.value.counters['src:mail']).toBe(300);
  });

  it('an older backup without the box and without the claim: claimable once, against that purse', async () => {
    play.value = { ...emptyPlay(), coins: 55 };
    const old = JSON.parse(exportJSON()) as Record<string, unknown>;
    delete old.mail;
    ensureFirstGift();
    claimLetter(FIRST_GIFT);
    expect(play.value.coins).toBe(355);
    expect(importJSON(JSON.stringify(old))).toBe(true);
    await settle();
    expect(play.value.coins).toBe(55);
    expect(inBox(FIRST_GIFT)).toBe(true);
    expect(mail.value.box.find((x) => x.id === FIRST_GIFT)?.read).toBeUndefined();
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(claimLetter(FIRST_GIFT)).toBe('already');
    expect(play.value.coins).toBe(355);
  });

  it('清空一切 sends the letter again to an empty purse; play stays empty until it is claimed', async () => {
    ensureFirstGift();
    claimLetter(FIRST_GIFT);
    resetAll();
    expect(play.value.flags).toEqual({});
    await settle();
    expect(inBox(FIRST_GIFT)).toBe(true);
    expect(unread.value).toBe(1);
    expect(play.value.flags).toEqual({});
    expect(play.value.coins).toBe(0);
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(play.value.coins).toBe(300);
    expect(play.value.flags['char:rabbit']).toBe(true);
  });

  it('loading the demo garden leaves the mailbox alone', async () => {
    const { demoState } = await import('../src/app/demo');
    ensureFirstGift();
    const before = JSON.stringify(mail.value);
    replaceState(demoState(DAY, 'zh'));
    await settle();
    expect(JSON.stringify(mail.value)).toBe(before);
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
  });

  it('sanitises the box: catalog letters only, once each, valid dates', () => {
    const m = sanitizeMail({ box: [
      { id: 'chujian', at: DAY }, { id: 'chujian', at: '2026-09-01' }, { id: 'forged', at: DAY }, { id: 'ty-shide', at: 'soon' }, null, 7,
      { id: 'ty-sang', at: DAY, read: 'x' },
    ] });
    expect(m.box).toEqual([{ id: 'chujian', at: DAY }, { id: 'ty-sang', at: DAY }]);
    expect(sanitizeMail('nonsense').box).toEqual([]);
  });
});

describe('玉兔 from the old 八月十五', () => {
  it('whoever earned her keeps her; 八月十五 now brings the seal 团圆', () => {
    const p = sanitizePlay({ character: 'rabbit', done: { 'q-mooncake': '2025-10-06' } });
    expect(p.flags['char:rabbit']).toBe(true);
    expect(p.character).toBe('rabbit');
    expect(isUnlockedIn(p, 'rabbit')).toBe(true);
    expect(QUEST['q-mooncake'].reward).toEqual({ seal: '团圆', sealEn: 'Reunion' });
    // without it, a saved rabbit falls back to the scholar
    expect(sanitizePlay({ character: 'rabbit' }).flags['char:rabbit']).toBeUndefined();
  });

  it('her letter still pays, with the postscript about carrots, and she is not announced again', () => {
    play.value = sanitizePlay({ done: { 'q-mooncake': '2025-10-06' } });
    ensureFirstGift();
    const l = LETTER[FIRST_GIFT];
    expect(pickPs(l, play.value.flags)?.zh).toContain('萝卜');
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(play.value.coins).toBe(300);
    expect(celebrations.value).toEqual([]);
    // read again later, the postscript is still there
    expect(pickPs(l, play.value.flags)?.zh).toContain('萝卜');
  });

  it('only a save from before this build migrates: mooncakes eaten now still leave her to the letter', () => {
    // a new player eats the eight mooncakes before opening the 初见礼, then reloads (or another tab syncs)
    ensureFirstGift();
    const now = sanitizePlay(JSON.parse(JSON.stringify({ ...emptyPlay(), done: { 'q-mooncake': DAY } })));
    expect(now.v).toBe(2);
    expect(now.flags['char:rabbit']).toBeUndefined();
    expect(sanitizePlay({ v: 2, done: { 'q-mooncake': DAY }, flags: {} }).flags['char:rabbit']).toBeUndefined();
    play.value = now;
    expect(isUnlockedIn(play.value, 'rabbit')).toBe(false);
    expect(pickPs(LETTER[FIRST_GIFT], play.value.flags)).toBeUndefined();
    expect(claimLetter(FIRST_GIFT)).toBe('ok');
    expect(celebrations.value).toEqual([`gift:${FIRST_GIFT}`]);
    expect(play.value.flags[`mail:${FIRST_GIFT}:had`]).toBeUndefined();
    // and an old save, with no version or v1, still keeps the rabbit it earned
    expect(sanitizePlay({ v: 1, done: { 'q-mooncake': '2025-10-06' } }).flags['char:rabbit']).toBe(true);
    expect(emptyPlay().v).toBe(2);
  });

  it('someone who gets her from the letter never sees that postscript', () => {
    ensureFirstGift();
    const l = LETTER[FIRST_GIFT];
    expect(pickPs(l, play.value.flags)).toBeUndefined();
    claimLetter(FIRST_GIFT);
    expect(pickPs(l, play.value.flags)).toBeUndefined();
    expect(claimSets(l).has('char:rabbit')).toBe(true);
  });
});

describe('the 桃源 letters fall due', () => {
  it('拾得 writes once the first gift is taken and the temple visited', () => {
    ensureFirstGift();
    play.value = { ...play.value, flags: { 'visit:mountain': true } };
    expect(deliverDue()).toEqual([]);
    claimLetter(FIRST_GIFT);
    expect(deliverDue()).toEqual(['ty-shide']);
    expect(deliverDue()).toEqual([]);
  });

  it('小满 and 三娘 write the day after; 阮郎 three days after the case', () => {
    play.value = { ...emptyPlay(), done: { 'ty:b8': DAY, 'case:hz': DAY } };
    ensureFirstGift();
    expect(deliverDue()).toEqual([]);
    today.value = '2026-09-27';
    expect(deliverDue().sort()).toEqual(['ty-sang', 'ty-xiaoman']);
    today.value = '2026-09-28';
    expect(deliverDue()).toEqual([]);
    today.value = '2026-09-29';
    expect(deliverDue()).toEqual(['ty-ruan']);
    // never twice
    today.value = '2026-10-09';
    expect(deliverDue()).toEqual([]);
  });

  it('a claim sets its item and its flags; 阮郎’s 20 文 are counted as letters', () => {
    play.value = { ...emptyPlay(), done: { 'ty:b8': '2026-09-20', 'case:hz': '2026-09-20' } };
    ensureFirstGift();
    deliverDue();
    expect(claimLetter('ty-xiaoman')).toBe('ok');
    expect(play.value.flags['item:keep:petal']).toBe(true);
    expect(play.value.flags['ty:way']).toBe(true);
    expect(claimLetter('ty-ruan')).toBe('ok');
    expect(play.value.counters['src:mail']).toBe(20);
    expect(play.value.coins).toBe(20);
  });

  it('every letter id and every flag a claim sets fits the 64-character keys', () => {
    for (const l of LETTERS) {
      for (const k of [`mail:${l.id}`, `mail:${l.id}:had`, ...claimSets(l)]) expect(k.length, k).toBeLessThanOrEqual(64);
    }
  });
});

describe('the sheet signals', () => {
  it('opening a letter marks it read; the box is the default', () => {
    ensureFirstGift();
    openMail(FIRST_GIFT);
    expect(mailUi.value).toBe(FIRST_GIFT);
    expect(unread.value).toBe(0);
    expect(arrivals.value).toEqual([]);
    openMail();
    expect(mailUi.value).toBe('list');
    closeMail();
    expect(mailUi.value).toBeNull();
  });
});

describe('名号', () => {
  it('cleanName: bidi, zero-width, controls, braces and markup go; twelve code points at most', () => {
    expect(cleanName('‮evil‬')).toBe('evil');
    expect(cleanName('⁦王⁩​二﻿')).toBe('王二');
    expect(cleanName('a\u0000b\u001Fc\u007F\u0085d')).toBe('abcd');
    expect(cleanName('{名}')).toBe('名');
    expect(cleanName('<b>李</b>')).toBe('b李/b');
    expect(cleanName('  听  雨 \u3000客 ')).toBe('听 雨 客');
    expect(cleanName('听\t雨')).toBe('听雨');
    expect(cleanName('一二三四五六七八九十甲乙丙')).toBe('一二三四五六七八九十甲乙');
    expect(Array.from(cleanName('一二三四五六七八九十甲乙丙')).length).toBe(NAME_MAX);
    // surrogate pairs count once and are never split
    const e13 = '😀'.repeat(13);
    const c = cleanName(e13);
    expect(Array.from(c)).toHaveLength(12);
    expect(c).toBe('😀'.repeat(12));
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cleanName('ab' + '𠀀'.repeat(11)))).toBe(false);
    // NFC
    expect(cleanName('José')).toBe('José');
    expect(cleanName('')).toBe('');
    expect(cleanName('​ ‍')).toBe('');
  });

  it('the settings keep a clean name', () => {
    replaceState({ ...emptyState(), settings: { ...emptyState().settings, playerName: '‮{名}听雨客' } });
    expect(state.value.settings.playerName).toBe('名听雨客');
  });

  it('fillName: the default by scope, a capital only for a default opening an English sentence', () => {
    expect(fillName('{名}足下：', 'zh', 'world', '')).toBe('园主足下：');
    expect(fillName('{名}足下：', 'zh', 'valley', '')).toBe('客足下：');
    expect(fillName('{名}施主', 'zh', 'world', '听雨客')).toBe('听雨客施主');
    expect(fillName('{名}: Grandpa says', 'en', 'valley', '')).toBe('Guest: Grandpa says');
    expect(fillName('Dear {名}, as if', 'en', 'world', '')).toBe('Dear friend, as if');
    expect(fillName('Welcome. {名} is here', 'en', 'world', '')).toBe('Welcome. Friend is here');
    expect(fillName('{名}: hello', 'en', 'world', 'li bai')).toBe('li bai: hello');
    expect(fillName('  {名}, welcome', 'en', 'world', '')).toBe('  Friend, welcome');
    expect(fillName('“{名}!” she said', 'en', 'world', '')).toBe('“Friend!” she said');
    expect(fillName('no token', 'en')).toBe('no token');
    expect(displayName('en', 'valley', '')).toBe('guest');
    setSettings({ playerName: '松下客' });
    expect(fillName('{名}，{名}！', 'zh')).toBe('松下客，松下客！');
  });

  it('askName answers "" with no sheet, and the saved name through the sheet', async () => {
    expect(await askName()).toBe('');
    const off = registerNameHost();
    const p = askName('敢问？', 'Your name?');
    expect(nameAsk.value?.promptZh).toBe('敢问？');
    nameAsk.value!.resolve('阿满');
    expect(await p).toBe('阿满');
    expect(nameAsk.value).toBeNull();
    // a second request answers the first with no name
    const a = askName();
    const b = askName();
    expect(await a).toBe('');
    off();
    expect(await b).toBe('');
  });

  it('askName knows where it is asked: 客 in the valley, 园主 elsewhere, or as the caller says', async () => {
    const off = registerNameHost();
    void askName();
    expect(nameAsk.value?.scope).toBe('world');
    const undo = provideNameScope(() => 'valley');
    void askName('老丈问道', 'The elder asks');
    expect(nameAsk.value?.scope).toBe('valley');
    void askName(undefined, undefined, 'world');
    expect(nameAsk.value?.scope).toBe('world');
    // a world that is gone (where() throws) falls back to the garden's default
    const undo2 = provideNameScope(() => { throw new Error('disposed'); });
    void askName();
    expect(nameAsk.value?.scope).toBe('world');
    undo2();
    undo();
    nameAsk.value?.resolve('');
    off();
  });

  it('every 拟号 fits a name whole, in both languages', () => {
    expect(HAO.length).toBeGreaterThanOrEqual(6);
    for (const [zh, en] of HAO) {
      expect(cleanName(zh), zh).toBe(zh);
      expect(cleanName(en), en).toBe(en);
      expect(Array.from(en).length, en).toBeLessThanOrEqual(NAME_MAX);
    }
  });

  it('a toast can be taken down early, but only the one asked for', () => {
    const a = toast('驿使送来一封信', { ms: 7000 });
    const b = toast('另一句');
    expect(dismissToast(a)).toBe(false);
    expect(dismissToast(b)).toBe(true);
    expect(dismissToast(b)).toBe(false);
    expect(dismissToast()).toBe(false);
  });
});

describe('reading a letter', () => {
  it('lays out a salutation, the body and a signature, before the name is filled', () => {
    const zh = splitLetter(LETTER[FIRST_GIFT].body.zh, 'zh');
    expect(zh.salute).toBe('{名}足下：');
    expect(zh.sign).toBe('广寒 嫦娥');
    expect(zh.body.startsWith('见字如面')).toBe(true);
    const en = splitLetter(LETTER[FIRST_GIFT].body.en, 'en');
    expect(en.sign).toBe("Chang'e, of the Moon Palace");
    // the unsigned letter's dash runs on into a sentence: no signature
    expect(splitLetter(LETTER['ty-wuming'].body.zh, 'zh').sign).toBe('');
    expect(splitLetter(LETTER['ty-wuming'].body.en, 'en').sign).toBe('');
    expect(splitLetter(LETTER['ty-ruan'].body.zh, 'zh').sign).toBe('阮青、桃叶同拜');
    expect(letterDate(DAY, 'en')).toBe('26 Sep');
    expect(letterDate(DAY, 'zh').length).toBeGreaterThan(2);
  });
});
