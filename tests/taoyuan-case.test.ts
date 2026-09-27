// 落花为证 · 花朝失印案: the case's fair play (every question can be reasoned by anyone, with no
// companion; every answer is the only one the evidence leaves; every red herring is cleared by
// something anyone can find), the confrontations, the judgement's prompt, the free-mistakes rule and
// the grades, the bluebird's ladder, the prints' dating, flags that fit — and the owner's code opening
// nothing here.
import { beforeEach, describe, expect, it } from 'vitest';
import { play, emptyPlay, redeemCode, _acceptCodeForTests, flag } from '../src/app/play';
import { state, emptyState, today } from '../src/app/store';
import * as K from '../src/views/walk/features/taoyuan/case';
import { askBird } from '../src/views/walk/case/state';
import { ANCHORS } from '../src/views/walk/features/taoyuan/places';
import { STORY_FLAGS } from '../src/views/walk/features/taoyuan/text';

type Flags = Record<string, true>;
const F = (...keys: string[]): Flags => Object.fromEntries(keys.map((k) => [k, true as const]));
const clues = (...ks: K.ClueKey[]) => ks.map(K.clueFlag);

beforeEach(() => {
  today.value = '2026-09-26';
  state.value = { ...emptyState(), onboarded: true };
  play.value = emptyPlay();
});

// ── what anyone can reach, with no companion: every clue by a plain route; a lie broken by evidence
//    anyone can find; 小满 found by talking to him; your own memories.

/** Flags anyone can come to set, with no companion's help (closed under breaking lies). */
function reachableByAnyone(): Set<string> {
  const got = new Set<string>();
  for (const c of K.CLUES) if (c.routes.some((r) => r.by !== 'companion')) got.add(K.clueFlag(c.key));
  // talking: every witness can be heard; 小满 is found by talking to him in the hollow
  for (const w of K.WITNESS_KEYS) got.add(K.heardFlag(w));
  got.add(K.CASE_FLAGS.found);
  // lies broken with evidence in hand, until nothing more breaks
  for (let round = 0; round < 8; round++) {
    for (const w of K.WITNESSES) {
      w.breaks.forEach((b, i) => {
        if (i > 0 && !got.has(w.breaks[i - 1].flag)) return;
        const ok = b.by.some((ev) => evidenceIn(ev, got) && (!b.needs?.[ev] || got.has(b.needs[ev]!)));
        if (ok) got.add(b.flag);
      });
    }
  }
  return got;
}
function evidenceIn(ev: K.EvidenceKey | 'memory', got: Set<string>): boolean {
  if (ev === 'memory') return true;
  if (ev.startsWith('T:')) return got.has(K.heardFlag(ev.slice(2) as K.WitnessKey));
  return got.has(K.clueFlag(ev as K.ClueKey));
}

