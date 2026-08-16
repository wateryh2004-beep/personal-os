import type {
  AssistantRequest,
  AssistantSurface,
  AssistantToolGroup,
} from "./types";
import { ROOT_AGENT_CONSTITUTION } from "./kernel/constitution";
import { formatManagedTaxonomyForPrompt } from "@/features/calendar/classification/taxonomy";

/** @deprecated Root Agent 改由 Agent Kernel 的 Constitution 驱动。 */
export const BASE_ASSISTANT_SYSTEM_POLICY = ROOT_AGENT_CONSTITUTION;
export type AssistantPolicy = {
  context: "none" | "local" | "personal";
  tools: AssistantToolGroup[];
  maxSteps: number;
  maxOutputTokens: number;
  instruction: string;
};
const policies: Record<AssistantSurface, AssistantPolicy> = {
  notes: {
    context: "local",
    tools: [],
    maxSteps: 1,
    // 输出上限远低于 DeepSeek V4 的 384K 上限；调大不改变短内容行为，
    // 只给长笔记润色留足空间（此前 1200 导致长随想被硬截断）。
    maxOutputTokens: 32768,
    instruction:
      "笔记编辑任务只处理当前提供的文本，保留事实、专有名词、日期和数字。",
  },
  calendar: {
    context: "personal",
    tools: ["calendar_read", "calendar_proposal"],
    maxSteps: 4,
    maxOutputTokens: 700,
    instruction:
      `日程工具只生成提案；按钮是唯一确认入口，不得把聊天中的“确认”描述成已执行，也不得要求二次确认。删除或修改前必须查询且只允许一条明确匹配。改期必须使用 update，不得删除后重建，也不得改变未被用户明确提及的分类、重要性、地点等字段。创建日程时根据主题、描述与地点的语义主动选择分类，使用以下结构化 Calendar taxonomy，不得临时发明 Outlook Category：

${formatManagedTaxonomyForPrompt()}

选定主分类后，若同时符合某个长期场景（如华夏基金、高力国际、人大、Personal OS），叠加对应的场景分类。仅当语义完全无法判断或明显跨领域时才将 primaryCategoryKey 留空，交由确定性分类器处理。所有用户可见时间都按提供的用户时区表达，工具参数必须携带与该时区相符的 UTC offset，绝不能把本地钟点直接写成 Z。生成提案后只需提示用户点击对应按钮，不要重复汇总旧提案。`,
  },
  tasks: {
    context: "personal",
    tools: ["todo_read", "todo_proposal"],
    maxSteps: 4,
    maxOutputTokens: 700,
    instruction:
      "创建任务前必须读取清单。任务工具只生成待确认提案；标题简短，细节放在正文。",
  },
  inbox: {
    context: "personal",
    tools: ["inbox_read", "todo_read", "inbox_proposal"],
    maxSteps: 3,
    maxOutputTokens: 500,
    instruction:
      "将 Inbox 分类为任务、日程、笔记或今日日记。明确需要执行的承诺归任务；包含具体日期或时间的安排归日程；今天发生的事情、当下感受、个人反思、经验教训和生活记录优先归今日日记；适合长期复用且不以当天经历为主的知识归普通笔记。不明确时保留 Inbox。只生成提案，绝不直接写入。",
  },
  career: {
    context: "personal",
    tools: [],
    maxSteps: 2,
    maxOutputTokens: 1200,
    instruction: "Career 助手只读分析，不创建、修改或删除 Career 数据。",
  },
  reviews: {
    context: "local",
    tools: [],
    maxSteps: 1,
    maxOutputTokens: 1400,
    instruction:
      "只根据提供的 Review Evidence 生成复盘草稿或结构化候选。不得补造事实；区分可验证事实、用户可能的解释和需要用户判断的部分。用户可见草稿只能引用来源标题，不显示 UUID 或内部 source id。不要自动生成或写入长期 Memory / Decision。Evidence 记录较少时必须明确覆盖不足。",
  },
  global: {
    context: "none",
    tools: [
      "search",
      "calendar_read",
      "calendar_proposal",
      "todo_read",
      "todo_proposal",
      "inbox_read",
      "inbox_proposal",
      "notes_read",
      "notes_proposal",
      "career_read",
      "career_proposal",
      "memory_read",
      "memory_proposal",
      "projects_read",
      "projects_proposal",
      "files_read",
      "shopping_read",
      "shopping_proposal",
      "travel_read",
      "travel_proposal",
    ],
    maxSteps: 8,
    maxOutputTokens: 1400,
    instruction:
      "这是跨 Personal OS 的全局 Agent。先检索必要来源再回答；涉及计划时用确定性空闲时间工具。所有修改只能生成待确认 proposal，生成后说明等待用户在操作卡片确认。回答重要个人判断时列出来源链接。",
  },
};
export function resolveAssistantPolicy(
  request: AssistantRequest,
): AssistantPolicy {
  if (
    request.surface === "notes" &&
    request.usePersonalContext !== false &&
    (request.operation === "askNote" || request.operation === "deepThinkNote")
  )
    return { ...policies.notes, context: "personal" };
  return policies[request.surface];
}
