# 16. 全球观测系统、再分析与数据可信度

> 核查结论：**需大幅修订** ｜ 由 1 个调研 agent + 1 个反驳式核查 agent 产出

## 一、三支柱：卫星、海洋自主平台与地基网络的"速度差"

全球气候观测体系当前呈现明显的"速度差"。**卫星与再分析**正在经历一轮代际升级：ECMWF 于 2026 年 3 月 6 日正式启动 ERA6 生产，水平分辨率由 ERA5 的约 31 km 提升到约 14 km，回溯超过 75 年（约 1950 年代至今），同化观测量较 ERA5 增加 50% 至部分变量翻倍以上；首批数十年数据预计 2027 年底发布，前四十年数据 2028 年初可供下载。值得注意的是 ERA6 并**不直接同化海洋观测**，而是由新一代 ORAS6 海洋再分析提供海洋与海冰初始场，属"单向耦合"——这对海气界面通量与海表温度（SST）的一致性既是改进也是新的不确定性来源。

**海洋自主观测**处于"扩张但未达标"状态。Argo 主阵列近年在约 3800–4000 个活跃浮标间波动，而 OneArgo 规划目标是 2030 年前后达到约 4700 个（约 2500 核心 + 1200 深海 + 1000 生物地球化学）。GO-BGC 计划在 2021–2026 年间布放 500 个 BGC 浮标。缺口集中在**深海（>2000 m）、季节性海冰区、边缘海与西边界流区**——恰好是热含量与碳吸收变率最大的区域。

**地基与探空网络是最薄弱环节**。WMO 指出，在 77 个最不发达国家与小岛屿发展中国家中，GBON（全球基本观测网）所要求的观测约 90% 仍然缺失；非洲进入全球模式的探空报告数在 2015 年至 2020 年初下降了约 50%，此后继续下滑。ECMWF 的观测系统试验给出了迄今最强证据：补齐这些缺口可使非洲预报不确定性下降 30% 以上、太平洋岛国下降最多 20%，且效果在约 12 小时后外溢至全球。

## 二、数据可信度的两个争论焦点

**SST 历史订正**仍是活跃争议。现代船舶测量较浮标系统性偏暖约 0.12 °C，而船/浮标混合比例随时间剧变，订正方案直接影响近几十年趋势。ERSSTv6（2025 年发表于 *J. Climate*）改用人工神经网络重建并在 2010 年后用全球平均船-浮标偏差订正、此前用夜间海表气温（NMAT）；HadSST4 则采用细粒度的物理订正。两者路径不同、假设不同，构成"结构性不确定性"而非随机误差。ERSSTv6 的**不确定度估计尚未完成，预计 2026 年发布**——这意味着当前用 ERSSTv6 做趋势归因时缺少配套误差条。

**地球辐射收支（ERB）连续性**是最紧迫的单点风险。CERES 自 2000 年维持了最长的连续 ERB 记录，后继任务 Libera 计划 2027 年发射、主任务寿命 5 年。若无新增仪器，十年内在轨 ERB 任务将从 4 个降至 1 个，且届时 Libera 已超设计寿命——地球能量不平衡（EEI）这一"气候变化最根本指标"的观测存在断档风险。

## 三、2026 年的制度性风险

美国 FY2026 预算提案对观测连续性构成系统性威胁：NOAA 预算拟削减 27% 至 45 亿美元、全职人员削减 2000 人以上、气候研究经费归零、气象卫星与基础设施削减 2.09 亿美元；NASA 科学任务部从 73 亿降至 39 亿美元（−47%），地球科学削减 11.61 亿美元，文职编制从 17,391 降至 11,853。需强调：这些是**行政部门提案**，国会的最终拨款结果在本次检索中未获确认。即便部分削减落地，其影响也不对称——卫星可以延寿，但**定标传承（calibration overlap）、长期数据记录的再处理能力与专业人员一旦中断即不可逆**。

叠加发展中国家的"观测荒漠"与数据主权顾虑（部分国家将观测数据视为可收费资产而限制自由交换），全球观测体系正同时面临"投入不足"与"既有能力退化"的双重压力。

## 关键发现

