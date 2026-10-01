// 水月幻镜 · every player-facing description as a hand-written sentence with data slots (mirror3 d-text §5).
// A person writes each line once, in plain spoken Chinese and plain English; every number in it is a
// `{slot}` that ui/describe.ts fills from the def at the tier being shown, so a balance pass can never
// leave the words behind. tests/mirror-text.test.ts forbids digits outside slots, checks every slot
// resolves at every tier, the length limits, banned words, and that English carries no hanzi.
//
// Slot grammar (ui/describe.ts `fill`):  {[-]path[*proc][+n|-n|*n|/n][%][:fmt][?one|many]}
//   path   a value of the thing described: weapon `p` keys at the tier (pierce, gold …) and def fields
//          (dmg, cd, range, crit, critX, knock); item `s.<stat>`, `f0.<field…>` (fx[0]), `curse`, `max`;
//          skill / passive `p` keys, `cd`, `reach`, `s.<stat>`, `f0…`; companion `c.<field>`, `w.melee`
//          (weapon multipliers); vow `per` keys; `F.<key>` (data/stats F), `K.<key>` (engine constants
//          below); `=n` a literal count the engine hard-codes (「回 {=1} 点血」).
//   *proc  × the weapon's hidden trigger factor (醉拳's 3 → 1.8), so text never says 「触发系数」.
//   %      × 100 and a 「%」: 0.1 → 10%.
//   :fmt   size | reach | arc (distance words, §2.3) · dpct (1.5 → +50%) · up (1.05 → 5%) · loss
//          (0.85 → 15%) · times (2 → 翻倍 / twice) · ord (en 3rd) · by (a scale's stat names).
//   ?a|b   English plural: a when the value is 1.
// Pure data: no logic imports.

export interface Bi { readonly zh: string; readonly en: string }
const b = (zh: string, en: string): Bi => ({ zh, en });

/**
 * Engine constants the text quotes (not in any data table). tests/mirror-text.test.ts reads each one
 * back out of the engine source, so a change there fails the test instead of leaving stale words.
 */
export const K = {
  /** engine/world.ts statusSlot 'bleed': 3/s + 30% 近战, 3 s. */
  bleedDps: 3, bleedMelee: 0.3, bleedDur: 3,
  /** engine/world.ts dropOne: a gold shard is worth 4 月华. */
  goldShard: 4,
  /** engine/weapons.ts 酒葫芦: a crit burns for 3 s. */
  critBurnDur: 3,
} as const;

// ───────────────────────────────────────────── weapons (27)
export interface WeaponSay {
  /** The head line's measure: 「0.9 秒一剑」. */
  readonly unit: string;
  readonly say: Bi;
  /** What 神品 adds (rendered with tier-IV values); `num4`: IV only raises numbers the body already shows. */
  readonly say4: Bi;
  readonly num4?: boolean;
  /** Per-tier word lists: 神笔's creature by tier. */
  readonly words?: Readonly<Record<string, readonly [Bi, Bi, Bi, Bi]>>;
  /** Codex tier rows: [slot, label]; every `p` value that differs by tier must have one (tested). */
  readonly rows?: readonly (readonly [string, Bi])[];
  /** Exact-number detail lines (tap / codex), and the ones about the 神品 power. */
  readonly more?: readonly Bi[];
  readonly more4?: readonly Bi[];
}

export const WEAPON_SAY: Readonly<Record<string, WeaponSay>> = {
  qingfeng: {
    unit: '一剑',
    say: b('向前直刺一剑，一剑最多刺中 {pierce+1} 个敌人。', 'Thrusts straight ahead, hitting up to {pierce+1} enemies in a line.'),
    say4: b('暴击率再 +{critT4}%。', '+{critT4}% crit chance.'),
    rows: [['pierce+1', b('一剑刺中', 'Enemies per thrust')]],
  },
  longquan: {
    unit: '一轮',
    say: b('双剑连砍 {hits} 下。每砍中一个敌人攻速 +{stack}%（最多 +{stackMax}%），{stackDur} 秒没砍中就清零。',
      '{hits} quick slashes. Each enemy hit gives +{stack}% Attack speed (max +{stackMax}%), lost after {stackDur} s without a hit.'),
    say4: b('每 {spinEvery} 轮有一轮转身砍一整圈。', 'Every {spinEvery:ord} round spins into a full-circle slash.'),
    more: [b('每下砍前方 {deg}°', 'each slash covers {deg}° in front')],
  },
  yanyue: {
    unit: '一刀',
    say: b('大刀横扫{deg:arc}，扫到的敌人都受伤，还会被远远推开。', 'Sweeps {deg:arc}, hitting everything it catches and knocking it far back.'),
    say4: b('每砍 {bigEvery} 刀，最后一刀伤害翻倍，还甩出刀气飞向{waveLen:reach}。', 'Every {bigEvery:ord} swing hits twice as hard and flings a blade wave that flies {waveLen:reach}.'),
    more: [b('横扫 {deg}°', 'sweep {deg}°')],
    more4: [b('刀气飞 {waveLen}，穿过路上所有敌人', 'the blade wave flies {waveLen} through every enemy')],
  },
  hoe: {
    unit: '一下',
    say: b('向前锄一下。锄倒敌人时，有 {gold%} 几率多掉 {=1} 点月华（福缘越高越容易）。', 'Hoes the ground ahead. Kills have a {gold%} chance to drop {=1} extra moonlight (more with Luck).'),
    say4: b('锄倒的地方长出花，你踩到回 {flowerHeal} 点血，敌人踩到会受伤。', 'Kills grow flowers that heal you {flowerHeal} HP and hurt enemies who step on them.'),
    rows: [['gold%', b('多掉月华的几率', 'Extra moonlight chance')]],
    more: [b('锄前方 {deg}°', 'hits {deg}° in front')],
    more4: [b('花最多 {flowers} 朵；敌人踩到受 {flowerBase} 点伤害（受造物加成）', 'up to {flowers} flowers; an enemy takes {flowerBase} damage (scales with Craft)')],
  },
  pestle: {
    unit: '一下',
    say: b('朝敌人砸下一杵，震到{r:size}。每次砸中，有 {healChance*proc%} 几率给你回 {=1} 点血。', 'Slams down on an enemy, hitting {r:size}. Each slam that lands has a {healChance*proc%} chance to heal you {=1} HP.'),
    say4: b('每砸中一个敌人，给你 {=1} 点护盾（最多 {shieldMax} 点）。', 'Each enemy hit gives you {=1} shield (max {shieldMax}).'),
    more: [b('砸中半径 {r}', 'slam radius {r}')],
  },
  claw: {
    unit: '一轮',
    say: b('一轮连抓 {hits} 下，第 {bleedEvery} 下让敌人流血（最多叠 {bleedStacks} 层）。', 'Swipes {hits} times; the {bleedEvery:ord} swipe makes enemies bleed (up to {bleedStacks} stacks).'),
    say4: b('流血最多叠 {bleedStacks} 层。', 'Bleed stacks up to {bleedStacks}.'),
    num4: true,
    rows: [['bleedStacks', b('流血最多叠', 'Bleed stacks')]],
    more: [
      b('每下抓前方 {deg}°', 'each swipe covers {deg}° in front'),
      b('流血：每层每秒 {K.bleedDps} 点 + {K.bleedMelee%} 近战，持续 {K.bleedDur} 秒', 'bleed: {K.bleedDps} + {K.bleedMelee%} Melee a second per stack, for {K.bleedDur} s'),
    ],
  },
  drunkfist: {
    unit: '一拳',
    say: b('向前打出一拳，拳路会左右晃；每打中一个敌人，醉意 +{drunk*proc}。', 'Punches ahead in a swaying arc; each enemy hit adds {drunk*proc} Drunk.'),
    say4: b('打出暴击时，马上能再出一拳。', 'A crit lets you punch again right away.'),
    more: [b('拳打前方 {deg}°，左右晃 {sway}°', 'covers {deg}° in front, swaying {sway}°')],
  },
  dart: {
    unit: '一镖',
    say: b('甩出飞镖，打中后还会弹到旁边 {bounce} 个敌人身上。', 'Throws a dart that bounces to {bounce} more {bounce?enemy|enemies} after a hit.'),
    say4: b('能弹到 {bounce} 个敌人身上。', 'Bounces to {bounce} more enemies.'),
    num4: true,
    rows: [['bounce', b('弹射', 'Bounces')]],
  },
  coindart: {
    unit: '一镖',
    say: b('甩出铜钱镖。身上每攒 {per} 点月华，伤害 +{=1}（最多 +{coin}）。', 'Throws coin darts: +{=1} damage for every {per} moonlight you hold (max +{coin}).'),
    say4: b('打倒的敌人有 {goldT4%} 几率多掉 {=1} 点月华。', 'Kills have a {goldT4%} chance to drop {=1} extra moonlight.'),
    rows: [['coin', b('最多加伤害', 'Bonus damage cap')]],
  },
  sunbow: {
    unit: '一箭',
    say: b('射出一支长箭，一箭最多射中 {pierce+1} 个敌人。', 'Fires a long arrow that hits up to {pierce+1} enemies in a line.'),
    say4: b('暴击打倒敌人时，再补射一箭。', 'A crit kill looses a follow-up arrow.'),
    rows: [['pierce+1', b('一箭射中', 'Enemies per arrow')]],
  },
  repeater: {
    unit: '一轮',
    say: b('一轮连射 {bolts} 支弩箭，每支让敌人护甲 −{shred}（破甲）。', 'Fires a burst of {bolts} bolts; each lowers enemy armour by {shred} (Shred).'),
    say4: b('弩箭打倒敌人时，分成两支继续飞（各 {splitT4%} 伤害）。', 'On a kill the bolt splits in two ({splitT4%} damage each).'),
    more: [b('每支间隔 {gap} 秒', '{gap} s between bolts')],
  },
  rod: {
    unit: '一竿',
    say: b('甩竿钩住 {hooks} 个敌人往回拉；钩死的敌人有 {hookGold%} 几率多掉 {=1} 点月华。', 'Hooks {hooks} {hooks?enemy|enemies} and reels {hooks?it|them} in; kills have a {hookGold%} chance to drop {=1} extra moonlight.'),
    say4: b('一竿钩 {hooks} 个敌人。', 'Hooks {hooks} enemies at once.'),
    num4: true,
    rows: [['hooks', b('一竿钩住', 'Enemies per cast')]],
    more: [b('往回拉 {pull}', 'reels in {pull}')],
  },
  qingping: {
    unit: '一次',
    say: b('放出一把飞剑，最多刺中 {pierce+1} 个敌人，还会飞回来再打一次（{ret%} 伤害）。', 'Launches a flying sword that hits up to {pierce+1} enemies, then flies back to hit again ({ret%} damage).'),
    say4: b('飞剑第一次暴击时，一把分成 {splitT4} 把。', 'A sword splits into {splitT4} on its first crit.'),
    rows: [['ret%', b('回程伤害', 'Return damage')]],
    more: [b('一次放 {=1} 把；飞剑数每 +{=1}，多放 {=1} 把（多出的打 {F.swordExtra%}，不飞回）', '{=1} sword a launch; each Extra sword adds {=1} more ({F.swordExtra%} damage, no return)')],
  },
  casket: {
    unit: '碰一次',
    say: b('{blades} 把剑绕着你转，碰到敌人就砍；飞剑数越多，剑越多。', '{blades} swords circle you and cut whatever they touch; Extra swords add more.'),
    say4: b('每 {flareEvery} 秒剑圈猛地张大到{flareR:size}，撑 {flareDur} 秒。', 'Every {flareEvery} s the ring flares out to {flareR:size} for {flareDur} s.'),
    rows: [['blades', b('绕身的剑', 'Circling swords')]],
    more: [b('同一个敌人每 {cd} 秒最多被碰一次', 'each enemy is cut at most once every {cd} s')],
    more4: [b('张大到半径 {flareR}', 'flares to radius {flareR}')],
  },
  peach: {
    unit: '一次',
    say: b('放出会追着敌人飞的桃木剑，打鬼类敌人伤害 {ghost:dpct}；飞剑数越多，剑越多。', 'Launches homing peachwood swords; {ghost:dpct} damage to ghosts. Extra swords add more.'),
    say4: b('剑打中后留下一张桃符，{charmDelay} 秒后炸开（{charmPct%} 伤害）。', 'Hits leave a charm that bursts after {charmDelay} s ({charmPct%} damage).'),
    more: [b('鬼类敌人：{ghosts}', 'ghosts: {ghosts}')],
    more4: [b('桃符炸开半径 {charmR}', 'charm burst radius {charmR}')],
  },
  seven: {
    unit: '一轮',
    say: b('从天上落下 {n} 把剑，各砸{r:size}；飞剑数越多，落得越多。', 'Drops {n} swords from the sky, each hitting {r:size}; Extra swords add more.'),
    say4: b('最后一把剑晕住敌人 {stunT4} 秒。', 'The last sword stuns for {stunT4} s.'),
    rows: [['n', b('落下的剑', 'Swords')]],
    more: [b('每把砸中半径 {r}；多出的剑打 {F.swordExtra%}', 'each sword hits radius {r}; extra swords deal {F.swordExtra%}')],
  },
  thunder: {
    unit: '一道',
    say: b('雷劈中一个敌人，再跳到旁边 {jumps} 个敌人身上，每跳一次伤害少 {fall:loss}。', 'Lightning strikes an enemy, then jumps to {jumps} more nearby, losing {fall:loss} each jump.'),
    say4: b('每次打中有 {stunT4*proc%} 几率晕住敌人 {stunDur} 秒。', 'Each hit has a {stunT4*proc%} chance to stun for {stunDur} s.'),
    rows: [['jumps', b('再跳几个', 'Jumps')]],
  },
  fire: {
    unit: '一张',
    say: b('扔出火符，炸开{r:size}，让敌人燃烧 {burnDur} 秒（最多叠 {burnStacks} 层）。', 'Throws a fire charm that bursts over {r:size} and burns enemies for {burnDur} s (up to {burnStacks} stacks).'),
    say4: b('烧死的敌人会把火传到旁边的敌人身上。', 'Enemies that burn to death set a neighbour alight.'),
    rows: [['burnStacks', b('燃烧最多叠', 'Burn stacks')]],
    more: [
      b('炸开半径 {r}', 'burst radius {r}'),
      b('燃烧：每层每秒 {burn} 点 + {burnScale%} 法术', 'burn: {burn} + {burnScale%} Elemental a second per stack'),
    ],
  },
  gourd: {
    unit: '扔一次',
    say: b('酒葫芦溅湿{r:size}，敌人站不稳 {stagger} 秒；每溅到一个，醉意 +{drunk*proc}；暴击会点着敌人。', 'Splashes {r:size}: enemies stagger for {stagger} s, each one hit adds {drunk*proc} Drunk, and crits set them alight.'),
    say4: b('落地处留一滩火，烧 {puddleT4} 秒。', 'Leaves a fire puddle for {puddleT4} s.'),
    more: [
      b('溅射半径 {r}', 'splash radius {r}'),
      b('暴击点着：每秒 {critBurn} 点，烧 {K.critBurnDur} 秒', 'crit burn: {critBurn} a second for {K.critBurnDur} s'),
    ],
    more4: [b('火滩每秒 {puddleBurn} 点', 'the puddle burns {puddleBurn} a second')],
  },
  qin: {
    unit: '一圈',
    say: b('琴音向四周震开{range:size}；每 {every} 圈有一圈「共鸣」：伤害{resX:times}，敌人慢 {slow}%。', 'Sends a ring of sound over {range:size}; every {every:ord} ring resonates: {resX:times} the damage and a {slow}% slow.'),
    say4: b('每 {every} 圈就有一圈共鸣，共鸣时给你回 {healT4} 点血。', 'Resonates every {every:ord} ring and heals you {healT4} HP.'),
    rows: [['every', b('每几圈共鸣', 'Resonance every')]],
    more: [
      b('音波半径 {range}', 'ring radius {range}'),
      b('共鸣减速持续 {slowDur} 秒', 'the resonance slow lasts {slowDur} s'),
      b('打精英、首领伤害 {bigX:dpct}', '{bigX:dpct} damage to elites and bosses'),
    ],
  },
  flute: {
    unit: '一个音',
    say: b('吹出会追人的音符；每吹 {charmEvery} 个音，最后一个会迷惑小怪 {charmDur} 秒。', 'Plays homing notes; every {charmEvery:ord} note charms a small enemy for {charmDur} s.'),
    say4: b('每 {charmEvery} 个音就迷惑一次，一次 {charmDur} 秒。', 'Every {charmEvery:ord} note charms, for {charmDur} s.'),
    num4: true,
    rows: [['charmEvery', b('每几个音迷惑', 'Charm every')], ['charmDur', b('迷惑秒数', 'Charm seconds')]],
  },
  brush: {
    unit: '画一只',
    words: {
      beast: [b('墨雀', 'ink sparrow'), b('墨鲤', 'ink carp'), b('墨鹤', 'ink crane'), b('墨虎', 'ink tiger')],
      act: [b('啄', 'pecks'), b('冲撞', 'rams'), b('俯冲扑向', 'dives at'), b('扑咬', 'pounces on')],
    },
    say: b('画一只{beast}替你{act}敌人，能留 {life} 秒（占 {=1} 个墨宝名额）。', 'Paints an {beast} that {act} enemies for {life} s (uses {=1} ink summon slot).'),
    say4: b('墨虎每 {atk} 秒扑一次，还会把敌人引到自己身上。', 'The ink tiger pounces every {atk} s and draws enemies to itself.'),
    rows: [['atk', b('几秒出手一次', 'Seconds per attack')], ['r', b('出手范围', 'Attack radius')]],
    more: [b('{beast}每 {atk} 秒出手一次，范围 {r}', 'the {beast} attacks every {atk} s over radius {r}')],
    more4: [b('墨虎引怪 {taunt} 秒', 'the tiger taunts for {taunt} s')],
  },
  inkstone: {
    unit: '放一方',
    say: b('在脚下放一方砚台，{life} 秒里每 {atk} 秒吐一颗墨丸；它算一只墨宝。', 'Sets an inkstone at your feet that spits an ink blob every {atk} s for {life} s; it counts as an ink summon.'),
    say4: b('一次吐 {blobs} 颗，还会跟着你走。', 'Spits {blobs} blobs at a time and follows you.'),
    rows: [['blobs', b('一次吐几颗', 'Blobs per shot')]],
    more4: [b('跟着你走的速度 {followT4}', 'follows at speed {followT4}')],
  },
  crane: {
    unit: '扑一次',
    say: b('一只纸鹤一直陪着你，绕着你飞，看见敌人就俯冲下去（不占墨宝名额）。', 'A paper crane stays with you, circling and diving at enemies (it doesn\'t use an ink summon slot).'),
    say4: b('俯冲时炸开{burstT4:size}。', 'Its dives burst over {burstT4:size}.'),
    more: [b('绕身半径 {orbit}', 'circles at radius {orbit}')],
    more4: [b('炸开半径 {burstT4}', 'burst radius {burstT4}')],
  },
  gobowl: {
    unit: '落一子',
    say: b('在敌人扎堆的地方落下棋子，敌人一碰就炸，还会连着引爆旁边的棋子。', 'Drops go stones where enemies crowd; a stone blasts when touched and sets off stones nearby.'),
    say4: b('炸开之前，先把附近的敌人吸过来。', 'Each blast first pulls nearby enemies in.'),
    more: [
      b('炸开半径 {r}', 'blast radius {r}'),
      b('{chain} 以内的棋子跟着炸', 'stones within {chain} go off too'),
      b('精英、首领碰炸时伤害 {bigX:dpct}', '{bigX:dpct} damage when an elite or boss sets it off'),
    ],
    more4: [b('往里吸 {pullT4}', 'pulls {pullT4} inward')],
  },
  moonwheel: {
    unit: '飞一次',
    say: b('月轮飞出再飞回，穿过路上所有敌人；移速每 +{=1}%，伤害 +{=1}%（最多 +{speedDmg}%）。', 'A moon disc flies out and back through every enemy in its path; +{=1}% damage per {=1}% Move speed (max +{speedDmg}%).'),
    say4: b('一次扔出 {discs} 个，朝相反的方向飞。', 'Throws {discs} discs in opposite directions.'),
    rows: [['discs', b('一次扔几个', 'Discs')]],
  },
  moonmirror: {
    unit: '一道光',
    say: b('射出一道月光，瞬间穿过一条直线上的所有敌人；闪避后 {dodgeWin} 秒内每次多射一道。', 'Fires an instant moonbeam through every enemy in a line; for {dodgeWin} s after a dodge, each shot adds another beam.'),
    say4: b('一次射出 {fork} 道光，两边的各偏 {forkDeg}°。', 'Fires {fork} beams at once, the outer two {forkDeg}° apart.'),
    rows: [['fork', b('光束几道', 'Beams')]],
  },
};

