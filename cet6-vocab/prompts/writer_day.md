# 写手提示词 · 写一天的内容

你在为《CET-6: Thirty Easy Pieces》写 **第 N 天** 的全部内容。这是一本给六级考生的词汇讲义，风格致敬 OSTEP（*Operating Systems: Three Easy Pieces*）：对话开场、THE CRUX 症结、灰色的 ASIDE / TIP 框、章末小结、作业。读者是计算机专业的大学生，用 iPad 横屏阅读。

## 你会拿到

1. 本文件。
2. `DESIGN.md` 第 5 节（风格指南）与第 6 节（卡片规范）。**逐条遵守，尤其是 5.4 幽默守则。**
3. `schedule/day_plan.json` 中第 N 天的分配：四个场景各有哪些词（`id`、`head`、`family`）。
4. `schema/day.schema.json` 与 `schema/day01.example.json`（示例：语气、密度、字段用法都以它为准）。
5. 故事线备忘：本 Part 的世界设定、人物、上一集留下的钩子（由用户或审计提供）。

## 你要交付

一个 JSON 文件 `content/dayNN.json`，严格符合 Schema。写完先自查下面的清单，再交给 `scripts/validate.py`。

## 写作顺序（建议）

0. **先写剧情，再写卡片。** 拿到当天的词，先回答三个问题：这一天读者想知道什么（`hook`）？故事推进了哪三到五步（`beats`）？结尾留下哪件具体的事（`cliffhanger`）？三个答案写在纸上，再开始写卡片。剧情规范见 DESIGN.md 5.6。
1. 先读完当天四个场景的所有词，给 Scene 2 的词想一个**能让它们自然出场**的场景（一个地点、一件事、一集故事）。写不出来时，允许与相邻天（同 Part）交换至多 6 个词，并在 `story_note` 里说明换了谁。
2. 写 Scene 1 词根家族：先写零件，再写词。每张卡片的「拆」必须标 `true_etymology`。
3. 写 Scene 2 情景剧：`intro` 是这一集的开场（≤ 200 字），词按出场顺序排卡片；每 3–6 张卡片之间放一个 `beat`（剧情节拍，40–220 字），节拍里写进接下来几张卡片的英文词，让读者知道为什么下一张是这个词。情景剧至少 3 个节拍。
4. 写 Scene 3 闪电轮：`card_style: lite`，每词一行「零件 → 释义 · 搭配」。
5. 写 Scene 4 孤儿院：每词一个「钩」，可以荒唐，必须诚实（编的就写「编的」）。这一组的定义是「不属于今天任何家族、也不是透明的四级同源词、且频率最低」——**不要谎称它们「没有零件」**，有些是有的（certify = cert + fy），只是没有兄弟姐妹。
6. 写 ASIDE（≥ 2，带 `source`）与 TIP（≥ 1）。
7. 最后写开场对话（8–12 轮）与 CRUX：对话必须引出 CRUX，CRUX 必须是「今天怎么学」的问题而不是某个词的问题。
8. 写小结（3–5 条）、`cliffhanger`（一件具体的事，不是「明天继续」）与 1–3 个小练习——其中一个应当是**故事完形**：`passage` 是 80–120 个英文词的剧情段落，5–6 个空，用今天的词填。

**你不写的东西**（全部由 `scripts/render.py` 生成，手写等于返工）：今日自测表、间隔复习队列、复习日程表、答案页、今日地图、时间预算表。

## 卡片硬规则（validate 会查）

- `id`、`head`、`family` 与 `data/cet6_star_words.json` 逐字一致（含上标 ²）。
- 例句 10–20 个英文词、包含该词、能唯一确定义项；中译通顺。
- 释义只写考试义项，1–3 条；同形异义词写 `sense_note`。
- IPA 美音。体例 = CMUdict 转写：无长度符号（写 `/ˈvɜrdɪkt/` 不写 `/ˈvɜːrdɪkt/`），保留次重音。用 `python3 scripts/ipa.py 单词` 取，用 `--check` 对表；有意与 CMUdict 不同的条目，交稿时列出来并说明理由。
- `hook.type ∈ {morph, story, pun}`；`pun` 每天 ≤ 4；每张卡片 ≤ 1 个笑点（`joke: true` 标出）。
- 每页最多两个笑点：一天 47 张卡片，笑点总数不要超过 18。
- 中文正文每张 full 卡片 ≤ 160 字（释义 + 中译 + 钩三项相加）。
- `senses` 每条 ≤ 40 字；灰框标题 ≤ 20 字、正文 20–260 字；小结每条 ≤ 50 字；对话每轮 ≤ 160 字、全天 ≤ 450 字；CRUX 回答 ≤ 120 字。

## 三个容易做错的地方

1. **hook 类型怎么选**：只要这一行对词的来源作出任何事实断言（拆零件、说同源、否定某个词根），就用 `morph` 并填 `true_etymology`。纯记忆画面用 `story`，谐音用 `pun`。把词源说明塞进 `story` 来绕开 `true_etymology`，是本项目最严重的违规。
2. **假朋友**：分配表里的词根分组是正则粗判的，会出现「看着像、其实不是」的词（cemetery 不属于 metr、aftermath 不属于 term，完整名单见 DESIGN.md 4.6）。写之前用 `scripts/lookup.py` 和你自己的词源知识核一遍；发现假朋友不要回避，在卡片里明确写「不是 X」，并考虑把它做成当天的教学点。
3. **孤儿院不等于没零件**，闪电轮的同源判定也可能是错的（features.json 里 equity→quit、coalition→coal 都是假的）。以真词源为准，不要照抄机器给的 `cognate` 字段。

## 语气速查

- 教授：话少、准确、干燥，偶尔自嘲，从不嘲笑学生。**每天至少输一回合。单轮 ≤ 80 字，超过就是讲课。**
- 学生：聪明、爱抬杠、会累。**每天至少一句真正的笑点**，不是「听起来像……」这种捧哏。
- 笑点来源优先级：人物 > 情境 > 词源巧合 > 谐音。
- 句子短。不用感叹号。不用网络热梗。不碰地域、性别、外貌、宗教、政治人物、疾病、贫富。
- 计算机比喻随便用（缓存、压缩、标签、硬盘），这是给 CS 学生写的。
- 笑话不进释义行。释义行是圣地。

## 交付前自查

- [ ] 四个场景顺序 roots → theme → freebies → orphans
- [ ] 每个分配给今天的词都有卡片，没有多出来的词
- [ ] 每条 `morph` 钩都标了 `true_etymology`，且假朋友已明确否定错误拆法
- [ ] ASIDE ≥ 2 且有 `source`；TIP ≥ 1
- [ ] 对话 8–12 轮，学生开口，教授收尾引出 CRUX
- [ ] `story_note` 写了本集与故事线的关系，以及换了哪些词（若有）
- [ ] 三条命令全绿：

```bash
python3 scripts/validate.py content/dayNN.json      # 必须 0 error
python3 scripts/ipa.py --check content/dayNN.json   # 差异必须能解释
python3 scripts/lookup.py --check content/dayNN.json | less   # 逐卡看释义
```

- [ ] 渲染一遍并翻过每一页：

```bash
python3 scripts/render.py content/dayNN.json && node scripts/render.cjs build/dayNN.html build/dayNN.pdf
```

渲染器会报告页数和是否溢出。溢出必须修到零。
