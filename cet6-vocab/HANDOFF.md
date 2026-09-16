# 交接材料 · 《CET-6: Thirty Easy Pieces》正文写作

> 交接人：Fable 5.1（框架设计、审计）　·　接手人：Astra（写手）　·　日期：2026-09-16
> 任务：接手 Day 3 → Day 29 的正文写作与三个检查站日。Fable 继续做每批次审计与最终验收。

---

## 0. 三十秒版

- 这是一本给六级考生的单词讲义，iPad Pro 11 横屏阅读，30 天，OSTEP 风格（对话开场、THE CRUX、灰框、作业）。
- 词表 1263 个 ★ 六级词已分好到 27 个学习日（`schedule/day_plan.json`）。**你不需要选词，只需要写。**
- Day 1、Day 2 已写完、审计通过、渲染成 PDF。**它们就是标准**，先读它们再读规范。
- 写手只写四样东西：开场对话、CRUX、46–47 张词卡（含灰框、剧情节拍）、小练习 + 小结 + 悬念 + 下集预告。自测表、复习队列、答案页全部由脚本生成。
- 交稿 = `content/dayNN.json` 通过 `validate.py` 零错误 + 渲染无溢出。每写 2 天交一次审计。

## 1. 仓库与位置

| 项 | 值 |
|---|---|
| 仓库 | `pxdnbxybhv-creator/claude-course-companion`（GitHub） |
| 分支 | `claude/cet6-vocab-ipad-design-yhncco`（**所有工作都在这个分支，不开新分支，不开 PR，除非用户要求**） |
| 目录 | `cet6-vocab/`（仓库其余部分是另一个项目，不要动） |
| 最新提交 | `136ae21 Audit Day 1-2 and add the story layer the audit found missing` |

```bash
git clone -b claude/cet6-vocab-ipad-design-yhncco https://github.com/pxdnbxybhv-creator/claude-course-companion.git
cd claude-course-companion/cet6-vocab
```

## 2. 必读文件（按顺序，共约 40 分钟）

| 顺序 | 文件 | 看什么 |
|---|---|---|
| 1 | `samples/CET6-Day1-2-preview.pdf` | 成品长什么样。32 页，翻完。这是唯一的视觉与语气基线 |
| 2 | `content/day01.json`、`content/day02.json` | 你要产出的东西的完整样本。逐字段看一遍 |
| 3 | `prompts/writer_day.md` | 写手规则，79 行，全文 |
| 4 | `DESIGN.md` 第 4.6、5、6 节 | 假朋友规则、风格与幽默守则、**5.6 剧情规范**、卡片字段规则 |
| 5 | `audit/part1-sample.md` | Day 1–2 审计报告：什么会被退回，什么被认为做得好 |
| 6 | `schema/day.schema.json` | 字段的精确约束（长度上限等）。写的时候对照 |
| 7 | `DESIGN.md` 其余部分 | 背景。可以边写边查 |

## 3. 环境

```bash
pip install pymupdf wordfreq jsonschema jinja2 cmudict
npm i playwright            # 或把全局 playwright 软链到 node_modules/
scripts/get_fonts.sh        # 四套开源字体，约 60 MB，下到 fonts/（不入库）
curl -sSL -o data/ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv   # 66 MB，不入库
```

大纲 PDF **不需要**：词表已抽好在 `data/cet6_star_words.json`。

## 4. 每一天的工作流

```bash
# 0. 看今天分到哪些词（四个场景各有哪些 id/head/family）
python3 - <<'PY'
import json; d=[x for x in json.load(open('schedule/day_plan.json'))['days'] if x['day']==3][0]
for k,v in d['scenes'].items(): print(k, [(e['id'], e['head'], e['family']) for e in v])
PY
# 1. 查词：释义、音标、词源
python3 scripts/lookup.py discourse spectrum       # ECDICT：释义、考试标签
python3 scripts/ipa.py discourse spectrum          # CMUdict：美音 IPA（直接抄进 ipa 字段）
# 2. 写 content/dayNN.json（先写剧情：hook / beats / cliffhanger，再写卡片）
# 3. 三道闸门
python3 scripts/validate.py content/day03.json      # 必须 0 error；warning 要能解释
python3 scripts/ipa.py --check content/day03.json   # DIFF 必须是有意的，交稿时列出
python3 scripts/lookup.py --check content/day03.json | less   # 逐卡对释义
# 4. 渲染并翻每一页
python3 scripts/render.py content/day03.json
node scripts/render.cjs build/day03.html build/day03.pdf       # 报告页数与是否溢出，溢出必须修到 0
python3 scripts/build_book.py build/day0*.pdf --out dist/preview.pdf   # 合订看书签
# 5. 提交（只提交 content/、必要时 audit/；build/ dist/ fonts/ ecdict 都已 gitignore）
git add content/day03.json && git commit -m "Write Day 3" && git push
```