describe('fair play (bible §10)', () => {
  const any = reachableByAnyone();

  it('every clue has a way in for anyone (companions only ever make it faster)', () => {
    for (const c of K.CLUES) {
      expect(c.routes.some((r) => r.by !== 'companion'), c.key).toBe(true);
      // (a clue in the world has a place; the memory and the collar are the only ones without)
      if (c.key !== 'menxiang' && c.key !== 'bitao') expect(c.at, c.key).not.toBeNull();
      if (c.at) expect(ANCHORS[c.at], c.key).toBeTruthy();
    }
    expect(K.CLUES).toHaveLength(12);
    expect(new Set(K.CLUES.map((c) => c.key)).size).toBe(12);
    expect(K.CLUES.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every lie can be broken with evidence anyone can find (the shortcuts are extra)', () => {
    for (const w of K.WITNESSES) for (const b of w.breaks) expect(any.has(b.flag), b.flag).toBe(true);
    // 杜二's is broken by the cup ring, or by 诗仙 / 关公 — never only by them
    const duer = K.WITNESS.duer.breaks[0];
    expect(duer.by).toContain('beiyin');
    expect(duer.companions).toEqual(expect.arrayContaining(['poet', 'guan']));
  });

  it('every question\'s needs are findable by anyone without a companion', () => {
    for (const q of K.QUESTIONS) {
      expect(q.needs.length, `Q${q.n}`).toBeGreaterThan(0);
      expect(q.needs.some((g) => g.every((k) => any.has(k))), `Q${q.n}`).toBe(true);
      const f = F(...q.needs[0]);
      expect(K.needsMet(q, f), `Q${q.n}`).toBe(true);
      expect(K.needsMet(q, {}), `Q${q.n}`).toBe(false);
    }
  });

  it('every answer is the only one left: each other option is ruled out by something anyone can find', () => {
    for (const q of K.QUESTIONS) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(new Set(q.options.map((o) => o.zh)).size, `Q${q.n}`).toBe(q.options.length);
      expect(new Set(q.options.map((o) => o.en)).size, `Q${q.n}`).toBe(q.options.length);
      expect(q.ruledOut[q.answer], `Q${q.n} rules out its own answer`).toBeUndefined();
      for (let k = 0; k < q.options.length; k++) {
        if (k === q.answer) continue;
        const why = q.ruledOut[k];
        expect(why && why.length, `Q${q.n} option ${k}`).toBeTruthy();
        for (const ev of why!) expect(evidenceIn(ev, any), `Q${q.n} option ${k}: ${ev}`).toBe(true);
        // and someone answers every wrong option
        expect(q.wrong[k] ?? q.wrong.any, `Q${q.n} option ${k}`).toBeTruthy();
      }
    }
    // the bible's answers
    expect(K.QUESTIONS.map((q) => q.options[q.answer].zh)).toEqual([
      '戌正前后', '桑三娘', '先把酒倒在亥正往后的香上，再摔坛子做样子', '不让阮郎今夜走，怕桃叶跟他走，或是等他一辈子', '覆花四分的补齿屐痕',
    ]);
  });

  it('each red herring is cleared by evidence anyone can find — and every other suspect of Q2 is one', () => {
    for (const h of K.HERRINGS) {
      expect(h.clearedBy.length, h.who).toBeGreaterThan(0);
      for (const ev of h.clearedBy) expect(evidenceIn(ev, any), `${h.who}: ${ev}`).toBe(true);
    }
    const q2 = K.QUESTIONS[1];
    const names = K.HERRINGS.map((h) => h.name.zh.replace('（你）', ''));
    for (let k = 0; k < q2.options.length; k++) if (k !== q2.answer) expect(names, q2.options[k].zh).toContain(q2.options[k].zh);
  });

  it('the four contradictions stand on evidence anyone can find', () => {
    expect(K.CONTRADICTIONS.map((x) => x.id)).toEqual(['X1', 'X2', 'X3', 'X4']);
    for (const x of K.CONTRADICTIONS) for (const ev of x.needs) expect(evidenceIn(ev, any), `${x.id}: ${ev}`).toBe(true);
  });

  it('the petals date the prints: one tenth an hour, counted back from 子正 (X3)', () => {
    const P = Object.fromEntries(K.PRINTS.map((p) => [p.key, p])) as Record<K.PrintKey, K.PrintSet>;
    expect(K.printHour(P.clogs.cover)).toBe(20); // 戌正: the first drums (T6), when 三娘 left the square (T2)
    expect(K.hourName(K.printHour(P.clogs.cover)).zh).toBe('戌正');
    expect(K.printHour(P.pair.cover)).toBe(21.5); // 亥初二刻: the lovers, after the lantern was hung (T3)
    expect(K.hourName(21.5).zh).toBe('亥初二刻');
    expect(K.printHour(P.cane.cover)).toBe(21); // 亥初: you and 柳婆 (C4)
    expect(K.printHour(P.crowd.cover)).toBe(19); // 戌初: the rite
    expect(K.printHour(P.boots.cover)).toBeLessThan(19); // 杜二: before the rite
    expect(K.printHour(P.procession.cover)).toBe(24);
    // only one patched pair; the clogs came by the side gate, along the west wall
    expect(K.PRINTS.filter((p) => p.kind === 'patched')).toHaveLength(1);
    expect(P.clogs.path[0][0]).toBeLessThan(-3.5);
  });

  it('the prints lie inside the courtyard, the same every time', () => {
    for (const p of K.PRINTS) {
      const s = K.printStamps(p);
      expect(s.length, p.key).toBeGreaterThan(4);
      for (const st of s) {
        expect(Math.abs(st.x), p.key).toBeLessThan(4.2);
        expect(st.z).toBeGreaterThan(-22.4);
        expect(st.z).toBeLessThan(-17.4);
      }
      expect(K.printStamps(p)).toEqual(s);
    }
  });
});

