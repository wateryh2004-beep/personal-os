#!/usr/bin/env tsx
/**
 * Career 板块数据预填（幂等）。
 *
 * 运行：npx tsx scripts/seed-career.ts
 * 依赖：supabase CLI 已 link 远程项目且已认证（~/.supabase/access-token）。
 * 也可用 `--dry-run` 只打印生成的 SQL 而不执行。
 *
 * 幂等策略：每个实体按「user_id + 自然键」查重，存在则跳过（不会覆盖你后续的手工编辑）；
 * career_profiles 单行按 user_id upsert。
 * 注意：本脚本含个人敏感信息（履历/证书/考试计划），仓库为 private，仍请谨慎传播。
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OWNER_EMAIL_FALLBACK = "ron.yuhang@outlook.com";

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
const optStr = (s: string | null) => (s === null ? "null" : sqlStr(s));
/** 把 "2026-02" / "2026" 归一化为完整日期，避免依赖 PG 的隐性月初解析。 */
function normalizeDate(s: string | null): string | null {
  if (!s) return s;
  const [y, m, d] = s.split("-");
  if (!d) return m ? `${y}-${m}-01` : `${y}-01-01`;
  return s;
}
const optDate = (s: string | null) => (normalizeDate(s) ? sqlStr(normalizeDate(s)!) : "null");
const optArray = (arr: string[] | null) => (arr && arr.length ? `array[${arr.map(sqlStr).join(",")}]::text[]` : "'{}'::text[]");

type DirectionSeed = { name: string; priority: number; status: string; hypothesis: string; supporting: string; opposing: string; decision: string; reviewDate: string | null };
type ExperienceSeed = { key: string; type: string; organization: string; department: string | null; role: string; location: string | null; start: string | null; end: string | null; isCurrent: boolean; background: string; raw: string | null; status: string };
type OutputSeed = { experienceKey: string; name: string; outputType: string; description: string; result: string | null; publicUrl: string | null };
type SkillSeed = { name: string; category: string; proficiency: string; evidence: string | null };
type CertificationSeed = { name: string; issuer: string; status: string; examDate: string | null; issueDate: string | null };
type MilestoneSeed = { title: string; status: string; importance: string; starts: string | null; target: string };

// ---------------------------------------------------------------------------
// 数据（来源：个人职业档案 career/profile.md + 2027 秋招备战期目标）
// ---------------------------------------------------------------------------

const profile = {
  headline: "人大硕士 · REITs 投研 + AI 全栈",
  currentStage: "华夏基金公募 REITs 分析师实习 + 高力国际系统开发兼职维护；备战 2027 秋招",
  graduation: "2028-06-30",
  cycle: "2027 秋招（目标 2027-10）",
  locations: ["北京"],
  workTypes: ["实习", "全职"],
  risk: "接受高强度工作，但拒绝零杠杆打杂与边缘化螺丝钉；认可付费实习/零薪资高价值模式；不介意无留用机会，但非常介意实习工资过低。",
  constraints: `## 硬约束（一票否决）
- 地理围栏：仅北京，或 JD 明确可完全 Remote（不接上海/深圳/杭州等线下 base）
- 通勤：单程 ≤ 1 小时 10 分钟（燕郊出发，仅国贸/金融街/东二环可达）
- 拒绝小黑工：无正式流程、低薪纯打杂、边缘化创新业务一票否决
- 不太接受出差与加班

## 底线
- 拒绝零杠杆的纯粹消耗性劳动（贴票/纯手工 Excel 搬运/基础格式排版）
- 拒绝长期局限于极小业务分支、无法窥探项目全貌的岗位`,
  goals: `## 短期（2026-08 → 2026-12）实力提升
- CFA Level 1（2026-11 考试）+ CPA（会计/财管/税法）
- 华夏 REITs 深耕：公募 REITs 行业研究、投资分析框架
- AI 量化体系：自动化数据爬虫 + 多因子模型库

## 中期（2027 秋招）三方向
1. 不动产金融 / 量化研究（主攻）
2. 战略投资 / 数字化战略（第二）
3. AI 产品 / 商业化战略（第三）

## 长期（5-10 年）
成为「公管 + 金融 + AI」复合型高层战略专家，以高自动化效率与顶级行业认知获取商业价值与自由`,
  summary: `土地资源管理本硕（人大，保研第二）出身的复合型候选人：左手不动产金融（华夏基金公募 REITs 分析师），右手 AI 全栈（高力国际从 0 到 1 搭建商业地产数据系统）。用「公管 + 金融 + AI」三张牌打 2027 秋招：不动产金融/量化研究为主攻，战略投资与 AI 产品为两翼。中共党员，专注长期主义，拒绝零杠杆打杂。`,
};