**ERA6 已进入生产阶段，将是首个分辨率达 14 km 量级的全球长期再分析，但与 ERA5 之间会出现新的"代际不连续"**  
置信度：`高`  
ECMWF/Copernicus 宣布 ERA6 生产于 2026 年 3 月 6 日启动，水平分辨率约 14 km（ERA5 约 31 km），回溯超过 75 年，同化观测量较 ERA5 增加 50% 至部分变量翻倍以上；首批数十年数据预计 2027 年底发布，前四十年数据 2028 年初可下载。分辨率与观测量的同时跃变意味着 ERA5/ERA6 趋势不可简单拼接。
来源：<https://climate.copernicus.eu/copernicus-climates-era6-reanalysis-production-starts> · <https://www.ecmwf.int/en/about/media-centre/science-blog/2026/reanalysis-past-present-future-weather-climate>

**ERA6 采用"单向耦合"设计，自身不同化海洋观测，海洋/海冰初始场由 ORAS6 提供**  
置信度：`高`  
Copernicus 明确说明 ERA6 will not ingest ocean observations directly，由新一代 ORAS6 海洋再分析提供海洋与海冰初始条件。这改善了海岸带与海洋区域的一致性，但也意味着大气再分析的 SST 场质量被 ORAS6 的误差特性所约束。
来源：<https://climate.copernicus.eu/copernicus-climates-era6-reanalysis-production-starts> · <https://www.ecmwf.int/en/about/media-centre/news/2026/new-oras6-ocean-reanalysis>

**Argo 阵列规模长期停滞在目标值的 80% 左右，深海与 BGC 分支是主要缺口**  
置信度：`中`  
近年活跃浮标数在约 3800–4000 之间波动（各来源/月份口径不一），而 OneArgo 目标为 2030 年前后约 4700 个（约 2500 核心 + 1200 深海 + 1000 BGC）。GO-BGC 计划 2021–2026 年布放 500 个 BGC 浮标。缺口集中于 2000 m 以深、季节性海冰区、边缘海与西边界流区——正是海洋热含量与碳通量变率最大的海域。
来源：<https://argo.ucsd.edu/about/status/> · <https://www.go-bgc.org/> · <https://www2.whoi.edu/site/argo/one-argo>

**最不发达国家与小岛屿国家的地基观测缺口是全球预报与再分析质量的"结构性短板"，且已被定量证明**  
置信度：`高`  
WMO 指出 77 个 LDC/SIDS 中约 90% 的 GBON 所需观测仍然缺失；非洲进入全球模式的探空报告数在 2015 至 2020 年初下降约 50% 并继续下滑。ECMWF 的八组 SOFF 投资情景观测系统试验显示，补齐缺口可使非洲预报不确定性下降 30% 以上、太平洋地区最多下降 20%，约 12 小时后效果外溢至全球。
来源：<https://wmo.int/media/news/closing-data-gaps-improves-global-forecasts> · <https://un-soff.org/news/ecmwf-experiments-provide-strongest-scientific-proof-yet-closing-data-gaps-improves-global-forecasts/> · <https://wmo.int/media/magazine-article/africa-increases-designation-of-gbon-stations>

**SST 历史订正的船/浮标偏差问题仍是结构性不确定性来源，ERSST 与 HadSST 走的是方法论上不同的两条路**  
置信度：`争议中`  
现代船舶测量较浮标系统偏暖约 0.12 °C。ERSSTv6（2025 年 J. Climate 第 38 卷第 4 期，Part I 采用人工神经网络重建）对船舶数据在 2010 年前用夜间海表气温（NMAT）订正、2010 年后用全球平均船-浮标偏差订正；HadSST4 则采用细粒度、基于物理的订正而非统计订正。两套假设体系导致的差异属结构性而非随机误差。
来源：<https://journals.ametsoc.org/view/journals/clim/38/4/JCLI-D-23-0707.1.xml> · <https://climatedataguide.ucar.edu/climate-data/sst-data-noaa-extended-reconstruction-ssts-version-6-ersstv6> · <https://www.metoffice.gov.uk/hadobs/hadsst4/documentation/HadSST.4.2.0.0_product_user_guide.pdf>

**ERSSTv6 已投入使用但其不确定度估计尚未发布，当前趋势分析缺少配套误差条**  
置信度：`中`  
NCAR Climate Data Guide 记载 ERSSTv6 uncertainties are still under development, and are expected to be available in 2026。截至本次检索，未获得确认其已正式发布的资料。
来源：<https://climatedataguide.ucar.edu/climate-data/sst-data-noaa-extended-reconstruction-ssts-version-6-ersstv6>

