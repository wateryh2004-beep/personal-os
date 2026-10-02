import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticeAttemptForm } from "@/components/career/interview/practice-attempt-form";
import { issueLabels } from "@/features/interview/constants";
import { getPracticeDetail } from "@/features/interview/queries";
import { formatDateTime } from "@/features/interview/utils";

export default async function PracticeDetailPage({ params, searchParams }: {
  params: Promise<{ preparationId: string }>;
  searchParams: Promise<{ saved?: string; review?: string }>;
}) {
  const [{ preparationId }, { saved, review }] = await Promise.all([params, searchParams]);
  const data = await getPracticeDetail(preparationId);
  if (!data) notFound();

  const prep = data.preparation;
  const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
  const context = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts;
  const prompt = prep.prompt_override || question?.canonical_prompt || "未命名问题";
  const currentAnswer = data.answers[0] ?? null;
  const primaryStory = data.linkedStories[0] ?? null;
  const savedAttempt = data.attempts.find((attempt: { id: string }) => attempt.id === saved);
  const questionHref = prep.context_id ? `/career/interview/questions/${prep.question_id}?context=${prep.context_id}` : `/career/interview/questions/${prep.question_id}`;
  const queueHref = `/career/interview/practice?context=${prep.context_id ?? "general"}`;
  const learningHref = `/career/interview?question=${prep.question_id}${prep.context_id ? `&context=${prep.context_id}` : ""}`;

  return (
    <>
      <header className="mb-2">
        <Link href={learningHref} className="text-xs text-zinc-400 hover:text-zinc-700">← 返回学习题目</Link>
        <h1 className="mt-4 max-w-3xl text-2xl font-semibold leading-9 tracking-[-0.025em] text-zinc-950">{prompt}</h1>
        {context?.title ? <p className="mt-2 text-xs text-zinc-400">{context.title}</p> : null}
      </header>

      {savedAttempt ? (
        <div role="status" className="my-6 max-w-3xl rounded-[10px] bg-[var(--surface-control)] px-4 py-3 text-[13px] leading-6 text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--text-primary)]">这次练习已保存</p>
          {review === "not_updated" ? (
            <p>复习安排未能更新。请<Link href={questionHref} className="text-[var(--accent)] underline underline-offset-2">返回题目检查</Link>，无需重复提交练习。</p>
          ) : prep.next_practice_at ? <p>下次复习：{formatDateTime(prep.next_practice_at)}</p> : null}
          <Link href={queueHref} className="mt-1 inline-block text-[var(--accent)] hover:underline">回到练习队列 →</Link>
        </div>
      ) : null}

      {prep.next_focus || (!savedAttempt && prep.next_practice_at) ? (
        <div className="my-6 max-w-3xl border-l-2 border-[var(--separator)] pl-3 text-[13px] leading-6 text-[var(--text-secondary)]">
          {prep.next_focus ? <p className="whitespace-pre-wrap"><span className="font-medium text-[var(--text-primary)]">这次先练：</span>{prep.next_focus}</p> : null}
          {!savedAttempt && prep.next_practice_at ? <p className="text-[11px] text-[var(--text-tertiary)]">下次复习：{formatDateTime(prep.next_practice_at)}</p> : null}
        </div>
      ) : null}

      <PracticeAttemptForm key={data.attempts[0]?.id ?? "first-attempt"} historyHref={`/career/interview/practice/${prep.id}#practice-history`}>
        <input type="hidden" name="preparation_id" value={prep.id} />
        <input type="hidden" name="answer_version_id" value="" />
        <input type="hidden" name="input_mode" value="text" />
        <input type="hidden" name="language" value={prep.target_language} />
        <input type="hidden" name="prompt_snapshot" value={prompt} />
        <input type="hidden" name="strength_tags" value="" />
        <input type="hidden" name="confidence_before" value="" />
        <input type="hidden" name="confidence_after" value="" />

        {data.linkedStories.length ? (
          <label className="mb-8 block">
            <span className="text-[11px] font-medium text-zinc-400">这次调用的故事</span>
            <select name="story_id" defaultValue={primaryStory?.story.id ?? ""} className="mt-2 h-9 w-full max-w-xl rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none">
              <option value="">不指定故事</option>
              {data.linkedStories.map((item) => (
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

      </PracticeAttemptForm>

      <div className="mt-12 max-w-3xl space-y-5">
        {currentAnswer ? (
          <details>
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">查看当前答案</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{currentAnswer.body_markdown}</p>
          </details>
        ) : null}

        {data.attempts.length ? (
          <details id="practice-history">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">以前的练习 · {data.attempts.length}</summary>
            <div className="mt-4 space-y-4">
              {data.attempts.slice(0, 6).map((attempt) => (
                <article key={attempt.id}>
                  <p className="text-xs text-zinc-400">{formatDateTime(attempt.practiced_at)}{attempt.duration_seconds ? ` · ${attempt.duration_seconds} 秒` : ""}</p>
                  {attempt.issue_tags?.length ? <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">卡点：{attempt.issue_tags.map((tag: string) => issueLabels[tag] ?? tag).join("、")}</p> : null}
                  {attempt.response_transcript_markdown ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{attempt.response_transcript_markdown}</p> : null}
                  {attempt.self_review_markdown ? <p className="mt-1 text-sm leading-6 text-zinc-500">复盘：{attempt.self_review_markdown}</p> : null}
                  {attempt.next_focus ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">下次重点：{attempt.next_focus}</p> : null}
                </article>
              ))}
            </div>
          </details>
        ) : <p id="practice-history" className="text-sm text-zinc-400">还没有已保存的练习。</p>}
      </div>
    </>
  );
}