const directions: DirectionSeed[] = [
  { name: "不动产金融 / 量化研究", priority: 90, status: "active", hypothesis: "土地资源管理 × 不动产金融高度对口，华夏基金公募 REITs 实习提供顶级实战背书，是确定性最高的主攻方向。", supporting: "华夏基金公募 REITs 分析师实习（T0 公募核心投研）；不动产估价技能大赛优胜奖；不动产估价 + 金融建模 + 空间数据分析技能直接可用。", opposing: "金融量化实战体系需进一步模块化；CFA/CPA 仍在备考，金融理论体系待补。", decision: "主攻。双线实习期内把华夏 REITs 做成可讲深、可量化的核心资产。", reviewDate: "2026-11-30" },
  { name: "战略投资 / 数字化战略", priority: 70, status: "exploring", hypothesis: "公管 + 金融 + AI 复合背景 + 央国企公文写作/宏观视野，适配头部央企总部与政策性银行战投/数字化核心岗。", supporting: "MPA 数字化运营（数据纳入中组部公务员二局决策参考）；央国企公文写作熟练；政策研究与宏观视野。", opposing: "缺乏顶层体制内的核心实习背书；战投直接经历为零。", decision: "持续探索，作为 2027 秋招第二方向，优先补体制内核实习背书。", reviewDate: "2026-11-30" },
  { name: "AI 产品 / 商业化战略", priority: 60, status: "exploring", hypothesis: "Vibe Coding 从 0 到 1 独立交付能力 + AI 工具链驱动是科技大厂/AI 创投看重的差异化筹码。", supporting: "高力数据系统（0 到 1 全栈，457 栋楼宇服务 26 人）；快手短剧（漫剧）小程序产品孵化；LSTM 科研基金项目。", opposing: "非技术专业背景；独立编码依赖 AI 辅助；0 到 1 商业变现案例仍需更多。", decision: "保持探索，持续提炼可对外展示的商业化案例。", reviewDate: "2026-11-30" },
];

