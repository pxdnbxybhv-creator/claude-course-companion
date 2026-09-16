# Day 3–4 · 写手交稿自检

日期：2026-09-16。批次：HANDOFF 的 A 批。基线提交：`2a3d815`。

**状态：写手自检完成，待 Fable 按 `prompts/auditor.md` 正式审计。本文不是 Fable 的验收报告。**

## 交付范围

| 项目 | Day 3 | Day 4 |
|---|---|---|
| 正文 | `content/day03.json` | `content/day04.json` |
| 标题 | 认出了零件，还要读完句子 | 句子里还缺两个词 |
| 词卡数 | 47 | 47 |
| roots / theme / freebies / orphans | 14 / 23 / 5 / 5 | 14 / 24 / 4 / 5 |
| 调词 | 无，全部沿用 v0 分配 | 无，全部沿用 v0 分配 |
| 对话 | 10 轮，245 字符 | 10 轮，247 字符 |
| 教授最长一轮 | 30 字符 | 30 字符 |
| 故事完形 | 5 空，101 词（含词库） | 6 空，108 词（含词库） |
| 其他小练习 | 4 道语境选义 | 3 道结构补全 |
| 渲染 | 17 页 | 17 页 |

合订阅读版：`dist/CET6-Day3-4-preview.pdf`，34 页。生成物依照仓库约定不入 Git；正文与两份核查材料入库。

词源查证、语义复核及修改记录见 [day03-04-sources.md](day03-04-sources.md)。六个子任务分别承担两天写稿、词源查证、剧情连续性、独立语义审计和渲染环境；主写手统一收稿、修改和验收。

## 三道闸门

以下均对正式稿执行，未使用 `--partial`。

```text
$ python3 scripts/validate.py content/day03.json content/day04.json
2 file(s): 0 error(s), 0 warning(s)

$ python3 scripts/ipa.py --check content/day03.json
0 differing

$ python3 scripts/ipa.py --check content/day04.json
0 differing
```

分别执行 `python3 scripts/lookup.py --check content/day03.json` 与 `content/day04.json`，人工逐项复核 94 条对照输出。该命令是词典对照工具，不是有独立“通过”状态的语义校验器。主要有意差异：

- `hardy`：ECDICT 混入 hard 的释义与副词义，正文按 Merriam-Webster 使用“耐寒的；耐劳的，强健的”。
- `intercourse`：补足 ECDICT 漏列的性义，交往例句明确为正式历史语境，不设笑点。
- `venue`：采用活动举办场所义；ECDICT 偏重法律义不能据此否定常用义。
- `refund`：词头用名词读音 `/ˈriˌfʌnd/`，例句也用名词；灰框另列动词 `/rɪˈfʌnd/`。前者是校验器接受的 CMU 变体，因此实际结果仍为 `0 differing`。
- `legitimate`：词头保留形容词读音，`sense_note` 明示动词 `/ləˈdʒɪtəˌmeɪt/`，已确认正文可见。

补充核对：每日 ID 与分配表精确相等，无重复、遗漏或跨日调词；94 个例句均为 10–20 个英文词；full 卡中文长度、搭配数、freebies 字母顺序、故事完形长度与空数均合规。情景剧每个节拍后接 3–6 张词卡。两天各标记 1 张笑点词卡，没有连续三个笑点或单页超过两个笑点。

## 事实与教学复核

- 全部 39 个 `morph` 钩子逐条核源；否定错误拆法的卡仍使用 `morph`，没有把事实断言藏进 `story`。标真的是所写的真实来源，不是 v0 的错误分组。
- Day 3 明说 min 组没有“小”根真成员，fragrant 不属 frag；退款义 refund 不由现代 fund 直接派生。
- Day 4 纠正七个 roots 假朋友；hardy 不称为英语 hard 直接加 -y，outrage 不拆 out + rage。
- 94 张卡的释义、词性、例句、中译、家族词词性及搭配均完成独立回读；已修正 flip 的动作完成度、reminiscent 中译回忆者、arc 的光线描述等初稿问题。
- 两篇故事完形使用乱序词库、每词一次，排除了 scenario / serial、oak / composite 的竞争答案。exponent 的选义答案兼收“倡导者／代表人物”；contingent 结构题限定 be 的一般现在时，同时接受 on / upon。
- sensitive 词采用中性释义及正式、新闻或比喻语境；没有以性、宗教、创伤、死亡或暴力制造笑点。
- 轻卡模板不显示 `sense_note`，故 refund 的读音说明与 specialty 的英美差异放入可见 ASIDE，未依赖隐藏字段。

