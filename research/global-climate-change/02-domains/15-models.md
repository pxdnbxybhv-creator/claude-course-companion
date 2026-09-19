# 15. 气候模型、CMIP 与 AI 气象预报革命

> 核查结论：**需大幅修订** ｜ 由 1 个调研 agent + 1 个反驳式核查 agent 产出

## 一、CMIP6"热模型"问题与 ECS 的筛选策略

IPCC AR6 未采用"模式民主"，而是综合古气候、过程理解、历史观测与涌现约束四条证据线，给出平衡态气候敏感度（ECS）**最佳估计 3.0°C、可能范围 2.5–4.0°C**，明显窄于 CMIP6 原始集合约 1.8–5.6°C 的跨度。约四分之一 CMIP6 模式 ECS 超过 4.5°C，主因是新一代云微物理与气溶胶–云相互作用方案放大了低云反馈。学界对此形成三类筛选策略：(1) **ECS 硬筛选**，剔除落在评估区间外的模式；(2) **观测约束加权**，用历史升温趋势、涌现约束或卡尔曼型约束（KCC）重新赋权；(3) **全球升温水平（GWL）取样**，即以 1.5/2/3/4°C 升温为坐标而非以年份为坐标重排样本——这是 AR6 区域信息（Interactive Atlas）的主导做法，也是目前最被推荐的实践，因为它把"何时到达"的不确定性与"到达后是什么样"的问题解耦。2025–2026 年的新工作进一步拆解热偏差来源，区分**快速响应（有效辐射强迫+快调整）**与**累积响应**的贡献，并指出 CMIP5 时代的多数 ECS 涌现约束在 CMIP6 中已部分失效。

## 二、CMIP7 进展与时间表

CMIP7 采取"**持续演进 + 评估快通道（AR7 Fast Track）**"的双层结构，不再整体背书各 MIP，而是策展式挑选面向评估的实验子集。相对 CMIP6 的关键变化包括：历史强迫期由 2014 延长至 **2021**；`abrupt-4xCO2` 建议由 150 年延长至 **300 年**，直接目的就是给出更稳健的 ECS 估计；`piClim-aer`/`piClim-histall`/`piClim-histaer` 等固定海温辐射强迫实验进入**强制 DECK**；同时支持浓度驱动与排放驱动两类模式。ScenarioMIP 提出 **H / M / ML / L / VLHO / VLLO** 六条情景（2021–2100，理想化延伸至 2500），两项重要转变是：最高排放情景比 CMIP6 的 SSP5-8.5 更低，而最低情景**不再全程维持在 1.5°C 以内**——这本身就是对现实排放轨迹的承认。AR7 Fast Track 数据被要求在 **2026 年下半年**交付。

## 三、千米级全球风暴解析模型

km 级（1–5 km）全球模式已从"英雄式短算"迈入**多十年连续积分**。欧洲 Destination Earth 的极端天气数字孪生采用 **4.4 km 全球连续**分量 + 欧洲区域 **500–750 m 按需**分量；ICON 与 IFS 的目标分辨率是 **2.5 km**。2026 年 6 月《Advances in Atmospheric Sciences》对 IFS、ICON、UM、SCREAM、NICAM、CAS-ESM 六个 ~2.8 km（单层逾 5000 万像元）模式的对比揭示了**四个共性盲点**：中尺度对流系统（MCS）发生频次过高且短命、风暴持续时间偏短、降雨面积偏小、对流核内雨强偏大——即"太多、太短、太小、太强"。美国方面，EarthWorks（CSU+NSF NCAR）将 CESM 全分量统一到 **3.75 km** 准均匀网格，目标吞吐 **1 模拟年/墙钟日**；GFDL 的 **X-SHiELD** 为 ~3.25 km、79 层，其 11 年积分已被用作 AI 降尺度模型的训练底座。

## 四、AI 天气预报的业务化与局限

2025–2026 年是 AI 预报"**进入业务**"的分水岭：ECMWF **AIFS Single v1 于 2025-02-25**、**AIFS ENS 于 2025-07-01** 转入业务；NOAA 于 **2026 年 1 月**部署基于 GraphCast 微调（用 GDAS 分析场再训练）的全球 AI 模式。AIFS 在多数高空与地面要素上相对 IFS 误差降低 **5–15%**，降水改善约 **10%（≈0.5–1 个预报日）**，热带气旋路径误差显著下降（部分指标增益达 20%），单次预报能耗约为传统模式的 **1/1000**。生成式集合模型 GenCast 在 **97.2%** 的检验指标上超越 ECMWF 51 成员集合。但局限同样明确：AIFS 存在**热带气旋强度偏弱**偏差；确定性 AI 模式因最小化 RMSE 而系统性"模糊化"极值，热浪 2 m 气温与极端降水表现偏弱；物理守恒（质量、能量、水分）无硬约束；NeuralGCM 这类混合模式仍是大气单独模式，缺陷陆–气反馈使其在伪全球增暖实验中**低估增暖幅度**，向训练分布之外外推的稳定性尚未被证明。