const experiences: ExperienceSeed[] = [
  { key: "edu_master", type: "education", organization: "中国人民大学", department: "公共管理学院", role: "土地资源管理 · 硕士研究生（保研第二）", location: "北京", start: "2025-09", end: null, isCurrent: true, background: "保研本校，专业第二。导师施昱年。研究方向：住宅价格波动/泡沫/周期计量模型、产业关联与集聚、产业效率与土地利用效率。核心课程：不动产估价、房地产投资分析、计量经济学、Python 程序设计。", raw: null, status: "confirmed" },
  { key: "edu_bachelor", type: "education", organization: "中国人民大学", department: "公共管理学院", role: "土地资源管理 · 学士", location: "北京", start: "2021-09", end: "2025-06", isCurrent: false, background: "GPA 3.64，专业第二。毕业论文《资本化时序下基础设施供给时序对房价空间分异的动态影响——基于 296 个地级市面板数据的双向固定效应分析》（导师曲卫东）。", raw: null, status: "confirmed" },
  { key: "intern_huaxia", type: "internship", organization: "华夏基金管理有限公司", department: "基础设施与不动产投资部", role: "公募 REITs 分析师实习生", location: "北京", start: "2026-06", end: null, isCurrent: true, background: "T0 公募核心投研岗，与土地资源管理专业高度对口。基础设施与不动产项目投资研究：行业日常研究、专题研究支持、基础材料编制、数据分析整理、初步投资分析建议。日薪 200 + 餐补，要求每周至少 4 天。", raw: null, status: "confirmed" },
  { key: "intern_colliers", type: "internship", organization: "高力国际（Colliers）", department: "中国区办公楼研究部", role: "行研实习生（兼系统开发负责人）", location: "北京", start: "2025-12", end: null, isCurrent: true, background: "入职初期负责北京办公楼及产业园市场研究；后用 Vibe Coding 从 0 到 1 搭建商业地产数据系统（Next.js + Supabase + PostGIS + 高德地图）。457 栋楼宇数据、3103 条租赁成交记录、1178 条运营指标，服务 26 名团队成员。已转为兼职维护模式。直属领导：陆明。", raw: null, status: "confirmed" },
  { key: "intern_kuaishou", type: "internship", organization: "北京快手科技有限公司", department: "短剧/A站产品", role: "产品经理实习生", location: "北京", start: "2025-02", end: "2025-06", isCurrent: false, background: "短剧（漫剧）小程序产品孵化：从 BRD 到上线的全流程产品工作；A 站（AcFun）弹幕视频平台数据运营：Hive/Presto 环境周报数据提取、头部 UP 主激励金分配（数十万元量级）。实习到期 + 组解散，被迫离职。", raw: null, status: "confirmed" },
  { key: "intern_mpa", type: "internship", organization: "全国 MPA 教育指导委员会", department: "数字化运营", role: "数字化运营助理", location: "北京", start: "2024-07", end: "2025-01", isCurrent: false, background: "参与全国 MPA 教学评估项目：200+ 高校、1200+ 份教学数据清洗与量化分析；开发文心一言智能体辅助政策咨询；核心数据结果纳入中组部公务员二局决策参考体系。", raw: null, status: "confirmed" },
  { key: "intern_haigang", type: "internship", organization: "浙江海港投资运营集团", department: "行政与文秘", role: "行政与文秘助理", location: "宁波", start: "2025-07", end: "2025-08", isCurrent: false, background: "省属国企核心行政与人事档案管理；梳理公文标准化流转 SOP；协助整理干部任免档案 36 份 0 纰漏；独立撰写会议纪要与内部通讯。这段经历让他决定不去国企（感觉太安逸）。", raw: null, status: "confirmed" },
  { key: "proj_natural_resources", type: "project", organization: "地方政府委托课题", department: "施昱年课题组", role: "课题核心成员（最终汇总报告）", location: null, start: "2025-05", end: "2025-12", isCurrent: false, background: "响应中央一号文件，设计全民所有自然资源资产的资本化/金融化路径；针对耕地及林地构建多维度动态估值体系；设计「协议转让 + 竞价拍卖 + ABS」组合交易模式。撰写的《实施方案》核心章节被纳入地方政府决策参考体系。", raw: null, status: "confirmed" },
  { key: "proj_spillover", type: "project", organization: "研究生专业课题", department: null, role: "独立完成全链路实证", location: null, start: "2026-02", end: "2026-02", isCurrent: false, background: "大型商业综合体经济溢出效应的量化研究：Google 开源 NPP-VIIRS 夜间灯光遥感数据，双重差分模型（DID）进行微观实证检验；独立跑通从底层遥感数据获取到计量实证的完整链路。", raw: null, status: "confirmed" },
  { key: "proj_appraisal", type: "project", organization: "全国大学生不动产估价技能大赛", department: "团队：余航/周裕智/陈凌枫/官敏娜", role: "注册房地产估价师 + 法定代表人", location: "北京", start: "2024-05", end: "2024-05", isCurrent: false, background: "北京市怀柔区马道峪村 134 号民宿项目价值与宅基地使用权流转市场价值评估：集体土地上民宿 650㎡（7 间经营性民宿/2 间茶室/1 间餐厅），宅基地流转 1300㎡。收益法民宿估值 464 万、成本法 530.97 万，宅基地流转 92.8 万。独立完成收益法现金流测算与折现模型。获全国优胜奖。", raw: null, status: "confirmed" },
  { key: "proj_lstm", type: "project", organization: "中国人民大学科研基金项目", department: "与信息学院合作", role: "数据预处理与特征工程负责人", location: null, start: "2023-01", end: "2024-01", isCurrent: false, background: "基于深度学习的非法出入境车辆检测系统研究（已顺利结项）。双向 LSTM 多任务学习：车辆分类 + 未来轨迹预测，准确率 70.59%、召回率 79.88%、F1 0.7211、AUC 0.76。PCA 降维（前 3 主成分 85.7% 方差）+ ARIMA 特征工程。合作方为信息学院（负责人郑耀祖），面试需诚实说明分工：负责特征工程与论文撰写，模型主体为信息学院同学所写。", raw: null, status: "confirmed" },
  { key: "proj_accessibility", type: "project", organization: "高瓴人工智能学院「AI+」创研课", department: "跨学院 6 人团队", role: "数据治理与地图可视化", location: "北京", start: "2024-09", end: "2025-06", isCurrent: false, background: "北京市无障碍设施地图及无障碍导航系统：36 万余条残联无障碍数据 ETL 清洗至 20 万+ 有效记录；Mapbox GL JS 交互式地图标注；改进型 Dijkstra（四维权重）路径规划；OSM 路网融合（26482 节点/58732 边）；GCJ-02→WGS84 坐标转换实现 94.6% 设施精准映射；海淀区试点。分工诚实说明：路径规划算法由钟山主导，负责数据清洗与地图标注。", raw: null, status: "confirmed" },
];

