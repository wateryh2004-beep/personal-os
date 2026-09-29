import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewQuestion, ensureInterviewPreparation, updateInterviewContext } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";

export default async function InterviewTargetPage({ params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  const data = await getInterviewQuestions();
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

  const unpreparedQuestions = data.questions
    .filter((question: any) => !question.parent_question_id && !preparedQuestionIds.has(question.id))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title={target.role_title_snapshot || target.title}
        description={target.organization_snapshot || undefined}
        eyebrow={<Link href="/career/interview" className="hover:text-zinc-700">面试 / 岗位</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/targets/${contextId}`} />

      <div className="mb-8 flex justify-end">
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 新题目</summary>
          <form action={createInterviewQuestion} className="mt-4 w-[min(620px,90vw)] rounded-2xl bg-white/70 p-5">
            <textarea required autoFocus name="canonical_prompt" rows={3} placeholder="输入题目" className="w-full resize-y px-3 py-2 text-sm leading-6" />
            <input type="hidden" name="context_id" value={contextId} />
            <input type="hidden" name="short_title" value="" />
            <input type="hidden" name="category" value="behavioral" />
            <input type="hidden" name="subcategory" value="" />
            <input type="hidden" name="competency_tags" value="" />
            <input type="hidden" name="prompt_variants" value="" />
            <input type="hidden" name="source_type" value="manual" />
            <input type="hidden" name="source_name" value="" />
            <input type="hidden" name="source_url" value="" />
            <input type="hidden" name="source_observed_at" value="" />
            <input type="hidden" name="source_detail" value="" />
            <input type="hidden" name="parent_question_id" value="" />
            <input type="hidden" name="follow_up_kind" value="" />
            <input type="hidden" name="difficulty" value="3" />
            <button className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">保存</button>
          </form>
        </details>
      </div>

      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-950">题目</h2>
          <span className="text-xs text-zinc-400">{rows.length}</span>
        </div>

        <div className="mt-4 space-y-1">
          {rows.map((row: any) => (
            <Link
              key={row.preparation.id}
              href={`/career/interview/questions/${row.question.id}?context=${contextId}`}
              className="group flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 hover:bg-white/70"
            >
              <span className="min-w-0 flex-1 text-sm leading-6 text-zinc-800">{row.preparation.prompt_override || row.question.canonical_prompt}</span>
              {row.needsPractice ? <span className="shrink-0 text-xs text-amber-700">待练</span> : null}
            </Link>
          ))}
          {!rows.length ? <p className="py-4 text-sm text-zinc-400">还没有题目。</p> : null}
        </div>
      </section>

      <details className="mb-8">
        <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">从已有题目加入</summary>
        <div className="mt-3 space-y-1">
          {unpreparedQuestions.map((question: any) => (
            <div key={question.id} className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-white/70">
              <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-700">{question.canonical_prompt}</p>
              <form action={ensureInterviewPreparation}>
                <input type="hidden" name="question_id" value={question.id} />
                <input type="hidden" name="context_id" value={contextId} />
                <button className="shrink-0 text-xs text-[#365F78]">加入</button>
              </form>
            </div>
          ))}
          {!unpreparedQuestions.length ? <p className="py-3 text-sm text-zinc-400">没有其他题目。</p> : null}
        </div>
      </details>

      <details>
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
          <Select name="default_language" label="语言" defaultValue={target.default_language} options={[["zh","中文"],["en","英文"],["bilingual","双语"]]} />
          <Select name="priority" label="优先级" defaultValue={String(target.priority)} options={[1,2,3,4,5].map((v) => [String(v), String(v)] as [string,string])} />
          <Select name="status" label="状态" defaultValue={target.status} options={[["active","进行中"],["paused","暂停"],["closed","已结束"]]} />
          <Field name="next_interview_at" label="面试时间" type="datetime-local" defaultValue={toDatetimeLocal(target.next_interview_at)} />
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
