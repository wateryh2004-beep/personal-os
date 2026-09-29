import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { getPracticeQueue } from "@/features/interview/queries";
import { categoryLabels, importanceLabels, statusLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewPracticePage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getPracticeQueue(context ?? null);
  const now = Date.now();

  return (
    <>
      <PageHeader title="模拟练习" description="按目标岗位、到期时间和重要性安排练习；不是随机刷题。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/practice" />

      <form className="mb-6 flex flex-wrap items-end gap-3 border-y py-4">
        <label className="grid min-w-64 gap-1 text-sm">
          <span>目标岗位</span>
          <select name="context" defaultValue={context ?? ""} className="border bg-white px-3 py-2">
            <option value="">全部目标</option>
            {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <button className="bg-zinc-900 px-3 py-2 text-sm text-white">切换队列</button>
      </form>

      <div className="mb-5 flex flex-wrap gap-4 text-sm text-zinc-500">
        <span>{data.queue.length} 道待练题目</span>
        <span>{data.queue.filter((item: any) => !item.next_practice_at || Date.parse(item.next_practice_at) <= now).length} 道需要练习</span>
      </div>

      <div className="divide-y border-y">
        {data.queue.map((item: any, index: number) => {
          const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
          const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
          const due = !item.next_practice_at || Date.parse(item.next_practice_at) <= now;
          return (
            <Link href={`/career/interview/practice/${item.id}`} key={item.id} className="grid gap-3 py-4 hover:bg-zinc-50 sm:grid-cols-[44px_1fr_auto] sm:px-2">
              <span className="font-mono text-sm text-zinc-400">#{index + 1}</span>
              <div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-[#365F78]">{categoryLabels[question?.category] ?? question?.category}</span>
                  <span className="text-zinc-400">{interviewContext?.title || "通用"}</span>
                  {due ? <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">待练</span> : null}
                </div>
                <h2 className="mt-1 font-medium">{item.prompt_override || question?.short_title || question?.canonical_prompt}</h2>
                {item.next_focus ? <p className="mt-1 text-sm text-zinc-500">下次重点： {item.next_focus}</p> : null}
              </div>
              <div className="text-right text-xs text-zinc-500">
                <p className="font-medium text-zinc-700">{statusLabels[item.status] ?? item.status}</p>
                <p className="mt-1">{importanceLabels[item.importance] ?? item.importance}</p>
                <p className="mt-1">上次 {formatDateTime(item.last_practiced_at)}</p>
              </div>
            </Link>
          );
        })}
      </div>
      {!data.queue.length ? <div className="py-20 text-center"><p className="font-medium">当前没有可练习的题目</p><p className="mt-2 text-sm text-zinc-500">先在题库中创建题目，并为目标岗位建立准备。</p></div> : null}
    </>
  );
}