describe('confronting a witness (对质)', () => {
  it('lists the bible\'s pairs', () => {
    const pairs = K.CONFRONT_PAIRS.map(([w, ev, b]) => `${w}:${ev}:${b}`);
    expect(pairs).toEqual([
      'liupo:menxiang:liupo', 'duer:beiyin:duer', 'ruan:bitao:ruan', 'taoye:bitao:taoye', 'taoye:T:ruan:taoye',
      'sang:lengzao:sang', 'sang:T:taoye:sang', 'sang:buchi:sang2',
    ]);
  });

  it('breaks a lie only with the right card, and only once the card is in the book', () => {
    for (const [w, ev] of K.CONFRONT_PAIRS) {
      if (w === 'sang' && ev === 'buchi') continue;
      const have = ev.startsWith('T:') ? K.heardFlag(ev.slice(2) as K.WitnessKey) : K.clueFlag(ev as K.ClueKey);
      const need = w === 'taoye' && ev === 'T:ruan' ? [K.brokeFlag('ruan')] : [];
      expect(K.confront(w, ev, F(...need)), `${w} ${ev} not in hand`).toBeNull();
      expect(K.confront(w, ev, F(have, ...need)), `${w} ${ev}`).not.toBeNull();
    }
    // 「这与我何干？」 for anything else (no penalty: nothing is recorded)
    const all = F(...K.CLUE_KEYS.map(K.clueFlag), ...K.WITNESS_KEYS.map(K.heardFlag));
    expect(K.confront('liupo', 'beiyin', all)).toBeNull();
    expect(K.confront('ruan', 'menxiang', all)).toBeNull();
    expect(K.confront('xiaoman', 'tan', all)).toBeNull();
    for (const w of K.WITNESS_KEYS) expect(K.NOT_MINE[w].zh, w).toBeTruthy();
  });

  it('桃叶 gives way to 阮郎\'s testimony only once his lie is broken', () => {
    const f = F(K.heardFlag('ruan'));
    expect(K.confront('taoye', 'T:ruan', f)).toBeNull();
    expect(K.confront('taoye', 'T:ruan', { ...f, [K.brokeFlag('ruan')]: true })?.flag).toBe(K.brokeFlag('taoye'));
  });

  it('三娘 lies twice: the stove (or 桃叶\'s cakes) first, then the mended clog', () => {
    const base = F(...clues('lengzao', 'buchi'), K.heardFlag('taoye'));
    expect(K.stageOf('sang', base)).toBe(0);
    expect(K.statementNow('sang', base)[0].zh).toContain('蒸了一笼新糕');
    // the clog before the first break: nothing
    expect(K.confront('sang', 'buchi', base)).toBeNull();
    expect(K.confront('sang', 'T:taoye', base)?.flag).toBe(K.brokeFlag('sang'));
    const one = { ...base, [K.brokeFlag('sang')]: true as const };
    expect(K.stageOf('sang', one)).toBe(1);
    expect(K.statementNow('sang', one)[0].zh).toContain('换鞋');
    expect(K.confront('sang', 'lengzao', one)).toBeNull();
    expect(K.confront('sang', 'buchi', one)?.flag).toBe(K.brokeFlag('sang2'));
    const two = { ...one, [K.brokeFlag('sang2')]: true as const };
    expect(K.stageOf('sang', two)).toBe(2);
    expect(K.confront('sang', 'buchi', two)).toBeNull();
  });

  it('after a break, the truth; 小满 tells what he saw once found', () => {
    expect(K.statementNow('liupo', F(K.brokeFlag('liupo')))[0].zh).toContain('亥正是哪一针');
    expect(K.statementNow('duer', F(K.brokeFlag('duer')))[0].zh).toContain('三娘往西去了');
    expect(K.statementNow('xiaoman', {})[0].zh).toContain('没偷印');
    expect(K.statementNow('xiaoman', F(K.CASE_FLAGS.found))[0].zh).toContain('一只齿响');
    expect(K.T6.testimony.map((l) => l.zh).join('')).toContain('香烟还是直直地往上冒');
  });
});