// ───────────────────────────────────────────── items (75): stats-only items need no line
export interface ItemSay { readonly say?: Bi; readonly more?: readonly Bi[] }

export const ITEM_SAY: Readonly<Record<string, ItemSay>> = {
  drumroll: { say: b('每重开始后的前 {f0.when.below} 秒，攻速 +{f0.stats.aspd}%。', 'For the first {f0.when.below} s of every wave: +{f0.stats.aspd}% Attack speed.') },
  gall: { say: b('每打完一重，气血上限 +{f0.v}。', '+{f0.v} max HP every time you clear a wave.') },
  backwater: { say: b('气血低于 {f0.when.v%} 时：伤害 +{f0.stats.dmg}%，攻速 +{f0.stats.aspd}%。', 'Below {f0.when.v%} HP: +{f0.stats.dmg}% Damage, +{f0.stats.aspd}% Attack speed.') },
  atease: { say: b('站着不动 {f0.when.s} 秒后：攻速 +{f0.stats.aspd}%，护甲 +{f0.stats.armor}。', 'After standing still for {f0.when.s} s: +{f0.stats.aspd}% Attack speed, +{f0.stats.armor} Armour.') },
  versatile: { say: b('你的兵器里每有一种类别：伤害 +{f0.k}%，攻速 +{f1.k}%。', 'For each different weapon class you carry: +{f0.k}% Damage, +{f1.k}% Attack speed.') },
  chasewind: { say: b('移速每高 {f0.per}%，伤害 +{f0.k}%（最多 +{f0.max}%）。', '+{f0.k}% Damage for every {f0.per}% Move speed (max +{f0.max}%).') },
  ironbone: { say: b('每点护甲，伤害 +{f0.k}%（最多 +{f0.max}%）。', '+{f0.k}% Damage per point of Armour (max +{f0.max}%).') },
  physician: { say: b('把回血的 {f0.k%} 加到近战、远程、法术、造物上（每样最多 +{f0.max}）。', 'Adds {f0.k%} of your HP Regen to Melee, Ranged, Elemental and Craft (max +{f0.max} each).') },
  lots: { say: b('每次商店多 {f0.n} 次免费刷新。', '+{f0.n} free {f0.n?reroll|rerolls} in every shop.') },
  pawn: { say: b('卖兵器能拿回现价的 {f0.frac%}（平常是 {F.sellFrac%}）。', 'Weapons sell for {f0.frac%} of their price (normally {F.sellFrac%}).') },
  luckycat: { say: b('打倒敌人有 {f0.p%} 几率掉一块金月华，值 {K.goldShard} 点（福缘越高越容易）。', 'Kills have a {f0.p%} chance to drop gold moonlight worth {K.goldShard} (more with Luck).') },
  miser: { say: b('身上每攒 {f0.per} 点月华，伤害 +{f0.k}%（最多 +{f0.max}%）；商店价格 +{f1.pct}%。', '+{f0.k}% Damage per {f0.per} moonlight you hold (max +{f0.max}%); shop prices +{f1.pct}%.') },
  abacus: { say: b('每重结束，手里每剩 {f0.per} 点月华，再多给 {=1} 点（每个算盘最多 +{f0.max}）。', 'At wave end, +{=1} moonlight for every {f0.per} you haven\'t spent (max +{f0.max} per abacus).') },
  duanyan: { say: b('墨宝多留 {f0.pct}% 的时间。', 'Ink summons last {f0.pct}% longer.') },
  splash: {
    say: b('墨宝消失时炸开：{f0.base} 点伤害（受{f0.scale:by}加成），敌人慢 {f0.slow}%，持续 {f0.dur} 秒。', 'When an ink summon ends it bursts: {f0.base} damage (scales with {f0.scale:by}) and a {f0.slow}% slow for {f0.dur} s.'),
    more: [b('炸开半径 {f0.r}', 'burst radius {f0.r}')],
  },
  inkbamboo: {
    say: b('每 {f0.every} 秒脚下长出一棵墨竹，留 {f0.life} 秒，朝敌人射竹叶（受{f0.scale:by}加成）。', 'Every {f0.every} s an ink bamboo sprouts at your feet for {f0.life} s, shooting leaves at enemies (scales with {f0.scale:by}).'),
    more: [b('竹叶 {f0.base} 点 + {f0.scale.spirit%} 造物，每 {f0.cd} 秒一片，射程 {f0.range}', 'leaves: {f0.base} + {f0.scale.spirit%} Craft, every {f0.cd} s, range {f0.range}')],
  },
  inkcrane: {
    say: b('一只墨鹤一直陪着你，每 {f0.cd} 秒啄一下敌人（受{f0.scale:by}加成），还会把附近的月华叼回来。', 'An ink crane stays with you, pecking an enemy every {f0.cd} s (scales with {f0.scale:by}) and fetching nearby moonlight.'),
    more: [b('一啄 {f0.base} 点 + {f0.scale.spirit%} 造物；叼回 {f0.fetch} 以内的月华', 'pecks for {f0.base} + {f0.scale.spirit%} Craft; fetches moonlight within {f0.fetch}')],
  },
  inkpool: { say: b('场上每有一只墨宝，护甲 +{f0.k}（最多 +{f0.max}）。', '+{f0.k} Armour for each ink summon out (max +{f0.max}).') },
  dotting: { say: b('墨宝也能暴击（用你的暴击率，暴击打 {f0.x} 倍），攻速 +{f0.aspd}%。', 'Ink summons can crit (with your crit chance, ×{f0.x}) and get +{f0.aspd}% Attack speed.') },
  tassel: { say: b('飞剑类兵器：攻速 +{f0.stats.aspd}%，射程 +{f0.stats.range}。', 'Flying-sword weapons: +{f0.stats.aspd}% Attack speed, +{f0.stats.range} Range.') },
  swordqi: { say: b('飞剑多穿过 {f0.pierce} 个敌人，飞过的路上留下剑气（{f0.pct}% 伤害）。', 'Flying swords pierce {f0.pierce} more and leave a sword trail ({f0.pct}% damage).') },
  swordheart: { say: b('空中有 {f0.when.n} 把以上飞剑时：飞剑类兵器暴击率 +{f0.stats.crit}%，暴击倍数 +{f0.stats.critDmg/100}。', 'With {f0.when.n}+ swords in the air: flying-sword weapons get +{f0.stats.crit}% crit chance and +{f0.stats.critDmg/100} crit multiplier.') },
  washpool: { say: b('每把飞回来的剑给你回 {f0.v} 点血（每秒最多 {f0.capPerSec} 点）。', 'Each returning sword heals you {f0.v} HP (max {f0.capPerSec} a second).') },
  swordtomb: {
    say: b('一重里飞剑每打倒 {f0.p.per} 个敌人，多一把残剑绕着你转，直到这一重结束（最多 {f0.p.max} 把）。', 'Every {f0.p.per} flying-sword kills in a wave adds a broken sword that circles you until the wave ends (max {f0.p.max}).'),
    more: [b('残剑 {f0.p.base} 点 + {f0.p.ranged%} 远程', 'broken swords deal {f0.p.base} + {f0.p.ranged%} Ranged')],
  },
  yellowpaper: { say: b('燃烧多叠 {f0.stacks} 层，多烧 {f0.dur} 秒。', 'Burns stack {f0.stacks} higher and last {f0.dur} s longer.') },
  fivethunder: { say: b('雷多跳 {f0.chains} 个；雷打死的敌人会点着身边敌人；每道雷 {f0.stun%} 几率晕住 {f0.stunDur} 秒。', 'Lightning jumps to {f0.chains} more; lightning kills set nearby enemies alight; each strike has a {f0.stun%} chance to stun {f0.stunDur} s.') },
  lingering: { say: b('乐器每打中一次，{f0.delay} 秒后再响一次（{f0.pct}% 伤害）。', 'Music hits echo {f0.delay} s later for {f0.pct}% damage.') },
  boya: {
    say: b('迷惑几率变成 {f0.x} 倍；被迷惑的敌人伤害 +{f0.dmgPct}%，迷惑结束时炸开（受{f0.scale:by}加成）。', 'Charm chances ×{f0.x}; charmed enemies deal +{f0.dmgPct}% and burst when the charm ends (scales with {f0.scale:by}).'),
    more: [b('炸开 {f0.base} 点 + {f0.scale.elem%} 法术', 'the burst deals {f0.base} + {f0.scale.elem%} Elemental')],
  },
  dukang: { say: b('每次暴击醉意 +{f0.v}（出手快的兵器少一些）；不带酒类兵器也有醉意条。', 'Each crit adds {f0.v} Drunk (less for fast weapons); you get the Drunk meter even without a wine weapon.') },
  nightcup: { say: b('每次暴击回 {f0.v} 点血（每秒最多 {f0.capPerSec} 点）。', 'Each crit heals {f0.v} HP (max {f0.capPerSec} a second).') },
  dragblade: { say: b('重器每砍 {f0.n} 下，最后一下伤害{f0.x:times}，击退 +{f0.knock}。', 'Every {f0.n:ord} Heavy swing hits {f0.x:times} as hard, with +{f0.knock} knockback.') },
  thorns: {
    say: b('挨打时，反打对方 {f0.base} 点伤害（受{f0.scale:by}加成）。', 'When hit, deals {f0.base} damage back to the attacker (scales with {f0.scale:by}).'),
    more: [b('反伤 {f0.base} 点 + {f0.scale.armor%} 护甲', 'deals {f0.base} + {f0.scale.armor%} Armour back')],
  },
  goldenbell: {
    say: b('每重开头挡掉 {f0.n} 次攻击；贴身打你的敌人会被反伤（受护甲加成）。', 'Blocks the first {f0.n?hit|hits} of every wave; melee attackers are hurt back (scales with Armour).'),
    more: [b('反伤：{f1.scale.armor%} 护甲，加上它打你那一下的 {f1.dealtPct}%', 'hurts back for {f1.scale.armor%} Armour plus {f1.dealtPct}% of its hit')],
  },
  gomanual: { say: b('棋子炸开范围 +{f0.stats.area}%。', 'Stone blasts +{f0.stats.area}% area.') },
  capture: {
    say: b('被 {f0.p.n} 颗棋子围住的敌人会挨一记「提子」：{f0.p.x} 倍棋子伤害，无视护甲（首领不会）。', 'An enemy ringed by {f0.p.n} stones is captured: {f0.p.x}× stone damage, ignoring armour (not bosses).'),
    more: [b('围住：身边 {f0.p.r} 以内有 {f0.p.n} 颗以上棋子', 'surrounded: {f0.p.n}+ stones within {f0.p.r}')],
  },
  moonsoul: {
    say: b('每闪避一次，射出 {f0.n} 枚会追人的月魄（受{f0.scale:by}加成）。', 'Each dodge fires {f0.n} homing moon shards (scales with {f0.scale:by}).'),
    more: [b('每枚 {f0.base} 点 + {f0.scale.elem%} 法术', 'each deals {f0.base} + {f0.scale.elem%} Elemental')],
  },
  osmanthus: { say: b('闪避上限 +{f0.v}%；闪避后 {f1.dur} 秒内伤害 +{f1.stats.dmg}%。', 'Dodge cap +{f0.v}%; +{f1.stats.dmg}% Damage for {f1.dur} s after a dodge.') },
  lingbo: {
    say: b('走动时留下脚印，每 {f0.p.tick} 秒伤到踩着的敌人；移速越高越痛。', 'Moving leaves footprints that hurt enemies on them every {f0.p.tick} s; the faster you move, the harder.'),
    more: [b('{f0.p.base} 点；移速每 +{=10}%，再 +{f0.p.per10}', '{f0.p.base} damage, +{f0.p.per10} per {=10}% Move speed')],
  },
  cushion: { say: b('站着不动 {f0.when.s} 秒后，回血 +{f0.stats.regen}%（带几个就加几份）。', 'After standing still for {f0.when.s} s: +{f0.stats.regen}% HP Regen (each copy adds more).') },
  // m8 (PLAN D3, compacted to the 42-character card; tier words as the glossary's tier2..4): the floor; copies and the grey stackers in the detail
  burnboats: {
    say: b('不能再刷新、锁货；商店只出灵品、仙品、神品的道具和兵器。', 'No more rerolls or locks; the shop only offers Spirit, Immortal and Divine items and weapons.'),
    more: [b('合铸用的兵器副本不受此限', 'weapon copies for merging are exempt'), b('{@cinnabar}、{@whetstone}这类凡品从此买不到', 'Common stackers such as {@cinnabar} and {@whetstone} no longer appear')],
  },
  yanwang: { say: b('每重一次：挨了致命一击不倒，剩 {=1} 点血。', 'Once a wave, a lethal hit leaves you at {=1} HP.') },
  delusion: { say: b('每重多来 {f0.budgetPct}% 的敌人；每只掉的月华 −{-f0.moonPct}%。', '{f0.budgetPct}% more enemies each wave; −{-f0.moonPct}% moonlight from each.') },
  innerdemon: {
    say: b('每重来个心魔（你 {f0.pct}% 的血和伤害）。', 'Each wave your inner demon appears ({f0.pct}% of your HP and damage).'),
    more: [b('打倒它有 {f0.crate}% 的机会掉一个镜奁', 'beating it has a {f0.crate}% chance to drop a casket')],
  },
  crackedmirror: { say: b('商店多 {f0.n} 个货位；仙品几率 +{f1.t3}%，神品几率 +{f1.t4}%。', '+{f0.n} shop {f0.n?slot|slots}; Immortal odds +{f1.t3}%, Divine odds +{f1.t4}%.') },
  wanjian: { say: b('有 {f0.p.min} 把以上飞剑时，每 {f0.p.every} 秒全部扑进怪堆一次（{f0.p.pct}% 伤害）。', 'With {f0.p.min}+ swords, every {f0.p.every} s they all dive through the thickest crowd ({f0.p.pct}% damage).') },
  inkdragon: {
    say: b('总有一只墨宝变成墨龙：伤害 {f0.p.x} 倍，会飞，能穿过敌人。墨龙没了，{f0.p.every} 秒后再变一只。', 'One ink summon is always an ink dragon: {f0.p.x}× damage, flies and passes through enemies. If it\'s gone, another turns in {f0.p.every} s.'),
    more: [b('墨龙一口咬半径 {f0.p.r}', 'the dragon bites radius {f0.p.r}')],
  },
  dugu: { say: b('只带 {=1} 把兵器时：套装按 {f0.p.count} 把算，伤害变成 {f0.p.x} 倍，攻速 +{f0.p.aspd}%。', 'With exactly {=1} weapon: its set counts as {f0.p.count}, it deals {f0.p.x}× damage and gets +{f0.p.aspd}% Attack speed.') },
  samadhi: {
    say: b('你身边{f0.p.r:size}里，燃烧永远不灭；燃烧层数上限{f0.p.stackX:times}。', 'Burns in {f0.p.r:size} around you never go out; the burn stack limit is {f0.p.stackX:times} as high.'),
    more: [b('范围半径 {f0.p.r}', 'radius {f0.p.r}')],
  },
  treasurebowl: { say: b('每重结束，手里的月华多给 {f0.pct}% 利息（最多 {f0.max}）；每次商店多 {f1.n} 次免费刷新。', 'At wave end, +{f0.pct}% interest on moonlight held (max {f0.max}); +{f1.n} free {f1.n?reroll|rerolls} every shop.') },
  penglai: { say: b('一局一次：倒下时带着 {f0.hpPct%} 气血站起来，清掉敌人子弹。', 'Once a run, when you go down you get back up with {f0.hpPct%} HP and every enemy shot is cleared.') },
  ambush: { say: b('乐器或符箓每出手 {f0.p.every} 次，你其他的乐器和符箓就一起出手一次（{f0.p.pct}% 伤害）。', 'Every {f0.p.every:ord} Music or Talisman attack fires all your other Music and Talisman weapons at {f0.p.pct}%.') },
  needle: { say: b('不会被击退；每点护甲伤害 +{f1.k}%（和{@ironbone}加起来最多 +{f1.max}%）。', 'Immune to knockback; +{f1.k}% Damage per point of Armour (with {@ironbone}, max +{f1.max}%).') },
  jiangjinjiu: { say: b('醉意上限变成 {f0.p.cap}；醉意到 {f0.p.autoCrit} 以上每下都暴击；醉意消得{f0.p.drain:faster}。', 'Drunk cap becomes {f0.p.cap}; at {f0.p.autoCrit}+ Drunk every hit crits; Drunk drains {f0.p.drain:times} as fast.') },
  watermoon: { say: b('每件兵器出手时，还会朝身后打出一次镜像（{f0.p.pct}% 伤害）。', 'Every weapon also attacks behind you as a mirror image ({f0.p.pct}% damage).') },
  // 9.9 镜宝 (the stats line is generated; the relic's own rules)
  wangchen: { more: [b('墨宝也能暴击，暴击打 {inkCrit} 倍。', 'Ink summons can crit too, at ×{inkCrit}.')] },
  longyuan: { say: b('所有兵器攻击距离 +{reachPct}%。', '+{reachPct}% reach on every weapon.') },
  // ── m8:items ── the 26 new items' say / more (items.md §2, §R.4; ITEMS)
  huadi: {
    say: b('你走路最快只有常人的 {f0.x%}，移速再高也不会更快。', 'You walk at most {f0.x%} of the normal pace, however high your Move speed.'),
    more: [b('常人每秒走 {F.baseSpeed}；冲刺和跳跃不算走路，不受限', 'the normal pace is {F.baseSpeed} a second; dashes and leaps are not walking'), b('减速照样叠在上限之后', 'slows still apply on top of the limit')],
  },
  chulei: { say: b('你带着的每个流派凑套装时都多算 {f0.n} 件兵器。', 'Each weapon class you carry counts {f0.n} extra piece toward its set.') },
  huobi: {
    say: b('在一家店里每刷新一次（免费的也算），这家店的东西都便宜 {f0.pct}%（最多便宜 {f0.max}%）。', 'Each reroll in a shop (free ones too) takes {f0.pct}% off every price there (max {f0.max}% off).'),
    more: [b('带着{@burnboats}时商店不会再出它', 'not offered while you hold {@burnboats}')],
  },
  qihuo: { say: b('商店多 {f1.n} 个货位，但从此不再出兵器（新的、同款的都没有）。', '+{f1.n} shop slot, but the shop never offers weapons again (no new ones, no copies).') },
  dianshi: {
    say: b('每家店 {f0.n} 次：付同款兵器现价的 {f0.x%}，不用同款就把一件兵器升一品（神品除外）。', '{f0.n} {f0.n?use|uses} per shop: pay {f0.x%} of a copy\'s price to raise a weapon a tier without the copy (not Divine).'),
    more: [b('在商店的兵器页点一把兵器，按「点金」', 'in the shop\'s weapon tab, pick a weapon and press Gild')],
  },
  zhancao: { say: b('剑类兵器打中气血低于 {f0.below%} 的敌人时伤害 ×{f0.x}（精英和首领 ×{f0.bigX}）。', 'Sword weapons deal ×{f0.x} to enemies below {f0.below%} HP (×{f0.bigX} to elites and bosses).') },
  taishan: { say: b('重器伤害 +{f0.stats.dmg}%；重器不再击退敌人，改为定住它 {f1.dur} 秒（精英减半，首领不会）。', '+{f0.stats.dmg}% Heavy damage; Heavy weapons pin enemies for {f1.dur} s instead of knocking them back (half on elites, never bosses).') },
  yiqi: { say: b('拳类兵器每打中一下，攻速 +{f0.stats.aspd}%，最多叠 {f0.stack} 层；{f0.dur} 秒没打中就散了。', 'Each Fist hit: +{f0.stats.aspd}% Attack speed, stacking {f0.stack} times; it fades after {f0.dur} s without a Fist hit.') },
  jianxue: { say: b('暗器打中时敌人流血：每层每秒掉这一下伤害的 {f0.ofHit}%，持续 {f0.dur} 秒，最多 {f0.cap} 层。', 'Hidden weapon hits cause Bleed: each stack deals {f0.ofHit}% of that hit every second for {f0.dur} s (max {f0.cap} stacks).') },
  baibu: { say: b('弓弩伤害随距离变高：敌人离你每远 {f0.per}，伤害 +{f0.pct}%（最多 +{f0.max}%）。', 'Bow damage grows with distance: +{f0.pct}% for every {f0.per} between you and the target (max +{f0.max}%).') },
  chuge: { say: b('乐器打中的敌人易伤：{f0.dur} 秒内受到的所有伤害 +{f0.v}%（首领 +{f0.bossV}%）。', 'Music hits make the target Vulnerable: +{f0.v}% damage taken from everything for {f0.dur} s (+{f0.bossV}% for bosses).') },
  liaoyuan: {
    say: b('燃烧的敌人倒下时，火会跳到身边最近的 {f0.n} 个敌人身上（烧 {f0.dur} 秒）。', 'When a burning enemy dies, its fire jumps to the {f0.n} nearest enemies ({f0.dur} s).'),
    more: [b('跳到 {f0.r} 以内；一秒最多跳 {f0.perSec} 次', 'within {f0.r}; at most {f0.perSec} jumps a second')],
  },
  lianhuan: {
    say: b('打倒的敌人会炸开，炸伤身边的敌人（它最大气血的 {f0.pct}%）；炸死的也会接着炸。', 'Enemies you kill burst, hurting those nearby for {f0.pct}% of the victim\'s max HP; burst kills burst too.'),
    more: [
      b('半径 {f0.r}；一秒最多炸 {f0.perSec} 次；炸伤不吃伤害加成，不会暴击', 'radius {f0.r}; at most {f0.perSec} bursts a second; bursts ignore your Damage bonus and never crit'),
      b('首领每秒最多被炸 {f0.bossPerSec} 次，每次最多掉它 {f0.bossPct}% 的气血', 'a boss is caught by at most {f0.bossPerSec} burst a second, losing at most {f0.bossPct}% of its HP'),
    ],
  },
  xianzhi: {
    say: b('闪避后 {f0.dur} 秒内，每件兵器下一击必定暴击，伤害再 +{f0.x:up}（每 {f0.cd} 秒一次）。', 'For {f0.dur} s after a dodge, each weapon\'s next attack is a sure crit with +{f0.x:up} damage (at most once every {f0.cd} s).'),
    more: [b('墨宝和棋子不算', 'ink summons and go stones are not primed')],
  },
  daoge: {
    say: b('兵器打中有 {f0.p}% 几率让普通敌人倒戈，替你打 {f0.dur} 秒；时间到它就倒下。', 'Weapon hits have a {f0.p}% chance to turn an ordinary enemy to your side for {f0.dur} s; then it falls.'),
    more: [b('出手快的兵器几率低些，福缘越高越容易；同时最多 {f0.cap} 个', 'lower for fast weapons, higher with Luck; at most {f0.cap} at once')],
  },
  jibai: {
    say: b('墨类兵器和墨宝伤害 +{f0.stats.dmg}%', 'Ink weapons and ink summons deal +{f0.stats.dmg}% damage'),
    more: [b('墨宝少了，每只更金贵；{@inkdragon}的那条龙分量更重', 'fewer summons, each one counts more; the dragon of {@inkdragon} is a bigger share')],
  },
  houji: {
    say: b('棋子在地上每多待 {f0.p.per} 秒，炸开时伤害 +{f0.p.pct}%（最多 +{f0.p.max}%）', 'A stone\'s blast gains +{f0.p.pct}% for every {f0.p.per} s it waited on the board (max +{f0.p.max}%)'),
    more: [b('提子按围住它的棋子里最老的那颗算', 'a capture counts the oldest stone around it')],
  },
  zuiwo: {
    say: b('醉意每 {f0.per} 点，受到的伤害 −{f0.pct}%（最多 −{f0.max}%）', '−{f0.pct}% damage taken for every {f0.per} Drunk (max −{f0.max}%)'),
    more: [b('要有醉意条才有用：酒类兵器、{@dukang}或{@poet}', 'needs the Drunk meter: a Wine weapon, {@dukang} or the {@poet}'), b('持续伤害也一样减', 'damage over time is reduced too')],
  },
  pengyue: {
    say: b('身边地上每有 {f0.per} 点月华，伤害 +{f0.k}%（最多 +{f0.max}%）', '+{f0.k}% Damage for every {f0.per} moonlight on the ground near you (max +{f0.max}%)'),
    more: [
      b('算拾取范围外 {f0.r} 以内、还没飞向你的月华', 'counts moonlight within {f0.r} beyond your pickup range that is not yet flying to you'),
      b('没捡的月华这一重结束照常存进蓄月', 'what you leave still goes to your store at the wave\'s end'),
    ],
  },
  rulian: {
    say: b('飞向你的月华会割伤一路上的敌人，越大颗越痛', 'Moonlight flying to you cuts every enemy in its way; bigger pieces cut deeper'),
    more: [
      b('每颗割 {f0.base} 点，受{f0.scale:by}加成，会暴击；每个敌人只割一次', 'each piece cuts for {f0.base}, scaling with {f0.scale:by}, and can crit; once per enemy'),
      b('每点月华多割 {f0.perWorth}%，最多 ×{f0.maxX}（{@moonFull}）', 'each point of worth cuts {f0.perWorth}% deeper, up to ×{f0.maxX} ({@moonFull})'),
    ],
  },
  sanjin: {
    say: b('挨打时手里 {f0.pct}% 的月华（最多 {f0.max}）撒在远处，这重没捡回就没了', 'When hit, {f0.pct}% of the moonlight in hand (max {f0.max}) scatters away; what you don\'t take back this wave is lost'),
    more: [
      b('落在拾取范围外，{F.itemScatter.hold} 秒内捡不回来；捡回来的不再给经验', 'it lands beyond your pickup range and can\'t be taken for {F.itemScatter.hold} s; taken back it gives no XP'),
      b('挡下、闪开的攻击和持续伤害都不会撒', 'blocked or dodged blows and damage over time never spill it'),
    ],
  },
  zhenjiu: { say: b('每重开始时只有 {f0.v}% 的气血', 'Every wave starts at {f0.v}% HP') },
  mouhu: {
    say: b('精英多 {f0.eliteAffix} 个镜印；打倒精英月华 +{f0.eliteMoonPct}%', 'Elites carry {f0.eliteAffix} more mirror mark; each one you beat gives +{f0.eliteMoonPct}% moonlight'),
    more: [b('每个精英最多 {F.eliteAffixMax} 个镜印', 'an elite carries at most {F.eliteAffixMax} marks')],
  },
  jingru: { say: b('站着不动 {f0.when.s} 秒，伤害 +{f0.stats.dmg}%；站满 {f1.when.s} 秒，再 +{f1.stats.dmg}%；一走动就没了', 'Stand still for {f0.when.s} s: +{f0.stats.dmg}% Damage; for {f1.when.s} s: another +{f1.stats.dmg}%. Moving ends it') },
  dongru: { say: b('站定 {f0.after} 秒以上再起步：{f0.dur} 秒内攻速 +{f0.stats.aspd}%，闪避 +{f0.stats.dodge}%', 'Start moving after standing still for {f0.after} s or more: +{f0.stats.aspd}% Attack speed and +{f0.stats.dodge}% Dodge for {f0.dur} s') },
  duanbing: {
    say: b('身边每有一个敌人，护甲 +{f0.k}、伤害 +{f1.k}%（最多 +{f0.max} 和 +{f1.max}%）', 'Each enemy close to you: +{f0.k} Armour and +{f1.k}% Damage (max +{f0.max} and +{f1.max}%)'),
    more: [b('「身边」是 {f0.r} 以内', '"close" means within {f0.r}')],
  },
  // ── end m8:items
};

