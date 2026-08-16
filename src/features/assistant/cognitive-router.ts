import type { AssistantSurface } from "./types";
import { getCognitiveRecipe } from "./recipes/registry";
import type { CognitiveComplexity, CognitiveRecipe, RetrievalCapability } from "./recipes/types";

export type CognitiveRoute = {
  recipe: CognitiveRecipe;
  complexity: CognitiveComplexity;
  requiresReasoning: boolean;
  preferredDomains: string[];
  capabilities: RetrievalCapability[];
  queryConcepts: string[];
  timeWindow: { days: number; expandedDays: number; minimumRecentNotes: number };
  confidence: number;
  signals: string[];
};

const stopWords = new Set([
  "我", "我的", "你", "帮我", "请", "一下", "最近", "近期", "过去", "之前", "现在", "关于",
  "什么", "哪些", "怎么", "如何", "为什么", "是不是", "是否", "思考", "想法", "笔记", "记录", "内容",
  "主要", "真正", "反复", "发生", "进行", "一个", "这个", "那个", "一些", "有没有", "看看", "找出",
]);

export function extractQueryConcepts(message: string, max = 6) {
  const normalized = message
    .replace(/[“”‘’「」《》【】()（）\[\]，。！？、；：,.!?;:/\\]/g, " ")
    .replace(/(我在思考什么|我主要在关注什么|知识范围|全部笔记|优先检索|可打开的来源|证据不足|明确说明|为结论附上|最近|近期|过去|之前|现在|这段时间|我想知道|告诉我|帮我|请问|查一下|找一下|Notes?)/gi, " ")
    .trim();
  const pieces = normalized.match(/[A-Za-z][A-Za-z0-9+._-]{1,}|[\u4e00-\u9fff]{2,10}|\d{2,}/g) ?? [];
  const expanded = pieces.flatMap((piece) => {
    if (/^[\u4e00-\u9fff]{7,}$/.test(piece)) {
      return piece.split(/(?:的|了|和|与|对|在|是|把|从|中|里|该|能|会)/).filter(Boolean);
    }
    return [piece];
  });
  return [...new Set(expanded.map((part) => part.trim()).filter((part) => part.length >= 2 && !stopWords.has(part)))].slice(0, max);
}

const mutationPattern = /(?:创建|新建|添加|写入|修改|更新|改到|改成|改为|删除|完成|移动|安排|改期|延期|取消|保存|归档)(?:.{0,20})(?:日程|会议|任务|待办|笔记|记忆|项目|文件|提醒)?/;
const identityRecall = /你(?:知道|了解|记得).{0,8}(?:我是谁|我的情况|关于我)|你对我(?:知道|了解)多少/;
const selfProfile = /我(?:觉得|是)(?:个|一个)?什么(?:样)?(?:的)?人|我是谁|我的(?:性格|画像|类型|特点|标签|为人|兴趣|性格特点)|(?:概括|总结|描述|评价|分析|介绍)(?:一下)?我|你觉得我是一个|你(?:会)?怎么(?:看待|评价|认识)我|了解我|认识我/;
const patterns: Array<{ recipe: CognitiveRecipe; patterns: RegExp[]; weight: number }> = [
  { recipe: "contradiction_detection", patterns: [/矛盾|冲突|前后不一|自相矛盾|不一致|相互抵触/], weight: 10 },
  { recipe: "belief_change", patterns: [/改变.{0,8}(?:看法|想法|观点|判断|方向)|(?:看法|想法|观点|判断).{0,8}(?:发生)?变化|为什么放弃|不再(?:认为|考虑|选择)|从.{1,12}转向/], weight: 10 },
  { recipe: "retrospective_thinking", patterns: [/最近.{0,12}(?:思考|关注|在想|反复出现|主要想)|过去.{0,8}(?:一周|几天|一个月).{0,8}(?:思考|关注)|反复出现的主题|(?:最近|这段时间).{0,12}(?:反复纠结|真正的问题)|结合.{0,8}最近.{0,8}笔记/], weight: 10 },
  { recipe: "open_loops", patterns: [/尚未处理|未解决|没处理|没完成|开放事项|open loops?|还欠什么|有哪些行动事项|等待项/i], weight: 9 },
  { recipe: "trajectory_analysis", patterns: [/趋势|轨迹|演变|进展如何|方向.{0,6}(?:变化|发展)|这段时间.{0,8}(?:推进|变化)/], weight: 9 },
  { recipe: "next_best_action", patterns: [/下一步|接下来.{0,8}(?:做什么|该做)|现在最该|优先做什么|最佳行动/], weight: 9 },
  { recipe: "decision_support", patterns: [/决策|取舍|权衡|该不该|要不要|怎么选|选择哪个|利弊/], weight: 8 },
  { recipe: "career_strategy", patterns: [/职业|求职|实习|秋招|校招|岗位|简历|面试|offer|职业路线|职业方向|量化/i], weight: 7 },
  { recipe: "time_planning", patterns: [/空闲|日程|时间安排|时间段|本周计划|今天计划|明天计划|什么时候做|如何安排时间/], weight: 7 },
  { recipe: "semantic_recall", patterns: [/我记得|大概提过|类似的|相关的旧笔记|以前怎么想|模糊记得|找回/], weight: 6 },
  { recipe: "factual_lookup", patterns: [/搜索|查找|找到|哪篇|在哪里|提到过|记录过|查一下/], weight: 5 },
];

