// 水月幻镜 · every word the tutorial says (d-tutorial §1.5, §2, §3, reconciled in mirror3 CONTRACTS
// §5.4): the coach lines, the end card, the offer, and the first-time tips of real runs. Each is a
// {zh, en} pair with `touch` / `keys` variants where the controls differ. Numbers and button labels are
// {slots} filled from data and the glossary (lineSlots), never typed, so a balance pass or a rename
// can't leave the tutorial behind. Pure: data, logic and ids only.
import { ELITE_REG, ITEM_REG, MONSTER_REG, SKILL_REG, WEAPON_REG } from '../ids';
import { F, PAY, SKILLS, WEAPONS } from '../data';
import { termOf, type GlossId } from '../data/glossary';
import { gross } from '../logic';

export interface Say { zh: string; en: string }
/** Where a line shows: in a wave (short) or between waves (a little longer). */
export type LineWhere = 'wave' | 'between';
export interface Line { where: LineWhere; base: Say; touch?: Say; keys?: Say }

const s = (zh: string, en: string): Say => ({ zh, en });
const L = (where: LineWhere, base: Say, v: { touch?: Say; keys?: Say } = {}): Line => ({ where, base, ...v });

/** Length caps (code points): three lines at 320 px in a wave (d-tutorial §4.3). */
export const LINE_CAPS: Readonly<Record<LineWhere, { zh: number; en: number }>> = {
  wave: { zh: 44, en: 120 },
  between: { zh: 60, en: 150 },
};

