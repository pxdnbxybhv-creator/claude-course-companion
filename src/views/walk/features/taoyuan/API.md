# 桃源 · the valley world — API for the story (C) and the case (D)

Builder B owns these files: `places.ts`, `valley.ts`, `cave.ts`, `fx.ts`, `door.ts`, `world.ts`, `engine.ts`, `taoyuan.css`, and `regions/taoyuan.ts`. Import from them; don't edit them. Ask B (or the integrator) for changes.

## 0. Getting hold of it

```ts
import { taoyuan } from '../taoyuan/world';          // from features/taoyuan/*: './world'
const tv = taoyuan(ctx);                             // TaoyuanWorld | null (null only if the region module did not run)
```

- The region module `regions/taoyuan.ts` creates `tv` when the world is built. That happens before any feature's `init()`, so `taoyuan(ctx)` is never null in a feature.
- The valley itself (geometry, effects, the cleft) is built lazily, on the first `tv.enter()`, behind the veil.
- Everything that needs the valley must wait for it. Two ways:
  - `tv.onBuilt((valley) => …)` runs at once if the valley is already built.
  - `await tv.build()` builds it now.
- `tv.fx`, `tv.valley` and `tv.cave` are `null` until then.

**Where to put your things.**
- Put every villager, prop and prompt of the valley into `ctx.regionGroup('taoyuan')`.
  - A `Bag.add(o, ctx.regionGroup('taoyuan'))` or a `figure(bag, ctx.regionGroup('taoyuan'), …)` does this.
  - Anything added straight to `ctx.scene` survives only if it stands inside the ring (the engine hides scene children that stand far from the pocket).
  - To force an object to stay visible, set `userData.pocket = true` on it.
- Interactables inside the valley prompt only while the walker is inside it (the engine keys them on `pocketAt`).
- Never set `userData.landmark` or `userData.reflect` on anything in the valley.

**Heights.**
- The valley's floor is a deck registered **only while the walker is inside**. So `ctx.groundY(x, z)` at valley coordinates gives the valley floor only while inside.
- To place things, use the pure functions in `places.ts`: `standAt(localX, localZ)` plus `Y_T`, or `tv.valley.standY(worldX, worldZ)`.
- Every anchor in `ANCHORS` / `PLACES` already carries the correct world `y`.

## 1. The plan — `places.ts` (pure, no three.js; safe in vitest)

**Constants.**

| export | what |
|---|---|
| `G` | the valley's centre `{x: 112, z: -58}` (world) |
| `Y_T` | the floor datum, 120 (world y) |
| `FLOOR_R` | 40 (walkable floor radius) |
| `RING` | `{inner: 52, crest: 58, outer: 64}` |
| `CREST_MIN` | 34 |
| `CAVE` | local z along the cleft: `start` 59.8 (set down here), `words` 55, `trigger` 43 (the mouth fires), `mouth` 40, `end` 65.2 (the curtain of light) |
| `CLEFT_END` | local z 63.2: the plank walk's last step, inside the pocket's ring (nothing walkable lies beyond it) |

**Coordinate conversion.**
- `W(x, z)` converts local to world. `L(x, z)` converts world to local.
- Local axes: **+z is south, toward the mouth**; −z is north, toward the spring.

**Height and water functions** (all local):
- `floorAt(x, z)`: the painted floor.
- `standAt(x, z)`: what the walker stands on, including bridges, the hall's raised floor and the cleft's planks.
- `surfaceAt(x, z)`: the floor plus the slopes, the ring and the cleft's rock.
- `waterAt(x, z)`: the water surface (stream, spring, ponds), or `null` where dry.
- `walkAt(x, z)`: the walk mask.
- `streamAt(x, z)` → `{d, s, hw, inCleft}`.
- `cleftHalf(z)`: the cleft's half-width.
- `crestH(angle)`: the crest height at an angle.

**Data.**
- `STREAM`, `CHANNEL` (流觞渠) and `PATHS` are polylines.
- `SHRINE` is the compound's dimensions (door, altar, table, stele, back window, side gate).
- `PAVILION`, `KNOLL`, `SPRING`, `PONDS`, `SQUARE`, `CROSSINGS` (bridge, slab, stepping stones).
- `LANE_LANTERNS` is a list of world points.

