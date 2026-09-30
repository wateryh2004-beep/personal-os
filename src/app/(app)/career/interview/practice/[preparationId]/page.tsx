import Link from "next/link";
import { notFound } from "next/navigation";
import { createPracticeAttempt } from "@/features/interview/actions";
import { getPracticeDetail } from "@/features/interview/queries";
import { formatDateTime } from "@/features/interview/utils";

export default async function PracticeDetailPage({ params }: { params: Promise<{ preparationId: string }> }) {
  const { preparationId } = await params;
  const data = await getPracticeDetail(preparationId);
  if (!data) notFound();

  const prep: any = data.preparation;
  const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
  const context = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts;
  const prompt = prep.prompt_override || question?.canonical_prompt || "未命名问题";
  const currentAnswer = data.answers[0] ?? null;
  const primaryStory = data.linkedStories[0] ?? null;

  return (
    <>
      <header className="mb-2">
        <Link href={prep.context_id ? `/career/interview/questions/${prep.question_id}?context=${prep.context_id}` : `/career/interview/questions/${prep.question_id}`} className="text-xs text-zinc-400 hover:text-zinc-700">← 返回题目</Link>
        <h1 className="mt-4 max-w-3xl text-2xl font-semibold leading-9 tracking-[-0.025em] text-zinc-950">{prompt}</h1>
        {context?.title ? <p className="mt-2 text-xs text-zinc-400">{context.title}</p> : null}
      </header>


      <form action={createPracticeAttempt} className="max-w-3xl">
        <input type="hidden" name="preparation_id" value={prep.id} />
        <input type="hidden" name="answer_version_id" value="" />
        <input type="hidden" name="input_mode" value="text" />
        <input type="hidden" name="language" value={prep.target_language} />
        <input type="hidden" name="prompt_snapshot" value={prompt} />
        <input type="hidden" name="duration_seconds" value="" />
        <input type="hidden" name="issue_tags" value="" />
        <input type="hidden" name="strength_tags" value="" />
        <input type="hidden" name="next_focus" value="" />
        <input type="hidden" name="confidence_before" value="" />
        <input type="hidden" name="confidence_after" value="" />

        {data.linkedStories.length ? (
          <label className="mb-8 block">
            <span className="text-[11px] font-medium text-zinc-400">这次调用的故事</span>
            <select name="story_id" defaultValue={primaryStory?.story.id ?? ""} className="mt-2 h-9 w-full max-w-xl rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none">
              <option value="">不指定故事</option>
              {data.linkedStories.map((item: any) => (
                <option key={item.story.id} value={item.story.id}>{item.story.title}{item.evidence_role === "primary" ? " · 首选" : ""}</option>
              ))}
            </select>
            {primaryStory?.story.one_line ? <p className="mt-2 max-w-2xl text-[12px] leading-5 text-zinc-500">{primaryStory.story.one_line}</p> : null}
          </label>
        ) : <input type="hidden" name="story_id" value="" />}

        <label className="block">
          <span className="text-[15px] font-medium text-zinc-950">我的回答</span>
          <textarea
            name="response_transcript_markdown"
            rows={12}
            autoFocus
            placeholder="直接回答。"
            className="mt-3 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-900 outline-none placeholder:text-zinc-300"
          />
        </label>

        <label className="mt-8 block">
          <span className="text-[15px] font-medium text-zinc-950">复盘</span>
          <textarea
            name="self_review_markdown"
            rows={5}
            placeholder="可选：哪里卡住了？哪里可以更直接？"
            className="mt-3 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-700 outline-none placeholder:text-zinc-300"
          />
        </label>

        <button className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">保存这次练习</button>
      </form>

      <div className="mt-12 max-w-3xl space-y-5">
        {currentAnswer ? (
          <details>
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">查看当前答案</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{currentAnswer.body_markdown}</p>
          </details>
        ) : null}

        {data.attempts.length ? (
          <details>
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">以前的练习 · {data.attempts.length}</summary>
            <div className="mt-4 space-y-4">
              {data.attempts.slice(0, 6).map((attempt: any) => (
                <article key={attempt.id}>
                  <p className="text-xs text-zinc-400">{formatDateTime(attempt.practiced_at)}</p>
                  {attempt.response_transcript_markdown ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{attempt.response_transcript_markdown}</p> : null}
                  {attempt.self_review_markdown ? <p className="mt-1 text-sm leading-6 text-zinc-500">复盘：{attempt.self_review_markdown}</p> : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
