import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewQuestion } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";
import {
  categoryLabels,
  competencyLabels,
  importanceLabels,
  interviewCategories,
  interviewSourceTypes,
  sourceTypeLabels,
  statusLabels,
} from "@/features/interview/constants";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  status?: string;
  context?: string;
  needsPractice?: string;
}>;

export default async function InterviewQuestionLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getInterviewQuestions(params);
  const selectedContext = data.contexts.find((context: any) => context.id === params.context);

  return (
    <>
      <PageHeader
        title="题库"
        description="维护跨岗位复用的核心问题。具体公司和岗位的回答，仍然在目标岗位里分别准备。"
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/questions" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">
          {data.rows.length} 道题{selectedContext ? ` · 当前查看 ${selectedContext.title}` : ""}
        </p>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-[#365F78]">+ 新建题目</summary>
          <div className="mt-4 rounded-2xl bg-zinc-50 p-5">
            <form action={createInterviewQuestion} className="grid gap-4 sm:grid-cols-2 lg:w-[680px]">
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="text-zinc-600">标准问法</span>
                <textarea required name="canonical_prompt" className="min-h-24 rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200" />
              </label>
              <Field name="short_title" label="短标题" />
              <label className="grid gap-1.5 text-sm">
                <span className="text-zinc-600">题型</span>
                <select name="category" defaultValue="behavioral" className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
                  {interviewCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                </select>
              </label>
              <Field name="subcategory" label="二级分类" />
              <Field name="competency_tags" label="能力标签" placeholder="ownership, leadership" />
              <Field name="prompt_variants" label="变体问法" />
              <label className="grid gap-1.5 text-sm">
                <span className="text-zinc-600">来源类型</span>
                <select name="source_type" defaultValue="manual" className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
                  {interviewSourceTypes.map((source) => <option key={source} value={source}>{sourceTypeLabels[source] ?? source}</option>)}
                </select>
              </label>
              <Field name="source_name" label="来源名称" />
              <Field name="source_url" label="来源链接" type="url" />
              <Field name="source_observed_at" label="记录日期" type="date" />
              <Field name="source_detail" label="来源说明" />
              <label className="grid gap-1.5 text-sm">
                <span className="text-zinc-600">难度</span>
                <select name="difficulty" defaultValue="3" className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
                  {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <input type="hidden" name="parent_question_id" value="" />
              <input type="hidden" name="follow_up_kind" value="" />
              <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2">创建题目</button>
            </form>
          </div>
        </details>
      </div>

      <form className="mb-7 grid gap-2 rounded-xl bg-zinc-50 p-2 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr_auto]">
        <input name="q" defaultValue={params.q ?? ""} placeholder="搜索题目或标签" className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200" />
        <select name="category" defaultValue={params.category ?? ""} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200">
          <option value="">全部题型</option>
          {interviewCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ""} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="context" defaultValue={params.context ?? ""} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-200">
          <option value="">全部目标 / 通用准备</option>
          {data.contexts.map((context: any) => <option key={context.id} value={context.id}>{context.title}</option>)}
        </select>
        <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100">筛选</button>
      </form>

      <div className="space-y-1">
        {data.rows.map(({ question, preparation, preparationCount, needsPractice }: any) => {
          const href = preparation?.context_id
            ? `/career/interview/questions/${question.id}?context=${preparation.context_id}`
            : `/career/interview/questions/${question.id}`;
          return (
            <Link key={question.id} href={href} className="grid gap-3 rounded-xl px-3 py-4 transition-colors hover:bg-zinc-50 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</span>
                  <span className="text-zinc-400">难度 {question.difficulty}</span>
                  {needsPractice ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">需要练习</span> : null}
                </div>
                <h2 className="mt-1 font-medium">{question.short_title || question.canonical_prompt}</h2>
                {question.short_title ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-500">{question.canonical_prompt}</p> : null}
                {(question.competency_tags ?? []).length ? (
                  <p className="mt-2 line-clamp-1 text-xs text-zinc-400">{(question.competency_tags ?? []).slice(0,6).map((tag: string) => competencyLabels[tag] ?? tag).join(" · ")}</p>
                ) : null}
              </div>
              <div className="text-right text-xs text-zinc-400">
                <p className="font-medium text-zinc-600">{preparation ? statusLabels[preparation.status] ?? preparation.status : "无准备"}</p>
                {preparation ? <p className="mt-1">{importanceLabels[preparation.importance] ?? preparation.importance} · 信心 {preparation.confidence ?? "—"}/5</p> : null}
                <p className="mt-1">{preparationCount} 个目标</p>
              </div>
            </Link>
          );
        })}
      </div>

      {!data.rows.length ? (
        <div className="py-20 text-center">
          <p className="font-medium">没有匹配的问题</p>
          <p className="mt-2 text-sm text-zinc-500">新建题目，或放宽筛选条件。</p>
        </div>
      ) : null}
    </>
  );
}

function Field({ name, label, type = "text", required = false, placeholder = "" }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder} className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200" />
    </label>
  );
}
