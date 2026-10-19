"use client";
import { useState } from "react";
import Link from "next/link";
import type { Tables } from "@/types/database";
import { CareerTaskDialog } from "./experience-form-dialog";
import { TextField } from "./form-controls";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";
type Question = Pick<Tables<"interview_questions">,"id"|"canonical_prompt"|"parent_question_id">;
export function AddTargetQuestions({ contextId, questions, preparedIds, unavailable }: { contextId: string; questions: Question[]; preparedIds: string[]; unavailable: boolean }) {
  const [query,setQuery] = useState("");
  const terms=query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidates=questions.filter(q=>!q.parent_question_id && !preparedIds.includes(q.id) && terms.every(term=>q.canonical_prompt.normalize("NFKC").toLocaleLowerCase().includes(term)));
  return <div className="flex flex-wrap gap-3">
    <CareerTaskDialog operation="ensureInterviewPreparation" title="从题库加入" description="选择一道已有题目，加入此岗位的准备范围；原题与答案保持不变。" submitLabel="加入并打开题目" recoveryHref={`/career/interview/targets/${contextId}`}>
      <input type="hidden" name="context_id" value={contextId}/>
      <label className="grid gap-2 text-sm sm:col-span-2">搜索已有题目<input type="search" value={query} onChange={e=>setQuery(e.target.value)} className="ui-field min-h-11 rounded-xl bg-[var(--surface-control)] px-3 text-base"/></label>
      <label className="grid min-w-0 gap-2 text-sm sm:col-span-2">选择题目<select aria-label="选择题目" name="question_id" required className="ui-field min-h-11 w-full min-w-0 rounded-xl bg-[var(--surface-control)] px-3 text-base" defaultValue=""><option value="">请选择题目（{candidates.length}）</option>{candidates.map(q=><option key={q.id} value={q.id}>{presentInterviewPrompt(q.canonical_prompt).question}</option>)}</select></label>
      {!candidates.length ? <p className="text-sm leading-7 sm:col-span-2">{unavailable ? "题库未完整读取，请重新读取后核对。" : "没有匹配的可加入题目，可调整搜索或新建题目。"}</p> : null}
      <Link href="/career/interview/questions" className="ui-link inline-flex min-h-11 items-center text-sm sm:col-span-2">浏览完整题库</Link>
    </CareerTaskDialog>
    <CareerTaskDialog operation="createInterviewQuestion" title="新建岗位题目" description="记录原始问题，创建后进入题目详情继续补充。" submitLabel="创建题目" recoveryHref={`/career/interview/targets/${contextId}`}>
      <input type="hidden" name="context_id" value={contextId}/><div className="sm:col-span-2"><TextField name="canonical_prompt" label="题目原文" required maxLength={10000}/></div>
      {Object.entries({short_title:"",category:"behavioral",subcategory:"",competency_tags:"",prompt_variants:"",source_type:"manual",source_name:"",source_url:"",source_observed_at:"",source_detail:"",parent_question_id:"",follow_up_kind:"",difficulty:"3"}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
    </CareerTaskDialog>
  </div>;
}
