import Link from "next/link";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import type { getCareerTarget } from "@/features/career/queries";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "./career-nav";
import { TargetForm } from "./target-form";
import { AddTargetQuestions } from "./target-questions";
import { TargetReadNotice } from "./target-read-notice";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { getCareerPreparationCounts } from "@/features/career/next-actions";
import { targetStatusLabels } from "@/features/career/target-library";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";
export function TargetDetail({ data, returnHref }: { data: NonNullable<Awaited<ReturnType<typeof getCareerTarget>>>; returnHref: string }) {
  const {target,preparations,questions,timezone,now,unavailable}=data;
  const questionById = new Map(questions.map(q=>[q.id,q]));
  const rows=preparations.flatMap(prep=>{ const question=questionById.get(prep.question_id); return question ? [{prep,question}] : []; });
  const counts=getCareerPreparationCounts(rows.map(row=>row.prep),now);
  const format=(value:string)=>new Date(value).toLocaleString("zh-CN",{timeZone:timezone,dateStyle:"medium",timeStyle:"short"});
  const missing=preparations.length-rows.length;
  return <>
    <PageHeader title={target.role_title_snapshot || target.title} description={target.organization_snapshot || undefined} eyebrow={<Link href={returnHref} className="ui-link inline-flex min-h-11 items-center">返回目标岗位</Link>} action={<TargetForm target={target} timezone={timezone}/>}/>
    <CareerNav current="/career"/>
    <TargetReadNotice unavailable={unavailable}/>
    <section aria-label="岗位概况" className="mb-8 grid gap-6 rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><dl className="grid grid-cols-2 gap-5 text-sm"><div><dt className="text-[var(--text-secondary)]">准备状态</dt><dd className="mt-2">{targetStatusLabels[target.status] ?? target.status}</dd></div><div><dt className="text-[var(--text-secondary)]">优先级</dt><dd className="mt-2">{target.priority} / 5</dd></div><div><dt className="text-[var(--text-secondary)]">准备语言</dt><dd className="mt-2">{{zh:"中文",en:"英文",bilingual:"双语"}[target.default_language] ?? target.default_language}</dd></div><div><dt className="text-[var(--text-secondary)]">面试时间（{timezone}）</dt><dd className="mt-2 leading-7">{target.next_interview_at ? <time dateTime={target.next_interview_at}>{format(target.next_interview_at)}</time>:"未安排"}</dd></div></dl></div>
      <div className="flex max-w-md flex-wrap items-start gap-3">{target.status === "active" ? <><Button asChild><Link href={`/career/interview?context=${target.id}`}>进入岗位学习</Link></Button><Link className="ui-action-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-sm" href={`/career/interview/practice?context=${target.id}`}>练习</Link><Link className="ui-link inline-flex min-h-11 items-center px-2 text-sm" href={`/career/interview/insights?context=${target.id}`}>复盘</Link></> : <p className="text-sm leading-7 text-[var(--text-secondary)]">此岗位{targetStatusLabels[target.status] ?? target.status}。可查看已有题目；继续准备前，请在编辑岗位中调整准备状态。</p>}</div>
    </section>
    <details className="mb-8 min-w-0 max-w-[820px]"><DisclosureSummary className="min-h-11 text-base">岗位备注</DisclosureSummary><div className="pt-4">{target.notes_markdown?.trim() ? <EntityMarkdown body={target.notes_markdown} headingOffset={2} className="min-w-0 text-base leading-7 [overflow-wrap:anywhere] [&_p]:leading-7 [&_pre]:max-w-full"/>:<p className="text-sm leading-7 text-[var(--text-secondary)]">尚未填写岗位备注，可在编辑岗位中补充。</p>}</div></details>
    <section aria-labelledby="target-questions-heading" className="min-w-0 border-t border-[var(--separator)] pt-7"><div className="flex flex-wrap items-center justify-between gap-4"><h2 id="target-questions-heading" className="text-lg font-medium">岗位题目 · {rows.length}{unavailable ? "（已读取）" : ""}</h2><AddTargetQuestions contextId={target.id} questions={questions} preparedIds={preparations.map(p=>p.question_id)} unavailable={unavailable}/></div>
      <p className="my-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--text-secondary)]"><span>{counts.ready}/{rows.length} 已准备</span><span>{counts.due} 到期练习</span><span>{counts.unscheduled} 待安排练习</span></p>
      {missing ? <p role="status" className="mb-4 text-sm leading-7 text-[var(--text-secondary)]">{missing} 条准备记录的原题已归档或暂不可读，未计入下方题目。</p>:null}
      <ul className="divide-y divide-[var(--separator)]">{rows.map(({prep,question})=><li key={prep.id}><Link prefetch={false} className="ui-record-link grid min-w-0 gap-2 rounded-xl py-5 pl-3 pr-9 md:grid-cols-[minmax(0,1fr)_auto]" href={`/career/interview/questions/${question.id}?context=${target.id}`}><span className="min-w-0 whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{presentInterviewPrompt(prep.prompt_override || question.canonical_prompt).question}</span><span className="text-sm leading-7 text-[var(--text-secondary)]">{prep.status === "paused" ? "已暂停" : prep.next_practice_at ? `${Date.parse(prep.next_practice_at)<=now ? "到期练习" : "下次练习"} · ${format(prep.next_practice_at)}` : prep.status === "ready" ? "已准备" : "待安排练习"}</span></Link></li>)}</ul>
      {!rows.length ? <p className="py-8 text-sm leading-7 text-[var(--text-secondary)]">{unavailable ? "岗位题目未完整读取，请重新读取后核对。" : "此岗位还没有题目。可从题库加入，或记录新问题。"}</p>:null}
    </section>
  </>;
}
