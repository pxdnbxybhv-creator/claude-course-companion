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

1. 先读完当天四个场景的所有词，给 Scene 2 的词想一个**能让它们自然出场**的场景（一个地点、一件事、一集故事）。写不出来时，允许与相邻天（同 Part）交换至多 6 个词，并在 `story_note` 里说明换了谁。
2. 写 Scene 1 词根家族：先写零件，再写词。每张卡片的「拆」必须标 `true_etymology`。
3. 写 Scene 2 情景剧：`intro` 是这一集的一段话（≤ 200 字），词按出场顺序排卡片。
4. 写 Scene 3 闪电轮：`card_style: lite`，每词一行「零件 → 释义 · 搭配」。
5. 写 Scene 4 孤儿院：每词一个「钩」，可以荒唐，必须诚实（编的就写「编的」）。
6. 写 ASIDE（≥ 2，带 `source`）与 TIP（≥ 1）。
7. 最后写开场对话（8–12 轮）与 CRUX：对话必须引出 CRUX，CRUX 必须是「今天怎么学」的问题而不是某个词的问题。
8. 写小结（3–5 条，最后一条是明日预告）与 1–3 个小练习。**不要写今日自测和复习表**，那是生成器的活。

## 卡片硬规则（validate 会查）

- `id`、`head`、`family` 与 `data/cet6_star_words.json` 逐字一致（含上标 ²）。
- 例句 10–20 个英文词、包含该词、能唯一确定义项；中译通顺。
- 释义只写考试义项，1–3 条；同形异义词写 `sense_note`。
- IPA 美音，斜杠包围。
- `hook.type ∈ {morph, story, pun}`；`pun` 每天 ≤ 4；每张卡片 ≤ 1 个笑点（`joke: true` 标出）。
- 每页最多两个笑点：一天 47 张卡片，笑点总数不要超过 18。
- 中文正文每张 full 卡片 ≤ 160 字。

## 语气速查

- 教授：话少、准确、干燥，偶尔自嘲，从不嘲笑学生。学生：聪明、爱抬杠、会累。
- 句子短。不用感叹号。不用网络热梗。不碰地域、性别、外貌、宗教、政治人物、疾病、贫富。
- 计算机比喻随便用（缓存、压缩、标签、硬盘），这是给 CS 学生写的。
- 笑话不进释义行。释义行是圣地。

## 交付前自查

- [ ] 四个场景顺序 roots → theme → freebies → orphans
- [ ] 每个分配给今天的词都有卡片，没有多出来的词
- [ ] 每条 `morph` 钩都标了 `true_etymology`
- [ ] ASIDE ≥ 2 且有 `source`；TIP ≥ 1
- [ ] 对话 8–12 轮，学生开口，教授收尾引出 CRUX
- [ ] `story_note` 写了本集与故事线的关系
- [ ] `python3 scripts/validate.py content/dayNN.json` 无 ERROR