## 剧情交接（含本批线索）

Day 3 承接流拍后的次日上午，教授和学生再找周管理员核对收据。唯一新增碎片是货品栏写着“社团画稿一箱”，**尚不能证明它只对应眼前这本漫画**。周管理员答应次日开资料间，查 1987 年交接照片；兑现 Day 2 的收据承诺。

Day 4 兑现查照片：三人搬开挡柜的桌子、按原有次序查旧期刊与相册。唯一新增碎片是照片中出现两件同题《银河骑士》的装订物，**尚不能证明内页相同**。下集约定核对交接清单，为 Day 5 留下明确行动。

没有重启世界观、添加新具名角色或提前揭作者；没有把 Day 1“抽屉没有锁”改写成破锁故事。保留共同创作的既有事实，电话人持有末页仍只是其自称。未把故事年份改为制作日期 2026 年。人物摩擦来自查资料、搬桌、借阅登记等具体行动，避免每段都用悬疑金句收尾。

## PDF 复核与已知边界

```text
$ node scripts/render.cjs build/day03.html build/day03.pdf
  17 pages, no overflow
  wrote build/day03.pdf

$ node scripts/render.cjs build/day04.html build/day04.pdf
  17 pages, no overflow
  wrote build/day04.pdf

$ python3 scripts/build_book.py build/day03.pdf build/day04.pdf --out dist/CET6-Day3-4-preview.pdf
34 pages, 18 section bookmarks, 0 broken internal link(s)
```

- 全部页面按 120 dpi 栅格化翻阅；Day 3 第 2、9 页及 Day 4 第 1、16 页另用 200 dpi 细看，共 4/34 页。检查 IPA、中文缺字、轻卡、页眉页脚及进度条。
- DOM 逐卡检查：每天 47 张均渲染，无跨栏、跨页或出界；无溢出、悬挂标题、文字叠压。缩减重复小题并压短答案后，消除了原稿各自单占第 18 页的答案尾巴。保留既有模板在场景边界处的正常留白。
- 合订书签总计 21 项：Part 1 项、Day 2 项、章节 18 项。书签目的页均在页数范围内。
- **继承的导航缺项**：现有模板没有输出页内 `a[href]`，PDF 实际链接对象为 0；“0 broken internal link(s)”不能代表目录→卡片、答案→卡片的点击导航已经实现。基线同样缺少这些内链。本批遵照 HANDOFF 不修改模板，提请 Fable 作为框架问题单独安排。

### 渲染环境补充

首次检查发现 `.fam`、`.tag` 等继承拉丁字体的中文标签缺字；仅下载 web fonts 不足以为这些标签提供系统回退。已将项目下载的四个 Noto CJK 字体注册为用户字体，重新生成全部交付 PDF；未修改模板或渲染脚本。可复现补充步骤：

```bash
mkdir -p "$HOME/.local/share/fonts/cet6-vocab"
cp fonts/NotoSansSC-Regular.otf fonts/NotoSansSC-Bold.otf \
   fonts/NotoSerifSC-Regular.otf fonts/NotoSerifSC-Bold.otf \
   "$HOME/.local/share/fonts/cet6-vocab/"
fc-cache -f "$HOME/.local/share/fonts/cet6-vocab"
```

检查 `fc-match ':lang=zh-cn'` 返回 Noto CJK 字体后再渲染。环境回归试渲染 Day 1 为 15 页、零溢出。原始成品 PDF 未被替换。

## 下一批入口

按 HANDOFF 的批次闸门，本次先交 Day 3、4。待 Fable 审计后，先修退回项，再进入 Day 5–9；Day 5 应从交接清单继续。Day 10 仍需先提交一页字段设计，获批后再写检查站正文。
