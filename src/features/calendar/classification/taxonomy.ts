export const primaryCategoryKeys = [
  "work_internship",
  "academic",
  "career",
  "exam",
  "research",
  "project",
  "life",
  "leisure",
  "travel",
  "health",
  "other",
] as const;

export const contextCategoryKeys = ["huaxia_fund", "colliers", "ruc", "personal_os"] as const;

export type PrimaryCategoryKey = (typeof primaryCategoryKeys)[number];
export type ContextCategoryKey = (typeof contextCategoryKeys)[number];
export type ManagedCategoryKey = PrimaryCategoryKey | ContextCategoryKey;
export type OutlookCategoryColor = "None" | `preset${number}`;

export type ManagedCalendarCategory = {
  key: ManagedCategoryKey;
  displayName: string;
  shortName: string;
  color: OutlookCategoryColor;
  kind: "primary" | "context";
  aiDescription: string;
  keywords: readonly string[];
  order: number;
};

export const managedCalendarCategories: readonly ManagedCalendarCategory[] = [
  { key: "work_internship", displayName: "领域·实习/工作", shortName: "实习 / 工作", color: "preset7", kind: "primary", aiDescription: "实习、公司、正式职业活动；华夏基金 REITs 投研、高力国际兼职、晨会周报", keywords: ["实习", "工作", "公司", "上班", "华夏基金", "高力国际", "北辰中心", "晨会", "周报", "REITs", "例会", "打卡"], order: 10 },
  { key: "academic", displayName: "领域·学业/论文", shortName: "学业 / 论文", color: "preset8", kind: "primary", aiDescription: "论文、课程、课堂、学校与导师沟通；人大课业与毕业论文", keywords: ["论文", "导师", "开题", "课程", "课堂", "学校", "人大", "答辩", "文献", "期末", "选课"], order: 20 },
  { key: "career", displayName: "领域·求职/职业", shortName: "求职 / 职业", color: "preset9", kind: "primary", aiDescription: "求职、面试、简历与职业规划；投递、面经、笔试与 offer 决策", keywords: ["求职", "面试", "简历", "秋招", "职业", "申请", "投递", "面经", "脉脉", "JD", "offer", "笔试"], order: 30 },
  { key: "exam", displayName: "领域·考试/证书", shortName: "考试 / 证书", color: "preset1", kind: "primary", aiDescription: "考试、证书、刷题与复习；CFA 学习备考", keywords: ["CFA", "估价师", "考试", "刷题", "复习", "证书", "报名"], order: 40 },
  { key: "research", displayName: "领域·研究/量化", shortName: "研究 / 量化", color: "preset5", kind: "primary", aiDescription: "量化、策略、回测及科研活动；LSTM 走私检测、无障碍导航实验", keywords: ["量化", "期权", "RQAlpha", "策略研究", "回测", "研究", "LSTM", "走私", "无障碍", "实验"], order: 50 },
  { key: "project", displayName: "领域·项目/创作", shortName: "项目 / 创作", color: "preset4", kind: "primary", aiDescription: "长期项目、软件开发与创作；Personal OS、AI Agent 学习与实践", keywords: ["Personal OS", "Codex", "Claude Code", "开发网站", "写代码", "写码", "项目", "创作", "AI Agent", "智能体", "建站"], order: 60 },
  { key: "life", displayName: "领域·生活/事务", shortName: "生活 / 事务", color: "preset12", kind: "primary", aiDescription: "生活管理、办事与个人事务", keywords: ["理发", "购物", "办事", "家务", "维修", "银行", "快递", "社保", "搬家", "水电"], order: 70 },
  { key: "leisure", displayName: "领域·娱乐/社交", shortName: "娱乐 / 社交", color: "preset24", kind: "primary", aiDescription: "影视、聚餐、朋友与娱乐活动", keywords: ["电影", "电视剧", "游戏", "聚餐", "朋友", "娱乐", "吃饭", "音乐", "徒步", "citywalk", "剧本杀"], order: 80 },
  { key: "travel", displayName: "领域·旅行/出行", shortName: "旅行 / 出行", color: "preset6", kind: "primary", aiDescription: "航班、铁路、酒店与旅行（含出差）", keywords: ["机票", "高铁", "机场", "酒店", "旅行", "旅游", "出差"], order: 90 },
  { key: "health", displayName: "领域·健康/运动", shortName: "健康 / 运动", color: "preset19", kind: "primary", aiDescription: "运动、体检、医疗与健康", keywords: ["健身", "跑步", "游泳", "体检", "医院", "看病", "锻炼", "训练", "理疗", "睡眠"], order: 100 },
  { key: "other", displayName: "领域·其他", shortName: "其他", color: "None", kind: "primary", aiDescription: "无法稳定归类的事件", keywords: [], order: 110 },
  { key: "huaxia_fund", displayName: "场景·华夏基金", shortName: "华夏基金", color: "preset7", kind: "context", aiDescription: "长期华夏基金 REITs 实习场景；晨会、周报、北辰中心", keywords: ["华夏基金", "北辰中心", "REITs", "晨会"], order: 210 },
  { key: "colliers", displayName: "场景·高力国际", shortName: "高力国际", color: "preset10", kind: "context", aiDescription: "长期高力国际工作场景；填报与楼盘维护", keywords: ["高力国际", "高力", "填报", "楼盘"], order: 220 },
  { key: "ruc", displayName: "场景·人大", shortName: "人大", color: "preset8", kind: "context", aiDescription: "中国人民大学学业场景；明德楼与课业", keywords: ["人大", "中国人民大学", "明德"], order: 230 },
  { key: "personal_os", displayName: "场景·Personal OS", shortName: "Personal OS", color: "preset4", kind: "context", aiDescription: "Personal OS 长期开发场景；Claude Code 与 Codex", keywords: ["Personal OS", "Life of HANG", "Claude Code"], order: 240 },
] as const;

export const primaryCalendarCategories = managedCalendarCategories.filter((category) => category.kind === "primary");

export function getManagedCalendarCategory(key: string) {
  return managedCalendarCategories.find((category) => category.key === key) ?? null;
}

export function categoryNamesForKeys(primaryKey: PrimaryCategoryKey | null, contextKeys: ContextCategoryKey[] = []) {
  const keys = [primaryKey, ...contextKeys].filter((key): key is ManagedCategoryKey => Boolean(key));
  return keys.flatMap((key) => {
    const category = getManagedCalendarCategory(key);
    return category ? [category.displayName] : [];
  });
}

/**
 * 生成供 AI 提示词复用的紧凑分类列表（key shortName：语义描述）。
 * 按 order 排序；primary 与 context 分组输出，便于模型同时理解领域与长期场景。
 */
export function formatManagedTaxonomyForPrompt(): string {
  const sorted = [...managedCalendarCategories].sort((a, b) => a.order - b.order);
  const primary = sorted.filter((category) => category.kind === "primary");
  const context = sorted.filter((category) => category.kind === "context");

  const render = (list: readonly ManagedCalendarCategory[]) =>
    list.map((category) => `${category.key}（${category.shortName}）：${category.aiDescription}`).join("\n");

  return `主分类（领域）：\n${render(primary)}\n\n场景分类（长期场所/组织，可与主分类叠加）：\n${render(context)}`;
}