## 五、S2S 与降尺度

AI 正沿两条路径扩展：一是把数据驱动推向次季节（ECMWF 的 AIFS-SUBS 原型、AI Weather Quest 竞赛已有 42 支队伍参与，第四赛期自 2026-05-14 开始），初步证据显示 MLWP 在 MJO 遥相关与北太平洋/北美型态上已与物理模式可比；二是**廉价长积分**，如 CAMulator 以约 **1/350** 的成本复现 CAM，以及用 3 km X-SHiELD 训练的 AI 降尺度器，使"km 级物理 + AI 放大"成为气候服务的现实路线。

## 关键发现

**IPCC AR6 的 ECS 可能范围 2.5–4.0°C（最佳估计 3.0°C）是多证据线综合结果，而非 CMIP6 多模式平均；AR6 刻意放弃'模式民主'，改用评估升温/全球升温水平（GWL）约束投影**  
置信度：`高`  
CMIP6 原始集合 ECS 跨度约 1.8–5.6°C，约四分之一模式 ECS>4.5°C；AR6 WG1 第7章与 Cross-Chapter Box 7.1 以古气候、过程理解、历史观测、涌现约束四线证据收窄区间，第4章与 Interactive Atlas 以 GWL 取样呈现区域信息
来源：<IPCC AR6 WG1 (2021) Ch.7 / Ch.4 / Interactive Atlas（训练知识，本轮检索未直接核验原文页码）> · <https://www.science.org/doi/10.1126/sciadv.aaz9549>

**'热模型'筛选并无单一公认方案；实践上 GWL 重采样已成主流，ECS 硬筛选与观测约束加权仍并行且各有争议**  
置信度：`中`  
三类做法：ECS 硬筛选（剔除评估区间外模式）、观测约束加权（历史升温趋势/涌现约束/KCC）、GWL 取样。研究显示 CMIP5 时代多数 ECS 涌现约束在 CMIP6 中失效或给出偏高 ECS，且绝大多数 ECS 涌现约束都指向云过程——而云正是 ECS 离散度的主因
来源：<https://esd.copernicus.org/articles/11/1233/2020/> · <https://egusphere.copernicus.org/preprints/2025/egusphere-2025-4899/egusphere-2025-4899.pdf> · <https://www.nature.com/articles/s41612-026-01390-z>

**CMIP7 在实验设计层面对 ECS 问题做出结构性回应：abrupt-4xCO2 建议由 150 年延长至 300 年，并把固定海温辐射强迫实验 piClim-aer/histall/histaer 纳入强制 DECK**  
置信度：`高`  
GMD 18, 6671 (2025) 明确写明延长 abrupt-4xCO2 '以提供更稳健的平衡态气候敏感度估计'；新增 piClim-* 实验使有效辐射强迫（ERF）与快调整可被直接诊断，从而把'热'归因到强迫端还是反馈端
来源：<https://gmd.copernicus.org/articles/18/6671/2025/> · <https://wcrp-cmip.org/cmip-phases/cmip7/>

**CMIP7 改为'持续演进 + AR7 评估快通道'双层架构，历史强迫期延至 2021，ScenarioMIP 六情景上限降低、下限不再守住 1.5°C**  
置信度：`高`  
不再整体背书 MIP，而是策展面向评估的实验集合；historical 由 CMIP6 的 2014 延至 2021（因短寿命强迫物排放的近期估计不确定性上升）；情景 H/M/ML/L/VLHO/VLLO 覆盖 2021–2100，理想化延伸至 2500；最高情景低于 SSP5-8.5，最低情景不再全程低于 1.5°C
来源：<https://gmd.copernicus.org/articles/18/6671/2025/> · <https://www.wcrp-climate.org/news/science-highlights/2413-cmip7-scenarios-explainer-2026> · <https://www.carbonbrief.org/guest-post-how-cmip7-will-shape-the-next-wave-of-climate-science>

**千米级全球风暴解析模式已实现多十年连续积分，但六个主流模式共享四个系统性对流偏差，说明'分辨率不等于正确'**  
置信度：`高`  
2026-06-16《Advances in Atmospheric Sciences》(DOI 10.1007/s00376-026-5756-7) 比较 IFS、ICON、UM、SCREAM、NICAM、CAS-ESM（~2.8 km，单层逾 5000 万像元），以 2020 年东亚创纪录梅雨为检验个例，发现共性偏差：MCS 频次过高且短命、持续时间偏短、雨区面积偏小、对流核雨强偏大
来源：<https://www.eurekalert.org/news-releases/1131595> · <https://phys.org/news/2026-06-megapixel-earth-capture-storms-unprecedented.html>