// ───────────────────────────────────────────── 镜技 (13) and ☆ 别传 (13)
export interface SkillSay { readonly gist: Bi; readonly say: Bi; readonly more?: readonly Bi[] }

export const SKILL_SAY: Readonly<Record<string, SkillSay>> = {
  yizi: {
    gist: b('在敌人最多的地方写个大「镇」字，砸伤一片；字留 {zone} 秒，让里面的敌人变慢、多受伤。', 'Brushes a giant glyph where enemies crowd: it hits them all, then for {zone} s slows them and makes them take more damage.'),
    say: b('在敌人最多的地方写个大「镇」字，砸出 {base} 点伤害（按你兵器加成里最高的一项算）。字在地上留 {zone} 秒，里面的敌人慢 {slow}%，多受 {amp}% 伤害。',
      'Writes a giant \'Hold\' glyph where enemies crowd: {base} damage (scales with your highest of Melee, Ranged, Elemental and Craft). It stays {zone} s: enemies inside are {slow}% slower and take {amp}% more damage.'),
    more: [b('半径 {r}；施放距离 {reach}', 'radius {r}; cast range {reach}'), b('加成：近战、远程、法术、造物里最高那项的 {k%}', 'bonus: {k%} of your highest of Melee, Ranged, Elemental and Craft')],
  },
  manyuan: {
    gist: b('脚下种一片花圃：花瓣自己打敌人、拖慢它们；站在里面会回血。', 'Plants a flowerbed at your feet: petals hit and slow enemies, and you heal while inside.'),
    say: b('脚下种一片花圃，开 {life} 秒（最多 {max} 片）：花瓣每 {tick} 秒打圃里 {n} 个敌人（受造物、回血加成），敌人慢 {slow}%；你站在里面每秒回 {hps} 点血。',
      'Plants a flowerbed at your feet for {life} s (max {max}): every {tick} s petals hit {n} enemies inside (scales with Craft and HP Regen), enemies are {slow}% slower, and you heal {hps} HP a second inside.'),
    more: [b('半径 {r}', 'radius {r}'), b('花瓣 {base} 点 + {kSpirit%} 造物 + {kRegen%} 回血', 'petals: {base} + {kSpirit%} Craft + {kRegen%} HP Regen')],
  },
  yiwang: {
    gist: b('撒网把一群敌人拉到一起定住；网里的敌人多受伤，打倒还掉 {moonX} 倍月华。', 'A net drags a crowd together and pins it; netted enemies take more damage and drop {moonX}× moonlight.'),
    say: b('往敌人扎堆处撒网，把网里的敌人拖到中间定住 {root} 秒（精英 {rootElite} 秒）；之后 {ampDur} 秒它们多受 {amp}% 伤害，打倒掉 {moonX} 倍月华。附近的月华也会飞过来。',
      'Throws a net where enemies crowd: they\'re dragged to the middle and held {root} s (elites {rootElite} s). For {ampDur} s they take {amp}% more damage and drop {moonX}× moonlight. Loose moonlight nearby flies to you.'),
    more: [b('网半径 {r}；吸月华范围 {attract}', 'net radius {r}; pulls moonlight within {attract}'), b('首领不会被拖、被定，但也会多受伤', 'bosses aren\'t dragged or held, but still take more damage')],
  },
  guangling: {
    gist: b('弹 {dur} 秒琴：每一拍震伤、拖慢身边的敌人，小怪还可能被迷惑，帮你打。', 'Plays for {dur} s: every beat hurts and slows enemies around you, and small ones may switch sides.'),
    say: b('弹琴 {dur} 秒：每 {beat} 秒一拍，震伤身边的敌人（受法术加成）并让它们慢 {slow}%；小怪每秒有 {charm%} 几率被迷惑 {charmDur} 秒（福缘越高越容易）。',
      'Plays for {dur} s: every {beat} s a beat hits enemies around you (scales with Elemental) and slows them {slow}%; each second small enemies have a {charm%} chance to switch sides for {charmDur} s (more with Luck).'),
    more: [b('半径 {r}；每拍 {base} 点 + {k%} 法术', 'radius {r}; each beat {base} + {k%} Elemental'), b('弹琴时移速是平常的 {move%}；首领只慢 {slowBoss}%', 'you move at {move%} speed while playing; bosses are slowed only {slowBoss}%')],
  },
  yijian: {
    gist: b('往前冲一段，冲的时候打不着你，所有飞剑跟着一路砍过去。', 'Dashes forward, untouchable for a moment, with every sword slashing along the path.'),
    say: b('往前冲一段，冲的时候 {iframe} 秒打不着你，所有飞剑跟着一路砍过去（{streak%} 伤害）。之后 {spinDur} 秒绕身的剑转得飞快。冲刺中打倒敌人，冷却少 {refund} 秒。',
      'Dashes forward, untouchable for {iframe} s, with every sword slashing along the path ({streak%} damage). Then orbiting swords spin fast for {spinDur} s. A kill during the dash takes {refund} s off the cooldown.'),
    more: [b('冲刺距离 {len}；之后绕身剑打 {spin%}', 'dash length {len}; the fast-spinning swords deal {spin%}'), b('剑幕：冲完之后 {guardDur} 秒内，护甲 +{guard}', 'Sword Screen: for {guardDur} s after the dash, +{guard} Armour')],
  },
  jiji: {
    gist: b('钉下一道符变成旋涡，把敌人吸进来，再不停落雷劈它们。', 'A pinned talisman becomes a vortex that pulls enemies in while lightning strikes them.'),
    say: b('钉下一道符，化成旋涡 {dur} 秒把敌人吸进来（精英只吸 {pullElite%}，首领不吸）；每 {tick} 秒落雷劈 {n} 个敌人（受法术加成），还会点着它们。',
      'Pins a talisman that becomes a vortex for {dur} s, pulling enemies in (elites {pullElite%}, not bosses); every {tick} s lightning strikes {n} enemies (scales with Elemental) and sets them alight.'),
    more: [b('半径 {r}；每道雷 {base} 点 + {k%} 法术', 'radius {r}; each bolt {base} + {k%} Elemental')],
  },
  dianhua: {
    gist: b('画轴一扫，把最多 {n} 个小怪变成墨友帮你打 {dur} 秒；精英和首领挨一记重的。', 'A sweeping scroll turns up to {n} small enemies into ink allies for {dur} s; elites and bosses take a heavy hit.'),
    say: b('画轴向前一扫：最多 {n} 个小怪变成你的墨友，帮你打 {dur} 秒（受造物加成）；精英和首领改为挨一记重的（{eliteBase} 点，受造物加成）。',
      'Sweeps a scroll ahead: up to {n} small enemies become your ink allies for {dur} s (scales with Craft); elites and bosses take a heavy hit instead ({eliteBase} damage, scales with Craft).'),
    more: [b('扫前方 {deg}°，距离 {r}', 'sweeps {deg}° in front, reach {r}'), b('墨友伤害 + {kSpirit%} 造物；精英、首领 {eliteBase} 点 + {eliteK%} 造物', 'allies deal + {kSpirit%} Craft; elites and bosses take {eliteBase} + {eliteK%} Craft')],
  },
  wei: {
    gist: b('八颗棋子围成一圈再收拢，圈里最多 {cap} 个小怪直接被吃掉；精英和首领掉血、晕住。', 'Eight stones ring you and close in: up to {cap} small enemies inside are captured; elites and bosses lose HP and are stunned.'),
    say: b('八颗棋子在身边围成一圈，{close} 秒后收拢：圈里最多 {cap} 个小怪直接被吃掉；精英和首领掉 {elitePct}% 当前气血，晕住 {stun} 秒。',
      'Eight stones ring you and close in over {close} s: up to {cap} small enemies inside are captured; elites and bosses lose {elitePct}% of their current HP and are stunned {stun} s.'),
    more: [b('半径 {r}', 'radius {r}'), b('精英、首领一次最多掉「{capW} × 当前第几重」点', 'elites and bosses lose at most {capW} × the wave number')],
  },
  pudie: {
    gist: b('扑向附近最强的敌人，扑的时候打不着你；扑死了马上能再扑。', 'Pounces on the strongest enemy nearby, untouchable in the air; a kill lets you pounce again at once.'),
    say: b('扑向附近最强的敌人，在空中的 {air} 秒谁也打不到你。落地打 {base} 点伤害（受近战加成），晕住身边敌人 {stun} 秒。落地打倒敌人，扑蝶马上能再用。',
      'Pounces on the strongest enemy nearby, untouchable for {air} s in the air. Landing deals {base} damage (scales with Melee) and stuns enemies around you {stun} s. A kill on landing resets the cooldown.'),
    more: [b('{base} 点 + {k%} 近战；落地半径 {r}', '{base} + {k%} Melee; landing radius {r}'), b('扑击距离 {reach}', 'pounce range {reach}')],
  },
  daoyao: {
    gist: b('站定捣 {pounds} 下，震伤身边的敌人（这时少受伤），然后吃药回血，一阵子伤害更高。', 'Stands and pounds {pounds} times, hurting enemies around you (taking less damage), then drinks: heal and deal more damage for a while.'),
    say: b('站定 {root} 秒，这时少受 {dr}% 伤害，连捣 {pounds} 下震伤身边的敌人（受回血、气血加成）；然后吃药回 {heal%} 气血，{buffDur} 秒里伤害 +{buff}%。',
      'Stands still for {root} s taking {dr}% less damage and pounds {pounds} times, hurting enemies around you (scales with HP Regen and HP); then drinks: heals {heal%} of max HP and +{buff}% Damage for {buffDur} s.'),
    more: [b('半径 {r}；击退 {knock}', 'radius {r}; knockback {knock}'), b('每下 {base} 点 + {kRegen%} 回血 + {kHp%} 气血上限', 'each pound {base} + {kRegen%} HP Regen + {kHp%} max HP'), b('被杵中的敌人 {vulnDur} 秒内多受 {vuln}% 伤害', 'foes struck take {vuln}% more damage for {vulnDur} s')],
  },
  yaoyue: {
    gist: b('一口喝到大醉：{dur} 秒里暴击更高，每次暴击射出追人的诗字；之后晕乎 {hang} 秒，走得慢。', 'Drinks deep: for {dur} s you crit more and each crit fires a seeking verse; then {hang} s of hangover, moving slower.'),
    say: b('一口喝到醉意 {drunk}：{dur} 秒里暴击率 +{crit}%，每次暴击射出一个追人的诗字（受远程加成，再跳 {chain} 个敌人）；之后宿醉 {hang} 秒，移速 −{hangSlow}%。',
      'Drinks to {drunk} Drunk: for {dur} s +{crit}% crit chance, and every crit fires a seeking verse glyph (scales with Ranged) that jumps to {chain} more; then {hang} s of hangover at −{hangSlow}% Move speed.'),
    more: [b('诗字 {base} 点 + {k%} 远程', 'verse glyphs deal {base} + {k%} Ranged')],
  },
  tuodao: {
    gist: b('假装后退一步（这时打不着你），回身一刀扫一整圈，把敌人打飞、晕住 {stun} 秒。', 'Feigns a retreat (untouchable), then spins a full-circle sweep that knocks enemies away and stuns them {stun} s.'),
    say: b('假装往后退一步（这时 {iframe} 秒打不着你），回身一刀扫一整圈：受你最强的重器和近战加成，把敌人打飞，晕住 {stun} 秒。',
      'Feigns a retreat (untouchable for {iframe} s), then spins a full-circle sweep that scales with your best Heavy weapon and Melee, knocking enemies away and stunning them {stun} s.'),
    more: [b('后退 {back}；横扫半径 {r}；击退 {knock}', 'retreat {back}; sweep radius {r}; knockback {knock}'), b('伤害：最强重器的 {kWeapon%} + {kMelee%} 近战', 'damage: {kWeapon%} of your best Heavy weapon + {kMelee%} Melee')],
  },
  qinghui: {
    gist: b('飞上天 {rise} 秒谁也打不着，落地砸出一片月光池：池里敌人变弱变慢，你回血更快。', 'Rises for {rise} s where nothing can touch you, then lands in a moon pool: enemies inside are weaker and slower, and you heal faster.'),
    say: b('飞上天 {rise} 秒，打不着你；落地砸出月光池（{base} 点伤害，受法术加成），留 {pool} 秒：池里敌人伤害 −{poolDr}%、慢 {poolSlow}%，你回血 +{poolRegen}。月亮随即变满。',
      'Rises for {rise} s where nothing can touch you, then lands in a moon pool ({base} damage, scales with Elemental) that lasts {pool} s: enemies inside deal {poolDr}% less and are {poolSlow}% slower; you get +{poolRegen} HP Regen. The moon turns full.'),
    more: [b('月光池半径 {r}；落地 {base} 点 + {k%} 法术', 'pool radius {r}; landing {base} + {k%} Elemental'), b('在天上移速是平常的 {move%}，射程 +{range}%', 'while aloft: {move%} move speed, +{range}% range')],
  },
  // ☆ 别传
  tishi: {
    gist: b('沿路写下一行诗，变成墙挡住敌人。', 'Brushes a line of verse along your path that walls enemies off.'),
    say: b('沿着你走的路写下 {n} 个字，变成墙留 {life} 秒：敌人碰到会受伤（受远程加成），还慢 {slow}%。', 'Brushes {n} glyphs of verse along your path; they stand as walls for {life} s, hurting enemies that touch them (scales with Ranged) and slowing them {slow}%.'),
    more: [b('{base} 点 + {k%} 远程', '{base} + {k%} Ranged')],
  },
  cuihua: {
    gist: b('让场上的花和竹子一起开：回血，并定住敌人。', 'Makes every flower and bamboo bloom: heals you and roots enemies.'),
    say: b('场上的花和竹子一起开：每一株给你回 {heal} 点血，并定住附近的敌人 {root} 秒。', 'Every flower and bamboo you\'ve grown blooms at once: each heals you {heal} HP and roots enemies near it for {root} s.'),
    more: [b('定住范围 {r}', 'root radius {r}')],
  },
  dudiao: {
    gist: b('站着蓄力，然后把最强的敌人钩到面前。', 'Charge up, then hook the strongest enemy to you.'),
    say: b('站着不动蓄力（最多 {charge} 秒），然后把附近最强的敌人钩到面前：{base} 点伤害（受远程加成），蓄满时伤害{fullX:times}。', 'Hold still to charge (up to {charge} s), then hook the strongest enemy nearby to you: {base} damage (scales with Ranged), {fullX:times} as hard at full charge.'),
    more: [b('{base} 点 + {k%} 远程；钩取距离 {reach}', '{base} + {k%} Ranged; hook range {reach}')],
  },
  gaoshan: {
    gist: b('一阵子里乐器出手加倍，还会回血。', 'For a while your Music weapons fire twice as often, and you heal.'),
    say: b('{dur} 秒里乐器每拍出手两次，每拍给你回 {heal} 点血，还有墨鸟去啄敌人（受法术加成）。', 'For {dur} s Music weapons fire twice a beat, each beat heals you {heal} HP, and ink birds peck enemies (scales with Elemental).'),
    more: [b('墨鸟 {base} 点 + {k%} 法术', 'ink birds: {base} + {k%} Elemental')],
  },
  qinggong: {
    gist: b('连着短冲几次，每冲一次下一剑必定暴击。', 'A few quick dashes, each making your next sword hit a sure crit.'),
    say: b('{within} 秒内能连冲 {n} 次，每次冲的时候 {iframe} 秒打不着你；每冲一次，下一剑一定暴击。', 'Dash up to {n} times within {within} s, untouchable for {iframe} s each; every dash makes your next sword hit a sure crit.'),
    more: [b('每次冲 {len}', 'each dash {len}')],
  },
  yufeng: {
    gist: b('身边刮起旋风，把敌人往外推，托你飘过险地。', 'A whirlwind pushes enemies away and carries you over hazards.'),
    say: b('身边刮起旋风 {dur} 秒：把敌人往外推，托着你飘过地上的险地，还会把敌人身上的效果传给旁边的敌人。', 'A whirlwind around you for {dur} s pushes enemies out, carries you over ground hazards, and spreads enemies\' effects to their neighbours.'),
    more: [b('半径 {r}', 'radius {r}')],
  },
  shenbi: {
    gist: b('画一笔，墨龙顺着笔画飞过去；墨宝全部回满。', 'Draw a stroke and an ink dragon flies along it; your ink summons heal to full.'),
    say: b('拖动画一笔，一条墨龙顺着笔画飞过去（{base} 点伤害，受造物加成）；你的墨宝全部回满血。', 'Drag a stroke and an ink dragon flies along it ({base} damage, scales with Craft); all your ink summons heal to full.'),
    more: [b('{base} 点 + {k%} 造物', '{base} + {k%} Craft')],
  },
  tuiyan: {
    gist: b('一阵子里敌人变得很慢，你照常走。', 'For a moment enemies crawl while you move at full speed.'),
    say: b('{dur} 秒里敌人慢 {slow}%，你照常走；这时的棋子都落在敌人最多的地方。', 'For {dur} s enemies are {slow}% slower while you move at full speed; stones land where enemies crowd thickest.'),
  },
  maoyue: {
    gist: b('远远跳出去，落地晕住敌人，之后月华自己跳过来。', 'A long leap that stuns where you land; then moonlight leaps to you.'),
    say: b('远远跳出去，落地晕住身边的敌人 {stun} 秒；之后 {after} 秒附近的月华自己跳过来，打倒的敌人多掉 {extra} 点月华。', 'Leaps far and stuns enemies where you land for {stun} s; for {after} s nearby moonlight leaps to you and kills drop {extra} extra.'),
    more: [b('跳 {reach}；落地半径 {r}；吸月华范围 {attract}', 'leap {reach}; landing radius {r}; pulls moonlight within {attract}')],
  },
  dengyue: {
    gist: b('一跳谁也打不着，落地留下拖慢敌人的月尘。', 'An untouchable hop that leaves slowing moon dust.'),
    say: b('一跳 {air} 秒谁也打不着你，落地打 {base} 点伤害（受远程加成），留下月尘让敌人慢 {slow}%。', 'A {air} s hop where nothing can touch you; landing deals {base} damage (scales with Ranged) and leaves moon dust that slows enemies {slow}%.'),
    more: [b('{base} 点 + {k%} 远程；落地半径 {r}', '{base} + {k%} Ranged; landing radius {r}')],
  },
  doujiu: {
    gist: b('猛喝一口：更醉、出手更快，暴击迸出诗字。', 'A deep drink: more Drunk, faster attacks, and crits burst into verse.'),
    say: b('醉意 +{drunk}，{dur} 秒里攻速 +{aspd}%；每次暴击迸出诗字，打附近 {n} 个敌人（暴击伤害的 {pct}%）。', '+{drunk} Drunk and +{aspd}% Attack speed for {dur} s; each crit bursts into verse that hits {n} nearby enemies for {pct}% of the crit.'),
  },
  chitu: {
    gist: b('骑上赤兔马冲进怪堆，谁挡路谁受伤。', 'Ride Red Hare through the crowd, hurting whatever is in the way.'),
    say: b('骑上赤兔马 {dur} 秒：移速 +{speed}%，不怕减速、定住和击退；撞到的敌人每 {tick} 秒受一次伤（受近战、护甲加成）。', 'Ride Red Hare for {dur} s: +{speed}% Move speed, immune to slow, root and knockback; enemies you run through take damage every {tick} s (scales with Melee and Armour).'),
    more: [b('{base} 点 + {k%} 近战 + {kArmor} × 护甲', '{base} + {k%} Melee + {kArmor} × Armour')],
  },
  benyue: {
    gist: b('飘在空中谁也碰不到，月光替你打敌人。', 'Float out of reach while moonbeams strike enemies.'),
    say: b('飘在空中 {dur} 秒谁也碰不到你，月光每秒打 {perSec} 个敌人（受法术加成）。', 'Float for {dur} s where nothing can touch you while moonbeams strike {perSec} enemies a second (scales with Elemental).'),
    more: [b('{base} 点 + {k%} 法术', '{base} + {k%} Elemental')],
  },
  // ── m8:hidden ── (hidden.md §3.9, §4.9, §5.9; HIDDEN owns these lines)
  houqi: {
    gist: b('看准来招的一刻按下：接住的都加倍打回去；攒满 {blades} 道剑意，下一按就是「夺」。', 'Press as the blow lands: whatever you catch goes back at them, harder. With {blades} sword-intents, the next press is Seize.'),
    say: b('按下守 {win} 秒，最多接 {catches} 招：近身的反斩并击晕，飞来的原路打回（{reflectX} 倍），首领的蓄力一击被破招。落空会露出破绽，受伤 +{exposed}%。',
      'Guard for {win} s and catch up to {catches} blows: a body gets a stunning counter-cut, a shot flies back at {reflectX}×, a boss\'s charged strike is broken. A guard that catches nothing leaves you open: +{exposed}% damage taken.'),
    more: [
      b('按下 {perfect} 秒内接住叫「精」：还击 {perfX:times}，冷却只剩 {cdPerfect} 秒', 'Catch within {perfect} s of the press for a Perfect: the answer hits {perfX:times}, cooldown just {cdPerfect} s'),
      b('接住后冷却 {cdCatch} 秒；落空冷却 {cd} 秒', 'after a catch the cooldown is {cdCatch} s; after a miss, {cd} s'),
      b('夺：冲 {cutLen}，{cutX:times} 伤害，破绽敌人 {markX:times}', 'Seize: a {cutLen} dash, {cutX:times} damage, marked foes {markX:times}'),
    ],
  },
  nvluo: {
    gist: b('先缠住敌人，走开把藤绷紧，再按一次扯断：越紧伤越重，敌人全被拽到身前。', 'Bind foes, walk until the vines pull taut, then press again to snap them: the tighter, the harder, and every foe is yanked to you.'),
    say: b('缠住身边 {n} 个敌人（拖动就缠那一边的），藤留 {life} 秒。再按一次扯断：松藤只有 {slackX%} 的力，绷紧的必暴击、晕 {stunTaut} 秒；敌人被拽到身前，多受伤。',
      'Binds the {n} nearest foes (drag to bind the ones that way) for {life} s. Press again to snap: a slack vine hits for {slackX%}, a taut one always crits and stuns {stunTaut} s; foes are yanked in front of you and take more damage.'),
    more: [
      b('冷却从缠住那一刻算，{cd} 秒；缠住的都先死了，只要 {refund} 秒', 'The {cd} s cooldown counts from the bind; if they all die first, only {refund} s'),
      b('藤每绷一根，你慢 {drag}%（最多 {dragMax}%）', 'each stretched vine slows you {drag}% (max {dragMax}%)'),
    ],
  },
  sheri: {
    gist: b('按住拉弓，松手放箭；在金色那一格松手叫正中，伤害翻倍。拉太久弦会松。', 'Hold to draw and let go to loose. Release in the gold notch for a Bullseye at double damage. Hold too long and the string slips.'),
    say: b('按住拉弓（走得慢），松手射出穿透整条线的大箭，拉得越满越痛。{sweet0}–{sweet1} 秒松手是正中：{sweetX:times}，打到首领或精英炸成 {shards} 道日光。过 {slip} 秒弦会松。',
      'Hold to draw, let go to loose an arrow through a whole line; the fuller the draw, the harder. Let go at {sweet0}–{sweet1} s for a Bullseye: {sweetX:times}, bursting into {shards} suns on a boss or elite. Past {slip} s the string slips.'),
    more: [
      b('拖动可以瞄准，一条线上的敌人都会被射穿', 'drag to aim: everything on the line is hit'),
      b('弦松：伤害 {slipX:times}，冷却多 {slipCd} 秒', 'string slips: {slipX:times} damage, +{slipCd} s cooldown'),
    ],
  },
  lunjian: {
    gist: b('按住站桩，只接飞来的，接住的都变成飞剑；松手一齐射出。', 'Hold your stance and catch only shots; each becomes a flying sword, loosed together when you let go.'),
    say: b('按住站桩最多 {hold} 秒（移速 {move%}），只接飞来的，最多 {catches} 个，每个变成一把飞剑；松手一齐射出（受近战加成）。什么都没接住会露出破绽。',
      'Hold a stance for up to {hold} s ({move%} move speed), catching only shots, up to {catches}; each becomes a flying sword, all loosed when you let go (scales with Melee). Catch nothing and you are left open.'),
    more: [b('每把 {base} 点 + {k%} 近战', 'each {base} + {k%} Melee')],
  },
  chibao: {
    gist: b('放赤豹扑出去守住一个地方，藤缠在豹子身上；再按一次叫它跑回来，一路扯断。', 'Send the leopard to pounce and hold a spot, vines tied to it; press again to call it back, snapping them all on the way.'),
    say: b('赤豹扑向 {reach} 内最强的敌人，守住那里 {life} 秒，每 {every} 秒咬一口（受近战加成），还把敌人引过去。再按一次叫它跑回来，一路把藤扯断。',
      'The leopard pounces on the strongest foe within {reach} and holds the spot for {life} s, biting every {every} s (scales with Melee) and drawing foes to it. Press again to call it back, snapping every vine on the way.'),
    more: [b('每口 {base} 点 + {k%} 近战', 'each bite {base} + {k%} Melee')],
  },
  lianzhu: {
    gist: b('按住一支一支上箭，最多三支；第三支刚上好就松手，三箭排成一条直线。', 'Hold to nock arrows one by one, up to three; let go right after the third and they fly as one line.'),
    say: b('按住每 {every} 秒上一支箭，最多 {n} 支；松手扇形射出。最后一支刚上好 {win} 秒内松手，几支箭排成一条直线，每支 {lineX:times}。',
      'Hold to nock an arrow every {every} s, up to {n}; let go to loose them in a fan. Let go within {win} s of the last nock and they fly as one line, each {lineX:times}.'),
  },
  // ── end m8:hidden
};