**地球辐射收支观测面临明确的、可预见的断档风险，直接威胁地球能量不平衡（EEI）的监测能力**  
置信度：`高`  
CERES 自 2000 年维持最长连续 ERB 记录；后继任务 Libera 计划 2027 年发射，主任务寿命 5 年。研究指出若无额外仪器发射，在轨 ERB 任务将在十年内由 4 个降至 1 个，且届时 Libera 已超出 5 年设计寿命；Libera 之后的连续性计划仍不确定。已有研究提出用立方星（CubeSat）方案补充 ERB 观测。
来源：<https://journals.ametsoc.org/view/journals/clim/37/23/JCLI-D-24-0180.1.xml> · <https://egusphere.copernicus.org/preprints/2026/egusphere-2026-2197/> · <https://www.sciencedirect.com/science/article/pii/S2950630126000086>

**美国 FY2026 预算提案若落地，将同时削弱卫星、实验室与人员三条观测连续性支柱；但最终拨款结果未获确认**  
置信度：`中`  
提案拟将 NOAA 预算削减 27% 至 45 亿美元、削减 2000 名以上全职人员、气候研究经费归零并取消气候实验室，气象卫星与基础设施削减 2.09 亿美元；NASA 科学任务部由 73 亿降至 39 亿美元（−47%），地球科学削减 11.61 亿美元，文职编制由 17,391 降至 11,853。多个来源同时强调国会拥有修改总统预算提案的权力，最终结果不确定。
来源：<https://www.scientificamerican.com/article/nasa-and-noaa-trump-funding-cuts-jeopardize-these-key-climate-and-space/> · <https://www.congress.gov/crs-product/IF13024> · <https://eos.org/research-and-developments/proposed-noaa-budget-calls-for-0-for-climate-research> · <https://thebridge.agu.org/2025/08/08/appropriations-update-nasa-noaa-and-nsf/>

**观测能力的"不可逆损失"主要发生在定标传承与人力资本层面，而非硬件本身**  
置信度：`低`  
卫星平台可通过延寿运行维持一段时间，但长期气候数据记录依赖新旧仪器的在轨重叠定标、持续的再处理与版本迭代（如 ERSST、CERES Edition 系列）。预算与人员削减首先打击的是再处理团队与实验室（如 NOAA 气候实验室被提议取消），这类能力一旦中断无法靠事后补发卫星恢复。此为基于公开预算文件的推断性判断，非直接引用的结论。
来源：<https://eos.org/research-and-developments/proposed-noaa-budget-calls-for-0-for-climate-research> · <https://journals.ametsoc.org/view/journals/clim/37/23/JCLI-D-24-0180.1.xml>

## 关键数值

| 指标 | 数值 | 时段 | 来源 |
|---|---|---|---|
| ERA6 水平分辨率 | 约 14 km（ERA5 约 31 km，提升 2 倍以上） | 2026 年 3 月起生产 | Copernicus C3S / ECMWF, climate.copernicus.eu |
| ERA6 生产启动日期与首批数据发布 | 生产启动 2026-03-06；首批数十年数据预计 2027 年底发布；前四十年数据 2028 年初可下载 | 2026–2028 | Copernicus C3S, climate.copernicus.eu |
| ERA6 同化观测量相对 ERA5 增幅 | +50% 至部分变量增加一倍以上 | ERA6 vs ERA5 | Copernicus C3S, climate.copernicus.eu |
| ERA6 时间覆盖长度 | 超过 75 年（小时级，约自 1950 年代至近实时） | 约 1950s–至今 | Copernicus C3S, climate.copernicus.eu |
| Argo 活跃浮标数 | 约 3,800–4,000 个（各来源与月份口径不一） | 近年至 2026 年 | Argo 项目实施状态页 argo.ucsd.edu / NOAA AOML（检索摘要，未直接读取原页，页面返回 503） |
| OneArgo 目标阵列规模 | 约 4,700 个浮标 = 约 2,500 核心 + 1,200 深海 + 1,000 BGC | 目标年 2030 | OneArgo 规划 / WHOI |
| GO-BGC 计划布放的 BGC 浮标数 | 500 个 | 2021–2026 | go-bgc.org |
| GBON 观测缺口（最不发达国家与小岛屿国家） | 约 90% 的所需观测仍然缺失，覆盖 77 个国家 | 截至 2025–2026 | WMO / SOFF |
| 非洲进入全球模式的探空（radiosonde）报告数下降幅度 | 2015 年至 2020 年初下降约 50%，此后继续下降 | 2015–2020 及之后 | WMO, wmo.int |
| 补齐 GBON 缺口带来的预报不确定性下降（ECMWF 观测系统试验） | 非洲下降 >30%；太平洋地区最多下降 20%；约 12 小时后效果外溢至全球 | 研究发布于 2025-06-25 | ECMWF / WMO / SOFF |
| SOFF 在非洲启动项目的国家数 | 24 个非洲国家；SOFF 项目覆盖全部 EW4All 首批实施国，其中 13 个在非洲；马拉维单国项目 384 万美元 | 截至 2026 年 | un-soff.org / WMO MeteoWorld 2026年7月 |
| 现代船舶 SST 相对浮标的系统性暖偏差 | 约 +0.12 °C | 现代（浮标大规模布放后） | Science Advances / NCAR Climate Data Guide |
| NOAA FY2026 预算提案削减幅度 | −27% 至 45 亿美元；全职人员削减 >2,000 人；气象卫星与基础设施削减 2.09 亿美元；气候研究经费拟为 0 | FY2026 总统预算提案（国会最终拨款未确认） | CRS IF13024 / Scientific American / Eos |
| NASA 科学任务部 FY2026 预算提案 | 由 73 亿降至 39 亿美元（−47%）；地球科学削减 11.61 亿美元；文职编制由 17,391 降至 11,853 | FY2026 总统预算提案 | Scientific American / AGU The Bridge / Project Geospatial |
| 在轨地球辐射收支（ERB）任务数量预计变化 | 由 4 个降至 1 个（十年内，若无额外发射）；Libera 计划 2027 年发射，主任务寿命 5 年；CERES 记录自 2000 年起连续 | 2000 年至约 2035 年 | J. Climate 37(23) 2024 / EGUsphere 2026 预印本 |
| GRACE/GRACE-FO 质量变化记录长度 | 自 2002 年起（GRACE），GRACE-FO 于 2018 年发射续接 | 2002–至今 | NASA Earthdata / eoPortal |