**`PLACES`** (world `{x, y, z}`) gives every place of bible §1.2:
- `cave.{start, words, mouth}`, `terrace`, `banks.{from, to}`, `bridge`, `square`, `pole`, `tables`, `channel`, `well`
- `sang.{house, silk, stove, doorstep}`
- `brew.{house, cellar, counter, jar}`
- `lu.{shop, bench}`
- `qin.{house, porch, window}`
- `herb.{garden, basin}`
- `gu.{hut, porch}`
- `shrine.{gate, courtyard, door, altar, table, stele, window, sideGate}`
- `oldpeach`, `spring`, `pavilion`
- `fields.{east, west, pond, coop}`

**`ANCHORS`** (world `{x, y, z}`; `y` is on the surface named, such as the altar top or the bench top):

| anchor | use |
|---|---|
| `altar` | altar top (the lacquer box, the jar before the rite) |
| `incense` | the incense-seal tray (FX10, C1) |
| `spareTray` | 柳婆's spare tray (试香) |
| `altarLeft` | C12's cup ring |
| `shards` | before the altar, on the hall floor (C2) |
| `courtyard`, `courtyardWest` | C5; the west strip is the patched clog's route |
| `hallDoor`, `lanternHook` | the hall door; the guest lantern (B4b) |
| `register`, `stele` | C9 |
| `backWindow`, `sideGate`, `shrineGate` | 小满's way out; the north-west side gate; the outer gate |
| `cellarJar`, `counter` | C3; 杜二's counter |
| `bench` | 鲁三's bench and its job list (C7) |
| `stove`, `silkTray`, `doorstep` | C8, C10, the Sang doorstep |
| `basin` | 葛姑's petal clock (C6) |
| `hollow` | the old 碧桃's knee-high hollow (C11, 小满's treasure) |
| `spring` | B7, FX13 |
| `terrace` | B2, the kite |
| `square`, `poleTop`, `tables`, `cupStop`, `well`, `bridge` | the feast (B3, B4c, B5) |
| `guPorch`, `qinPorch`, `pavilion`, `mouth`, `caveStart` | — |

Other exports:
- `fenceValley(p, walker)`: the photo fence (already installed by B).
- `doorStateFor(flags, hasShideLetter)`: the bible §2 rule.
- `BRUSHED`: the glyphs brushed in the air.

## 2. In and out — `TaoyuanWorld` (`world.ts`)

```ts
tv.enter(o?: { line?: {zh,en}|null; onMouth?: () => void|Promise<void>; atMouth?: boolean }): Promise<void>
```
- Freezes the walker, frames the falls, then lowers a veil of falling white. The veil carries a line, by default 「林尽水源，便得一山……」.
- Behind the veil it builds the valley on the first visit, sets the walker down at the start of the narrow way facing north, and turns the music to `quiet`.
- The promise resolves once the walker can walk.
- At +55 the rock is brushed with 「初极狭，才通人」.
- At +43 the mouth fires:
  - with `onMouth`, the story's B2 runs (it can `await tv.mouthReveal()` first, then say its lines);
  - without it, `mouthReveal()` runs and then the 初至 arrival banner.
- `atMouth: true` sets the walker down at the inner mouth with the valley music already playing. Use it for return visits and tests.

```ts
tv.mouthReveal(): Promise<void>
```
FX2 plus the crane:
- a white-gold flash, then the valley in ink with colour bleeding in from the middle (a plain fade on 低 or under reduced motion);
- a gust of petals across the lens;
- the camera cranes from eye height to 8 m over the shoulder;
- 「豁然开朗」 is brushed in the air;
- the valley music (`taoyuan`) plays.

It resolves when the camera is handed back. It does **not** call the arrival banner. Call `engine(ctx).arrive('taoyuan')` for that: it sets `visit:taoyuan` and shows the banner with 初至 on the first visit.

```ts
tv.leave(o?: { close?: boolean; line?: {zh,en}|null; card?: {titleZh,titleEn,bodyZh,bodyEn,seal?} }): Promise<void>
```
- The camera looks into the cleft.
- `close: true` plays FX14 (petals flow back into the cleft, the rock flickers through four seasons, mist seals the mouth, the light gutters out).
- A paper curtain shows a line, by default 「既出，得其船，便扶向路，处处志之……」.
- The walker is set down on the pool's bank a few steps from the door (out of its reach), turned to look back at the falls, where the camera behind has open air. The world outside comes back exactly (regions, sky, fog, music, ambient).
- `card` is shown afterwards, for example 「出得洞来，日影只移了一寸……」.