**AI 天气预报已完成业务化转折：ECMWF AIFS 于 2025 年进入业务，NOAA 于 2026 年 1 月部署 AI 全球模式**  
置信度：`高`  
AIFS Single v1 于 2025-02-25 业务化、AIFS ENS 于 2025-07-01 业务化，与 IFS 并行运行；NOAA 以 GraphCast 为底座、用自有 GDAS 分析场微调后于 2026 年 1 月投入业务，长预报时效热带气旋路径误差显著下降；Google 的 AI 台风预报已被美国国家飓风中心业务使用
来源：<https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational> · <https://www.ecmwf.int/en/newsletter/185/earth-system-science/aifs-ens-becomes-operational> · <https://www.noaa.gov/news-release/noaa-deploys-new-generation-of-ai-driven-global-weather-models> · <https://cacm.acm.org/news/ai-weather-forecasting-goes-operational/>

**生成式/扩散型集合 AI 模式（GenCast、FGN）在概率技巧上已超越 ECMWF 业务集合，成本低数个量级；但确定性 AI 模式因 RMSE 优化而系统性平滑极值**  
置信度：`高`  
GenCast 在 97.2% 的检验目标上优于 ECMWF 51 成员 ENS；AIFS 单次预报能耗约为传统模式 1/1000。另一面：AIFS 存在热带气旋强度偏弱偏差，AIWP 模式在热浪期 2 m 气温误差研究显示对极端高温的再现不足，端到端 AI 模式因训练样本中极端个例稀少而在极端工况下表现不佳
来源：<https://cacm.acm.org/news/ai-weather-forecasting-goes-operational/> · <https://www.ecmwf.int/en/newsletter/187/news/forecast-performance-2025> · <https://arxiv.org/pdf/2504.21195> · <https://www.sciencedirect.com/science/article/pii/S266659212400091X>

**AI 模式向气候尺度外推的可靠性仍是未决问题：多数 AI 天气模式并非为气候外推设计且表现出不稳定；混合模式 NeuralGCM 因缺陷陆–气耦合而低估增暖幅度**  
置信度：`争议中`  
NeuralGCM 为大气单独模式，无陆面反馈，在伪全球增暖（PGW）框架下相对物理模式基准低估投影增暖幅度；仅以 ERA5 训练使其继承极端降水再现不足的缺陷；已有工作在 2021 年太平洋西北热浪个例上专门检验其未来热浪模拟能力，并将 ACE2 与 NeuralGCM 的区域热力学趋势作为基准测试对象
来源：<https://arxiv.org/pdf/2410.09120> · <https://arxiv.org/pdf/2511.00274> · <https://www.science.org/doi/10.1126/sciadv.adv6891>

**AI 正沿两条路径进入 S2S 与降尺度：数据驱动模式向次季节延伸，以及用 km 级物理模拟训练的廉价 AI 放大器/仿真器**  
置信度：`中`  
ECMWF 推出 AIFS-SUBS 原型并运行 AI Weather Quest 竞赛（已有 42 支队伍提交，第四赛期自 2026-05-14 开始）；研究显示 MLWP 在 MJO 及其遥相关、北太平洋/北美型态与水汽输送上已可与先进物理模式相当；CAMulator 以约 1/350 成本复现 CAM；HiRO-ACE 用 3 km 全球风暴解析模式 X-SHiELD 训练 AI 仿真与降尺度
来源：<https://www.ecmwf.int/en/about/media-centre/science-blog/2026/ai-weather-quest-2026> · <https://arxiv.org/pdf/2607.05100> · <https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JD044910> · <https://arxiv.org/pdf/2504.06007>

## 关键数值