## 2025–2026 新进展

- 2026 年 3 月 6 日，ECMWF/Copernicus 气候变化服务正式启动 ERA6 再分析生产，水平分辨率约 14 km、回溯超过 75 年，同化观测量较 ERA5 增加 50% 至部分变量翻倍；首批数十年数据预计 2027 年底发布、前四十年数据 2028 年初开放下载。
- ECMWF 于 2026 年发布新一代 ORAS6 海洋再分析，为 ERA6 提供海洋与海冰初始条件（ERA6 本身不直接同化海洋观测，属单向耦合设计），同时支撑季节预报与气候监测。
- ERSSTv6 于 2025 年在《Journal of Climate》第 38 卷第 4 期正式发表（Part I 引入人工神经网络重建方法，Part II 升级质量控制与大尺度滤波），并已在 NOAA NCEI 发布；其配套不确定度估计据 NCAR Climate Data Guide 仍在开发中、预计 2026 年可用。
- 2025 年 6 月 25 日，ECMWF 发布基于八组 SOFF 投资情景的观测系统试验结果，首次定量证明补齐 GBON 观测缺口可使非洲预报不确定性下降 30% 以上、太平洋地区最多下降 20%，并在约 12 小时后外溢为全球收益；探空数据在热带的影响尤其突出。
- SOFF（系统观测融资机制）在 2026 年进入规模化实施阶段：已在 24 个非洲国家启动项目，覆盖全部"全民早期预警"（EW4All）首批实施国（其中 13 国在非洲）；马拉维启动 384 万美元国别项目。但 WMO 同时指出 77 个 LDC/SIDS 中约 90% 的 GBON 所需观测仍然缺失，且手动站与多厂商自动站混杂导致数据自动化传输仍存技术障碍。
- 美国 FY2026 预算提案对地球观测构成系统性威胁：NOAA 拟削减 27% 至 45 亿美元、裁减逾 2,000 名全职人员、气候研究经费归零、气象卫星与基础设施削减 2.09 亿美元；NASA 科学任务部由 73 亿降至 39 亿美元（−47%），地球科学削减 11.61 亿美元，文职编制由 17,391 降至 11,853。国会最终拨款结果截至检索未获确认。
- 地球辐射收支观测连续性风险在 2026 年被进一步量化和讨论：JPL 于 2026 年 1 月召开第二届 GEWEX 地球能量不平衡评估研讨会；EGUsphere 于 2026 年发表预印本，提出用立方星（CubeSat）星座补强 ERB 观测，以应对"在轨 ERB 任务十年内由 4 个减至 1 个、Libera（2027 年发射、5 年主任务）之后无明确后继"的断档风险。

## 本领域的不确定性