`validate.py` 不加 `--partial` 时是严格模式：词数必须等于日历（Day 3–25 为 47，Day 26–29 为 46），每个词必须是分配表分给这一天的。

## 5. 硬规则（校验器会拦的，和审计会退回的）

**校验器拦（0 error 才能交）**
- `id / head / family` 与 `data/cet6_star_words.json` 逐字一致，含上标（`appropriate²`）。
- 四个场景顺序固定：roots → theme → freebies → orphans；freebies 全部 `card_style: lite`。
- 例句 10–20 个英文词、包含词头；释义 1–3 条、每条 ≤ 40 字；full 卡中文（释义 + 中译 + 钩）≤ 160 字。
- `hook.type ∈ {morph, story, pun}`；`morph` 必填 `true_etymology`；`pun` 每天 ≤ 4。
- 对话 8–12 轮；CRUX 回答 ≤ 120 字；ASIDE ≥ 2（带 `source`）、TIP ≥ 1；小结 3–5 条 ≤ 50 字。
- **剧情层**：`hook`（16–90 字）、`cliffhanger`（16–130 字，写具体的事）、情景剧 ≥ 3 个 `beats`（每个 40–220 字，`after` 指向本场景某张卡的 id 或 null）、故事完形的空数 = 答案数。
- 同一天不得同时首次出现 `data/interference.json` 里同组的易混词。

**审计退回（见 `audit/part1-sample.md` 第 3 节的四个真实案例）**
- 任何**来源断言**（拆零件、说同源、否定某词根）必须用 `morph` 并如实标 `true_etymology`；用 `story` 绕开算最严重违规。
- 不许编数字（「命中率八成」这类）；ASIDE 事实要有 `source`。
- 词表里没有的说法不能写（例：bass「分列两条」）；不确定的词源要写「无定论」。
- 释义行里不许有笑话；敏感词（暴力、性、死亡）只给准确释义 + 新闻/比喻语境例句，零笑点。
- 教授每天至少输一回合；学生每天至少一句真笑点；教授单轮 ≤ 80 字。

## 6. 剧情现状（你必须接着写，不能重启）

**世界**：本校（不起名）。校园前身是一座要塞，旧教堂没有屋顶。校史馆地下室有一排 1987 年起没人开过的铁柜。

**人物**：教授（话少、干燥、会认输）；学生 = 读者「你」（聪明、爱抬杠）；**周管理员**（六十岁上下，把钥匙交给你时没松手，说「第三个抽屉别碰」）；系主任；制片公司的律师；电话竞拍者（不留名，称管理员为「小周」）。

**Part I 的总问题**：谁画的《银河骑士》，为什么第三个抽屉被锁了 36 年。

**已埋的碎片**（Day 1–2）：
1. 登记簿写着第三个抽屉最后一次打开是 1987 年 6 月，签名是周管理员。
2. 漫画最后一页被撕掉，撕口很新，不像 1987 年。
3. 抽屉底板下一张 1987 年拍卖行收据：卖方是周管理员，买方空白。
4. 制片公司想买 franchise；电话竞拍出两万英镑但拒绝留名；拍卖流拍。
5. 电话那头说：「告诉小周，最后一页在我这儿。」

**Day 2 小结已向读者承诺的 Day 3 内容**：「五个新零件（cur、frag、min、pos、spect），以及一张没人认领的收据。」Day 3 的词根组正是 cur / frag / min / pos·pon / spect，请兑现。

