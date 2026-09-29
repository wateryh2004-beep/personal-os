import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { ensureInterviewPreparation } from "@/features/interview/actions";
import { getInterviewInsights, getInterviewQuestions } from "@/features/interview/queries";
import { categoryLabels, importanceLabels, statusLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewTargetPage({ params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  const [data, insights] = await Promise.all([
    getInterviewQuestions(),
    getInterviewInsights(contextId),
  ]);

  const target = data.contexts.find((context: any) => context.id === contextId);
  if (!target) notFound();

  const questionById = new Map(data.questions.map((question: any) => [question.id, question]));
  const preparations = data.preparations.filter((prep: any) => prep.context_id === contextId);
  const preparedQuestionIds = new Set(preparations.map((prep: any) => prep.question_id));
  const rows = preparations
    .map((preparation: any) => ({
      preparation,
      question: questionById.get(preparation.question_id) as any,
      needsPractice: preparation.status !== "paused" && (!preparation.next_practice_at || Date.parse(preparation.next_practice_at) <= Date.now()),
    }))
    .filter((row: any) => row.question);

  const importanceRank: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  const statusRank: Record<string, number> = { needs_review: 0, practicing: 1, developing: 2, unprepared: 3, ready: 4, paused: 5 };
  rows.sort((a: any, b: any) =>
    Number(b.needsPractice) - Number(a.needsPractice) ||
    (importanceRank[a.preparation.importance] ?? 9) - (importanceRank[b.preparation.importance] ?? 9) ||
    (statusRank[a.preparation.status] ?? 9) - (statusRank[b.preparation.status] ?? 9)
  );

  const ready = preparations.filter((prep: any) => prep.status === "ready").length;
  const due = rows.filter((row: any) => row.needsPractice).length;
  const inProgress = preparations.filter((prep: any) => ["developing", "practicing", "needs_review"].includes(prep.status)).length;
  const progress = preparations.length ? Math.round((ready / preparations.length) * 100) : 0;
  const unpreparedQuestions = data.questions
    .filter((question: any) => !question.parent_question_id && !preparedQuestionIds.has(question.id))
    .slice(0, 6);

  const nextAction = due
    ? `先练 ${due} 道已经到期的题`
    : inProgress
      ? `继续完成 ${inProgress} 道正在准备的题`
      : preparations.length
        ? "核心题目已准备，保持练习节奏"
        : "先从题库加入第一批核心题目";

  return (
    <>
      <PageHeader
        title={target.role_title_snapshot || target.title}
        description={[target.organization_snapshot, target.title !== target.role_title_snapshot ? target.title : null].filter(Boolean).join(" · ")}
        eyebrow={<Link href="/career/interview" className="hover:text-zinc-700">面试准备 / 目标岗位</Link>}
        action={<Link href={`/career/interview/practice?context=${contextId}`} className="rounded-lg bg-[#365F78] px-4 py-2 text-sm font-medium text-white">开始练习</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/targets/${contextId}`} />

      <section className="rounded-2xl bg-zinc-50 p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
          <div>
            <p className="text-xs font-medium text-zinc-400">现在该做什么</p>
            <h2 className="mt-2 text-xl font-medium tracking-tight">{nextAction}</h2>
            {target.notes_markdown ? <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-zinc-600">{target.notes_markdown}</p> : null}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
              <span>状态：{target.status === "active" ? "进行中" : target.status === "paused" ? "暂停" : "已结束"}</span>
              <span>下一场面试：{formatDateTime(target.next_interview_at)}</span>
              <span>练习记录：{insights.attempts.length} 次</span>
            </div>
          </div>

          <div className="lg:pl-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-zinc-400">题目准备</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">{ready}<span className="ml-1 text-base font-normal text-zinc-400">/ {preparations.length}</span></p>
              </div>
              <span className="text-sm text-zinc-500">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full rounded-full bg-[#365F78]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-4 flex justify-between text-xs text-zinc-500">
              <span>{due} 道待练</span>
              <span>{inProgress} 道整理中</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="space-y-10">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">优先处理</h2>
                <p className="mt-1 text-sm text-zinc-500">先处理到期、关键和未完成的题。</p>
              </div>
              <Link href={`/career/interview/practice?context=${contextId}`} className="text-sm text-[#365F78]">进入练习队列 →</Link>
            </div>

            <div className="mt-4 space-y-1">
              {rows.filter((row: any) => row.preparation.status !== "ready" || row.needsPractice).slice(0, 6).map((row: any) => (
                <QuestionRow key={row.preparation.id} row={row} contextId={contextId} />
              ))}
              {!rows.some((row: any) => row.preparation.status !== "ready" || row.needsPractice) ? (
                <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">当前没有紧急准备项。</p>
              ) : null}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">这个岗位的题目</h2>
                <p className="mt-1 text-sm text-zinc-500">每道题都保留这个岗位自己的回答逻辑、答案和练习记录。</p>
              </div>
              <span className="text-sm text-zinc-400">{preparations.length} 道</span>
            </div>
            <div className="mt-4 space-y-1">
              {rows.map((row: any) => <QuestionRow key={row.preparation.id} row={row} contextId={contextId} />)}
              {!rows.length ? <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">还没有为这个岗位加入准备题目。</p> : null}
            </div>
          </section>

          <section>
            <div>
              <h2 className="text-lg font-medium">从通用题库加入</h2>
              <p className="mt-1 text-sm text-zinc-500">不用复制题目；加入后会生成这个岗位独立的准备内容。</p>
            </div>
            <div className="mt-4 space-y-1">
              {unpreparedQuestions.map((question: any) => (
                <div key={question.id} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-zinc-50">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</p>
                    <p className="mt-1 truncate text-sm font-medium">{question.short_title || question.canonical_prompt}</p>
                  </div>
                  <form action={ensureInterviewPreparation}>
                    <input type="hidden" name="question_id" value={question.id} />
                    <input type="hidden" name="context_id" value={contextId} />
                    <button className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200">加入准备</button>
                  </form>
                </div>
              ))}
              {!unpreparedQuestions.length ? <p className="text-sm text-zinc-500">通用题库里的核心题已经全部加入。</p> : null}
            </div>
            <Link href="/career/interview/questions" className="mt-4 inline-block text-sm text-[#365F78]">浏览完整题库 →</Link>
          </section>
        </main>

        <aside className="space-y-8">
          <section>
            <h2 className="font-medium">近期暴露的问题</h2>
            <div className="mt-3 space-y-2">
              {insights.issueCounts.slice(0, 5).map((item) => (
                <div key={item.tag} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-600">{item.tag}</span>
                  <span className="font-mono text-xs text-zinc-400">{item.count}</span>
                </div>
              ))}
              {!insights.issueCounts.length ? <p className="text-sm text-zinc-500">完成练习后，这里会显示反复出现的问题。</p> : null}
            </div>
            <Link href={`/career/interview/insights?context=${contextId}`} className="mt-4 inline-block text-sm text-[#365F78]">查看完整复盘 →</Link>
          </section>

          <section>
            <h2 className="font-medium">快速进入</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <Link href={`/career/interview/practice?context=${contextId}`} className="text-[#365F78]">模拟练习 →</Link>
              <Link href={`/career/interview/insights?context=${contextId}`} className="text-[#365F78]">岗位复盘 →</Link>
              <Link href="/career/interview/sessions" className="text-[#365F78]">面试记录 →</Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function QuestionRow({ row, contextId }: { row: any; contextId: string }) {
  const { question, preparation, needsPractice } = row;
  return (
    <Link
      href={`/career/interview/questions/${question.id}?context=${contextId}`}
      className="grid gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-zinc-50 sm:grid-cols-[1fr_auto]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</span>
          {needsPractice ? <span className="text-amber-700">需要练习</span> : null}
        </div>
        <p className="mt-1 truncate text-sm font-medium">{preparation.prompt_override || question.short_title || question.canonical_prompt}</p>
        {preparation.next_focus ? <p className="mt-1 line-clamp-1 text-xs text-zinc-500">下次重点：{preparation.next_focus}</p> : null}
      </div>
      <div className="text-right text-xs text-zinc-400">
        <p className="font-medium text-zinc-600">{statusLabels[preparation.status] ?? preparation.status}</p>
        <p className="mt-1">{importanceLabels[preparation.importance] ?? preparation.importance}</p>
      </div>
    </Link>
  );
}