// ───────────────────────────────────────────── the coach
export const LINES = {
  ritual: L('between', s('头一回来吧？我陪你走一遍，不收钱。', "First time here? I'll walk you through. No charge.")),
  // before wave 1
  R1: L('between', s('这一局是练习：不花钱，不记成绩，也不会倒下。准备好了，点「{go}」。', "This run is practice: it's free, nothing is recorded, and you can't go down. Tap {go} when you're ready."), {
    keys: s('这一局是练习：不花钱，不记成绩，也不会倒下。准备好了，按 Enter 或点「{go}」。', "This run is practice: it's free, nothing is recorded, and you can't go down. Press Enter or click {go} when you're ready."),
  }),
  // wave 1 · walk and fight
  W1: L('wave', s('用 WASD 或方向键走动。', 'Walk with WASD or the arrow keys.'), {
    touch: s('按住屏幕{side}半边任意一处，往哪边拖，人就往哪边走。', 'Press anywhere on the {side} half of the screen and drag. You walk the way you drag.'),
  }),
  W1n: L('wave', s('按住 W 不放试试。', 'Try holding W down.'), { touch: s('手指按住别松，慢慢拖。', 'Keep your finger down and drag slowly.') }),
  W2: L('wave', s('{blot}来了。剑会自己刺向最近的敌人，你只管走。', 'Ink blots! Your sword strikes the nearest one by itself. You just walk.')),
  W2n: L('wave', s('走近一点，剑才够得着。', 'Get a bit closer so your sword can reach.')),
  W3: L('wave', s('打倒的敌人会掉下白色的{moon}。走近它，它就飞过来了。', 'Beaten enemies drop white moonlight. Walk near it and it flies to you.')),
  W3n: L('wave', s('{moon}就在地上，走过去碰一碰。', "It's on the ground: walk over to it.")),
  W4: L('wave', s('{moon}既是钱，也是经验。这个数是你有多少{moon}，这条细线满了就升级。', 'Moonlight is both money and experience. This number is how much you have; when this thin line fills, you level up.')),
  W5: L('wave', s('升级了！{hp}上限 +1。这一重打完，还能挑一张{card}。', "Level up! +1 max HP. When this wave ends you'll also pick a bonus card.")),
  W6: L('wave', s('这个数是这一重还剩几秒。数到 0，这一重就过了。', 'This number is how many seconds this wave has left. At 0, the wave is cleared.')),
  // the first level-up cards
  C1: L('between', s('这是升级的奖励。每张卡写着加什么，挑一张，这一局都算数。', 'Your level-up reward. Each card says what it adds. Pick one; it counts for the whole run.'), {
    keys: s('这是升级的奖励。每张卡写着加什么，挑一张（按数字键也行），这一局都算数。', 'Your level-up reward. Each card says what it adds. Pick one (number keys work too); it counts for the whole run.'),
  }),
  C1n: L('between', s('拿不准？哪张都行，后面还有很多次。', 'Not sure? Any card will do; there are plenty more to come.')),
  // shop 1
  H1: L('between', s('这是{shop}。每打完一重都会来这里，用{moon}买兵器和道具。', 'This is the shop. You come here after every wave to spend moonlight on weapons and items.')),
  H2: L('between', s('这把{w0}跟你手里那把一模一样。买下它。', 'This {w0} is just like the one in your hand. Buy it.'), {
    keys: s('这把{w0}跟你手里那把一模一样。点它或按 {n0}，买下它。', 'This {w0} is just like the one in your hand. Click it or press {n0} to buy it.'),
  }),
  H2a: L('between', s('也行。再把{w0}买下来。', 'Fine. Now buy the {w0} too.')),
  H2b: L('between', s('{moon}差一点，这回算我的。', "A little short on moonlight. This one's on me.")),
  H3a: L('between', s('点「兵器」，看看你手里的兵器。', "Tap Weapons to see what you're holding.")),
  H3: L('between', s('两把同名、同品阶的兵器，能合铸成更强的一把。先点一把剑，再点「{merge}」。', 'Two identical weapons of the same tier merge into a stronger one. Tap one of the swords, then {merge}.'), {
    keys: s('两把同名、同品阶的兵器，能合铸成更强的一把。先点一把剑，再点「{merge}」。', 'Two identical weapons of the same tier merge into a stronger one. Click one of the swords, then {merge}.'),
  }),
  H3done: L('between', s('合好了：{t1}变成{t2}，伤害从 {d1} 变成 {d2}。', 'Merged: {t1} became {t2}, and damage went from {d1} to {d2}.')),
  H4: L('between', s('不要的兵器，点它再点「{sell}」，能换回现价的{sellFrac}。这把先留着。', "Don't need a weapon? Tap it, then {sell}, for {sellFrac} of its price now. Keep this one."), {
    keys: s('不要的兵器，点它再点「{sell}」，能换回现价的{sellFrac}。这把先留着。', "Don't need a weapon? Click it, then {sell}, for {sellFrac} of its price now. Keep this one."),
  }),
  H5: L('between', s('看中了但钱不够？点「{lock}」，这件货会留到下一次商店。锁住{i2}试试。', "Like something you can't afford yet? {lock} it and it waits for the next shop. Try locking the {i2}."), {
    keys: s('看中了但钱不够？点「{lock}」，或先按 L 再按 {n2}，这件货会留到下一次商店。锁住{i2}试试。', "Like something you can't afford yet? {lock} it (or press L, then {n2}) and it waits for the next shop. Try the {i2}."),
  }),
  H6: L('between', s('不喜欢这些货，就点「{reroll}」换一批。书生每次进商店，都送一次免费的。', "Don't like the goods? {reroll} for a new batch. The Scholar gets one free in every shop."), {
    keys: s('不喜欢这些货，就点「{reroll}」或按 R 换一批。书生每次进商店，都送一次免费的。', "Don't like the goods? {reroll} (or press R) for a new batch. The Scholar gets one free in every shop."),
  }),
  H6done: L('between', s('锁住的{i2}还在原处。', 'The locked {i2} stayed put.')),
  H7: L('between', s('点这个头像，打开「{panel}」：{hp}、{armor}，还有每把兵器每秒打多少，都在这里。', 'Tap your portrait to open {panel}: HP, armour, and how much each weapon deals per second.'), {
    keys: s('点这个头像（或按 C），打开「{panel}」：{hp}、{armor}，还有每把兵器每秒打多少，都在这里。', 'Click your portrait (or press C) to open {panel}: HP, armour, and how much each weapon deals per second.'),
  }),
  /** H7 on a wide screen, where 人物 is a column that is always open. */
  H7w: L('between', s('「{panel}」这一栏一直开着：{hp}、{armor}，还有每把兵器每秒打多少。点头像就能跳过去。', '{panel} has its own column, always open: HP, armour, and how much each weapon deals per second. Tap your portrait to jump to it.'), {
    keys: s('「{panel}」这一栏一直开着：{hp}、{armor}，还有每把兵器每秒打多少。点头像或按 C 就能跳过去。', '{panel} has its own column, always open: HP, armour, and how much each weapon deals per second. Click your portrait or press C to jump to it.'),
  }),
  H7b: L('between', s('上面四格是保命的数。哪一格、哪一行看不懂，点一下就有一句解释。', "These four tiles keep you alive. Tap any tile or row you're unsure of for a one-line explanation."), {
    keys: s('上面四格是保命的数。哪一格、哪一行看不懂，点一下就有一句解释。', "These four tiles keep you alive. Click any tile or row you're unsure of for a one-line explanation."),
  }),
  H8: L('between', s('商店就这些。点「{next}」接着打。', "That's the shop. Tap {next} to carry on."), {
    keys: s('商店就这些。按 Enter 或点「{next}」接着打。', "That's the shop. Press Enter or click {next} to carry on."),
  }),
  // wave 2 · dodge
  P1: L('wave', s('按 Esc 随时可以暂停。', 'Press Esc to pause any time.'), { touch: s('点 ‖ 随时可以暂停。', 'Tap ‖ to pause any time.') }),
  D1: L('wave', s('脚下泛起朱红了：红墨填满的地方会挨打。填满之前，走出红圈。', 'Red is spreading under your feet: when it fills, that spot gets hit. Walk out of the circle before it fills.')),
  D1a: L('wave', s('躲开了！再来一个。', "Dodged! Here's another.")),
  D1b: L('wave', s('躲得好。', 'Nicely done.')),
  D1c: L('wave', s('挨了一下，不要紧。看着红圈，填满前走开。', 'Took a hit. No harm done: watch the red and step out before it fills.')),
  D2: L('wave', s('{lantern}会远远地吐火球。带红边的弹丸都会伤人，绕着走。', 'Lantern wraiths spit fireballs from afar. Anything with a red rim hurts: walk around it.')),
  D2n: L('wave', s('它躲在远处。走过去，剑才够得着。', 'It keeps its distance. Walk up to it so your sword can reach.')),
  D3: L('wave', s('一大群来了！按 Q 或空格，放出书生的{skillWord}「{skill}」。', "Here comes a crowd! Press Q or Space to cast the Scholar's skill, {skill}."), {
    touch: s('一大群来了！点{corner}的「{glyph}」，放出书生的{skillWord}「{skill}」。', "Here comes a crowd! Tap the round button at the {corner} to cast the Scholar's skill, {skill}."),
  }),
  D3n: L('wave', s('就是那个圆钮。', "It's that round button.")),
  D3b: L('wave', s('放完之后，外圈要转满才能再放：{cd} 秒。', 'After a cast, the ring has to fill before the next one: {cd} seconds.')),
  D3c: L('wave', s('按住圆钮拖动，还能自己挑落点。', 'Hold the button and drag to pick where it lands.')),
  // shop 2
  H9: L('between', s('这回你自己挑。买不买都行，好了就点「{next}」。', "Your call this time. Buy or don't, and tap {next} when you're done."), {
    keys: s('这回你自己挑。买不买都行，好了就按 Enter 或点「{next}」。', "Your call this time. Buy or don't, and press Enter or click {next} when you're done."),
  }),
  // wave 3 · the big one
  B1: L('wave', s('来了个大个的：{foe}。它比小怪硬得多，打倒它，这一重就过了。', "A big one: the {foe}. It's much tougher than the small ones. Beat it and the wave is won.")),
  B2: L('wave', s('地上的红色长条，就是它要打的地方。站到没有红的地方去。', "The red strips on the ground are where it's about to strike. Stand somewhere with no red.")),
  B3: L('wave', s('{skillWord}又好了，按 Q 往它身上放。', 'Skill ready again: press Q to cast it on the snake.'), {
    touch: s('「{glyph}」又好了，往它身上放。', 'Your skill is ready again. Cast it on the snake.'),
  }),
  B4: L('wave', s('{hp}快没了！先走远一些，剑会自己打。', 'HP is low! Back away for a bit; your sword keeps fighting.')),
  B4b: L('wave', s('这一下本来会倒下。练习里不要紧，真入镜可要当心。', 'That hit would have put you down. Fine in practice; in a real run, be careful.')),
  B5: L('wave', s('打倒了！它掉了一个{crate}，这一重打完就能打开。', "Got it! It dropped a casket; you'll open it when the wave ends.")),
  // the casket
  K1: L('between', s('{crate}里是一件道具。点「{keep}」留着它，点「{melt}」能换 {meltN} {moon}。拿不准就收下。', 'A casket holds one item. {keep} it, or {melt} it for {meltN} moonlight. Not sure? Keep it.'), {
    keys: s('{crate}里是一件道具。按 1「{keep}」留着它，按 2「{melt}」能换 {meltN} {moon}。拿不准就收下。', 'A casket holds one item. Press 1 to keep it, or 2 to melt it for {meltN} moonlight. Not sure? Keep it.'),
  }),
  nice: L('wave', s('好。', 'Nice.')),
  // the pause sheet's error
  snag: L('between', s('教程出了点问题，先回镜前。', 'The tutorial hit a snag. Back to the lobby.')),
} as const satisfies Record<string, Line>;
export type LineId = keyof typeof LINES;