describe('the judgement (bible §4.8)', () => {
  const NEEDED = [...clues('xiang', 'feng', 'menxiang', 'zuji', 'hualou', 'buchi'), K.CASE_FLAGS.found, K.brokeFlag('sang')];

  it('the elder calls everyone only with C1 C3 C4 C5 C6 C7, 小满 found and 三娘\'s first lie broken', () => {
    expect(K.ready({})).toEqual({ ok: false, missing: 8 });
    expect(K.ready(F(...NEEDED))).toEqual({ ok: true, missing: 0 });
    for (const k of NEEDED) {
      const f = F(...NEEDED.filter((x) => x !== k));
      expect(K.ready(f), k).toEqual({ ok: false, missing: 1 });
    }
    // the stove, the register, the silk room, the collar, the cup and the shards are not required
    expect(K.ready(F(...NEEDED, ...clues('lengzao', 'bu', 'can', 'bitao', 'beiyin', 'tan'))).missing).toBe(0);
    // and it can always be reached without a companion
    const any = reachableByAnyone();
    for (const k of NEEDED) expect(any.has(k), k).toBe(true);
  });

  it('three wrong answers bring the first hint line each; after that, the second', () => {
    const q1 = K.QUESTIONS[0];
    let tally: K.Tally = { miss: 0, q2miss: 0 };
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const a = K.answer(q1, 0, tally);
      expect(a.right).toBe(false);
      expect(a.lines[0].zh).toBe('慢着。花落了几分？你看的是哪双脚印？');
      tally = a.tally;
      seen.push(a.hint?.zh ?? null);
    }
    expect(tally.miss).toBe(5);
    expect(seen.slice(0, 3)).toEqual(Array(3).fill(K.HINT_STEP.when.tiers[0].zh)); // (the elder asks about the petals; the bluebird adds its first note)
    expect(seen.slice(3)).toEqual(Array(2).fill(K.HINT_STEP.when.tiers[1].zh));
    const r = K.answer(q1, 1, tally);
    expect(r.right).toBe(true);
    expect(r.tally).toEqual(tally);
  });

  it('a wrong answer elsewhere brings its own step\'s note (and 小满\'s retort to Q3)', () => {
    const q3 = K.QUESTIONS[2];
    const a = K.answer(q3, 3, { miss: 0, q2miss: 0 });
    expect(a.lines[0].by).toBe('xiaoman');
    expect(a.hint).toEqual(K.HINT_STEP.how.tiers[0]);
    const late = K.answer(q3, 0, { miss: 3, q2miss: 0 });
    expect(late.hint).toEqual(K.HINT_STEP.how.tiers[1]);
    // Q5 has no step of its own: its two notes
    expect(K.answer(K.QUESTIONS[4], 0, { miss: 0, q2miss: 0 }).hint).toEqual(K.QUESTIONS[4].hints![0]);
    // Esc is never an answer: nothing counts but a real choice
    expect(K.QUESTIONS.every((q) => q.options.length >= 4)).toBe(true);
  });

  it('Q2 wrong three times: 三娘 steps forward (自白)', () => {
    const q2 = K.QUESTIONS[1];
    let tally: K.Tally = { miss: 2, q2miss: 0 };
    const retorts: string[] = [];
    for (const k of [5, 1, 4]) {
      const a = K.answer(q2, k, tally);
      retorts.push(a.lines[0].zh);
      tally = a.tally;
      if (k === 4) expect(a.confessed).toBe(true); else expect(a.confessed).toBe(false);
    }
    expect(retorts).toEqual(['亥初柳婆也在门口……是我嘴快。', '不是她！她那会儿跟我在一块儿，真的！', '我家小满？他连腌菜坛子的泥封都揭不开，回回喊我！']);
    expect(K.grade(tally.miss, 0, tally.q2miss >= 3)).toBe('zibai');
    expect(K.JUDGE.confess.zh).toBe('不必问了，是我。');
  });

  it('grades by misses + hints: 神断 300, 明断 200, 平断 120, 自白 60', () => {
    expect(K.grade(0, 0)).toBe('shen');
    expect(K.grade(1, 0)).toBe('ming');
    expect(K.grade(0, 3)).toBe('ming');
    expect(K.grade(2, 1)).toBe('ming');
    expect(K.grade(2, 2)).toBe('ping');
    expect(K.grade(0, 9)).toBe('ping');
    expect(K.grade(0, 0, true)).toBe('zibai');
    expect(K.GRADE_COINS).toEqual({ shen: 300, ming: 200, ping: 120, zibai: 60 });
    expect(K.gradeOf(F(K.gradeFlag('ping')))).toBe('ping');
    expect(K.gradeOf({})).toBeNull();
    // B6 reads the same flag names
    expect(K.gradeFlag('shen')).toBe('case:hz:grade:shen');
  });

  it('the ink ghosts replay the truth in three shots', () => {
    expect(K.GHOSTS).toHaveLength(3);
    expect(K.GHOST_SHOTS).toHaveLength(3);
  });
});

