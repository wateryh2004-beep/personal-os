"use client";

import { useEffect,useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, LoaderCircle, PenLine } from "lucide-react";
import { saveBriefingJudgmentIntentAction, reconcileBriefingJudgmentIntentAction } from "@/features/briefing/actions";
import { judgmentReviewPeriods, type BriefingJudgment } from "@/features/briefing/judgments";
import type { BriefingJudgmentIntent, BriefingJudgmentOutcome } from "@/features/briefing/judgment-intents";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";

const fieldsSchema=z.object({judgment:z.string().max(5000),confidence:z.string().max(30),falsification:z.string().max(2000),reviewPeriod:z.enum(["1_month","3_months","6_months","1_year"])}).strict();
const intentSchema=fieldsSchema.extend({intentId:z.string().uuid(),entryId:z.string().uuid(),expectedDecisionId:z.string().uuid().nullable(),expectedUpdatedAt:z.string().datetime({offset:true}).nullable()}).strict();
const envelopeSchema=z.object({fields:fieldsSchema,baseline:z.object({decisionId:z.string().uuid().nullable(),updatedAt:z.string().datetime({offset:true}).nullable()}).strict(),intent:intentSchema.nullable(),blocked:z.boolean()}).strict();
type Envelope=z.infer<typeof envelopeSchema>;
export type JudgmentTransport={save:(intent:BriefingJudgmentIntent)=>Promise<BriefingJudgmentOutcome>;reconcile:(intent:BriefingJudgmentIntent)=>Promise<BriefingJudgmentOutcome>};
const defaultTransport:JudgmentTransport={save:saveBriefingJudgmentIntentAction,reconcile:reconcileBriefingJudgmentIntentAction};

