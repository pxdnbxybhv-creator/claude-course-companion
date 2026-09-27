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

### 2.1a Balance: tune on the real engine (`sim/realbal.ts`)

- **`sim/realbal.ts` is the balance harness.** `playReal({ seed, char, map, maxWave, beginner, godTo })` plays a whole run on the real engine and `CONTENT`, headless (debug painter, no canvas, ~0.05–0.1 ms a step: a run to wave 31 in seconds). A kiting bot moves; `sim/bot.ts`'s card, crate, 镜心 and shop policy plays between waves. It returns the waves cleared, the trace and the fatal wave's damage by source (`p2 carp` = the boss's phase 2). Sweep: `MIRROR_REALBAL=1 SEEDS=6 npx vitest run tests/mirror-realbal.test.ts` (add `BEGIN=1` for the beginner, `OUT=file.jsonl` to keep rows).
- **The in-app sim (`sim/bot.ts`, `sim/balance.ts`) is a smoke test only.** Its simplified combat step disagrees with the real engine both ways (for the same seeds it gave mean wave 15.8 skilled where the engine gives 19; median 4 beginner where the engine gives 8). It checks that logic runs whole runs deterministically. It does not vouch for `balance.md`'s depths.
- Bot play is not human play: read the harness's depths as relative (before / after a change), and its fatal-source tallies as where to look.
- ⚖3 (2026-09-27, from the harness): enemy damage growth `F.dmg.grow` 1.08 → 1.06; 白鹭 6 → 5; 鲤王's spirals 8 → 6 a second, leap rings 60° gaps at 260 u/s for 60%, the beam 10 → 7. Skilled bot, 月湖 照影, 13 companions × 6 seeds, same bot before and after: median wave 18.5 → 21, reach 20 41% → 56%, clear 30 8% → 18%, wave-10 hazard 32% → 13% (design 1.8%). The beginner bot's median stays 8 (target 9). Still far from `balance.md` §5 (clear-30 56–96%): the next walls are 蜃 at 20, 水中月 at 30 and waves 21–29.

### 2.2 Formulas and the run (`logic/formulas.ts`, `rng.ts`, `spawn.ts`, `arena.ts`, `run.ts`)

```ts
rngFor(seed: number, wave: number, stream: string, k?: number): Rng
computeStats(run: RunSave): Stats          // base + companion + passive + items + sets + cards + 心镜 + 劫数 + static conds
waveLen(w: number, run: RunSave): number | null      // null on boss waves; 急景 / 立夏 / 夏至 applied
budget(w, run): number;  hpX(w, run): number;  dmgX(w, run): number;  spdX(w, run): number;  bossHp(w, run): number
armorMult(a: number): number;  cooldown(cdT: number, aspd: number, half?: boolean): number;  procCoef(cdT: number): number
xpNext(level: number): number;  cardOdds(level, luck): PerTier;  shopOdds(w, luck, extra?): PerTier
weaponPrice(id, t, w, run): number;  itemPrice(id, w, run): number;  rerollCost(w, k, run): number;  cardRerollCost(w, k): number
fmtBig(n: number, lang: 'zh' | 'en'): string        // 1.2万 / 12k: HUD, shop DPS, numbers
arenaGeom(map: MapId, seed: number): ArenaGeom      // obstacle layout; engine, painter and sim share it
wavePlan(run: RunSave, w: number): SpawnPlan         // stream 'spawn'
newRun(o: NewRunOpts): RunSave                       // pending.start set for 书生 / mastery 3; 心镜 start bonuses applied
waveSetup(run: RunSave, meta: MirrorMeta, now: Date): WaveSetup   // plan + trimmed coin plan + mutators + sky + stats
beginWave(run): RunSave                               // inWave = run.wave + 1 (saved before the engine starts)
endWave(run, r: WaveResult): RunSave                  // see below
screenOf(run): 'start' | 'cards' | 'crate' | 'heart' | 'shop'   // the next between-wave screen from run.pending
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
                                  // an unmigratable save settles ('migrate')
commit(run: RunSave): void        // meta.active = run; saveMetaNow() — after every purchase, reroll, lock, sell, merge, pick
startWave(run: RunSave): { run: RunSave; setup: WaveSetup }   // beginWave + waveSetup + save
waveWon(r: WaveResult): RunSave   // endWave + bankSleeve + saveMetaNow + payOwed + record('mirror:coin')
died(d: DeathResult): RunReport   // fold partial, settle (pay + meta), clear active, payOwed, record counters
abandon(): RunReport              // 弃镜 = 镜碎 at the last cleared wave
leaveMidWave(): { interruptions: number; report: RunReport | null }   // 暂离 mid-wave (the 3rd settles)
voidRun(): void                   // engine error before wave 2: refund(20) once a day, or return the free run
```

---

## 3. Engine (`engine/index.ts` exports `createEngine: CreateEngine`)

```ts
const engine = createEngine(canvas, run, { painter, audio, content: CONTENT, hooks, settings });
engine.start(run, setup);         // play wave setup.wave; also used for a replay
engine.pause(); engine.resume(); engine.dispose(); engine.resize();
engine.input.move(x, y); engine.input.aim(x, y); engine.input.cursor(sx, sy);
engine.skill(target?); engine.skillPreview(target | null); engine.setSettings(p); engine.snapshot(w, h);
```

- **Lifecycle.**
  - `start` → phase `'wave'`. On a won wave the engine runs the 1.2 s end: enemies and shots dissolve, 月华 moves to 蓄月, 铜钱 fly to you, then `hooks.waveEnd(result)`, then phase `'idle'`.
  - On death: `hooks.death` → phase `'dead'`.
  - `start` may be called again with the updated run for the next wave, which reuses the pools and the painter.
  - `pause` / `resume` are idempotent.
- **Hooks.**
  - `hud` about 8 Hz (write refs, never per-frame Preact state).
  - `levelUp(level)` mid-wave: the engine already played the ring and the chime.
  - `crate(total)` and `coin(drop, sleeve)`.
  - `boss({kind:'intro'})`: the engine has paused itself. The UI shows the 1.5 s card and calls `resume()`.
  - `boss({kind:'phase'|'dead'})`.
  - `error(e, fatal)`: the first throw drops the offending entity; a second within 5 s is fatal.
- **The engine applies live, logic applies permanently.**
  - Mid-wave levels: +1 气血, heal 1.
  - The next wave starts at full 气血.
  - 大橘's lives, `once` effects and 醉 come back in the `WaveResult`.
- **Stats.** `setup.stats` is `computeStats(run)`. The engine re-evaluates live conds (HP%, still, swords in air, 醉, moon phase, buffs) on top of it.
- **Numbers and budgets.**
  - Caps by quality (GDD §24.3).
  - Draw order: arena → telegraphs → drops → enemies → summons → player → effects and impact sparks → player shots → numbers → enemy shots → overlays. The vermilion enemy shots stay on top of everything the player's side makes, numbers included.
  - In the dark (暗月, 大雪, 天狗食月: `light(r)`), the darkness is drawn after the field (numbers included) and before the danger: the enemy's zones, telegraphs, enemy shots, the skill reticle, then the overlays (`drawOrder(dark)` in `engine/render.ts`). The HUD gets `HudState.dark` (`.mj-dark`: light words).
  - No `shadowBlur`, `filter` or per-frame gradients.
  - 打击感 (`engine/feel.ts`): the camera offset (trauma shake + kicks) never exceeds 6 px (GDD §20.3). `shake(px)` keeps its meaning (trauma that alone gives about px, now capped at 6), and `hitstop(ms)` still pays from the feel layer's bucket. Ordinary hits spend trauma and kicks from their own per-second budget; the big jolts are elite kills, the 镜技, boss phases and deaths, and blows you take. Zoom punches halve with shake off; reduced motion removes shake, kicks, zoom, hitstop, flashes and squash. A blow you take never moves you in the simulation (the knock-back is drawn only). `navigator.vibrate`: 8 ms when you are hurt, elite kills and the 镜技 at most once a second, boss blows; never ordinary crits.
  - Simulation ≤ 4 ms and draw ≤ 6 ms on a mid phone.
- **Item effects.** The engine interprets every in-wave `Effect` (types.ts §2) with one switch on `do`, and `special` with one switch on `key`.

---

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
  - A floating stick in the left 60% (radius 56, dead zone 8); a left-handed option mirrors it.
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
- **What content may keep.** The `WorldApi` object and the views it returns are reused, so never keep them across calls. Keep handles (numbers) and your own state object.

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
- **Arena.**
  - `paintArena(geom, seed, inverted)` paints once.
  - `drawArena(ctx, cam)` blits the part under the camera.
  - `stamp(...)` writes death splats into the layer.
  - `wash(0.08)` whitens it at each wave end.
  - Layers stay at most about 2× the screen (iOS canvas memory).
- **Drawing helpers.**
  - `drawTele(ctx, cam, shape, k)`: wet ink filling a telegraph; fullness shows the time left.
  - `drawZone(...)`: player washes at 55–70% opacity in class colours.
  - `drawNumber(...)`: vermilion brush numerals for crits, abbreviated with `fmtBig`.
- **For DOM screens.** `icon(id, px)` gives shop cards, the codex and the results their pictures, and `arenaImage(w, h)` feeds the 画卷.
- **The readability grammar is the painter's job.**
  - Danger is vermilion: enemy shots are a white core with a 朱砂 rim, 1.5× the player's.
  - Enemies are 焦墨 silhouettes with a paper halo and one accent.
  - 月华 is moon-white and drawn on top.
  - Only the three cash drops are round with a square hole.

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