describe('the bluebird\'s ladder (bible §4.9)', () => {
  it('goes step by step, tier by tier: 小满, when, how, who, why', () => {
    const f: Flags = {};
    const order: string[] = [];
    for (let i = 0; i < 20; i++) {
      const h = K.nextHint(f);
      if (!h.step) break;
      if (!h.fresh) {
        // all three read: repeats are free; finish the step
        const done: Record<K.StepKey, string[]> = {
          find: [K.CASE_FLAGS.found],
          when: clues('feng', 'menxiang', 'zuji', 'hualou'),
          how: [...clues('xiang', 'tan'), K.CASE_FLAGS.found],
          who: [...clues('zuji', 'buchi'), K.brokeFlag('sang')],
          why: [...clues('bu'), K.brokeFlag('ruan')],
        };
        for (const k of done[h.step]) f[k] = true;
        continue;
      }
      order.push(`${h.step}${h.tier}`);
      f[h.flag!] = true;
    }
    expect(order).toEqual(['find1', 'find2', 'find3', 'when1', 'when2', 'when3', 'how1', 'how2', 'how3', 'who1', 'who2', 'who3', 'why1', 'why2', 'why3']);
    const end = K.nextHint(f);
    expect(end.step).toBeNull();
    expect(end.fresh).toBe(false);
    expect(end.line).toEqual(K.HINT_DONE);
    expect(K.hintsRead(f)).toHaveLength(15);
  });

  it('skips steps already finished', () => {
    expect(K.nextHint(F(K.CASE_FLAGS.found)).step).toBe('when');
    expect(K.nextHint(F(K.CASE_FLAGS.found, ...clues('feng', 'menxiang', 'zuji', 'hualou'))).step).toBe('how');
  });

  it('「问青鸟」 counts only new notes', () => {
    const h1 = askBird();
    expect(h1.fresh).toBe(true);
    expect(play.value.counters[K.COUNTERS.hint]).toBe(1);
    expect(play.value.flags[K.hintFlag('find', 1)]).toBe(true);
    askBird();
    askBird();
    expect(play.value.counters[K.COUNTERS.hint]).toBe(3);
    const again = askBird();
    expect(again.fresh).toBe(false);
    expect(again.line).toEqual(K.HINT_STEP.find.tiers[2]);
    expect(play.value.counters[K.COUNTERS.hint]).toBe(3);
  });

  it('the idle bluebird perches on the next thing to find', () => {
    expect(K.nextTarget({})).toBe('hollow');
    expect(K.nextTarget(F(K.CASE_FLAGS.found))).toBe('feng');
    expect(K.nextTarget(F(K.CASE_FLAGS.found, ...clues('feng', 'zuji', 'hualou', 'menxiang')))).toBe('xiang');
    const all = F(K.CASE_FLAGS.found, ...K.CLUE_KEYS.map(K.clueFlag), K.brokeFlag('sang'), K.brokeFlag('ruan'));
    expect(K.nextTarget(all)).toBeNull();
  });
});

describe('flags', () => {
  it('fit (≤ 64 characters), are unique and all under case:', () => {
    const all = [...K.CASE_FLAG_LIST, ...Object.values(K.COUNTERS), K.DAY_KEY];
    for (const k of all) {
      expect(k.length, k).toBeLessThanOrEqual(64);
      expect(k.startsWith('case:'), k).toBe(true);
    }
    expect(new Set(K.CASE_FLAG_LIST).size).toBe(K.CASE_FLAG_LIST.length);
    // the story writes the same names for what it sets (B4b's memory, B5's choice)
    for (const k of ['case:hz:open', 'case:hz:parked', 'case:hz:catnose', 'case:hz:c:menxiang']) {
      expect(STORY_FLAGS, k).toContain(k);
      expect(K.CASE_FLAG_LIST, k).toContain(k);
    }
  });
});

