import { InterviewStudyView } from "@/components/career/interview/interview-study-view";
import { selectWorkspaceAnswer, workspaceAnswerMetadata } from "@/features/interview/workspace-answers";
import { InterviewPrompt } from "@/components/career/interview/interview-prompt";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { PracticeAttemptForm } from "@/components/career/interview/practice-attempt-form";
import { issueLabels } from "@/features/interview/constants";
import { getPracticeDetail } from "@/features/interview/queries";
import { formatDateTime } from "@/features/interview/utils";

export default async function PracticeDetailPage({ params, searchParams }: {
  params: Promise<{ preparationId: string }>;
  searchParams: Promise<{ saved?: string; review?: string; parent?: string }>;
}) {
  const [{ preparationId }, { saved, review, parent }] = await Promise.all([params, searchParams]);
  const data = await getPracticeDetail(preparationId, parent);
  if (!data) notFound();

  const prep = data.preparation;
  const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
  const context = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts;
  const prompt = prep.prompt_override || question?.canonical_prompt || "未命名问题";
  const currentAnswer = selectWorkspaceAnswer(data.answers, prep.target_language);
  const thoughts = prep.working_thoughts_markdown || [prep.key_message, prep.answer_logic_markdown].filter(Boolean).join("\n\n");
  const primaryStory = data.linkedStories[0] ?? null;
  const savedAttempt = data.attempts.find((attempt: { id: string }) => attempt.id === saved);
  const questionHref = prep.context_id ? `/career/interview/questions/${prep.question_id}?context=${prep.context_id}` : `/career/interview/questions/${prep.question_id}`;
  const queueHref = `/career/interview/practice?context=${prep.context_id ?? "general"}`;
  const learningHref = `/career/interview?question=${prep.question_id}${prep.context_id ? `&context=${prep.context_id}` : ""}`;

  return (
    <>
      <header className="mb-2 max-w-3xl">
        <nav aria-label="练习返回导航" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href={queueHref} className="ui-link inline-flex min-h-11 items-center">返回练习队列</Link><Link href={learningHref} className="ui-link inline-flex min-h-11 items-center">返回学习题目</Link></nav>
        <div className="mt-4 max-w-3xl"><InterviewPrompt prompt={prompt} shortTitle={question?.short_title} /></div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{context?.title || "通用面试"}</p>
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
          {!savedAttempt && prep.next_practice_at ? <p className="text-[12px] text-[var(--text-tertiary)]">下次复习：{formatDateTime(prep.next_practice_at)}</p> : null}
        </div>
      ) : null}

      {parent ? <section className="my-6 max-w-3xl border-l-2 border-[var(--accent)] pl-4" role="status">{data.parentAttempt?<><p>继续 {formatDateTime(data.parentAttempt.practiced_at)} 的练习</p><p className="whitespace-pre-wrap">上次重点：{data.parentAttempt.next_focus||"未填写"}</p><details><summary className="ui-link min-h-11 cursor-pointer py-3">回看上次回答与反馈</summary><p className="whitespace-pre-wrap">{data.parentAttempt.response_transcript_markdown}</p><p className="whitespace-pre-wrap">{data.parentAttempt.self_review_markdown}</p></details></>:<p>原练习不可用，当前输入仍保留。请返回练习记录重新选择原练习后继续，未自动改为独立练习。</p>}</section>:null}
      <PracticeAttemptForm key={data.attempts[0]?.id ?? "first-attempt"} preparationId={prep.id} parentAttemptId={parent} blocked={parent&&!data.parentAttempt?"无法核对原练习，暂不能保存这次继续练习。":undefined} historyHref={`/career/interview/practice/${prep.id}#practice-history`}>
        <input type="hidden" name="parent_attempt_id" value={data.parentAttempt?.id??""} />
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
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">这次调用的故事</span>
            <select name="story_id" defaultValue={primaryStory?.story.id ?? ""} className="ui-field mt-2 min-h-11 w-full max-w-xl rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-base text-[var(--text-primary)] outline-none">
              <option value="">不指定故事</option>
              {data.linkedStories.map((item) => (
                <option key={item.story.id} value={item.story.id}>{item.story.title}{item.evidence_role === "primary" ? " · 首选" : ""}</option>
              ))}
            </select>
            {primaryStory?.story.one_line ? <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[var(--text-secondary)]">{primaryStory.story.one_line}</p> : null}
          </label>
        ) : <input type="hidden" name="story_id" value="" />}

        <label className="block">
          <span className="text-[15px] font-medium text-[var(--text-primary)]">我的回答</span>
          <textarea
            name="response_transcript_markdown"
            rows={10}
            maxLength={50_000}
            placeholder="先尝试完整回答，再展开下方参考答案核对。"
            className="ui-field mt-3 min-h-64 w-full resize-y rounded-[var(--radius-md)] bg-[var(--surface-canvas)] px-4 py-3 text-base leading-7 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </label>

      </PracticeAttemptForm>

      <div className="mt-12 max-w-3xl space-y-5">
        {currentAnswer || thoughts || prep.risk_markdown ? (
          <details>
            <DisclosureSummary>查看标准答案与讲解</DisclosureSummary>
            <InterviewStudyView
              key={currentAnswer?.id ?? prep.id}
              answer={currentAnswer?.body_markdown ?? ""}
              thoughts={thoughts}
              isDraft={currentAnswer?.status === "draft"}
              answerMeta={workspaceAnswerMetadata(currentAnswer) ?? undefined}
              learning={{
                keyMessage: prep.key_message && !thoughts.includes(prep.key_message) ? prep.key_message : "",
                logic: prep.answer_logic_markdown && !thoughts.includes(prep.answer_logic_markdown) ? prep.answer_logic_markdown : "",
                pitfalls: prep.risk_markdown ?? "", nextFocus: prep.next_focus ?? "",
              }}
              showRecall={false}
              versionHref={`${questionHref}#answer-versions`}
            />
          </details>
        ) : null}

        {data.attempts.length ? (
          <details id="practice-history">
            <DisclosureSummary>最近的练习（{data.attempts.length} 次，最多展示 8 次）</DisclosureSummary>
            <div className="mt-4 space-y-4">
              {data.attempts.map((attempt) => (
                <article key={attempt.id} className="border-b border-[var(--separator)] pb-5 last:border-0">
                  <p className="text-xs text-[var(--text-tertiary)]">{formatDateTime(attempt.practiced_at)}{attempt.duration_seconds ? ` · ${attempt.duration_seconds} 秒` : ""}</p>
                  {attempt.issue_tags?.length ? <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">卡点：{attempt.issue_tags.map((tag: string) => issueLabels[tag] ?? tag).join("、")}</p> : null}
                  {attempt.response_transcript_markdown ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-secondary)]">{attempt.response_transcript_markdown}</p> : null}
                  {attempt.self_review_markdown ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-secondary)]">复盘：{attempt.self_review_markdown}</p> : null}
                  {attempt.next_focus ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">下次重点：{attempt.next_focus}</p> : null}
                  <Link className="ui-link inline-flex min-h-11 items-center" href={`/career/interview/practice/${prep.id}?parent=${attempt.id}`}>从这次薄弱点续练</Link>
                </article>
              ))}
            </div>
          </details>
        ) : <p id="practice-history" className="text-sm text-[var(--text-tertiary)]">还没有已保存的练习。</p>}
      </div>
    </>
  );
}