// ───────────────────────────────────────────── 天性 (13), and each companion's one line
export interface PassiveSay { readonly gist: Bi; readonly say: Bi; readonly cost: Bi | null }

export const PASSIVE_SAY: Readonly<Record<string, PassiveSay>> = {
  bolan: {
    gist: b('升级时可挑的卡更多，刷新更省，开局自己挑兵器。', 'More level-up cards, a free reroll, and his pick of starting weapon.'),
    say: b('升级时有 {cards} 张卡可挑（别人 {F.cards} 张）；每次商店第一次刷新免费；经验 +{xp}%；开局从 {choices} 把兵器里自己挑一把。', '{cards} cards to choose from at each level-up (others get {F.cards}); the first reroll in every shop is free; +{xp}% XP; picks his starting weapon from {choices}.'),
    cost: null,
  },
  chunzhong: {
    gist: b('收成更多，而且每重涨得更快。', 'More Harvest, and it grows faster every wave.'),
    say: b('收成 +{s.harvest}，而且收成每重涨 {grow:up}（别人是 {F.harvestGrow:up}）。', '+{s.harvest} Harvest, and Harvest grows {grow:up} a wave (others {F.harvestGrow:up}).'),
    cost: b('攻速 {s.aspd}%', '{s.aspd}% Attack speed'),
  },
  yuanzhe: {
    gist: b('运气好、捡得远，打倒的敌人偶尔变成金鲤。', 'Lucky, picks up from afar, and some kills turn into golden carp.'),
    say: b('福缘 +{s.luck}，拾取 +{s.pickup}%；每 {f0.per} 点福缘伤害 +{=1}%（最多 +{f0.max}%）；打倒的敌人有 {carp%} 几率变金鲤，多给 {carpMoon} 点月华。', '+{s.luck} Luck, +{s.pickup}% pickup range; +{=1}% Damage for every {f0.per} Luck (up to +{f0.max}%); kills have a {carp%} chance to become a golden carp worth {carpMoon} moonlight (more with Luck).'),
    cost: null,
  },
  zhiyin: {
    gist: b('乐器踩着拍子打，更痛、范围更大。', 'Music weapons play on the beat, harder and wider.'),
    say: b('乐器跟着拍子出手（最多等 {wait} 秒），伤害 +{dmg}%，范围 +{area}%。', 'Music weapons fire on the beat (waiting at most {wait} s): +{dmg}% damage, +{area}% area.'),
    cost: b('主要受近战加成的兵器，伤害 {w.melee}%', 'Weapons that mainly scale with Melee deal {-w.melee}% less damage'),
  },
  jianyi: {
    gist: b('飞剑更多、出手更快、更容易暴击，飞回来还回血。', 'More flying swords that strike faster, crit more and heal you as they come back.'),
    say: b('飞剑数 +{s.swords}；飞剑类兵器暴击率 +{f0.stats.crit}%、攻速 +{f0.stats.aspd}%；每把飞剑飞回身边回 {f1.v} 点气血，每秒最多 {f1.capPerSec} 点。', '+{s.swords} Extra {s.swords?sword|swords}; flying-sword weapons +{f0.stats.crit}% crit chance and +{f0.stats.aspd}% Attack speed; each sword that comes back heals {f1.v} HP, at most {f1.capPerSec} a second.'),
    cost: b('主要受近战加成的兵器，伤害 {w.melee}%', 'Weapons that mainly scale with Melee deal {-w.melee}% less damage'),
  },
  tongzi: {
    gist: b('个子小不容易被打中；减速、燃烧这类效果更持久。', 'Small and hard to hit; slows, burns and the like last longer.'),
    say: b('你给敌人的减速、燃烧这类效果多持续 {statusDur}%；个子更小（身体半径 {hitbox}，别人 {c0.hitbox}），更难被打中。', 'Slows, burns and other effects you inflict last {statusDur}% longer; your body is smaller (radius {hitbox}, others {c0.hitbox}), so you\'re harder to hit.'),
    cost: b('主要受近战加成的兵器，伤害 {w.melee}%', 'Weapons that mainly scale with Melee deal {-w.melee}% less damage'),
  },
  chengzhu: {
    gist: b('墨宝更多、留得更久、打得更痛。', 'More ink summons, lasting longer and hitting harder.'),
    say: b('墨宝上限 +{s.summonCap}；墨宝多留 {f0.pct}% 的时间，伤害 +{dmg}%。', '+{s.summonCap} ink summon limit; ink summons last {f0.pct}% longer and deal +{dmg}%.'),
    cost: b('墨宝以外的兵器，伤害 {w.notInk}%', 'Non-ink weapons deal {-w.notInk}% less damage'),
  },
  luozi: {
    gist: b('棋子更多、整重都在；商店多一次免费刷新，还能先看下一重。', 'More stones that last the wave; a free reroll and a peek at the next wave.'),
    say: b('棋子上限 +{s.stones}，棋子一直留到这一重结束；每次商店多 {f0.n} 次免费刷新；商店里能先看到下一重的精英和险地。', '+{s.stones} stone limit, and stones last until the wave ends; +{f0.n} free reroll every shop; the shop shows the next wave\'s elites and hazards.'),
    cost: null,
  },
  jiuming: {
    gist: b('一局有 {lives} 次挨了致命一击也不倒；闪避后出手更快。', 'Shrugs off a lethal hit {lives} times a run, and strikes faster after a dodge.'),
    say: b('一局有 {lives} 次（每重最多一次）：挨了致命一击不倒，剩 {=1} 点血，{iframe} 秒打不着。闪避之后 {dodgeDur} 秒内攻速 +{dodgeAspd}%。', '{lives} times a run (at most once a wave), a lethal hit leaves you at {=1} HP and untouchable for {iframe} s. For {dodgeDur} s after a dodge: +{dodgeAspd}% Attack speed.'),
    cost: b('加的气血只算 {hpGain%}；不能用{bans}', 'HP gains count {hpGain%}; no {bans} weapons'),
  },
  yaoxiang: {
    gist: b('回满血后多出来的部分变成护盾；回血越多伤害越高。', 'Healing past full HP becomes a shield, and HP Regen becomes damage.'),
    say: b('血回满以后，再回的血变成护盾（最多到气血上限的 {shield%}，每秒少 {decay%}）；治疗效果 +{s.heal}%；每 {f0.per} 点回血伤害 +{=1}%（最多 +{f0.max}%）。', 'Healing past full HP becomes a shield (up to {shield%} of max HP, fading {decay%} a second); +{s.heal}% healing; +{=1}% Damage for each {f0.per} HP Regen (up to +{f0.max}%).'),
    cost: null,
  },
  baipian: {
    gist: b('不喝酒也会醉，醉得越深暴击越高。', 'Gets drunk without wine; the drunker, the more crits.'),
    say: b('醉意涨得{drunkX:faster}，不带酒也有醉意条。暴击率超过 {=100}% 的部分每点变 {overflow}% 暴击倍数；每次暴击回 {critHeal} 点气血，每秒最多 {critHealCap} 点。', 'You have the Drunk meter even without a wine weapon, and it rises {drunkX:times} as fast. Each point of Crit chance over {=100}% becomes {overflow}% Crit multiplier; each crit heals {critHeal} HP, at most {critHealCap} a second.'),
    cost: b('自动瞄准会左右晃 {sway}°', 'Auto-aim sways {sway}°'),
  },
  yibo: {
    gist: b('一下最多掉 {hitCap%} 气血，身边敌人伤害变低，近战越打越强。', 'No hit takes more than {hitCap%} of your HP, nearby enemies hit softer, and Melee grows as you go.'),
    say: b('一下最多掉气血上限的 {hitCap%}；每打完 {per} 重近战 +{=1}（最多 +{meleeMax}）；身边{auraR:size}里的敌人伤害 −{aura}%。', 'No hit takes more than {hitCap%} of max HP; +{=1} Melee every {per} waves cleared (max +{meleeMax}); enemies in {auraR:size} around you deal {aura}% less.'),
    cost: b('只有 {c.slots} 个兵器位；商店不卖{bans}', 'Only {c.slots} weapon slots; no {bans} weapons in his shop'),
  },
  yinqing: {
    gist: b('月相 {cycle} 秒转一圈：满月伤害高，新月更会躲；险地只伤她一半。', 'A {cycle} s moon cycle: strong at full moon, evasive at new moon; ground hazards hurt her only half as much.'),
    say: b('月相 {cycle} 秒转一圈：满月时伤害 +{full}%，新月时伤害 {newDmg}%、闪避 +{newDodge}%；地上的险地只伤她一半，也拖不慢她。', 'A {cycle} s moon cycle: full moon +{full}% Damage; new moon {newDmg}% Damage and +{newDodge}% Dodge. Ground hazards hurt her half as much and never slow her.'),
    cost: b('加的护甲只算 {armorGain%}', 'Armour gains count {armorGain%}'),
  },
  // ── m8:hidden ── (hidden.md §3.9, §4.9, §5.9; HIDDEN owns these lines)
  jingshen: {
    gist: b('她不闪，她接。闪避只算一半，多出来的变成近战。', 'She doesn\'t dodge; she catches. Dodge counts half, and the rest becomes Melee.'),
    say: b('闪避只算 {dodgeHalf%}；每 {f0.per} 点闪避变 {=1} 点近战。接住一招后，{critWin} 秒内兵器前 {critHits} 下必暴击；对有破绽的敌人暴击倍数 +{markCritDmg}%。',
      'Dodge counts {dodgeHalf%}; every {f0.per} Dodge becomes {=1} Melee. After a catch, your next {critHits} weapon hits within {critWin} s crit; +{markCritDmg}% Crit damage on marked foes.'),
    cost: b('闪避只算一半。', 'Dodge counts half.'),
  },
  youhuang: {
    gist: b('身边的敌人越多，她越狠；被扯过的敌人多受伤。', 'The more foes around her, the fiercer she is; snapped foes take more damage.'),
    say: b('身边 {nearR} 以内每有一个敌人，伤害 +{per}%（最多 +{max}%）。被女萝扯过的敌人 {vulnDur} 秒内多受 {vuln}% 伤害。',
      '+{per}% Damage for each foe within {nearR} (max +{max}%). Foes you snap take {vuln}% more damage for {vulnDur} s.'),
    cost: b('身子轻：护甲低。', 'Light: low Armour.'),
  },
  mangong: {
    gist: b('站稳了弓才准：站定时弓更痛、多穿一个；走动时射得慢。', 'A bow needs a steady stance: standing still hits harder and pierces one more; moving shoots slower.'),
    say: b('站定 {still} 秒后，弓类伤害 +{dmg}%、穿透 +{pierce}；走动时弓类攻速 {moveAspd}%。弓每暴击 {every} 次，自动补一箭射日。',
      'After standing still {still} s: +{dmg}% Bow damage and +{pierce} Pierce; moving: {moveAspd}% Bow attack speed. Every {every} Bow crits, a free sun arrow.'),
    cost: b('走动时弓射得慢。', 'Bows fire slower while he moves.'),
  },
  // ── end m8:hidden
};