function explicitWindow(message: string, fallback: number) {
  const day = message.match(/(?:最近|过去|近)(\d{1,3})天/);
  if (day) return Math.min(365, Math.max(1, Number(day[1])));
  const week = message.match(/(?:最近|过去|近)(\d{1,2})周/);
  if (week) return Math.min(365, Math.max(7, Number(week[1]) * 7));
  const month = message.match(/(?:最近|过去|近)(\d{1,2})个?月/);
  if (month) return Math.min(730, Math.max(30, Number(month[1]) * 30));
  if (/这周|本周|上周/.test(message)) return 10;
  if (/最近一个月|过去一个月|近一个月/.test(message)) return 30;
  return fallback;
}

export function routeCognitiveTask(input: {
  message: string;
  surface: AssistantSurface | "now";
  hasCurrentDocument?: boolean;
  defaultRetrospectiveWindowDays?: number;
}): CognitiveRoute {
  const message = input.message.trim();
  let recipe: CognitiveRecipe = input.surface === "notes" && input.hasCurrentDocument ? "current_document" : "factual_lookup";
  let confidence = 0.45;
  const signals: string[] = [];

  if (identityRecall.test(message)) {
    recipe = "semantic_recall";
    confidence = 0.96;
    signals.push("identity_context");
  } else if (selfProfile.test(message)) {
    recipe = "retrospective_thinking";
    confidence = 0.96;
    signals.push("self_profile");
  } else if (mutationPattern.test(message) && !/(改变.{0,8}(?:看法|观点|想法)|变化)/.test(message)) {
    recipe = "mutation_request";
    confidence = 0.94;
    signals.push("explicit_mutation");
  } else {
    let best = 0;
    for (const rule of patterns) {
      const hits = rule.patterns.filter((pattern) => pattern.test(message)).length;
      const score = hits * rule.weight;
      if (score <= best) continue;
      best = score;
      recipe = rule.recipe;
      confidence = Math.min(0.96, 0.58 + hits * 0.16);
      signals.splice(0, signals.length, rule.recipe);
    }
  }

  const definition = getCognitiveRecipe(recipe);
  const configuredWindow = recipe === "retrospective_thinking" && input.defaultRetrospectiveWindowDays
    ? input.defaultRetrospectiveWindowDays
    : definition.defaultTimeWindowDays;
  const days = explicitWindow(message, configuredWindow);
  const preferredDomains = /职业|求职|实习|岗位|面试|简历|量化/.test(message)
    ? ["career", "notes", "reviews", "memory"]
    : /日程|任务|待办|时间|安排/.test(message)
      ? ["calendar", "tasks", "notes"]
      : ["notes", "reviews", "memory", "career"];
  return {
    recipe,
    complexity: definition.complexity,
    requiresReasoning: definition.complexity === "analytical",
    preferredDomains,
    capabilities: definition.retrievalOrder,
    queryConcepts: extractQueryConcepts(message),
    timeWindow: {
      days,
      expandedDays: Math.max(days, definition.expandedTimeWindowDays),
      minimumRecentNotes: definition.minimumRecentNotes,
    },
    confidence,
    signals,
  };
}