describe('the English', () => {
  // (the hours keep their names, 戌正 and 子初; {名} is the walker's name, filled at render)
  const ok = (en: string) => en.replace(/\{名\}/g, '').replace(/[申酉戌亥子卯][初正末]?(二刻)?/g, '');
  const ens: [string, string][] = [];
  const walk = (o: unknown, path: string): void => {
    if (typeof o === 'function') { walk((o as (n: unknown) => unknown)(K.GRADE_NAME.ming), path + '()'); return; }
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && k === 'en') ens.push([`${path}.${k}`, v]);
      else walk(v, `${path}.${k}`);
    }
  };
  walk({ CLUES: K.CLUES, WITNESSES: K.WITNESSES, T6: K.T6, QUESTIONS: K.QUESTIONS, JUDGE: { ...K.JUDGE, gradeLine: undefined }, GHOSTS: K.GHOSTS, HINTS: K.HINT_STEPS, WRITER: { ...K.WRITER, coins: undefined }, TOOLS: K.TOOLS, WORLD: { ...K.WORLD, notReadyMore: undefined }, PRINTS: K.PRINTS, CONTRADICTIONS: K.CONTRADICTIONS, HERRINGS: K.HERRINGS }, 'case');
  it('names no one in hanzi', () => {
    expect(ens.length).toBeGreaterThan(150);
    for (const [where, en] of ens) expect(/[㐀-鿿]/.test(ok(en)), `${where}: ${en}`).toBe(false);
  });
});

describe("the owner's code", () => {
  it('sets nothing of the case: no clue, no testimony, no grade, no judgement', () => {
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    const f = play.value.flags;
    for (const k of Object.keys(f)) expect(/^(case:|ty:|mail:|item:)/.test(k), k).toBe(false);
    for (const k of Object.keys(play.value.counters)) expect(k.startsWith('case:'), k).toBe(false);
    expect(K.ready(f).ok).toBe(false);
    expect(K.caseIsOpen(f)).toBe(false);
    expect(K.gradeOf(f)).toBeNull();
    expect(K.progress(f)).toEqual({ clues: 0, words: 0, broken: 0 });
    expect(K.nextHint(f).step).toBe('find');
  });
  it('and the case, played, is play only (a flag at a time, as anyone would)', () => {
    flag(K.CASE_FLAGS.open);
    expect(K.caseIsOpen(play.value.flags)).toBe(true);
    flag(K.CASE_FLAGS.solved);
    expect(K.caseIsOpen(play.value.flags)).toBe(false);
  });
});

describe('the fix round: words that read right', () => {
  it("杜二's lie is its own line: breaking it strikes only 「祭前我没碰过供桌」, not his true alibi", () => {
    const d = K.WITNESS.duer;
    expect(d.opening).toHaveLength(3);
    expect(d.opening[0].zh).toBe('祭前我没碰过供桌！');
    expect(d.opening[1].zh).toContain('戌正我同阿黍');
    // (a return visit restates the lie itself, and the choices hang on it)
    expect(K.statementNow('duer', F(K.heardFlag('duer')))).toEqual([d.opening[0]]);
  });
  it('in English every hour a question turns on carries its clock time', () => {
    const q1 = K.QUESTIONS[0];
    expect(q1.options[q1.answer].en).toContain('戌正 (8 pm)');
    for (const o of q1.options.slice(0, 3)) expect(o.en).toMatch(/\((8|9:30|10) pm\)/);
    // the witnesses' hours, on first mention
    expect(K.WITNESS.duer.opening[1].en).toContain('戌正 (8 pm)');
    expect(K.WITNESS.sang.opening[0].en).toContain('戌正 (8 pm)');
    expect(K.GHOSTS[0].en).toContain('戌正 (8 pm)');
    expect(K.hourName(20).en).toBe('戌正 (8 pm)');
  });
  it('the brush prompt is one short action (it fits the round act button)', () => {
    expect([...K.WORLD.brush.zh].length).toBeLessThanOrEqual(2);
  });
  it("石瞽's tune has its line", () => {
    expect(K.WRITER.tune.zh.startsWith('（')).toBe(true);
    expect(K.WRITER.tune.en.length).toBeGreaterThan(10);
  });
  it('the first ghost shot stands in the open courtyard, clear of the front gate and its eave', () => {
    const [x, y, z] = K.GHOST_SHOTS[0].to;
    expect(z).toBeLessThan(-18.5);
    expect(z).toBeGreaterThan(-22.4);
    expect(Math.abs(x)).toBeLessThan(4.2);
    expect(y).toBeLessThan(3);
  });
});