/** Each companion's first line on the select card (d-panel §5.5), in glossary words. Slots read the passive. */
export const COMPANION_SAY: Readonly<Record<string, Bi>> = {
  scholar: b('什么兵器都能用：升级时卡更多，开局自己挑兵器。新手先用他。', 'Uses anything: more level-up cards and his pick of starting weapon. Start with him.'),
  gardener: b('皮厚，会慢慢回血；越往后每重白拿的月华越多。出手偏慢。', 'Sturdy and regenerates; earns more free moonlight every wave. Attacks a bit slower.'),
  fisher: b('运气好、捡得远，打倒的敌人偶尔变成金鲤多给月华。伤害略低。', 'Lucky, picks up from afar, and some kills turn into golden carp for extra moonlight. Slightly less damage.'),
  musician: b('乐器踩着拍子打，更痛、范围更大。血薄，近战兵器吃亏。', 'Music weapons play on the beat, harder and wider. Fragile; melee weapons suffer.'),
  swordsman: b('跑得快、会闪，飞剑数 +{s.swords}。血薄，近战兵器吃亏。', 'Fast and dodgy, with +{s.swords} Extra {s.swords?sword|swords}. Fragile; melee weapons suffer.'),
  taoist: b('个子小不容易被打中，燃烧、减速这类效果更久。最脆，近战兵器吃亏。', 'Small and hard to hit; burns, slows and the like last longer. The most fragile; melee weapons suffer.'),
  painter: b('靠画出来的墨宝帮手打架：帮手更多、更久、更痛。别的兵器吃亏。', 'Fights with painted ink helpers: more of them, longer-lived, stronger. Other weapons suffer.'),
  player: b('摆棋子炸敌人，棋子多，整重都在；商店多一次免费刷新，还能先看下一重。出手偏慢。', 'Lays go stones that blast enemies and last the whole wave; a free reroll every shop and a peek at the next wave. Attacks a bit slower.'),
  cat: b('跑得最快、最会闪，一局有 {lives} 次挨了致命一击也不倒。加的气血只算 {hpGain%}，不能用{bans}。', 'The fastest and dodgiest; shrugs off a lethal hit {lives} times a run. HP gains count {hpGain%}; no {bans} weapons.'),
  rabbit: b('会回血，回满后多出来的变成护盾。射程短一些。', 'Regenerates, and healing past full becomes a shield. Shorter range.'),
  poet: b('不喝酒也会醉，越醉暴击越高。自动瞄准会晃。', 'Gets drunk without wine, and the drunker, the more crits. Auto-aim sways.'),
  guan: b('最耐打：一下最多掉 {hitCap%} 气血，身边敌人打得轻，近战越来越强。只有 {c.slots} 个兵器位，不卖{bans}。', 'The toughest: no hit takes over {hitCap%} of your HP, nearby enemies hit softer, and Melee grows. Only {c.slots} weapon slots; no {bans} weapons in his shop.'),
  change: b('会闪避，险地只伤她一半，也拖不慢她；月相 {cycle} 秒转一圈，满月伤害高，新月更会躲。护甲加得少。', 'Dodgy; ground hazards hurt her half as much and never slow her. A {cycle} s moon cycle, strong at full moon, evasive at new moon. Gains less armour.'),
  // ── m8:hidden ── (hidden.md §3.1, §4.1, §5.1; HIDDEN owns these lines)
  yuenv: b('越国的剑女。不闪不躲，等敌人出手的一刻接住，再加倍还回去。', 'The sword maiden of Yue. She doesn\'t dodge: she waits for the blow, catches it, and sends it back twice as hard.'),
  shangui: b('骑赤豹的山中女神。用女萝缠住敌人，走开把藤绷紧，一扯全拽到脚下。', 'The hill goddess on a red leopard. She binds foes with lichen vines, walks them taut, and snaps the whole pack to her feet.'),
  houyi: b('射落九日的神射手。站稳、拉满、在最准的一刻松手，一箭穿透一整排。', 'The archer who shot down nine suns. Stand, draw, let go at the perfect moment, and one arrow pierces a whole line.'),
  // ── end m8:hidden
};

