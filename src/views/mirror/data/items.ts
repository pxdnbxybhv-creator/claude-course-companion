// 水月幻镜 · 75 items (GDD §9, every ⚖ applied). Effects are data (types.ts `Effect`), interpreted by
// one switch: logic handles plain `stats`, `cond` stats without `when`/`cls`, `convert` from speed /
// armor / regen / classes / curse, `onWaveEnd` and `shop`; the engine handles every in-wave hook,
// live conds (`when`, class-scoped `cls`), converts from moonHeld / summons, and every `special`.
//
// `convert`: gain = min(max, k · max(0, source) / per) on each stat in `to` (k defaults to 1);
// converts sharing a `pool` also share the largest `max` of the pool (铁骨 + 定海神针 ≤ +40%).
import type { ItemId } from '../ids';
import type { ItemDef } from '../types';

const b = (zh: string, en: string) => ({ zh, en });

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  // ─────────────────────────────── 9.1 stat items
  songzi: { id: 'songzi', tier: 1, price: 14, max: 0, tags: [], stats: { hp: 4 }, text: b('+4 气血', '+4 气血'), verse: b('松子落，山空', 'Pine nuts fall on the empty hill') },
  tea: { id: 'tea', tier: 1, price: 14, max: 0, tags: [], stats: { regen: 2 }, text: b('+2 回气', '+2 回气'), verse: b('竹叶青青，一盏清茶', 'Green bamboo, a cup of clear tea') },
  sandals: { id: 'sandals', tier: 1, price: 14, max: 0, tags: [], stats: { speed: 5 }, text: b('+5% 身法', '+5% 身法'), verse: b('竹杖芒鞋轻胜马', 'Bamboo staff and straw sandals, lighter than a horse') },
  whetstone: { id: 'whetstone', tier: 1, price: 16, max: 0, tags: ['heavy'], stats: { melee: 2 }, text: b('+2 近战', '+2 近战'), verse: b('磨刀不误砍柴工', 'Sharpening the axe wastes no time') },
  fletch: { id: 'fletch', tier: 1, price: 16, max: 0, tags: ['bow', 'flying'], stats: { ranged: 2, range: 15 }, text: b('+2 远程，+15 射程', '+2 远程, +15 射程'), verse: b('羽箭离弦', 'The feathered arrow leaves the string') },
  cinnabar: { id: 'cinnabar', tier: 1, price: 16, max: 0, tags: ['talisman'], stats: { elem: 2 }, text: b('+2 五行', '+2 五行'), verse: b('朱砂一点，符成', 'A dot of cinnabar and the charm is done') },
  pineink: { id: 'pineink', tier: 1, price: 16, max: 0, tags: ['ink', 'go'], stats: { spirit: 2 }, text: b('+2 造化', '+2 造化'), verse: b('松烟为墨，千年不变', 'Pine-soot ink, unchanged a thousand years') },
  guardmirror: { id: 'guardmirror', tier: 1, price: 18, max: 0, tags: ['heavy'], stats: { armor: 2, speed: -2 }, text: b('+2 护甲，−2% 身法', '+2 护甲, −2% 身法'), verse: b('护心宝镜', 'A mirror to guard the heart') },
  bell: { id: 'bell', tier: 1, price: 18, max: 0, tags: [], stats: { aspd: 6 }, text: b('+6% 攻速', '+6% 攻速'), verse: b('铃声清脆', 'The bell rings clear') },
  eagle: { id: 'eagle', tier: 1, price: 16, max: 0, tags: ['wine', 'sword'], stats: { crit: 4 }, text: b('+4% 暴击', '+4% 暴击'), verse: b('鹰击长空', 'The eagle strikes the open sky') },
  redstring: { id: 'redstring', tier: 1, price: 14, max: 0, tags: ['fortune'], stats: { luck: 8 }, text: b('+8 福缘', '+8 福缘'), verse: b('千里姻缘一线牵', 'A red thread across a thousand miles') },
  ginseng: { id: 'ginseng', tier: 2, price: 38, max: 0, tags: [], stats: { hp: 8, regen: 1, speed: -2 }, text: b('+8 气血，+1 回气，−2% 身法', '+8 气血, +1 回气, −2% 身法'), verse: b('千年人参', 'A thousand-year root') },
  tigertally: { id: 'tigertally', tier: 2, price: 45, max: 0, tags: [], stats: { dmg: 8 }, text: b('+8% 伤害', '+8% 伤害'), verse: b('虎符调兵', 'The tiger tally moves armies') },
  amulet: { id: 'amulet', tier: 2, price: 40, max: 0, tags: ['moon'], stats: { dodge: 6 }, text: b('+6% 闪避', '+6% 闪避'), verse: b('平安符', 'A charm for safe keeping') },
  balm: { id: 'balm', tier: 2, price: 40, max: 0, tags: [], stats: { steal: 3 }, text: b('+3% 吸血', '+3% 吸血'), verse: b('金疮药到病除', 'Wound balm, and the hurt is gone') },
  elixir: { id: 'elixir', tier: 3, price: 90, max: 0, tags: [], stats: { hp: 12, dmg: 6, armor: 2, regen: 1 }, text: b('+12 气血，+6% 伤害，+2 护甲，+1 回气', '+12 气血, +6% 伤害, +2 护甲, +1 回气'), verse: b('九转金丹', 'The ninefold golden elixir') },
  // ─────────────────────────────── 9.2 conditional
  drumroll: {
    id: 'drumroll', tier: 1, price: 22, max: 1, tags: [], fx: [{ hook: 'cond', do: 'stats', stats: { aspd: 40 }, when: { k: 'waveTime', below: 8 } }],
    text: b('每重前 8 秒 +40% 攻速', 'First 8 s of each wave: +40% 攻速'), verse: b('一鼓作气，再而衰', 'One drumbeat for courage; the second fades'),
  },
  gall: {
    id: 'gall', tier: 1, price: 24, max: 5, tags: [], fx: [{ hook: 'onWaveEnd', do: 'grow', stat: 'hp', v: 2 }],
    text: b('每重结束 +2 气血上限', '+2 max 气血 at the end of every wave'), verse: b('卧薪尝胆', 'Sleeping on brushwood, tasting gall'),
  },
  backwater: {
    id: 'backwater', tier: 2, price: 48, max: 1, tags: ['heavy'], fx: [{ hook: 'cond', do: 'stats', stats: { dmg: 30, aspd: 20 }, when: { k: 'hpBelow', v: 0.4 } }],
    text: b('气血低于 40%：+30% 伤害，+20% 攻速', 'Below 40% HP: +30% 伤害, +20% 攻速'), verse: b('背水一战', 'A battle with the river at your back'),
  },
  atease: {
    id: 'atease', tier: 2, price: 42, max: 1, tags: ['music', 'go', 'heavy'], fx: [{ hook: 'cond', do: 'stats', stats: { aspd: 25, armor: 2 }, when: { k: 'still', s: 0.5 } }],
    text: b('站定 0.5 秒：+25% 攻速，+2 护甲', 'After standing still 0.5 s: +25% 攻速, +2 护甲'), verse: b('以逸待劳', 'Rested, waiting for the weary'),
  },
  versatile: {
    id: 'versatile', tier: 2, price: 50, max: 1, tags: [],
    fx: [{ hook: 'cond', do: 'convert', from: 'classes', per: 1, k: 3, to: ['dmg'], max: 99 }, { hook: 'cond', do: 'convert', from: 'classes', per: 1, k: 2, to: ['aspd'], max: 99 }],
    text: b('每种兵器类别 +3% 伤害、+2% 攻速', '+3% 伤害 and +2% 攻速 per distinct weapon class'), verse: b('八面玲珑', 'Graceful on all eight sides'),
  },
  chasewind: {
    id: 'chasewind', tier: 2, price: 45, max: 1, tags: ['fist', 'moon'], fx: [{ hook: 'cond', do: 'convert', from: 'speed', per: 3, to: ['dmg'], max: 30 }],
    text: b('身法每 3% +1% 伤害（至多 +30%）', '+1% 伤害 per 3% 身法 above 0 (max +30%)'), verse: b('追风逐电', 'Chasing wind and lightning'),
  },
  ironbone: {
    id: 'ironbone', tier: 2, price: 48, max: 1, tags: ['heavy'], fx: [{ hook: 'cond', do: 'convert', from: 'armor', per: 1, to: ['dmg'], max: 30, pool: 'armorDmg' }],
    text: b('护甲每点 +1% 伤害（至多 +30%）', '+1% 伤害 per point of 护甲 (max +30%)'), verse: b('铁骨铮铮', 'Bones of iron'),
  },
  physician: {
    id: 'physician', tier: 3, price: 90, max: 1, tags: [], fx: [{ hook: 'cond', do: 'convert', from: 'regen', per: 1, k: 0.5, to: ['melee', 'ranged', 'elem', 'spirit'], max: 15 }],
    text: b('回气的 50% 加于近战、远程、五行、造化（各至多 +15）', 'Adds 50% of 回气 to 近战, 远程, 五行 and 造化 (max +15 each)'), verse: b('悬壶济世', 'Hanging the gourd to heal the world'),
  },
  // ─────────────────────────────── 9.3 economy
  basket: { id: 'basket', tier: 1, price: 20, max: 0, tags: ['fortune'], stats: { harvest: 6 }, text: b('+6 收成', '+6 收成'), verse: b('竹篮打水', 'Drawing water with a bamboo basket') },
  coinstring: { id: 'coinstring', tier: 1, price: 18, max: 0, tags: ['fortune'], stats: { pickup: 30, harvest: 2 }, text: b('+30% 拾取，+2 收成', '+30% 拾取, +2 收成'), verse: b('一串铜钱', 'A string of cash') },
  lots: { id: 'lots', tier: 2, price: 40, max: 2, tags: ['fortune'], fx: [{ hook: 'shop', do: 'freeReroll', n: 1 }], text: b('每市 +1 次免费刷新', '+1 free reroll per shop'), verse: b('上上签', 'The best of lots') },
  pawn: { id: 'pawn', tier: 1, price: 20, max: 1, tags: ['fortune'], fx: [{ hook: 'shop', do: 'sell', frac: 0.6 }], text: b('兵器按 60% 卖出', 'Weapons sell for 60%'), verse: b('当票一张', 'One pawn ticket') },
  luckycat: {
    id: 'luckycat', tier: 2, price: 48, max: 2, tags: ['fortune'], stats: { luck: 10 }, fx: [{ hook: 'onKill', do: 'drop', kind: 'goldShard', p: 0.02, luck: true }],
    text: b('+10 福缘；击杀 2%（随福缘）落金月华（值 4）', '+10 福缘; kills 2% (luck-scaled) drop a gold 月华 shard worth 4'), verse: b('招财进宝', 'Beckoning wealth'),
  },
  miser: {
    id: 'miser', tier: 2, price: 45, max: 1, tags: ['fortune'],
    fx: [{ hook: 'cond', do: 'convert', from: 'moonHeld', per: 10, to: ['dmg'], max: 40 }, { hook: 'shop', do: 'price', pct: 8 }],
    text: b('每持 10 月华 +1% 伤害（至多 +40%）；市价 +8%', '+1% 伤害 per 10 月华 held (max +40%); shop prices +8%'), verse: b('一毛不拔', 'Not a single feather plucked'),
  },
  abacus: {
    id: 'abacus', tier: 2, price: 42, max: 3, tags: ['fortune'], fx: [{ hook: 'onWaveEnd', do: 'interest', per: 10, max: 25 }],
    text: b('每重结束，每 10 未花月华 +1（每件至多 +25）', 'At wave end, +1 月华 per 10 unspent (max +25 each)'), verse: b('铁算盘', 'An iron abacus'),
  },
  // ─────────────────────────────── 9.4 墨宝
  xuan: { id: 'xuan', tier: 1, price: 24, max: 6, tags: ['ink'], stats: { summonCap: 1, spirit: 1 }, text: b('+1 墨宝上限，+1 造化', '+1 墨宝上限, +1 造化'), verse: b('洛阳纸贵', 'Paper dear in Luoyang') },
  duanyan: {
    id: 'duanyan', tier: 2, price: 48, max: 3, tags: ['ink'], stats: { spirit: 3 }, fx: [{ hook: 'summon', do: 'life', pct: 30 }],
    text: b('墨宝存续 +30%；+3 造化', '墨宝 last 30% longer; +3 造化'), verse: b('端砚一方', 'One Duan inkstone'),
  },
  splash: {
    id: 'splash', tier: 2, price: 45, max: 1, tags: ['ink'], fx: [{ hook: 'summon', do: 'burst', base: 10, scale: { spirit: 1 }, r: 110, slow: 40, dur: 2 }],
    text: b('墨宝散去时爆墨：10 + 100% 造化，r 110，缓 40% 2 秒', 'A 墨宝 that ends bursts: 10 + 100% 造化 in r 110, slowing 40% for 2 s'), verse: b('泼墨山水', 'Splashed-ink landscape'),
  },
  inkbamboo: {
    id: 'inkbamboo', tier: 2, price: 44, max: 2, tags: ['ink'],
    fx: [{ hook: 'onTick', do: 'sprout', summon: 'mozhu', every: 12, life: 10, base: 6, scale: { spirit: 0.8 }, cd: 0.7, range: 360 }],
    text: b('每 12 秒足下生竹 10 秒，发竹叶（6 + 80% 造化，0.7 秒，射程 360）', 'Every 12 s a bamboo sprouts for 10 s, firing leaves (6 + 80% 造化, every 0.7 s, range 360)'), verse: b('胸有成竹', 'Bamboo already in the heart'),
  },
  inkcrane: {
    id: 'inkcrane', tier: 2, price: 42, max: 2, tags: ['ink'],
    fx: [{ hook: 'onWaveStart', do: 'familiar', summon: 'mohe', base: 4, scale: { spirit: 0.6 }, cd: 0.8, fetch: 300 }],
    text: b('常伴墨鹤：每 0.8 秒啄 4 + 60% 造化，衔回 300 内月华', 'A crane familiar: pecks 4 + 60% 造化 every 0.8 s, fetches 月华 within 300'), verse: b('鹤鸣九皋', 'The crane cries in the marsh'),
  },
  inkpool: {
    id: 'inkpool', tier: 3, price: 75, max: 1, tags: ['ink'], stats: { summonCap: 1 }, fx: [{ hook: 'cond', do: 'convert', from: 'summons', per: 1, to: ['armor'], max: 10 }],
    text: b('+1 墨宝上限；每个在场墨宝 +1 护甲（至多 +10）', '+1 墨宝上限; +1 护甲 per living 墨宝 (max +10)'), verse: b('临池学书，池水尽黑', 'Practising by the pond until it ran black'),
  },
  dotting: {
    id: 'dotting', tier: 3, price: 92, max: 1, tags: ['ink'], fx: [{ hook: 'summon', do: 'crit', x: 2.0, aspd: 20 }],
    text: b('墨宝可暴击（用你的暴击，×2.0），+20% 攻速', '墨宝 can crit (your 暴击, ×2.0) and get +20% 攻速'), verse: b('画龙点睛', 'Dotting the dragon\'s eyes'),
  },
  // ─────────────────────────────── 9.5 仙剑
  tassel: {
    id: 'tassel', tier: 1, price: 22, max: 0, tags: ['flying'], fx: [{ hook: 'cond', do: 'stats', stats: { aspd: 5, range: 15 }, cls: 'flying' }],
    text: b('仙剑 +5% 攻速，+15 射程', '仙剑 weapons +5% 攻速, +15 射程'), verse: b('剑穗飘飘', 'The tassel streams'),
  },
  swordqi: {
    id: 'swordqi', tier: 2, price: 45, max: 1, tags: ['flying'], fx: [{ hook: 'sword', do: 'trail', pierce: 1, pct: 30 }],
    text: b('飞剑 +1 穿透，留剑气 30%', 'Flying swords +1 穿透 and leave a slash trail dealing 30%'), verse: b('剑气纵横三万里', 'Sword qi across thirty thousand li'),
  },
  swordheart: {
    id: 'swordheart', tier: 2, price: 50, max: 1, tags: ['flying'], fx: [{ hook: 'cond', do: 'stats', stats: { crit: 15, critDmg: 30 }, when: { k: 'swordsAir', n: 3 }, cls: 'flying' }],
    text: b('3 剑以上在空：仙剑 +15% 暴击，暴伤 +0.3', 'With 3+ swords aloft: 仙剑 +15% 暴击, crit ×+0.3'), verse: b('剑心通明', 'A sword heart, clear and bright'),
  },
  washpool: {
    id: 'washpool', tier: 2, price: 40, max: 1, tags: ['flying'], fx: [{ hook: 'sword', do: 'returnHeal', v: 1, capPerSec: 2 }],
    text: b('每剑归来回 1（每秒至多 2）', 'Each returning sword heals 1 (max 2 HP/s)'), verse: b('洗剑池边', 'By the sword-washing pool'),
  },
  yujian: { id: 'yujian', tier: 3, price: 88, max: 2, tags: ['flying'], stats: { swords: 1 }, text: b('+1 剑数', '+1 剑数'), verse: b('御剑乘风来', 'Riding the sword on the wind') },
  swordtomb: {
    id: 'swordtomb', tier: 3, price: 90, max: 1, tags: ['flying'], fx: [{ hook: 'sword', do: 'special', key: 'swordtomb', p: { per: 15, max: 8, base: 5, ranged: 0.5 } }],
    text: b('每重每 15 次飞剑击杀，+1 残剑绕身至重末（5 + 50% 远程；至多 8）', 'Every 15 sword kills in a wave, +1 broken sword orbits you (5 + 50% 远程; max 8)'), verse: b('剑冢埋锋', 'Blades buried in the sword tomb'),
  },
  // ─────────────────────────────── 9.6 archetype
  yellowpaper: {
    id: 'yellowpaper', tier: 2, price: 36, max: 3, tags: ['talisman'], stats: { elem: 1 }, fx: [{ hook: 'onHit', do: 'burnMod', stacks: 1, dur: 1 }],
    text: b('+1 五行；灼烧 +1 层上限、多 1 秒', '+1 五行; burns +1 stack cap and last 1 s longer'), verse: b('黄纸朱符', 'Yellow paper, vermilion charm'),
  },
  fivethunder: {
    id: 'fivethunder', tier: 3, price: 95, max: 1, tags: ['talisman'], fx: [{ hook: 'onHit', do: 'chainMod', chains: 1, ignite: true, stun: 0.1, stunDur: 0.5 }],
    text: b('雷链 +1；雷击杀引燃；10% 晕 0.5 秒', 'Lightning chains +1; lightning kills ignite; 10% to stun 0.5 s'), verse: b('五雷正法', 'The true rite of five thunders'),
  },
  lingering: {
    id: 'lingering', tier: 2, price: 48, max: 1, tags: ['music'], fx: [{ hook: 'onHit', do: 'echo', cls: 'music', delay: 0.4, pct: 50 }],
    text: b('乐器之击 0.4 秒后回响 50%', '乐器 attacks echo after 0.4 s at 50%'), verse: b('余音绕梁，三日不绝', 'The echo circled the beams three days'),
  },
  boya: {
    id: 'boya', tier: 3, price: 85, max: 1, tags: ['music'], fx: [{ hook: 'onHit', do: 'charmMod', x: 1.5, dmgPct: 50, base: 20, scale: { elem: 1.5 } }],
    text: b('惑几率 ×1.5；受惑者伤害 +50%，惑毕爆 20 + 150% 五行', 'Charm chances ×1.5; charmed deal +50% and burst for 20 + 150% 五行 when it ends'), verse: b('伯牙绝弦', 'Boya breaks his strings'),
  },
  dukang: {
    id: 'dukang', tier: 2, price: 42, max: 2, tags: ['wine'], stats: { crit: 8 }, fx: [{ hook: 'onCrit', do: 'drunk', v: 2 }],
    text: b('+8% 暴击；暴击 +2 醉（得醉意）', '+8% 暴击; crits add +2 醉 (grants the 醉 meter)'), verse: b('何以解忧，唯有杜康', 'What eases sorrow? Only Dukang'),
  },
  nightcup: {
    id: 'nightcup', tier: 3, price: 85, max: 1, tags: ['wine'], stats: { critDmg: 50 }, fx: [{ hook: 'onCrit', do: 'heal', v: 1, capPerSec: 3 }],
    text: b('暴伤 +0.5；暴击回 1（每秒至多 3）', 'Crit multiplier +0.5; crits heal 1 (max 3 HP/s)'), verse: b('葡萄美酒夜光杯', 'Fine grape wine in a luminous cup'),
  },
  dragblade: {
    id: 'dragblade', tier: 2, price: 48, max: 1, tags: ['heavy'], fx: [{ hook: 'onHit', do: 'every', cls: 'heavy', n: 3, x: 2, knock: 100 }],
    text: b('重器每第三挥 ×2，+100 击退', 'Every 3rd 重器 swing deals ×2 with +100 击退'), verse: b('拖刀计', 'The trailing-blade ruse'),
  },
  thorns: {
    id: 'thorns', tier: 2, price: 42, max: 0, tags: ['heavy'], fx: [{ hook: 'onHurt', do: 'thorns', base: 3, scale: { armor: 0.6 } }],
    text: b('受击时，对来敌造成 3 + 60% 护甲', 'When hit, deal 3 + 60% 护甲 to the attacker'), verse: b('披荆斩棘', 'Cutting through thorns'),
  },
  goldenbell: {
    id: 'goldenbell', tier: 3, price: 92, max: 1, tags: ['heavy'],
    fx: [{ hook: 'onWaveStart', do: 'block', n: 1 }, { hook: 'onHurt', do: 'thorns', base: 0, scale: { armor: 1 }, dealtPct: 20, meleeOnly: true }],
    text: b('每重挡首击；近身来敌受 100% 护甲 + 其伤害的 20%', 'Blocks the first hit of every wave; melee attackers take 100% 护甲 + 20% of what they dealt'), verse: b('金钟罩，铁布衫', 'Golden bell, iron shirt'),
  },
  gomanual: {
    id: 'gomanual', tier: 2, price: 45, max: 2, tags: ['go'], stats: { stones: 2 }, fx: [{ hook: 'cond', do: 'stats', stats: { area: 20 }, cls: 'go' }],
    text: b('+2 棋子；爆 +20% 范围', '+2 棋子; blasts +20% 范围'), verse: b('棋谱在手', 'A manual in hand'),
  },
  capture: {
    id: 'capture', tier: 3, price: 90, max: 1, tags: ['go'], fx: [{ hook: 'onTick', do: 'special', key: 'capture', p: { n: 3, r: 90, x: 3 } }],
    text: b('敌在 3 子 90 内即被提：300% 棋子伤害，无视护甲', 'An enemy within 90 of 3+ stones is captured: 300% stone damage, ignoring 甲'), verse: b('提子', 'Capture'),
  },
  moonsoul: {
    id: 'moonsoul', tier: 2, price: 52, max: 1, tags: ['moon'], fx: [{ hook: 'onDodge', do: 'shards', n: 3, base: 8, scale: { elem: 0.6 } }],
    text: b('每闪避发 3 枚追踪月魄（8 + 60% 五行）', 'Each dodge fires 3 homing moon shards (8 + 60% 五行)'), verse: b('月魄飞来', 'The moon\'s soul flies'),
  },
  osmanthus: {
    id: 'osmanthus', tier: 3, price: 90, max: 1, tags: ['moon'], fx: [{ hook: 'cond', do: 'cap', stat: 'dodge', v: 10 }, { hook: 'onDodge', do: 'buff', stats: { dmg: 30 }, dur: 2 }],
    text: b('闪避上限 +10；闪避后 2 秒 +30% 伤害', 'Dodge cap +10; +30% 伤害 for 2 s after a dodge'), verse: b('人闲桂花落', 'Idle, the osmanthus falls'),
  },
  lingbo: {
    id: 'lingbo', tier: 3, price: 85, max: 1, tags: ['fist'], fx: [{ hook: 'onTick', do: 'special', key: 'lingbo', p: { base: 3, per10: 8, tick: 0.5 } }],
    text: b('行则留痕：每 0.5 秒伤 3 + 身法每 10% 加 8', 'Moving leaves a trail dealing 3 + 8 per 10% 身法, every 0.5 s'), verse: b('凌波微步，罗袜生尘', 'Treading the waves, dust from silk stockings'),
  },
  cushion: {
    id: 'cushion', tier: 1, price: 22, max: 3, tags: [], fx: [{ hook: 'cond', do: 'stats', stats: { regen: 50 }, pct: true, when: { k: 'still', s: 1 } }],
    text: b('站定 1 秒：回气 +50%（每件叠加）', 'After standing still 1 s, 回气 +50% (additive per stack)'), verse: b('一蒲团，一炷香', 'One cushion, one stick of incense'),
  },
  // ─────────────────────────────── 9.7 劫
  cuthair: { id: 'cuthair', tier: 1, price: 10, max: 0, tags: [], stats: { dmg: 10, hp: -2 }, curse: 1, text: b('+10% 伤害，−2 气血；劫 +1', '+10% 伤害, −2 气血; 劫 +1'), verse: b('断发明志', 'Cutting the hair to show resolve') },
  burnboats: {
    id: 'burnboats', tier: 3, price: 70, max: 1, tags: [], stats: { dmg: 15, aspd: 15 }, curse: 1, fx: [{ hook: 'shop', do: 'noReroll' }],
    text: b('+15% 伤害，+15% 攻速；此后不可刷新或锁定；劫 +1', '+15% 伤害, +15% 攻速; no more rerolls or locks; 劫 +1'), verse: b('破釜沉舟', 'Break the pots, sink the boats'),
  },
  yanwang: {
    id: 'yanwang', tier: 3, price: 80, max: 1, tags: [], curse: 2, fx: [{ hook: 'onLethal', do: 'survive', per: 'wave', hpPct: 0 }],
    text: b('每重一次，致命一击留 1 气血；劫 +2', 'Once per wave, a lethal hit leaves you at 1 HP; 劫 +2'), verse: b('阎王叫你三更死', 'When Yama calls at the third watch'),
  },
  delusion: {
    id: 'delusion', tier: 2, price: 20, max: 1, tags: [], curse: 2, fx: [{ hook: 'cond', do: 'world', budgetPct: 20, moonPct: 10 }],
    text: b('出怪预算 +20%；月华 +10%；劫 +2', 'Spawn budget +20%; 月华 value +10%; 劫 +2'), verse: b('妄念纷飞', 'Deluded thoughts scatter'),
  },
  innerdemon: {
    id: 'innerdemon', tier: 2, price: 30, max: 1, tags: [], stats: { dmg: 20 }, curse: 2, fx: [{ hook: 'onWaveStart', do: 'demon', pct: 40 }],
    text: b('+20% 伤害；每重生出你的魔影（40% 气血与伤害），斩之得镜奁；劫 +2', '+20% 伤害; each wave a 40% copy of you spawns; killing it drops a 镜奁; 劫 +2'), verse: b('心魔难除', 'The inner demon is hard to slay'),
  },
  crackedmirror: {
    id: 'crackedmirror', tier: 3, price: 70, max: 1, tags: [], curse: 3, fx: [{ hook: 'shop', do: 'slot', n: 1 }, { hook: 'shop', do: 'odds', t3: 5, t4: 5 }],
    text: b('+1 市位；仙、神几率各 +5；劫 +3', '+1 shop slot; +5 points each to 仙 and 神 odds; 劫 +3'), verse: b('破镜难圆', 'A broken mirror is hard to mend'),
  },
  // ─────────────────────────────── 9.8 神品
  wanjian: {
    id: 'wanjian', tier: 4, price: 150, max: 1, tags: ['flying'], stats: { swords: 2 }, from: 8, fx: [{ hook: 'sword', do: 'special', key: 'wanjian', p: { min: 8, every: 8, strikes: 2, pct: 60 } }],
    text: b('+2 剑数；8 剑以上时每 8 秒万剑聚于最密处，每剑两击 60%', '+2 剑数; with 8+ swords, every 8 s all swords converge on the densest cluster, striking twice at 60%'), verse: b('万剑归宗', 'Myriad swords return to the source'),
  },
  inkdragon: {
    id: 'inkdragon', tier: 4, price: 150, max: 1, tags: ['ink'], from: 8, fx: [{ hook: 'summon', do: 'special', key: 'inkdragon', p: { x: 5, every: 12, r: 60 } }],
    text: b('一墨宝常醒为墨龙（最老者每 12 秒再醒）：×5 伤害，飞行，穿透，咬 r 60', 'One 墨宝 is always a 墨龙 (the oldest re-wakes every 12 s): ×5, flies, pierces, bites r 60'), verse: b('墨龙出图', 'The ink dragon leaves the scroll'),
  },
  dugu: {
    id: 'dugu', tier: 4, price: 140, max: 1, tags: [], from: 8, fx: [{ hook: 'cond', do: 'special', key: 'dugu', p: { x: 3, aspd: 60, count: 6 } }],
    text: b('仅持一兵：算作其类 6 件，×3 伤害，+60% 攻速', 'With exactly one weapon: it counts as 6 of its class, deals ×3 and gets +60% 攻速'), verse: b('独孤求败', 'Dugu, who sought defeat'),
  },
  samadhi: {
    id: 'samadhi', tier: 4, price: 145, max: 1, tags: ['talisman'], from: 8, fx: [{ hook: 'onTick', do: 'special', key: 'samadhi', p: { r: 300, stackX: 2 } }],
    text: b('身周 300 内灼烧不灭；灼烧层数上限翻倍', 'Burns within 300 of you never expire; the burn stack cap doubles'), verse: b('三昧真火', 'The true fire of samadhi'),
  },
  treasurebowl: {
    id: 'treasurebowl', tier: 4, price: 130, max: 1, tags: ['fortune'], from: 8,
    fx: [{ hook: 'onWaveEnd', do: 'interest', pct: 15, max: 60 }, { hook: 'shop', do: 'freeReroll', n: 1 }],
    text: b('每重结束，所持月华 +15% 利（至多 60）；每市 +1 免费刷新', 'At wave end, +15% interest on 月华 held (max 60); +1 free reroll per shop'), verse: b('聚宝盆，取之不竭', 'The treasure bowl never empties'),
  },
  penglai: {
    id: 'penglai', tier: 4, price: 140, max: 1, tags: [], from: 8, stats: { hp: 20, regen: 4 }, fx: [{ hook: 'onLethal', do: 'survive', per: 'run', hpPct: 0.5, clearShots: true }],
    text: b('+20 气血，+4 回气；一局一次，镜碎时以 50% 气血复生，并清敌弹', '+20 气血, +4 回气; once per run, revive at 50% HP and clear every enemy shot'), verse: b('蓬莱仙丹', 'The elixir of Penglai'),
  },
  ambush: {
    id: 'ambush', tier: 4, price: 150, max: 1, tags: ['music', 'talisman'], from: 8, fx: [{ hook: 'onHit', do: 'special', key: 'ambush', p: { every: 4, pct: 40 } }],
    text: b('乐器或符箓每第四击，其余乐器与符箓齐发，40%', 'Every 4th 乐器/符箓 attack fires your other 乐器 and 符箓 weapons at 40%'), verse: b('十面埋伏', 'Ambush on all ten sides'),
  },
  needle: {
    id: 'needle', tier: 4, price: 150, max: 1, tags: ['heavy'], from: 8, stats: { armor: 8 },
    fx: [{ hook: 'cond', do: 'immune', to: 'knock' }, { hook: 'cond', do: 'convert', from: 'armor', per: 1, to: ['dmg'], max: 40, pool: 'armorDmg' }],
    text: b('+8 护甲；不受击退；护甲每点 +1% 伤害（与铁骨合计至多 +40%）', '+8 护甲; no knockback; +1% 伤害 per 护甲 (with 铁骨, max +40%)'), verse: b('定海神针', 'The pillar that calms the sea'),
  },
  jiangjinjiu: {
    id: 'jiangjinjiu', tier: 4, price: 150, max: 1, tags: ['wine'], from: 8, fx: [{ hook: 'onCrit', do: 'special', key: 'jiangjinjiu', p: { cap: 200, autoCrit: 100, drain: 2 } }],
    text: b('醉上限 200；醉 ≥100 时每击必暴；醉消散翻倍', '醉 cap 200; at 醉 100+ every hit crits; 醉 drains twice as fast'), verse: b('君不见黄河之水天上来', 'See how the Yellow River pours from the sky'),
  },
  watermoon: {
    id: 'watermoon', tier: 4, price: 160, max: 1, tags: ['moon'], from: 8, stats: { armor: -4 }, fx: [{ hook: 'onHit', do: 'special', key: 'watermoon', p: { pct: 50 } }],
    text: b('每件兵器另向身后发镜像一击 50%；−4 护甲', 'Every weapon also fires a mirrored attack behind you at 50%; −4 护甲'), verse: b('镜花水月', 'Flowers in a mirror, the moon in water'),
  },
};
