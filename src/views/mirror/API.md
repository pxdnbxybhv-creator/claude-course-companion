# 水月幻镜 · module contract

This is the contract every builder codes against. Use it with **`ids.ts`**, the registry of every entity id, and **`types.ts`**, which holds every shared type and interface. The design lives in the GDD (`scratchpad/mirror/gdd.md`). Its numbers come from the reference sim (`scratchpad/mirror/sim/`, v1 tables in `data.js`, then every ⚖ patch in `tuning.js`, then `econ.js`). Port the sim's formulas faithfully.

To change `ids.ts`, `types.ts` or this file after the contracts step, send a change request to the integrator. Do not edit them yourself.

---

## 0. How the modules fit

```
               ┌──────────── src/app/mirror.ts (eager, tiny) ─────────────┐
               │ MirrorMeta signal · sanitizeMirror · saveMetaNow · payOwed│
               │ backupExtras registration · reconcile on load             │
               └───────────────▲───────────────────────────▲──────────────┘
                               │ meta                      │ meta, purse (play.ts)
   ui/* + MirrorView.tsx ──────┼──── logic/session.ts ─────┘   (the only effectful logic)
   (screens, input, HUD refs)  │         │ pure calls
        │    ▲ hooks           │         ▼
        │    │           logic/* (pure, node-tested) ◀──── data/* (typed tables keyed by ids.ts)
        ▼    │                   ▲          ▲
   engine/* (createEngine) ──────┘          └──── sim/* (镜衡: realbal.ts on the real engine; bot.ts a logic smoke)
        │  ▲ WorldApi
        ▼  │
   engine/content/* (skills, passives, hazards, elites, affixes, treasures, bosses, endless, 节气)
        │
   paint/* (createPainter: atlas, arena, stamps, telegraphs, numbers)   audio/* (createMirrorAudio)
```

- **The data flows one way.** Between waves, the **run** (`RunSave`) is plain JSON owned by logic.
  1. The UI calls pure logic functions, which return a new `RunSave`.
  2. Then it calls `session.commit(run)`, which saves.
  3. For a wave, the UI hands the run and a `WaveSetup` to `engine.start`.
  4. The engine plays that one wave with pooled typed arrays.
  5. It reports back through hooks (`waveEnd` with a `WaveResult`, or `death`).
  6. Logic folds the result into the run.

  The engine never writes the run or meta. Logic never touches the canvas.
- **engine-core** handles everything generic:
  - the loop, the camera, the pools and the spatial hash
  - the player, movement, dodge, i-frames and the damage pipeline
  - the 22 weapon kinds, summons, swords, stones and statuses
  - the regular monsters' AI (8 behaviours, roles, telegraphs)
  - drops and 蓄月, the coin carriers, 重墨 overflow
  - the item-effect interpreter, including `special`s
  - HUD pushes, error recovery and building the `WaveResult`

  **engine-content** handles everything named: the 13 skills (and ☆ alts), the passives' behaviour, hazards, elites, affixes, treasures, bosses (the phase-script runner and pattern library), 双生/镜主, the runtime part of 镜蚀 and the 节气 modifiers. It talks to the core only through `WorldApi` and registers into `ContentRegistry` (§5).
- **paint** knows how things look. The engine asks for sprites by atlas id and draws them with `drawImage`. It never paints strokes in the frame loop.
- **audio** is a thin layer over the app's audio: cached voices plus the `mirror` / `mirror-boss` music themes.
- **The engine is DOM-free apart from its canvas.** The UI owns every DOM listener (stick, keys, visibility, blur) and feeds `engine.input`. Pure modules (`ids`, `types`, `data`, `logic`, `sim`) run in node. They never import from `engine`, `paint`, `audio` or `ui`.

### Ownership

| Builder | Files |
|---|---|
| contracts | `ids.ts`, `types.ts`, `API.md` |
| logic | `data/*`, `logic/*`, `sim/*`, `/src/app/mirror.ts`, the store import in `/src/main.tsx`, `tests/mirror-{data,logic,economy,save,…}.test.ts` |
| engine-core | `engine/*` except `engine/content/*`; `tests/mirror-engine*.test.ts` |
| engine-content | `engine/content/*`; `tests/mirror-content*.test.ts` |
| art | `paint/*`, `audio/*`, the `/src/audio/music-themes.ts` additions and the `MusicTheme` line in `/src/views/walk/map.ts`, `/src/lab/scenes/mirror-*.ts`; `tests/mirror-paint*.test.ts` |
| ui | `ui/*`, `MirrorView.tsx`, `index.ts`, `/src/app/router.ts`, `/src/app/App.tsx`, the tabbar-hide css, `/src/views/quests/helpers.ts` (the 幻镜 ledger row), `/scripts/build_fonts.py` (`MIRROR_DIR`), `/scripts/brush_chars.txt`; `tests/mirror-ui*.test.ts` |

**Round 8 (m8) lanes** (build plan §5). Phase 2 merged their contract into §2.7, §3.1, §4.1, §5.1 and §6.1; the regions below still say who changes what in Phase 3:

| Lane | Files and regions |
|---|---|
| 0 · seams | `types.ts` (then CR only; each lane may add its own types in its `m8:<lane>` block), every new `ids.ts` row, `/src/app/mirror.ts` `CHAR_IDS`, the World seams block, §9's frame |
| B · balance | `data/stats.ts` F outside the m8 blocks, `data/weapons.ts`, the 13 and the 77 outside the m8 blocks, `say.ts` outside the m8 blocks, `STARTER_ITEMS` / `DEED_REG` / `lockOf`, `logic/formulas.ts`, `logic/shop.ts` `rollSlot` / `rollSlots` / fallbacks, `logic/meta.ts` deeds, `logic/economy.ts`, `tutor/*`, `engine/content/skills.ts` (the 13), `engine/content/field.ts`, the Demon branch of `killDrops`, `sim/bot.ts` |
| I · items | the `m8:items` blocks (`data/items.ts`, `say.ts` `ITEM_SAY`, F, glossary, pools, bridge, World, css), `data/glossary.ts`, `ui/describe.ts`, `ui/panelView.ts`, `ui/Shop.tsx`, `paint/items.ts`, `logic/items.ts`, the rest of `logic/shop.ts`, `logic/spawn.ts`, `engine/effects.ts`, `engine/weapons.ts`, `engine/enemies.ts`, `engine/content/items.ts`, `sim/itemvalues.ts`; in world.ts `strike` / `strikeIn`, `statusSlot`, `killIn`, `killDrops` (not the Demon branch), `onDodge`, `recomputeStats`, `begin`'s item block |
| H · hidden | the `m8:hidden` blocks, `logic/hidden.ts`, `sim/realbal.ts`, `engine/content/hidden.ts`, `engine/content/mirrorself.ts`, `engine/verbs.ts`, `engine/rings.ts` (new), `engine/threats.ts`, world.ts `castSkill` / `tickSkill` / `shotHitsPlayer`, `engine/index.ts` `skillPress` / `skillRelease`, `paint/hidden.ts`, `ui/Select.tsx`, `ui/Hud.tsx`, `ui/Results.tsx`, `ui/Codex.tsx` char pages, `ui/icons.tsx`, `ui/tips.ts`, the key region of `ui/Run.tsx` |
| A · art | `paint/*` except `paint/items.ts` and `paint/hidden.ts`, `paint/brushwork.ts` (new), `engine/render.ts` (the hook call site stays), `engine/feel.ts`, world.ts drops (`dropMoon`, `dropOne`, `tickDrops`, `pickup`, `collectMoon`, inside the own-piece seams), `audio/*`, the `m8:art` blocks, `DROP_REG` text |
| S · sandbox | `logic/session.ts`, `logic/lend.ts`, `logic/tuning.ts` (new), `logic/run.ts`, `logic/save.ts`, `sim/sandstart.ts` (new), `engine/index.ts` (not `skillPress` / `skillRelease`), `engine/dev.ts`, `ui/sand/*` (new), `ui/Run.tsx` (not the key region), `ui/Lobby.tsx`, `ui/Meta.tsx`, `ui/Panel.tsx`, `MirrorView.tsx`, `scripts/mirror-tuning.mjs` |

- **Anchors** (`m8:<lane>`): `types.ts` (end), `data/stats.ts` F, `data/glossary.ts` (term ids and terms), `engine/pools.ts`, `engine/content/bridge.ts`, the end of the World class, `ui/mirror.css`.

---

## 1. Conventions

- **Ids.**
  - One flat namespace. Every id in `ids.ts` is unique across all lists and matches `/^[a-z][a-zA-Z0-9]*$/`. `named(id)` finds any row.
  - Companions are the app's `CharacterId`.
  - Names (zh/en) exist only in `ids.ts`. Defs in `data/*` hold numbers and effect text (`text`, `t4`, `verse` as `Bilingual`).
  - The lists' order is the display order.
- **Where contract ids differ from the sim** (`sim/data.js`). Port with this map:

  | Sim | Contract |
  |---|---|
  | monster `osmanthus` (桂花精) | `guihua` (the item `osmanthus` 广寒桂 keeps its id) |
  | boss `clam` (蜃) | `mirage` |
  | boss `watermoon` (水中月) | `moonwater` (the item `watermoon` 水月镜 keeps its id) |
  | archetype policies `ink` `flying` `yanyue` `bell` `talisman` `music` `wine` `fortune` `regen` `go` `moon` `speed` `curse` | `mobao` `xianjian` `zhongbing` `jinzhong` `fulu` `qinxin` `zuixian` `fuyuan` `huichun` `qizhen` `yueying` `jifeng` `jiehuo` |
  | `dugu` and `baijia` | the two poles of `dugubaijia`; `sim/` may keep 15 bot policies |
  | kinds `proj` / `smashAt` | `projectile` / `slam` |
  | kinds for 诸葛连弩 and 钓竿 | `burst` and `hook` |
  | roles `burrow` / `ambush2` / `splitter4` | `burrower` / `ambusher` / `splitter` (with `child.n = 4`) |

- **Difficulty.** Stored as `DiffIndex` 0–5 (`DIFF_REG` order). `DiffId` is for text and seals.
- **Units.**
  - `u` for world distance: the arena is centred on (0, 0), +x east, +y down the screen.
  - Seconds for game time, with a fixed 60 Hz step.
  - Angles in radians in code; degrees only in data (`deg`).
  - Percent stats are additive points.
- **Randomness.** Everything seeded is `logic/rng.ts` `rngFor(seed, wave, stream, k)`, built on `core/rng.ts` `makeRng` and `mixSeed`. Never `Math.random()` in logic, engine or content. Paint may use its own seeds. The streams:

  | Stream | Used for |
  |---|---|
  | `'spawn'` | the wave's `SpawnPlan` |
  | `'shop'` | slots; `k` is the reroll index |
  | `'card'` | level cards; `k = 100·screen + reroll` |
  | `'crate'` | `k` is the crate index |
  | `'heart'` | 镜心 choices |
  | `'coin'` | the coin plan (separate from everything else, §16.3) |
  | `'start'` | 书生's three choices |
  | `'engine'` | core combat rolls |
  | `'content'` | `WorldApi.rng` |

  A reload shows the same shop, cards, spawns and coins. Replaying an interrupted wave uses the same streams.
- **Time and days.** `todayKey()` from `core/date.ts`. `DateKey` is `YYYY-MM-DD` local. Logic takes `today` (and `now: Date` where the sky matters) as arguments, so tests can move the clock.
- **Text.** All in-game text is paired zh/en: `t(zh, en)` in the UI, `Bilingual` in data, `lang` in `EngineSettings` for canvas text.
- **Storage.**
  - Only `src/app/mirror.ts` touches `localStorage`, always in try/catch.
  - The UI may use `localStorage` for per-viewer conveniences, guarded the same way.
  - Downloads (存画) go through `src/app/hostSave.ts`. There is no `alert` or `confirm`: use `Sheet` confirmations.
- **The owner's redeem code** (in `src/app/play.ts`) is never written, shown or logged, and never affects the mirror's pay. Tests use `_acceptCodeForTests('TESTING')`.

---

## 2. Logic (pure; `data/*` + `logic/*`)

Every function below is pure: it takes the run, meta or date it needs and returns new objects without mutating its input. Suggested files are given in brackets; the logic builder may split them differently but keeps these names exported from `logic/index.ts`.

### 2.1 Tables (`data/*`)

```ts
WEAPONS: Record<WeaponId, WeaponDef>        SETS: Record<WClass, ClassSetDef>
ITEMS: Record<ItemId, ItemDef>              ARCHETYPES: Record<ArchetypeId, ArchetypeDef>
MONSTERS: Record<MonsterId, MonsterDef>     ELITES: Record<EliteId, EliteDef>     TREASURES: Record<TreasureId, TreasureDef>
BOSSES: Record<BossId, BossDef>             MAPS: Record<MapId, MapDef>           HAZARDS: Record<HazardId, HazardDef>
COMPANIONS: Record<CharacterId, CompanionDef>  SKILLS: Record<SkillId | AltSkillId, SkillDef>  PASSIVES: Record<PassiveId, PassiveDef>
DIFFS: readonly DifficultyDef[] (index = DiffIndex)   VOWS: Record<VowId, VowDef>   MUTATORS: Record<MutatorId, MutatorDef>
AFFIXES: Record<AffixId, AffixDef>          TERM_MODS: Record<TermModId, TermModDef>   HEART: Record<HeartFaceId, HeartFaceDef>
F (formula constants, ⚖ values), PAY (economy constants: FEE 20, RUN_CAP 70, CEIL 300, COIN_RUN 20, COIN_DAY 30 …)
```

Deeds are fully described by `DEED_REG` in `ids.ts`: what each unlocks, the `RunStatKey` it reads, the goal and the mode.

