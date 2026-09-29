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
  const dueCount = data.queue.filter((item: any) => !item.next_practice_at || Date.parse(item.next_practice_at) <= now).length;

  return (
    <>
      <PageHeader title="模拟练习" description="按目标岗位、到期时间和重要性安排练习，不随机刷题。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/practice" />

      <form className="mb-8 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2">
        <select name="context" defaultValue={context ?? ""} className="min-w-64 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200">
          <option value="">全部目标岗位</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100">切换</button>
      </form>

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
        <span>{data.queue.length} 道待练题目</span>
        <span className={dueCount ? "font-medium text-amber-700" : ""}>{dueCount} 道需要练习</span>
      </div>

      <div className="space-y-1">
        {data.queue.map((item: any) => {
          const question = Array.isArray(item.interview_questions) ? item.interview_questions[0] : item.interview_questions;
          const interviewContext = Array.isArray(item.interview_contexts) ? item.interview_contexts[0] : item.interview_contexts;
          const due = !item.next_practice_at || Date.parse(item.next_practice_at) <= now;
          return (
            <Link href={`/career/interview/practice/${item.id}`} key={item.id} className="grid gap-3 rounded-xl px-3 py-4 transition-colors hover:bg-zinc-50 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="font-medium text-[#365F78]">{categoryLabels[question?.category] ?? question?.category}</span>
                  <span className="text-zinc-400">{interviewContext?.title || "通用"}</span>
                  {due ? <span className="text-amber-700">需要练习</span> : null}
                </div>
                <h2 className="mt-1 font-medium">{item.prompt_override || question?.short_title || question?.canonical_prompt}</h2>
                {item.next_focus ? <p className="mt-1 line-clamp-1 text-sm text-zinc-500">下次重点：{item.next_focus}</p> : null}
              </div>
              <div className="text-right text-xs text-zinc-400">
                <p className="font-medium text-zinc-600">{statusLabels[item.status] ?? item.status}</p>
                <p className="mt-1">{importanceLabels[item.importance] ?? item.importance}</p>
                <p className="mt-1">上次 {formatDateTime(item.last_practiced_at)}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {!data.queue.length ? (
        <div className="rounded-2xl bg-zinc-50 px-6 py-14 text-center">
          <p className="font-medium">当前没有可练习的题目</p>
          <p className="mt-2 text-sm text-zinc-500">先进入目标岗位，为它加入需要准备的题目。</p>
          <Link href="/career/interview" className="mt-4 inline-block text-sm text-[#365F78]">返回目标岗位 →</Link>
        </div>
      ) : null}
    </>
  );
}