/** The hold buttons. */
export const BUTTONS = {
  ok: s('好', 'OK'),
  got: s('明白', 'Got it'),
  go: s('来吧', 'Bring it on'),
  here: s('在这', 'here'),
  skip: s('跳过教程', 'Skip the tutorial'),
} as const;

// ───────────────────────────────────────────── the end card, the offer, the ribbon
export const END = {
  title: s('初入镜中', 'First steps'),
  sub: s('走完了。', "That's it."),
  lines: [
    s('真正入镜：每天第一局免费，之后每局 {fee} 文。', 'Real runs: your first each day is free, then {fee} coins a run.'),
    s('打过第 {back} 重，入镜钱就回本了。', 'Clear wave {back} and the fee has paid for itself.'),
    s('随时可以「{leave}」，回来接着打，不再收钱。', '{leave} whenever you like and pick up where you left off, free.'),
    s('练习里的{moon}、兵器和道具留在这里，不会带走。', 'The moonlight, weapons and items from practice stay here.'),
  ],
  enter: s('去入镜', 'Go in for real'),
  back: s('回镜前', 'Back to the mirror'),
  foot: s('想再看一遍，镜前点「{tutorial}」。', 'To see it again, tap {tutorial} in the lobby.'),
} as const;
export const OFFER = {
  title: s('初入镜中', 'First steps'),
  body: s('头一回来？花三四分钟跟着走一遍：怎么走、怎么打、怎么买东西。练习不收钱，也不记成绩。', 'First time here? Take three or four minutes to walk through it: moving, fighting, shopping. Practice is free and nothing is recorded.'),
  yes: s('带我走一遍', 'Show me'),
  no: s('我自己摸索', "I'll find my own way"),
  note: s('以后在镜前点「{tutorial}」随时能看。', 'You can open it any time from {tutorial} in the lobby.'),
  ribbon: s('新添了「初入镜中」教程：三四分钟，不收钱。', 'New: a short tutorial, three or four minutes, free.'),
  ribbonGo: s('去看看', 'Take a look'),
  close: s('不用了', 'No thanks'),
} as const;
/** 设置: the tutorial's rows. */
export const SETTINGS = {
  tips: s('新手提示', 'Beginner tips'),
  tipsSub: s('首领、精英、镜奁……第一次遇到时提醒一句', 'A short line the first time you meet a boss, an elite, a casket…'),
  reset: s('重看新手提示', 'Show the tips again'),
  resetSub: s('每条提示都会再出现一次', 'Every tip will show once more'),
  resetDone: s('新手提示会再出现一次。', 'The tips will show again.'),
  replay: s('再走一遍教程', 'Play the tutorial again'),
  replaySub: s('三四分钟的练习局：不花钱，不记成绩', 'A three-or-four-minute practice run: free, nothing recorded'),
} as const;

