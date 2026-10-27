"use client";
import {useState} from "react";
import type {OrdinaryComparison} from "@/features/workflow-continuity/ordinary-comparison";
import {useOrdinaryComparisonTransport} from "@/features/workflow-continuity/ordinary-comparison-transport";
import type {DraftResumeTarget} from "@/features/workflow-continuity/draft-resume";
import type {DraftFields} from "@/features/workflow-continuity/draft-contracts";
import {useRevisionRecovery} from "@/components/shared/revision-recovery";
import {careerFieldLabels} from "@/features/career/form-state";
import {Button} from "@/components/ui/button";
const labels:Record<string,string>={ai_visibility:"AI 可见范围",folder_id:"所属文件夹",working_thoughts_markdown:"当前思路",prompt_override:"题目原文",answer_logic_markdown:"回答逻辑",key_message:"核心信息",next_focus:"下一步",personal_note:"个人备注",overall_review_markdown:"整场复盘",strength_tags:"优势",issue_tags:"待改进",semantic_retrieval_opt_in:"语义检索",long_term_memory_opt_in:"长期记忆",max_context_chars_per_request:"单次上下文字符",max_output_tokens_per_request:"单次输出上限",daily_call_limit:"每日调用上限",monthly_call_limit:"每月调用上限",daily_cost_limit_usd:"每日费用上限",monthly_cost_limit_usd:"每月费用上限",estimated_input_cost_per_million_usd:"输入估算费率",estimated_output_cost_per_million_usd:"输出估算费率"};
/** Opening a list is not reconciliation. Only a fresh actual record enables explicit rebase. */
export function OrdinaryOutcomeRecovery({uncertain,target,href,onCompared,captureGuard}:{uncertain:boolean;target:DraftResumeTarget;href:string;onCompared:(baselines:DraftFields)=>void;captureGuard:()=>()=>boolean}){
 const readOrdinaryDraftComparison=useOrdinaryComparisonTransport(),recovery=useRevisionRecovery<OrdinaryComparison>(),[adopted,setAdopted]=useState(false);
 if(!uncertain)return null;
 const fresh=recovery.latest?.status==="ready"&&recovery.showing?recovery.latest:null;
 return <section aria-label="原保存结果待核对" className="mt-3 space-y-3 rounded-lg border border-[var(--separator)] p-3 text-sm leading-6"><p role="status">原保存结果尚未确认。输入仍保留，本次保存不会重复发送。</p><a className="ui-link inline-flex min-h-11 items-center" href={href} target="_blank" rel="noopener noreferrer">打开原记录或所属清单核对</a><p className="text-xs text-[var(--text-secondary)]">打开页面不会确认保存，也不会解除待核对状态。无法定位原创建结果时，此草稿会继续保留。</p><Button type="button" variant="outline" disabled={recovery.reading} onClick={()=>{const current=captureGuard();setAdopted(false);void recovery.read(async()=>{const value=await readOrdinaryDraftComparison(target);if(!current())throw new Error("原编辑入口已变化，待核对状态仍保留。");return value;});}}>{recovery.reading?"正在读取原记录…":"读取原记录并比较"}</Button>{recovery.error?<p role="alert">{recovery.error}</p>:null}{recovery.latest&&recovery.latest.status!=="ready"?<p role="status">{recovery.latest.message}</p>:null}{fresh?<div aria-label="原记录最新内容比较"><p>当前原记录（不能据此确认上一次提交成功）</p><dl className="max-h-80 space-y-2 overflow-y-auto">{Object.entries(fresh.fields).map(([name,value])=><div key={name}><dt className="font-medium">{labels[name]??careerFieldLabels[name]??"当前字段"}</dt><dd className="whitespace-pre-wrap break-words">{typeof value==="boolean"?value?"开启":"关闭":Array.isArray(value)?value.join("、"):value||"未填写"}</dd></div>)}</dl><Button type="button" variant="outline" disabled={adopted} onClick={()=>{onCompared(fresh.baselines);setAdopted(true);recovery.dismiss();}}>采用比较后的当前版本，保留输入</Button></div>:null}</section>;
}
