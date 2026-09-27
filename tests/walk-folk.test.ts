// 乡邻: everyone in the painting has a name and something to say to every companion — the crowd's
// ids resolve to folk, names never collide, every role talks to every companion (by day and night),
// stories go one beat a day with short flags, and people with a story are never culled at 低.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import { LETTER } from '../src/data/letters';
import { emptyPlay } from '../src/app/play';
import { crowdOf, keptSpecs, REGIONS_WITH_CROWDS } from '../src/views/walk/features/npcs/crowd';
import {
  FOLK, FOLK_BY_ID, REGULAR_AFTER, arcBeat, arcFlag, arcFor, arcsOf, chatPool, folkLabel, folkName, metFlag, planTalk, talkKey,
  type Folk, type TalkState,
} from '../src/views/walk/features/npcs/folk';
import { ARCS, NPC_ARCS } from '../src/views/walk/features/npcs/folk-arcs';
import { HAIL, INTROS, REGULAR, ROLE_TALK } from '../src/views/walk/features/npcs/folk-lines';
import { GROUPS_OF, voiced } from '../src/views/walk/features/npcs/logic';
import {
  FARMER_HELLO, FISHER_HELLO, FLOWER_HELLO, FORTUNE_HELLO, KITE_HELLO, MONK_HELLO, PEDDLER_HELLO, POET_NPC_HELLO, SHUTONG_ASK, SUGAR_HELLO, SUGAR_MAKE,
  TALE_SPOTTED, TEA_HELLO, type CrowdRole,
} from '../src/views/walk/features/npcs/lines';
import { NPC_LETTERS, WANG_LETTER_DAY, WANGDA_READ } from '../src/views/walk/features/npcs/letters';
import { ROLES, SPECIES } from '../src/views/walk/features/home/life/logic';
import { splitLetter } from '../src/views/mail/letter';
import { fillName } from '../src/app/name';

const WHO: CharacterId[] = CHARACTERS.map((c) => c.id);
const GROUPS = ['@wen', '@nong', '@wu', '@xian', '@shou'] as const;
const ROLE_IDS = Object.keys(ROLE_TALK) as CrowdRole[];
/** The thirteen of 桃源 (the valley builder's), whose names must stay theirs. */
const VILLAGERS = ['秦守拙', '小满', '秦小满', '桂娘', '桑三娘', '桃叶', '桑桃叶', '阮青', '阮郎', '杜二', '阿黍', '柳婆', '石瞽', '鲁三', '葛姑', '夭夭'];

const specsBy = REGIONS_WITH_CROWDS.map((r) => ({ region: r, specs: crowdOf(r) }));
const allSpecs = specsBy.flatMap(({ region, specs }) => specs.map((s, i) => ({ region, i, s })));

function state(o: Partial<TalkState> = {}): TalkState {
  return { flags: {}, counters: {}, daily: { day: '2026-09-26', counts: {} }, day: '2026-09-26', night: false, ...o };
}

