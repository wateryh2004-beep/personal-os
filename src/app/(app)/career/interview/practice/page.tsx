import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getPracticeQueue } from "@/features/interview/queries";

export default async function InterviewPracticePage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getPracticeQueue(context ?? null);
  const priority = data.queue.slice(0, 5);
  const rest = data.queue.slice(5);

  return (
    <>
      <PageHeader title="练习" description="系统根据面试重要性、练习新鲜度、故事成熟度和能力证据缺口决定顺序。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/practice" />

      <form className="mb-8 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="h-9 max-w-sm rounded-[10px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="pressable rounded-[7px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">切换</button>
      </form>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.008em] text-[var(--text-primary)]">今天先练</h2>
          <span className="text-[10.5px] text-[var(--text-tertiary)]">{priority.length} 道</span>
        </div>
        <div className="mt-3 space-y-px">
          {priority.map((item: any) => <PracticeRow key={item.id} item={item} />)}
        </div>
      </section>

      {rest.length ? (
        <details className="mt-9">
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1 py-0.5 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            其他可练 · {rest.length}
          </summary>
          <div className="mt-3 space-y-px">
            {rest.map((item: any) => <PracticeRow key={item.id} item={item} />)}
          </div>
        </details>
      ) : null}

      {!data.queue.length ? <p className="py-14 text-[13px] text-[var(--text-tertiary)]">没有可练习的母题。</p> : null}
    </>
  );
}

function PracticeRow({ item }: { item: any }) {
  const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
  const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
  return (
    <Link
      href={`/career/interview/practice/${item.id}`}
      className="group grid min-h-14 gap-1 rounded-[10px] px-2.5 py-3 transition-colors ui-transition hover:bg-[var(--surface-hover)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <p className="text-[13.5px] leading-5.5 text-[var(--text-primary)]">{item.prompt_override || question?.canonical_prompt}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--text-tertiary)]">
          {interviewContext?.title ? <span>{interviewContext.title}</span> : null}
          {(item.practice_reasons ?? []).map((reason: string) => <span key={reason}>· {reason}</span>)}
        </div>
      </div>
      <div className="mt-1 flex shrink-0 items-center gap-3 text-[10.5px] text-[var(--text-tertiary)] sm:mt-0">
        <span>{item.usable_story_count ?? 0} 个可用故事</span>
        <span>{item.covered_competency_count ?? 0}/{item.competency_count ?? 0} 能力证据</span>
      </div>
    </Link>
  );
}