| 指标 | 数值 | 时段 | 来源 |
|---|---|---|---|
| IPCC AR6 评估的平衡态气候敏感度 ECS（最佳估计 / 可能范围 / 极可能范围） | 3.0°C / 2.5–4.0°C / 2–5°C | AR6 WG1，2021 年发布 | IPCC AR6 WG1 Ch.7（训练知识，本轮检索未直接核验） |
| CMIP6 多模式集合 ECS 跨度；ECS>4.5°C 的模式占比 | 约 1.8–5.6°C；约 1/4 模式 | CMIP6 集合（2019–2021） | CMIP6 ECS 文献综述 / IPCC AR6 WG1（训练知识，本轮检索未直接核验具体数字） |
| CMIP7 DECK 中 abrupt-4xCO2 建议积分长度（CMIP6 为 150 年） | 300 年 | CMIP7 协议，2025 年发布 | https://gmd.copernicus.org/articles/18/6671/2025/ |
| CMIP7 历史强迫期终点（CMIP6 为 2014） | 2021 年 | CMIP7 协议 | https://gmd.copernicus.org/articles/18/6671/2025/ |
| CMIP7 ScenarioMIP 情景数与时段 | 6 条（H / M / ML / L / VLHO / VLLO），2021–2100，理想化延伸至 2500 | CMIP7 | https://gmd.copernicus.org/articles/18/6671/2025/ |
| AR7 Fast Track 数据交付时点；预期参与模式中心数与数据量 | 2026 年下半年；>30 个中心，>500 万 GB | 2026 | https://www.carbonbrief.org/guest-post-how-cmip7-will-shape-the-next-wave-of-climate-science（二手来源，数据量为预期值） |
| ECMWF AIFS 业务化日期（确定性 / 集合） | 2025-02-25 / 2025-07-01 | 2025 | https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational |
| AIFS 相对 IFS 的中期预报误差降低幅度；降水改善 | 多数高空与地面要素 5–15%；降水约 10%（≈0.5–1 个预报日） | 2025 年检验 | https://www.ecmwf.int/en/newsletter/187/news/forecast-performance-2025 |
| AIFS 单次预报能耗相对传统模式；热带气旋路径技巧增益 | 约 1/1000（降低约 1000 倍）；最高约 20% | 2025 | https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational |
| GenCast 相对 ECMWF 51 成员集合（ENS）占优的检验目标比例 | 97.2% | Nature 2024 发表，2025–2026 年被广泛引用 | https://cacm.acm.org/news/ai-weather-forecasting-goes-operational/ |
| 新一代千米级全球风暴解析模式的水平分辨率与单层像元数 | 约 2.8 km；>5000 万像元/层（传统模式约 1 万像元） | 2026 年多模式比较 | https://www.eurekalert.org/news-releases/1131595 ; https://phys.org/news/2026-06-megapixel-earth-capture-storms-unprecedented.html |
| Destination Earth 极端天气数字孪生分辨率（全球连续 / 欧洲按需区域） | 4.4 km / 500–750 m（Météo-France 牵头，22 个欧洲伙伴） | 2025–2026 | https://www.km-scale-summit-26.org/ ; DestinE 相关报道（本轮检索摘要） |
| EarthWorks 目标网格与吞吐；GFDL X-SHiELD 网格与垂直层数 | 3.75 km 全分量准均匀网格，目标 1 模拟年/墙钟日；X-SHiELD ~3.25 km，79 层 | EarthWorks 目标年份 2025；X-SHiELD 11 年积分 | https://news.ucar.edu/132760/csu-ncar-develop-high-res-global-model-community-use ; https://arxiv.org/pdf/2512.18224 |
| ECMWF AI Weather Quest 参赛队伍数与第四赛期起始日 | 42 支队伍；2026-05-14 | 2025-09 至 2026 | https://www.ecmwf.int/en/about/media-centre/science-blog/2026/ai-weather-quest-2026 |
| CAMulator 相对 CAM 的计算成本 | 约 1/350（降低约 350 倍） | 2025 | https://arxiv.org/pdf/2504.06007 |
| IFS Cycle 49r1 业务化日期与集合技巧改进 | 2024-11-12；北半球中高纬大误差在集合预报中减少约 10%，为 2011 年以来单次升级带来的最大高空集合技巧提升 | 2024–2025 | https://www.ecmwf.int/en/newsletter/187/news/forecast-performance-2025 |

## 2025–2026 新进展

- 2025-02-25：ECMWF AIFS Single v1 转入业务运行，与 IFS 并行；这是主要业务中心首次把纯数据驱动的全球模式列为正式业务产品。
- 2025-07-01：AIFS ENS（集合版）业务化，把 AI 方法从确定性推进到概率预报；AIFS Single 1.1.0 的更新已于 2026 年在 GMD 19, 4703 发表。
- 2026 年 1 月：NOAA 部署新一代 AI 驱动全球天气模式，以 DeepMind GraphCast 为底座、用自有 GDAS 分析场微调，使其在 GFS 初值下表现改善，长时效热带气旋路径误差明显下降；Google 的 AI 台风预报已被美国国家飓风中心业务使用。
- 2025 年 9 月：CMIP7 协议论文《An evolving CMIP7 and Fast Track in support of future climate assessment》正式发表于 GMD（18, 6671, 2025），确立'持续演进 + AR7 评估快通道'双层架构；2026 年 WCRP 上线 CMIP7 情景解读专页，明确最高情景低于 CMIP6 上限、最低情景不再全程守住 1.5°C。
- 2026-06-16：《Advances in Atmospheric Sciences》发表六模式（IFS/ICON/UM/SCREAM/NICAM/CAS-ESM）~2.8 km 全球风暴解析比较，指出'MCS 太多太短、雨区太小、核内雨强太大'四项共性盲点；2026 年 KM-scale 全球建模峰会在德国汉堡召开。
- 2026 年：ICON 的全球 2.5 km 模拟研究（EGUsphere 预印本《From Single Storms to Global Waves》）与'把风暴解析大气 AI 模拟扩展到整个行星'（arXiv 2606.31248）同期出现，标志 km 级物理与 AI 两条技术路线开始合流。
- 2026 年：ECMWF 发布 AIFS-SUBS，把数据驱动预报扩展到次季节时效；AI Weather Quest 第四赛期自 2026-05-14 开始，累计 42 支队伍提交过预报。JGR-Atmospheres 2026 年研究系统评估了 MLWP 模式的次季节技巧与 MJO 遥相关表现。
- 2026 年：npj Climate and Atmospheric Science 发表 CMIP6 增暖偏差归因研究（s41612-026-01390-z），把'热模型'拆解为快速响应与累积响应两部分；2025 年 EGUsphere 预印本继续检验 ECS 涌现约束与近期增暖的一致性。
- 2026 年：AI 气候仿真器评估走向体系化——ACE2 与 NeuralGCM 的区域热力学趋势基准（arXiv 2511.00274）、基于 3 km X-SHiELD 训练的 HiRO-ACE 仿真/降尺度模型（arXiv 2512.18224）、以及用神经天气仿真器做稀有事件采样估计台风生成率（arXiv 2606.30920）相继出现。
- 2026 年：AMS《Artificial Intelligence for the Earth Systems》（Vol.5 Iss.2）发表用神经天气模式做全球热带气旋强度预报的研究，直面 AI 模式强度偏弱这一已知短板。