// ───────────────────────────────────────────── first-time tips in real runs
export const TIPS = {
  boss: L('wave', s('{boss}来了。这一重不计时，打倒它才算过。它出招前，地上会先泛起朱红。', 'A boss! This wave has no timer: it ends when the boss falls. Before each big attack, red spreads on the ground first.')),
  crate: L('wave', s('捡到一个{crate}！这一重打完再打开。', 'A casket! It opens when this wave ends.')),
  crateOpen: L('between', s('「{keep}」就留着这件道具；「{melt}」是换成 {meltN} {moon}。', 'Keep the item, or melt it into {meltN} moonlight.')),
  elite: L('wave', s('身上有金印的是{elite}：比小怪硬得多，打倒一定掉{crate}。', 'The one with a gold seal is an elite: much tougher, and it always drops a casket.')),
  curse: L('between', s('带「{curse}」的道具有代价：你变强，敌人也变强。', 'Items with Curse cost you: you get stronger, and so do the enemies.')),
  curseSmall: L('between', s('每 1 点{curse}：敌人{hp}、伤害 +{e}%，你的伤害 +{d}%，{moon} +{m}%。', 'Each point: enemies +{e}% HP and damage; you +{d}% damage and +{m}% moonlight.')),
  lowHp: L('wave', s('{hp}快没了！先走远一些，兵器会自己打。下一重开场会回满。', 'HP is low! Back away; your weapons keep fighting. You start the next wave at full HP.')),
  cards: L('between', s('升级了：挑一张{card}，这一局都算数。', 'Level up: pick a bonus card; it counts for the whole run.')),
  shop: L('between', s('{shop}：点货就买。「{lock}」留到下次，「{reroll}」换一批，两把一样的兵器能「{merge}」。想看完整教程，镜前点「{tutorial}」。', 'The shop: tap to buy. {lock} keeps an item for next time; {reroll} brings new goods; two identical weapons merge. Full tutorial: {tutorial} in the lobby.')),
} as const satisfies Record<string, Line>;
export type TipLineId = keyof typeof TIPS;

