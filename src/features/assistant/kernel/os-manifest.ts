import type { PersonalOsModuleId } from "./types";
import { capabilityManifest } from "../tools/registry";

export type PersonalOsModuleDefinition = { id: PersonalOsModuleId; name: string; purpose: string; dataAuthority: "confirmed" | "structured" | "historical" | "operational" | "external"; contains: string[]; usefulFor: string[]; notUsefulFor: string[]; defaultReadDepth: "summary" | "targeted" | "search"; supportsMutation: boolean };
const defineModule = (definition: PersonalOsModuleDefinition) => definition;
export const PERSONAL_OS_MODULES: Record<PersonalOsModuleId, PersonalOsModuleDefinition> = {
  notes: defineModule({ id:"notes", name:"Notes", purpose:"长期笔记、知识、思考和 Daily Notes", dataAuthority:"historical", contains:["笔记","日记","历史观点"], usefulFor:["过去写过什么","主题检索","历史思考"], notUsefulFor:["一般知识","当前日程或任务事实"], defaultReadDepth:"search", supportsMutation:true }),
  career: defineModule({ id:"career", name:"Career", purpose:"职业档案、经历、方向与里程碑", dataAuthority:"structured", contains:["职业档案","经历","机会","方向"], usefulFor:["求职","实习","简历","职业选择"], notUsefulFor:["当前日程"], defaultReadDepth:"summary", supportsMutation:true }),
  memory: defineModule({ id:"memory", name:"Memory", purpose:"已确认的个人事实、工作记忆与决定", dataAuthority:"confirmed", contains:["Profile","Working Memory","Decision"], usefulFor:["用户当前状态","长期偏好","当前约束"], notUsefulFor:["历史原文检索"], defaultReadDepth:"summary", supportsMutation:true }),
  calendar: defineModule({ id:"calendar", name:"Calendar", purpose:"当前和未来日程", dataAuthority:"operational", contains:["日程","空闲时间"], usefulFor:["安排","冲突","空闲时间"], notUsefulFor:["历史观点"], defaultReadDepth:"targeted", supportsMutation:true }),
  tasks: defineModule({ id:"tasks", name:"Tasks", purpose:"Microsoft To Do 的执行任务", dataAuthority:"operational", contains:["待办","截止日期","完成状态"], usefulFor:["未完成任务","逾期","行动负担"], notUsefulFor:["职业事实"], defaultReadDepth:"targeted", supportsMutation:true }),
  reviews: defineModule({ id:"reviews", name:"Reviews", purpose:"日、周与决策复盘", dataAuthority:"historical", contains:["复盘","决策回顾"], usefulFor:["跨时间总结","复盘"], notUsefulFor:["实时状态"], defaultReadDepth:"targeted", supportsMutation:false }),
  files: defineModule({ id:"files", name:"Files", purpose:"用户文件及其提取文本", dataAuthority:"structured", contains:["文件","附件","证据"], usefulFor:["明确询问的文件","文件证据"], notUsefulFor:["一般知识"], defaultReadDepth:"search", supportsMutation:false }),
  briefing: defineModule({ id:"briefing", name:"Briefing", purpose:"用户筛选后的 RSS 情报快照", dataAuthority:"external", contains:["Briefing","RSS 条目"], usefulFor:["已筛选信息流","近期外部资讯"], notUsefulFor:["用户本人观点"], defaultReadDepth:"targeted", supportsMutation:false }),
  projects: defineModule({ id:"projects", name:"Projects", purpose:"长期项目与状态", dataAuthority:"structured", contains:["项目","期限","状态"], usefulFor:["项目上下文","项目下一步"], notUsefulFor:["日程冲突"], defaultReadDepth:"summary", supportsMutation:true }),
  inbox: defineModule({ id:"inbox", name:"Inbox", purpose:"尚未归档的信息与分流", dataAuthority:"operational", contains:["Inbox 条目"], usefulFor:["分流","整理"], notUsefulFor:["长期事实"], defaultReadDepth:"targeted", supportsMutation:true }),
  shopping: defineModule({ id:"shopping", name:"Shopping", purpose:"待购物品、购买理由与冷静期决策", dataAuthority:"operational", contains:["待购物品","购买状态","冷静期"], usefulFor:["买什么","购买决策","已有待购"], notUsefulFor:["日程冲突"], defaultReadDepth:"targeted", supportsMutation:true }),
  travel: defineModule({ id:"travel", name:"Travel", purpose:"旅行愿景、行程地点与规划", dataAuthority:"structured", contains:["旅行","地点","路线","行程"], usefulFor:["旅行计划","目的地","地点安排"], notUsefulFor:["当前 Outlook 日程"], defaultReadDepth:"targeted", supportsMutation:true }),
};
export function formatOsManifestForModel() {
  const capabilityByModule = new Map(capabilityManifest().map((item) => [item.module, item.tools]));
  return Object.values(PERSONAL_OS_MODULES).map((item) => {
    const capabilities = (capabilityByModule.get(item.id) ?? []).map((tool) => `${tool.operation === "read" ? "读取" : "提案"}:${tool.name}`).join("、") || "当前无可用工具";
    return `${item.name}（${item.dataAuthority}）：${item.purpose}；适用：${item.usefulFor.join("、")}；不适用：${item.notUsefulFor.join("、")}；工具：${capabilities}。`;
  }).join("\n");
}