**Handlers:**
- `tv.setDoorHandler(fn | null)`: what 「入光」 at the pool does (your B1). With null it calls `tv.enter()`.
- `tv.setLeaveHandler(fn | null)`: what 「出谷 · Leave」 does (at the inner mouth, always, and at the cleft's start). With null it calls `tv.leave()`.
- `tv.setDoorState(state | null)`:
  - `'hidden'`: only the petals circle the pool.
  - `'open'`: the light, 「入光」.
  - `'closed'`: no light; 「寻」 answers 「寻向所志，遂迷，不复得路。」.
  - `'reopened'`: the light for good, 「持花入光」.
  - `null`: the door follows the record (`doorStateFor`: `ty:way` → reopened, `ty:b8` → closed, letter `ty-shide` in the box or `qy:taohua` → open). It is re-read every 1.5 s.
- `tv.doorState` returns the state now.

**Queries and listeners:**
- `tv.isInside()`
- `tv.onEnter(fn)` runs after each veil lifts inside.
- `tv.onLeave(fn)` runs after the walker has left, whichever way (the map's travel included).
- `tv.onBuilt(fn)`
- `tv.wait(ms)`
- A way in or out claims the minigames' `begin(ctx, 'taoyuan')` slot while it runs.

## 3. The valley clock 谷时

```ts
tv.setClock(state: 'shen'|'you'|'xu'|'hai'|'zi'|'case'|'mao'|'chang', o?: { secs?: number }): void
tv.clock   // now
```

The sky, the light and the fog (`sky.setMood`) win over the world's hour while the walker is inside. The engine clears them on the way out; `tv` reapplies the valley's clock on the way back in. Each state also brings:

| state | the look |
|---|---|
| `shen` 申 | honey light; god rays from the west rim (FX5) |
| `you` 酉 | amber and rose, the low sun over the west rim; fireflies begin (FX17) |
| `xu` 戌 | indigo; the lane lanterns lit one by one, 0.45 s apart; fireflies |
| `hai` 亥 | deep night, a great moon over the spring; petals glow in lamplight |
| `zi` 子 | the lantern hour, petals glowing |
| `case` 案 | midnight held, blue: petals frozen in the air (they drift aside round the walker and settle back), the knee-high mist in three layers, no fireflies (FX11) |
| `mao` 卯 | sunrise over the east rim, god rays from the east |
| `chang` 常 | the world's own hour mapped (晨 5–9, 昼 9–17, 暮 17–19, 夜 19–5): the hour the walk was entered at or set to (节 → 时辰), a feature's night, a photo's hour; always spring; the default |

`secs` sets how long the sky takes to turn (default 2.5; 0 turns it at once).

The clock sets no music. The valley plays `taoyuan` inside and `quiet` in the cleft (`tv.hush(on)`; any way out gives it back). For the case, override it with `ctx.music.setTheme('quiet')` and hand it back with `ctx.music.release()`.

A mood (and an effect's fog) is refused outside the pocket: an effect still running as the walker leaves never paints the world outside.

## 4. Effects — `tv.fx: ValleyFx` (`fx.ts`)

All world points are world `{x, y, z}` (use `ANCHORS`). Counts scale with the picture quality. Every glow is a sprite or a point, so 低 looks the same without bloom. Reduced motion shortens waits and turns camera moves into cuts.

| FX | call | notes |
|---|---|---|
| FX2 | `await fx.reveal({secs?})` | the flash and the ink-to-colour DOM layer (a fade on 低) |
| FX3 | always on; `fx.holdPetals(on)`, `fx.petalGlow(k, secs?)`, `await fx.releasePetals()` | 800 petals at 中. Held petals drift aside round the walker. `releasePetals` drops every petal at once, then the rain begins again |
| FX4 | always on | petals ride the stream out through the cleft; one in nine is white-edged (from the 碧桃) |
| FX5 | `fx.godRays(on, 'west'\|'east')` | |
| FX6 | `const c = fx.floatCups({stop?: XYZ, n?}); await c.stopped; …; c.done()` | six cups with candles drift down the 流觞渠; the first stops at `ANCHORS.cupStop` (or `stop`); `done()` sends them on |
| FX7 | `const stop = fx.ribbons(figs, {color?, height?})` | green ribbons trail from each figure's root at hand height; `figs` are `{root: Object3D}` (npc `Figure`s fit) |
| FX8 | `await fx.skyLanterns({n?: 40, from?: ANCHORS.square})` | about 20 s |
| FX9 | `fx.petalBurst(at, {n?: 600, up?, spread?, lit?, wind?})` | also used for the gust at the mouth (`lit: false`) |
| FX10 | `const s = fx.incenseSeal({at?: ANCHORS.incense, size?})` | see below |
| FX11 | `const off = fx.glint(at, {color?: 'gold'\|'silver'})` | a twinkling gold glint over a clue; call `off()` once it is found. Also `fx.heldMist(on)` and `fx.holdPetals(on)` (the `case` clock does both) |
| FX12 | `await tv.da({at?})` (or the bare `fx.da({at?: ANCHORS.hallDoor, sky?: true})`) | one drop from the eaves (「嗒」: a plop), a ripple, a ring of warm colour sweeping out, every petal falling, the sky 子 → 卯 in about 8 s, the mist lifting in three layers. `tv.da()` then leaves the valley clock at `mao`; after the bare call, set `tv.setClock('mao', {secs: 0})` yourself |
| FX13 | `const y = fx.gatherFigure({at?: ANCHORS.spring, points?, height?}); await y.formed; …; await y.burst()` | petals spiral in and gather into a standing figure (夭夭); `burst()` scatters her into the stream. `y.remove()` takes her away at once |
| FX14 | `await fx.closeCave()`, then `fx.reopenCave()` | `tv.leave({close: true})` does both for you |
| FX15 | `await fx.stamp({zh, en}, {seal?: '证'})` | the ink blot, the clue's name brushed, the red seal stamped (about 3.4 s) |
| FX16 | `const ring = fx.lanternRing({at?: ANCHORS.courtyard, r?, n?: 10})`; `ring.light(i)` (a gong each), `ring.lightAll()`, `ring.remove()`; `await fx.inkGhosts(lines, {figures?, perLine?})` | `inkGhosts` shows the truth replayed as ink: the view goes to ink, figures drift and the lines come one by one |
| FX17 | `fx.fireflies(on)` | the clock turns them on and off |
| — | `const off = fx.words(text, at, {size?, life?, rise?, vertical?, color?, stay?})` | words brushed in the air (秦 · 汉 · 魏 · 晋, 过所 ×2, 桃花源…). Glyphs in `places.ts BRUSHED` are fetched with the valley |
| — | `fx.lanterns(on, staggerMs?)` | the lane lanterns (the clock uses it) |
| — | `fx.wait(ms)`, `fx.tween(secs, k => …)` | helpers on the world clock |

**The incense seal (FX10)** has nine pins: `s.pins[i]` is the progress of pin i, in the order 戌初 戌正 戌末 亥初 亥正 亥末 子初 子正 子末.
- `s.pinAt(i)` gives the pin's world point, for a camera look.
- `s.setProgress(p, secs?)` burns the incense up to progress p. The ember sits at the head of the burn and a thread of smoke rises.
- `s.wet(from | null)` darkens the soaked powder from `from` on (C1). The ember dies there.
- `s.ember(on)`, `s.smoke(on)`, `s.remove()`.
- For 柳婆's spare-tray test, make a second one with `fx.incenseSeal({at: ANCHORS.spareTray, size: 0.2})`.

Example: the incense dies at 亥正.

```ts
const s = tv.fx!.incenseSeal();
s.wet(s.pins[4]);                     // soaked from the 亥正 pin onward
await s.setProgress(s.pins[4], 3);    // burn to it over 3 s; the ember goes out there
```

## 5. The valley's things

- `tv.shrineDoor(open, instant?)` opens or shuts the hall's two doors (they swing inward over about a second). Shut, a collider stops the doorway. The doors start open. Shut them for the rite (「祭后闭殿，子正方开」).
- `tv.valley.lanterns.light(i, on)`, `.all(on, staggerMs)` and `.lit(i)` control the lane lanterns one at a time (13, along `LANE_LANTERNS`).
- `tv.valley.caveMat` and `tv.valley.waterMat` are the cleft rock's and the water's materials, if you want to tint them (FX14 washes the rock).
- The valley has no villagers; C adds them. Keep villager figures at about 3 draws each and animate only those within 30 m. The pocket view costs about 50–60 draws and 180k triangles at 中 before the figures.

## 6. The engine — `engine(ctx)` (`engine.ts`)

```ts
import { engine } from './engine';
const e = engine(ctx);
```

| call | what |
|---|---|
| `e.cinematic({to, look, secs?: 2, hold?: 0})` → Promise | Moves the camera from where it is to `to`, looking at `look` (world), eased over `secs`, holds it `hold` s, then hands the view back (it glides back). Under reduced motion it cuts there and back. A second call ends the first where it is. |
| `e.endCinematic()` | Hands the view back now. |
| `e.arrive('taoyuan')` | The arrival banner (the 初至 seal the first time), and it sets `visit:taoyuan`. A pocket region never announces itself. |
| `e.faceView(heading)` | Turns the view to look along a heading at once. |
| `e.restream()` | Re-reads pocket mode, the region and the music now (after a teleport). |
| `e.setMood(mood \| null, {secs?})`, `e.moodNow()`, `e.moodTod()` | The sky mood directly (refused outside the pocket), and the hour it paints (常 resolved). Prefer `tv.setClock`. |
| `e.setFog({near, far, color?} \| null)` | A close mist over the mood, for example for a vision. |
| `e.pocket()` | `'taoyuan'` while the walker is inside. |
| `e.skyTint()` | The sky's light on painted things. |

**What the engine does by itself inside the pocket:**
- The world outside is not drawn: other regions, the land, water, bridges, scatter, the garden, the wall, the season's air and the far ranges.
- Far scene children are hidden.
- The theme is `taoyuan` whatever the hour, with ambient `stream`.
- The map shows 「此中之地，不在舆图」 and no arrow; travel refuses 桃源.
- There are no chance encounters, roaming scenes or rumours.
- The photo camera is fenced: inside 44 m and under the crest − 3, or inside the cleft from there.
- All of it is restored on the way out.

## 7. DEV hooks — `window.__taoyuan`

| hook | what |
|---|---|
| `enter(o?)`, `leave(o?)` | the ways in and out |
| `clock(state, secs?)` | the valley clock |
| `fx(name, ...args)` | calls `tv.fx[name]`, e.g. `__taoyuan.fx('da')`, `__taoyuan.fx('skyLanterns', {n: 20})`, `__taoyuan.fx('stamp', {zh: '冷灶', en: 'A Cold Stove'})` |
| `door(state \| null)`, `shrineDoor(open)` | the door and the hall's doors |
| `places`, `anchors` | the plan |
| `tv` | the TaoyuanWorld itself |

From `window.__walk`: `pocket()`, `pocketHidden()`, `region()`, `info()` (draws and triangles), `teleport(x, z, heading)`.

## 8. 二期「常住」 · everyday life — `life/` (L)

After the story (`phaseOf === 'chang'`), the valley is lived in: food paid in kind, the 特写, six games, 歇一歇. The contracts are in `life/types.ts` and `life/keys.ts`; the full export list and owners are in the phase-0 CONTRACTS.

- `life/index.ts` — the `taoyuanLife` feature (registered after the story and the case). Per world it makes the `LifeApi`, mounts every module (`LifeMount`: `mountPV`, `mountTable`, `mountGames`, then L's), and sets `taoyuanHooks.life`.
- `lifeOf(ctx)` (`life/api.ts`) — the world's `LifeApi`, without importing `life/index.ts`.
- `lifeOpen(flags, storyRunning)` (`life/gate.ts`) — the gate every stall, stand, the board and 歇一歇 check each second. `canTravelToValley(flags)` — the petal (`ty:way`).
- `LifeApi`: goods in kind (`grant`, `stock`, `use`), today's counts (`today`, `day`), the visit (`mood`, `setMood`, `part`, `hour`), the one `taoyuan-life` claim (`claim`, `release`, `current`), `borrow(k, at)`, `defer(fn)` and the one idempotent `restore()` (lens, time scale, the lent hand, the freeze, the cinematic, `seeFocus`, borrowed villagers).
- `taoyuanHooks.life: LifeHooks` — `prompt(k)`, `leaving()`, `talkPrefix(k, who)`, `busy()`. The story asks `prompt(k)` last (only at 常 with the case closed), awaits `leaving()` before 出谷, and prepends `talkPrefix`.
- `taoyuanHooks.story` also offers `talk(k)` (a villager's ordinary chat; give back any claim first), `refresh()` (everyone placed for the hour at once) and `running()` (a beat or a story talk is under way).
- The engine gains `lens(fov | null)` (a held field of view the core honours on resize, the run kick and the photo camera's end; null gives back the walk's own) and `pocketDoor(id, fn | null)` (travel's door into a pocket region, called once its curtain lifts).

### 8.1 The way back (L)

- **The petal.** Once `ty:way` is set, `WorldHandle.waypoints()` appends `{ id: 'taoyuan', kind: 'petal', zh: '持花入光', … }` over the waterfall. The atlas draws a pressed petal (no stele), the map's list shows it, and 「驿站已通 n / 7」 does not count it. Inside the valley the entry says 「此刻就在桃源」.
- **`travel('taoyuan')`** is allowed only with `ty:way` and a registered door: the curtain sets you down at `ARRIVE.taoyuan` (the pool), lifts, then the core awaits `pocketDoors.get('taoyuan')`, which the story registers as its `door()` (`eng.pocketDoor`).
- **`door()`**: with `ty:way` and `tyl:back` it runs `tv.enter({ line: null, atMouth: true })` and calls `mouth()` itself. Without `tyl:back` the cleft is walked; `mouth()` then runs the `back` beat — 小满 2 m ahead: 「你真来啦！……」 — and sets `tyl:back`.
- **「出谷」**: `leave()` awaits `taoyuanHooks.life.leaving()` first while life is busy (a game's 「这局不玩了？」, a 特写 run to its end); false stays.
- **The dark falls**: while 小满's letter waits unclaimed, 「寻」 adds 「信箱里有你一封信，摸着鼓鼓的。」.

### 8.2 The valley's hour (歇一歇)

- `tv.setClock(state, { secs, hour })` keeps `hour` for the rest of the visit (常 paints it); `tv.hour()` returns it, else `ctx.env.hour`; `tv.hourHeld`; `left()` clears it. The story's `partNow()`/`spotNow()` and `LifeApi.hour()` read `tv.hour()`.
- `life/rest.ts`: 「长凳 · 歇一歇」 and 「石瞽的廊下 · 歇一歇」 offer the three parts ahead (`partsAhead`); the hours are `REST_HOURS` 6/12/18/20 (`daily.ts`). It holds the claim (`kind: 'rest'`), tilts the camera to the sky, `setClock('chang', { secs: 2.5, hour })` + `story.refresh()`; reduced motion: a paper curtain (150 ms in, 300 ms held, then out; the hour turns only once it is opaque). It re-asserts the hour if something repaints 常 from the world's hour.
- **开饭**: whenever the part becomes 晨/昼/暮 (a few seconds after the way in, or after 歇一歇): `clapper()` and 桂娘's 「开饭喽！」, once per part per visit; at 晨 also 「小满！洗手！」.

### 8.3 The day's picks and the board — `life/daily.ts` (pure)

- Every daily pick is here, with its salt: `songOfDay` (`tyl:qu`), `waterOfDay`, `leavesOfDay`, `sleeperOfDay`, `draughtOfDay`, `kingOfDay`, `flowOfDay` (+ `FLOW_SPEED`), `seatsOfDay` (5 of `CUP_GUESTS`), `lingOfDay` (`tyl:ling`), `yueOfDay` (`tyl:yue`) and `yueFor(day)` (host, target, line). **The games read them here** so the board, 小满's news and the games agree.
- `boardFor(day, { season, festival?, dishName? })` → `{ title, rows, picks }`: 秦's register page. `newsOf(day, festival)`: 小满's toast at the mouth (daily count `tyl:news`). `festivalDish(key, season)`, `festivalChoices(key, day)`, `cnThousands(n)`, `petalsOfDay(day)`.
- `life/board.ts`: the 「花神杆 · 今日谷中」 prompt (a card), 小满's news on the first way in of the day, and the festival: the lane lanterns at 暮, and 秦's prompt 「外头今天过什么节？」 (three choices; once a day).

### 8.4 Stalls, the bowl, moods — `life/stalls.ts`, `life/moods.ts`

- `STALLS` (valley-local): the stove (`stoveSpot()`), the counter, the wine-flag, the step brazier, the porch brazier, the tray, the ember ring (F's `table-logic.ts PROPS`), the 曲池 (18, 3) and the bowl. One merged `inked` mesh (≈1.4k triangles, 2 draws), colliders while inside, `BUILT` entries in `valley.ts`.
- One smoke `Cloud` (18 × density, 9 at 低, +6 embers, +6 dust): 桂娘's stove chimney at 晨/昼/暮 (`smokeFrom`), 杜二's step at 夜; embers at the fire and the step at night.
- **The 曲 block** (踩曲): `quBlock(ctx)?.hit()` squashes it 4% (it springs back in about 0.3 s) and `.puff()` sends 6 puffs of dust off it. The block is the merged mesh's last box, moved in place (no extra draw); null before the stalls are built.
- 留一碗: `talk:ty.guiniang` ≥ 3, once a day (`tyl:liu`), not at 夜: the covered bowl (1 draw, no outline) and 「长桌那头 · 揭开碗盖」 → `playPV(…, { mode: 'short', at: null })` of a 桂娘 dish on now; free, uses appetite (the festival's one extra serving), records like the table.
- `moodOfTaste(taste)`; 暖 → a breath puff after 3 s still; 醺 → a pink edge vignette and a ±0.4° CSS sway (none under reduced motion), and 「井 · 洗把脸」 at the well, which clears it.
- Echoes (`LifePart.talkPrefix`): 石瞽 hears the freshest dish (`tyl:ate:*` rising) or game (a `LifeActivity` with `kind: 'game'` and **`game: GameId`** — set it) within 4 minutes, once; 夭夭 at dawn before 7 once 桃花粥 is tasted.

### 8.4.1 Seams between the builders (integration)

- **The table → the 特写:** `table.ts` calls `playPV(ctx, tv, dish, { first, own, mode, at: place, season, li, festival, rare, react })`. `festival` (新糕 on red paper at the 春节/元宵 暮 席) comes from `festivalServing`; `rare` is 柳枝炙鱼 paid with a 鳜 (the cook says `ownRare`). A `playPV` that returns within 150 ms (`mode: 'none'`, 不看) means the table shows its own small card: the order ends after 1.0 s and the card stays a while as a note. After a 特写 at a table the walker steps 0.55 m back from the seat.
- **The 鳜:** 摸鱼 with a 鳜 (`bonus`) that kept a 鱼 records `tyl:gui:got`; the table records `tyl:gui:used` when it pays 炙鱼 with it (or the last 鱼 goes). `guiHeld(counters)` (`keys.ts`).
- **流觞's supper:** after the result card, if 鸡黍 was never tasted or today's free bowl is unused, 「吃一碗」 calls `serveDish(ctx, 'jishu')` (`table.ts`): the table's own flow and its 特写. On a festival day the two cup guests without a bay stand by the channel and watch.

### 8.5 Quests and the letter

- `src/data/quests.ts`: `q-zhiwei` (`tyl:eat:` × 12), `q-letu` (`tyl:seal:` × 6), `q-sishi` (`tyl:eat:s-` × 4), seals 知味 乐土 四时.
- `letters.ts` `ty-guiniang` 「锅里给你留着」: due once `tyl:back` is set and `dayNumber(today) − best['tyl:lastday'] ≥ 7`; `life/index.ts` writes `recordMax('tyl:lastday', dayNumber(today))` on every way in at 常.
- DEV `window.__tylife`: `board()`, `news()`, `festival()`, `ask()`, `rest(where)`, `pass(hour)`, `hour()`, `stalls()`, `bowl()`, `qu('hit' | 'puff')`, `fresh()`, `moodOf(taste)`, plus the phase-0 hooks; F's `menu(cook)`, `eat(dish)`, `table()`; P's `pv`, `pvShots`, `pvKit`; G's `game(g)`, `gameStop()`, `gameEnd(score, measure, feat)` (it skips a game's own `after`, so no 流觞 supper), `stands()`.