## 本领域的不确定性

- ECMWF 2025 年度预报性能通报未给出 500 hPa 位势高度距平相关（ACC）的具体可用时效天数，因此 AIFS 相对 IFS 的'领先多少天'这一常用指标在本轮检索中未获权威量化，仅有 5–15% 误差降低与降水 0.5–1 天的等效表述。
- CMIP7 的官方数据交付截止日期未写入 GMD 18, 6671 (2025) 协议论文正文（该文明确称协议为'活文档'、细节可能变动）；'AR7 Fast Track 须于 2026 年下半年交付'与'>30 个中心、>500 万 GB'均来自二手渠道（Carbon Brief/WCRP 通讯），宜按'计划值'而非'已实现值'引用。
- EarthWorks 是否已实际达成'1 模拟年/墙钟日 @ 3.75 km'的吞吐目标，本轮检索未获 2025–2026 年的确认性公开结果；该数值应视为项目目标而非已验证性能。
- 2026 年《Advances in Atmospheric Sciences》千米级模式比较研究的四类偏差仅在新闻稿中给出定性描述，偏差幅度（百分比、mm/h、小时数等）未获量化；原文指标需查阅 DOI 10.1007/s00376-026-5756-7 正文。
- AI 模式的'物理一致性'缺失缺乏统一度量标准：质量/能量/水分守恒违背量级、以及这种违背对多周至季节积分漂移的实际影响，目前尚无社区公认的基准测试套件，不同论文结论难以直接比较。
- IPCC AR7 的具体时间表、以及 AR7 是否会沿用 AR6 的 ECS 评估区间（2.5–4.0°C）或据 CMIP7 新证据调整，本轮检索未获确认；截至检索未获 2026 年关于 AR7 ECS 评估方法的权威更新。
- 中国气象局/中科院在 AI 预报（如风乌 FengWu、伏羲 FuXi）与 CAS-ESM 千米级模式上的最新业务化状态，本轮检索仅获间接信息（区域检验排名、模式参与比较），缺乏 2026 年一手权威发布。

## 未决争论

- ECS 高端尾部该不该被剪掉：ECS 硬筛选/观测加权能收窄投影区间，但历史升温约束对气溶胶强迫不确定性与年代际内部变率高度敏感，可能系统性低估结构上合理的高敏感度情形——风险评估（尾部风险）与中心估计的用途冲突尚未调和。
- 千米级分辨率能否真正降低云反馈与 ECS 的不确定性：显式解析深对流消除了对流参数化这一大误差源，但 2026 年多模式比较显示 km 级模式仍共享系统性 MCS 偏差，且低云/边界层云仍需参数化——'提高分辨率自动收敛'的假设正受到质疑。
- AI 模式能否外推到训练分布之外的气候态：这是当前最核心的争论。支持方指出混合模式（NeuralGCM）与仿真器（ACE2）已能稳定做长积分；质疑方指出多数 AI 天气模式并非为气候外推设计且表现不稳定，且 ERA5 训练集不含未来气候态，对'前所未有'极端事件的可信度缺乏理论保证。
- 确定性 AI 模式的'模糊化'是缺陷还是特性：RMSE 优化天然产生平滑场，在路径与大尺度型态上带来真实增益，却系统性削弱极值强度（如 AIFS 台风强度偏弱、热浪峰值偏低）。生成式扩散方法（GenCast/FGN）是否已充分解决这一问题，社区尚无定论。
- AI 仿真器能否替代 GCM 用于气候投影，还是只能担任降尺度/放大器角色：多数气候学家目前倾向后者（km 级物理 + AI 放大），但廉价长积分（CAMulator 约 1/350 成本）带来的大集合能力正在挑战这一分工。
- 端到端 AI 数据同化（跳过传统 4D-Var 直接从观测生成分析场）的可行性与可信度：这决定 AI 预报系统能否摆脱对物理模式生成的再分析/分析场的依赖，目前仍处研究阶段。
- CMIP7 最低情景不再全程维持 1.5°C 以内，意味着'1.5°C 路径'的模式基础正在从投影转向过冲（overshoot）与回落（VLHO/VLLO）——这对超调期间的不可逆风险（冰盖、AMOC、碳汇）评估提出了 CMIP6 未充分覆盖的新要求。