// ───────────────────────────────────────────── set rule flags (SETS … flags)
/** Numbers in these mirror the engine lines that read each flag (tests read them back). */
export const FLAG_SAY: Readonly<Record<string, Bi>> = {
  swordPierce: b('剑类刺击多刺中 {=1} 个敌人', 'sword thrusts hit {=1} more enemy'),
  hiddenBounce: b('暗器多弹 {=1} 次', 'hidden weapons bounce {=1} more time'),
  idleSwords: b('闲着的飞剑绕着你转，碰到敌人打 {=30}%', 'idle swords circle you and cut for {=30}%'),
  burnStack: b('燃烧多叠 {=1} 层', 'burns stack {=1} higher'),
  chainPlus: b('雷多跳 {=1} 个敌人', 'lightning jumps to {=1} more enemy'),
  drainHalf: b('醉意消得慢一半', 'Drunk drains half as fast'),
  musicArea10: b('乐器范围 +{=10}%', 'Music weapons +{=10}% area'),
  musicArea20: b('乐器范围 +{=20}%', 'Music weapons +{=20}% area'),
  musicArea30: b('乐器范围 +{=30}%', 'Music weapons +{=30}% area'),
  charmX2: b('迷惑几率翻倍', 'charm chances doubled'),
  ink6: b('墨宝个头和伤害 +{=20}%', 'ink summons {=20}% bigger and stronger'),
  goArea25: b('棋子炸开范围 +{=25}%', 'stone blasts +{=25}% area'),
  dodgeCap5: b('闪避上限 +{=5}%', 'dodge cap +{=5}%'),
};

