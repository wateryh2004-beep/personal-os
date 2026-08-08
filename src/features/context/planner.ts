import type { ContextPlan, PersonalContextRequest } from "./types";
import type { SearchDomain } from "@/features/search/types";
const personal =
  /结合我的情况|根据我的情况|我的情况|适合我|对我|我最近|我现在|我之前|我过去|我的职业|我的经历|我该怎么办|帮我分析/;
const time =
  /今天|明天|后天|本周|这周|下周|最近|过去|接下来|日程|时间|什么时候|安排|计划|截止|逾期/;
const retrospective =
  /最近几天|这周|上周|最近一个月|过去一个月|这段时间|最近|过去.*发生了什么|重点.*变化|判断.*变化|主要推进/;
const career =
  /职业|工作|求职|实习|秋招|校招|岗位|简历|面试|offer|银行|央企|公务员|量化|产品/;
export function buildFallbackContextPlan(
  request: PersonalContextRequest,
): ContextPlan {
  const message = request.message.trim();
  const careerIntent = career.test(message);
  const timeIntent = time.test(message);
  const domains: SearchDomain[] = careerIntent
    ? ["career", "notes", "tasks", "calendar", "files"]
    : timeIntent
      ? ["tasks", "calendar", "notes"]
      : ["notes", "career", "tasks", "calendar", "files"];
  const seed = message
    .replace(/[，。！？、,.!?]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 6)
    .join(" ")
    .slice(0, 80);
  return {
    intent: careerIntent
      ? "career_analysis"
      : timeIntent
        ? "time_planning"
        : personal.test(message)
          ? "personal_analysis"
          : request.surface === "notes"
            ? "current_document"
            : "general",
    includeWorkingMemory: careerIntent || personal.test(message),
    includeTimeContext: timeIntent,
    includeRecentHistory: timeIntent || retrospective.test(message),
    expandGraph:
      Boolean(request.currentEntity) || careerIntent || personal.test(message),
    searchQueries:
      seed.length >= 2
        ? [{ query: seed, domains, reason: "用户问题中的主题" }]
        : [],
  };
}