/** A saved badge follows a canonical receipt, including after an uncertain request. */
export function JudgmentForm({entryId,existing,transport}:{entryId:string;existing:BriefingJudgment|null;transport?:JudgmentTransport}) {
  assertContinuousFixtureTransport(transport);
  const actions=transport??defaultTransport;
  const [open,setOpen]=useState(Boolean(existing)),[pending,setPending]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState("");
  const formRef=useRef<HTMLFormElement>(null),hostRef=useRef<HTMLDivElement>(null),busy=useRef<symbol|null>(null),mounted=useRef(true);
  const identity=useRef({id:entryId,token:Symbol(entryId)});useLayoutEffect(()=>{identity.current={id:entryId,token:Symbol(entryId)};busy.current=null;},[entryId]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const draft=useWorkflowDraft<Envelope>({kind:"capture",id:`briefing-judgment:${entryId}`,label:"简报判断",resumeHref:"/briefing",resumeTarget:{kind:"briefing.judgment",id:entryId},initialValue:{fields:{judgment:existing?.decisionText??"",confidence:String(existing?.confidence??60),falsification:existing?.falsificationCondition??"",reviewPeriod:"3_months"},baseline:{decisionId:existing?.id??null,updatedAt:existing?.updatedAt??null},intent:null,blocked:false},parse:value=>{const parsed=envelopeSchema.safeParse(value);return parsed.success&&(!parsed.data.intent||parsed.data.intent.entryId===entryId)?parsed.data:null;}});
  const live=useRef(draft.value);useLayoutEffect(()=>{live.current=draft.value;},[draft.value]);
  const currentGuard=()=>{const scope=captureWorkspaceScope(),key=identity.current;return()=>draft.isCurrent()&&mounted.current&&scope()&&identity.current===key;};
  useDraftResumeConsumer({kind:"briefing.judgment",identity:{id:entryId},ready:()=>Boolean(hostRef.current?.isConnected&&!hostRef.current.closest("[hidden],[inert]")),open:async(target,context)=>{setOpen(true);return focusDraftForm(target,context);}});
  function update<K extends keyof Envelope["fields"]>(field:K,value:Envelope["fields"][K]){setSaved(false);draft.setValue(before=>({...before,fields:{...before.fields,[field]:value}}));}
  async function run(readOnly:boolean) {
    if(busy.current||draft.value.blocked||!draft.isCurrent())return;
    if(draft.value.baseline.decisionId&&!draft.value.baseline.updatedAt){setMessage("原判断版本信息不完整，请重新读取条目后再保存。当前输入已保留。");return;}
    const snapshot=draft.value;
    const intent=snapshot.intent??{...snapshot.fields,intentId:crypto.randomUUID(),entryId,expectedDecisionId:snapshot.baseline.decisionId,expectedUpdatedAt:snapshot.baseline.updatedAt};
    const token=Symbol(intent.intentId),current=currentGuard();busy.current=token;setPending(true);setSaved(false);setMessage("");
    // Persist before the request. Returning here can only read the same intent.
    draft.setValue(before=>({...before,intent}));
    try{
      const result=await (readOnly||snapshot.intent?actions.reconcile(intent):actions.save(intent));
      if(!current())return;
      if(result.status!=="saved"){setMessage(result.message);if(result.status==="rejected"&&result.code!=="conflict")draft.setValue(before=>({...before,intent:null}));return;}
      if(result.entryId!==entryId){setMessage("返回记录不匹配，输入已保留，请核对原判断。");return;}
      const frozenFields={judgment:intent.judgment,confidence:intent.confidence,falsification:intent.falsification,reviewPeriod:intent.reviewPeriod};const unchanged=JSON.stringify(live.current.fields)===JSON.stringify(frozenFields);
      draft.commit({...snapshot,fields:frozenFields,intent},before=>({...before,intent:null,baseline:result.superseded?before.baseline:{decisionId:result.decisionId,updatedAt:result.updatedAt},blocked:result.superseded}));
      setSaved(unchanged&&!result.superseded);
      setMessage(result.superseded?"这次判断已经保存，之后出现了更新版本。请重新读取条目核对；当前输入已保留。":unchanged?"判断已保存。":"原判断已保存，当前新输入尚未保存。");
    }catch{if(current())setMessage("尚未确认保存结果。输入与原提交意图已保留，请核对原记录。");}
    finally{if(busy.current===token){busy.current=null;if(current())setPending(false);}}
  }
  return <div ref={hostRef}>{!open?<button type="button" onClick={()=>setOpen(true)} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><PenLine className="size-3.5" aria-hidden="true"/>写下判断</button>:<div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-app)] p-3"><form ref={formRef} data-workflow-draft-key={draftResumeKey({kind:"briefing.judgment",id:entryId})} onSubmit={event=>{event.preventDefault();void run(false);}} aria-busy={pending} className="space-y-3">
    <label className="block"><span className="text-xs font-medium text-[var(--text-secondary)]">我的判断</span><textarea name="judgment" required maxLength={5000} value={draft.value.fields.judgment} onChange={event=>update("judgment",event.target.value)} placeholder="你认为这件事说明了什么？它会怎样发展？" rows={3} className="ui-field mt-1 w-full resize-y text-sm leading-6"/></label>
    <label className="block"><span className="flex justify-between text-xs font-medium text-[var(--text-secondary)]"><span>置信度</span><span>{draft.value.fields.confidence}%</span></span><input type="range" name="confidence" min={0} max={100} step={5} value={draft.value.fields.confidence} onChange={event=>update("confidence",event.target.value)} className="mt-1.5 w-full"/></label>
    <label className="block"><span className="text-xs font-medium text-[var(--text-secondary)]">什么会证明我错了？（可选）</span><textarea name="falsification" maxLength={2000} value={draft.value.fields.falsification} onChange={event=>update("falsification",event.target.value)} placeholder="写出一个可观察的条件，满足时你的判断需要修正。" rows={2} className="ui-field mt-1 w-full resize-y text-sm leading-6"/></label>
    <label className="block"><span className="text-xs font-medium text-[var(--text-secondary)]">回看日期</span><select name="review_period" value={draft.value.fields.reviewPeriod} onChange={event=>{const value=event.target.value;if(value==="1_month"||value==="3_months"||value==="6_months"||value==="1_year")update("reviewPeriod",value);}} className="ui-field mt-1 min-h-11 w-full text-sm">{judgmentReviewPeriods.map(period=><option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
    <div className="flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="min-h-11 rounded-[var(--radius-sm)] px-3 text-xs">收起</button><button type="submit" disabled={pending||draft.value.blocked} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white disabled:opacity-60">{pending?<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true"/>:saved?<Check className="size-3.5" aria-hidden="true"/>:<PenLine className="size-3.5" aria-hidden="true"/>}{pending?"保存中…":draft.value.intent?"核对原判断":saved?"已保存":"保存判断"}</button></div>
    {message?<p role="status" className="text-xs leading-5">{message}</p>:null}<DraftRecoveryStatus restored={draft.restored} recoveryUnavailable={draft.recoveryUnavailable}/>
  </form></div>}</div>;
}
