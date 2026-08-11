import type { AssistantSkill } from "./types";
const skill = (value: AssistantSkill) => value;
export const assistantSkillRegistry: AssistantSkill[] = [
  skill({ id:"factual-recall", name:"事实检索", description:"查找用户明确提及的个人记录或事实。", activateWhen:["找到之前记录","哪篇笔记"], suggestedModules:["notes","memory","career"], instructions:"先搜索目标模块；只用来源支持个人事实；找不到时明确说明。", maxSources:8 }),
  skill({ id:"retrospective-thinking", name:"回顾思考", description:"总结近期反复主题、变化和开放问题。", activateWhen:["最近在想什么","反复出现"], suggestedModules:["notes","reviews","memory"], instructions:"先读最近 21 天 Notes；证据不足可扩展至 45 天。至少两个独立来源才可称为反复主题；用当前 Memory 校准历史记录。", maxSources:12 }),
  skill({ id:"belief-change", name:"观点变化", description:"比较历史与当前立场，避免把时间变化误判为矛盾。", activateWhen:["改变看法","不再认为"], suggestedModules:["memory","notes"], instructions:"分别寻找历史位置和当前位置；当前 Memory/Decision 不能被旧 Notes 覆盖；没有两侧证据不得断言改变。", maxSources:10 }),
  skill({ id:"contradiction-detection", name:"矛盾识别", description:"区分真实矛盾、观点演变、语境差异与措辞差异。", activateWhen:["矛盾","冲突"], suggestedModules:["memory","notes","reviews"], instructions:"逐项说明证据的时间和语境；不要把变化自动称为矛盾。", maxSources:12 }),
  skill({ id:"decision-support", name:"决策支持", description:"比较选项、取舍、可逆性与最小实验。", activateWhen:["该不该","怎么选","值不值得"], suggestedModules:["memory","career","tasks"], instructions:"识别目标、约束、上下行、机会成本、可逆性、证据缺口和最小可执行实验；区分事实与推论。" }),
  skill({ id:"open-loops", name:"开放事项", description:"找出未完成、等待或需要推进的事项。", activateWhen:["未处理","开放事项"], suggestedModules:["tasks","calendar","notes"], instructions:"优先 Tasks；只有必要时查 Notes。输出可执行的最小下一步。" }),
  skill({ id:"trajectory-analysis", name:"轨迹分析", description:"分析跨时间的推进、变化和趋势。", activateWhen:["轨迹","趋势","进展"], suggestedModules:["reviews","notes","career"], instructions:"按时间排序证据；不要以单点记录推断趋势。" }),
  skill({ id:"next-best-action", name:"下一步行动", description:"把目标和约束转化为最小可执行行动。", activateWhen:["下一步","最该做什么"], suggestedModules:["tasks","calendar","memory"], instructions:"分析目标、约束、开放环、可用时间、definition of done；优先最小可执行行动。" }),
  skill({ id:"career-strategy", name:"职业策略", description:"结合真实经历、目标与约束分析职业选择。", activateWhen:["实习","求职","职业方向"], suggestedModules:["career","memory","notes","reviews"], instructions:"先读 Career 与 Memory；必要时再读 Notes/Reviews。分析目标、资产、约束、选项、机会成本、可逆性、证据缺口与下一步验证。历史 Notes 不自动代表当前方向。" }),
  skill({ id:"time-planning", name:"时间规划", description:"基于 Calendar 和 Tasks 安排时间。", activateWhen:["空闲","安排","日程"], suggestedModules:["calendar","tasks"], instructions:"优先 Calendar 和 Tasks；使用确定性空闲时间工具，不让模型心算。只有用户明确要求长期目标时才读取 Career/Memory。" }),
];
function chineseBigrams(value: string) {
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1)
    result.push(value.slice(index, index + 2));
  return result;
}

const words = (value: string) => {
  const base = value.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  return [...new Set(base.flatMap((item) =>
    /^[\u4e00-\u9fff]+$/.test(item) ? [item, ...chineseBigrams(item)] : [item],
  ))];
};
export function searchSkills(query:string, limit=6) { const queryWords=words(query); return assistantSkillRegistry.map((item) => ({ item, score:queryWords.reduce((score, word) => score + (item.id.includes(word)||item.name.includes(word)||item.description.includes(word)||item.activateWhen.some((value)=>value.includes(word)) ? 3:0),0) })).filter((row)=>row.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(({item})=>item); }
export function getSkills(ids:string[]) { const wanted=new Set(ids); return assistantSkillRegistry.filter((item)=>wanted.has(item.id)); }
export function formatSkillCatalogForModel() { return assistantSkillRegistry.map((item)=>`${item.id}：${item.description}`).join("\n"); }
export function formatSkillInstructions(skills:AssistantSkill[]) { return skills.map((item)=>`SKILL ${item.id}\n${item.instructions}`).join("\n\n"); }
