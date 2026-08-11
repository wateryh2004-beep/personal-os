import type { ContextIntent } from "@/features/context/types";
import { routeCognitiveTask, type CognitiveRoute } from "./cognitive-router";
import { getCognitiveRecipe } from "./recipes/registry";
import type {
  AssistantSurface,
  AssistantToolGroup,
} from "./types";

const identityQuestion =
  /(?:你(?:知道|了解|记得).{0,8}(?:我是谁|我的情况|关于我)|我是谁|你对我(?:知道|了解)多少)/;
const mutation =
  /创建|新建|添加|记录|写入|修改|更新|更改|改到|改为|删除|完成|移动|安排|改期|延期|取消|记住|保存|归档/;
const search = /搜索|查找|找到|找出|哪篇|哪里|之前|过去|回忆|提到过|记录过/;

const domains: Array<{
  pattern: RegExp;
  read: AssistantToolGroup;
  proposal?: AssistantToolGroup;
}> = [
  {
    pattern:
      /日历|日程|会议|预约|空闲|时间段|改期|行程|今天|明天|后天|上午|下午|晚上|\d{1,2}(?::\d{2}|点)/,
    read: "calendar_read",
    proposal: "calendar_proposal",
  },
  {
    pattern: /任务|待办|todo|提醒|清单|截止/i,
    read: "todo_read",
    proposal: "todo_proposal",
  },
  {
    pattern: /笔记|日记|记录|正文|文章/,
    read: "notes_read",
    proposal: "notes_proposal",
  },
  {
    pattern: /职业|求职|实习|秋招|校招|岗位|简历|面试|offer|工作经历|量化/i,
    read: "career_read",
    proposal: "career_proposal",
  },
  {
    pattern: /记忆|记住|忘记|偏好|决定|关于我|我的情况/,
    read: "memory_read",
    proposal: "memory_proposal",
  },
  {
    pattern: /项目|project/i,
    read: "projects_read",
    proposal: "projects_proposal",
  },
  { pattern: /购物|待购|购买|预算|冷静期/i, read: "search" },
  { pattern: /旅行|旅游|行程|目的地|路线|景点/i, read: "search" },
  { pattern: /文件|附件|pdf|文档/i, read: "files_read" },
];

/**
 * Global Agent 不应把全部工具定义发送给每一次模型请求。
 * Personal Context 已经包含回答身份/个人状态问题所需的来源；其他请求只暴露
 * 与明确领域相关的只读工具，以及在用户表达写入意图时才暴露 proposal 工具。
 */
export function selectAssistantToolGroups(input: {
  surface: AssistantSurface;
  message: string;
  intent?: ContextIntent | null;
  route?: CognitiveRoute | null;
  available: AssistantToolGroup[];
}) {
  if (input.surface !== "global") return input.available;

  const message = input.message.trim();
  if (identityQuestion.test(message)) return [];

  const route = input.route ?? routeCognitiveTask({ message, surface: input.surface });
  const selected = new Set<AssistantToolGroup>();
  const wantsMutation = route.recipe === "mutation_request" || mutation.test(message);
  if (wantsMutation) {
    for (const domain of domains) {
      if (!domain.pattern.test(message)) continue;
      selected.add(domain.read);
      if (domain.proposal) selected.add(domain.proposal);
    }
  } else {
    for (const group of getCognitiveRecipe(route.recipe).toolGroups) selected.add(group);
    if (search.test(message)) selected.add("search");
  }

  return input.available.filter((group) => selected.has(group));
}
