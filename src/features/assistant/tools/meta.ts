import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { searchSkills } from "../skills/registry";
import { searchToolCapabilities } from "../kernel/capability-index";
import type { AssistantToolModule } from "./types";
export const metaTools: AssistantToolModule = { definitions:[{name:"searchSkills",group:"meta",risk:"read",description:"按任务发现可按需加载的分析技能",module:"meta",tags:["skill","技能","分析方法"],alwaysActive:true},{name:"searchTools",group:"meta",risk:"read",description:"按任务发现 Personal OS 可用工具",module:"meta",tags:["tool","工具","能力","搜索工具"],alwaysActive:true}], build:(context)=>({
  searchSkills:tool({description:"按当前任务搜索可用 Skill。Skill 只提供工作方法，不读取 Personal OS 数据。",inputSchema:z.object({query:z.string().trim().min(1).max(240),limit:z.number().int().min(1).max(8).default(5)}),execute:async({query,limit})=>({skills:searchSkills(query,limit).map(({id,name,description,suggestedModules})=>({id,name,description,suggestedModules}))})}),
  searchTools:tool({description:"按当前任务搜索可用业务工具；返回后会在后续 Agent step 可用。不会返回数据库或密钥细节。",inputSchema:z.object({query:z.string().trim().min(1).max(240),limit:z.number().int().min(1).max(10).default(8)}),execute:async({query,limit})=>{const results=await searchToolCapabilities(query,limit); context.onToolsDiscovered?.(results.map((item)=>item.name)); return {tools:results.map(({name,description,module,risk})=>({name,description,module,risk}))};}}),
}) };
