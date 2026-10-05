import { describe, expect, it } from "vitest";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";

const intro = "题干：用约90秒介绍自己，并说明哪些真实经历支持你胜任当前岗位。类型：简历/动机；难度：中。分别练南方REITs研究/中联资产管理与百度/美团产品版本。没有具体业务团队时，先基于JD讲能力，等深挖时再核对业务；不必开场询问所有条件。";
const cashflow = "面试官给你两套现金流：一套在债务偿付前，另一套已扣利息并考虑净借款。你分别用什么折现率？算出来是企业价值还是股权价值？";
const cashflowMeta = "\n\n类型：会计／估值／经营案例。难度3/5。题设数字均为假设；真实业务缺合同、时点、准则或现金口径时，应先澄清相关项，不擅自补齐。\n\n适用岗位：南方基金·REITs研究（2028届条件准备目标）。职责连接：底层资产运营盈利、估值与一二级市场研究；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。";
const talbot = "官方Talbot Trucks第2—3题改写。每车每年行驶10万公里、使用4年。柴油车购价10万欧元，期末残值为零；柴油消耗30升/百公里、每升1欧元；电车消耗100千瓦时/百公里、每千瓦时0.15欧元。柴油车/电车每年维护费分别5000/3000欧元，其他费10000/5000欧元，两者司机成本均每月3000欧元。先比较年化总拥有成本，再求电车与柴油车总拥有成本相同时的最高购价。为使练习口径完整，补充假设电车也无残值，保留图表“其他费”中已包含的税费，忽略融资、折现、图表以外新增的税收变化与充电设施投入；这些补充条件不冒充官方题面。";
const warranty = "原创基础训练；以2026年度、未提前执行新列报准则的普通非金融企业为例，按中国企业会计准则（CAS）处理；除特别说明外忽略增值税、所得税及其他事项。制造商本年已出售一批产品，合同附带保证产品符合约定质量的基本保修。本年售出1000件同类产品，可靠历史及当前资料表明，每件有80%概率无需修理、15%概率发生200元小修、5%概率发生1000元大修；按整批同类义务评估，经济利益流出很可能且金额能可靠计量。忽略折现。年内未发生维修。另有一项金额10万元、经济利益流出仅“可能”且不属极小可能的未决索赔。如何确认与披露？次年实际支付维修费7万元怎么办？";

