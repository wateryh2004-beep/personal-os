/** Presentation only. Stored prompts, answer snapshots and search input stay untouched.
 * Separate only observed editorial templates; never truncate at a question mark,
 * discard unknown prose, or substitute the canonical question for an override.
 */
export type PromptNote = { label: string; text: string };
export type InterviewPromptPresentation = {
  title: string;
  question: string;
  conditions: string[];
  notes: PromptNote[];
  original: string;
};

type Span = { start: number; end: number; kind: "note" | "condition" | "prefix"; label: string; text: string };
const typeName = "(?:简历|动机|行为|情景|情境|知识|财务|专业知识|专业|会计|估值|经营案例|投资案例|商业案例|案例|反问|动机匹配|沟通表达|综合)";
const boundary = "(?:^|(?<=[。！？；;，,\\n]))[ \t]*";
const observedTypeLabels = ["business_commercial", "策略产品技术/数据与判断面", "交割价格桥与基金份额尽调", "动机、经历迁移与压力追问", "situational", "困境资产处置与不确定性", "知识/商业判断学习题", "接力基金决策与治理", "基金绩效与份额投资", "简历深挖/结果复盘", "处置/不确定性决策", "会计基础与财务质量", "企业价值与权利归属", "资产收益/有限期限", "投资尽调与证据判断", "SQL/数据质量", "官方咨询定量案例", "简历与能力迁移", "知识与投资案例", "组合与穿透风险", "经营/投资案例", "会计与信用基础", "估值/压力测试", "会计/财务质量", "投资与审查案例", "简历/能力迁移", "份额投资定价", "简历与行为"];
const knownTypes = observedTypeLabels.join("|");
const typePattern = new RegExp(`${boundary}类型[：:]\\s*(?:${knownTypes}|${typeName}(?:\\s*[/／、，]\\s*${typeName})*)(?=[。；;，,\\s]|$)[。；;，,]?`, "gu");
const difficultyPattern = new RegExp(`${boundary}难度(?:[：:]\\s*(?:简单|中等|困难|[低中高])|\\s*[：:]?\\s*[1-5]\\s*[/／]\\s*5)(?=[。；;，,\\s]|$)[。；;，,]?`, "gu");
const genericAssumption = "题设数字均为假设；真实业务缺合同、时点、准则或现金口径时，应先澄清相关项，不擅自补齐。";
const cashflowReminder = "先问两套现金流是否扣税、资本开支和营运资本，是否包含借还款、是否为预测可分配现金；一句“偿债前”不能证明已经是FCFF。本题数字例子另给明确假设。";
const practiceVersions = "分别练南方REITs研究/中联资产管理与百度/美团产品版本。";
const jobNotes = [
  "适用南方、中联、诚通基金及咨询；难度：基础到中。",
  "适用中联资产管理，也可练咨询盈利改善；难度中高。",
  "适用诚通资产项目管理；难度高。",
  "南方REITs研究、中联资产管理、中信金资致远估值可复用；",
  "原创交易案例；南方承做、诚通基金投资、中联研判；",
  "职责连接：历史遗留项目风险、价值/损失评估、资产瑕疵处理与盘活处置；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：资产价值分析、评估、抵债资产处理、实物踏勘与瑕疵识别；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：尽调、方案设计、申报与中介协调；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：上市公司基本面、财务预测、估值与投资建议；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：前期研判、运营提升、工程改造、财税审查、信披与现金流安排；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：行业研究、尽调、可行性分析及募投管退支持；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "职责连接：底层资产运营盈利、估值与一二级市场研究；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "适用：股权投资投前分析或投后风险模拟，建投投资／建投华文职责参考；非公司真题。",
  "适用：美团BA经营分析/商品策略；难度4/5；不是DS算法岗专属题。"
];
const teamNote = "没有具体业务团队时，先基于JD讲能力，等深挖时再核对业务；不必开场询问所有条件。";