---

## 反驳式核查结论

核查员以「默认怀疑」姿态逐条尝试推翻上述论断。判定：**需大幅修订**

### ✅ 确认
**原论断**：CMIP7 DECK 中 abrupt-4xCO2 由 150 年延长至 300 年，理由是提供更稳健的 ECS 估计

**核查意见**：原文逐字核对一致：'The abrupt-4xCO2 experimental protocol is further modified to recommend extending the simulation out to 300 years to provide a more robust estimate of the equilibrium climate sensitivity than possible using only the first 150 years.' 注意是 recommend（建议）而非强制，草稿用'建议'是对的，不应在正文中升格为'要求'。

核查来源：<https://gmd.copernicus.org/articles/18/6671/2025/>

### ✅ 确认
**原论断**：CMIP7 历史强迫期终点由 2014 延至 2021，原因是短寿命气候强迫物排放的近期估计不确定性上升

**核查意见**：原文：'The end of the historical period for CMIP7 is 2021, driven by increased uncertainty in more recent estimates of the emission of short-lived climate forcers.' 数字与归因均与一手来源一致。

核查来源：<https://gmd.copernicus.org/articles/18/6671/2025/>

### ⚪ 无法核实
**原论断**：CMIP7 把固定海温辐射强迫实验 piClim-aer / piClim-histall / piClim-histaer 纳入强制 DECK

**核查意见**：方向性正确但细节未获证实。原文确证的是：DECK 扩充了用于刻画模式自身有效辐射强迫（ERF）的实验，优先级由 CMIP6 的 'strongly encouraged' 升为 CMIP7 的 'mandatory'。但本轮取回的正文片段未出现 piClim-aer / piClim-histall / piClim-histaer 这三个具体实验名。建议正文改为'ERF 诊断类固定海温实验由强烈建议升为强制'，具体实验名需回查 GMD 原文表格后再写死。

核查来源：<https://gmd.copernicus.org/articles/18/6671/2025/>

### ✅ 确认
**原论断**：CMIP7 ScenarioMIP 为 6 条情景（H/M/ML/L/VLHO/VLLO），覆盖至 2100，理想化延伸至 2500

**核查意见**：六条情景名称与 2500 年延伸均与一手来源一致（high、medium、medium-low、low、very-low-with-limited-overshoot、very-low-after-high-overshoot）。但草稿另外两句——'上限低于 SSP5-8.5'、'最低情景不再全程守住 1.5°C'——本轮未在原文中直接取证，属推断性表述，应降置信度或标注为二手转述。

核查来源：<https://gmd.copernicus.org/articles/18/6671/2025/>

### ✅ 确认
**原论断**：ECMWF AIFS 于 2025-02-25 业务化；单次预报能耗约为传统模式的 1/1000；热带气旋路径技巧增益最高约 20%

**核查意见**：三项均逐字对上：业务化日期 2025 年 2 月 25 日（业务化的是确定性 AIFS Single）；'a reduction of approximately 1,000 times in energy use for making a forecast'；'tropical cyclone tracks, with gains of up to 20%'。需补的限定：1000 倍只覆盖推理（forecast-making）环节，不含训练成本，也不含 AI 模式仍完全依赖的传统资料同化/分析链——草稿把它写成整体成本优势会误导。

核查来源：<https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational>

### ⚪ 无法核实
**原论断**：AIFS ENS 于 2025-07-01 业务化；AIFS 相对 IFS 中期误差降低 5–15%、降水约 10%

**核查意见**：所引的 2025 年 2 月 ECMWF 新闻页明确写的是集合版'计划于未来实施'（ensemble capabilities planned for future implementation），该页不含 2025-07-01 这一日期，也不含 5–15% / 10% 的任何量化对比。这些数字出自草稿另引的 Newsletter 185/187，本轮未能取证。按怀疑默认判为无法核实；另需注意此类百分比高度依赖要素、预报时效与检验期，笼统给出单一区间本身属过度概括。

核查来源：<https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational>

### ⚪ 无法核实
**原论断**：NOAA 于 2026 年 1 月部署 AI 全球模式（以 GraphCast 为底座、用自有 GDAS 分析场微调）业务运行，标志 AI 预报'已完成业务化转折'

