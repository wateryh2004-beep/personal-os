import { assistantToolRegistry } from "../tools/registry";
import type { AssistantToolDefinition } from "../tools/types";
export type CapabilitySearchResult = Pick<AssistantToolDefinition,"name"|"description"|"module"|"risk"|"group"> & { score:number };
export interface CapabilitySearcher { search(query:string, limit:number):Promise<CapabilitySearchResult[]>; }
function chineseBigrams(value: string) {
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1)
    result.push(value.slice(index, index + 2));
  return result;
}

const tokens = (value: string) => {
  const base = value.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  return [...new Set(base.flatMap((token) =>
    /^[\u4e00-\u9fff]+$/.test(token) ? [token, ...chineseBigrams(token)] : [token],
  ))];
};
const moduleTerms: Record<string,string[]>={notes:["笔记","写过","写的","之前","内容","日记","记录"],career:["职业","实习","求职","简历","量化"],memory:["我的","个人","偏好","决定"],calendar:["日程","时间","空闲","会议"],tasks:["任务","待办","逾期","事项"],reviews:["复盘","回顾"],files:["文件","附件"],briefing:["简报","资讯","RSS"],projects:["项目"],inbox:["收件箱","inbox"]};
export class LexicalCapabilitySearcher implements CapabilitySearcher { async search(query:string,limit:number) { const queryTokens=tokens(query); return assistantToolRegistry.map((item)=>{ const haystack=[item.name,item.description,item.module??"",...(item.tags??[]),...(item.relatedTools??[]),...(moduleTerms[item.module??""]??[])].join(" ").toLowerCase(); const score=queryTokens.reduce((total,token)=>total+(item.tags?.some((tag)=>tag.toLowerCase()===token)?9:0)+(item.module===token?7:0)+(item.name.toLowerCase().includes(token)?6:0)+(haystack.includes(token)?2:0),0); return {...item,score}; }).filter((item)=>item.score>0&&!item.alwaysActive).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit).map(({name,description,module,risk,group,score})=>({name,description,module:module!,risk,group,score})); } }
const lexical = new LexicalCapabilitySearcher();
export function searchToolCapabilities(query:string,limit=8) { return lexical.search(query, Math.min(12,Math.max(1,limit))); }
