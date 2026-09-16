# CET-6: Thirty Easy Pieces — 六级词汇讲义（设计阶段）

给 iPad Pro 11 英寸横屏用的六级英语单词背诵讲义，30 天，OSTEP 风格。

**当前状态：框架设计完成，等待用户裁决 `DESIGN.md` 第 10 节的十个问题后再进入内容生产。**

| 你想看 | 打开 |
|---|---|
| 整体设计（结构、排序策略、风格指南、版式、流水线、验收） | [`DESIGN.md`](DESIGN.md) |
| 长什么样 | [`samples/day01-sample.pdf`](samples/day01-sample.pdf)（4 页样张）或 `samples/day01-p*.png` |
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

# 3. 校验一份每日内容
python3 scripts/validate.py --partial schema/day01.example.json

# 4. 渲染样张（Chromium via Playwright；字体先跑 scripts/get_fonts.sh）
scripts/get_fonts.sh
npm i playwright   # 或把全局安装的 playwright 软链到 node_modules/
node scripts/render.cjs templates/day01.html samples/day01-sample.pdf
```

## 数据来源与版权

`data/` 里只有**纯词形**（词目 + 派生形式 + 原书页码），来自《全国大学英语四、六级考试大纲（2016 年修订版）》词表；无释义、无音标。原书 PDF 与字体文件不提交仓库。仅供个人学习使用。