**核查意见**：所引 noaa.gov 新闻稿链接返回 HTTP 403，无法验证其存在与内容；CACM 为二手科普来源，不足以支撑'业务化'这一强论断。这是全稿最吃重、却最缺一手证据的一条，必须降置信度（高→低）或删除。此外措辞需修正：即便部署属实，目前各业务中心的 AI 模式均为与物理模式并行/辅助运行，无一替换其物理 NWP 主链，'完成业务化转折'是对现状的夸大表述。'Google AI 台风预报被 NHC 业务使用'一句同样需明确其性质为 2025 年起的实验性合作评估，而非纳入官方定业务产品。

核查来源：<https://www.noaa.gov/news-release/noaa-deploys-new-generation-of-ai-driven-global-weather-models（取回失败 403）>

### 🟠 夸大
**原论断**：GenCast 在 97.2% 的检验目标上优于 ECMWF 51 成员集合，故生成式 AI 集合'已超越业务集合'

**核查意见**：97.2% 这个数字本身可追溯至 Price et al. (Nature, 2024)，对应 1320 个检验目标；但把它推广成'生成式 AI 已超越业务集合'有三处越界：(1) 该结果来自 2019 年单一检验年、以 ERA5 再分析为真值的离线对比，不是业务并行实盘对比；(2) GenCast 运行在 0.25°/12 小时步长，与 ENS 的业务配置并非同一检验条件；(3) 结论来自单篇论文（外加 FGN 一篇），尚不构成学界共识。应改写为'在特定离线检验设置下，GenCast 在 97.2% 的目标上概率技巧优于 ENS'。

核查来源：<https://cacm.acm.org/news/ai-weather-forecasting-goes-operational/>

### 🟠 夸大
**原论断**：千米级全球风暴解析模式'已实现多十年连续积分'，六个主流模式共享四个系统性对流偏差

**核查意见**：'多十年连续积分'与草稿自己给出的证据不符：其证据是 2020 年东亚梅雨的单一个例检验，且同稿数字栏列出的 X-SHiELD 为约 11 年积分、EarthWorks 目标吞吐为 1 模拟年/墙钟日。当前全球千米级积分的量级是数年至约十年（DYAMOND 类比较更是 40 天量级），'多十年'缺乏支撑，应改为'已实现年至十年量级的连续积分'。另外六模式比较所引来源均为 EurekAlert/phys.org 新闻稿，未见期刊原文，四项共性偏差的具体表述无法核实；单一比较研究的结论也不宜直接写成'说明分辨率不等于正确'这一普遍命题。

核查来源：<https://www.eurekalert.org/news-releases/1131595> · <https://phys.org/news/2026-06-megapixel-earth-capture-storms-unprecedented.html>

### ⚪ 无法核实
**原论断**：NeuralGCM'因缺陷陆–气耦合而低估增暖幅度'

**核查意见**：典型的相关写成因果 + 单篇预印本当结论：所引为 arXiv 预印本（未见期刊版），其能支持的是'在 PGW 框架下相对物理模式基准呈现偏低的增暖投影'这一观测到的差异，而把成因单一归于'缺陷陆–气耦合'是超出证据的因果断言。NeuralGCM 1.0 为规定海温的大气单独模式，缺少耦合反馈属设计事实，但它是否为低估的主因需另证。草稿把该条标为'争议中'方向正确，但证据句应改为相关性表述。

核查来源：<https://arxiv.org/pdf/2410.09120> · <https://arxiv.org/pdf/2511.00274>

### 🟠 夸大
**原论断**：CMIP6 多模式集合 ECS 跨度约 1.8–5.6°C，约四分之一模式 ECS>4.5°C

**核查意见**：跨度 1.8–5.6 K 可追溯（Zelinka et al. 2020 / Meehl et al. 2020），但它对应的是 27 个模式的特定子集；同一子集中 ECS>4.5 K 的是 10/27 ≈ 37%，不是'约四分之一'。'约 1/4'只有在纳入 CMIP6 更完整的 50 余个模式档案时才大致成立。草稿未声明所用子集，却给出单一精确比例，属精度上的过度自信。应改为'依所取模式子集不同，ECS 超过 4.5 K 的模式占约 1/4 至 1/3'。

核查来源：<https://www.science.org/doi/10.1126/sciadv.aaz9549>

### ⚪ 无法核实
**原论断**：AR7 Fast Track 数据于 2026 年下半年交付，预期 >30 个中心、>500 万 GB

**核查意见**：来源为 Carbon Brief 客座文章（二手），且数据量明确是'预期值'。更关键的是时间问题：今天已是 2026-09-19，即处于该预测窗口之内，草稿却仍以未来时态转述预测，而未核对实际交付状态。CMIP 各阶段数据交付历来普遍滞后于计划，此条应改为'原计划 2026 年下半年起陆续交付（截至核查时点实际进度未经证实）'，并明确标注数据量为预期而非既成事实。

核查来源：<https://www.carbonbrief.org/guest-post-how-cmip7-will-shape-the-next-wave-of-climate-science>