const outputs: OutputSeed[] = [
  { experienceKey: "intern_colliers", name: "商业地产数据系统（colliersdata.com）", outputType: "product", description: "从 0 到 1 搭建的商业地产数据系统：Next.js + Supabase（PostGIS）+ 高德地图 API。楼宇地图检索、数据管理后台、季度报告库、成交数据录入。", result: "457 栋北京办公楼宇 / 3103 条租赁成交 / 1178 条运营指标，服务 26 名团队成员；小时级人工中转 → 秒级自主检索。", publicUrl: "https://colliersdata.com" },
  { experienceKey: "intern_huaxia", name: "公募 REITs 行业研究报告", outputType: "report", description: "基础设施与不动产项目投资研究，合作或独立完成的行业日常研究与专题报告。", result: "为部门提供初步投资分析建议，支撑投资决策流程。", publicUrl: null },
  { experienceKey: "intern_kuaishou", name: "快手短剧（漫剧）小程序", outputType: "product", description: "从商业论证到上线的全流程产品孵化：独立完成 BRD/PRD，Axure 绘制核心交互原型。", result: "小程序已上线（漫剧品类；数据表现一般，需诚实陈述）。", publicUrl: null },
  { experienceKey: "proj_appraisal", name: "不动产估价报告（怀柔民宿 + 宅基地流转）", outputType: "report", description: "符合《房地产估价规范》GB/T 50291-2015 的完整估价报告；收益法 + 成本法 + 宅基地「三权分置」政策分析。", result: "民宿市场价值 464 万（收益法）/ 530.97 万（成本法）；宅基地流转 92.8 万；全国大学生不动产估价技能大赛优胜奖。", publicUrl: null },
  { experienceKey: "proj_lstm", name: "非法出入境车辆检测系统（LSTM）结项", outputType: "code", description: "BiLSTM 多任务学习（分类 + 轨迹预测）+ PCA/ARIMA 特征工程完整 pipeline，含代码与结项报告。", result: "acc 70.59% / recall 79.88% / F1 0.7211 / AUC 0.76；位置预测误差 50m 内。", publicUrl: null },
  { experienceKey: "proj_accessibility", name: "无障碍设施地图与导航 Demo", outputType: "product", description: "北京市无障碍设施可视化 + 短距离无障碍路径规划的网页 Demo（Mapbox GL JS + 改进 Dijkstra）。", result: "20 万+ 有效设施记录，海淀区试点；学术海报展示。", publicUrl: null },
  { experienceKey: "edu_bachelor", name: "毕业论文《资本化时序下基础设施供给时序对房价空间分异的动态影响》", outputType: "publication", description: "基于 296 个地级市 2010-2022 年面板数据的双向固定效应分析，指导教师曲卫东。", result: "核心发现：基础设施供给时序差异对房价空间分异具有显著影响，土地财政制度具调节作用。", publicUrl: null },
];