- Argo 活跃浮标的精确数字未能直接核实：argo.ucsd.edu 的实施状态页在本次检索中返回 HTTP 503，所引 3,800–4,000 的区间来自检索摘要而非原始状态页读数。深海 Argo 与 BGC-Argo 各自在 2026 年的确切在阵数量、以及 GO-BGC 500 浮标目标是否按期完成，截至检索未获确认。
- 美国 FY2026 的最终拨款结果（相对于总统预算提案）未获确认。FY2026 财年在 2026 年 9 月 30 日结束，本次检索未取得国会实际拨款数额、实际裁员执行情况，以及具体哪些观测项目（如 NOAA 气候实验室、Landsat Next）被真正终止或保留。因此"提案数字"不应被当作"已发生的削减"引用。
- SWOT（地表水与海洋地形）与 MTG（第三代气象卫星）的 2026 年运行状态、数据成熟度与任何延寿/故障情况，截至检索未获 2026 年更新；风云系列中 FY-3F/3G/3H/3J 等近期星的在轨与定标状态，以及其数据进入国际再分析同化系统的程度，同样未获得可靠的 2026 年权威确认。
- ERA5、ERA6、JRA-3Q、MERRA-2 之间的定量一致性与偏差（例如全球平均温度趋势差、地表能量收支闭合差、平流层水汽与风场差异）在本次检索中未获得具体数值化的交叉比对结果。NASA 的 MERRA-3 以及 NASA/中国气象局约 5 km 分辨率全球再分析的开发进度仅见于一次性提及，细节与时间表未获确认。
- ERSSTv6 的不确定度估计是否已在 2026 年实际发布尚未确认（来源仅称"预计 2026 年可用"）。ERSSTv6 与 HadSST4 在 2015 年以来全球 SST 趋势上的定量差值（°C/十年）未获得具体数字，本报告不给出估计值。
- 数据主权问题（部分国家以收费或政策限制自由交换气象观测数据、WMO 第 1 号决议框架下的实际履约情况）在本次检索中未获得 2025–2026 年的权威量化评估，仅能定性提及；不应据此给出受影响国家数量或数据缺失比例。

## 未决争论

- SST 历史订正的方法论之争：ERSST 系列采用统计式订正（ERSSTv6 用人工神经网络重建，2010 年前以夜间海表气温 NMAT 订正船舶数据、2010 年后以全球平均船-浮标偏差订正），HadSST4 则采用细粒度、基于物理过程的订正。由于现代船舶相对浮标系统性偏暖约 0.12 °C 且船/浮标混合比例随时间剧变，两条技术路线在近几十年趋势上的差异属结构性不确定性，短期内不会收敛。
- 再分析能否用于趋势归因：再分析同化的观测系统本身随时间变化（卫星的引入、探空的衰减），会在长期序列中引入虚假趋势。ERA6 分辨率与观测量的同时跃变将使 ERA5/ERA6 的拼接问题更尖锐，学界对"再分析可用于哪些变量的长期趋势、哪些只能用于天气尺度过程研究"尚无统一标准。
- 观测系统投资的优先级之争：在预算收缩背景下，应优先保障卫星连续性（尤其是 ERB/EEI 这类不可重建的全球积分量），还是优先填补最不发达国家的地基与探空缺口（ECMWF 试验显示后者的预报效益回报率极高且成本低得多）。两者在资金池上直接竞争。
- 观测数据的公共品属性与数据主权：部分国家将本国观测数据视为可收费资产或涉及国家安全而限制自由交换，这与 WMO 全球自由数据交换原则、以及全球模式对稠密观测的依赖构成张力；如何在补偿机制（如 SOFF）与开放义务之间设计可持续制度，仍在讨论中。
- 商业气象数据（如无线电掩星星座、商业传感器）能否在公共预算收缩时填补空缺：其时空覆盖增长迅速，但定标传承、长期一致性与数据可及性均受商业条款约束，是否适合作为气候级长期数据记录的支柱存在分歧。

---

## 反驳式核查结论

核查员以「默认怀疑」姿态逐条尝试推翻上述论断。判定：**需大幅修订**

### ✅ 确认
**原论断**：ERA6 已进入生产阶段，分辨率约 14 km（ERA5 约 31 km），回溯超过 75 年，同化观测量 +50% 至部分变量翻倍；生产 2026-03-06 启动，首批数十年数据 2027 年底、前四十年 2028 年初

