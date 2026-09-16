# CET-6: Thirty Easy Pieces — 六级词汇讲义（设计阶段）

给 iPad Pro 11 英寸横屏用的六级英语单词背诵讲义，30 天，OSTEP 风格。

**当前状态：框架已定稿，十个设计问题已裁决；Day 1 与 Day 2 全稿已完成、已渲染，等待验收审计。**

| 你想看 | 打开 |
|---|---|
| 成品长什么样 | [`samples/CET6-Day1-2-preview.pdf`](samples/CET6-Day1-2-preview.pdf)（Day 1 + Day 2，32 页，带书签）或 `samples/*.png` |
| 整体设计（结构、排序策略、风格指南、版式、流水线、验收） | [`DESIGN.md`](DESIGN.md) |
| 已写好的正文 | [`content/day01.json`](content/day01.json)、[`content/day02.json`](content/day02.json) |
| 1263 个六级词 | [`data/cet6_star_words.txt`](data/cet6_star_words.txt) |
| 30 天分配草案 | [`schedule/day_plan.md`](schedule/day_plan.md) |
| 写手 / 标注 / 审计 提示词 | [`prompts/`](prompts/) |
| 每日内容格式 | [`schema/day.schema.json`](schema/day.schema.json)、[`schema/day01.example.json`](schema/day01.example.json) |

## 复现

```bash
# 1. 词表（需要把大纲 PDF 放到当前目录，PDF 不入库）
pip install pymupdf wordfreq jsonschema jinja2
python3 scripts/extract_wordlist.py

# 2. 特征与分配草案
cd data && python3 ../scripts/features.py && python3 ../scripts/allocate.py && mv day_plan.* ../schedule/ && cd ..

# 3. 校验正文
python3 scripts/validate.py content/day01.json content/day02.json
python3 scripts/ipa.py --check content/day01.json        # 音标对 CMUdict
curl -sSL -o data/ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
python3 scripts/lookup.py --check content/day01.json      # 释义对 ECDICT

# 4. 渲染（Chromium via Playwright；字体先跑 scripts/get_fonts.sh）
scripts/get_fonts.sh
npm i playwright   # 或把全局安装的 playwright 软链到 node_modules/
python3 scripts/render.py content/day01.json content/day02.json
node scripts/render.cjs build/day01.html build/day01.pdf
node scripts/render.cjs build/day02.html build/day02.pdf
python3 scripts/build_book.py build/day01.pdf build/day02.pdf --out dist/preview.pdf
```

## 已完成

- 词表：从大纲 PDF 抽出 1263 个 ★ 六级词（另含 432 个派生形式），★ 数与原书逐一核对。
- 排期：30 天 = 3 个 Part ×（9 个学习日 + 1 个检查站），每天 46–47 词，v0 分配表已生成。
- 正文：Day 1（校史馆）与 Day 2（假朋友 + 拍卖会）各 46 词，共 92 张词卡，全部通过校验。
- 流水线：JSON → 校验 → 自动生成作业 → 分页 → PDF → 合订加书签，全部可复现。

## 数据来源与版权

`data/` 里只有**纯词形**（词目 + 派生形式 + 原书页码），来自《全国大学英语四、六级考试大纲（2016 年修订版）》词表；无释义、无音标。原书 PDF 与字体文件不提交仓库。仅供个人学习使用。
