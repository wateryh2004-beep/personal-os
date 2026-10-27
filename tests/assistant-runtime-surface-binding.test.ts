import {beforeEach,expect,it,vi} from "vitest";
const adapter=vi.hoisted(()=>({owner:vi.fn(),context:vi.fn(),model:vi.fn()}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:adapter.owner}));
vi.mock("@/features/context/engine",()=>({buildPersonalContext:adapter.context}));
vi.mock("@/lib/ai/deepseek",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/ai/deepseek")>(),getDeepSeekModel:adapter.model}));
vi.mock("@/features/ai/governance",()=>({getAiGovernance:async()=>({maxOutputTokensPerRequest:1400}),assertAiBudget:async()=>({allowed:true}),auditAiRequest:async()=>"synthetic-audit",completeAiRequestWithUsage:vi.fn(),summarizeContextSources:()=>({sourceCount:0,modules:[]})}));
import {createAssistantAgent} from "@/features/assistant/runtime";
import {assistantToolRegistry} from "@/features/assistant/tools/registry";
import {assertRunIdentity,AgentRunIdentityError} from "@/features/assistant/run-identity";
import {createAgentRun} from "@/features/assistant/persistence";
const owner="11111111-1111-4111-8111-111111111111",entity="22222222-2222-4222-8222-222222222222";
beforeEach(()=>{vi.clearAllMocks();adapter.context.mockResolvedValue(null);adapter.model.mockResolvedValue({modelId:"deepseek-v4-flash",model:{specificationVersion:"v3",provider:"synthetic",modelId:"synthetic"}});adapter.owner.mockResolvedValue({userId:owner,supabase:{from:()=>{const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:{timezone:"UTC",display_name:"Synthetic user"}})};return query;}}});});
it.each(["tasks","calendar","career"] as const)("constrains actual installed ToolLoopAgent tools on %s to its original registry groups",async(surface)=>{
 const result=await createAssistantAgent({surface,mode:"chat",instruction:surface==="tasks"?"帮我创建任务，明天提交材料":surface==="calendar"?"明天下午三点帮我安排 CFA 学习。":"结合我的经历，帮我创建职业规划和日程",currentSurface:{type:"note_draft",content:"Synthetic current content"}});
 const names=Object.keys(result.agent.tools);const groups=names.map(name=>assistantToolRegistry.find(tool=>tool.name===name)?.group);
 expect(names).toEqual(result.initial);if(surface==="career")expect(names).toEqual([]);else{expect(names.length).toBeGreaterThan(0);expect(groups.every(group=>(surface==="tasks"?["todo_read","todo_proposal"]:["calendar_read","calendar_proposal"]).includes(String(group)))).toBe(true);}
 expect(adapter.model).toHaveBeenCalledTimes(1);
});
it("rejects wrong surface, entity or kernel binding and never carries unbound legacy kernel inference forward",()=>{
 const row={surface:"career",current_entity_type:"experience",current_entity_id:entity,kernel_state:{binding:{surface:"career",currentEntity:{type:"experience",id:entity}},activeConstraints:[]}};
 expect(()=>assertRunIdentity(row,{surface:"tasks",currentEntity:null})).toThrow(AgentRunIdentityError);expect(()=>assertRunIdentity(row,{surface:"career",currentEntity:{type:"experience",id:owner}})).toThrow(AgentRunIdentityError);expect(()=>assertRunIdentity({...row,kernel_state:{binding:{surface:"tasks",currentEntity:null}}})).toThrow(AgentRunIdentityError);expect(assertRunIdentity({...row,kernel_state:{activeGoal:"Old inferred goal"}}).kernel).toBeNull();
});
it("does not create a run for an unowned canonical entity, before any insert or audit",async()=>{
 const insert=vi.fn();const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:null,error:null}),insert};
 await expect(createAgentRun({supabase:{from:()=>query} as never,userId:owner,surface:"career",currentEntity:{type:"experience",id:entity}})).rejects.toThrow(AgentRunIdentityError);expect(insert).not.toHaveBeenCalled();
});