// ───────────────────────────────────────────── 流派 (14)
export const ARCH_SAY: Readonly<Record<string, Bi>> = {
  mobao: b('画出一群墨宝替你打，你边走边躲。', 'Paint an army of helpers; keep moving while it fights.'),
  xianjian: b('飞剑绕身、飞出、穿过敌人再飞回，剑越多越强。', 'Swords circle, launch, pierce and return; the more, the better.'),
  zhongbing: b('大刀慢慢扫，一扫一大片，还能把敌人打飞。', 'Big slow sweeps that hit a crowd and knock it away.'),
  jinzhong: b('堆护甲，站进怪堆，谁打你谁疼。', 'Stack armour, stand in the crowd, and hurt whoever hits you.'),
  fulu: b('雷会连着劈，火会越烧越旺。', 'Lightning that jumps, fire that spreads.'),
  qinxin: b('减速、定住、迷惑，让敌人自己打起来。', 'Slow, root and charm until enemies fight each other.'),
  zuixian: b('越喝越醉，暴击一串接一串。', 'The drunker you get, the more you crit.'),
  fuyuan: b('先攒月华，再把钱变成战力。', 'Save up moonlight, then turn wealth into power.'),
  huichun: b('回血比掉血快，回血还能变成伤害。', 'Out-heal everything, and turn healing into damage.'),
  qizhen: b('满地摆棋子，把敌人引过来，再一起炸掉或吃掉。', 'Fill the ground with stones, lure enemies in, then blow them up or capture them.'),
  yueying: b('每躲开一下，就放月光反击。', 'Every dodge fires moonlight back.'),
  jifeng: b('跑得越快打得越痛，别停下。', 'Speed is damage; never stop moving.'),
  jiehuo: b('背上劫数换力量：敌人变强，你更强。', 'Take on Curse for power: enemies get stronger, you more so.'),
  dugubaijia: b('要么只带一把兵器当六把用，要么多带几类兵器。', 'Either one weapon that counts as six, or many classes at once.'),
};

// ───────────────────────────────────────────── 镜境 (6), 镜誓 (10), 镜蚀 (8), 镜印 (6)
export const DIFF_SAY: readonly Bi[] = [
  b('敌人气血 {hp:dpct}、伤害 {dmg:dpct}；第 {noEliteBefore} 重前没有精英，出招提示更久', 'enemies {hp:dpct} HP, {dmg:dpct} damage; no elites before wave {noEliteBefore}; longer warnings'),
  b('标准难度', 'the standard challenge'),
  b('敌人气血 {hp:dpct}、伤害 {dmg:dpct}；第 {extraEliteFrom} 重起精英成对来', 'enemies {hp:dpct} HP, {dmg:dpct} damage; elites come in pairs from wave {extraEliteFrom}'),
  b('敌人气血 {hp:dpct}、伤害 {dmg:dpct}；敌人子弹快 {shotSpeed:up}，首领多一招', 'enemies {hp:dpct} HP, {dmg:dpct} damage; enemy shots {shotSpeed:up} faster; bosses gain a move'),
  b('敌人气血 {hp:dpct}、伤害 {dmg:dpct}；第 {affixFrom} 重起精英带镜印；你的治疗效果 {heal}%', 'enemies {hp:dpct} HP, {dmg:dpct} damage; elites carry a trait from wave {affixFrom}; your healing {heal}%'),
  b('敌人气血 {hp:dpct}、伤害 {dmg:dpct}、移速 {enemySpeed:dpct}；第 {mutatorFrom} 重起有镜蚀；首领成双', 'enemies {hp:dpct} HP, {dmg:dpct} damage, {enemySpeed:dpct} speed; twists from wave {mutatorFrom}; twin bosses'),
];