const skills: SkillSeed[] = [
  { name: "Python", category: "technical", proficiency: "advanced", evidence: "pandas/numpy/matplotlib 数据分析、requests 爬虫、sklearn 机器学习；多个科研与系统项目实战。" },
  { name: "Stata", category: "analytical", proficiency: "proficient", evidence: "PSM-DID、工具变量、面板数据回归。" },
  { name: "SQL / Supabase", category: "technical", proficiency: "working", evidence: "高力系统与个人 OS 的 PostgreSQL 查询；目标掌握窗口函数。" },
  { name: "AI 智能体开发（Vibe Coding）", category: "technical", proficiency: "advanced", evidence: "AI 辅助全栈开发，API 调用与 prompt engineering 经验；从 0 到 1 搭建商用系统。" },
  { name: "金融估值建模", category: "analytical", proficiency: "proficient", evidence: "不动产估价收益法/成本法、ABS 资产证券化、REITs 投研。" },
  { name: "空间计量经济学（DID）", category: "analytical", proficiency: "proficient", evidence: "双重差分、卫星遥感数据实证、NPP-VIIRS 夜间灯光。" },
  { name: "Next.js / React 全栈", category: "technical", proficiency: "working", evidence: "高力数据系统、个人 OS 开发；借助 AI 开发。" },
  { name: "深度学习", category: "technical", proficiency: "working", evidence: "LSTM 多任务学习、ResNet 图像分类、Fast R-CNN 目标检测（科研基金项目）。" },
  { name: "特征工程", category: "analytical", proficiency: "advanced", evidence: "PCA 降维、ARIMA 时序分析、Isolation Forest 异常检测。" },
  { name: "Mapbox / QGIS", category: "tool", proficiency: "proficient", evidence: "Mapbox GL JS 交互式地图、GeoJSON、空间数据可视化。" },
  { name: "数据 ETL", category: "analytical", proficiency: "proficient", evidence: "36 万条数据清洗（去重/坐标校验/属性标准化），坐标转换与空间连接。" },
  { name: "大型项目统筹", category: "business", proficiency: "advanced", evidence: "统筹「千人百村」等校级大型社会实践项目。" },
  { name: "央国企公文写作", category: "business", proficiency: "proficient", evidence: "MPA 数字化运营、海港集团行政文秘、多篇会议纪要与内部通讯。" },
  { name: "跨部门协作对接", category: "communication", proficiency: "proficient", evidence: "快手与研发前后端对接、跨学院科研合作、26 人团队系统服务。" },
  { name: "抗压与执行力", category: "other", proficiency: "advanced", evidence: "双线实习 + 考试备考 + 系统开发多线并行。" },
  { name: "自学能力", category: "other", proficiency: "advanced", evidence: "积极拥抱 AI 自学全栈与量化；不依赖外部培训。" },
  { name: "自驱力", category: "other", proficiency: "advanced", evidence: "主动发现问题、独立从 0 到 1 交付。" },
  { name: "Excel（VBA 与数据透视表）", category: "tool", proficiency: "proficient", evidence: "MVP 阶段纯 HTML + Excel 打造系统原型。" },
  { name: "Wind 金融终端", category: "tool", proficiency: "working", evidence: "金融数据检索与投研支持。" },
  { name: "英语（雅思 7.0）", category: "language", proficiency: "proficient", evidence: "雅思 7.0，阅读与检索外文资料。" },
  { name: "产品全生命周期管理", category: "business", proficiency: "working", evidence: "快手漫剧小程序从 BRD 到上线的完整流程。" },
  { name: "不动产估价与估值", category: "domain", proficiency: "proficient", evidence: "估价大赛收益法/成本法建模，全国优胜奖。" },
];

const certifications: CertificationSeed[] = [
  { name: "基金从业资格", issuer: "中国证券投资基金业协会", status: "issued", examDate: null, issueDate: "2025-01-01" },
  { name: "银行从业资格", issuer: "中国银行业协会", status: "issued", examDate: null, issueDate: "2025-01-01" },
  { name: "CFA Level 1", issuer: "CFA Institute", status: "preparing", examDate: "2026-11-01", issueDate: null },
  { name: "CPA（会计、财管、税法）", issuer: "中国注册会计师协会", status: "preparing", examDate: null, issueDate: null },
  { name: "机动车驾驶证", issuer: "", status: "issued", examDate: null, issueDate: null },
];

