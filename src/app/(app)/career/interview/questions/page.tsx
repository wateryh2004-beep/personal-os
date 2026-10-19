import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { QuestionCatalog } from "@/components/career/interview/question-catalog";
import { createInterviewQuestion } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";

export default async function InterviewQuestionLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Dynamic URL state belongs to the client catalog; all reads retain the existing owner/RLS boundary.
  await searchParams;
  const data = await getInterviewQuestions();
  const rows = data.rows.map(({ question, preparationCount }) => ({ id: question.id, prompt: question.canonical_prompt, shortTitle: question.short_title, category: question.category, style: question.question_style, subcategory: question.subcategory, competencyTags: question.competency_tags ?? [], preparationCount }));
  return <>
    <PageHeader title="题目管理" />
    <CareerNav current="/career/interview" />
    <InterviewNav current="/career/interview/questions" />
    <QuestionCatalog rows={rows} unavailable={data.unavailable} createForm={
          <form action={createInterviewQuestion} className="space-y-3">
            <label className="grid gap-2 text-sm">题目 *<textarea aria-label="题目"
              required
              name="canonical_prompt"
              rows={4}
              placeholder="输入题目"
              className="ui-field w-full resize-y rounded-lg px-3 py-2 text-base leading-6"
            /></label>
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
            <button className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">保存题目</button>
          </form>
    } />
  </>;
}