describe('everyone in the crowd is someone', () => {
  it('gives each of the 72 figures an id that resolves to a person', () => {
    expect(allSpecs.length).toBe(72);
    for (const { s } of allSpecs) expect(FOLK_BY_ID[s.id], s.id).toBeTruthy();
  });
  it('makes one person of the same id on two shifts, never two at once', () => {
    const byId = new Map<string, { region: string; shift: string }[]>();
    for (const { region, s } of allSpecs) byId.set(s.id, [...(byId.get(s.id) ?? []), { region, shift: s.shift }]);
    const twoShifts = [...byId.values()].filter((l) => l.length > 1);
    expect(twoShifts.length).toBeGreaterThanOrEqual(10);
    for (const [id, l] of byId) {
      if (l.length < 2) continue;
      // day-side and night-side shifts never overlap
      const dayish = l.filter((x) => ['day', 'morning', 'afternoon', 'dawn'].includes(x.shift)).length;
      const nightish = l.filter((x) => ['night', 'evening', 'fest'].includes(x.shift)).length;
      expect(dayish <= 1 || nightish === 0, id).toBe(true);
      expect(l.every((x) => x.shift !== 'always'), id).toBe(true);
      // two night shifts only for a child at the festival (evening/fest never share a figure otherwise)
      if (nightish > 1) expect(l.every((x) => x.shift === 'fest' || x.shift === 'day'), id).toBe(true);
    }
  });
  it('puts every crowd person in the crowd, and names the stall-keepers too', () => {
    const used = new Set(allSpecs.map((x) => x.s.id));
    for (const x of FOLK) {
      if (x.role === 'npc') expect(x.id.startsWith('n.'), x.id).toBe(true);
      else expect(used.has(x.id), x.id).toBe(true);
    }
    for (const id of ['n.peddler', 'n.storyteller', 'n.fortune', 'n.sugar', 'n.flower', 'n.farmer', 'n.shutong', 'n.master', 'n.tea', 'n.fisher', 'n.monk', 'n.poet', 'n.kite']) expect(FOLK_BY_ID[id], id).toBeTruthy();
    expect(FOLK_BY_ID['n.sugar'].zh).toBe('糖人张');
    expect(FOLK_BY_ID['v.wu'].zh).toBe('老吴');
    expect(FOLK_BY_ID['v.lingjiao'].zh).toBe('王四娘');
  });
  it('gives everyone first words, a title and an epithet, in both languages', () => {
    for (const x of FOLK) {
      expect(INTROS[x.id], x.id).toBeTruthy();
      for (const l of [INTROS[x.id], x.title, x.epithet, { zh: x.zh, en: x.en }]) {
        expect(l.zh.trim().length, x.id).toBeGreaterThan(0);
        expect(l.en.trim().length, x.id).toBeGreaterThan(0);
      }
    }
  });
  it('keeps kin pointing at real people, both ways', () => {
    for (const x of FOLK) for (const k of x.kin ?? []) {
      expect(FOLK_BY_ID[k], `${x.id} → ${k}`).toBeTruthy();
      expect(FOLK_BY_ID[k].kin ?? [], `${k} ← ${x.id}`).toContain(x.id);
    }
  });
});

describe('names', () => {
  const residents = ROLES.flatMap((r) => r.names);
  const pets = SPECIES.flatMap((s) => s.names);
  const companions = CHARACTERS.map((c) => c.zh);
  it('never uses a name twice among the folk', () => {
    const zh = FOLK.map((x) => x.zh), en = FOLK.map((x) => x.en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(en).size).toBe(en.length);
  });
  it('never takes a name from the residents, the pets, the companions or the 桃源 villagers', () => {
    const taken = new Set([...residents, ...pets, ...companions, ...VILLAGERS]);
    for (const x of FOLK) expect(taken.has(x.zh), x.zh).toBe(false);
    // and no villager's name hides inside one of ours (小满 in 小满儿…)
    for (const x of FOLK) for (const v of VILLAGERS) expect(x.zh.includes(v), `${x.zh} ~ ${v}`).toBe(false);
  });
  it('shows the epithet until met, then title and name', () => {
    const wu = FOLK_BY_ID['v.wu'];
    expect(folkLabel(wu, false).zh).toBe('打更的汉子');
    expect(folkLabel(wu, true).zh).toBe('更夫·老吴');
    expect(folkLabel(wu, true).en).toBe('Watchman · Old Wu');
    expect(folkName(wu, false).zh).toBe('打更的汉子');
    expect(folkName(wu, true).zh).toBe('老吴');
    expect(folkLabel(FOLK_BY_ID['n.peddler'], true).zh).toBe('货郎·孙七');
  });
  it('never says the title twice (糖人张, not 糖人摊·糖人张), and the name is the one they give', () => {
    expect(folkLabel(FOLK_BY_ID['n.sugar'], true)).toEqual({ zh: '糖人张', en: 'Sugar-Figure Zhang' });
    expect(folkLabel(FOLK_BY_ID['v.guxiucai'], true).zh).toBe('秀才·顾廷之');
    for (const x of FOLK) {
      const l = folkLabel(x, true);
      const [title, name] = l.zh.includes('·') ? l.zh.split('·') : ['', l.zh];
      if (title) expect(name.includes(title.replace(/摊$/, '')) || title.includes(name), `${l.zh}`).toBe(false);
    }
    // the name on the tag is the one they give (顾廷之 says 顾廷之)
    for (const id of ['v.guxiucai', 'p.yeniang', 'l.wen', 'l.lin']) expect(INTROS[id].zh, id).toContain(FOLK_BY_ID[id].zh);
  });
});