// ───────────────────────────────────────────── slots
export type SlotVal = Say | number;
export type Slots = Readonly<Record<string, SlotVal>>;

/** Glossary labels a line may name; the lines test checks each against termOf(...).zh. */
export const LABEL_SLOTS = {
  reroll: 'reroll', panel: 'panel', lock: 'lock', merge: 'merge', sell: 'sell', next: 'next', go: 'go', keep: 'keep', melt: 'melt',
  leave: 'leave', tutorial: 'tutorial', moon: 'moon', hp: 'hp', armor: 'armor', card: 'card', crate: 'crate', elite: 'elite',
  shop: 'shop', curse: 'curse', boss: 'boss', skillWord: 'skill', t1: 'tier1', t2: 'tier2',
} as const satisfies Record<string, GlossId>;

const named = (id: string): Say => {
  const n = [...WEAPON_REG, ...ITEM_REG, ...MONSTER_REG, ...ELITE_REG].find((x) => x.id === id) as { zh: string; en: string } | undefined;
  return n ? s(n.zh, n.en) : s(id, id);
};
/** A fraction in words: ¼ → 四分之一 / a quarter; else a percent. */
export function fracWords(x: number): Say {
  const known: Record<string, Say> = { '0.25': s('四分之一', 'a quarter'), '0.5': s('一半', 'half'), '0.2': s('五分之一', 'a fifth') };
  return known[String(x)] ?? s(`${Math.round(x * 100)}%`, `${Math.round(x * 100)}%`);
}
/** The wave whose 返照钱 first covers the fee (闲游's pay would differ; the lobby's rules speak of 照影 on 月湖). */
export function backWave(): number {
  for (let W = 1; W <= 30; W++) if (gross(W, 1, 'lake', 0, 0) >= PAY.FEE) return W;
  return 30;
}
const pctOf = (x: number) => Math.round(x * 1000) / 10;

/** The slots every line may use: data numbers, names and glossary labels. `extra` adds per-moment ones. */
export function lineSlots(extra: Record<string, SlotVal> = {}): Slots {
  const sk = SKILL_REG.find((x) => x.id === 'yizi')!;
  const out: Record<string, SlotVal> = {
    cd: SKILLS.yizi.cd,
    d1: WEAPONS.qingfeng.dmg[0], d2: WEAPONS.qingfeng.dmg[1],
    sellFrac: fracWords(F.sellFrac),
    fee: PAY.FEE,
    back: backWave(),
    e: pctOf(F.curseEnemy), d: F.curseDmg, m: pctOf(F.curseMoon),
    glyph: s(sk.glyph, sk.glyph), skill: s(sk.zh, sk.en),
    w0: named('qingfeng'), i2: named('sandals'), n0: 1, n2: 3,
    blot: named('blot'), lantern: named('lantern'), foe: named('whitesnake'),
  };
  for (const [k, id] of Object.entries(LABEL_SLOTS)) { const x = termOf(id); out[k] = s(x.zh, x.en); }
  return { ...out, ...extra };
}

export interface LineCtx {
  lang: 'zh' | 'en';
  input: 'touch' | 'keys';
  /** Left-handed: the stick is on the right, the skill button at the bottom left. */
  left: boolean;
  slots: Slots;
}
/** The text of a line for this moment: its touch or keys variant, then every {slot} filled. */
export function resolveLine(line: Line, c: LineCtx): string {
  const v = (c.input === 'touch' ? line.touch : line.keys) ?? line.base;
  const side = c.left ? s('右', 'right') : s('左', 'left');
  const corner = c.left ? s('左下角', 'bottom left') : s('右下角', 'bottom right');
  const all: Record<string, SlotVal> = { side, corner, ...c.slots };
  return fillSlots(v[c.lang], all, c.lang);
}
/** Fill {slots}; an unknown slot is left as it is (the lines test catches it). */
export function fillSlots(text: string, slots: Readonly<Record<string, SlotVal>>, lang: 'zh' | 'en'): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const x = slots[k];
    if (x === undefined) return m;
    return typeof x === 'number' ? String(x) : x[lang];
  });
}
