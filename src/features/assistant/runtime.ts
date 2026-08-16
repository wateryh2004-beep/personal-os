import "server-only";
import { generateText, isStepCount, NoSuchToolError, ToolLoopAgent } from "ai";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import { resolveAssistantPolicy } from "./policy";
import { buildAssistantTools } from "./tools";
import { selectAssistantModel, selectReasoningProviderOptionsForRequest } from "./model-router";
import { recordAgentStep, updateAgentRun } from "./persistence";
import { decideContextGate } from "./kernel/context-gate";
import { buildRootAgentPrompt } from "./kernel/prompt-builder";
import { createPrepareStep, initialToolNames } from "./kernel/prepare-step";
import { unknownToolError } from "./tools/registry";
import { buildAiExecutionContext, formatCurrentSurfaceForModel } from "./kernel/execution-context";
import { deriveSessionState } from "./kernel/session-state";
import { buildPersonalContext } from "@/features/context/engine";
import { formatPersonalContextForModel, mapPersonalContextSources } from "@/features/context/formatter";
import type { ContextSurface } from "@/features/context/types";
import type { AgentSessionState } from "./kernel/types";
import type { AssistantRequest, AssistantResult, AssistantSurface, AssistantToolGroup } from "./types";

function latestText(request:AssistantRequest) { const fromMessages=request.messages?.slice().reverse().find((message)=>message.role==="user")?.parts.filter((part)=>part.type==="text").map((part)=>part.text).join("\n"); return request.instruction?.trim()||fromMessages||"请帮助我分析当前内容。"; }
function toContextSurface(surface:AssistantSurface):ContextSurface { if(surface==="inbox") return "tasks"; if(surface==="reviews") return "notes"; if(surface==="notes-library") return "notes"; return surface as ContextSurface; }
async function setup(request:AssistantRequest) {
  const {supabase,userId}=await requireOwner(); const {data:profile}=await supabase.from("profiles").select("timezone, display_name").eq("user_id",userId).maybeSingle(); const timezone=profile?.timezone||"Asia/Shanghai"; const userName=profile?.display_name?.trim()||"Hang Yu"; const message=latestText(request); const now=new Date(); const policy=resolveAssistantPolicy(request);
  let currentSurface=request.currentSurface?.content?{title:request.currentSurface.title,content:request.currentSurface.content}:null;
  if(!currentSurface&&request.currentEntity?.type==="note") { const {data:note}=await supabase.from("notes").select("title,body_markdown").eq("id",request.currentEntity.id).eq("status","active").is("deleted_at",null).is("archived_at",null).maybeSingle(); if(note) currentSurface={title:note.title,content:note.body_markdown.slice(0,20_000)}; }
  const executionContext=buildAiExecutionContext({currentSurface,requiresCurrentSurface:request.requiresCurrentSurface,usePersonalContext:request.usePersonalContext});
  const gate=decideContextGate({message,surface:request.surface,currentPath:request.currentPath,hasCurrentSurface:Boolean(currentSurface),requiresCurrentSurface:request.requiresCurrentSurface,usePersonalContext:request.usePersonalContext ?? (request.operation === "askNote" || request.operation === "deepThinkNote")});
  let previous:Partial<AgentSessionState>|null=null;
  if(request.runId) { const {data}=await supabase.from("agent_runs").select("kernel_state").eq("id",request.runId).eq("user_id",userId).maybeSingle(); previous=(data?.kernel_state as Partial<AgentSessionState>|null)??null; }
  const sessionState=deriveSessionState(previous,request.messages,gate); const selectedModel=selectAssistantModel({surface:request.surface,requestedModel:request.model,message,contextGate:gate}); const resolved=await getDeepSeekModel(userId,selectedModel);
  let personalContextPack:Awaited<ReturnType<typeof buildPersonalContext>>|null=null;
  if(gate.needsPersonalData){try{personalContextPack=await buildPersonalContext({message:request.contextQuery?.trim()||message,surface:toContextSurface(request.surface),currentEntity:request.currentEntity,currentSurface:currentSurface?{type:"note_draft",title:currentSurface.title,content:currentSurface.content}:null});}catch{/* 个人上下文构建失败不阻塞主流程 */}}
  const personalContextBlock=personalContextPack?`\n\n${formatPersonalContextForModel(personalContextPack)}`:"";
  const surfaceRules=gate.mode==="none"?"":`\n\nSURFACE_RULES\n${policy.instruction}`;
  const system=`${buildRootAgentPrompt({timezone,now,userName,sessionState,gateDecision:gate,currentSurfaceSummary:gate.needsCurrentSurface?formatCurrentSurfaceForModel(executionContext):null})}${surfaceRules}${personalContextBlock}`;
  if (process.env.NODE_ENV !== "production") console.info("[assistant-context]", { user: userName, currentSurface: { included: Boolean(executionContext.currentSurface && gate.needsCurrentSurface), bodyChars: executionContext.currentSurface?.content.length ?? 0 }, personalContext: { enabled: executionContext.personalContextEnabled, items: personalContextPack?.sources.length ?? 0, contextChars: personalContextPack?.diagnostics.totalChars ?? 0 }, toolContext: { enabled: gate.needsTools } });
  // 笔记库子 AI 的初始工具清单直接给出笔记工具（groupByModule.notes 会把
  // 跨域 search 组也算进来，不能用于只读笔记定位）。
  const initial=gate.needsTools
    ? request.surface === "notes-library"
      ? ["searchNotes","listRecentNotes","readNotesBatch","readNote","proposeNoteCreate","proposeNoteUpdate","listNoteOrganization","proposeNoteMove"]
      : initialToolNames(gate)
    : [];
  if(request.runId) { await updateAgentRun({supabase,userId,runId:request.runId,status:"running",model:resolved.modelId,kernel:{contextMode:gate.mode,complexity:gate.complexity,initialModules:gate.likelyModules,activeSkills:sessionState.activeSkills,initialToolNames:initial,discoveredToolNames:sessionState.discoveredToolNames,sessionState}}); await recordAgentStep({supabase,userId,runId:request.runId,stepType:"context",title:gate.needsPersonalData?"已准备个人上下文":"未访问 Personal OS",summary:gate.needsPersonalData?`模式 ${gate.mode}；来源 ${personalContextPack?.sources.length??0} 条（${personalContextPack?.diagnostics.totalChars??0} 字符）`:"普通问题直接回答",output:{contextMode:gate.mode,complexity:gate.complexity,initialModules:gate.likelyModules,activeSkills:sessionState.activeSkills,initialToolNames:initial,personalDataAccessed:Boolean(personalContextPack),osManifestChars:system.length,skillInstructionsChars:0,contextChars:personalContextPack?.diagnostics.totalChars??0}}); }
  return {supabase,userId,timezone,policy,gate,sessionState,model:resolved.model,modelId:resolved.modelId,system,currentSurface,initial,personalContextPack};
}
export async function createAssistantAgent(request:AssistantRequest) {
  const runtime=await setup(request);
  // 笔记库子 AI 只挂笔记工具（文档小管家定位）；其他 surface 的 agent 装配
  // 完整工具集，保证全局助手在任何页面都能实现同样的笔记库能力（能力盒子共享）。
  const toolGroups: AssistantToolGroup[] =
    request.surface === "notes-library"
      ? runtime.policy.tools
      : ["meta","context_read","reviews_read","briefing_read","search","calendar_read","calendar_proposal","todo_read","todo_proposal","inbox_read","inbox_proposal","notes_read","notes_proposal","career_read","career_proposal","memory_read","memory_proposal","projects_read","projects_proposal","files_read","shopping_read","shopping_proposal","travel_read","travel_proposal"];
  const allTools=runtime.gate.needsTools?buildAssistantTools({supabase:runtime.supabase,userId:runtime.userId,policy:{...runtime.policy,tools:toolGroups},timezone:runtime.timezone,runId:request.runId,onToolsDiscovered:(names)=>{runtime.sessionState.discoveredToolNames=[...new Set([...runtime.sessionState.discoveredToolNames,...names])]; if(request.runId) void runtime.supabase.from("agent_runs").update({kernel_state:runtime.sessionState,discovered_tool_names:runtime.sessionState.discoveredToolNames}).eq("id",request.runId).eq("user_id",runtime.userId);}}):{}; return {...runtime,agent:new ToolLoopAgent({model:runtime.model,stopWhen:isStepCount(runtime.gate.needsTools?runtime.policy.maxSteps:1),maxOutputTokens:runtime.policy.maxOutputTokens,providerOptions:selectReasoningProviderOptionsForRequest({surface:request.surface,mode:request.mode,operation:request.operation,contextGate:runtime.gate}),instructions:runtime.system,tools:allTools,prepareStep:runtime.gate.needsTools?createPrepareStep({decision:runtime.gate,sessionState:runtime.sessionState,initialToolNames:runtime.initial}):undefined,experimental_repairToolCall:async({error,toolCall})=>{if(NoSuchToolError.isInstance(error)){const detail=unknownToolError(toolCall.toolName,Object.keys(allTools));if(request.runId) await recordAgentStep({supabase:runtime.supabase,userId:runtime.userId,runId:request.runId,stepType:"error",title:"未注册工具调用被拒绝",summary:`${detail.requested} 不在当前 Tool Registry 中`,output:detail,status:"failed"});return null;}return null;}})}; }
export async function runAssistant(request:AssistantRequest):Promise<AssistantResult> { const runtime=await setup(request); const {text,finishReason}=await generateText({model:runtime.model,maxOutputTokens:runtime.policy.maxOutputTokens,providerOptions:selectReasoningProviderOptionsForRequest({surface:request.surface,mode:request.mode,operation:request.operation,contextGate:runtime.gate}),system:runtime.system,prompt:latestText(request)}); await runtime.supabase.from("audit_logs").insert({user_id:runtime.userId,action:"assist",entity_type:request.currentEntity?.type||"assistant",entity_id:request.currentEntity?.id??null,actor_type:"user",after_data:{surface:request.surface,mode:request.mode,model:runtime.modelId,context_mode:runtime.gate.mode,personal_data_accessed:Boolean(runtime.personalContextPack),context_sources:runtime.personalContextPack?.sources.length??0,tool_names:[],finish_reason:finishReason}}); return {status:"success",text:text.trim(),finishReason,modelId:runtime.modelId,contextSources:mapPersonalContextSources(runtime.personalContextPack)}; }