export const VOW_SAY: Readonly<Record<string, Bi>> = {
  qunmo: b('每重多来 {budget}% 的敌人', '{budget}% more enemies a wave'),
  jianyan: b('敌人气血 +{hp}%', 'enemies +{hp}% HP'),
  lizhao: b('敌人伤害 +{dmg}%', 'enemies +{dmg}% damage'),
  jixing: b('敌人移速 +{spd}%', 'enemies +{spd}% move speed'),
  qianlin: b('商店价格 +{price}%', 'shop prices +{price}%'),
  canyue: b('你的治疗效果 {heal}%', 'your healing {heal}%'),
  daoxuan: b('首领剩 {at%} 气血时进入第四阶段，所有招式一起放', 'bosses enter a fourth phase at {at%} HP: every pattern at once'),
  jijing: b('每重短 {-len}%，敌人一样多', 'waves {-len}% shorter, same enemies'),
  guying: b('升级只给 {cards} 张卡', 'level-ups show only {cards} cards'),
  wusuo: b('拾取范围 {pickup}%', '{pickup}% pickup range'),
};

/** `{v}` is the mutator's strength this run. */
export const MUTATOR_SAY: Readonly<Record<string, Bi>> = {
  mochao: b('敌人死后留下墨洼，踩进去慢 {v}%', 'the dead leave ink puddles that slow you {v}%'),
  shuangjing: b('精英一次来 {v} 个', 'elites come {v} at a time'),
  jiying: b('敌人移速 +{v}%', 'enemies +{v}% move speed'),
  huiguang: b('敌人掉到一半气血时回 {v}% 的血（一次）', 'enemies heal {v}% once at half HP'),
  suijing: b('敌人死后裂成 {n} 个小的（各 {v}% 气血）', 'enemies split into {n} on death ({v}% HP each)'),
  anyue: b('四周变暗，看不清远处', "darkness: you can't see far"),
  fanzhao: b('会射击的敌人多射 {v} 发', 'shooters fire {v} more {v?shot|shots}'),
  houjia: b('所有敌人护甲 +{v}', 'every enemy +{v} armour'),
};

export const AFFIX_SAY: Readonly<Record<string, Bi>> = {
  aegis: b('护甲 +{armor}', '+{armor} Armour'),
  swift: b('移速 +{speed}%', '+{speed}% Move speed'),
  splitting: b('死后分成 {n} 个（各 {hp%} 气血）', 'splits into {n} on death ({hp%} HP each)'),
  devour: b('打中你时给自己回血', 'heals itself when it hits you'),
  mirrored: b('挨了重击后，会短暂把子弹弹回去', 'reflects shots for a moment after a big hit'),
  caller: b('每 {every} 秒叫来 {n} 个小怪', 'calls {n} small enemies every {every} s'),
};

// ───────────────────────────────────────────── 镜缘 deeds (31) and 名号 titles (8): how to earn them
/** m8 ask B (PLAN D27): an item deed's reward, 镜屑 once on first completion; `{n}` = logic/meta.ts deedDust(id). */
export const DEED_REWARD_SAY: Bi = b('成就 · 镜屑 +{n}', 'Deed · +{n} Shards');
/** `{goal}` is the deed's goal; `{alt}` its alternative goal. 照破 = beat wave 30 (the glossary explains it). */
export const DEED_SAY: Readonly<Record<string, Bi>> = {
  swordKills: b('用剑类兵器累计打倒 {goal} 个敌人', 'defeat {goal} enemies with Sword weapons'),
  drunkHundred: b('醉意到 {goal}', 'reach {goal} Drunk'),
  moonHoard: b('身上同时攒到 {goal} 点月华', 'hold {goal} moonlight at once'),
  archerWave: b('带着 {goal} 把弓弩或暗器打完一重', 'clear a wave holding {goal} Bow or Hidden weapons'),
  ghostKills: b('累计打倒 {goal} 个鬼类敌人', 'defeat {goal} ghosts'),
  swordsAloft: b('空中同时有 {goal} 把飞剑', 'have {goal} flying swords in the air at once'),
  charmFifty: b('累计迷惑 {goal} 个敌人', 'charm {goal} enemies'),
  inkFour: b('同时有 {goal} 只墨宝在场', 'have {goal} ink summons out at once'),
  dodgeHundred: b('累计闪避 {goal} 次', 'dodge {goal} hits'),
  flyingKills: b('飞剑累计打倒 {goal} 个敌人', 'defeat {goal} enemies with flying swords'),
  swordsAtTwenty: b('打到第 {=20} 重时飞剑数有 {goal} 或更多', 'reach wave {=20} with {goal}+ Extra swords'),
  inkSix: b('同时有 {goal} 只墨宝在场', 'have {goal} ink summons out at once'),
  inkKills: b('墨宝累计打倒 {goal} 个敌人', 'defeat {goal} enemies with ink summons'),
  painterClear: b('用画师照破，或同时带 {alt} 把墨宝类兵器', 'clear as the Painter, or hold {alt} Ink weapons'),
  stoneChain: b('一次连着引爆 {goal} 颗棋子', 'set off a chain of {goal} stones'),
  poetClear: b('用诗仙照破', 'clear as the Poet'),
  armorTwenty: b('护甲到 {goal}', 'reach {goal} Armour'),
  guanClear: b('用关公照破', 'clear as Lord Guan'),
  speedSixty: b('移速到 +{goal}%', 'reach +{goal}% Move speed'),
  dodgeFifty: b('闪避到 {goal}%', 'reach {goal}% dodge'),
  regenTwenty: b('回血到 {goal}', 'reach {goal} HP Regen'),
  healRun: b('一局里累计回 {goal} 点血', 'heal {goal} HP in one run'),
  burnThirty: b('同时有 {goal} 个敌人在燃烧', 'have {goal} enemies burning at once'),
  moonRun: b('一局里捡到 {goal} 点月华', 'collect {goal} moonlight in one run'),
  loneBlade: b('一直只带 {=1} 把兵器打过第 {=20} 重', 'clear wave {=20} never holding more than {=1} weapon'),
  musicianClear: b('用琴师照破', 'clear as the Qin Player'),
  curseFive: b('劫数到 {goal}', 'reach {goal} Curse'),
  clearMing: b('在明镜或更难的镜境照破', 'clear on Bright Mirror or harder'),
  clearXuan: b('在玄镜或更难的镜境照破', 'clear on Dark Mirror or harder'),
  charmWave: b('一重里迷惑 {goal} 个敌人，并打完这一重', 'charm {goal} enemies in one wave and clear it'),
  critWave: b('一重里打出 {goal} 次暴击', 'land {goal} crits in one wave'),
};

/** Numbers are the thresholds in logic/meta.ts (tests read them back). */
export const TITLE_SAY: Readonly<Record<string, Bi>> = {
  paintImmortal: b('墨宝上限 {=8} 以上时照破', 'clear with an ink summon limit of {=8}+'),
  swordImmortal: b('飞剑数 {=6} 以上时照破', 'clear with {=6}+ Extra swords'),
  netAll: b('一网网住 {=50} 个敌人', 'net {=50} enemies at once'),
  nineLives: b('用大橘照破，还剩至少一条命', 'clear as Big Ginger with a life to spare'),
  mirrorMan: b('打到第 {=50} 重，打败镜主', 'reach wave {=50} and beat the Mirror Lord'),
  voidWalker: b('在无相照破', 'clear on Formless'),
  migrant: b('集齐 {=36} 张候签', 'collect {=36} pentad slips'),
  seasons: b('集齐全部 {=72} 张候签', 'collect all {=72} pentad slips'),
};

// ───────────────────────────────────────────── monsters, elites, treasures: what it does, how to beat it
export const FOE_SAY: Readonly<Record<string, Bi>> = {
  blot: b('一路直直追着你，走开就行。', 'Walks straight at you; just keep moving.'),
  paperman: b('皱一下就扑过来；看它发抖就闪开。', 'Crinkles, then lunges; step aside when it shakes.'),
  shard: b('打碎后裂成两片小的，别站太近。', 'Splits into two small shards when broken.'),
  lantern: b('远远地扔火球，先把它打掉。', 'Throws fireballs from afar; take it out first.'),
  tadpole: b('一群一群地扭着冲过来，范围攻击最好用。', 'Comes in wriggling schools; area attacks work best.'),
  shrimp: b('先亮出一条线，再顺着线冲，别站在线上。', 'Flashes a line, then dashes along it; get off the line.'),
  frog: b('会跳过来，落点有提示，躲开就好。', 'Hops at you; the landing spot is marked, so dodge it.'),
  crab: b('前面有钳子挡着，从侧面或背后打。', 'Its claws guard the front; hit it from the side or back.'),
  lotuspod: b('站着不动，亮一下就喷一排莲子。', 'Stands still and spits a fan of seeds after it glows.'),
  jelly: b('发红就要炸了，赶紧走开。', 'Turns red before it bursts; get away.'),
  clam: b('合上时打不动，张开会放出小蝌蚪。', 'Shut tight it shrugs off hits; open, it releases tadpoles.'),
  egret: b('会横穿整个场地俯冲，看到提示线就躲。', 'Dives across the whole arena; dodge when the line shows.'),
  weed: b('脚下冒出水草会缠住你，看到就走开。', 'Weeds rise under your feet to hold you; move off.'),
  drowned: b('会沉下去再从你身边冒出来。', 'Sinks, then resurfaces right next to you.'),
  rat: b('在地下钻着走，冒头时才打得到。', 'Tunnels underground; you can only hit it when it pops up.'),
  foxfire: b('绕着你转几圈，然后冲过来。', 'Circles you a few times, then dashes in.'),
  imp: b('往你要去的地方扔石头，别走直线。', 'Throws stones where you\'re heading; don\'t run straight.'),
  umbrella: b('伞面能挡子弹，绕到旁边打。', 'Its canopy blocks shots; hit it from the side.'),
  wolf: b('成群绕圈，嚎一声就扑过来。', 'The pack circles, howls, then pounces.'),
  ghostlamp: b('会给别的怪回血，先打它。', 'Heals other enemies; kill it first.'),
  spider: b('吐网让你变慢，别踩网。', 'Spits webs that slow you; stay off them.'),
  panda: b('缩成一团滚过来，看准方向躲开。', 'Curls up and rolls at you; sidestep the line.'),
  stick: b('藏在竹丛里，走近才突然冒出来。', 'Hides in the bamboo and bursts out when you get close.'),
  toadstool: b('死后留下一团毒雾，别站进去。', 'Leaves a spore cloud when it dies; stay out of it.'),
  woodghost: b('扔出的斧头会飞回去，小心回程。', 'Its thrown axe comes back; watch the return.'),
  shadowhare: b('成对跳过来，落点在前面，提前躲。', 'Hops in pairs, landing ahead of you; dodge early.'),
  crow: b('成群飞来，先去扑你的墨宝。', 'Comes in flocks and goes for your summons first.'),
  soldier: b('排成盾墙往前推，从两头打。', 'Pushes forward in a shield line; hit the ends.'),
  frost: b('绕着你转，射出让你变慢的冰片。', 'Circles you and fires slowing ice shards.'),
  guihua: b('打碎后散成几片会追人的花瓣。', 'Bursts into homing petals when broken.'),
  toad: b('会吃掉地上的月华变大，快去捡。', 'Eats moonlight on the ground and grows; grab it first.'),
  star: b('两个一组，中间连一道光，别穿过去。', 'Work in pairs joined by a beam; don\'t cross it.'),
  clerk: b('敲鼓招来一圈雷，看到圈就躲。', 'Drums up a ring of lightning; leave the ring.'),
  dancer: b('转圈时会把子弹弹回来，等她停下再打。', 'Reflects shots while spinning; wait until she stops.'),
  axeshade: b('身边绕着几把斧头，别贴太近。', 'Axes circle around him; don\'t get too close.'),
  skypup: b('让周围变暗，还会冲向你的墨宝。', 'Dims the light around it and charges your summons.'),
  turtle: b('缩进壳里满场乱撞，撞完露头时猛打。', 'Hides in its shell and ricochets around; hit it when it peeks out.'),
  whitesnake: b('扭着身子走，会放出几道水线。', 'Slithers in S-curves and sends out lines of water.'),
  tiger: b('一吼让你变慢，接着连扑三下。', 'Roars to slow you, then leaps three times.'),
  painted: b('假扮成纸人，走近才撕开画皮砍人。', 'Poses as a paper man until you get close, then slashes.'),
  general: b('举着大盾，挺枪往前刺，从侧面打。', 'Holds a tower shield and thrusts a spear; flank him.'),
  hound: b('连着冲好几次，还会嚎来小狗。', 'Chains dashes and howls up pups.'),
  pixiu: b('一见你就跑，追上打倒有月华和镜奁。', 'Runs from you; catch it for moonlight and a casket.'),
  mirrorflower: b('飘着的金花，打中一下就归你。', 'A drifting golden flower; one hit catches it.'),
};

export const HAZARD_SAY: Readonly<Record<string, Bi>> = {
  moonglow: b('站进月光圈里：伤害 +{dmg}%，回血 +{regen}。', 'Stand in the moonlight: +{dmg}% Damage, +{regen} HP Regen.'),
  ripple: b('一圈水波从中间往外推，所有东西都会被推开。', 'A ring of water spreads from the centre, pushing everything out.'),
  inkrain: b('地上先出现圈，随后变成墨洼，踩进去慢 {slow}%。', 'Circles appear, then become ink puddles that slow you {slow}%.'),
  gust: b('落叶先指出风向，接着所有东西都往那边飘。', 'Leaves show the wind\'s direction, then everything drifts that way.'),
  jadefall: b('地上有标记的地方会砸下玉块，看到标记就走开。', 'Jade drops on the marked tiles; move off the marks.'),
  lowgrav: b('所有击退都更远（{knockX:dpct}）。', 'All knockback is stronger ({knockX:dpct}).'),
  moonphase: b('满月、暗月轮着来；满月那一重福缘 +{luck}。', 'Waves alternate full and dark moon; a full-moon wave gives +{luck} Luck.'),
};