**镜宝 (boss relics, ⚖5 / m6).** `ITEMS.wangchen` 忘尘镜 (*Dustless Mirror*, `relic: 'ranged'`: 伤害 +50, 暴击率 +50, 攻速 +20, 移速 +20, `inkCrit: 1.5`) and `ITEMS.longyuan` 龙渊剑 (*Longyuan Sword*, `relic: 'melee'`: 气血 +100, 护甲 +20, 移速 +20, `reachPct: 20`). Group `relic` (codex 187 pages), tier 4, `price: 0`, `max: 0` (no stack cap), no deed lock. `ItemDef.relic` keeps an item out of `itemPool` (shop, 镜奁, 镜心, the 心镜 pack) and makes its stats exact in `computeStats` (大橘's and 嫦娥's gain factors skip it). `ItemDef.reachPct` is 攻击距离 % on every weapon (not 射程); `ItemDef.inkCrit` lets 墨宝 crit (`dottingX` takes the largest source: 画龙点睛 ×2.0). `CompanionDef.style` breaks a relic tie. Words: glossary term `relic`, `ITEM_SAY.wangchen.more` / `longyuan.say` through `ui/describe.ts`. In a fight (`engine/world.ts grantRelic`) one is granted when the last living body of a boss id falls (`relicFor` at that moment): the sheet is recomputed with it at once (the static converts 铁骨 / 定海神针 / 追风逐电 / 悬壶 follow; +100 max 气血 heals by 100; reach and 墨宝 crit follow), a centre title 「得 忘尘镜」 / "Dustless Mirror +1" shows, and the icon (drop kinds `relicMirror` / `relicSword`, cosmetic) pops from the body and flies to you ('merge' chime, a level ring). `WaveResult.relics` lists them; a death later in the wave loses them with the run, a revive keeps them. The shop before a boss wave names the relic (`ui/Shop.tsx RelicNext`, from `relicFor`; with endless 双生's two different bosses it says each one gives one). `TutorTipId` `'relic'`: the first shop after an account's first 镜宝 shows a one-time coach card (`TIPS.relic` in `tutor/lines.ts`, pointing at the 行囊 tab; `TipsBrain` in `ui/Tutorial.tsx`, after the shop primer), only while 新手提示 is on.

### 2.1a Balance: tune on the real engine (`sim/realbal.ts`)

- **`sim/realbal.ts` is the balance harness.** `playReal({ seed, char, map, maxWave, beginner, godTo })` plays a whole run on the real engine and `CONTENT`, headless (debug painter, no canvas, ~0.05–0.1 ms a step: a run to wave 31 in seconds). A kiting bot moves; `sim/bot.ts`'s card, crate, 镜心 and shop policy plays between waves. It returns the waves cleared, the trace and the fatal wave's damage by source (`p2 carp` = the boss's phase 2). Sweep: `MIRROR_REALBAL=1 SEEDS=6 npx vitest run tests/mirror-realbal.test.ts` (add `BEGIN=1` for the beginner, `OUT=file.jsonl` to keep rows).
- **The in-app sim (`sim/bot.ts`, `sim/balance.ts`) is a smoke test only.** Its simplified combat step disagrees with the real engine both ways (for the same seeds it gave mean wave 15.8 skilled where the engine gives 19; median 4 beginner where the engine gives 8). It checks that logic runs whole runs deterministically. It does not vouch for `balance.md`'s depths.
- Bot play is not human play: read the harness's depths as relative (before / after a change), and its fatal-source tallies as where to look.
- ⚖3 (2026-09-27, from the harness): enemy damage growth `F.dmg.grow` 1.08 → 1.06; 白鹭 6 → 5; 鲤王's spirals 8 → 6 a second, leap rings 60° gaps at 260 u/s for 60%, the beam 10 → 7. Skilled bot, 月湖 照影, 13 companions × 6 seeds, same bot before and after: median wave 18.5 → 21, reach 20 41% → 56%, clear 30 8% → 18%, wave-10 hazard 32% → 13% (design 1.8%). The beginner bot's median stays 8 (target 9). Still far from `balance.md` §5 (clear-30 56–96%): the next walls are 蜃 at 20, 水中月 at 30 and waves 21–29.
- **Bot levels (m6):** `playReal({ …, level })` with `level: 'beginner' | 'average' | 'skilled'` (default skilled; `beginner: true` still works). *Average* reacts at 10 Hz (holds its last move every other call), keeps foes at 230 u, sidesteps shots but ignores telegraphs, and buys like the skilled bot. `botStep(W, eng, level, st)` is exported for probes. The sweep takes `LEVEL=a,b` (default all three), `CHARS`, `DIFF`, `SEEDS`, `MAXW`, `OUT`, and prints one summary a level (median, mean, reach 10/20, clear 30/40, errors, timeouts). Each run row carries `relics` (`wangchen2`) and `weapons` (`qingfeng3`).
- ⚖5 (m6, 2026-09-28): companions +10 气血 +2 护甲 (关公 +12 / +3; the nine ranged +1 more); seven melee weapons ×1.25–1.4, faster, +20–30 reach; melee sets (剑 +近战/吸血, 重器 +护甲/气血 5·10, 拳 +攻速/吸血); melee hits carry 吸血 +3% (`F.meleeSteal`); i-frames 0.5 s; 水母 6 → 4; 同流派 shop; 紫/红 odds and prices; HP by band; late damage 1.09 (21–30) and 1.08 (endless; the owner wants late waves winnable. QA fix: at 1.06 a bot that steps out of ground clouds reached the wave-70 cap in 54% of runs, at 1.10 in 12%, median wave 54.5); 嫦娥 takes half the burn of ground zones and is never slowed by them (was immune: she reached the cap every run); 侠客 气血 36 护甲 5, 诗仙 气血 38; 镜境 damage step doubled from 明镜; the two 镜宝. Measured in the §1.8 table of the m6 plan and re-run by BALANCE and the QA fix round.
- 视野 fix (2026-09-28): ranged monsters wind up only within `SHOOT_R` 420 u of you (was 700; 冰魄 and the 莲蓬 turret had none), and keepers settle 0–60 u inside their keep distance (was ±30). Same bot, 13 companions × 2 seeds to wave 31, before → after: 幽林 mean wave 14.6 → 14.7 (median 15 → 16), shooters' share of the hits taken 14% → 10% (灯魅 225 → 31, 山魈 84 → 22, 樵鬼 57 → 173: it now throws its boomerang from closer); 天宫 mean 21.7 → 22.5 (median 23 → 24), shooters' share 11% → 5% (莲蓬 356 → 0, 雷部小吏 202 → 34, 冰魄 292 → 395). A slight easing for a kiting bot; a player who stands and fights meets the same shooters on screen instead of off it.

### 2.2 Formulas and the run (`logic/formulas.ts`, `rng.ts`, `spawn.ts`, `arena.ts`, `run.ts`)

```ts
rngFor(seed: number, wave: number, stream: string, k?: number): Rng
computeStats(run: RunSave): Stats          // base + companion + passive + items + sets + cards + 心镜 + 劫数 + static conds
waveLen(w: number, run: RunSave): number | null      // null on boss waves; 急景 / 立夏 / 夏至 applied
budget(w, run): number;  hpX(w, run): number;  dmgX(w, run): number;  spdX(w, run): number;  bossHp(w, run): number
armorMult(a: number): number;  cooldown(cdT: number, aspd: number, half?: boolean): number;  procCoef(cdT: number): number
xpNext(level: number): number;  cardOdds(level, luck): PerTier;  shopOdds(w, luck, extra?): PerTier  // weapons, 镜奁
itemOdds(w, luck, extra?): PerTier                   // shop items (F.itemOdds, ⚖5: more 仙/神); same luck and 镜裂 rules
hpMul(w): number   // Π of the per-wave growth by band (F.hp.bands: 1 to 11, 1.28 to 20, 1.20 to 25, 1.13 to 30), endless ×1.055
dmgMul(w): number  // (1 + 0.15(w−1))·1.06^(min(w,20)−11)·1.09^(w−20), endless ×1.08 a wave
relicFor(run): 'wangchen' | 'longyuan'              // more melee weapons (the six melee kinds) → 龙渊剑, more ranged → 忘尘镜;
                                                     //   a tie → the higher tier sum, then COMPANIONS[char].style
reachPct(run): number                                // 攻击距离 %: 龙渊剑 +20 a copy, 玉兔 −15 (weaponRange's pct)
MELEE_KINDS, isMeleeWeapon(def), CLAMP_SPEED_MAX     // 凌波微步 reads 移速 up to the +100 cap
weaponPrice(id, t, w, run): number;  itemPrice(id, w, run): number;  rerollCost(w, k, run): number;  cardRerollCost(w, k): number
fmtBig(n: number, lang: 'zh' | 'en'): string        // 1.2万 / 12k: HUD, shop DPS, numbers
arenaGeom(map: MapId, seed: number): ArenaGeom      // obstacle layout; engine, painter and sim share it
wavePlan(run: RunSave, w: number): SpawnPlan         // stream 'spawn'
newRun(o: NewRunOpts): RunSave                       // pending.start set for 书生 / mastery 3; 心镜 start bonuses applied
waveSetup(run: RunSave, meta: MirrorMeta, now: Date): WaveSetup   // plan + trimmed coin plan + mutators + sky + stats
beginWave(run): RunSave                               // inWave = run.wave + 1 (saved before the engine starts)
endWave(run, r: WaveResult): RunSave                  // see below
screenOf(run): 'start' | 'cards' | 'crate' | 'heart' | 'shop'   // the next between-wave screen from run.pending
pickupRadius(stats): number                          // F.pickupBase (135 u; 90 before the 150% pass) × (1 + 拾取%), ≥ 10
REVIVE = { price: 50, hpPct: 0.5, invuln: 2, pushR: 230, push: 170, clearR: 420 }   // 破镜重圆 (§3)
canRevive(run): boolean                              // !run.revived && !run.tutorial (the purse is the UI's to check)
```

`endWave` follows the GDD §3 order, with the engine already having done steps 1–4:
- 月华 and XP from the result;
- the 蓄月 store;
- harvest (+H 月华 and XP, then H grows);
- interest (算盘, 聚宝盆, 冬藏);
- other `onWaveEnd` item effects (卧薪尝胆);
- levels, each giving +1 气血 permanently and adding `pending.cards`;
- `pending.crates` and `pending.hearts`;
- the result's `stats` folded into `runStats` (`peak*` keys by max, the rest summed), plus the logic-side `RunStatKey`s;
- `byWeapon`, `lives`, `once`, `drunk` and `ms`;
- 镜宝: `r.relics` (the engine names one when the last living body of a boss id falls) join `run.items`, only the two relic ids, at most `new Set(bossesAt(run, w).ids).size` (无相's wave-20 pair of one boss = 1, endless 双生 = 2, 镜主 = 1), none off a boss wave; `lastBuy` is untouched (a relic is not a purchase);
- `wave = r.wave`, and `inWave = null`.

**Coins are not banked here.** That is economy's job (§2.4), done in the same `session.waveWon` write.

### 2.3 Between-wave screens (`logic/levelup.ts`, `shop.ts`)

```ts
pickStart(run, id: WeaponId): RunSave                       // pending.start → weapons[0]
cardsView(run): CardsView | null;  rerollCards(run): RunSave | null;  pickCard(run, i: number): RunSave
crateItem(run, unlocks): ItemId;   resolveCrate(run, keep: boolean, unlocks): RunSave    // 收 / 化 (+50% price)
heartOffer(run, unlocks): ItemId[];  pickHeart(run, i: number, unlocks): RunSave        // full heal is a wave-start rule; +1 free reroll
openShop(run, unlocks): RunSave                             // rolls from (seed, wave, k), keeps locked slots at the new price
shopView(run): ShopView
buy(run, i: number): RunSave | null                         // auto-merges a copy when weapon slots are full
reroll(run, unlocks): RunSave | null;  toggleLock(run, i: number): RunSave;  sell(run, slot: number): RunSave
merge(run, a: number, b: number): RunSave | null
// unlocks: Unlocks = unlocksOf(meta)
```

**Shop rules.** Bans (大橘, 关公), slot limits (关公 5) and 破釜沉舟 (no rerolls or locks) are enforced inside these functions. The UI only disables what `ShopView` says.

**同流派 and 紫红 (⚖5).** A slot is a weapon 45% of the time (20% with the rack full, then always a copy). `schoolPieces(run, shown)` counts the classes of the weapons you hold (duplicates and both classes) plus weapons locked in this shop; a weapon's draw weight is `schoolWeight(id, pieces) = 1 + 4·min(4, Σ pieces of its classes)`. A weapon roll is a copy 25% of the time (drawn by the same weight) and only of a held weapon below IV (a rack of IVs rolls an item instead). Item slots lean to a held class 40% of the time from one piece, roll their tier on `itemOdds`, and a 仙/神 roll keeps its tier (the lean falls back to 凡/灵 only for 凡/灵 rolls). One `rng()` a pick: a shop stays a pure function of (seed, wave, k).

**Stable inputs.** Unlocks and 心镜 change only at settlement or in the lobby. A paused run is only ever affected by its own save, which keeps reloads deterministic.

### 2.4 Economy (`logic/economy.ts`; GDD §16, exactly as `sim/econ.js`)

```ts
rollDay(meta, today): PayDay                   // never earlier than meta.lastDay (clock guard)
entryQuote(meta, purse: number, paidCounter: number, today): EntryQuote
lobbyStatus(meta, today): LobbyStatus
rateOf(n: number): number;  payBase(W: number, endlessBosses: number): number
gross(W, diff: DiffIndex, map: MapId, heat: number, endlessBosses: number): number
quoteNow(meta, run, today): number             // 「此刻镜碎约得 X 文」 (返照钱 at the day's room)
coinPlan(run, w, luck: number, meta, today): CoinDrop[]   // stream 'coin', trimmed to min(run, day, ceiling) room, 10→5→1
bankSleeve(meta, run, sleeve: readonly CoinDrop[], today): { meta: MirrorMeta; run: RunSave }  // run.coins, payDay, owed
settlePay(meta, run, today): { meta: MirrorMeta; pay: PayBreakdown }   // 返照钱 + firsts → owed; back → refund
reconcileTicket(meta, paidCounter: number): boolean   // true → 「续镜 · 已付」
reconcileCoins(meta, coinCounter: number): MirrorMeta // both directions (§16.3)
```

The daily ceiling is 300 文. It covers 返照钱, 铜钱 and first-time bonuses. Anything past it waits in `firstsHeld`. The fee-back floor is paid with `refund()`, which is not income.

### 2.5 Meta (`logic/meta.ts`, `save.ts`)

```ts
unlocksOf(meta): Unlocks
deedProgress(meta, id: DeedId): { value: number; goal: number; done: boolean }
settleMeta(meta, run, cause: EndCause, today): { meta: MirrorMeta; report: Omit<RunReport, 'pay'> }
  // deeds, codex, tallies, bests, records, seals, titles, mastery, 镜屑, 今日镜 (候签 / 七日镜), maps and 镜境 opened
masteryLevel(xp: number): number;  heartCost(meta, face: HeartFaceId): number | null
buyHeart(meta, face): MirrorMeta | null;  pickHeartFace(meta, pair: number, side: 'A' | 'B'): MirrorMeta
dailySpec(day: DateKey, meta, unlocked: readonly CharacterId[]): DailySpec
validateRun(raw: unknown): RunSave | null;  migrateRun(run: RunSave): RunSave | null   // null → settle as 镜碎 ('migrate')
```

### 2.6 The store and the session (effectful)

**`src/app/mirror.ts`** (eager, tiny). It imports only *types* from `views/mirror/types.ts`, never the registry.

```ts
MIRROR_KEY = 'banmu.mirror.v1';  mirror: Signal<MirrorMeta>;  storageOk: Signal<boolean>
defaultMeta(today?: DateKey): MirrorMeta;  sanitizeMirror(raw: unknown): MirrorMeta   // shape-level, never throws
saveMetaNow(): void;  updateMeta(fn: (m: MirrorMeta) => MirrorMeta): void            // update + immediate write
payOwed(): void          // the only door to the purse: batch(earnFrom('mirror', n); record('mirror:coin', n))
reconcileMirror(): void  // on load: coin counter ↔ coinsPaid both ways, then payOwed()
// registered in backupExtras with replace-in-place (like src/app/mail.ts); imported from src/main.tsx
```

**Play counters.**
- `mirror:paid` is the ticket.
- `mirror:coin` counts every 文 paid.
- `mirror:runs`, `mirror:best` and `mirror:clear` are recorded at settlement only, and never mid-wave.

**`logic/session.ts`.** The one logic module that touches `play` and the store. The UI calls these:

```ts
enter(o: { char; map; diff; vows; daily; plain }): { ok: true; run: RunSave } | { ok: false; reason: 'short' | 'paused' }
    // atomic: batch(spend(20) + record('mirror:paid')) unless today's free run; saveMetaNow()
resumeCheck(): RunReport | null   // on view mount: a stale inWave counts an interruption; the 3rd settles ('interrupt');
                                  // an unmigratable save settles ('migrate'); downAt === inWave (closed while down) settles 'death'
commit(run: RunSave): void        // meta.active = run; saveMetaNow() — after every purchase, reroll, lock, sell, merge, pick
startWave(run: RunSave): { run: RunSave; setup: WaveSetup }   // beginWave + waveSetup + save
waveWon(r: WaveResult): RunSave   // endWave + bankSleeve + saveMetaNow + payOwed + record('mirror:coin')
died(d: DeathResult): RunReport   // fold partial, settle (pay + meta), clear active, payOwed, record counters
abandon(): RunReport              // 弃镜 = 镜碎 at the last cleared wave
leaveMidWave(): { interruptions: number; report: RunReport | null }   // 暂离 mid-wave (the 3rd settles); while down: 'death'
voidRun(): void                   // engine error before wave 2: refund(20) once a day, or return the free run
// 破镜重圆 (§3); RunSession has them as optional methods: the tutorial's session has none, so it never offers it
wentDown(wave: number): void      // `downed` fired: commit downAt = wave (only the wave in play)
payRevive(): 'ok' | 'short' | 'used' | 'none'   // atomic: batch(spend(REVIVE.price) + record('mirror:revive')), flushPlay(),
                                  // then commit { revived: true } without downAt. 'used': revived or a tutorial run; 'none': no run in a wave.
                                  // The owner's code changes nothing here (a test: still exactly −50).
reviveFailed(): void              // payRevive said 'ok' but engine.revive() returned false: refund(50), revived removed
```

`app/mirror.ts sanitizeMirror` keeps `settings.view` only when it is `'near' | 'mid' | 'far'` (missing = 中).

### 2.7 Round 8 (m8): balance, the shop, ask B, the hidden unlock, the code and tuning

Pure logic added in round 8 (build plan §3–§4). Every number is data (`F`, a def's `stats` / `fx` / `p`), so the 模拟场 lists and exports it.

**Seams.**

- **Ids.** `HIDDEN_CHARS = ['yuenv', 'shangui', 'houyi']`, `HiddenId`, `CharacterId = AppCharacterId | HiddenId`, `isHidden(id)` (types.ts). `CHARACTER[…]` (the app's table) is never read for a hidden id; `appOpen(id)` (logic/session.ts) is false for one. `src/app/mirror.ts` `CHAR_IDS` holds all 16.
- **Logic.** `shopFloor(run)`, `noWeapons(run)`, `setPlusOf(run)`, `moveCapOf(run)` (logic/items.ts); `moveSpeedOf(stats, capX = Infinity)` reads `CLAMP` live and is the one walking-speed formula (the player, 镜主, 貔貅); `applySheet(s, run.sand)` before `clampSheet`; `curseOf` adds `run.sand?.curse`; `condHolds` knows `moving`; `convertSource` knows `luck` and `dodge`; `setTiers` counts `setPlusOf`; `CompanionDef.dodgeMult` after the converts; `endWave` subtracts `WaveResult.lost` once (never below 0); `settleMeta` reports `chars`; the 莲湖 rim counts the 13; `BotOpts.immortal`.

**Balance.**

- **Numbers** (balance.md §1–§7 as amended by its §12.3 and the build plan; orchestrator O1: 忘尘镜 and 龙渊剑 unchanged). `F.itemOdds` / `F.shopOdds` (凡 down every band), `F.tierMult` [1, 1.8, 3.2, 5.2], `F.weaponSlope` 0.15 (items keep `F.priceSlope` 0.18), 劫 `F.curseDmg` 1 · `F.curseMoon` 0.02 · `F.curseEnemy` 0.02, 金丹 `max` 12, 断发 +4 / −3 max 5, 心魔 +6 (劫 3, a 10 % casket: the QA 劫 pass), 妄念 月华 −15 % (was +10 %: the extra 20 % of enemies already paid more than its 劫 cost), 镜裂 劫 2, 破釜沉舟 `{ dmg: 8 }` 劫 2. The 13 companions: 琴师 and 道童 trimmed (`MELEE_PEN` is shared and never edited: 琴师's 乐器 +12 is her own wmult row), the weak five's rules, the middle six's numbers.
- **The floor** (`{ hook: 'shop', do: 'tierFloor', t }`, read by `shopFloor(run)`). `shopOdds(w, luck, extra, floor = 1)` / `itemOdds(…)`: tiers below the floor are zeroed and the rest scaled to 100; luck multiplies, and 镜裂's +5/+5 is added to, the tiers above the floor, and the floor tier takes the rest. `rollSlot` passes it for items and new weapons; weapon copies for 合铸 are exempt; the class lean's fallback starts at the floor and the last resorts are `itemPool(…, max(1, floor))` then 人参 (松子 without a floor). 镜奁, 镜心, cards, 行囊 and boons never read it. `noWeapons(run)` skips both weapon branches.
- **Prices.** `weaponPrice` = round(base × `F.tierMult[t]` × (1 + `F.weaponSlope`·(w − 1)) × mods); `sellPrice` follows it.
- **诗成.** `critMult(critX, weaponCrit, stats, overflow = 1)`; `critOverflowOf(run)` is `PASSIVES.baipian.p.overflow` for 诗仙, 1 for anyone else (logic `weaponHit`, the engine's weapon slot and `World.hitSlot`'s skill packets all pass it).
- **Ask B.** `STARTER_ITEMS` = every item; `lockOf(id)` names a deed only for the 9 deed weapons, `deedOf(id)` names any item's or weapon's deed. `settleMeta` pays an item deed's 镜屑 once, when it first reaches its goal: `deedDust(id)` = `PAY.deedDust[tier − 1]` (灵 20 = 心魔's, 仙 30, 神 60), `deedDustOf(before, after)`; never retroactive. The Codex item page shows the deed, its progress and 「成就 · 镜屑 +n」 (`DEED_REWARD_SAY`); `RunReport.deeds` names the item deeds a run paid for (present only when non-empty) and Results shows one line each, 「<deed> · 成就 · 镜屑 +n」. The tutorial keeps the old 55 items (`tutor/run.ts TUTOR_ITEMS`).
- **Bot** (`sim/bot.ts value()`): 劫's enemy damage divides the effective HP (`1 + F.curseEnemy·劫`); `BOT_M8.rerollLoss` while `noReroll`; `BOT_M8.floorPer × min(floorCap, commonStackers(run))` under a floor; plus `botItemValue(run, id) × n` for held items.
- **Tests.** `tests/mirror-m8-balance.test.ts`; `tests/mirror-m8-sweep.test.ts` is QA's sweep (gated `MIRROR_SWEEP=1`; `PART=A|B|F` write jsonl rows, `PART=H` the hidden three's verbs (expert / novice, tallies, 山鬼's snaps; PLAN A-H1–A-H5), `PART=TAB FILES=…` prints the §8.1 and hidden tables; `CURSE=w:n`, `NO_BB=1`, `LEVER=TABLE.path=v` (F, ITEMS, PASSIVES, SKILLS, WEAPONS, COMPANIONS, BOT_M8) and `TUNING=` probes).

**Items.**

- **Shop (`logic/shop.ts`, `logic/items.ts`).** `ShopState.rolls` counts this shop's rerolls (free ones too); `rerollOffPct(run)` is 货比三家's discount, applied in `slotPrice` (every slot); `sellPrice`'s fraction is capped at `F.sellFracMax` 0.7 (under that discount's cheapest buy, so buying and selling a weapon never profits). `itemPool` skips an item with `rerollOff` while `noReroll(run)`. 点石成金: `upgradeRule(run)`, `upgradePrice(run, slot)` (null at 神 or without the rule; `u.x` of the copy price this shop shows, 货比三家 included), `upgradesLeft(run)`, `upgrade(run, slot)` (uses `ShopState.upgrades`); the Shop's weapon tab shows 「点金 · price」.
- **Bot values (`sim/itemvalues.ts`).** `ITEM_BOT_VALUE` (full-fit value in `value()` units, all 26) and `botItemValue(run, id)` (× the share of weapons of the item's class; 画地为牢 is `HUADI_SHORT_PENALTY` on kits whose mean reach ≤ `HUADI_SHORT_REACH`, 短兵相接 is worth its value only there; 醉卧沙场 only with the 醉 meter; 后发先至 × dodge / 60). BALANCE's `value()` adds `botItemValue × count` for held items.

**Hidden companions.**

- **Unlock (`logic/hidden.ts`).** `HIDDEN_BY_MAP` (lake 越女 · forest 山鬼 · palace 后羿), `HIDDEN_WAVE` 40, `HIDDEN_MIN_DIFF` 0 (any 镜境, 闲游 included: the owner's words, orchestrator O2). `deepestOn(meta, map, minDiff?)` reads `meta.bests` keys `char|map|diff|heat(|p)`; `hiddenOpen(meta)` lists the earned ones in `HIDDEN_CHARS` order (retroactive; no save field; the daily writes no bests, the tutorial and the sandbox never settle). `hiddenTease(meta)` (any map's deepest ≥ `HIDDEN_TEASE_WAVE` 30: the sealed tiles may show) and `hiddenMap(id)`.

**The code and the 模拟场.**

- **The code's overlays (S1; chars.md §3.4, §4.3; PLAN D18).** `logic/session.ts` is the only reader of `codeActive`.
  - `openOf(m).chars`: every companion (the 13 and the hidden three) while the code is on; otherwise `unlocked` (app ids) plus `hiddenOpen(m)`. `enter` and `lobbyVisit` fall back to 书生 for a companion that is not in it; 今日镜 stays on `unlocked` (`dailySpec`). No `char:*` flag or app-wide state is written.
  - `lendOn` (a signal, default on, never saved), `setLendOn(v)`, `lent()` = the code on and 「按满阶」. While `lent()`, `enter` passes `heartFor(m, true)` (every picked face at its last rank; 回魂 keeps its earned rank, `NEVER_LENT`) and `masteryFor(m, char, true)` (10) to `newRun`, and records `run.lent = lentOf(m, char, plain)` (the ranks and levels above the earned ones). `meta.heart`, `meta.mastery` and `dust` are never written.
  - **Pay is unchanged.** `waveSetup` rolls the 铜钱 plan on `unlentRun(run)` with `luck − lentLuck(run)`: lent 福缘 changes neither the coin rolls nor how often 貔貅 (a 铜钱 carrier, luck-scaled in `wavePlan`) is planned for the coins.
  - Views: `heartView(m)` → `{ ranks, own, lent, code }`, `masteryView(m, char)` → `{ level, own, xp, lent }`, `charTag(m, id)` → `'code'` for a hidden companion open only through the code. The UI pieces are in `ui/sand/overlay.tsx` (`CodeRibbon`, `LendSeal`, `charTagText`): the 心镜 and 心得 pages show the ribbon and the 「按满阶 / 按自有」 chips, lent pips hollow, 「阶 5/5（测试码代填；自有 N 阶）」 and 「心得 10 级（测试码）· 自有 N 级」; the lobby glass shows the lent level with a small 「测」 seal.
- **The tuning layer (S2, `logic/tuning.ts`, sandbox.md §5).** `TUNABLE` lists 24 tables (not `PAY` or `REVIVE`). `leaves()` walks them at runtime (about 3,200 numbers and booleans), each with its `aliases` (shared objects such as `MELEE_PEN` and the 心镜 cost arrays), `ro` (structural), `badge` (`live`, `spawn`, `wave`, `shop`, `run`, `none`) and `int`. `beginTuning()` snapshots; `setValue(path, v | null)` writes in place (clamped where the engine needs it; StatId keys may be added to and removed from StatMods maps); `changes()` lists only differences; `endTuning()` restores in reverse order, deep-compares with `Object.is` and falls back to a full restore; `dataHash({ except? })` fingerprints the pristine tables. `sandOf(run, rows)` / `withSheet(run, rows)` turn the 本局 rows into `RunSave.sand` (a 劫数 row becomes `sand.curse`, so the enemies scale too). `enter` and `startWave` restore the tables first if tuning is somehow still on.

---

## 3. Engine (`engine/index.ts` exports `createEngine: CreateEngine`)

```ts
const engine = createEngine(canvas, run, { painter, audio, content: CONTENT, hooks, settings });
engine.start(run, setup);         // play wave setup.wave; also used for a replay
engine.pause(); engine.resume(); engine.dispose(); engine.resize();
engine.input.move(x, y); engine.input.aim(x, y); engine.input.cursor(sx, sy);
engine.skill(target?); engine.skillPreview(target | null); engine.setSettings(p); engine.snapshot(w, h);
engine.revive(): boolean; engine.giveUp(): void;   // the answers to hooks.downed (破镜重圆, below)
engine.setSettings({ view: 'near' | 'mid' | 'far' }); // the view size, live (视野, below)
(engine as MirrorEngine).setView(view): Promise<boolean>; .view; .baking   // the same, awaitable
(engine as MirrorEngine).setHudRects(rects: readonly HudRect[] | null): void  // where the HUD sits (off-screen threats, below)
```

- **Lifecycle.**
  - `start` → phase `'wave'`. On a won wave the engine runs the 1.2 s end: enemies and shots dissolve, 月华 moves to 蓄月, 铜钱 fly to you, then `hooks.waveEnd(result)`, then phase `'idle'`.
  - On death: `hooks.death` → phase `'dead'`. The run's first death may go `'down'` instead (破镜重圆, below).
  - `start` may be called again with the updated run for the next wave, which reuses the pools and the painter.
  - `pause` / `resume` are idempotent.
- **Hooks.**
  - `hud` about 8 Hz (write refs, never per-frame Preact state).
  - `levelUp(level)` mid-wave: the engine already played the ring and the chime.
  - `crate(total)` and `coin(drop, sleeve)`.
  - `boss({kind:'intro'})`: the engine has paused itself. The UI shows the 1.5 s card and calls `resume()`.
  - `boss({kind:'phase'|'dead'})`.
  - `error(e, fatal)`: the first throw drops the offending entity; a second within 5 s is fatal.
  - `downed?(d: DownInfo)` (optional): see 破镜重圆.
- **破镜重圆, the run's one paid revive** (`engine/world.ts` goDown / revive / giveUp, the look in `engine/down.ts`).
  - When. A lethal blow runs 阎王帖 → 九命 → the passive → 蓬莱 first. If you still fall, the UI supplied `hooks.downed`, and `canRevive(run)` holds (`run.revived !== true`, `run.tutorial !== true`), the engine goes `'down'` and calls `downed({ canRevive: true, price: 50, wave, cause })` once. Otherwise it dies at once, exactly as before: a second death, a tutorial run, a UI without the hook, and the sims (`sim/*` pass no hook).
  - Down. Nothing steps (enemies, shots, timers, the wave clock and the 镜技 hold; stray blows do nothing). The field pales under a paper wash, and your figure slumps into a spreading ink blot with one ink ripple over `DOWN_ANIM` (1 s). Then the loop stops and the last frame holds, with no per-frame cost while the dialog is up. The HUD gets one push with `hp 0`. `'shatter'` sounds once, at the fall. `pause`/`resume` still work, and a resume while down stays down. **A pause does not stop the fall:** the loop keeps drawing while the fall animates (`world.downAnimating`), paused or not (the world is frozen while down anyway; only the fall's clock runs), so the UI may pause on `downed` (a modal) and the player still sees the fall; the loop stops once it has settled.
  - `engine.revive(): boolean`. You rise where you fell at `round(REVIVE.hpPct × max 气血)` (50%, as 蓬莱仙丹; a full heal would make a free second wave of the same fight) with `REVIVE.invuln` = 2 s of invulnerability. Burns, poison, root and slow are washed off. A jade column of light, a big jade double shockwave and a moon-white ring past it throw every non-boss enemy within `REVIVE.pushR` (230 u) back by `REVIVE.push` (170 u, before resist). Enemy shots within `REVIVE.clearR` (420 u) are wiped. You get the title 「破镜重圆」, `levelUp` + `bell`, and a shimmer while invulnerable (a thin jade ring and glints at 4 Hz on top of the i-frames' steady half-tone; reduced motion: rings stand in place). The engine sets `run.revived = true` on **its own run object**, lifts any pause and plays on. It draws no RNG, so the same revive at the same step replays identically. Returns false (a no-op) unless `'down'`.
  - `engine.giveUp()`: the normal death: `hooks.death(DeathResult)` → `'dead'` (no second shatter). A no-op unless `'down'`.
  - The hook may answer synchronously (`revive()` / `giveUp()` inside `downed`): the engine keeps exactly one animation-frame loop (a frame that schedules its successor from inside a hook is not scheduled twice). If `downed` throws, the engine gives up (never a stuck `'down'`).
  - **The UI half (`ui/Run.tsx`, the dialog `ui/Screens.tsx ReviveDialog`):**
    - `hooks.downed` is passed only for a real run (`!practice && sess.payRevive`); the tutorial's engine dies (in practice its script never lets you fall) and its run is `tutorial: true` anyway.
    - On `downed`: `session.wentDown(wave)` at once (a reload or 暂离 from here settles as a death), the music drops to `'results'`, the stick is disabled and the 技 button, the pause key and the HUD's taps are put away (`.mj-run.is-down`). No pause sheet can open while down (‖, Esc, a blur, a hidden page or a letter's sheet all wait). 900 ms later (at once under reduced motion) the dialog 「镜碎了」 shows over the still picture: the price, 「你有 N 文」, 「花 50 文复活」 (jade) and 「不了，结束这一局」. A short purse greys the revive with 「文不够（还差 M 文）。」 and 「结束这一局」 is the only live button. No timer. Focus lands on the dialog, not on a button, and taps wake after 0.4 s (a held Space or a thumb on the 技 button never pays).
    - Revive: `session.payRevive()` first; `'ok'` → `engine.revive()` → the fight's music back (no toast: the centre title 破镜重圆 says it, and a top toast covered the HUD row for 3 s). `'short'` (the purse changed under the dialog) → nothing, the dialog shows the shortfall. `'used'` / `'none'` → `engine.giveUp()`. If `engine.revive()` returns false after the charge: `session.reviveFailed()` (refund) and `giveUp()`; if no death follows, the run settles as an engine failure. The UI never reads the engine's `run.revived` to decide whether to charge.
    - Decline: `engine.giveUp()` → the usual `death` → `session.died` → 镜碎 and the results.
  - **Save / resume while down: into the results.** Mid-wave state is never saved, so the session commits `downAt = wave` when `downed` fires. Then `resumeCheck` must settle a run whose `downAt === inWave` as a death (镜碎, like `'interrupt'` without a partial), never as an interruption. A closed tab does not dodge a death; the view then opens on those results with the toast 「上次倒下后没有复活就离开了，这一局按镜碎结算。」/"You left while down last time, so the run has ended." (`MirrorView.tsx`, next to the `'interrupt'` toast). `validateRun` keeps `revived`, `tutorial` and `downAt` (written only when set).
- **The loop and the camera** (`engine/index.ts`; 屏幕抖动 / 行走快慢, round 5).
  - **Every refresh rate (m7, 「最高能达到120帧，电脑最好能够无上限」).** The simulation is a fixed 60 Hz step at every rate; only drawing scales. `frame(now)` is one animation frame (a vsync): its interval always feeds the display's period, then the frame cap may skip it (nothing steps, nothing draws), else it steps and draws. Tests drive `frame()` with synthetic stamps (`tests/mirror-framerate.test.ts`: 30–360 Hz, both clocks).
  - **Vsync snap.** `period()` is the mean of the last 32 vsync intervals within [0.5, 1.6] × their lower quartile (a dropped frame, a hiccup or a stray short interval is left out; Safari's 1 ms stamps average out). When it is within 2% of a nominal rate (`NOMINAL_HZ`: 30, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 180, 200, 240, 280, 300, 360, 480, 500; `nominalPeriod`), a frame within min(1.5 ms, 0.45 × the period) of whole vsyncs counts as exactly that many nominal periods (`snapStep(dt, period)`): a real "60 Hz" panel (59.94, 60.02 Hz; Chrome's 0.1 ms and Safari's 1 ms stamps) runs exactly one step a frame, 120 Hz a step every other frame, 144 Hz a steady 5 steps in 12 frames, 360 Hz with a 1 ms clock at 60.0 steps/s. A 59.94 Hz panel runs the game 0.1% slow (143.86 Hz 0.1% fast); a rate that is no nominal one is not snapped, and an irregular interval (a hitch) is used as it came. `start`, `resume` and `revive` put the accumulator half a step in (`acc = STEP / 2`); the first snapped frame after them puts it back on that lattice if the few raw frames before moved it (`phase0`; rates whose vsyncs divide the step: 60, 120, 180, 240, 300, 360 Hz), so at 60 Hz α is ½ on every frame.
  - **Frame cap (帧率, `EngineSettings.fps`: 30 · 60 · 120, or 0 / missing = every vsync).** Applies live (`setSettings({ fps })`). A vsync that comes before the cap's period is skipped (a credit of real ms: never a timer, never a busy loop); the cap always presents every k-th vsync, k the whole number of vsyncs nearest its period (`capVsyncs`; ties to the longer): a steady cadence, never vsyncs shared out unevenly (60 on 120 Hz: every 2nd; 120 on 240 Hz: every 2nd; 30 on 144 Hz: every 5th, 28.8 fps; 60 on 144 Hz: 72; 60 on 165 Hz: 55; 60 on 90 Hz: 45; 120 on 144 or 165 Hz: every vsync), counted in the display's vsyncs (its nominal period once known); a cap at or above the display's rate draws every vsync. The 帧率 lines say 「约」 for this. `capOf(v)` sanitises it. The UI's default (`ui/Pause.tsx fpsOf`): 120 on a phone or tablet (coarse pointer), 不限 on a computer.
  - **The effects clock `World.tFx`** (declared in `engine/index.ts` by module augmentation until world.ts has it) = `t + (α − ½)·STEP` while drawing, `t` otherwise (headless, a still redraw, the few frames before the display's period is known); `World.dFx = tFx − t` (within ±STEP/2). At 60 Hz it is `t` exactly on every frame, so the 60 Hz picture is unchanged; on a faster screen it moves on every frame and leads the drawn bodies by half a step, as `t` does at 60 Hz. Only drawing reads it: effect ages (clamped at 0: an effect made in this frame's step shows at age 0), poses (`Feel.pose`: every window opens and closes on `t`, what is drawn inside reads `t + dFx`), the HP chips (`bars.ts`), the tell's pulse (`threats.ts`), motes and ripples (`paint/ambient.ts`). Readers go through `fxDelta(W)` (`engine/feel.ts`), which gives 0 when the pair is stale (a renderer driven by hand, a clock moved since the draw). Every rule, spawn, sweep and new-wave check reads `t`. The VFX layer (`vfx.ts`) draws every family at its age on this clock (released on `t`); ribbons (`trails.ts`) are labelled and aged on the render clock `tDraw` (the time of the drawn positions; a new point after whole steps' worth of time, and the 60 Hz points' one-frame lag kept at every rate, so a ribbon is as long at 360 Hz as at 60 and its tail glides). The motes shots shed (`render.ts`) are counted per simulation step (one step in eight a shot), never per drawn frame, and what the drawing spawns draws on the renderer's own random stream (`Vfx.drawing`), so the simulation's effects draw the same shapes at every rate.
  - **Frame statistics.** `engine.displayHz`: the display's rate as measured (the fastest steady period seen, re-learned when frames come paced slower for 1 s while our own JS is under 40% of them — a panel that dropped to 60, Low Power Mode's 30; NaN until known). `engine.frameStats`: the last 1 s window — `fps` (frames drawn over wall time: a stop's frames count, so it no longer over-reads during one), `ms` a frame, `work` (our JS ms a frame; the raster work comes after), `hz`, `cap`, `half`. `World.fps` (the HUD snapshot's `fps`) is the same number.
  - **Render interpolation.** Before each step the engine snapshots every moving pool (`E, PS, ES, D, S, P, Z` with its radius, `N`, `feel.sp`, `feel.fr`) and you; the draw writes lerp(before, now, α = acc / STEP) in place, draws, and restores the simulation's values (only when drawing: a canvas context and phase `wave` / `ending` / `down`; a headless engine never touches a position, so sims and tests are bit-identical). A body that was not there, is another body now (a new generation, or a life / age clock that ran backwards: a slot freed and retaken within a step), or moved > 48 u in a step is drawn where it is. `World.tDraw` (= `t − (1 − α)·STEP` while drawing) is the render clock: orbit angles (剑匣, 残剑, idle swords, the held weapons), the 清辉 bob and the summon trails' speed read it; every rule reads `t`. Cost ≈ 0.002 ms a step and 0.012 ms a frame. During a stop α holds, so the picture holds.
  - **The camera** is rigid on the drawn (interpolated) you plus a **sticky lead** of 36 css px (≤ 70 u) toward where you run: re-aimed only while you move at ≥ half speed, held when you stop or go down (the view never swings back), eased with a critically damped SmoothDamp over 0.3 s. Its target is soft-clamped into the arena's bounds (linear, then `tanh` over the last 80 u: no dead stop at the edge). **Dash guard:** what the target moves beyond your walk in a frame (一剑光寒, 拖刀, 轻功, leaps, pulls) becomes a lag that drains accelerating and braking, the camera never faster than 2 × your walk in all; a 260 u dash settles ≤ 0.4 s after it ends. `held` (the world fully frozen: a stop with no time left this frame) keeps the camera exactly where it is; the frame a stop releases, it moves with you. `drawFrame(0, true)` redraws the still picture.
  - **Dynamic resolution** (the frame guard's notches): a notch is queued and applied at the top of the next frame, before it steps and draws; `resize()` keeps the zoom factor (a boss fight's zoom never snaps) and redraws at once whenever it reallocated the canvas (the UI's ResizeObserver runs after the frame's draw: never a black frame). One step back up a run, after 60 s of fast frames (`RES_UPS` 1, `RES_UP_AFTER` 60). Re-bake slices in play are `min(6, 0.36 × the frame's period)` ms (3 ms at 120 Hz), 24 ms behind a sheet. The boss zoom eases at the same pace at every rate (`1 − (1 − 2·STEP)^(dt/STEP)`, exactly `dt · 2` at 60 Hz).
  - **The frame-time guard, two tiers.** Both read the real interval between drawn frames, averaged over time (`1 − e^(−ms/150)`: a hitch weighs the same at 60 and 240 Hz); intervals over 250 ms are ignored.
    - *Floor tier*: under 50 fps (a cap under 50: 1.2 × the period it presents at, so 省电 30 is not "slow"; frames the browser or the display paces — a tight steady period at a display's rate or a whole number of its vsyncs, with our JS under 40% of it, e.g. Safari's Low Power Mode or Chrome's Energy Saver at 30 — are never slow either) for 2 s sheds the overlays, then a notch every 2 s, then `degrade`; a JS-bound frame (our JS ≥ 85% of the threshold) goes straight to `degrade`. Recovery as before.
    - *High-rate tier* (a screen over 80 Hz; `HI_*`): it aims for min(the cap, the display, 120 fps) and watches the rate it achieves (≈ 1 s average). More than 10% short for 2 s: the overlays, then one notch at a time down to the high floor (2 on a DPR-3 screen, 1.5 on DPR 2; at most two) — never an effect. Still more than 20% short there, on a screen of ≥ 110 Hz: a steady half rate (a whole number of the display's vsyncs, ≥ 2, fitting twice the aim: 60 on 120 / 240 / 360 Hz, 72 on 144 Hz, 82.5 on 165 Hz) and the notches and overlays go back. It takes no notch when our own JS (an average of `work`) is ≥ 85% of the aim (resolution cannot help: straight to the half rate), gives back a notch that did not raise the rate 5% within 2 s (and takes no more that run), holds a steady whole-vsync cadence at or above the half rate as it is, holds while frames come paced below the display (the display is being re-learned), and at 不限 on a computer (a fine pointer) never goes to a half rate below the rate it achieves. After 30 s clean at the half rate it tries full rate again (at most once a minute, doubling to 240 s after each failed try; a try sheds nothing). A notch back after 60 s under 2% short (once a run). It stands by while the floor tier works or sprites re-bake. The display's rate is the fastest steady period seen (re-learned when paced, above), so a JS-bound phone stuck at 60 on a 120 Hz screen is seen as short (Safari's 60 fps limit, where frames never came faster, is left alone).
    - *Resume and stops:* resume keeps the accumulator (the paused picture's α) and the first frame after start / resume / revive moves one vsync (`min(STEP, period)`), never 1–1.75 steps; a hitstop that ends mid-frame re-phases the accumulator (phase0, next frame), so at 60 Hz α is ½ and `tFx ≡ t` again after a boss's stop.
  - **Arrival** (`engine/enemies.ts role()`): a chaser, splitter, exploder, spore, tank or swarm body that would run through its target this step stops inside 0.6 × (its radius + your hitbox) instead; contact reach (r + hitbox) is unchanged. A packed crowd round a still player no longer buzzes.
  - **Walking** (`engine/world.ts`): world speed is the same in all 8 directions (a guard test). 广寒 starts you 200 u south of the 桂树 (it was 56 u in front of you). A push into a round obstacle turns along it and keeps ≥ 80% of its speed (`SLIDE_KEEP`), toward the side it leans to (+x when dead on); it used to stop a head-on push dead.
- **视野, the view size** (`EngineSettings.view`, `paint/draw.ts` `VIEW_SPAN` / `viewScale` / `bakeScale`).
  - Three sizes; the screen's shorter side shows `near` 440 u (the old view), **`mid` 700 u (the default: a missing `view` is `mid`)**, `far` 820 u, within css px per u of `VIEW_FLOOR` 0.7 / 0.5 / 0.45 and `VIEW_CAP` 1.5 / 1.25 / 1.05. Measured against what must be seen: keepers settle 0–60 u *inside* their keep distance (`engine/enemies.ts keep()`, one-sided `KEEP_BAND` 60: lantern and clerk ≤ 320, imp ≤ 300, 樵鬼 ≤ 280, spider and star ≤ 260, 灯笼鬼 ≤ 360), orbiters circle at 200–260, the toad's tongue reaches 300; **no ranged monster winds up farther than `SHOOT_R` = 420 u from you** (lantern, imp, spider, 樵鬼, clerk, 冰魄, the 莲蓬 turret; it was 700, and 冰魄 and the turret had none) — a fixed distance, never the camera's, so the sims and every screen play the same game; enemy shots fly 200–360 u/s; your ranged weapons reach 320–540 u. A 390×844 phone shows 440 × 952 / 700 × 1515 / 820 × 1775 u (half-width 220 / 350 / 410: at `mid` every keeper is on screen and a shooter in range is at most 70 u past the edge, where its tell's chevron marks it); the companion (54 u) is 48 / 30 / 26 css px tall. 1280×800 shows 853 × 533 / 1120 × 700 / 1312 × 820 u. The camera's lead is 36 css px but at most 70 u (sticky: see *The loop and the camera*); the boss fight zooms out to 0.84 / 0.92 / 1 by view.
  - `setSettings({ view })` (or `MirrorEngine.setView(view)`, which returns a promise) applies live: the camera takes the new scale at once (one resize; a paused picture redraws), then the painter re-bakes every sprite it holds at `bakeScale(…, view)` into fresh pages in the background (6 ms a frame in play, 24 ms while paused or between waves; ≈ 0.3–0.5 s behind a pause sheet in headless Chromium) and swaps them in whole — the old sprites draw meanwhile, never a half-baked atlas. It resolves `true` once swapped, `false` when nothing was needed (within 8%). `engine.baking` is true meanwhile. A window resize never re-bakes (it only moves the camera). At construction the engine re-bakes only if its painter would be drawn > 15% enlarged (a painter made without the view). The arena's obstacle sprites are re-baked with the atlas and swapped in with it (the arena's ground and stains keep the resolution they were painted at: memory-capped, they are no sharper at any view); the feel layer's marks follow at the next wave. The impacts grow with the view (`impactViewK`: √(span / 440), ≤ 1.3 — 1 / 1.26 / 1.3), so a blow's light does not shrink with everything else at the wider views (cosmetic; the simulation never reads the view).
  - **帧率 in the UI (m7):** `MirrorSettings.fps` (0 · 30 · 60 · 120; missing = the device's default), `showFps` and `fpsTip` (true only) are kept by `sanitizeMirror` (declared in `src/app/mirror.ts` by module augmentation until types.ts has them). The settings rows (`SettingsRows`: the pause sheet and the lobby's 设置) add 帧率 省电 · 60 · 120 · 不限 with its line, 「此刻 N 帧 · 屏幕 M Hz」 from the engine's last second in the pause sheet, and 显示帧率 (a toggle). `Run.tsx` passes `fps` to `createEngine` and to `setSettings` at once; with 显示帧率 on, `Hud.tsx FpsMeter` shows 「N fps · M ms」 small under the pause button (a 250 ms timer reading `frameStats`, never an animation frame). On an iPhone / iPad (`appleTouch`) whose frames come at ≈ 60 Hz while 帧率 asks for 120 or 不限 (`held60`), or at ≈ 30 Hz while it asks for more than 30 (`held30`: Low Power Mode), the next between-wave screen shows the tip (`FPS_TIP`: Safari's 「Prefer Page Rendering Updates near 60fps」 feature flag; `FPS_TIP30`: turn Low Power Mode off) on that one screen only: `fpsTip` is stored the moment it shows, 「知道了」 closes it early, and it never shows again. Under 省电 the run carries `.is-saver` and the low-HP ring holds still (the ring pulses by opacity alone otherwise). The same text stands under the 帧率 row while it applies.
  - **The UI:** `settings.view` is kept (sanitised; missing = 中) in the mirror's settings. The settings rows (`ui/Pause.tsx SettingsRows`: the pause sheet's 设置 and the lobby's 设置 page) open with 视野 近 / 中 / 远, the chosen one's plain line under it (近「人物大，看得近（旧视野）」, 中「看得更远，远处的敌人也在画面里（推荐）」, 远「看得最远，人物更小」) and the hint 「看不到远处射来的攻击时，调到「中」或「远」。」. The run's painter is baked for it (`ui/Run.tsx spriteScale` → `bakeScale(…, viewOf(view))`), the engine starts with it (`engineSettings().view`), and a tap forwards it through `setSettings` at once, mid-wave under the pause sheet included. The old 震屏 row is gone (the camera no longer shakes; the `shake` key stays in saves).
- **HP bars** (`engine/bars.ts`). The bodies' bars are the `enemyBars` layer, right after `enemies` (under your summons, your figure, the blows' light and every shot: a crowd's bars never bury you); yours is the `bars` layer, after the player's shots and under the numbers; both under the darkness in the dark. Every ordinary monster, elite and 心魔 carries a thin vermilion bar over its head (treasures gold) on a dark ink track: 42% alpha while untouched, full once hurt, with a paper-white chip of the damage just taken that holds 0.22 s and drains (instant under reduced motion). Ordinary bars are 18–30 css px wide × 2.5 (≈ 2 × the body's radius), elites' 30–52 × 3.5; the minimum width shrinks to ¾ as the view widens (≥ 0.6 css px per u: full; a phone's `mid` 16.7, `far` 14.3), so small swarm bodies are not buried under bars. Bosses keep the HUD's scroll; allies, the charmed, the invulnerable and decoys carry none. You carry a jade bar (30–44 × 4 css px) over your head during a wave, your shield a grey cap over it (its share of max 气血), flashing white for 90 ms as a blow lands (never under reduced motion). The enemy layer records each drawn body's bar (culled off-screen); the layer fills them in runs (all tracks, all chips, all fills: ≤ 8 style changes a frame, ≤ 3 fillRect a bar, no path or allocation). 140 bodies: ≈ 0.01 ms of JS and ≈ 0.04 ms with raster a frame in headless Chromium (the enemy layer itself ≈ 0.25 / 0.75–1.5 ms).
- **Off-screen threats** (`engine/threats.ts`, the `threats` layer: last, over the edge masks and titles). When an enemy winding up (its tell), an enemy shot that will pass within 70 u of you within 3 s, an elite or the boss is outside the picture, a vermilion ink chevron (a shot's: a white core in a 朱砂 rim) sits at the screen's edge on the line from you to it, pointing at it: 16–26 css px by how far past the edge (to 700 u), elites and the boss a size up, the boss doubled. At most `THREAT_CAP` 4 / 6 / 8 by quality (halved under the frame guard), the most urgent first, one per direction (24 css px). A tell pulses gently, never under reduced motion. Insets: 20 css px at the sides, 30 at the top, 34 at the bottom, and **clear of the HUD**: a chevron whose place would be under a HUD rectangle is pulled back along its ray to 16 css px outside it, and a body or shot under a HUD rectangle counts as unseen (it gets a chevron). The rectangles come from the UI: `setHudRects(rects)` (css px from the canvas's top-left; negative `x` / `y` count from the right / bottom edge; ≤ 8; `null` = `HUD_DEFAULT`, today's HUD: the top 68 px and the 镇 button's 104 × 108 bottom-right corner; `[]` = none). The UI calls it (`ui/Run.tsx sendHudRects`, `hudRectsOf`) when the wave's HUD mounts, on every resize of the run's box, and whenever one of `.mj-hud-tl`, `.mj-hud-tc`, `.mj-hud-tr`, `.mj-skill` changes size (a ResizeObserver on each: the boss's scroll, the 镜奁 row, the marks), and after a settings change; the floating stick is not a rectangle. Two chevron sprites baked per renderer at the screen's resolution (`chevPx(dpr)`: 64 / 96 / 160 px at dpr 1 / 2 / 3, so even the boss's is drawn ≤ 1:1), with a deep tail notch so the direction reads at 16 css px; top-K insertion into fixed typed arrays; ≤ 8 drawImage a frame. During a wave only.
- **The engine applies live, logic applies permanently.**
  - Mid-wave levels: +1 气血, heal 1.
  - The next wave starts at full 气血.
  - 大橘's lives, `once` effects and 醉 come back in the `WaveResult`.
- **Stats.** `setup.stats` is `computeStats(run)`. The engine re-evaluates live conds (HP%, still, swords in air, 醉, moon phase, buffs) on top of it.
- **Numbers and budgets.**
  - Caps by quality (GDD §24.3).
  - Draw order: arena → telegraphs → drops → enemies → the bodies' HP bars → summons → player → effects and impact sparks → player shots → your HP bar → numbers → enemy shots → overlays → off-screen threat chevrons. The vermilion enemy shots stay on top of everything the player's side makes, numbers included.
  - In the dark (暗月, 大雪, 天狗食月: `light(r)`), the darkness is drawn after the field (numbers included) and before the danger: the enemy's zones, telegraphs, enemy shots, the skill reticle, then the overlays (`drawOrder(dark)` in `engine/render.ts`). The HUD gets `HudState.dark` (`.mj-dark`: light words).
  - No `shadowBlur`, `filter` or per-frame gradients.
  - 打击感 (`engine/feel.ts`): the monsters show the hits; **the camera never moves and the world never stops in ordinary play** (屏幕抖动, round 5). The struck body flashes (2 white frames in an ink rim, then an ink tint), squashes along the blow, recoils and, on medium/heavy blows, freezes locally 45–75 ms from its own bank (≤ 30% of a second) while the world runs on (no square-wave shiver: `JITTER` 0); elites and bosses stagger every 8% / 4% HP. Drawn only (Feel.pose); marks (feel.mk) are drawn in the enemy layer and take the light of the weapon that struck (`tintOfWeapon`; the class's own where that light is ink); death fragments (feel.fr: the body's own sprite broken into irregular shards with a white-hot rim, FeelSprites.shards, baked on first sight) are drawn at the end of the `effects` layer, over the blows' light, under both kinds of shot. A kill that breaks the body leaves out the world's ink burst; the pieces are white for their first 35 ms, never under reduced motion. `addTrauma`, `kick` and `punch` are no-ops (`offX` / `offY` / `zoom` stay 0; `drawFrame` still applies them, so the contract's fields keep their meaning); `stop(ms)` is counted (`st.stopReqMs`) and never granted — only `stopHard` stops the world: a boss's phase (120 ms) and death (160 ms). `shake(px)` (a boss's slam) is a haptic tick, ≤ 1 per 0.5 s. The big moments answer without moving the picture: a boss's phase or death and a hard blow you take (≥ 15% max HP, or a boss's; ≤ 1 per 0.6 s) pulse the screen's edge dark (`Feel.edgePulse`: ≤ `PULSE_A` 0.25 over `PULSE_S` 0.3 s, the `overlays` layer), with the rings, crown, sound and haptics as before. Your figure when hurt: a ≤ 2 u nudge along the blow (was 7 u), 40% of the old squash, the dark rim ≤ 0.2, and a **steady half-tone (alpha 0.55) through the i-frames**, never a 10 Hz blink. The shake setting now only gates the slam's haptic; reduced motion keeps the bodies' gentle reactions (no white frames, freeze or fling). `navigator.vibrate`: 8 ms when you are hurt, elite kills and the 镜技 at most once a second, boss blows and slams; never ordinary crits.
  - 流光, the player's light (`engine/vfx.ts`, `engine/trails.ts`, `paint/vfx.ts`):
    - What the player's side emits: shockwaves (a soft halo band, a trailing band, a bright leading edge and a lagging second ring, flecks thrown out, a scorch, burn or crack stain that dries), crescent slashes (a light core in the class colour, a trailing smear; claws rake in ink, glaives carry an ink rim), light lances (thrusts, dash cuts), vector lightning, beams, blooms (glow, column of light, halo, the 镇 glyph) and glints.
    - Colours come from `VT` (azure, jade, gold, moon, ink, wine, indigo, green, gamboge, white) with a near-white core, a saturated body and a soft halo. None is vermilion: danger stays the enemy's colour. A weapon's light is `WPN_TINT[id]` (仙剑 jade, steel azure, glaives gold-ink, claws ink, fists and wine wine, talismans gamboge and gold, music green, moon moon-white, ink indigo).
    - Impacts (`Vfx.impact(x, y, ang, r, tint, flav, flags)`, called by `Feel.hit` for every non-DoT blow and by `Feel.kill`): where a blow meets the body, a halo in the weapon's light swells and fades over a hot white core, 4–9 short vector streaks of that light fly out along the blow (all round for a crit or a kill), and what flies off by flavour (`WPN_FLAVOR`, `FL`): steel sparks, a glaive's ink chips and gold sparks, claw and brush ink, wine drops (`FK.drop`), arrow and moon glints, gilt glints, jade chips (`FK.chip`), peach and fire embers rising (`FK.flame`), 雷符 arcs (two short `bolt`s), go stones (`FK.stone`) with a small white clack star, 琴/笛 notes (`FK.note`). `IF.crit`: a gold star-burst with a white heart and longer radial streaks; `IF.kill`: a ring of the killing weapon's light breaking out and a larger white flash (the killing weapon is the blow that landed on that body in the same step, else the class's light); `IF.heavy` (heavy classes, weighty weapons, tier-2 blows) and `IF.big` (elites, bosses) scale it. Life 0.16 s (heavy 0.2, crit 0.26, kill 0.3, big kill 0.42). Budget: `impStep` a step (crits and kills twice that), the pool's `impacts`, and `impGlows` soft glows a frame (past it an impact draws its vectors only); all halved by the frame guard. Reduced motion: a gentle halo at half strength that does not swell, a faint white core, a static star, the kill ring standing near its reach, no sparks, no 雷符 arcs, half the flecks.
    - Melee crescents are thicker (width `clamp(0.21 r, 8, 34)` u) with two afterimages lagging behind the head (one on low, none with reduced motion), a white core and a white hairline on the cutting edge, and a soft bloom of the class light at the leading tip. A thrust's lance ends in a glow. Player shots burn a white head over their tip (`HEAD_OF` in render.ts, from the shot-glow budget), their ribbons are wider with a stronger core (halo 2.7×, body, core 0.4×), and light shots shed a mote of their light into the wake (`VFX_CAP.sheds` a frame: low 0, mid 5, high 10; none under the guard or reduced motion). The pestle, the 七星 landing and the gourd's splash add a flash of their light.
    - Budgets by quality in `VFX_CAP` (rings, halos, slashes, lances, bolts, beams, flecks, blooms, stains, shot glows, trails, ribbon passes, impacts, impacts a step, impact glows a frame, sheds). The frame guard (`degrade`) halves them and drops the soft halos and shot glows. Everything is pooled typed arrays on simulation time (they hold with the hitstop and clear on a new wave); crisp parts are vector paths with flat colours, soft parts sprites baked once per session behind the loading bake (`vfxSprites(q)`). No gradient, `shadowBlur`, `filter` or blend mode per frame.
    - Trails (`Trails`, owned by the renderer): shots (flying swords long, fast shots short, ink blobs wet ink), your dash and leap (with up to three afterimages), fast summons (a diving crane, a charging 墨宝); orbiting blades draw an analytic arc ribbon. Low: 12 trails and two passes; mid 40; high 96.
    - The renderer turns any leftover `fx('shockRing' | 'pulseRing' | 'levelRing' | 'slashArc' | 'boltChain' | 'critSpark')` into vectors on first sight: a slam or roar that is not the player's is an ink ring; the level-up at your feet is a wide gold double ring with a halo, a second gold ring after it, a tall column of light behind the figure and 16 rising glints (the feel layer's two rings of gold streaks and glints start 40 u / 22 u out, so no streak's tail crosses the figure); `critSpark` becomes a gold bloom. The melee swipe sprite of the feel layer is no longer drawn: the crescent replaces it (`Feel.swing` still sets the held weapon's follow-through and the whoosh).
    - Reduced motion: shockwaves stand near their reach (from 0.85 r, `RING_CALM0`) and fade in place at 60% instead of sweeping out, crescents open at once and fade where they stand, half the debris and rising glints, trails half as long, one afterimage, no white flash cores on rings, no glint stars, no re-jagged lightning, no zone spin or breathing, halos held still, quick glows at half strength, and the i-frames a steady half-tone instead of a 10 Hz blink.
    - Layering: columns of light (`BK.column`: level-up, the elixir, 嫦娥 rising, a boss breaking) are drawn by the `player` layer before the swords and the player (`Vfx.drawUnder`), so the light rises behind the figures; everything else in the `effects` layer. A shockwave's ground stain stays local (a crack ≤ 64 u, a scorch or burn ≤ 84 u); a glow under a shot is ≤ 34 u. `VF.cut` draws a lance whole as a cut mark that thins in place (一剑光寒's cross, laid back along his path on what he cut, clear of his figure).
    - Every 镜技 answers the press on its first frame (广寒清辉 a moon ring as she lifts off, and she is drawn raised through the rise; 玉杵捣药 the pestle's jade lance raised before the first pound). The 古琴's pulse is a green shockwave with a body band and glints; its resonance beat a big one with a halo. A 桃木剑 shot (and its resting blades) flies as its own projectile, `proj:peachSword` (PROJ_REG, appended): a peachwood blade with carved notches, a white-hot spine and a gold tassel in gamboge light. Your 镜技 reticle is gold with an ink hairline, and edge titles are dark gold ink: vermilion stays the enemy's.
  - Simulation ≤ 4 ms and draw ≤ 6 ms on a mid phone.
- **Item effects.** The engine interprets every in-wave `Effect` (types.ts §2) with one switch on `do`, and `special` with one switch on `key`.

### 3.1 Round 8 (m8): the seams, item ops, the verbs, 月华 tiers and held weapons

Engine-core additions in round 8. No tunable literal lives in `engine/`: each number is read from `F` or a def.

**Seams.**

- **World** (engine/world.ts, the m8 seams block): `guardHook`, `hurtScalers[]`, `afterHurt[]`, `teleOwner`, `cdX`, `onStream`, `playerHooks[]`, `ownLost`, `moveCap`, `press(at)`, `release(dir, at)`; `hurtFrom(…, shot = -1)`; `dropOne(kind, x, y, worth, coin, { own, hold, noFuse })`; `result().lost`; `begin` resets them all, then calls `registerItemHooks(this)` and `registerHiddenHooks(this)`, and starts one `CONTENT.items` Behaviour per held item after the passive. The 劫 月华 bonus reads `F.curseMoon`; the 伤害 floor reads `CLAMP.dmgMin`.
- **Engine.** `skillPress(at?)`, `skillRelease(dir, at?)`, `setTimeScale(x)` (reset by `start`).
- **Order in `hurtFrom`:** invuln / untargetable / leap → **guard** → i-frames → dodge → blocks → 关公's aura → **hurtScalers** → armour → shield → damage → (not a DoT) feel, event, thorns, **afterHurt** → lethal.

**Items.**

- **Mods are lists (I1, `engine/effects.ts`).** `conv: LiveConv[]` (every live convert: `moonHeld`, `summons`, `near` = foes within `r`, `moonNear` = unpulled moon-kind worth within pickupR + `r`; the World fills `near` / `moonNear` in `itemConvReadings` each step), `shards[]`, `echo[]` (a slot sums the echoes of its classes), `every[]` (each with its own count), `charm` merged (largest `x` / `dmgPct`, bursts added), `returnHeal` = the larger `v` with the caps added (剑归 + 洗剑池), `evBuffs[]` (onDodge buffs included). Two items with the same op both apply.
- **Class conds** read `cls`, `when` and `pct` together (`classExtras`), so 满弓's `{ cls: 'bow', when: { k: 'still', s } }` works as data.
- **Every op has a reader (I11).** `apply` ends in `assertNever`; `OP_READERS: Record<EffectOp, files[]>` names where each op is read and `UNREAD_OPS` lists the ones with no reader yet (empty now: all 26 items are live, none is `wip`). `tests/mirror-m8-items.test.ts` checks both, and that no `wip` item is left.
- **Event buffs (I2).** `{ hook: 'onHit' | 'onCrit' | 'onKill' | 'onDodge' | 'onHurt' | 'onGo', do: 'buff', stats, dur, stack?, cls?, moveX?, after?, key? }`. Keyed `key ?? '<item>#<fx index>'`; each trigger adds a stack up to `stack` and refreshes `dur`, and all stacks end together. `cls` filters hits and crits to that class's weapon hits (weapon hits without `noProc` only). `moveX` multiplies walking after the 画地为牢 cap. `onHurt` rides `afterHurt`; `onGo` fires in `tickPlayer` when you start moving after standing still for at least `after` s. World: `itemBuffs(hook, slot, still?)`, `itemBuff(b)`.
- **The new ops' readers.** In `strikeIn`: `execute` and `far` multiply beside vulnerability (weapon hits of their class), `pin` roots instead of pushing, `status` (`bleed` with `ofHit`, `vuln` with `bossV`, `convert` with `p` × proc × 福缘 and its own `cap`) and on-hit buffs. In `killIn`: `blast` (queued, raw, at most `perSec` in any 1 s window, a boss ≤ `bossPct` % a burst and ≤ `bossPerSec` bursts a second) and `spread` (the victim's strongest burn to the `n` nearest within `r`, at most `perSec` in any 1 s). In `onDodge`: `prime` (World `primeT` / `primeMask`; `weapons.ts fireWeapons` makes the next attack of each primed slot a sure crit × `x`; 墨宝 and 棋子 never). `statusSlot('bleed', …, v > 0)` uses `v` as that stack's damage a second, and a refresh at the cap keeps the larger. `W.itemTally` counts bursts, boss bursts, spreads, turns, primes, 月华 scattered and stream hits per wave.
- **Batch c / d readers.** `guard` (醉卧沙场) is a `hurtScaler`: × (1 − min(max, pct × ⌊醉 / per⌋) / 100), DoTs too. `scatter` (千金散尽) rides `afterHurt` → `World.itemScatter()`: pct % of the 月华 in hand (≤ max) leaves it as own pearls (`splitMoon`) at pickupR + `F.itemScatter.near…far`, held `F.itemScatter.hold` s, never fused; taken back they only return, left lying they are `result().lost` (endWave subtracts it once, never below 0). `stream` (月华如练) sets `onStream` → `World.itemStream(i)`: a flying pearl strikes each foe within `F.itemStream.r` once (it remembers each foe it struck, at most `F.itemStream.ring` = 16 a piece, never evicting) for (base + Σ scale·stat) × 伤害 × min(maxX, 1 + worth × perWorth / 100), crits, no procs. `hpPct` (饮鸩止渴): `registerItemHooks` sets hp = round(hpMax × lowest v / 100) at the wave start. `world` (与虎谋皮): `eliteAffixOf(run)` adds 镜印 in `wavePlan` (≤ `F.eliteAffixMax`); `killDrops`' Elite branch adds `mods.eliteCrates` 镜奁 (与虎谋皮 itself gives none since QA's 劫 check) and × (1 + `mods.eliteMoonPct` / 100) 月华. `special houji` (厚积薄发): `World.stoneBorn[slot]` is set by `placeStone`; `houjiX(W, i)` multiplies a stone's blast (and a capture reads its oldest ring stone). 静如处子, 动如脱兔, 短兵相接 and 计白当黑 are data only (`still` conds, an `onGo` buff, two `near` converts, an ink class cond and 墨宝上限 −2).
- **诗成 in weapons.** `WeaponSlot.over = critOverflowOf(run)`; `critMOf` passes it to `critMult`. `World.hitSlot`'s skill packets multiply the crit points over 100 by `critOverflowOf(this.run)` the same way.

**Hidden companions.**

- **Verbs (`engine/verbs.ts`).** `SkillDef.input` 'tap' (the 13, unchanged: a press casts, a release does nothing), 'guard' (the press opens the guard at its own event time; with full 剑意 it waits for the release, which is 夺), 'hold' (the press draws, the release looses after `held` s), 'recast' (the bind and the snap act on the release; a press while the run lives goes to `SkillRun.recast`, routed by `World.castSkill`). **A release's `dir`: `null` = cancelled, a zero vector = auto (no drag), else aimed.** `engine.skillPress(at?)` / `skillRelease(dir, at?)` (a release while paused or between waves is passed on as a cancel): `at` on the event clock (`performance.now()/1000`, a pointer's `e.timeStamp/1000`); `worldAt` credits back at most `F.hidden.lagMax`. `engine.skill(t)` stays a press + release in one call (a 'hold' skill looses at once: the tap shot), for the bot and the tutorial.
- **World (`m8:hidden` block; `castSkill`, `tickSkill`; one line in `pushHud`).** `castSkill(at, dir, t?)` records `castT` (the press's world time) and `castAimed`; `cdNext` (≥ 0) replaces the run's cooldown when it ends (× `cdX`). `hidBlades` (越女's 剑意; it carries into the same run's next wave, and a retry or a new run starts at 0). WorldApi's optional members are implemented: `ring(key, v01, o)` (drawn while asked this step), `guard(dur, onCatch)` (attacker as a handle; `shot` = the ES slot or −1), `expose(pct, dur)` (露, a `hurtScalers` factor `exposeX()`), `underTele()` (the striking telegraph's owner handle, or −1; `TeleSpec.owner` gives a `World.tele` an owner, and the boss, elite and 镜主 patterns pass theirs), `tether(h, sag01, tint?)`. `hiddenHud(h)` fills `skillHeld`, `skillRecast` and `ring` (undefined for 'tap' skills). `registerHiddenHooks` resets all this each wave (剑意 aside); only a 'guard' skill sets `guardHook` and the 露 scaler, and only the hidden three get the figure-layer hook (`engine/rings.ts`: the ring, the vines, the 破绽 ✕, 后羿's aim line; it never replaces the figure).

**Art and 月华.**

- **月华 tiers (PLAN D20–D22, art.md §5).** `engine/moon.ts` (pure): `splitMoon(worth, out?)` splits a haul greedily into 满月 (`F.moonTiers[0]` = 25), 月华珠 (`F.moonTiers[1]` = 5) and 月华 of 1; a fractional remainder rides on the last piece, so an ordinary 1–3 kill drops exactly as before. `moonKindOf(worth)`, `isMoonKind(k)` (the three pearls), `isMoonWorth(k)` (+ 金月华, 金鲤), `moonDraws(k, worth)`.
  - `World.dropMoon` uses the split. Fusion past `F.thickAbove` keeps pearls (a fused piece wears 月华珠 from 5, 满月 from 25). `World.collectMoon(worth, draws = 1, big = 0)`: 蓄月 pays one per whole point of a pearl (`draws`), so the income is unchanged; a 月华珠 or 满月 always chimes, an octave up (`audio.pickup(degree + 5)`; the audio primes 15 pickup voices), and a 满月 adds `bell` at gain 0.5.
  - Paint (`paint/things.ts`): the three pearls have 2 frames (v1 twinkles) and no halo; `pearlMap(map)` bakes the bleed deeper on 天宫 (0.75); `paint/index.ts` calls it before a `drop:moon*` bake.
  - Render (`engine/render.ts`): the pearls take no glow from the budget. `moonBob(t, i, calm, pulled)` and `moonFrame(t, i, calm)` give the float (±1.8 u) and the twinkle frame (12 % of the time); both are off under 减少动态 (`moonIdle` wraps the two). Pearls streaming in are drawn after the enemies (`drawStream`), with a tail of 1.4 × 0.9 at alpha 0.85. The pickup ping is a 30 u ring and 3 motes; `engine/feel.ts` `PICK_GLINT` [1.25, 1] adds a second white glint.
- **Held weapons.** `engine/render.ts` `HELD = { size: 0.8, alpha: 1, orbitX: 30, orbitY: 22 }`; `kindScale('wpn:')` 0.85. Every held weapon is drawn behind the figure (`drawHeld`; QA measured the near half drawn in front covering 35–57 % of the figure with 4–6 weapons); the lanes' `playerHooks` still run just before the figure. `WPN_SPECS` (27, `paint/gear.ts`) are redrawn with two-steel blades, 1.1 u contours, gold guards, tassels and a baked class-colour glow; the shop, codex and results icons share them.

---

### 3.x The tutorial's controller (`engine/tutor.ts`) and `World.attach`

- `World.attach(b: Behaviour, arg?)` runs an outside Behaviour for the rest of the wave (cleared at the wave end like content behaviours). It is the only engine-core addition for the tutorial.
- `engine/tutor.ts` reaches the World through the MirrorEngine, like `engine/dev.ts`; every export is a no-op on the stub engine.
  - `attachScript(engine, 'tut1' | 'tut2' | 'tut3', cue)`: the tutorial's wave scripts (d-tutorial §1.6; pacing numbers in `data/tutorial.ts`, which real runs never read). They spawn, draw telegraphs, set the clock and report cues (`move`, `moved`, `kills3`, `pickups3`, `clock`, `pause`, `tele1`, `teleDodged`, `teleHit`, `dodged2`, `lanterns`, `crowd`, `cast`, `foe`, `foeHp`, `tele`, `foeDown`, `saved`). A cue that returns `true` holds the engine (`pauseRequest`, the boss-intro path); the UI resumes it. Their `lethal` keeps the player up (60% HP, 1.5 s grace).
  - `attachTipWatch(engine, cue)`: the real runs' first-time-tip watcher. Read-only: it never draws a random number, spawns, hits, sets a timer or takes a pool slot; it says `'elite'` once, the first time an elite is alive.
  - `clock(engine, sec | null)`: wave time left from now (`null` holds the wave, `0` ends it now); `hold(engine)`.
- The tutorial's run, session and step machine are `tutor/*` (pure); `RunView` takes `sess?: RunSession` (`logic/session.ts realSession` by default) and `practice?`.

## 4. Screens and flow (`MirrorView.tsx` + `ui/*`)

```
lobby ─┬─ 入镜 ─▶ (session.enter) ─▶ ritual 0.8 s (skippable; free run = moon-glint) ─▶ bake 研墨 ─┐
       ├─ 续镜 ─▶ (session.resumeCheck) ─▶ bake ─▶ screenOf(run) or 'ready' (replay)          │
       └─ 弃镜 ─▶ confirm Sheet ─▶ session.abandon ─▶ results                                    │
                                                                                                  ▼
  ┌──▶ ready (tap / Enter) ─▶ wave (engine.start via session.startWave) ─┬─ boss intro card ─▶ resume
  │                                                                      ├─ pause (‖ / Esc / blur / hidden)
  │                                                                      │    ├─ 暂离 between waves: free
  │                                                                      │    ├─ 暂离 mid-wave: 「此重将重来 · 第 k/3 次」
  │                                                                      │    │     → session.leaveMidWave → lobby
  │                                                                      │    └─ 弃镜 → session.abandon → results
  │                                                                      ├─ downed (1st death) → revive dialog ─┬─ 50 文 → engine.revive()
  │                                                                      │                                     └─ 镜碎 → engine.giveUp() → death
  │                                                                      ├─ death → session.died → results
  │                                                                      └─ waveEnd → session.waveWon
  │                                                                              ▼
  │  start pick (wave 0) · cards × n · crate × n · 镜心 × n · shop (openShop on entry)
  └──────────────── 下一重 ◀────────────────────────────────────────────────┘
results 画卷 ─▶ 再入镜 (−20 or 今日免费) · 回镜前 · 存画 (hostSave PNG)
```

- **The run lives in `meta.active`.** The screen comes from `screenOf(run)`, so a reload lands on the same screen.
- **Wave 1 has no shop.** After bake (or 书生's pick) comes `ready`. A mid-wave exit replays that wave from the screen before it: the shop, or `ready` for wave 1.
- **Unmount.** `key={r}` remounts the view on any navigation. Cleanup must dispose the engine, remove the listeners and save; the run in the shop is already saved.
- **Live runs.**
  - Set `.mirror-live` on the root while a wave, a between-wave screen or a pause is showing. It hides the tab bar and zeroes `.view` padding.
  - The lobby shows the tab bar.
  - The 镜 glyph carries one ink dot while a run is paused.
- **Input.**
  - A floating stick in the left 60% (radius 56 for the knob, dead zone 8, **full speed from 20 px** — `ui/text.ts STICK_FULL`; the old ramp to the rim made speed follow how far the thumb happened to travel, so a few px of touch offset split up from down); the base follows a thumb that runs past the rim (`stickFollow`). There is no settle re-anchor near touchdown: round 5's first try (re-anchor while the thumb was inside the dead zone in the first 100 ms) chased any push slower than 8 px an event and ate it; a few px of pad settle now fit under the 20 px full-speed travel. The aim stick uses `stickVector`'s direction only. A left-handed option mirrors it.
  - The 技 button, 72 px: tap for auto-target, drag to aim, drag back to cancel.
  - WASD / arrows, Q / Space, Esc / P.
  - Shop keys: 1–5, R, L + number, Enter.
  - Keys are ignored while a `.sheet-backdrop` is open.
  - Pointer capture, and `touch-action:none` on the arena.
- **Music.** `audio.music(phase, map)` on each screen change. `App.tsx`'s `themeFor('mirror')` hands the music over to the view, as `'walk'` does.
- **Painter stages.**
  - `plan(run,'start')` behind 研墨.
  - `plan(run,'boss')` in the shops of waves 9, 19, 29, 39 …
  - `plan(run,'endless')` in the wave-30 shop, behind a small 研墨 bar.

### 4.1 Round 8 (m8): the new screens, the hidden companions and the 模拟场

UI additions in round 8. Every visible string is a {zh, en} pair, numbers through slots.

**Items.**

- **UI.** `panelView`'s speed tile says 「最快每秒 140（画地为牢）」 under a walking cap (`speedCapSub`); set rows carry `plus` (触类旁通), and the pips and 「再 n 把」 count it. The 点金 button reads the new glossary term `gild`. The 26 icons are painted in `paint/items.ts`.

**Hidden companions.**

- **UI.** `ui/Hud.tsx`: `skillInput(id)`, `cursorDir(engine, sx, sy)`, `skillGlyphNow(hud, own)`; the 技 button presses on pointerdown for the hidden three and releases with the drag (`null` when dragged back), repeats the draw / vine ring on its rim and shows 「夺」 / 「断」. `ui/Run.tsx` keys: Q / Space down = press, up = release (aimed at the cursor with 手瞄), Esc while held = cancel; the right mouse button on the arena is the same verb aimed at the cursor for every companion (released off the arena = cancel; the context menu is off there). `ui/Select.tsx` reads `openOf(m).chars` and shows 「测试码开启」 for a hidden companion opened by the code.
  - Part 2 (H5). `ui/hiddenText.ts` (pure, tested): `HIDDEN_SAY` (flavour, verb seal, reveal verse, title), `HIDDEN_UI` (「？」, the hint 「在{@map}打过第 {wave} 重，哪个镜境都算。」 per O2, 「还没现身」, 「去见见」 …), `hiddenLine(say, id, t, n?)`, `companionTiles(m, t, only?)` (the 13; a hidden companion once open, or sealed once `hiddenTease`) and `sealedView(m, id, t)`. Select draws sealed 「？」 tiles (veiled bust, no name) and the sealed pane (hint, flavour, verb seal, deepest on that map, the disabled 「还没现身」); Codex shows the hidden pages from the tease on (sealed: silhouette + hint); Results shows one reveal card per `report.chars` id (ripple, ink → colour, typed verse, title, 后羿's moon line when 嫦娥 is open; 「去见见」 opens the companion sheet on it and `setLobby`). Coach lines: `ui/tips.ts` `HIDDEN_COACH` / `hiddenCoachDue(m, char)`, whispered twice at the first wave of the first run with each (TipsBrain, `ui/Tutorial.tsx`). `ui/icons.tsx` `Portrait` tries `HIDDEN_BUSTS` first and takes `veiled`. The HUD 月华 pulse (art §5.4) is in Hud.tsx.

**The code and the 模拟场.**

- **The start run and the session (S3).** `sim/sandstart.ts` `sandStart(meta, opts)` builds the run at the end of wave N − 1 (1–70, default 30): the bot's build (`simulateRun`, `immortal`, deterministic per seed), bare hands, a copy of the paused run, or the last sandbox build; 心镜 满阶 / 自有 / 素镜, 心得 满 / 自有, the pool all or mine. `ui/sand/session.ts` `createSandSession(setup)` is a `RunSession` with `sandbox: true` that lives in memory (the tutorial's pattern): no coins (the plan is `[]`, the sleeve is dropped), no meta writes, no revive (no `payRevive`, so the engine gets no `downed` hook), `replay()` for 重打此重, `adopt(run)` (the 敌人 tab's boss fight restarts the engine on the boss's wave: the session follows it, so that wave's win or death is counted; `contentDev.boss()` resolves false and starts nothing if the wave ended or you fell while it baked), the wave log and the death card's top sources (from a `hurtFrom` tally installed by `attach`), the enemy knobs (`knobPlan`; HP, damage and speed also live on the engine's plan) and live sheet edits (`liveSheet`: the engine's sheet moves by the difference, as a 镜宝 grant does). `openSand()` / `leaveSand()` begin and end the tuning.
- **The 模拟场 on screen (S4).** The lobby shows 「试 · 模拟场」 only while the code is on (`codeOn()`); MirrorView's `'sand'` scene loads the sandbox chunk (`ui/sand/Sand.tsx` + `session.ts`), calls `openSand()`, and leaves through one path (`leaveSand()`, also on unmount and when the code is revoked, with a toast); the edits are kept as the draft on leaving, on unmount, on `pagehide` and when the page hides. RunView takes `sess` (a `SandSession`) and `sand` (`SAND_UI`: `Dock`, `Death`, `Pause`; types in `ui/sand/ui.ts`): no coach or first-time tips, no `rememberPlayed` / `rememberPanelBase` / `saveMetaNow`, its own pause sheet (回场前) and death card (重打此重 · 回场前 · 看记录; a bare 倒下了 card if no death was recorded), no revive, its own sheets (导入, 复制) hold the wave with a quiet 'sheet' hold instead of the pause sheet, the boss and endless rosters baked up front, the 工具 switches re-applied after every start, 「直接开打」 starting the wave at once.
- **The dock's tools (S4, part 2).** 本局: the 26 stats (加减 / 设为, live), 「写进同伴底子」 (`sess.bake(id)`: the row becomes `COMPANIONS.<c>.hp/armor/speed/dodge` or `.extra.<stat>` in the tables, so it exports as a real value; 劫数 stays a run row because enemies read items' curse only), weapons (grouped by class, search, tier, 合铸), all items, 月华 (live), 等级, 蓄月 / 收成 / 经验 / 醉 / 大橘的命. 敌人: the four knobs, monsters × n, an elite with 0–2 镜印, treasures, 清场, any boss (双生, 镜主, a phase, 倒悬), the live boss list, 转阶段, 狂暴计时, hazards, 镜蚀 ×0.5/1/2, 节气. 工具: 无敌, 技能冷却 ×, 快慢 (`setTimeScale`), 伤害数字 (`SandTools.nums`: the engine only, never the setting), 回满, 重开此重, 算作过关, 测 DPS (`sess.measure()`, a `MEASURE_SEC` window of game time; `SandMeasure` by weapon, in the log and the export's `measure`), 跳到第 N 重, 现在开店, 刷新免费, 商店品质 / 道具品质 (open 数值表 on that search), 月华. A phone sheet holds the wave unless 「边看边调」 (40 %); its grip raises it to 92 %. Keys: T, G, R, [ ], / (search).
- **数值表 (S5).** Browse 24 groups → entities → rows, or search names, ids, paths and labels (the owner's words too: `SYNONYMS`, `searchTerms`); per-tier and odds arrays are one row of boxes (凡 灵 仙 神; 起始重数 + 4); badges, 共用 · N 处, 源里是算式, the read-only lock, 「合计 N，不是 100 · 补在凡上」; a key with no word (`rawKeys`) shows the entity's own text (`describeWeapon` / `describeItem` / `describeSkill` / `describePassive`). Labels: `ui/sand/labels.ts` (`FIELD`, `PARAM`, `F_LABEL` (every F key), `CLAMP_LABEL`, DIFFS rows by 镜境 name, `leafLabel`); lanes add pairs by CR. The search and the 全部/改过的 chips stay at the top (sticky); the file bar and the money note sit under the results. Read-only: the structural fields plus money (`DIFFS[*].pay`, `MAPS.*.pay`, `F.endless.coinX`, `HEART.*.costs`); literal-typed fields round into their type (item/weapon `tier` 1–4, `COMPANIONS.*.slots` 5–6, `DIFFS[*].unlock.diff` 0–5).
- **The file (S6).** `ui/sand/io.ts`: `buildExport` (only differences, with default, file, label, aliases and `source`), `fileName`, `checkImport` (usable · missing · stale · `ro` (不能改) · `bad` (a wrong type; `null` only for a stat in a StatMods map)) / `applyImport`, `saveTuning` (hostSave → copy sheet → share → download), the draft under `banmu.mirror.sand.v1` (the only storage key the sandbox writes). `scripts/mirror-tuning.mjs print | check | apply [--write] | computed [--write]` takes a returned file back into `data/`; `ui/sand/computed.json` lists the leaves the source writes as a formula.
- **The way back (S6, part 2).** `applyTuningText(text)` (begin tuning + the file's usable changes; the caller ends it) and `verifyTuning(text)` (each change holds, and `dataHash({ except, live: true })` equals the file's `build.rest`). `TUNING=file.json npx vitest run tests/mirror-tuning-verify.test.ts` after `apply --write`; `MIRROR_REALBAL=1 TUNING=file.json [COMPARE=1] [GOD=30] … tests/mirror-realbal.test.ts` plays the owner's numbers (COMPARE: today's first, rows tagged `tuning`).

---

## 5. Engine ↔ content (`engine/content/index.ts` exports `CONTENT: ContentRegistry`)

**Registries.** Content registers implementations keyed by registry ids:

| Registry | Keyed by |
|---|---|
| `skills` | `SkillId`/`AltSkillId` → `SkillImpl` |
| `passives` | `PassiveId` → `Behaviour` |
| `hazards` | `HazardId` → `Behaviour` |
| `elites` / `treasures` / `bosses` | → `ActorImpl` (`bosses` includes `'mirrorself'`) |
| `patterns` | `BossPatternId` → `PatternImpl` |
| `affixes` | `AffixId` → `AffixImpl` |
| `mutators` | `MutatorId` → `Behaviour`; `start(w, x)` gets the strength |
| `terms` | `TermModId` → `Behaviour` |

A missing entry is a no-op, so the core runs before content is finished.

**When things run.**
- `Behaviour.start` runs at the wave start for the run's passive, the map's hazards, the active mutators and the 节气. They get `tick` every step, `on` for combat events and `end` at the wave end.
- `lethal` lets a passive (九命) veto a death.
- Actors get `init` at spawn, then `tick`, `hit` and `death`.

**Split of work.**
- **Bosses.** The core spawns the boss when the wave's `SpawnPlan.boss` says so. Content drives it from `BOSSES[id].phases`: it runs the script's `PatternCall`s through `patterns`, and calls `w.bossPhase` at the 60% / 25% thresholds (and 10% under 倒悬). The runner handles 1.2 s invulnerability, 120 ms hitstop, `clearShots('enemy')`, the phase title and enrage from 90 s (150 s on 闲游). The core raises `hooks.boss`.
- **Skills.**
  - The core owns the cooldown, the button state and the targeting input.
  - `SkillImpl.target` gives the auto-target, then `cast` returns a `SkillRun` that is ticked until it returns `false`.
  - The cooldown starts then, and does not scale with 攻速.
- **Static vs runtime numbers.**
  - Static stat parts of passives, 节气, vows, 双精 / 疾影 / 厚甲 and 心镜 are applied by logic (`computeStats`, `wavePlan`).
  - Content implements only their runtime behaviour: 墨潮, 回光, 碎镜, 暗月, 反照, affixes, hazards and the like.
- **Effects.** Content draws the player's light through `vfxW(w)` from `engine/vfx.ts` (`shock`, `ring`, `slash`, `lance`, `streak`, `bolt`, `beam`, `bloom`, `motes`, `stain`, `impact`; every strike through `w` already lands its impact), never with gameplay numbers. The enemy's side keeps `w.fx(...)`: its telegraphs stay vermilion and its rings are drawn in ink. Every 镜技 has a cast and a landing signature, and a boss's death breaks in gold (`bosses.ts` `bossDownFx`).
- **What content may keep.** The `WorldApi` object and the views it returns are reused, so never keep them across calls. Keep handles (numbers) and your own state object.

### 5.1 Round 8 (m8): new rules, item Behaviours, the hidden kits and their 镜主

Content added in round 8. Numbers live in `SKILLS[id].p`, `PASSIVES[id].p`, item `fx` or `F`.

**Balance.**

- **Content.** 剑幕: `yijian`'s `end` buffs `jianmu` { armor: p.guard } for p.guardDur. 捣药: each pound's packet carries `status: vuln` (p.vuln, p.vulnDur). 猫步: the `jiuming` Behaviour buffs `maobu` { aspd: p.dodgeAspd } for p.dodgeDur on each `dodge`. 酒入豪肠: the `baipian` Behaviour heals p.critHeal on each `crit` event, at most p.critHealCap in any 1 s window. 剑归, 药力 and 老渔 are data (`returnHeal`, `convert` from `regen` and `luck`). 心魔's shadow drops a 镜奁 with its fx's `crate` % chance (`mods.demonCrate`, rolled on the engine rng in killSlot's Demon branch). 心魔 is 劫 3 with a 10 % casket since QA found the sure casket a net gain against its 劫 (A10 pairs, seeds 11–16: mean W −0.40, clear-20 71 → 70).

**Items.**

- **Item Behaviours (I9).** `CONTENT.items` (`engine/content/items.ts ITEM_BEHAVIOURS`) start after the passive with `arg` = the count held and hear every combat event. `registerItemHooks(w)` runs each wave: it resets the item ops (`w.itemBegin()`) and registers what the held items need on the seams.

**Hidden companions.**

- **Content (`engine/content/hidden.ts`).** `kitHit(w, cls?)` (hidden.md §2.6), `loose(w, def, held, dir, own)` (射日's arrow, also 满弓's free sun arrow; `inSunArrow(w)` is true while a free one strikes, so a sweep tallies it apart), `hiddenTally(w)` (guards, catches, perfect, whiffs, reflects, breaks, seizes · binds, snaps, taut, refunds, withered · looses, sweet, slips, suns, cancels, sunArrows), `isMarked(w, h)` (破绽). Every number is `SKILLS[id].p`, `PASSIVES[id].p` or `F.hidden` (lagMax, ringPad, ringIdle, reflectSpeed, reflectMin, reflectLife, reflectR, cutDur).
  - 越女: a caught blow sets i-frames `iframe` (the guard sits before i-frames, so the window still catches a chain); the fourth blow in one guard clears them once and lands (its own i-frames then cover the rest of a volley). A shot flies back as a player `flySword` shot (×reflectX its damage, pierce 1); a telegraph's owner is 破招 (+2 剑意); a body gets the counter-cut, stun and 破绽. 精 (within `perfect` of the press): ×perfX, cooldown `cdPerfect`; a catch: `cdCatch`; a whiff: 露 and the full cooldown. 内实精神: +100 暴击 for `critHits` weapon hits within `critWin` after a catch; a crit on a marked foe adds `markCritDmg` 暴击倍数 as a second, quiet strike.
  - 山鬼: binds the n nearest within r (a drag: the cone `coneDeg` that way, out to `reach`); the leash pulls a non-boss back to rest + leash; −drag % speed per stretched vine (≤ dragMax); the snap's m is slackX under `slack`, else m0 + min(stretch, cap) / per, taut (≥ `taut`) a sure crit with `stunTaut`; non-bosses land `pullTo` in front of her with 惑 (`PASSIVES.youhuang.p.vuln` for `vulnDur`). Cooldown from the bind; every foe dead first → at most `refund`.
  - 后羿: moves at `move` while drawing; the string slips by itself past `slip` (×slipX, cooldown + slipCd); a cancel costs nothing.
- **镜主 (H7).** `HIDDEN_MIRROR` (engine/content/hidden.ts), numbers in `F.hidden.mirror`: 越女 a warned guard ring (the 镜主 is untouchable for `dur`; your shots inside are caught and come back as `shots` slow shots; after `dashAfter` catching guards, a telegraphed dash cut), 山鬼 a vine that slows you beyond `far` and yanks + roots you if you ended more than `snap` farther than at the bind, 后羿 a line telegraph that tracks, locks and looses (its sweet window glows gold every other shot). `mirrorTally(w)` (mirrorself.ts) counts casts and cases missing (tests: all 16 cast, none miss).

---

## 6. Painter (`paint/index.ts` exports `createPainter: CreatePainter`)

**Atlas ids** (`AtlasId`):

| Id | Asset |
|---|---|
| `char:<CharacterId>` | 48–64 px bust token; export `PAINT` / `P` from `walk/characters/portrait.ts` |
| `mon:<MonsterId \| TreasureId>` | 2–3 variants each |
| `elite:<EliteId>` | |
| `boss:<BossId \| 'mirrorself'>:<0-3>` | phase looks from `BOSS_REG[].phases`; phase 3 = 倒悬 (may reuse 2); `mirrorself` is `run.char` in white on black |
| `boss:moonwater:1:m<0-7>` | 水中月's second phase wearing a moon phase (`MoonLook`: 0 full … 4 new), for its split reflections |
| `wpn:<WeaponId>` | |
| `item:<ItemId>` | |
| `sum:<SummonKind>` | |
| `proj:<ProjKind>` | |
| `drop:<DropKind>` | `cashCoin` has 4 spin frames |
| `fx:<FxName>` | `bossShadow` is the true boss's ground shadow (a zone look; decoys cast none) |

The look of each is the `look` line in `ids.ts`.

- **Every sprite** has a white hit-flash twin (`flash`). Cache keys are `kind|size|dpr`. dpr is capped at 2, or 1.5 on low quality.
- **Bake** is frame-budgeted to about 6 ms per frame. It first awaits `document.fonts.load` (with a timeout), so fallback glyphs never get baked.
- **Resolution.** `createPainter(map, quality, dpr, pxPerU?)` bakes sprites at `pxPerU` = `bakeScale(cssW, cssH, dpr, quality, view?)` (`paint/draw.ts`): the camera's base scale for that screen and view × `HEADROOM` (1 low, 1.1 mid/high), within [1, `K_MAX`] (3 / 3.3 / 3.4). It follows the view: a DPR-3 390-px phone on mid quality bakes at 2.93 near, 1.84 mid, 1.57 far (a DPR-2 one: 18.9 MB of start atlas at near in headless Chromium; mid and far ≈ 40% / 29% less by k², not re-measured since the spans moved to 700 / 820). `painter.k` is the scale in use. Beyond the contract: `rescale(pxPerU, onProgress?, sliceMs?: number | (() => number)): Promise<boolean>` re-bakes everything baked so far at a new scale into fresh pages and swaps them in whole (the old pages are freed after); `bake` and `rescale` run one at a time in call order, and a newer rescale supersedes an older one still running. It re-bakes the arena's obstacle sprites in the same slices and swaps them in with the atlas (dropped if the arena was repainted meanwhile). The engine calls it on a view change.
- **Arena.**
  - `paintArena(geom, seed, inverted)` paints once.
  - `drawArena(ctx, cam)` blits the part under the camera.
  - `stamp(...)` writes death splats into the layer.
  - `wash(0.08)` whitens it at each wave end; the feel layer also washes it by 3.5% every 1.5 s of play (half-life ≈ 30 s). Stains are stamped at 0.5 alpha, and at most one sparked stain lands per step.
  - Layers stay at most about 2× the screen (iOS canvas memory).
- **Drawing helpers.**
  - `drawTele(ctx, cam, shape, k)`: wet ink filling a telegraph; fullness shows the time left.
  - `drawZone(...)`: player washes at 55–70% opacity in class colours.
  - `drawNumber(...)`: crits are white-gold brush numerals in an ink edge and a gold rim (never vermilion: a crit is the player's), abbreviated with `fmtBig`.
- **For DOM screens.** `icon(id, px)` gives shop cards, the codex and the results their pictures, and `arenaImage(w, h)` feeds the 画卷.
- **The readability grammar is the painter's job.**
  - Danger is vermilion: enemy shots are a white core with a 朱砂 rim, 1.5× the player's.
  - Enemies are 焦墨 silhouettes with a paper halo and one accent.
  - 月华 is moon-white and drawn on top.
  - Only the three cash drops are round with a square hole.

### 6.1 Round 8 (m8): the redraw

The round 8 redraw (art.md, hidden.md §3.2 / §4.2 / §5.2). Effects are unchanged.

**Hidden companions.**

- **Paint (H6, `paint/hidden.ts`).** `HIDDEN_SPECS` on ART's brushwork (≤ 50 ops, ≤ 3 washes): 越女 and 后羿 have a fifth frame, their pose (`POSE_FRAME` 'yuenv-guard' / 'houyi-draw' = 4, frames of their own `char:` id; no new atlas ids); 山鬼 rides a leopard on a wider box. `hiddenBustOps(id, veiled?)`, `paintHiddenBust(g, w, h, id, veiled?)` (the app portrait's round fan; veiled = ink at 40 % with a 1.5 px rim in `HIDDEN_RIM[map]`, never a palette colour), `HIDDEN_BUSTS`. `engine/rings.ts` blits the pose frame in place of the figure while 越女's guard window is open or 后羿's draw is held (not while hurt, leaping or risen).

**Art and 月华.**

- **`paint/brushwork.ts` (frozen; additive changes only).** The shared brushwork every redrawn figure and monster paints on (art.md §3 R1–R11). It imports no runtime value from `palette.ts` or `figures.ts`.
  - `body2(b, L: CharLook, v, o?: Body2Opt): Body2`: the standing figure (pool, 5.2 u feet, the robe with a shade wash, a lit wash and folds, the broken 焦墨 contour, an optional R7 `over` mass, the sash, the front sleeve with a hand, the collar, a head of r 8.4 with its contour). Options: `robeW` (10), `hem` (13), `head` (8.4), `robe`, `over`, `sash` (default `L.trim`, `null` for none), `contour`, `collar`, `noSleeve`, `noHand`, `pool`. It returns `{ hx, hy, hr, lean, top, hem, rw, handX, handY }`.
  - `face2(b, hx, hy, hr, v, kind = 'dot' | 'fierce' | 'lady' | 'smile' | 'old', blush = 0.35)`: eyes of r 1.35 with a glint, a mouth and a blush; shut on frame 3.
  - `hair2(b, hx, hy, hr, color, bun = true)`: the hair cap, an optional bun and a moonlit 飞白 sheen.
  - `sheen(b, cx, cy, rx, ry, a0?, a1?, w = 1.8)`: a monster's moonlit dry-brush edge.
  - `eyes2(b, x, y, gap, r, look = 0.3, white?)`: ringed eyes (ink ring, white, pupil, glint).
  - Also `shadeOf`, `litOf`, `mixHex`, `pool2`, `hurtInk2`, `hat2`, `SHEEN`.
  - Conventions: 4 frames (0 idle, 1 and 2 walk, 3 hurt), the box `[-22, -34, 24, 20]`, facing right, hitbox centre (0, 0); at most 3 washes and 50 ops a frame.
- **Companions.** `paint/figures.ts` paints the 13 on `brushwork.ts`. Each pale one has a mid-value mass (R7). The contrast guard is `tests/mirror-paint-contrast.test.ts`: it runs only with `MIRROR_PIXELS=1` and headless Chromium, and needs ≥ 40 % strong-contrast pixels on the 月湖 paper for all 16.
- **Monsters, elites and treasures (A3).** `paint/monsters.ts` paints the 44 on `brushwork.ts` (`sheen`, `eyes2`) and local helpers: `bleed(b, pts, c, grow, tone)` (R4's wet wash, the mass's outline grown ≈ 2.2 u; defaults in `BLEED`), `eye1`, `glowEye` (an accent eye over a 0.28-alpha bloom), `spark` (a treasure's glint) and the elite `seal` (1.3×). Frame counts are unchanged (3; 墨蝌 2). Every crisp mark carries its bb and every frame keeps to ≤ 3 washes (`mirror-paint` checks both). The bleeds stay inside each sprite's old box where they can, so the canvases barely grow (the 月湖 roster's are ×1.03 the old area).
- **Bosses (A4).** `paint/bosses.ts`: every phase look `boss:<id>:<p>` has `n: 2`, two idle frames with a real breath (`render.ts` already alternates a boss's `v` at 2 Hz). 水中月's eight reflections (`MOON_SPEC`) keep one frame. Scale and feather lines are 1.4 u, eyes have a ring and a glint (`eyeB`), axes are in two steels, 金蟾王 holds a coin, and 水中月 has an indigo bleed round its moon.
  - Memory: `big(r, paint, halo, box, tight)` takes a tighter box for phases 0–2 (phase 3 keeps the box its vermilion ring needs), and `paint/index.ts` bakes a boss's frame 1 without its own hit-flash twin: it shares frame 0's (`sharesFlash`; not 镜主, whose two frames are walk steps). A boss fight's atlas stays within a few per cent of the one-frame bosses.

---

## 7. Audio (`audio/sfx.ts` exports `createMirrorAudio: CreateMirrorAudio`)

- `prime()` renders the cached voices behind 研墨.
- `sfx(name)`:
  - cached voices through `Mixer.cached`, with ±6% rate jitter;
  - at most 4 sounds per 50 ms, with per-kind caps;
  - never `audio.pluck` per hit.
- `pickup(combo)` climbs 宫商角徵羽.
- `music(phase, map)` hands the phase to the music director (`audio/music.ts`, `mirrorMusic`):
  - `'mirror-calm'` for the lobby, the shop and the results; `'mirror'` for a wave; `'mirror-boss'` for a boss;
  - a wave starts with a 0.3 s cut and a drum fill; a boss with a 大鼓 roll into the 大锣; results (镜碎) drop out fast;
  - it switches only when the phase or the map changes (a new map restarts the band after a 0.52 s breath). The map colours the instruments and tempo. The themes must pass `tests/music.test.ts` (bounded layers, 宫 on F).
- `hud?(s, crowd)` (optional): the engine calls it from `pushHud` (≈ 8 Hz, and once more when the wave ends) with the HUD state and the crowd (living capped enemies / the cap). The director feeds the band the wave clock (layers enter over the wave, the last 10 s tighten), danger (HP under 55 %, a crowd over 55 % of the cap; ≥ 0.5 pushes a layer up) and the boss phase, and plays the clear — 钹 + 大鼓, choked — when the timer reaches 0 or the last boss falls, then drops to calm. Test audios may leave it out.
- The 2 Hz beat (琴师's passive) comes from the simulation clock; the engine calls `sfx('beatTick')` on it. While 夔 is the boss it keeps the beat itself (80 BPM on its fight clock, content plays the tick), and `WorldApi.beat` and `HudState.beat` follow its tempo; the 2 Hz clock returns when it falls.

---

## 8. Fonts and brush glyphs

- **Mirror text** (`src/views/mirror/**`) goes in a lazy `MIRROR_DIR` WenKai twin (ui builder, `build_fonts.py`).
- **Brush text** (tab glyph, boss names, seals, phase titles, 「第 N 重 · 破」) needs every hanzi in `scripts/brush_chars.txt`. Builders list the new brush glyphs in their reports, and the integrator runs `npm run fonts` once.
- **The expected brush set:**
  - the 镜 tab and 幻镜;
  - the 9 + 2 boss names and their phase names (`BOSS_REG`);
  - the skill glyphs 镇花网琴剑符笔弈喵月酒刀奔 (plus 题马 for ☆ 别传);
  - the 镜境 names;
  - 凡灵仙神;
  - 照破印, 誓印, 心印, 月印, 今日免费, 入镜, 续镜, 弃镜, 暂离, 镜碎, 照破, 第重破, 镜心, 镜奁, 镜市, 升级 and 技.
  - Round 8: the hidden three's skill glyph 萝, titles and seals (夺, 破招, 绷紧, 藤枯, 弦松, 化, 镜中来客, 接 缠 弓, 越女 山鬼 后羿), and the code's 「测」 seal with the lobby's 「试 · 模拟场」.

---

## 9. Round 8 (m8)

Round 8 (the owner's asks A, B and C: balance, the shop, 劫, 破釜沉舟's floor, every item open, 26 new items, the hidden 越女 · 山鬼 · 后羿, the redraw and 月华 tiers, the test code's overlays and the 模拟场) is merged into the sections above:

- **Logic:** §2.7 (numbers, the floor, prices, 诗成, ask B and the deed line, the bot, the shop's new rules, the hidden unlock, the code's overlays, the tuning layer).
- **Engine:** §3.1 (the World seams and `hurtFrom` order, the item ops and their readers, the verbs, 月华 tiers, held weapons).
- **Screens:** §4.1 (item UI, the hidden companions' tiles, pages, reveal and coach lines, the 模拟场 and its file).
- **Content:** §5.1 (the companions' new rules, item Behaviours, the hidden kits, their 镜主).
- **Paint:** §6.1 (brushwork, companions, monsters, bosses, the hidden figures and busts).
- **Ownership and anchors:** §0 (the lanes table and the `m8:<lane>` anchors).
