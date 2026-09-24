# 半亩 · Half-Acre

> 半亩方塘一鉴开，天光云影共徘徊。
> 问渠那得清如许？为有源头活水来。
> — 朱熹《观书有感》

**A habit garden painted in Chinese ink.** Every habit you keep is a plant from literati painting:
梅 plum, 兰 orchid, 竹 bamboo, 菊 chrysanthemum, 松 pine, 荷 lotus. Each day you do the habit, the
brush adds a few strokes and the plant grows. The pond in front of the garden reflects the sky
only as clearly as your habits stay fresh. Zhu Xi's poem asks how a half-acre pond stays so clear.
His answer is fresh water flowing in from the source, and that is also how habits work.

**一个用水墨画出来的习惯花园。** 每个习惯是一株文人画里的植物。每坚持一天，笔墨就多添几笔，植物就长高一点。
园前那方池塘，你的习惯越"活"，它映出的天光云影就越清。问渠那得清如许？为有源头活水来。

<!-- SCREENSHOTS -->

## What's inside · 功能

| | |
|---|---|
| **园 Garden** | Habits as procedurally painted plants that grow stroke by stroke. Streaks, a 16-week ink-dot history (tap a past day to fill it in), a one-line daily note, and weekday schedules. Missed days make a plant paler and drier. It never dies. |
| **香 Focus** | 一炷香, "one stick of incense", the old unit of time, used as a focus timer. A bronze censer, a burning stick, and smoke you can stir with your finger. Ambient rain, stream, wind in the pines, or a generative guqin. Pause and resume, and it survives reloads. |
| **历 Almanac** | The lunar calendar (农历, 1900–2100), the 24 solar terms computed astronomically, the 72 pentads (七十二候), traditional festivals, moon phase, sunrise and sunset, a month grid, a year wheel, and a playful modern 宜/忌. |
| **卷 Scroll** | Turns your garden into a mounted hanging scroll with an inscription in your name and your own seal. There's also a *Year in Ink* poster, one dot per day. Save it or share it. |

Everything is painted live. There are no image files for the plants, the landscape, the seals or
the censer, and no audio files either. It is all procedural Canvas 2D and Web Audio.

- **Private by design.** Your data stays in your browser's local storage. No accounts, no server, no tracking. You can export and import a JSON backup.
- **Offline.** It installs as a PWA and runs without a network.
- **Bilingual.** 中文 and English.

## Run it · 运行

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm test             # unit tests (calendar science, habits, store, data)
npm run build        # static site in dist/  (deployable to GitHub Pages)
npm run build:single # one self-contained HTML file in dist-single/
```

Open `/?demo=1#garden` to see a garden with a few months of history.
The lab bench at `/lab.html` shows each painter on its own, for example `/lab.html?scene=plant&kind=plum`.

## How the painting works · 画法

Painters never touch pixels. A plant generator returns a **display list of brush strokes**, and
each stroke has a kind (wet brush, dry brush 飞白, wash, dot, fill, fine line), an ink tone from
the five tones of ink (焦浓重淡清), and a `birth` value between 0 and 1. A plant at growth *g*
paints only the strokes born before *g*. Growth therefore always adds strokes and never reshapes
the plant, and checking in a habit replays the new strokes along their paths as if by a brush.
The brush engine turns strokes into ink with feathered wet edges, bristle streaks that break up
as the brush runs dry, layered watercolour washes, and paper grain.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the art direction and code map.

## Credits · 致谢

- Fonts (SIL Open Font License): [LXGW WenKai 霞鹜文楷](https://github.com/lxgw/LxgwWenKai), [Ma Shan Zheng 马善政楷书](https://fonts.google.com/specimen/Ma+Shan+Zheng), [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond). They are subsetted and bundled.
- Poems are classical and in the public domain. The English renderings are our own.
- The previous contents of this repository (a set of study prompts) now live in [`legacy/course-companion`](legacy/course-companion).

MIT License.
