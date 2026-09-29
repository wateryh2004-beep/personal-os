import Link from "next/link";
import { createInterviewContext, createInterviewQuestion } from "@/features/interview/actions";
import { getInterviewQuestionDetail, getInterviewQuestions } from "@/features/interview/queries";
import { InterviewWorkspaceEditor } from "@/components/career/interview/interview-workspace-editor";

export default async function InterviewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; question?: string }>;
}) {
  const params = await searchParams;
  const base = await getInterviewQuestions();

  const targets = base.contexts.filter((context: any) => context.context_type !== "general" && context.status === "active");
  const requestedContext = params.context && targets.some((context: any) => context.id === params.context) ? params.context : null;
  const selectedContextId = requestedContext ?? targets[0]?.id ?? null;
  const selectedContext = selectedContextId ? base.contexts.find((context: any) => context.id === selectedContextId) : null;

  const scoped = selectedContextId ? await getInterviewQuestions({ context: selectedContextId }) : base;
  const requestedQuestion = params.question && scoped.rows.some((row: any) => row.question.id === params.question) ? params.question : null;
  const selectedQuestionId = requestedQuestion ?? scoped.rows[0]?.question.id ?? null;
  const detail = selectedQuestionId ? await getInterviewQuestionDetail(selectedQuestionId, selectedContextId) : null;
  const prep = detail?.selectedPreparation ?? null;

  const currentAnswers = detail?.currentAnswers ?? [];
  const primaryAnswer = prep
    ? currentAnswers.find((answer: any) => answer.answer_mode === "spoken" && answer.language === prep.target_language) ?? currentAnswers[0] ?? null
    : null;
  const initialThoughts = prep
    ? prep.working_thoughts_markdown || [prep.key_message, prep.answer_logic_markdown].filter(Boolean).join("\n\n")
    : "";

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/career" className="text-xs text-zinc-400 hover:text-zinc-700">← Career</Link>
          <form className="flex items-center gap-2">
            <select name="context" defaultValue={selectedContextId ?? ""} className="max-w-[280px] px-2 py-1.5 text-sm font-medium text-zinc-800">
              <option value="">通用题目</option>
              {targets.map((context: any) => <option key={context.id} value={context.id}>{context.organization_snapshot ? context.organization_snapshot + " · " : ""}{context.role_title_snapshot || context.title}</option>)}
            </select>
            <button className="text-xs text-zinc-400 hover:text-zinc-700">切换</button>
          </form>
        </div>

        <details>
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">+ 岗位</summary>
          <form action={createInterviewContext} className="mt-3 grid w-[min(480px,88vw)] gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-black/5 sm:grid-cols-2">
            <input name="organization_snapshot" required placeholder="公司" className="px-3 py-2 text-sm" />
            <input name="role_title_snapshot" required placeholder="岗位" className="px-3 py-2 text-sm" />
            <input type="hidden" name="context_type" value="target" />
            <input type="hidden" name="return_to_workspace" value="1" />
            <button className="w-fit rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">创建</button>
          </form>
        </details>
      </div>

      <div className="grid min-h-[680px] gap-6 md:grid-cols-[290px_minmax(0,1fr)] md:gap-10">
        <aside className="min-h-0 rounded-2xl bg-black/[0.025] p-3">
          <form action={createInterviewQuestion} className="mb-3">
            <textarea
              required
              name="canonical_prompt"
              rows={2}
              placeholder="+ 新问题"
              className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 text-zinc-700 outline-none placeholder:text-zinc-300"
            />
            <input type="hidden" name="context_id" value={selectedContextId ?? ""} />
            <input type="hidden" name="return_to_workspace" value="1" />
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
            <button className="ml-2 text-[11px] text-zinc-400 hover:text-zinc-700">添加</button>
          </form>

          <nav aria-label="面试题目" className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1 md:max-h-[600px]">
            {scoped.rows.map(({ question, preparation }: any) => {
              const active = question.id === selectedQuestionId;
              return (
                <Link
                  key={question.id}
                  href={selectedContextId ? `/career/interview?context=${selectedContextId}&question=${question.id}` : `/career/interview?question=${question.id}`}
                  className={`block rounded-lg px-2.5 py-2.5 text-[13px] leading-5 transition-colors ${active ? "bg-white font-medium text-zinc-950 shadow-sm" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
                >
                  <span className="line-clamp-2">{preparation?.prompt_override || question.canonical_prompt}</span>
                </Link>
              );
            })}
            {!scoped.rows.length ? <p className="px-2 py-4 text-xs text-zinc-400">还没有题目。</p> : null}
          </nav>
        </aside>

        <main className="min-w-0 px-2 py-4 sm:px-3 md:px-0 md:py-5">
          {detail && prep ? (
            <InterviewWorkspaceEditor
              key={detail.question.id}
              preparationId={prep.id}
              questionId={detail.question.id}
              question={prep.prompt_override || detail.question.canonical_prompt}
              initialThoughts={initialThoughts}
              initialAnswer={primaryAnswer?.body_markdown ?? ""}
              practiceHref={`/career/interview/practice/${prep.id}`}
            />
          ) : detail && !prep ? (
            <div className="max-w-2xl">
              <h1 className="text-[24px] font-semibold leading-9 tracking-[-0.025em] text-zinc-950">{detail.question.canonical_prompt}</h1>
              <p className="mt-8 text-sm text-zinc-400">这道题还没有加入当前岗位。</p>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-sm text-zinc-300">
              {selectedContext ? "从左侧添加或选择一道题。" : "先创建一个岗位，或者使用通用题目。"}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
