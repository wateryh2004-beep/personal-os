"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {z} from "zod";
import type {TodoTask,UpdateTaskPatch} from "@/features/tasks/types";
import type {OperationResult} from "@/features/workbench/operation-contracts";
import {taskDueInputValue} from "@/features/tasks/due-time";
import {draftValueFingerprint,useWorkflowDraft} from "./drafts";
import {captureWorkspaceScope} from "@/lib/workspace-resource-cache";
const raw=z.object({title:z.string().max(500),body_text:z.string().max(10000),importance:z.enum(["low","normal","high"]),due_at:z.string().max(100)}).strict();
const expectedSchema=z.object({title:z.string().max(500),bodyText:z.string().max(10000).nullable(),lastModifiedAt:z.string().nullable(),status:z.string()}).strict();
const patchSchema=z.object({title:z.string().max(500).optional(),bodyText:z.string().max(10000).nullable().optional(),importance:z.enum(["low","normal","high"]).optional(),dueAt:z.string().nullable().optional()}).strict();
const schema=z.object({fields:raw,expected:expectedSchema,intent:z.object({requestId:z.uuid(),patch:patchSchema,expected:expectedSchema,fields:raw}).strict().nullable()}).strict();
export type TaskEditExpected=z.infer<typeof expectedSchema>;
export type TaskEditDispatch=(patch:UpdateTaskPatch,expected:TaskEditExpected,requestId:string,readOnly:boolean)=>Promise<OperationResult>;
export function useTaskEditDraft(task:TodoTask,dispatch:TaskEditDispatch){
 const draft=useWorkflowDraft({kind:"task",id:`task.edit:${task.id}`,label:"任务修改",resumeHref:`/tasks?task=${task.id}`,resumeTarget:{kind:"task.edit",id:task.id},initialValue:{fields:{title:task.title,body_text:task.bodyText??"",importance:task.importance,due_at:taskDueInputValue(task.dueAt)},expected:{title:task.title,bodyText:task.bodyText,lastModifiedAt:task.lastModifiedAt,status:task.status},intent:null} as z.infer<typeof schema>,parse:input=>{const value=schema.safeParse(input);return value.success?value.data:null;}});
 const live=useRef(draft.value);useLayoutEffect(()=>{live.current=draft.value;},[draft.value]);
 const lease=useRef({id:task.id});useLayoutEffect(()=>{lease.current={id:task.id};},[task.id]);
 const busy=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const [message,setMessage]=useState(""),[pending,setPending]=useState(false),[comparison,setComparison]=useState<TaskEditExpected|null>(null);
 const save=async(patch?:UpdateTaskPatch)=>{
  if(busy.current||!draft.isCurrent())return false;const value=live.current;if(!patch&&!value.intent)return false;
  const fields={...value.fields,...(patch?.title!==undefined?{title:patch.title}:{}),...(patch?.bodyText!==undefined?{body_text:patch.bodyText??""}:{}),...(patch?.importance!==undefined?{importance:patch.importance}:{}),...(patch?.dueAt!==undefined?{due_at:taskDueInputValue(patch.dueAt)}:{})};
  const intent=value.intent??{requestId:crypto.randomUUID(),patch:patch!,expected:value.expected,fields};
  live.current={...value,fields,intent};draft.setValue(live.current);busy.current=true;setPending(true);setMessage("");const scope=captureWorkspaceScope(),instance=lease.current,current=()=>draft.isCurrent()&&scope()&&mounted.current&&lease.current===instance;
  try{
   const result=await dispatch(intent.patch,intent.expected,intent.requestId,Boolean(value.intent));if(!current()||live.current.intent?.requestId!==intent.requestId)return false;setMessage(result.message);
   if(result.status!=="success"){
    if(result.status==="conflict"){const canonical=result.rows?.find(row=>row.id===task.id);if(canonical){const parsed=expectedSchema.safeParse({title:canonical.title,bodyText:canonical.bodyText===undefined?intent.expected.bodyText:canonical.bodyText,lastModifiedAt:canonical.lastModifiedAt,status:canonical.status});if(parsed.success)setComparison(parsed.data);}}
    return false;
   }
   const canonical=result.rows?.find(row=>row.id===task.id);
   if(!canonical||typeof canonical.title!=="string"||!Object.hasOwn(canonical,"lastModifiedAt")){setMessage("原修改已保存，版本仍待核对，请核对原保存后继续。 ");return false;}
   const parsed=expectedSchema.safeParse({title:canonical.title,bodyText:canonical.bodyText===undefined?intent.expected.bodyText:canonical.bodyText,lastModifiedAt:canonical.lastModifiedAt,status:canonical.status});
   if(!parsed.success){setMessage("原修改回执尚不完整，输入仍保留，请核对原保存。 ");return false;}
   const expected=parsed.data,unchanged=draftValueFingerprint(live.current.fields)===draftValueFingerprint(intent.fields);
   draft.commit({fields:intent.fields,expected:intent.expected,intent},v=>({expected,intent:null,fields:{title:v.fields.title===intent.fields.title?expected.title:v.fields.title,body_text:v.fields.body_text===intent.fields.body_text?expected.bodyText??"":v.fields.body_text,importance:v.fields.importance===intent.fields.importance&&["low","normal","high"].includes(String(canonical.importance))?canonical.importance as "low"|"normal"|"high":v.fields.importance,due_at:v.fields.due_at===intent.fields.due_at?taskDueInputValue(typeof canonical.dueAt==="string"?canonical.dueAt:null):v.fields.due_at}}));
   if(!unchanged)setMessage("原修改已保存，当前新输入尚未保存。");return unchanged;
  }catch{if(current())setMessage("保存结果尚未确认，输入与原提交已保留，请核对原保存。 ");return false;}finally{busy.current=false;if(current())setPending(false);}
 };
 return {comparison,acceptComparedBaseline:()=>{if(comparison){live.current={...live.current,expected:comparison,intent:null};draft.setValue(live.current);setComparison(null);setMessage("已明确采用核对后的版本，当前输入尚未保存。");}},fields:draft.value.fields,setField:(name:keyof z.infer<typeof raw>,value:string)=>draft.setValue(v=>({...v,fields:{...v.fields,[name]:value}})),save,message,pending,uncertain:Boolean(draft.value.intent),restored:draft.restored,recoveryUnavailable:draft.recoveryUnavailable};
}