const resumes = [
  {
    title: "AI 产品 / Agent 简历",
    versionLabel: "AI产品方向",
    targetDirection: "AI 产品 / 商业化战略",
    content: `# 定位：AI 产品 / 商业化战略

## 三张牌
1. **从 0 到 1 独立交付**：Vibe Coding 从 0 到 1 搭建商业地产数据系统（高力国际），457 栋楼宇 / 3103 条成交 / 1178 条运营指标，服务 26 名成员
2. **AI 工具链驱动**：AI 智能体开发（MPA 文心一言智能体）、AI 辅助全栈开发、API 调用与 prompt engineering
3. **产品全生命周期**：快手短剧（漫剧）小程序从 BRD 到上线的完整产品流程

## 一句话记忆点
「不写一行手写代码也能把系统从 0 做到商用的人」`,
  },
  {
    title: "不动产金融 / REITs 简历",
    versionLabel: "不动产金融方向",
    targetDirection: "不动产金融 / 量化研究",
    content: `# 定位：不动产金融 / 公募 REITs 投研

## 三张牌
1. **不动产底层研究**：土地资源管理本硕（人大，保研第二），华夏基金公募 REITs 分析师实习，基础设施与不动产项目投资研究
2. **估值与金融建模**：不动产估价大赛（收益法/成本法，民宿估值 464 万）、金融估值建模、ABS 资产证券化研究
3. **空间数据能力**：ArcGIS / 空间计量 / 卫星遥感数据（NPP-VIIRS）实证

## 一句话记忆点
「懂不动产、会建模、能写报告的公募 REITs 候选人」`,
  },
  {
    title: "战略投资简历",
    versionLabel: "战略投资方向",
    targetDirection: "战略投资 / 数字化战略",
    content: `# 定位：战略投资 / 数字化战略

## 三张牌
1. **宏观视野与公文**：央国企公文写作、MPA 数字化运营（数据纳入中组部决策参考）、政策研究
2. **数据驱动洞察**：高力空间数据库 + 快手 A 站数据运营（Hive/Presto）归因分析
3. **效率提升实证**：小时级人工中转 → 秒级自主检索

## 一句话记忆点
「能用系统把行业研究做成产品的复合背景候选人」`,
  },
  {
    title: "长期提案：2027 秋招作战方案",
    versionLabel: "长期作战方案",
    targetDirection: null,
    content: `# 2027 秋招作战方案（2026-08 → 2027-12）

## 身份定位
人大土地资源管理硕士（保研第二）· 华夏基金公募 REITs 分析师 · 高力国际系统开发 · 中共党员 · CFA/CPA 备考中

## 三方向策略
1. **不动产金融 / 量化研究（主攻）**：华夏 REITs 深耕 + CFA 体系化 + 空间数据建模
2. **战略投资 / 数字化战略（第二）**：体制内核实习背书 + 公文/宏观视野
3. **AI 产品 / 商业化战略（第三）**：0 到 1 案例 + AI 工具链驱动

## 考试节奏
- 2026-11：CFA Level 1 · CPA（会计/财管/税法）
- 2027 秋招季前补齐核心资质

## 投递节奏
- 2027-06 简历与提案定稿
- 2027-09 秋招启动（内推为主，不海投）
- 2027-12 秋招收官`,
  },
];

const track = {
  name: "2027 秋招备战",
  description: "双线实习稳定 → 实力冲刺（CFA/CPA）→ 简历与提案定稿 → 秋招启动与收官",
  color: "teal",
  start: "2026-08-01",
  end: "2027-12-31",
};

const milestones: MilestoneSeed[] = [
  { title: "双线实习稳定期", status: "in_progress", importance: "normal", starts: "2026-08-01", target: "2026-08-31" },
  { title: "实力提升冲刺（CFA/CPA + AI 量化）", status: "planned", importance: "high", starts: "2026-09-01", target: "2026-12-31" },
  { title: "简历与提案定稿", status: "planned", importance: "normal", starts: "2027-01-01", target: "2027-06-30" },
  { title: "秋招启动", status: "planned", importance: "high", starts: "2027-08-01", target: "2027-09-30" },
  { title: "秋招收官", status: "planned", importance: "high", starts: "2027-10-01", target: "2027-12-31" },
];

// ---------------------------------------------------------------------------
// SQL 生成
// ---------------------------------------------------------------------------

