import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getPracticeQueue } from "@/features/interview/queries";

export default async function InterviewPracticePage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getPracticeQueue(context ?? null);
  const now = Date.now();

  return (
    <>
      <PageHeader title="练习" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/practice" />

      <form className="mb-7 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="h-9 max-w-sm rounded-[10px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="pressable rounded-[7px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">切换</button>
      </form>

      <div className="space-y-px">
        {data.queue.map((item: any) => {
          const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
          const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
          const due = !item.next_practice_at || Date.parse(item.next_practice_at) <= now;

          return (
            <Link
              href={`/career/interview/practice/${item.id}`}
              key={item.id}
              className="group flex min-h-12 items-center justify-between gap-4 rounded-[10px] px-2.5 py-3 transition-colors ui-transition hover:bg-[var(--surface-hover)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-5.5 text-[var(--text-primary)]">{item.prompt_override || question?.canonical_prompt}</p>
                {interviewContext?.title ? <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{interviewContext.title}</p> : null}
              </div>
              {due ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700">待练</span> : null}
            </Link>
          );
        })}
      </div>

      {!data.queue.length ? <p className="py-14 text-[13px] text-[var(--text-tertiary)]">没有可练习的题目。</p> : null}
    </>
  );
}