**核查意见**：所有可核查数字与官方页面逐字一致：production started 6th March 2026；ERA6 approximately 14km vs ERA5 31 km；back to over 75 years；between +50% to more than doubling for some variables；first decades of data released towards the end of 2027；download data from the first four decades by early 2028。但两处附加说法不属于该来源：(a)「首个分辨率达 14 km 量级的全球长期再分析」中的「首个」未经证实，官方文本无此表述；(b)「ERA5/ERA6 之间会出现新的代际不连续、趋势不可简单拼接」是草稿自己的推论，官方未作此陈述，却被标为置信度「高」——应降为「中/推断」。数字表中「约自 1950 年代至近实时」也是由 75 年反推，官方未给起始年。

核查来源：<https://climate.copernicus.eu/copernicus-climates-era6-reanalysis-production-starts>

### 🟠 夸大
**原论断**：ERA6 采用「单向耦合」设计，自身不同化海洋观测，海洋/海冰初始场由 ORAS6 提供

**核查意见**：事实内核确认：官方原文为 ERA6 will not ingest ocean observations directly，且 ORAS6 providing reliable ocean and sea ice initial conditions to ERA6。但「单向耦合」是草稿自创的标签，与同一页另一句相冲突：For the first time in an ECMWF flagship reanalysis, ERA6 includes an ocean model to provide a consistent representation between the atmosphere, ocean waves and the ocean——ERA6 内含海洋模式，官方定位为「一致耦合表征」而非「单向」。正确表述应为：ERA6 含耦合海洋/海浪模式，但海洋观测不在 ERA6 内直接同化，初始条件外部由 ORAS6 提供。另：草稿引用的第二来源 ecmwf.int/.../news/2026/new-oras6-ocean-reanalysis 本次无法访问核实，存在悬空引用风险。「SST 场质量被 ORAS6 误差特性所约束」亦为推论而非引文，置信度「高」不成立。

核查来源：<https://climate.copernicus.eu/copernicus-climates-era6-reanalysis-production-starts>

### 🔴 推翻
**原论断**：ERSSTv6 对船舶数据「在 2010 年前用 NMAT 订正、2010 年后用全球平均船-浮标偏差订正」

**核查意见**：年份阈值错误，且错了 25 年。NCAR Climate Data Guide 原文：Biases of ship SST were corrected by nighttime marine air temperature (NMAT) before 1985，and by buoy and Argo SSTs in global average after 1985。分界年是 1985，不是 2010；1985 年后的参照是浮标与 Argo 的 SST，不只是「船-浮标偏差」。此外草稿称「Part I 采用人工神经网络重建」需限定：ANN 在 v6 中是插值方法（interpolation using an artificial neural network），不是偏差订正方法，草稿把两者并置易致误读。文献信息本身确认：Huang et al., 2025, J. Climate, 38, 1105–1121。

核查来源：<https://climatedataguide.ucar.edu/climate-data/sst-data-noaa-extended-reconstruction-ssts-version-6-ersstv6>

### ⚪ 无法核实
**原论断**：现代船舶 SST 较浮标系统性偏暖约 +0.12 °C（来源标注为 Science Advances / NCAR Climate Data Guide）

**核查意见**：所标注的 NCAR Climate Data Guide ERSSTv6 页面全文未给出任何具体的船-浮标偏差数值，只描述订正方法。该 0.12 °C 量级在文献中确有广泛流传（ERSSTv4/v5 与 HadSST 系列的船-浮标偏移常被引为约 0.1–0.12 °C），但本次检索无法证实，且现有来源标注是错的——不能以该页面为据。另需注意：此偏差并非全时段常数，随年代、测量方式（进水口/桶/船体）与船队构成变化，草稿把它写成单一「现代」常数已属简化。修订前应删除或改挂真实出处（如 Huang et al. 或 Kennedy et al. 原文）。

核查来源：<https://climatedataguide.ucar.edu/climate-data/sst-data-noaa-extended-reconstruction-ssts-version-6-ersstv6>

### ✅ 确认
**原论断**：ERSSTv6 已投入使用但不确定度估计尚未发布，预计 2026 年可得

**核查意见**：页面原文逐字确认：ERSSTv6 uncertainties are still under development, and are expected to be available in 2026；数据确在 NOAA NCEI 提供且按月更新。但有时效陷阱：今天已是 2026-09-19，「预计 2026 年发布」的窗口所剩无几甚至已兑现，而 Climate Data Guide 页面的更新时间未知。草稿据此断言「当前趋势分析缺少配套误差条」在 2026 年 9 月可能已不成立，应直接向 NOAA NCEI 查证 v6 不确定度产品是否已上线，而非依赖一个可能陈旧的二手描述页。