describe("lossless interview prompt presentation", () => {
  it("separates the exact self-introduction screenshot without losing its 90-second requirement", () => {
    const display = presentInterviewPrompt(intro, "自我介绍");
    expect(display.title).toBe("自我介绍");
    expect(display.question).toBe("用约90秒介绍自己，并说明哪些真实经历支持你胜任当前岗位。");
    expect(display.notes.map(note => note.text).join("\n")).toContain("分别练南方REITs研究");
    expect(display.original).toBe(intro);
  });
  it("keeps both cash-flow questions and folds only classification/editorial/job notes", () => {
    const display = presentInterviewPrompt(cashflow + cashflowMeta, "现金流与折现率");
    expect(display.question).toBe(cashflow);
    expect(display.question.match(/？/g)).toHaveLength(2);
    expect(display.notes.map(note => note.text).join("\n")).toContain("2028届条件准备目标");
    expect(display.original).toBe(cashflow + cashflowMeta);
  });
  it("keeps the observed FCFF clarification as accessible explanatory material", () => {
    const reminder = "先问两套现金流是否扣税、资本开支和营运资本，是否包含借还款、是否为预测可分配现金；一句“偿债前”不能证明已经是FCFF。本题数字例子另给明确假设。";
    const display = presentInterviewPrompt(cashflow + "\n\n需先澄清：" + reminder);
    expect(display.question).toBe(cashflow);
    expect(display.notes).toContainEqual({ label: "解题提醒", text: reminder });
  });
  it("preserves all Talbot calculation assumptions, including supplemental tail conditions", () => {
    const display = presentInterviewPrompt(talbot, "车辆总拥有成本");
    for (const required of ["10万公里", "4年", "30升/百公里", "0.15欧元", "5000/3000", "10000/5000", "每月3000", "电车也无残值", "已包含的税费", "忽略融资、折现", "充电设施投入"]) expect(display.question).toContain(required);
    expect(display.notes.map(note => note.text).join("\n")).toContain("这些补充条件不冒充官方题面");
    expect(display.original).toBe(talbot);
  });
  it("retains CAS dates, probabilities, recognition conditions and tax exclusions", () => {
    const conditions = "本题基本质量保修，不是单独销售延保服务；整批义务很可能流出且能可靠计量，税与折现忽略。未决索赔仅可能且非极小。";
    const raw = warranty + "\n\n需先澄清：" + conditions + "\n\n类型：知识/财务；难度2/5。适用：风险合规岗，2027官方职责参考，2028资格待核；全为模拟。";
    const display = presentInterviewPrompt(raw, "产品保修与预计负债");
    for (const required of ["2026年度", "未提前执行", "CAS", "增值税、所得税", "80%", "15%", "5%", "可靠计量", "忽略折现", "7万元"]) expect(display.question).toContain(required);
    expect(display.conditions).toEqual([conditions]);
    expect(display.original).toBe(raw);
  });
  it("keeps debtor-only viewpoint and uncertain clarifications visible", () => {
    const condition = "确认是债务直接换普通权益，还是先现金增资再还债；工具实质、终止确认、费用与税；本题仅站债务人视角，不猜债权人账面价值或损益。";
    const raw = "2026年度，200万元债务转为普通股。三表怎么变？为什么不等于收到200现金？\n\n需先澄清：" + condition;
    const display = presentInterviewPrompt(raw);
    expect(display.question).toContain("为什么不等于收到200现金？");
    expect(display.conditions).toEqual([condition]);
    expect(display.notes).toEqual([]);
  });
  it.each([
    "You are given an underperforming property / mall business. How would you diagnose it and propose improvements?",
    "What would you like to ask us at the end of the interview?",
    "借款类型：普通股不是债务。难度取决于1000万元的资产约束，你怎么判断？",
    "第一问？第二问？题设补充：电车无残值，忽略折现。",
    "这里的类型：知识产权费用，应如何计量？",
    "未知来源字段：保留。模型假设：100−20−15=65。",
  ])("leaves unknown or ordinary question prose unchanged: %s", raw => {
    expect(presentInterviewPrompt(raw).question).toBe(raw);
    expect(presentInterviewPrompt(raw).original).toBe(raw);
  });
  it("applies the same rule to polluted canonicals, without requiring an override", () => {
    expect(presentInterviewPrompt(cashflow + cashflowMeta).question).toBe(cashflow);
  });
  it("never returns an empty invented question for a metadata-only record", () => {
    const raw = "类型：知识。难度3/5。";
    expect(presentInterviewPrompt(raw).question).toBe(raw);
  });
});

it("does not hide scenario assumptions under broad applicability or practice wording", () => {
  for (const raw of ["计算收益。适用：CAS 22，债务账面价值100，公允价值80；请计算债务重组收益？", "计算成本。类型：知识。分别练税率25%、无残值版本。"] ) {
    expect(presentInterviewPrompt(raw).question).toContain(raw.includes("CAS") ? "CAS 22" : "税率25%");
  }
});
it("keeps modified cash-flow clarification visible instead of guessing its scope", () => {
  const raw = "现金流如何折现？\n\n需先澄清：先问两套现金流是否扣税、资本开支和营运资本，是否包含借还款、是否为预测可分配现金；一句“偿债前”不能证明已经是FCFF。本题数字例子另给明确假设。本题税率25%，资本开支100。";
  expect(presentInterviewPrompt(raw).conditions.join("\n")).toContain("本题税率25%，资本开支100。");
});

it("leaves multiline or ambiguous clarification paragraphs in their original order", () => {
  const raw = "第一问：计算收益？\n\n需先澄清：以债务人视角。\n第二问：分录是什么？";
  expect(presentInterviewPrompt(raw).question).toBe(raw);
});
it("does not classify financial assumptions as a job-responsibility note", () => {
  const raw = "计算收益。职责连接：税率25%，资产1000；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。";
  expect(presentInterviewPrompt(raw).question).toBe(raw);
});

it.each([
  "请制定实施方案。适用岗位：产品经理；必须先访谈用户，再设计验证实验。",
  "解释判断依据。适用岗位：财务分析；使用2025年现金流和2026年预测。",
  "说明处理步骤。职责连接：先核对合同，再确认收入；本题基础技能与该任务的联系为分析判断，不等同于已知面试考纲。",
  "比较两个项目，难度高，预算相同，请选择并解释。",
])("retains unknown qualitative and date requirements: %s", raw => {
  expect(presentInterviewPrompt(raw).question).toBe(raw);
});

it.each([
  "适用岗位：产品经理，必须先访谈用户（2028届条件准备目标）。",
  "适用：财务·必须忽略所得税。",
])("does not guess unknown role-label prose is metadata: %s", raw => {
  expect(presentInterviewPrompt(raw).question).toBe(raw);
  expect(presentInterviewPrompt(raw).notes).toEqual([]);
});
