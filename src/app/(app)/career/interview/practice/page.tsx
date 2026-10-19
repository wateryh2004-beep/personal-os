import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { PracticeScope, PracticeUnavailable, practiceScopeHref } from "@/components/career/interview/practice-scope";
import { Button } from "@/components/ui/button";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { getPracticeQueue } from "@/features/interview/queries";

export default async function InterviewPracticePage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getPracticeQueue(context ?? null);
  const priority = data.queue.slice(0, 5);
  const rest = data.queue.slice(5);
  const unpracticed = data.queue.filter((item) => !item.attempt_count).length;
  const first = priority[0];
  const learningHref = practiceScopeHref("/career/interview", context);

  return <>
    <PageHeader title="练习" action={<Button asChild variant="outline"><Link href={practiceScopeHref("/career/interview/insights", context)}>查看复盘</Link></Button>} />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/practice" context={context} />
    <PracticeScope contexts={data.contexts} context={context} />
    {data.unavailable ? <PracticeUnavailable href={practiceScopeHref("/career/interview/practice", context)} /> : null}
    {first ? <section aria-labelledby="practice-priority-title" className="rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="practice-priority-title" className="text-lg font-semibold text-[var(--text-primary)]">优先练习</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{data.queue.length} 道可练，{unpracticed} 道尚无练习记录</p>
        </div>
        <Button asChild><Link href={`/career/interview/practice/${first.id}`}>开始第一题</Link></Button>
      </div>
      <p className="mt-4 text-[13px] leading-6 text-[var(--text-secondary)]">按面试安排、练习记录和故事证据排序；每行显示本题推荐原因。</p>
      <ul className="mt-4 divide-y divide-[var(--separator)]">{priority.map((item) => <li key={item.id}><PracticeRow item={item} /></li>)}</ul>
    </section> : !data.unavailable ? <section className="rounded-[var(--radius-xl)] bg-[var(--surface-canvas)] px-5 py-10">
      <h2 className="text-lg font-medium text-[var(--text-primary)]">当前范围没有可练习题目</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">先在学习库准备一道题，再回来作答。</p>
      <Button asChild className="mt-5"><Link href={learningHref}>前往学习库</Link></Button>
    </section> : null}
    {rest.length ? <details className="mt-6">
      <DisclosureSummary>其余可练题目（{rest.length} 道）</DisclosureSummary>
      <ul className="mt-3 divide-y divide-[var(--separator)]">{rest.map((item) => <li key={item.id}><PracticeRow item={item} /></li>)}</ul>
    </details> : null}
  </>;
}

function PracticeRow({ item }: { item: Awaited<ReturnType<typeof getPracticeQueue>>["queue"][number] }) {
  const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
  const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
  const presentation = presentInterviewPrompt(item.prompt_override || question?.canonical_prompt || "未命名问题");
  return <Link href={`/career/interview/practice/${item.id}`} className="ui-record-link grid min-h-16 min-w-0 gap-3 rounded-[var(--radius-md)] py-4 pl-2 pr-9 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <p className="break-words text-[15px] leading-7 text-[var(--text-primary)]">{presentation.question}</p>
      <p className="mt-1 text-[13px] leading-6 text-[var(--text-secondary)]">{interviewContext?.title || "通用面试"}</p>
      {item.practice_reasons?.length ? <p className="mt-1 text-[13px] leading-6 text-[var(--accent)]">{item.practice_reasons.join("；")}</p> : null}
    </div>
    <div className="space-y-1 text-[13px] leading-6 tabular-nums text-[var(--text-secondary)] sm:text-right">
      <p>{item.attempt_count ?? 0} 次练习</p>
      <p>{item.usable_story_count ?? 0} 个可用故事</p>
      {item.competency_count ? <p>{item.covered_competency_count ?? 0}/{item.competency_count} 项能力有故事证据</p> : <p>尚未关联能力</p>}
    </div>
  </Link>;
}