export function presentInterviewPrompt(raw: string, shortTitle?: string | null): InterviewPromptPresentation {
  const spans: Span[] = [];
  const add = (pattern: RegExp, kind: Span["kind"], label: string, content?: (match: RegExpExecArray) => string) => {
    for (const match of raw.matchAll(pattern)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (!spans.some((span) => start < span.end && end > span.start)) spans.push({ start, end, kind, label, text: content ? content(match) : match[0].trim() });
    }
  };
  // Clarifications can contain material accounting assumptions and the debtor's
  // viewpoint. They remain visible conditions unless this exact observed section
  // is an explanation of why the cash-flow label alone is insufficient.
  for (const match of raw.matchAll(/(?:^|\n[ \t]*\n)需先澄清[：:][ \t]*([^\n]+)(?=\n[ \t]*\n|$)/gu)) {
    const body = match[1].trim();
    const explanation = body === cashflowReminder;
    spans.push({ start: match.index!, end: match.index! + match[0].length, kind: explanation ? "note" : "condition", label: explanation ? "解题提醒" : "条件与口径", text: body });
  }
  add(/^\s*题干[：:]\s*/gu, "prefix", "题干");
  // Whole observed strings only: an "适用" field may itself state CAS/date
  // requirements, and a job name does not make an unknown suffix dispensable.
  for (const note of jobNotes) {
    let start = raw.indexOf(note);
    while (start !== -1) {
      const end = start + note.length;
      if (!spans.some(span => start < span.end && end > span.start)) spans.push({ start, end, kind: "note", label: "岗位关联", text: note });
      start = raw.indexOf(note, end);
    }
  }
  add(typePattern, "note", "题目分类");
  add(difficultyPattern, "note", "难度");
  const hasTemplate = spans.some((span) => span.kind === "note");
  add(new RegExp(`${boundary}适用岗位[：:][\\p{L}& ]+·(?:项目管理|资产评估|REITs承做|投资四部研究|资产管理|投资部主办|REITs研究)（2028届条件准备目标）。`, "gu"), "note", "岗位关联");
  add(new RegExp(`${boundary}适用[：:][^\\n。！？；;：:，,0-9]+，2027官方职责参考，2028资格待核；全为模拟。`, "gu"), "note", "岗位关联");
  add(new RegExp(`${boundary}适用[：:][^\\n。！？；;：:，,0-9]+(?:原创模拟；2027北京职责参考，2028资格未知|的模拟练习，2027北京JD参考，2028资格未发布)。`, "gu"), "note", "岗位关联");
  // A company/role tag ends at the field boundary; unknown text after it stays.
  add(new RegExp(`${boundary}适用[：:][\\p{L}& ]+·(?:Associate Management Consultant|Associate Consultant|Associate|Business Analyst|AI产品经理|产品经理)(?:（(?:统招入口|入口待确认)）)?(?=[。\\n]|$)[。]?`, "gu"), "note", "岗位关联");
  for (const note of jobNotes.filter(note => note.startsWith("职责连接："))) {
    const task = note.slice("职责连接：".length, note.indexOf("；本题"));
    add(new RegExp(`${boundary}新增适用[：:][^\\n。！？；;：:，,0-9]+；结合${task}训练。数字仍为教学假设。`, "gu"), "note", "岗位关联");
  }
  add(new RegExp(genericAssumption, "gu"), "note", "使用提醒");
  if (hasTemplate) {
    add(new RegExp(practiceVersions, "gu"), "note", "练习建议");
    add(new RegExp(teamNote, "gu"), "note", "练习建议");
  }
  // These source phrases are standalone. Do not consume the rest of the CAS
  // sentence or the Talbot supplement: dates, taxes and no-residual assumptions
  // remain part of the question, even when they follow an editorial prefix.
  add(/^官方Talbot Trucks第2—3题改写。/gu, "note", "来源说明");
  add(/^原创基础训练；/gu, "note", "来源说明");
  add(/^原创债转股教学题[：:]/gu, "note", "来源说明");
  add(/这些补充条件不冒充官方题面。/gu, "note", "来源说明");
  spans.sort((a, b) => a.start - b.start);
  let question = "";
  let cursor = 0;
  for (const span of spans) { question += raw.slice(cursor, span.start); if (span.kind === "condition" || raw[span.start] === "\n") question += "\n\n"; cursor = span.end; }
  question += raw.slice(cursor);
  question = question.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
  // A metadata-only/unknown record must never become a fabricated blank question.
  if (!question) return { title: shortTitle?.trim() || "面试题", question: raw, conditions: [], notes: [], original: raw };
  const title = shortTitle?.trim();
  return {
    title: title && title.length <= 48 && !/(?:题干|类型|难度|适用岗位|职责连接)[：:]/u.test(title) ? title : "面试题",
    question,
    conditions: spans.filter((span) => span.kind === "condition").map((span) => span.text),
    notes: spans.filter((span) => span.kind === "note").map(({ label, text }) => ({ label, text })),
    original: raw,
  };
}