核查来源：<https://climatedataguide.ucar.edu/climate-data/sst-data-noaa-extended-reconstruction-ssts-version-6-ersstv6>

### 🟠 夸大
**原论断**：补齐 GBON 缺口可使非洲预报不确定性下降 >30%、太平洋最多 20%，约 12 小时后效果外溢至全球，且该短板「已被定量证明」

**核查意见**：数字确认、性质被夸大。SOFF 页面确有 eight SOFF investment scenarios、Forecast uncertainty decreases by more than 30 percent over Africa、up to 20 percent in the Pacific region、12 hours。但关键限定被草稿删掉了：这是观测系统模拟试验——原文明确 simulating the impact 且 simulated observations were fed into ECMWF's operational model。即模型自证的理想化仿真，不是对真实补网效果的实测，绝不能称「已被定量证明」，置信度「高」应降为「中」。另有两处偏差：(a) 发布日期是 2025 年 6 月 16 日，草稿数字表写成 2025-06-25，错 9 天；(b) 全球外溢的量值官方未给出，原文只说 12 小时内的局地改善与未量化的更长时效全球收益，草稿「约 12 小时后效果外溢至全球」把未量化陈述写成了确定机制。

核查来源：<https://un-soff.org/news/ecmwf-experiments-provide-strongest-scientific-proof-yet-closing-data-gaps-improves-global-forecasts/>

### ⚪ 无法核实
**原论断**：77 个 LDC/SIDS 中约 90% 的 GBON 所需观测仍缺失；非洲探空报告数 2015 至 2020 年初下降约 50%

**核查意见**：草稿把这两个数字与 SOFF 的 30%/20% 打包在同一条「高」置信度论断下，但它们来自不同页面。本次实际读取的 SOFF 页面中不存在「77 国」或「90% 缺失」的任何表述，只提到 prioritizing LDCs and SIDS 而无量化缺口评估。WMO 侧的两个来源（closing-data-gaps 新闻页、africa-increases-designation 杂志页）本次无检索额度核对。按默认怀疑原则判为无法核实：这两个数字在修订稿中须单独标注出处与统计口径（「所需观测」按 GBON 站点数、报文数还是达标率计？探空「下降 50%」是站点数还是进入全球模式的报文条数？两者含义差别极大）。

核查来源：<https://un-soff.org/news/ecmwf-experiments-provide-strongest-scientific-proof-yet-closing-data-gaps-improves-global-forecasts/>

### 🟠 夸大
**原论断**：Argo 阵列规模「长期停滞在目标值的 80% 左右」，活跃浮标约 3,800–4,000，OneArgo 目标约 4,700

**核查意见**：算术无误（3,800–4,000 / 4,700 ≈ 81–85%），但「长期停滞」是不成立的框架错误：OneArgo 的 ~4,700 是 2030 年前后的目标，拿尚未到期的未来目标做分母，再把「未达标」说成「停滞」，属于时间范围误用。事实上 Argo 核心阵列的原始 3,000 浮标目标自 2007 年起即已达成并长期维持，真实图景是「核心达标、扩展分支（Deep/BGC）爬坡中」，而非整体停滞。草稿自己也注明 argo.ucsd.edu 状态页返回 503 未直接读取，本次亦无额度复核，浮标数与 2,500/1,200/1,000 的分解均判为无法独立确证。建议改为区分核心与扩展分支分别陈述，并直接引用 Argo 月度状态页的当月快照数。

核查来源：<https://argo.ucsd.edu/about/status/>

### 🟠 夸大
**原论断**：在轨 ERB 任务将在十年内由 4 个降至 1 个，EEI 监测面临「明确的、可预见的断档风险」（置信度高）

**核查意见**：典型的「单一论文结论当成学界共识」。「4 个降至 1 个」出自草稿自列的一篇 J. Climate 2024 论文（外加一篇 2026 年 EGUsphere 预印本——预印本未经同行评议，不应与期刊论文并列作为高置信度支撑）。这是特定假设下的任务寿命外推，不是 NASA/NOAA/WMO 的官方规划结论，置信度「高」无依据，应降为「中」并明确标注为个别研究的情景推算。另有一处史实简化：草稿称「CERES 自 2000 年维持最长连续 ERB 记录」——ERB 卫星观测序列本身可上溯至 Nimbus-7（1970 年代末）与 ERBE（1984 起），CERES 自身亦始于 1997/1998 年的 TRMM 而非 2000 年（2000 年是 Terra 上的 CERES）。本次无额度核实 Libera 的 2027 发射与 5 年主任务寿命。

