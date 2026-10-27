"use client";
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {z} from "zod";
import {draftValueFingerprint,useWorkflowDraft} from "@/features/workflow-continuity/drafts";
import {parseDraftFields,type DraftFields,type DeclaredDraftConfig} from "@/features/workflow-continuity/draft-contracts";
import {applyDeclaredDraftFields,readDeclaredDraftFields,workflowDraftKind} from "@/features/workflow-continuity/draft-adapters";
import {parseDraftResumeTarget,draftResumeKey,focusDraftForm,isDraftHostReady,useDraftResumeConsumer} from "@/features/workflow-continuity/draft-resume";
import {captureWorkspaceScope} from "@/lib/workspace-resource-cache";
import {beginNavigationIntent} from "@/features/workflow-continuity/navigation-intent";
import type {OrdinaryCreationOutcome} from "@/features/workflow-continuity/creation-intent-types";
import {DraftRecoveryStatus} from "./draft-recovery-status";
type Envelope={fields:DraftFields;submitted:{intentId:string;fields:DraftFields}|null;phase:"editing"|"needs-check"|"retry"};
/** Explicit schemas/actions remain in each domain; this shell owns only the draft lease. */
export function IntentDraftForm({draft,submit,read,children,className,onSaved,resetOnSaved=true,onPendingChange,onFieldsChange}:{draft:DeclaredDraftConfig;submit:(intentId:string,fields:DraftFields)=>Promise<OrdinaryCreationOutcome>;read:(intentId:string,fields:DraftFields)=>Promise<OrdinaryCreationOutcome>;children:ReactNode;className?:string;onSaved?:(id:string,unchanged:boolean,navigationCurrent:boolean)=>void;resetOnSaved?:boolean;onPendingChange?:(pending:boolean)=>void;onFieldsChange?:()=>void}){
 const target=parseDraftResumeTarget({kind:draft.operation,id:draft.id,...(draft.parentId?{parentId:draft.parentId}:{}),...(draft.contextId?{contextId:draft.contextId}:{})});if(!target)throw new Error("Invalid declared draft target");const key=draftResumeKey(target);
 const recovery=useWorkflowDraft<Envelope>({kind:workflowDraftKind(draft.operation),id:`intent:${key}`,label:draft.label,resumeHref:draft.href,resumeTarget:target,initialValue:{fields:{},submitted:null,phase:"editing"},parse:input=>{const parsed=z.object({fields:z.unknown(),submitted:z.object({intentId:z.uuid(),fields:z.unknown()}).strict().nullable(),phase:z.enum(["editing","needs-check","retry"])}).strict().safeParse(input);if(!parsed.success)return null;const fields=parseDraftFields(draft.operation,parsed.data.fields),submitted=parsed.data.submitted?parseDraftFields(draft.operation,parsed.data.submitted.fields):null;return fields&&(!parsed.data.submitted||submitted)?{fields,phase:parsed.data.phase,submitted:parsed.data.submitted?{intentId:parsed.data.submitted.intentId,fields:submitted!}:null}:null;}});
 const lease=useRef({key});useLayoutEffect(()=>{lease.current={key};},[key]);
 const form=useRef<HTMLFormElement>(null),initialized=useRef<HTMLFormElement|null>(null),defaults=useRef<DraftFields>({}),live=useRef(recovery.value),busy=useRef(false),mounted=useRef(true);
 const [pending,setPending]=useState(false),[message,setMessage]=useState(""),[initialFields,setInitialFields]=useState<DraftFields>({});
 useLayoutEffect(()=>{live.current=recovery.value;},[recovery.value]);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useLayoutEffect(()=>{if(!form.current||initialized.current===form.current)return;initialized.current=form.current;defaults.current=readDeclaredDraftFields(form.current,draft.operation);setInitialFields(defaults.current);if(recovery.restored)applyDeclaredDraftFields(form.current,draft.operation,recovery.value.fields);else recovery.commit(recovery.value,value=>({...value,fields:defaults.current}));},[draft.operation,recovery]);
 useDraftResumeConsumer({kind:draft.operation,identity:{id:draft.id,parentId:draft.parentId},priority:2,ready:()=>isDraftHostReady(form.current),open:focusDraftForm});
 const readFields=()=>{if(!form.current)return {};const fields=readDeclaredDraftFields(form.current,draft.operation);for(const name of ["expectedRevision","expected_revision","baselineRevisions"]){const control=form.current.elements.namedItem(name),prior=recovery.value.fields[name];if(typeof prior==="string"&&control instanceof HTMLInputElement&&control.type==="hidden"){fields[name]=prior;control.value=prior;}}return fields;};
 const capture=()=>{if(form.current){const fields=readFields();recovery.setValue(value=>({...value,fields}));onFieldsChange?.();}};
 const execute=async(mode:"submit"|"read"|"retry")=>{
  if(busy.current||!form.current||!recovery.isCurrent())return;const node=form.current,scope=captureWorkspaceScope(),instance=lease.current,current=()=>recovery.isCurrent()&&scope()&&mounted.current&&form.current===node&&lease.current===instance;
  const submitted=mode==="submit"&&!live.current.submitted?{intentId:crypto.randomUUID(),fields:readFields()}:live.current.submitted;if(!submitted)return;
  const navigation=mode==="submit"?beginNavigationIntent():()=>false;busy.current=true;setPending(true);onPendingChange?.(true);setMessage("");recovery.setValue(value=>({...value,fields:mode==="submit"?submitted.fields:value.fields,submitted,phase:"needs-check"}));
  try{const outcome=await(mode==="read"?read:submit)(submitted.intentId,submitted.fields);if(!current())return;
   if(outcome.status==="saved"){
    const unchanged=draftValueFingerprint(readFields())===draftValueFingerprint(submitted.fields);const expected={...live.current,fields:submitted.fields,submitted};
    recovery.commit(expected,value=>({fields:{...(draftValueFingerprint(value.fields)===draftValueFingerprint(submitted.fields)?resetOnSaved?defaults.current:submitted.fields:value.fields),...outcome.savedFields},submitted:null,phase:"editing"}));if(unchanged)applyDeclaredDraftFields(node,draft.operation,{...(resetOnSaved?defaults.current:submitted.fields),...outcome.savedFields});setMessage(unchanged?"已保存。":"原输入已保存，当前新输入尚未保存。");busy.current=false;setPending(false);onPendingChange?.(false);onSaved?.(outcome.id,unchanged,navigation());
   }else{recovery.setValue(value=>outcome.status==="rejected"&&outcome.code==="invalid"?{...value,submitted:null,phase:"editing"}:{...value,phase:outcome.status==="missing"?"retry":"needs-check"});setMessage(outcome.message);}
  }catch{if(current())setMessage("保存结果尚未确认，原输入与提交编号已保留，请先核对原保存。");}finally{busy.current=false;if(current()){setPending(false);onPendingChange?.(false);}}
 };
 return <form ref={form} data-workflow-draft-key={key} className={className} aria-busy={pending} onInputCapture={capture} onChangeCapture={capture} onSubmit={event=>{event.preventDefault();void execute(recovery.value.submitted?"read":"submit");}}>{children}<DraftRecoveryStatus dirty={draftValueFingerprint(recovery.value.fields)!==draftValueFingerprint(initialFields)} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>{pending?<p role="status">正在保存或核对…</p>:message?<p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p>:null}{recovery.value.submitted?<div className="flex flex-wrap gap-2"><button className="ui-link min-h-11" type="button" disabled={pending} onClick={()=>void execute("read")}>核对原保存</button>{recovery.value.phase==="retry"?<button type="button" disabled={pending} className="ui-link min-h-11" onClick={()=>void execute("retry")}>重试同一次保存</button>:null}</div>:null}</form>;
}
