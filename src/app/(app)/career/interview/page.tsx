import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewContext, createInterviewQuestion } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";
import {
  categoryLabels,
  importanceLabels,
  interviewCategories,
  interviewSourceTypes,
  statusLabels,
} from "@/features/interview/constants";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  status?: string;
  context?: string;
  needsPractice?: string;
}>;

export default async function InterviewQuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getInterviewQuestions(params);
  const selectedContext = data.contexts.find((context: any) => context.id === params.context);

  return (
    <>
      <PageHeader
        title="面试准备"
        description="围绕目标岗位，把题目理解、回答逻辑、真实经历和练习记录放在同一条准备链路里。"
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview" />

      {data.unavailable ? (
        <p className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          面试准备数据暂时不可用，请检查数据库升级状态。
        </p>
      ) : null}

      <section className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="题目" value={data.questions.length} />
        <Metric label="未准备" value={data.statusCounts.unprepared ?? 0} />
        <Metric label="整理中" value={data.statusCounts.developing ?? 0} />
        <Metric label="练习中" value={data.statusCounts.practicing ?? 0} />
        <Metric label="已准备" value={data.statusCounts.ready ?? 0} />
        <Metric label="需复盘" value={data.statusCounts.needs_review ?? 0} />
      </section>

      <div className="mb-8 grid gap-7 lg:grid-cols-[1fr_.72fr]">
        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium text-[#365F78]">+ 新建题目</summary>
          <form action={createInterviewQuestion} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>标准问法 *</span>
              <textarea required name="canonical_prompt" className="min-h-24 border bg-white px-3 py-2" />
            </label>
            <Field name="short_title" label="短标题" />
            <label className="grid gap-1 text-sm">
              <span>题型</span>
              <select name="category" defaultValue="behavioral" className="border bg-white px-3 py-2">
                {interviewCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
              </select>
            </label>
            <Field name="subcategory" label="二级分类" />
            <Field name="competency_tags" label="能力标签（逗号分隔）" placeholder="ownership, leadership" />
            <Field name="prompt_variants" label="变体问法（逗号分隔）" />
            <label className="grid gap-1 text-sm">
              <span>来源</span>
              <select name="source_type" defaultValue="manual" className="border bg-white px-3 py-2">
                {interviewSourceTypes.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </label>
            <Field name="source_name" label="来源名称" />
            <Field name="source_url" label="来源链接" type="url" />
            <Field name="source_observed_at" label="记录日期" type="date" />
            <Field name="source_detail" label="来源说明" />
            <label className="grid gap-1 text-sm">
              <span>难度</span>
              <select name="difficulty" defaultValue="3" className="border bg-white px-3 py-2">
                {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <input type="hidden" name="parent_question_id" value="" />
            <input type="hidden" name="follow_up_kind" value="" />
            <button className="w-fit bg-[#365F78] px-3 py-2 text-sm text-white sm:col-span-2">创建问题</button>
          </form>
        </details>

        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium text-[#365F78]">+ 新建目标岗位</summary>
          <form action={createInterviewContext} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field name="title" label="场景名称 *" required placeholder="Swire Management Trainee" />
            <label className="grid gap-1 text-sm">
              <span>类型</span>
              <select name="context_type" defaultValue="target" className="border bg-white px-3 py-2">
                <option value="target">目标岗位</option>
                <option value="general">通用</option>
              </select>
            </label>
            <Field name="organization_snapshot" label="组织" placeholder="Swire" />
            <Field name="role_title_snapshot" label="岗位" placeholder="Management Trainee" />
            <label className="grid gap-1 text-sm"><span>语言</span><select name="default_language" defaultValue="bilingual" className="border bg-white px-3 py-2"><option value="zh">中文</option><option value="en">英文</option><option value="bilingual">双语</option></select></label>
            <label className="grid gap-1 text-sm"><span>优先级</span><select name="priority" defaultValue="4" className="border bg-white px-3 py-2">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <Field name="next_interview_at" label="下一场面试" type="datetime-local" />
            <label className="grid gap-1 text-sm"><span>状态</span><select name="status" defaultValue="active" className="border bg-white px-3 py-2"><option value="active">进行中</option><option value="paused">暂停</option><option value="closed">已结束</option></select></label>
            <label className="grid gap-1 text-sm sm:col-span-2"><span>整体备注</span><textarea name="notes_markdown" className="min-h-20 border bg-white px-3 py-2" /></label>
            <input type="hidden" name="career_direction_id" value="" />
            <input type="hidden" name="opportunity_id" value="" />
            <input type="hidden" name="application_id" value="" />
            <button className="w-fit border border-[#365F78] px-3 py-2 text-sm text-[#365F78] sm:col-span-2">保存场景</button>
          </form>
        </details>
      </div>

      <form className="mb-5 grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-5">
        <input name="q" defaultValue={params.q ?? ""} placeholder="搜索题目、标签…" className="border bg-white px-3 py-2 text-sm" />
        <select name="category" defaultValue={params.category ?? ""} className="border bg-white px-3 py-2 text-sm">
          <option value="">全部题型</option>
          {interviewCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ""} className="border bg-white px-3 py-2 text-sm">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="context" defaultValue={params.context ?? ""} className="border bg-white px-3 py-2 text-sm">
          <option value="">全部目标 / 通用准备</option>
          {data.contexts.map((context: any) => <option key={context.id} value={context.id}>{context.title}</option>)}
        </select>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 border px-3 text-sm"><input type="checkbox" name="needsPractice" value="1" defaultChecked={params.needsPractice === "1"} />需练习</label>
          <button className="bg-zinc-900 px-3 py-2 text-sm text-white">筛选</button>
        </div>
      </form>

      {selectedContext ? (
        <p className="mb-4 text-sm text-zinc-500">当前场景：<span className="font-medium text-zinc-900">{selectedContext.title}</span></p>
      ) : null}

      <div className="divide-y border-y">
        {data.rows.map(({ question, preparation, preparationCount, needsPractice }: any) => {
          const href = preparation?.context_id
            ? `/career/interview/questions/${question.id}?context=${preparation.context_id}`
            : `/career/interview/questions/${question.id}`;
          return (
            <Link key={question.id} href={href} className="grid gap-3 py-4 transition-colors hover:bg-zinc-50 sm:grid-cols-[1fr_auto] sm:px-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</span>
                  <span className="text-xs text-zinc-400">难度 {question.difficulty}</span>
                  {needsPractice ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">需要练习</span> : null}
                </div>
                <h2 className="mt-1 font-medium">{question.short_title || question.canonical_prompt}</h2>
                {question.short_title ? <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{question.canonical_prompt}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">{(question.competency_tags ?? []).slice(0,6).map((tag: string) => <span key={tag} className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">{tag}</span>)}</div>
              </div>
              <div className="flex items-start gap-3 text-right text-xs sm:block">
                <p className="font-medium text-zinc-700">{preparation ? statusLabels[preparation.status] ?? preparation.status : "无准备"}</p>
                {preparation ? <p className="mt-1 text-zinc-400">{importanceLabels[preparation.importance] ?? preparation.importance} · 信心 {preparation.confidence ?? "—"}/5</p> : null}
                <p className="mt-1 text-zinc-400">{preparationCount} 个场景</p>
              </div>
            </Link>
          );
        })}
      </div>

      {!data.rows.length ? <div className="py-20 text-center"><p className="font-medium">没有匹配的问题</p><p className="mt-2 text-sm text-zinc-500">新建题目，或放宽筛选条件。</p></div> : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-t pt-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-mono text-2xl">{value}</p></div>;
}

function Field({ name, label, type = "text", required = false, placeholder = "" }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="grid gap-1 text-sm"><span>{label}</span><input name={name} type={type} required={required} placeholder={placeholder} className="border bg-white px-3 py-2" /></label>;
}