/** Words a companion must never hear said to them (a line for the cat said to the rabbit, a man’s address to the qin player…). */
const MUST_NOT: Partial<Record<CharacterId, RegExp>> = {
  rabbit: /猫|\bcats?\b|鱼|\bfish|骨|\bbones?\b|claw|pounc|lick/i,
  cat: /玉兔|小兔|bunny|Jade Rabbit/i,
  musician: /先生|兄台|Mister|\bsir\b|man of letters|功名/i,
  change: /兄台|先生|Mister|\bsir\b|man of letters/i,
  fisher: /种地|土|秧|\bsoil\b|seedling|fellow farmer/i,
  gardener: /同行|fellow of the trade|鱼篓|creel/i,
};

describe('each companion is spoken to as who they are', () => {
  const said = (l: { zh: string; en: string }) => `${l.zh} / ${l.en}`;
  it('in the words every role keeps for them and their kind (day and night)', () => {
    for (const who of WHO) {
      const bad = MUST_NOT[who];
      if (!bad) continue;
      for (const role of ROLE_IDS) {
        for (const night of [false, true]) {
          const pool = chatPool({ ...FOLK[0], role }, who, night);
          for (const l of pool.lines.slice(0, pool.personal)) expect(bad.test(said(l)), `${who} ${role}${night ? ' night' : ''}: ${said(l)}`).toBe(false);
        }
      }
    }
  });
  it('in the stories meant for them (what is said to them, not what they say)', () => {
    for (const who of WHO) {
      const bad = MUST_NOT[who];
      if (!bad) continue;
      for (const [id, arcs] of Object.entries(ARCS)) {
        for (const arc of arcs) {
          if (!arc.who || !arcFor(arc.who, who)) continue;
          for (const beat of arc.beats) for (const l of voiced(beat.lines, who)) if (l.by !== 'me') expect(bad.test(said(l)), `${who} ${id}/${arc.id}: ${said(l)}`).toBe(false);
        }
      }
    }
  });
  it('the Jade Rabbit has a story of her own with the old monk; the wooden fish is the cat’s', () => {
    const jm = ARCS['m.jueming'];
    expect(jm.find((a) => a.id === 'fish')!.who).toEqual(['cat']);
    expect(jm.some((a) => a.who?.includes('rabbit'))).toBe(true);
  });
});

