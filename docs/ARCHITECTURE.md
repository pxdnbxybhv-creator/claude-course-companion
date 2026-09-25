# 半亩 · Half-Acre — architecture & art direction

> 半亩方塘一鉴开，天光云影共徘徊。问渠那得清如许？为有源头活水来。
> — 朱熹《观书有感》
>
> *A half-acre pond opens like a mirror… How does it stay so clear? Fresh water keeps flowing in from the source.*

Half-Acre is a habit garden painted in procedural Chinese ink. Every habit is a plant from
literati painting — 梅 plum, 兰 orchid, 竹 bamboo, 菊 chrysanthemum, 松 pine, 荷 lotus. Doing the
habit grows the plant stroke by stroke; the pond in front of the garden reflects the sky only as
clearly as your habits are kept fresh. Around the garden: an incense-stick focus timer (一炷香), a
solar-term almanac (二十四节气 · 七十二候 · 农历), and a hanging-scroll poster export.

It is a static, offline-first web app: Vite + Preact + TypeScript, Canvas 2D, Web Audio. No server,
no accounts, no network at runtime (fonts are self-hosted and subsetted).

## Art direction

**Reference** literati painting (文人画): Bada Shanren's economy, Zheng Banqiao's bamboo, Wang Mian's
plum, Wu Changshuo's bold colour-and-ink, Qi Baishi's lively few strokes.

- **留白 — leave emptiness.** At least ~40 % of any composition is bare paper. Fewer, more
  confident strokes beat many timid ones.
- **Ink first, colour as accent.** Most strokes are ink in five tones (see `Stroke.tone`).
  Colour (rouge plum petals, gamboge chrysanthemum, a touch of malachite) is used sparingly and
  only from `PIGMENTS`.
- **Stroke logic.** Every stroke has a start (起笔, heavier, slight blot), a body, and an end
  (收笔, taper or a lift that leaves dry-brush streaks). Widths taper; nothing is uniform.
- **Asymmetry and rhythm.** Odd numbers, clusters of 3/5, crossing leaves (the "phoenix eye" 凤眼
  of orchid leaves), branches that zig-zag like the character 女, bamboo leaves grouped like 个 and 介.
- **Paper, not screen.** Warm xuan paper (#f1e9d8) with fibres; ink sits *in* the paper (grain
  shows through thin ink). The seal red is cinnabar (#b93a2b), used once or twice per view.
- **Motion is breath.** Slow, eased (cubic-out), never bouncy. Plants sway ≤ 1.5°. A stroke is
  painted in ~60–120 ms along its path. Respect `prefers-reduced-motion`.
- **Dark mode** = the painting mounted on dark silk (装裱). Canvas paintings stay on paper; the
  chrome around them goes dark.
- **Type.** `--font-brush` (Ma Shan Zheng) only for large display glyphs; `--font-text` (LXGW WenKai)
  for all Chinese text; `--font-latin` (Cormorant Garamond) for English.

## Code map

```
src/
  core/        pure logic, no DOM: types, date, rng/noise, habits, lunar, solarterms, astro
  data/        texts: solar terms & pentads, poems, almanac 宜/忌
  ink/         procedural painting
    types.ts        Stroke / Drawing contract (READ THIS FIRST)
    brush.ts        strokes → pixels; rasterize(); StrokeAnimation
    paper.ts        xuan paper texture
    plants/*.ts     one PlantGenerator per plant kind
    landscape.ts    backdrop (sky, mountains, mist, sun/moon), rocks, pond reflection, light
    weather.ts      seasonal particles
    seal.ts         seal stamps
    incense.ts      censer, incense stick, smoke (focus view)
  audio/       Web Audio synthesis in a worker (guqin, harmonics, bowl, knock, ambient beds);
               music*.ts is the generative BGM (composer, themes, instruments, conductor)
  app/         store (signals + localStorage, cross-tab sync), router, i18n, App shell, demo data,
               PWA registration, hostSave (downloads when embedded in a host page)
  ui/          shared kit: Sheet, Segmented, Toggle, toast (with Undo), PlantGlyph
  views/       Garden, Focus, Almanac, Scroll, Settings; games/* (gomoku, xiangqi, klotski, tangram,
               feihua, snake, tictactoe); quests/ (quest book, celebrations)
    walk/        入画, the 3D world (three.js):
      map.ts         the one source of truth for where things are (regions, river, lake, paths, anchors)
      types.ts       the WorldCtx contract every region and feature builds against
      world/         core: terrain, water, bridges, scatter, garden, player, camera, HUD, travel
      regions/       the five places (water town, lotus lake, bamboo, plum ridge, temple)
      features/      festivals, everyday life, mini-games and NPCs (features/minigames/)
      characters/    the thirteen companions (models, portraits, the picker)
  data/        also characters.ts (the cast) and quests.ts; app/play.ts keeps play progress
  lab/         visual test bench: /lab.html?scene=<name> (scenes in src/lab/scenes/*.ts)
scripts/snap.mjs          headless screenshots: node scripts/snap.mjs "/lab.html?scene=brush" .snaps/x.png
scripts/build_fonts.py    subsets the bundled fonts to the characters the source uses (npm run fonts)
scripts/make_artifact.mjs turns the single-file build into an embeddable HTML fragment
```

## Contracts & rules

1. **Display lists.** Painters return `Drawing`s (see `src/ink/types.ts`). Strokes are sorted by
   `birth`; a plant at growth *g* paints strokes with `birth ≤ g`. Growth order should read
   naturally: trunk/culm → branches → leaves → buds → blossoms.
2. **Determinism.** Art randomness comes only from `makeRng(seed)` / `makeNoise2(seed)` in
   `src/core/rng.ts` — never `Math.random()`.
3. **Performance.** Painting is cached: backdrop once per size/env, each plant once per growth
   level. Per-frame work is blits, a pond reflection (≤ 2 ms) and particles. Rasterising one
   full-grown plant at scale 2 should take ≲ 150 ms on a laptop.
4. **Safari/iOS.** Do not rely on `ctx.filter`, `OffscreenCanvas`, or `ctx.letterSpacing`. Use
   `document.createElement('canvas')`, `shadowBlur`, gradients and compositing instead.
   Audio starts only after a user gesture (`audio.unlock()`).
5. **Bilingual.** Every user-facing string goes through `t(zh, en)` from `useT()`. Chinese is primary.
6. **State.** Only `src/app/store.ts` mutates `AppState`; views call its actions.
7. **Times.** Habits use the user's local day (`DateKey`). The lunar calendar and solar-term *days*
   follow China Standard Time (UTC+8), as the traditional almanac does.
