import type { KernelRequestContext, ContextGateDecision, PersonalOsModuleId } from "./types";

const personal = /(?:\b(?:my|mine|me)\b|我(?:的|现在|最近|之前|曾经|还|是|觉得自己)|觉得我|认为我|看待我|了解我|懂我|认识我|结合我|适合我|关于我|我这个人|个人|记录过)/i;
const mutation = /创建|新建|添加|加入|写入|修改|更新|改成|改为|删除|完成|安排|改期|取消|保存|归档|移动|移到|整理|归类|重命名|设为/;
const search = /搜索|查找|找到|之前|记录过|笔记|文件|日记|回顾|复盘/;
const calendar = /日程|日历|会议|空闲|有时间|明天|后天|上午|下午|晚上|下周|本周|这周|上周|周[一二三四五六日]|星期[一二三四五六日天]|\d{1,2}(?::\d{2}|点)/;
const tasks = /任务|待办|todo|截止|逾期|要做什么|有什么安排|有什么计划/iu;
const career = /职业|求职|实习|秋招|校招|岗位|简历|面试|offer|量化|REIT/i;
const retrospective = /最近.{0,12}(?:想|思考|关注|反复)|这段时间|观点.{0,8}变化|改变.{0,8}(?:看法|想法|观点)/;
const greeting = /^(?:你好|嗨|hello|hi|谢谢|感谢|好的|ok)[！!。.]?$/i;
const selfProfile = /我(?:觉得|是)(?:个|一个)?什么(?:样)?(?:的)?人|我是谁|我的(?:性格|画像|类型|特点|标签|为人|兴趣|性格特点)|(?:概括|总结|描述|评价|分析|介绍)(?:一下)?我|你觉得我是一个|你(?:会)?怎么(?:看待|评价|认识)我|了解我|认识我/;
const general = /^(?:什么是|解释(?:一下)?|为什么|如何理解|区别|翻译)/;
const currentReference = /这个|这些|这里|当前|本页|这页|刚才|上面|它|它们/;

const moduleForPath: Record<string, PersonalOsModuleId> = {
  notes: "notes",
  calendar: "calendar",
  tasks: "tasks",
  inbox: "inbox",
  career: "career",
  reviews: "reviews",
  files: "files",
  briefing: "briefing",
  projects: "projects",
  memory: "memory",
  shopping: "shopping",
  travel: "travel",
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function activeModule(currentPath?: string | null) {
  const segment = currentPath?.split("/").filter(Boolean)[0];
  return segment ? moduleForPath[segment] ?? null : null;
}

export function decideContextGate(input: KernelRequestContext): ContextGateDecision {
  const text = input.message.trim();
  const pageModule = activeModule(input.currentPath);

  if (input.surface === "notes-library") {
    const isAction = mutation.test(text);
    return {
      mode: isAction ? "action" : "targeted",
      complexity: isAction ? "moderate" : "moderate",
      likelyModules: ["notes"],
      suggestedSkills: [],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: isAction ? "mutation" : "retrieval",
    };
  }

  if (input.requiresCurrentSurface) {
    return {
      mode: input.usePersonalContext ? "targeted" : "local",
      complexity: "simple",
      likelyModules: [],
      suggestedSkills: [],
      needsPersonalData: Boolean(input.usePersonalContext),
      needsTools: Boolean(input.usePersonalContext),
      needsCurrentSurface: true,
      reasonCode: "current_surface",
    };
  }

  const local =
    input.hasCurrentSurface &&
    (input.surface === "notes" || /这段|当前|本文|上面/.test(text)) &&
    !input.usePersonalContext;
  if (local) {
    return {
      mode: "local",
      complexity: "simple",
      likelyModules: [],
      suggestedSkills: [],
      needsPersonalData: false,
      needsTools: false,
      needsCurrentSurface: true,
      reasonCode: "current_surface",
    };
  }

  if (greeting.test(text) || (general.test(text) && !personal.test(text) && !search.test(text))) {
    return {
      mode: "none",
      complexity: "simple",
      likelyModules: [],
      suggestedSkills: [],
      needsPersonalData: false,
      needsTools: false,
      needsCurrentSurface: false,
      reasonCode: greeting.test(text) ? "conversation_only" : "general_knowledge",
    };
  }

  const modules: PersonalOsModuleId[] = [];
  if (calendar.test(text)) modules.push("calendar");
  if (tasks.test(text)) modules.push("tasks");
  if (career.test(text)) modules.push("career");
  if (/笔记|日记|记录过|写过/.test(text)) modules.push("notes");
  if (/文件|附件|pdf/i.test(text)) modules.push("files");
  if (/复盘|review/i.test(text)) modules.push("reviews");
  if (/项目|project/i.test(text)) modules.push("projects");
  if (/购物|待购|购买|预算|冷静期/i.test(text)) modules.push("shopping");
  if (/旅行|旅游|行程|目的地|路线|景点/i.test(text)) modules.push("travel");
  if (/Briefing|简报|RSS/i.test(text)) modules.push("briefing");
  if (/我现在|我的情况|偏好|决定|方向/.test(text)) modules.push("memory");

  // Pronouns such as “这个/这里” should resolve against the workspace the user
  // is actually looking at. It is a fallback only; explicit nouns still win.
  if (!modules.length && pageModule && currentReference.test(text)) modules.push(pageModule);

  const isMutation = mutation.test(text) && !/(?:有什么|什么|哪些|我的)安排/.test(text);
  if (isMutation) {
    return {
      mode: "action",
      complexity: "moderate",
      likelyModules: unique(modules.length ? modules : pageModule ? [pageModule] : ["tasks"]),
      suggestedSkills: calendar.test(text) || pageModule === "calendar" ? ["time-planning"] : [],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: "mutation",
    };
  }

  if (retrospective.test(text)) {
    const changing = /变化|改变|看法/.test(text);
    const retrospectiveModules: PersonalOsModuleId[] = changing
      ? ["memory", "notes"]
      : ["memory", "notes", "reviews"];
    return {
      mode: "cross_module",
      complexity: "deep",
      likelyModules: unique(retrospectiveModules),
      suggestedSkills: [changing ? "belief-change" : "retrospective-thinking"],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: "personal_analysis",
    };
  }

  if (selfProfile.test(text)) {
    return {
      mode: "cross_module",
      complexity: "deep",
      likelyModules: ["memory", "notes", "reviews"],
      suggestedSkills: ["retrospective-thinking"],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: "self_profile",
    };
  }

  if (career.test(text) && personal.test(text)) {
    return {
      mode: "cross_module",
      complexity: "deep",
      likelyModules: unique(["career", "memory"]),
      suggestedSkills: ["career-strategy", "decision-support"],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: "cross_domain",
    };
  }

  if (modules.length || personal.test(text) || search.test(text)) {
    return {
      mode: "targeted",
      complexity: modules.length > 1 ? "moderate" : "simple",
      likelyModules: unique(modules.length ? modules : ["memory"]),
      suggestedSkills: [],
      needsPersonalData: true,
      needsTools: true,
      needsCurrentSurface: false,
      reasonCode: calendar.test(text) ? "time_context" : search.test(text) ? "retrieval" : "personal_fact",
    };
  }

  return {
    mode: "none",
    complexity: "simple",
    likelyModules: [],
    suggestedSkills: [],
    needsPersonalData: false,
    needsTools: false,
    needsCurrentSurface: false,
    reasonCode: "general_knowledge",
  };
}
