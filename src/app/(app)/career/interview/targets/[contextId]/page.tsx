import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { ensureInterviewPreparation, updateInterviewContext } from "@/features/interview/actions";
import { getInterviewInsights, getInterviewQuestions } from "@/features/interview/queries";
import { categoryLabels, importanceLabels, issueLabels, statusLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewTargetPage({ params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  const [data, insights] = await Promise.all([getInterviewQuestions(), getInterviewInsights(contextId)]);
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
    .filter((row: any) => row.question)
    .sort((a: any, b: any) => Number(b.needsPractice) - Number(a.needsPractice));

  const ready = preparations.filter((prep: any) => prep.status === "ready").length;
  const due = rows.filter((row: any) => row.needsPractice).length;
  const unpreparedQuestions = data.questions.filter((question: any) => !question.parent_question_id && !preparedQuestionIds.has(question.id)).slice(0, 6);

  const nextAction = due
    ? `先练 ${due} 道到期题`
    : preparations.length
      ? "继续完善尚未准备完成的题目"
      : "先加入第一批核心题目";

  return (
    <>
      <PageHeader
        title={target.role_title_snapshot || target.title}
        description={target.organization_snapshot || target.title}
        eyebrow={<Link href="/career/interview" className="hover:text-zinc-700">面试 / 岗位</Link>}
        action={<Link href={`/career/interview/practice?context=${contextId}`} className="text-sm font-medium text-[#365F78]">开始练习 →</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/targets/${contextId}`} />

      <section className="mb-12">
        <p className="text-xs text-zinc-400">现在</p>
        <h2 className="mt-2 text-xl font-medium tracking-tight text-zinc-950">{nextAction}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
          <span>{ready}/{preparations.length} 已准备</span>
          {due ? <span className="text-amber-700">{due} 待练</span> : null}
          {target.next_interview_at ? <span>下一场 {formatDateTime(target.next_interview_at)}</span> : null}
          <span>{insights.attempts.length} 次练习</span>
        </div>
        {target.notes_markdown ? <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-zinc-500">{target.notes_markdown}</p> : null}
      </section>

      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-950">题目</h2>
          <span className="text-xs text-zinc-400">{preparations.length} 道</span>
        </div>

        <div className="mt-4 space-y-1">
          {rows.map((row: any) => <QuestionRow key={row.preparation.id} row={row} contextId={contextId} />)}
          {!rows.length ? <p className="py-4 text-sm text-zinc-400">还没有加入准备题目。</p> : null}
        </div>
      </section>

      <section className="mb-12">
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 从题库加入</summary>
          <div className="mt-3 space-y-1">
            {unpreparedQuestions.map((question: any) => (
              <div key={question.id} className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-white/70">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-800">{question.short_title || question.canonical_prompt}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{categoryLabels[question.category] ?? question.category}</p>
                </div>
                <form action={ensureInterviewPreparation}>
                  <input type="hidden" name="question_id" value={question.id} />
                  <input type="hidden" name="context_id" value={contextId} />
                  <button className="shrink-0 text-xs text-[#365F78]">加入</button>
                </form>
              </div>
            ))}
            {!unpreparedQuestions.length ? <p className="py-3 text-sm text-zinc-400">核心题已经全部加入。</p> : null}
          </div>
          <Link href="/career/interview/questions" className="mt-3 inline-block text-xs text-zinc-400 hover:text-zinc-700">完整题库 →</Link>
        </details>
      </section>

      {insights.issueCounts.length ? (
        <section className="mb-12">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-medium text-zinc-950">近期问题</h2>
            <Link href={`/career/interview/insights?context=${contextId}`} className="text-xs text-zinc-400 hover:text-zinc-700">复盘 →</Link>
          </div>
          <p className="mt-3 text-sm leading-7 text-zinc-500">
            {insights.issueCounts.slice(0, 4).map((item) => `${issueLabels[item.tag] ?? item.tag} × ${item.count}`).join(" · ")}
          </p>
        </section>
      ) : null}

      <details className="pt-2">
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">岗位设置</summary>
        <form action={updateInterviewContext} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 sm:grid-cols-2">
          <input type="hidden" name="context_id" value={target.id} />
          <input type="hidden" name="context_type" value={target.context_type} />
          <input type="hidden" name="career_direction_id" value={target.career_direction_id ?? ""} />
          <input type="hidden" name="opportunity_id" value={target.opportunity_id ?? ""} />
          <input type="hidden" name="application_id" value={target.application_id ?? ""} />
          <Field name="title" label="显示名称" required defaultValue={target.title} />
          <Field name="organization_snapshot" label="公司" required={target.context_type === "target"} defaultValue={target.organization_snapshot} />
          <Field name="role_title_snapshot" label="岗位" required={target.context_type === "target"} defaultValue={target.role_title_snapshot} />
          <Select name="default_language" label="默认语言" defaultValue={target.default_language} options={[["zh","中文"],["en","英文"],["bilingual","双语"]]} />
          <Select name="priority" label="优先级" defaultValue={String(target.priority)} options={[1,2,3,4,5].map((v) => [String(v), String(v)] as [string,string])} />
          <Select name="status" label="状态" defaultValue={target.status} options={[["active","进行中"],["paused","暂停"],["closed","已结束"]]} />
          <Field name="next_interview_at" label="下一场面试" type="datetime-local" defaultValue={toDatetimeLocal(target.next_interview_at)} />
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-zinc-500">备注</span>
            <textarea name="notes_markdown" defaultValue={target.notes_markdown ?? ""} rows={3} className={controlClass} />
          </label>
          <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">保存</button>
        </form>
      </details>
    </>
  );
}

function QuestionRow({ row, contextId }: { row: any; contextId: string }) {
  const { question, preparation, needsPractice } = row;
  return (
    <Link href={`/career/interview/questions/${question.id}?context=${contextId}`} className="group grid gap-1 rounded-lg px-2 py-3 hover:bg-white/70 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm text-zinc-800">{preparation.prompt_override || question.short_title || question.canonical_prompt}</p>
        {preparation.next_focus ? <p className="mt-0.5 truncate text-xs text-zinc-400">{preparation.next_focus}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        {needsPractice ? <span className="text-amber-700">待练</span> : null}
        <span>{statusLabels[preparation.status] ?? preparation.status}</span>
        <span>{importanceLabels[preparation.importance] ?? preparation.importance}</span>
      </div>
    </Link>
  );
}

const controlClass = "rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200 outline-none focus:ring-zinc-400";

function Field({ name, label, type = "text", defaultValue, required = false }: { name: string; label: string; type?: string; defaultValue?: string | number | null; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-zinc-500">{label}</span><input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className={controlClass}/></label>;
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: [string,string][] }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-zinc-500">{label}</span><select name={name} defaultValue={defaultValue} className={controlClass}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
}