**节奏**：Day 3–9 每天放一块新碎片（一个人名、一封信、一张照片……），Day 10 检查站揭一半（例如：作者是谁），Day 20、Day 30 各揭一层。不要在 Day 9 之前解决主线。

## 7. 交付批次与审计

| 批次 | 内容 | 交给 Fable 审计的东西 |
|---|---|---|
| A | Day 3、Day 4 | **已交、已审计**（`audit/part1-batchA.md`：修改后通过，M1–M4 须在 Day 5 前返工） |
| B | Day 5–9 | 同上 |
| C | Day 10 检查站 | **先交一页设计稿**（见第 8 节），Fable 批准后再写 |
| D | Part II、III | 见第 8 节的「标注 pass」 |

审计报告会写在 `audit/`，退回级问题要改完再进下一批。**写手自己的核查材料与自检报告放 `audit/writer/`**，`audit/` 根目录只放 Fable 的报告。

## 8. 尚未完成、需要你知道的事

1. **`allocate.py --tags` 还没实现。** DESIGN 4.3 描述的「阶段 v1 标注 pass 后重排」只有提示词（`prompts/tagger_pass.md`），没有代码。**Part I（Day 3–9）不需要它**：Day 1–2 直接用 v0 分配写成了，规则允许你与同 Part 相邻天交换 ≤ 6 个词（在 `story_note` 里记录）。Part II 开始前再决定是实现它还是继续用 v0。
2. **检查站日（Day 10/20/30）没有 Schema。** 设计意图见 DESIGN 3.2：本 Part 故事线收尾对话 + 综合测试（完形故事、配对、辨析、中→英默写）+ 重修名单。写 Day 10 前先交一份一页的字段设计（可以直接提议对 `schema/day.schema.json` 的扩展），Fable 批准后实现渲染支持。
3. **四级词自查表附录**未做，不在你的范围。
4. **每天 15–17 页**是实测值，不是 bug；每页放不下的卡片会整张挪到下一页，场景边界处会留白。
5. v0 的词根分组是正则粗判，**会有假朋友**（已知名单在 DESIGN 4.6）。遇到拆不通的词，明写「不是 X」，可以像 Day 2 那样做成教学点。
6. `features.json` 里的 `cognate` 字段也可能是错的（equity→quit、coalition→coal 都是假的）。以真词源为准。
7. 批次 A 审计后新增的规则（已进 DESIGN 5.6 与写手规范）：每天 ≥ 5 个标记笑点；节拍必须是事件，词只需写进 2–3 个；周管理员每天至少一处「有事没说」；例句开头去重。页内链接（今日地图→卡片、答案→卡片、页脚→当天首页）现已真正输出。

## 9. 已踩过的坑

- 渲染前必须等字体加载：`paginate.js` 已处理，别改。
- 词头上标（¹²）来自词表，不是你加的；家族成员的词性要你补。
- `validate.py --partial` 只给示例文件用；正式稿一律严格模式。
- Jinja 模板与样式在 `templates/`，**不需要改**；若非改不可，改完必须重渲染 Day 1–2 确认没坏。
- `Catholic` 与 `idiot` 是仅有的两处与 CMUdict 不同的音标，都有意为之；新的差异要能说出理由。

## 10. 文件索引

```
cet6-vocab/
├── HANDOFF.md            本文件
├── DESIGN.md             框架（结构、排序、风格、剧情规范、版式、流水线、验收）
├── README.md             入口与状态
├── content/day01.json    已审计通过的正文（标准）
├── content/day02.json    已审计通过的正文（标准）
├── audit/part1-sample.md Day 1–2 审计报告
├── schedule/day_plan.json / .md   30 天分配（谁在哪一天）
├── schema/day.schema.json          每日内容 Schema；day01.example.json 是 8 词最小示例
├── data/cet6_star_words.json       1263 词权威表；interference.json 隔离组；features.json 特征
├── prompts/writer_day.md           写手规则；tagger_pass.md 标注 pass；auditor.md 审计清单
├── scripts/validate.py · ipa.py · lookup.py · render.py · render.cjs · build_book.py
├── templates/day.html.j2 · styles.css · paginate.js
└── samples/CET6-Day1-2-preview.pdf 成品基线
```
