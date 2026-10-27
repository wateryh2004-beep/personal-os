"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {z} from "zod";
import {createMicrosoftTodoTaskAction,readMicrosoftTodoCreationAction,type TodoCreateState} from "@/features/tasks/microsoft-todo";
import {taskDueInputToIso} from "@/features/tasks/due-time";
import {captureWorkspaceScope} from "@/lib/workspace-resource-cache";
import {draftValueFingerprint,useWorkflowDraft} from "./drafts";
import {draftResumeKey,focusDraftForm,isDraftHostReady,useDraftResumeConsumer,type DraftResumeTarget} from "./draft-resume";
const fields=z.object({title:z.string().max(500),body_text:z.string().max(10000),todo_list_id:z.string().max(36),importance:z.string().max(40),due_at:z.string().max(100)}).strict();
export type TaskCreateFields=z.infer<typeof fields>;
export function taskCreateFieldsFromForm(form:HTMLFormElement):TaskCreateFields{const data=new FormData(form);return {title:String(data.get("title")??""),body_text:String(data.get("body_text")??""),todo_list_id:String(data.get("todo_list_id")??""),importance:String(data.get("importance")??"normal"),due_at:String(data.get("due_at")??"")};}
const schema=z.object({fields,intent:z.object({requestId:z.uuid(),fields}).strict().nullable()}).strict();
export type TaskCreationTransport={create:typeof createMicrosoftTodoTaskAction;read:typeof readMicrosoftTodoCreationAction};
export function useTaskCreationDraft(operation:"task.quick-add"|"task.create",id:string,initial:TaskCreateFields,transport?:TaskCreationTransport){
 assertContinuousFixtureTransport(transport);
 const target:DraftResumeTarget={kind:operation,id};
 const draft=useWorkflowDraft({kind:"task",id:`${operation}:${id}`,label:operation==="task.create"?"新建任务":"快速添加任务",resumeHref:"/tasks",resumeTarget:target,initialValue:{fields:initial,intent:null} as z.infer<typeof schema>,parse:input=>{const result=schema.safeParse(input);return result.success?result.data:null;}});
 const live=useRef({key:`${operation}:${id}`,value:draft.value});useLayoutEffect(()=>{live.current={key:`${operation}:${id}`,value:draft.value};},[operation,id,draft.value]);
 const lease=useRef({key:`${operation}:${id}`});useLayoutEffect(()=>{lease.current={key:`${operation}:${id}`};},[operation,id]);
 const formRef=useRef<HTMLFormElement>(null),busy=useRef(false),mounted=useRef(true);const [pending,setPending]=useState(false),[state,setState]=useState<TodoCreateState>({status:"idle",message:""});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useDraftResumeConsumer({kind:operation,identity:{id},priority:2,ready:()=>isDraftHostReady(formRef.current),open:focusDraftForm});
 const submit=async(raw?:TaskCreateFields)=>{
  if(busy.current||!draft.isCurrent())return null;
  const value={...live.current.value,...(raw?{fields:raw}:{})};if(raw)draft.setValue(v=>({...v,fields:raw}));const scope=captureWorkspaceScope(),instance=lease.current,key=`${operation}:${id}`,current=()=>draft.isCurrent()&&scope()&&mounted.current&&live.current.key===key&&lease.current===instance;
  const intent=value.intent??{requestId:crypto.randomUUID(),fields:{...value.fields}};
  let due:string|null;
  try{due=taskDueInputToIso(intent.fields.due_at);}catch{setState({status:"error",message:"截止时间无效或处于夏令时切换时段，请选择另一个时间。"});return null;}
  if(!intent.fields.title.trim())return null;
  busy.current=true;setPending(true);draft.setValue(v=>({...v,intent}));
  const form=new FormData();for(const [name,raw] of Object.entries(intent.fields))form.set(name,raw);form.set("due_at",due??"");form.set("request_id",intent.requestId);
  try{
   const result=value.intent?await(transport?.read??readMicrosoftTodoCreationAction)(form):await(transport?.create??createMicrosoftTodoTaskAction)({status:"idle",message:""},form);
   if(!current())return null;setState(result);
   const unchanged=draftValueFingerprint(live.current.value.fields)===draftValueFingerprint(intent.fields);
   if(result.status!=="success"&&result.writeOutcome==="not_written")draft.setValue(v=>({...v,intent:null}));
   if(result.status==="success")draft.commit({fields:intent.fields,intent},v=>({fields:draftValueFingerprint(v.fields)===draftValueFingerprint(intent.fields)?{...intent.fields,title:"",body_text:""}:v.fields,intent:null}));
   return {result,unchanged,fields:intent.fields};
  }catch{if(current())setState({status:"error",message:"提交结果尚未确认，原输入已保留，请先核对原提交。"});return null;}
  finally{busy.current=false;if(current())setPending(false);}
 };
 return {adoptDefaultList:(listId:string)=>{if(!draft.restored&&!draft.value.intent&&!draft.value.fields.title&&!draft.value.fields.body_text)draft.commit(draft.value,value=>({...value,fields:{...value.fields,todo_list_id:listId}}));},fields:draft.value.fields,setField:(name:keyof TaskCreateFields,value:string)=>draft.setValue(v=>({...v,fields:{...v.fields,[name]:value}})),pending,state,uncertain:Boolean(draft.value.intent),restored:draft.restored,recoveryUnavailable:draft.recoveryUnavailable,submit,formRef,attributes:{"data-workflow-draft-key":draftResumeKey(target)}};
}
