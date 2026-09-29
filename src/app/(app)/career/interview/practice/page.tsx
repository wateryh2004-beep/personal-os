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

      <form className="mb-8 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="max-w-sm px-3 py-2 text-sm text-zinc-600">
          <option value="">全部岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="text-xs text-zinc-400 hover:text-zinc-700">切换</button>
      </form>

      <div className="space-y-1">
        {data.queue.map((item: any) => {
          const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
          const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
          const due = !item.next_practice_at || Date.parse(item.next_practice_at) <= now;

          return (
            <Link
              href={`/career/interview/practice/${item.id}`}
              key={item.id}
              className="group flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 hover:bg-white/70"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-zinc-800">{item.prompt_override || question?.canonical_prompt}</p>
                {interviewContext?.title ? <p className="mt-0.5 text-xs text-zinc-400">{interviewContext.title}</p> : null}
              </div>
              {due ? <span className="shrink-0 text-xs text-amber-700">待练</span> : null}
            </Link>
          );
        })}
      </div>

      {!data.queue.length ? <p className="py-12 text-sm text-zinc-400">没有可练习的题目。</p> : null}
    </>
  );
}