function buildSql(ownerId: string): string {
  const stmts: string[] = [];
  stmts.push("do $$");
  stmts.push("declare");
  stmts.push(`  v_owner uuid := ${sqlStr(ownerId)};`);
  stmts.push(`  v_track_2027 uuid;`);
  for (const exp of experiences) stmts.push(`  v_exp_${exp.key} uuid;`);
  stmts.push("begin");
  stmts.push("");
  stmts.push("  -- career_profiles（单行，按 user_id upsert）");
  stmts.push(`  insert into public.career_profiles (user_id, professional_headline, career_summary, current_stage, target_graduation_date, target_recruitment_cycle, preferred_locations, preferred_work_types, risk_preferences, constraints_markdown, goals_markdown)
    values (v_owner, ${sqlStr(profile.headline)}, ${sqlStr(profile.summary)}, ${sqlStr(profile.currentStage)}, ${optDate(profile.graduation)}, ${sqlStr(profile.cycle)}, ${optArray(profile.locations)}, ${optArray(profile.workTypes)}, ${sqlStr(profile.risk)}, ${sqlStr(profile.constraints)}, ${sqlStr(profile.goals)})
    on conflict (user_id) do update set
      professional_headline = excluded.professional_headline,
      career_summary = excluded.career_summary,
      current_stage = excluded.current_stage,
      target_graduation_date = excluded.target_graduation_date,
      target_recruitment_cycle = excluded.target_recruitment_cycle,
      preferred_locations = excluded.preferred_locations,
      preferred_work_types = excluded.preferred_work_types,
      risk_preferences = excluded.risk_preferences,
      constraints_markdown = excluded.constraints_markdown,
      goals_markdown = excluded.goals_markdown;`);
  stmts.push("");

  stmts.push("  -- career_directions");
  for (const d of directions) {
    stmts.push(`  if not exists (select 1 from public.career_directions where user_id = v_owner and name = ${sqlStr(d.name)}) then`);
    stmts.push(`    insert into public.career_directions (user_id, name, description, priority, status, hypothesis_markdown, supporting_evidence_markdown, opposing_evidence_markdown, current_decision, review_date)
      values (v_owner, ${sqlStr(d.name)}, ${sqlStr(d.name)}, ${d.priority}, ${sqlStr(d.status)}, ${sqlStr(d.hypothesis)}, ${sqlStr(d.supporting)}, ${sqlStr(d.opposing)}, ${sqlStr(d.decision)}, ${optDate(d.reviewDate)});`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- experiences（自然键：organization + role）");
  for (const exp of experiences) {
    stmts.push(`  if not exists (select 1 from public.experiences where user_id = v_owner and organization = ${sqlStr(exp.organization)} and role = ${sqlStr(exp.role)}) then`);
    stmts.push(`    insert into public.experiences (user_id, experience_type, organization, department, role, location, start_date, end_date, is_current, background_markdown, raw_description_markdown, confidentiality_level, status)
      values (v_owner, ${sqlStr(exp.type)}, ${sqlStr(exp.organization)}, ${optStr(exp.department)}, ${sqlStr(exp.role)}, ${optStr(exp.location)}, ${optDate(exp.start)}, ${optDate(exp.end)}, ${exp.isCurrent ? "true" : "false"}, ${sqlStr(exp.background)}, ${exp.raw ? sqlStr(exp.raw) : "null"}, 'private', ${sqlStr(exp.status)})
      returning id into v_exp_${exp.key};`);
    stmts.push("  else");
    stmts.push(`    select id into v_exp_${exp.key} from public.experiences where user_id = v_owner and organization = ${sqlStr(exp.organization)} and role = ${sqlStr(exp.role)} limit 1;`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- experience_outputs（自然键：experience_id + name）");
  for (const out of outputs) {
    stmts.push(`  if not exists (select 1 from public.experience_outputs where user_id = v_owner and experience_id = v_exp_${out.experienceKey} and name = ${sqlStr(out.name)}) then`);
    stmts.push(`    insert into public.experience_outputs (user_id, experience_id, name, description_markdown, output_type, result_markdown, public_url, confidentiality_level)
      values (v_owner, v_exp_${out.experienceKey}, ${sqlStr(out.name)}, ${sqlStr(out.description)}, ${sqlStr(out.outputType)}, ${out.result ? sqlStr(out.result) : "null"}, ${out.publicUrl ? sqlStr(out.publicUrl) : "null"}, 'public_safe');`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- skills（自然键：name）");
  for (const s of skills) {
    stmts.push(`  if not exists (select 1 from public.skills where user_id = v_owner and name = ${sqlStr(s.name)}) then`);
    stmts.push(`    insert into public.skills (user_id, name, category, proficiency, evidence_markdown) values (v_owner, ${sqlStr(s.name)}, ${sqlStr(s.category)}, ${sqlStr(s.proficiency)}, ${s.evidence ? sqlStr(s.evidence) : "null"});`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- certifications（自然键：name）");
  for (const c of certifications) {
    stmts.push(`  if not exists (select 1 from public.certifications where user_id = v_owner and name = ${sqlStr(c.name)}) then`);
    stmts.push(`    insert into public.certifications (user_id, name, issuer, exam_date, issue_date, status) values (v_owner, ${sqlStr(c.name)}, ${sqlStr(c.issuer)}, ${optDate(c.examDate)}, ${optDate(c.issueDate)}, ${sqlStr(c.status)});`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- resume_versions（自然键：title；目标方向按名称解析）");
  for (const r of resumes) {
    const targetIdExpr = r.targetDirection ? `(select id from public.career_directions where user_id = v_owner and name = ${sqlStr(r.targetDirection!)} limit 1)` : "null";
    stmts.push(`  if not exists (select 1 from public.resume_versions where user_id = v_owner and title = ${sqlStr(r.title)}) then`);
    stmts.push(`    insert into public.resume_versions (user_id, title, version_label, content_markdown, target_direction_id, status)
      values (v_owner, ${sqlStr(r.title)}, ${sqlStr(r.versionLabel)}, ${sqlStr(r.content)}, ${targetIdExpr}, 'draft');`);
    stmts.push("  end if;");
  }
  stmts.push("");

  stmts.push("  -- career_tracks + career_milestones（2027 秋招备战路线）");
  stmts.push(`  if not exists (select 1 from public.career_tracks where user_id = v_owner and name = ${sqlStr(track.name)}) then`);
  stmts.push(`    insert into public.career_tracks (user_id, name, description, status, color, start_date, end_date, position) values (v_owner, ${sqlStr(track.name)}, ${sqlStr(track.description)}, 'active', ${sqlStr(track.color)}, ${optDate(track.start)}, ${optDate(track.end)}, 0) returning id into v_track_2027;`);
  stmts.push("  else");
  stmts.push(`    select id into v_track_2027 from public.career_tracks where user_id = v_owner and name = ${sqlStr(track.name)} limit 1;`);
  stmts.push("  end if;");
  for (const m of milestones) {
    stmts.push(`  if not exists (select 1 from public.career_milestones where user_id = v_owner and track_id = v_track_2027 and title = ${sqlStr(m.title)}) then`);
    stmts.push(`    insert into public.career_milestones (user_id, track_id, title, starts_on, target_date, status, importance) values (v_owner, v_track_2027, ${sqlStr(m.title)}, ${optDate(m.starts)}, ${optDate(m.target)}, ${sqlStr(m.status)}, ${sqlStr(m.importance)});`);
    stmts.push("  end if;");
  }
  stmts.push("");
  stmts.push("end $$;");
  return stmts.join("\n");
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

function runCli(args: string[]): string {
  return execFileSync("supabase", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function resolveOwnerId(): string {
  const fromEnv = process.env.OWNER_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  const email = process.env.OWNER_EMAIL?.trim() || OWNER_EMAIL_FALLBACK;
  const out = runCli(["db", "query", "--linked", "-o", "json", `select id from auth.users where email = ${sqlStr(email)} limit 1;`]);
  const match = out.match(/"id"\s*:\s*"([0-9a-f-]{36})"/);
  if (!match) throw new Error(`无法解析 owner（email=${email}）。请设置 OWNER_USER_ID 环境变量后重试。`);
  return match[1];
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ownerId = resolveOwnerId();
  const sql = buildSql(ownerId);
  if (dryRun) {
    process.stdout.write(sql + "\n");
    return;
  }
  const file = join(tmpdir(), `seed-career-${ownerId.slice(0, 8)}.sql`);
  writeFileSync(file, sql);
  try {
    const result = runCli(["db", "query", "--linked", "-o", "json", "-f", file]);
    // CLI 成功时退出码为 0；把关键错误信息透出。
    if (result.includes("ERROR") || result.includes("error")) {
      process.stderr.write(result + "\n");
    }
  } finally {
    rmSync(file, { force: true });
  }
  // 汇总
  const summary = runCli(["db", "query", "--linked", "-o", "json", `select
    (select count(*) from public.career_profiles where user_id = ${sqlStr(ownerId)}) as profiles,
    (select count(*) from public.career_directions where user_id = ${sqlStr(ownerId)}) as directions,
    (select count(*) from public.experiences where user_id = ${sqlStr(ownerId)}) as experiences,
    (select count(*) from public.experience_outputs where user_id = ${sqlStr(ownerId)}) as outputs,
    (select count(*) from public.skills where user_id = ${sqlStr(ownerId)}) as skills,
    (select count(*) from public.certifications where user_id = ${sqlStr(ownerId)}) as certifications,
    (select count(*) from public.resume_versions where user_id = ${sqlStr(ownerId)}) as resumes,
    (select count(*) from public.career_milestones where user_id = ${sqlStr(ownerId)}) as milestones;`]);
  const m = summary.match(/"profiles"\s*:\s*(\d+)[\s\S]*?"directions"\s*:\s*(\d+)[\s\S]*?"experiences"\s*:\s*(\d+)[\s\S]*?"outputs"\s*:\s*(\d+)[\s\S]*?"skills"\s*:\s*(\d+)[\s\S]*?"certifications"\s*:\s*(\d+)[\s\S]*?"resumes"\s*:\s*(\d+)[\s\S]*?"milestones"\s*:\s*(\d+)/);
  if (m) {
    console.log(`seed 完成：profiles=${m[1]} directions=${m[2]} experiences=${m[3]} outputs=${m[4]} skills=${m[5]} certifications=${m[6]} resumes=${m[7]} milestones=${m[8]}`);
  }
}

main();
