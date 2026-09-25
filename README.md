# 半亩 · Half-Acre

> 半亩方塘一鉴开，天光云影共徘徊。
> 问渠那得清如许？为有源头活水来。
> — 朱熹《观书有感》

**A habit garden painted in Chinese ink.** Every habit you keep is a plant from literati painting:
梅 plum, 兰 orchid, 竹 bamboo, 菊 chrysanthemum, 松 pine or 荷 lotus. Each day you do the habit,
the brush adds a few strokes and the plant grows. The pond in front of the garden reflects the sky
only as clearly as your habits stay fresh. Zhu Xi asked how a half-acre pond stays so clear. His
answer was fresh water flowing in from the source, and habits work the same way.

**一个用水墨画出来的习惯花园。** 每个习惯是一株文人画里的植物，每坚持一天，笔墨就多添几笔。
园前那方池塘映出的天光云影，随你的习惯是否"活"而清浊。问渠那得清如许？为有源头活水来。

<p align="center">
  <img src="docs/screenshots/garden-desktop.jpg" alt="The garden on a desktop screen: plum, orchid, bamboo, chrysanthemum, pine and a lotus in the pond, painted in ink under distant mountains" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/garden-phone.jpg" alt="Garden on a phone" width="24%">
  <img src="docs/screenshots/focus-phone.jpg" alt="One stick of incense burning as a focus timer" width="24%">
  <img src="docs/screenshots/almanac-phone.jpg" alt="Almanac showing 秋分 and its three pentads" width="24%">
  <img src="docs/screenshots/scroll-phone.jpg" alt="The garden mounted as a hanging scroll with an inscription and seals" width="24%">
</p>

## What's inside · 功能

**园 Garden.** Each habit grows as a plant. A new habit starts as a sprout; around day 66, the
average time it takes to form a habit, it reaches full bloom. Check in by tapping the ensō: the
new strokes are brushed in, petals drift, and a line of classical poetry appears in the sky. You
also get streaks and a 16-week ink-dot history, and you can tap a past day there to fill it in.
Habits can run on chosen weekdays, and there is a one-line note for each day and an archive.
A neglected plant turns pale and dry, but it never dies. The painting follows the real sky:
dawn, dusk, night with the moon in its actual phase, and weather for the season. That means
falling petals in spring, fireflies in summer, geese and falling leaves in autumn, and snow in
winter. With many habits the garden becomes a hand scroll you can pan.

**香 Focus.** 一炷香, "one stick of incense", is an old unit of time, and here it is a focus timer.
A bronze censer holds a burning stick, and you can stir its smoke with your finger. Pick 15, 30,
45 or 60 minutes, or your own length. You can write down what the incense is for, and you can
**tie it to a habit**: when the stick burns all the way through, that habit is marked done. You
can add rain, a stream, wind in the pines or a generative guqin while it burns. Pause, resume or
put it out early; a burning stick survives reloads. A week of incense is shown as painted sticks.

**历 Almanac.** It shows the lunar calendar (农历, 1900–2100), the 24 solar terms computed from
the sun's position, the 72 pentads (七十二候), traditional festivals, the moon phase, and sunrise
and sunset for your location. There is also a month grid, a year wheel of the solar terms, a poem
for the season, and a playful modern 宜/忌.

**卷 Scroll.** It mounts your garden as a hanging scroll (立轴) or a square panel (斗方). The poem
inscription is placed in empty sky, and the date and your record are written in classical
phrasing, followed by your own seal. There is also a *Year in Ink* poster with one ink dot per
day. You can save or share either one.

Everything is painted live. The plants, the landscape, the seals and the censer are procedural
Canvas 2D, and every sound is synthesised with Web Audio. The app has no image or audio files.

- **Private by design.** Your data stays in your browser. There are no accounts, no server and no tracking. You can export or import a JSON backup, and open tabs stay in sync with each other.
- **Offline.** It installs as a PWA and keeps working without a network.
- **Bilingual.** 中文 and English.

## Run it · 运行

```bash
npm install
npm run dev            # http://127.0.0.1:5173
npm test               # unit tests: calendar science, habits, store, texts, focus timer
npm run build          # static site in dist/ (GitHub Pages workflow included)
npm run build:single   # one self-contained HTML file in dist-single/
```

To see a garden with a few months of history, open `/?demo=1#garden` on a fresh browser profile,
or use **Settings → Load demo garden**. The demo link never replaces a garden that already holds
your own data. The lab bench at `/lab.html` shows each painter on its own, for example
`/lab.html?scene=plant&kind=plum&growth=0.06,0.3,0.6,1`.

To deploy, go to **Settings → Pages** on GitHub and choose "GitHub Actions" as the source. Every
push to `main` then publishes the site.

## How the painting works · 画法

Painters never touch pixels. A plant generator returns a **display list of brush strokes**. Each
stroke has a kind (wet brush, dry brush 飞白, wash, blot, pigment fill or fine line), a tone from
the five tones of ink (焦浓重淡清), and a `birth` value between 0 and 1. A plant at growth *g*
paints only the strokes born before *g*. Growth therefore always adds strokes and never reshapes
the plant, and a check-in replays the new strokes along their paths as if a brush were drawing
them. The brush engine turns strokes into ink with feathered wet edges, bristle streaks that
break up as the brush runs dry, layered watercolour washes and paper grain.

The calendar is computed rather than looked up where that is possible. Solar-term instants come
from a truncated VSOP87 solar longitude with nutation, aberration and ΔT. Their dates match the
Hong Kong Observatory tables on 4,794 of the 4,800 terms between 1901 and 2100; five of the six
misses fall before 1929, and the sixth is a term that begins four seconds before midnight. The
lunar calendar agrees with those tables on every day from 1901 to 2100.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the art direction and the code map.

## Credits · 致谢

- Fonts are subsetted and bundled, all under the SIL Open Font License: [LXGW WenKai 霞鹜文楷](https://github.com/lxgw/LxgwWenKai), [Ma Shan Zheng 马善政楷书](https://fonts.google.com/specimen/Ma+Shan+Zheng) and [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond).
- The poems are classical and in the public domain; their texts were checked against 全唐诗/全宋诗, 古诗文网, ctext and Wikisource. The English renderings are original.
- The earlier contents of this repository, a set of study prompts, are kept in [`legacy/course-companion`](legacy/course-companion).

MIT License.
