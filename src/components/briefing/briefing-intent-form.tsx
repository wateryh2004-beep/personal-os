"use client";

import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from "react";
import { z } from "zod";
import { submitBriefingFormIntentAction,reconcileBriefingFormIntentAction } from "@/features/briefing/actions";
import { briefingFormIntentSchema,type BriefingFormIntent,type BriefingFormOutcome } from "@/features/briefing/form-intents";
import { draftValueFingerprint,useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { readDeclaredDraftFields,applyDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { parseDraftFields,type DraftFields } from "@/features/workflow-continuity/draft-contracts";
import { draftResumeKey,focusDraftForm,useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";

const operationByKind={"feed-create":"briefing.feed-create","feed-edit":"briefing.feed-edit","feed-verify":"briefing.feed-verify","interest-create":"briefing.interest-create","interest-edit":"briefing.interest-edit","exclusion-create":"briefing.exclusion",settings:"briefing.settings"} as const;
const hrefByKind={"feed-create":"/briefing/sources","feed-edit":"/briefing/sources","feed-verify":"/briefing/sources","interest-create":"/briefing/interests","interest-edit":"/briefing/interests","exclusion-create":"/briefing/interests",settings:"/settings"} as const;
type Envelope={fields:DraftFields;submittedFields:DraftFields|null;expectedUpdatedAt:string|null;intent:BriefingFormIntent|null};
export type BriefingFormTransport={save:(intent:BriefingFormIntent)=>Promise<BriefingFormOutcome>;reconcile:(intent:BriefingFormIntent)=>Promise<BriefingFormOutcome>};
export function BriefingIntentForm({kind,id,expectedUpdatedAt=null,children,className,onSaved,transport}:{kind:BriefingFormIntent["kind"];id?:string;expectedUpdatedAt?:string|null;children:ReactNode;className?:string;onSaved?:()=>void;transport?:BriefingFormTransport}) {
 assertContinuousFixtureTransport(transport);
 const operation=operationByKind[kind],target={kind:operation,id:kind==="settings"?"owner":id??"new"},key=draftResumeKey(target),form=useRef<HTMLFormElement>(null);
 const draft=useWorkflowDraft<Envelope>({kind:"capture",id:`form:${key}`,label:kind==="settings"?"简报设置":"简报未保存输入",resumeHref:hrefByKind[kind],resumeTarget:target,initialValue:{fields:{},submittedFields:null,expectedUpdatedAt,intent:null},parse:input=>{const result=z.object({fields:z.unknown(),submittedFields:z.unknown().optional(),expectedUpdatedAt:z.string().datetime({offset:true}).nullable(),intent:briefingFormIntentSchema.nullable()}).strict().safeParse(input);if(!result.success)return null;const fields=parseDraftFields(operation,result.data.fields);const submittedFields=result.data.submittedFields===null||result.data.submittedFields===undefined?null:parseDraftFields(operation,result.data.submittedFields);const intent=result.data.intent;if(!fields||result.data.submittedFields!=null&&!submittedFields||intent&&(intent.kind!==kind||"feed_id"in intent&&intent.feed_id!==id||"interest_id"in intent&&intent.interest_id!==id))return null;return {...result.data,fields,submittedFields};}});
 const initial=useRef<HTMLFormElement|null>(null),mounted=useRef(true),lease=useRef({key});useLayoutEffect(()=>{lease.current={key};},[key]);
 const busy=useRef<symbol|null>(null),[pending,setPending]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useLayoutEffect(()=>{const node=form.current;if(!node||initial.current===node)return;const remount=Boolean(initial.current);initial.current=node;if(draft.restored||remount)applyDeclaredDraftFields(node,operation,draft.value.fields);else draft.commit(draft.value,before=>({...before,fields:readDeclaredDraftFields(node,operation)}));});
 useDraftResumeConsumer({kind:operation,identity:{id:target.id},priority:2,ready:()=>Boolean(form.current?.isConnected&&!form.current.closest("[hidden],[inert]")),open:focusDraftForm});
 function capture(){if(form.current)draft.setValue(before=>({...before,fields:readDeclaredDraftFields(form.current!,operation)}));}
 async function submit(){if(busy.current||!form.current||!draft.isCurrent())return;const fields=readDeclaredDraftFields(form.current,operation),snapshot=draft.value;
 const metadata=kind==="feed-edit"||kind==="feed-verify"?{feed_id:id,expectedUpdatedAt:snapshot.expectedUpdatedAt}:kind==="interest-edit"?{interest_id:id,expectedUpdatedAt:snapshot.expectedUpdatedAt}:kind==="settings"?{expectedUpdatedAt:snapshot.expectedUpdatedAt}:{};
 const parsed=briefingFormIntentSchema.safeParse(snapshot.intent??{...fields,...metadata,kind,intentId:crypto.randomUUID()});if(!parsed.success){setMessage("填写内容或原记录版本不完整，当前输入已保留。");return;}
 const submittedFields=snapshot.intent?snapshot.submittedFields:fields;const intent=parsed.data,token=Symbol(key),scope=captureWorkspaceScope(),instance=lease.current,current=()=>draft.isCurrent()&&mounted.current&&scope()&&lease.current===instance;
 busy.current=token;setPending(true);setMessage("");draft.setValue(before=>({...before,fields,intent,submittedFields}));
 try{const result=await (snapshot.intent?(transport?.reconcile??reconcileBriefingFormIntentAction):(transport?.save??submitBriefingFormIntentAction))(intent);if(!current())return;
 if(result.status!=="saved"){setMessage(result.message);if(result.status==="rejected"&&result.code==="invalid")draft.setValue(before=>({...before,intent:null,submittedFields:null}));return;}
 const unchanged=submittedFields!==null&&draftValueFingerprint(readDeclaredDraftFields(form.current!,operation))===draftValueFingerprint(submittedFields);
 const create=kind==="feed-create"||kind==="interest-create"||kind==="exclusion-create";if(create&&unchanged)form.current!.reset();const savedFields=create&&unchanged?readDeclaredDraftFields(form.current!,operation):submittedFields??{};
 draft.commit({...snapshot,fields:submittedFields??{},submittedFields,intent},before=>({...before,fields:submittedFields!==null&&draftValueFingerprint(before.fields)===draftValueFingerprint(submittedFields)?savedFields:before.fields,intent:null,submittedFields:null,expectedUpdatedAt:result.updatedAt}));setMessage(unchanged?result.message:"原输入已保存，当前新输入尚未保存。");if(unchanged)onSaved?.();
 }catch{if(current())setMessage("尚未确认保存结果。原输入和意图已保留，再次操作只核对原记录。");}finally{if(busy.current===token){busy.current=null;if(current())setPending(false);}}
 }
 return <form ref={form} data-workflow-draft-key={key} onInputCapture={capture} onChangeCapture={capture} onSubmit={event=>{event.preventDefault();void submit();}} aria-busy={pending} className={className}>{children}<DraftRecoveryStatus restored={draft.restored} recoveryUnavailable={draft.recoveryUnavailable} dirty={Boolean(Object.keys(draft.value.fields).length)}/>{pending?<p role="status" className="text-xs">正在保存或核对…</p>:message?<p role="status" className="text-xs leading-5">{message}</p>:null}{draft.value.intent&&!pending?<button type="button" className="ui-link min-h-11 text-xs" onClick={()=>void submit()}>核对原保存</button>:null}</form>;
}