核查来源：<https://journals.ametsoc.org/view/journals/clim/37/23/JCLI-D-24-0180.1.xml>

### 🟡 过时
**原论断**：美国 FY2026 预算提案将削减 NOAA 27%、NASA 科学任务部 −47% 等，「最终拨款结果未获确认」

**核查意见**：时间框架已失效。今天是 2026-09-19，FY2026 于 2026-09-30 结束——整个财年已近走完，把这些数字继续当作「待定的总统预算提案」来叙述，在 2026 年 9 月是过时表述。正确做法是核查 FY2026 实际生效的拨款法案或持续决议（CR）下的执行数，以及实际发生的人员流失与实验室存废，而不是复述 2025 年春季的提案数。提案内部算术自洽（39/73 ≈ −47%），但提案值与执行值可能相差极大，本次无检索额度取得执行数，故所有具体金额判为未经独立确证。第 9 条「不可逆损失发生在定标传承与人力资本层面」草稿已自标为推断且置信度低，处理得当，但其引用的 J. Climate ERB 论文并不支持预算/人力资本论点，属于挂错引文。

核查来源：<https://www.congress.gov/crs-product/IF13024>

### 核查员指出的遗漏角度

- 无线电掩星（RO）观测的商业化转向：COSMIC-2 之后对 Spire/GeoOptics 等商业数据购买的依赖日益加深，而 RO 是再分析中少数近乎免定标的绝对锚定观测。商业采购的合同周期、许可条款与实时性限制构成一类全新的连续性风险，草稿完全未触及
- 机器学习天气模型与再分析之间的反馈回路：GraphCast、AIFS、Pangu、FourCastNet 均以 ERA5 为训练与检验真值。草稿正确地点出了 ERA5→ERA6 的代际不连续，却没有追问其最大后果——整个 ML 预报生态的基准会随之漂移，且 ML 模型的评分本身已不再是对观测的独立检验
- 陆面温度记录的均一化问题全缺席：GHCN-M、USCRN、Berkeley Earth 的站点迁移、仪器更换、城市热岛与时次订正，是与 SST 船/浮标偏差完全对称的另一半结构性不确定性。只查 SST 而不查陆面，数据可信度的图景是残缺的
- OHC/EEI 的独立交叉验证闭合检验：卫星测高（海平面总变化）− GRACE/GRACE-FO（质量分量）= 比容分量，应与 Argo 直接测得的热膨胀相符。这一「预算闭合」是检验 EEI 是否自洽的最硬约束，也是 XBT 历史偏差订正争议的落点。草稿分别提到了 Argo、GRACE 与 CERES，却没有把它们连成这条交叉验证链
- AMDAR/商业航班观测在 COVID 期间的自然实验：2020 年航班骤降对预报技巧的实测影响已被多项研究量化。这是比 SOFF 的理想化 OSSE 硬得多的真实世界证据，草稿用仿真结果去论证「观测缺口有代价」，却漏掉了现成的实证案例
- 数据政策与数据主权：WMO 统一数据政策（Res. 1, Cg-Ext(2021)）、实时数据国际交换的实际履约率、商业气象数据的可获取性与再分发限制。观测「存在」与观测「进入全球同化系统」是两回事，后者是政策问题而非硬件问题
- 再分析自身的已知伪趋势：观测系统随时间演变（卫星的引入与退役、探空网变迁）在同化系统中制造的虚假不连续，以及 ERA5 平流层/高层对流层温度趋势的已知偏差。草稿把再分析当作被观测缺口影响的「受害者」，未讨论再分析作为趋势产品本身不适合直接做长期趋势归因这一核心告诫
- 极地、高海拔与深海的观测空白：与 LDC/SIDS 并列的另一类结构性缺口，且叠加了海冰密集度不同反演算法之间的系统差异（NASA Team vs Bootstrap vs OSI SAF）。草稿引用了 NSIDC 作为核查源却未涉及任何海冰数据的不确定性
- 不确定度量化方法自身的可信度：ERA5 的 10 成员集合（EDA）离散度被公认低估真实误差；SST 数据集的集合成员数与扰动设计差异，使得不同产品的「误差条」并不可直接比较。草稿在多处要求「配套误差条」，却未质疑误差条本身的可靠性
- 碳循环观测网络完全缺席：任务指定 GCP 为核查来源，但草稿未涉及 ICOS、NEON、大气 CO2 本底观测（Mauna Loa 等）与涡度相关通量塔网络的连续性，而这些在同一轮美国预算压力下面临相同甚至更高的中断风险
