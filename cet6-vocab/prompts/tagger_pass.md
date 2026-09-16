# 阶段 2 · 标注 pass（tagger）

**目的**：为 1263 个六级词各产出一条结构化标签，供 `scripts/allocate.py --tags` 做 v1 重排（真词根家族、透明同源词、易混词隔离、主题聚类）。这一步不写正文。

**输入**：`data/cet6_star_words.json` 的一个切片（建议每次 60–80 个词），以及本文件。

**输出**：JSON 数组，每词一条，字段如下，不得增删字段：

```json
{
  "id": 1217,
  "head": "verdict",
  "pos": ["n."],
  "senses_zh": ["（陪审团的）裁决", "定论"],
  "morph": {"prefix": null, "root": "ver+dict", "suffix": null, "is_true_etymology": true,
            "root_family": "dict(说)"},
  "transparency": 1,
  "themes": ["law", "media"],
  "confusables": ["verdant"],
  "difficulty": 2
}
```

字段规则：

- `pos`：只列六级考的词性；同形异义词（词头带上标）只标该义项。
- `senses_zh`：1–3 条，考试义项第一。
- `morph.root_family`：词根标签用「拉丁/希腊词根(中文义)」格式，例如 `spect(看)`、`dict(说)`、`trans-`（纯前缀家族写前缀）。无零件写 `null`。`is_true_etymology` 只在 root 非空时填写；不确定填 `false`。
- `transparency`：0 = 对四级学习者不透明；1 = 能从四级词 + 常见词缀猜出（`abnormal`、`accessory`）；2 = 几乎免费（`coexist`、`autobiography`）。
- `themes`：从下表选 1–3 个，不得自创：

  `law` 法庭与犯罪 · `medicine` 医院与身体 · `science` 实验室与科研 · `tech` 计算机与工程 · `media` 新闻与传播 · `finance` 钱与商业 · `politics` 政府与政治 · `military` 军事与冲突 · `campus` 校园与学习 · `home` 家庭与日常 · `food` 厨房与饮食 · `nature` 自然与环境 · `animals` 动物 · `weather` 天气与灾害 · `travel` 交通与旅行 · `city` 城市与建筑 · `arts` 艺术与文学 · `music` 音乐与表演 · `sports` 运动 · `religion` 宗教与仪式 · `history` 历史与古代 · `emotion` 情绪与性格 · `mind` 认知与思维 · `speech` 说话与争论 · `motion` 动作与移动 · `shape` 形状与物体 · `quantity` 数量与程度 · `time` 时间与顺序 · `work` 职场与制度 · `clothes` 衣物与外表

- `confusables`：拼写或读音相近、或近义到容易混淆的词（不限于六级词），0–4 个。
- `difficulty`：1 易 / 2 中 / 3 难，以「六级考生第一次见到时」为准。

**禁止**：写例句、写笑话、写记忆法。那是写手的事。

**校验**：输出会与词表比对 `id`/`head`；`themes` 不在表中的条目整批退回。