describe('an old acquaintance greets you in words that read with any name', () => {
  const lines = [...Object.values(REGULAR).flat(), ...HAIL];
  it('with the default name (园主 / friend): no doubled honorific, never “It’s friend”', () => {
    for (const l of lines) {
      const zh = fillName(l.zh, 'zh', 'world', ''), en = fillName(l.en, 'en', 'world', '');
      expect(zh, zh).not.toMatch(/园主(施主|兄)/);
      expect(en, en).not.toMatch(/It’s friend|Friend has|Friend’s here|[Ff]riend, my friend|— Friend!|^\(.*it’s friend/);
      expect(en.startsWith('Friend'), en).toBe(false);
    }
  });
  it('with a chosen name', () => {
    for (const l of lines) expect(fillName(l.en, 'en', 'world', 'Mei')).toContain('Mei');
  });
});

describe('talk for every role and companion', () => {
  it('writes every role for everyone and all five kinds', () => {
    for (const r of ROLE_IDS) {
      const chat = ROLE_TALK[r].chat;
      expect(chat.any.length, r).toBeGreaterThan(0);
      for (const g of GROUPS) expect(chat[g]?.length, `${r} ${g}`).toBeGreaterThan(0);
    }
  });
  it('gives every figure a non-empty line for every companion, by day and by night', () => {
    for (const x of FOLK) {
      if (x.role === 'npc') continue;
      for (const who of WHO) for (const night of [false, true]) {
        const pool = chatPool(x, who, night);
        expect(pool.lines.length, `${x.id} ${who} ${night}`).toBeGreaterThan(0);
        expect(pool.personal, `${x.id} ${who} ${night}: words of its own or its kind`).toBeGreaterThan(0);
        const plan = planTalk(x, who, state({ night, flags: { [metFlag(x.id)]: true } }));
        expect(plan.lines.length, `${x.id} ${who}`).toBeGreaterThan(0);
        for (const l of plan.lines) { expect(l.zh.length).toBeGreaterThan(0); expect(l.en.length).toBeGreaterThan(0); }
      }
    }
  });
  it('says something of their own to each companion somewhere in every place', () => {
    const own = (x: Folk, who: CharacterId): boolean => {
      if (x.role !== 'npc') {
        const t = ROLE_TALK[x.role];
        if (t.chat[who] || t.night?.[who]) return true;
      }
      return arcsOf(x.id).some((a) => (a.who ?? []).includes(who) || a.beats.some((b) => b.lines[who]));
    };
    for (const { region, specs } of specsBy) {
      for (const who of WHO) {
        const hit = specs.some((s) => own(FOLK_BY_ID[s.id], who));
        expect(hit, `${region} × ${who}`).toBe(true);
      }
    }
  });
  it('moves on to another line with each talk the same day', () => {
    const x = FOLK_BY_ID['v.fan'];
    const s0 = state({ flags: { [metFlag(x.id)]: true } });
    const a = planTalk(x, 'scholar', s0).lines[0];
    const b = planTalk(x, 'scholar', { ...s0, daily: { day: s0.day, counts: { [talkKey(x.id)]: 1 } } }).lines[0];
    expect(a.zh).not.toBe(b.zh);
  });
  it('introduces them the first time, and greets an old acquaintance by name once a day', () => {
    const x = FOLK_BY_ID['v.wu'];
    expect(planTalk(x, 'cat', state()).intro).toEqual(INTROS['v.wu']);
    const met = { [metFlag(x.id)]: true } as const;
    expect(planTalk(x, 'cat', state({ flags: met })).intro).toBeNull();
    expect(planTalk(x, 'cat', state({ flags: met, counters: { [talkKey(x.id)]: REGULAR_AFTER - 1 } })).regular).toBeNull();
    const reg = planTalk(x, 'cat', state({ flags: met, counters: { [talkKey(x.id)]: REGULAR_AFTER } })).regular;
    expect(reg?.zh).toContain('{名}');
    expect(reg?.en).toContain('{名}');
    expect(planTalk(x, 'cat', state({ flags: met, counters: { [talkKey(x.id)]: 9 }, daily: { day: '2026-09-26', counts: { [talkKey(x.id)]: 1 } } })).regular).toBeNull();
    for (const v of Object.values(REGULAR)) for (const l of v) { expect(l.zh).toContain('{名}'); expect(l.en).toContain('{名}'); }
  });
});

describe('stories, a beat a day', () => {
  const arcFolk = Object.keys(ARCS);
  it('has at least ten folk with stories, each told differently to at least three companions', () => {
    expect(arcFolk.length).toBeGreaterThanOrEqual(10);
    for (const id of arcFolk) {
      expect(FOLK_BY_ID[id], id).toBeTruthy();
      const texts = new Set<string>();
      const hearers = new Set<CharacterId>();
      for (const a of ARCS[id]) for (const who of WHO) {
        if (!arcFor(a.who, who)) continue;
        hearers.add(who);
        texts.add(voiced(a.beats[0].lines, who).map((l) => l.zh).join('|'));
      }
      expect(hearers.size, id).toBeGreaterThanOrEqual(3);
      expect(texts.size, id).toBeGreaterThanOrEqual(2);
      // told in their own words to three or more companions (own entries, or stories of their own)
      const ownWords = WHO.filter((w) => ARCS[id].some((a) => arcFor(a.who, w) && (a.who?.includes(w) || a.beats.some((b) => b.lines[w]))));
      expect(ownWords.length, id).toBeGreaterThanOrEqual(3);
    }
  });
  it('gives every stall-keeper a small story of their own', () => {
    for (const id of ['n.peddler', 'n.storyteller', 'n.fortune', 'n.sugar', 'n.flower', 'n.farmer', 'n.shutong', 'n.tea', 'n.fisher', 'n.monk', 'n.poet', 'n.kite']) {
      expect(NPC_ARCS[id]?.length, id).toBeGreaterThan(0);
    }
  });
  it('keeps every story flag within 64 characters, and every beat bilingual', () => {
    for (const [id, arcs] of [...Object.entries(ARCS), ...Object.entries(NPC_ARCS)]) for (const a of arcs) {
      a.beats.forEach((b, n) => {
        expect(arcFlag(id, a.id, n).length).toBeLessThanOrEqual(64);
        for (const who of WHO) for (const l of voiced(b.lines, who)) { expect(l.zh.length).toBeGreaterThan(0); expect(l.en.length).toBeGreaterThan(0); }
      });
    }
    for (const x of FOLK) { expect(metFlag(x.id).length).toBeLessThanOrEqual(64); expect(talkKey(x.id).length).toBeLessThanOrEqual(64); }
  });
  it('tells one beat a day, then the next one the next day', () => {
    const x = FOLK_BY_ID['v.wu'];
    const flags: Record<string, true> = { [metFlag(x.id)]: true };
    const d1 = state({ flags, night: true });
    const p1 = planTalk(x, 'guan', d1);
    expect(p1.beat?.flag).toBe('arc:v.wu:dark:0');
    flags[p1.beat!.flag] = true;
    // the same day: no second beat, just a line
    const sameDay = planTalk(x, 'guan', { ...d1, flags, daily: { day: d1.day, counts: { 'arc:v.wu': 1 } } });
    expect(sameDay.beat).toBeNull();
    expect(sameDay.lines.length).toBeGreaterThan(0);
    // the next day: the next beat
    const p2 = planTalk(x, 'guan', { ...d1, flags, day: '2026-09-27', daily: { day: '2026-09-26', counts: { 'arc:v.wu': 1 } } });
    expect(p2.beat?.flag).toBe('arc:v.wu:dark:1');
    // a story is its own companions’: the cat hears about the lanterns instead
    expect(planTalk(x, 'cat', d1).beat?.flag).toBe('arc:v.wu:lamps:0');
    expect(planTalk(x, 'change', d1).beat?.flag).toBe('arc:v.wu:moon:0');
    expect(planTalk(x, 'gardener', d1).beat).toBeNull();
  });
  it('waits for the night, and for the answer to 王四娘’s letter', () => {
    const x = FOLK_BY_ID['v.lingjiao'];
    const lamp = ARCS['v.lingjiao'].find((a) => a.id === 'lamp')!;
    expect(arcBeat(x, lamp, 'change', state({ night: false }))).toBeNull();
    expect(arcBeat(x, lamp, 'change', state({ night: true }))?.n).toBe(0);
    const letter = ARCS['v.lingjiao'].find((a) => a.id === 'letter')!;
    const two = { [arcFlag(x.id, 'letter', 0)]: true, [arcFlag(x.id, 'letter', 1)]: true } as Record<string, true>;
    expect(arcBeat(x, letter, 'scholar', state({ flags: two }))).toBeNull();
    expect(arcBeat(x, letter, 'scholar', state({ flags: { ...two, [WANGDA_READ]: true } }))?.n).toBe(2);
    // the letter goes the day it is written (a day marked), and arrives the next
    expect(letter.beats[1].reward?.mark).toBe(WANG_LETTER_DAY);
    const def = LETTER['npc-wangda'];
    expect(def).toBe(NPC_LETTERS[0]);
    // signed at the foot, as a letter is (the signature never runs on into the body)
    for (const l of NPC_LETTERS) {
      expect(splitLetter(l.body.zh, 'zh').sign, l.id).not.toBe('');
      expect(splitLetter(l.body.en, 'en').sign, l.id).not.toBe('');
    }
    expect(splitLetter(NPC_LETTERS[0].body.zh, 'zh').sign).toBe('王大（托人代书）');
    const p = emptyPlay();
    expect(def.due!(p, '2026-09-26')).toBe(false);
    p.done[WANG_LETTER_DAY] = '2026-09-26';
    expect(def.due!(p, '2026-09-26')).toBe(false);
    expect(def.due!(p, '2026-09-27')).toBe(true);
    expect(`mail:${def.id}`).toBe(WANGDA_READ);
    expect(def.body.zh).toContain('{名}');
  });
  it('asks 殷老汉’s second beat only once you have met his son', () => {
    const x = FOLK_BY_ID['m.yinlao'];
    const son = ARCS['m.yinlao'].find((a) => a.id === 'son')!;
    const one = { [arcFlag(x.id, 'son', 0)]: true } as Record<string, true>;
    expect(arcBeat(x, son, 'scholar', state({ flags: one }))).toBeNull();
    expect(arcBeat(x, son, 'scholar', state({ flags: { ...one, [metFlag('p.yinsheng')]: true } }))?.n).toBe(1);
  });
  it('matches stories to companions by name or by kind', () => {
    expect(arcFor(['@wen'], 'poet')).toBe(true);
    expect(arcFor(['@xian'], 'rabbit')).toBe(true);
    expect(arcFor(['@wu'], 'cat')).toBe(false);
    expect(arcFor(undefined, 'cat')).toBe(true);
    for (const who of WHO) expect(GROUPS_OF[who].length).toBeGreaterThan(0);
  });
});

describe('who is out at 低', () => {
  it('never culls someone with a story (nor their partner)', () => {
    for (const share of [0.55, 0.3, 0]) {
      for (const { region, specs } of specsBy) {
        const kept = keptSpecs(specs, region, share);
        specs.forEach((s, i) => {
          if (FOLK_BY_ID[s.id].keep) expect(kept[i], `${region} ${s.id} @${share}`).toBe(true);
          if (s.beside) expect(kept[i]).toBe(kept[i - 1]);
        });
      }
    }
  });
  it('still thins the everyday crowd at 低, and keeps everyone at 中', () => {
    let out = 0, all = 0;
    for (const { region, specs } of specsBy) {
      const kept = keptSpecs(specs, region, 0.55);
      out += kept.filter(Boolean).length; all += specs.length;
      expect(keptSpecs(specs, region, 1).every(Boolean)).toBe(true);
    }
    expect(out).toBeLessThan(all);
  });
});

describe('the stall-keepers speak to all thirteen', () => {
  it('has a hello of their own for every companion', () => {
    const tables = { PEDDLER_HELLO, TALE_SPOTTED, FORTUNE_HELLO, SUGAR_HELLO, SUGAR_MAKE, FLOWER_HELLO, FARMER_HELLO, SHUTONG_ASK, TEA_HELLO, FISHER_HELLO, MONK_HELLO, POET_NPC_HELLO, KITE_HELLO };
    for (const [name, t] of Object.entries(tables)) {
      for (const who of WHO) {
        const l = (t as Record<string, { zh: string; en: string } | null | undefined>)[who];
        expect(l, `${name} ${who}`).toBeTruthy();
        expect(l!.zh.length).toBeGreaterThan(0);
        expect(l!.en.length).toBeGreaterThan(0);
      }
    }
  });
});