### ⚪ 无法核实
**原论断**：Destination Earth 极端天气数字孪生：全球 4.4 km / 欧洲按需 500–750 m，由 Météo-France 牵头、22 个欧洲伙伴

**核查意见**：所引来源为一个会议网站加'本轮检索摘要'，无一手项目文件。牵头方尤其可疑：DestinE 的 Weather-Induced Extremes DT 在第一阶段由 ECMWF 牵头实施，'Météo-France 牵头'若指第二阶段某一子合同，需给出 ESA/EUMETSAT/ECMWF 或欧盟委员会的官方文件佐证，否则应删除牵头方与伙伴数这两项具体表述，仅保留分辨率量级并标注来源强度。

核查来源：<https://www.km-scale-summit-26.org/>

### ✅ 确认
**原论断**：IPCC AR6 ECS 最佳估计 3.0°C、可能范围 2.5–4.0°C、极可能范围 2–5°C，且为多证据线综合而非 CMIP6 多模式平均

**核查意见**：与 AR6 WG1 SPM/第7章一致（基于训练知识，本轮因检索额度耗尽未直接取回原文页面）。'刻意放弃模式民主、改用全球升温水平（GWL）约束投影'的定性描述也与 AR6 做法相符。唯一需修正的是引用规范：草稿自己已注明'训练知识、未核验页码'，那么该条的 confidence 就不应标为'高'——证据强度与自述的核验状态不自洽。

核查来源：<IPCC AR6 WG1 (2021) SPM A.4.4 / Ch.7（训练知识，本轮未取回原文）>

### ⚪ 无法核实
**原论断**：ECMWF AI Weather Quest 已有 42 支队伍提交、第四赛期自 2026-05-14 开始；CAMulator 成本约为 CAM 的 1/350

**核查意见**：这两项细节均来自单一链接且本轮检索额度耗尽、未能取证。此类'参赛队伍数''加速倍数'属易变且易被新闻稿四舍五入的数字，若无法回查一手页面，建议在正文中改为量级表述（'数十支队伍''两个量级以上的成本下降'），避免给出经不起复核的精确值。CAMulator 的 350 倍同样只覆盖推理成本，不含训练。

核查来源：<https://www.ecmwf.int/en/about/media-centre/science-blog/2026/ai-weather-quest-2026> · <https://arxiv.org/pdf/2504.06007>

### 核查员指出的遗漏角度

- 核查方法本身的披露缺失：本轮 WebSearch 额度在会话层面已被耗尽（200/200），仅完成 2 次成功一手取回（GMD CMIP7、ECMWF AIFS）与 1 次失败取回（NOAA，403）。草稿中多处自述'本轮检索未核验'却仍标注'高'置信度，置信度与证据强度不自洽，这是全稿最系统性的缺陷。
- 来源层级未分级：草稿把 GMD/ECMWF 一手协议与新闻稿（EurekAlert、phys.org）、二手科普（Carbon Brief、CACM）、未经同行评审的 arXiv 预印本混列于同一 sources 数组，读者无法区分证据强度。建议为每条标注来源等级（一手协议/同行评审/预印本/机构新闻稿/二手媒体）。
- AI 预报的资料同化盲区：全稿把 AI 模式的成本与技巧优势归于模式本身，却几乎未触及 AI 模式仍依赖 ERA5/IFS/GDAS 等传统同化产生的初始场——即 AI 只替换了预报环节而非整个预报链。端到端 AI 同化（如 GraphDOP、Aardvark 类工作）及其成熟度是关键缺口。
- 观测系统与资金面风险：2025–2026 年围绕 NOAA 预算与卫星/观测网的削减讨论，会直接影响 AI 与物理模式共同依赖的观测基础；一份声称 AI 已'完成业务化转折'的稿件不谈观测底座的脆弱性，是重大结构性遗漏。
- 检验方法学争议未呈现：AI 模式以 RMSE 优化导致的极值平滑问题，草稿虽提及，但未涉及'以再分析为真值检验 AI 模式'这一循环性问题、公平比较的分辨率/频次对齐问题，以及 WMO/ECMWF 正在推进的 AI 模式业务检验标准化工作。
- 气候与天气的方法论边界被模糊：把 CMIP 气候投影与 AI 天气预报并列叙述，却未说明二者在可检验性上的根本差异——天气预报每天可被证伪，气候投影不能；AI 在前者的成功不能外推为对后者的背书。
- 一手证据缺位的关键清单未列出：NOAA 2026 业务化、AAS 千米级六模式比较、DestinE 牵头方与分辨率、AR7 Fast Track 实际交付状态，这四项应在发布前补做一手核验，否则应整条移除或明确降级为'待证'。
- 缺少反面/失败案例：稿件未收录 AI 模式在业务中出错或被撤回的个例、物理模式在特定场景仍明显占优的证据，以及对 AI 预报'高技巧但低可解释性'在预警决策链中的责任问题，叙事整体偏单向乐观。
