import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewQuestion } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";

export default async function InterviewQuestionLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const data = await getInterviewQuestions({ q });

  return (
    <>
      <PageHeader title="题目" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/questions" />

      <div className="mb-8 flex items-center justify-between gap-4">
        <form className="flex-1">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索题目"
            className="w-full max-w-md px-3 py-2 text-sm"
          />
        </form>

        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 新题目</summary>
          <form action={createInterviewQuestion} className="mt-4 w-[min(620px,90vw)] rounded-2xl bg-white/70 p-5">
            <textarea
              required
              autoFocus
              name="canonical_prompt"
              rows={4}
              placeholder="输入题目"
              className="w-full resize-y px-3 py-2 text-sm leading-6"
            />
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

      <div className="space-y-1">
        {data.rows.map(({ question }: any) => (
          <Link
            key={question.id}
            href={`/career/interview/questions/${question.id}`}
            className="block rounded-lg px-2 py-3.5 text-sm leading-6 text-zinc-800 hover:bg-white/70"
          >
            {question.canonical_prompt}
          </Link>
        ))}
      </div>

      {!data.rows.length ? <p className="py-12 text-sm text-zinc-400">没有题目。</p> : null}
    </>
  );
}
