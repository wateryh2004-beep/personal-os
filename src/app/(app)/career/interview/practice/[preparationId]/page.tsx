import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createPracticeAttempt } from "@/features/interview/actions";
import { getPracticeDetail } from "@/features/interview/queries";
import { answerModeLabels, languageLabels, statusLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function PracticeDetailPage({ params }: { params: Promise<{ preparationId: string }> }) {
  const { preparationId } = await params;
  const data = await getPracticeDetail(preparationId);
  if (!data) notFound();
  const prep: any = data.preparation;
  const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
  const context = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts;
  const prompt = prep.prompt_override || question?.canonical_prompt || "未命名问题";

  return (
    <>
      <PageHeader
        title="Practice"
        description={prompt}
        eyebrow={<Link href="/career/interview/practice" className="hover:text-zinc-700">Interview Lab / Practice Queue</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/practice/${preparationId}`} />

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main>
          <section className="border-y py-5">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-zinc-100 px-2 py-1">{context?.title || "General"}</span>
              <span className="rounded bg-zinc-100 px-2 py-1">{statusLabels[prep.status] ?? prep.status}</span>
              <span className="rounded bg-zinc-100 px-2 py-1">{languageLabels[prep.target_language] ?? prep.target_language}</span>
            </div>
            {prep.key_message ? <div className="mt-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Key Message</p><p className="mt-1 text-sm font-medium leading-6">{prep.key_message}</p></div> : null}
            {prep.answer_logic_markdown ? <div className="mt-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Answer Logic</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{prep.answer_logic_markdown}</p></div> : null}
          </section>

          <form action={createPracticeAttempt} className="mt-7 grid gap-4">
            <input type="hidden" name="preparation_id" value={prep.id} />
            <input type="hidden" name="prompt_snapshot" value={prompt} />
            <label className="grid gap-1 text-sm">
              <span>基于答案版本（可选）</span>
              <select name="answer_version_id" className="border bg-white px-3 py-2">
                <option value="">不依赖稿件，直接回答</option>
                {data.answers.map((answer: any) => <option key={answer.id} value={answer.id}>{answerModeLabels[answer.answer_mode] ?? answer.answer_mode}{answer.target_seconds ? ` · ${answer.target_seconds}s` : ""} · {languageLabels[answer.language] ?? answer.language}</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="grid gap-1 text-sm"><span>输入方式</span><select name="input_mode" defaultValue="text" className="border bg-white px-3 py-2"><option value="text">文字</option><option value="voice">Voice / 转写</option><option value="transcript_import">导入 transcript</option></select></label>
              <label className="grid gap-1 text-sm"><span>语言</span><select name="language" defaultValue={prep.target_language} className="border bg-white px-3 py-2"><option value="zh">中文</option><option value="en">英文</option><option value="bilingual">双语</option></select></label>
              <label className="grid gap-1 text-sm"><span>时长（秒）</span><input type="number" min={1} max={7200} name="duration_seconds" className="border bg-white px-3 py-2"/></label>
              <label className="grid gap-1 text-sm"><span>Confidence before</span><select name="confidence_before" className="border bg-white px-3 py-2"><option value="">—</option>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-sm"><span>我实际说了什么</span><textarea name="response_transcript_markdown" className="min-h-48 border bg-white px-3 py-2" placeholder="不要先写完美答案，尽量记录真实输出。" /></label>
            <label className="grid gap-1 text-sm"><span>Self Review</span><textarea name="self_review_markdown" className="min-h-24 border bg-white px-3 py-2" placeholder="哪里卡、哪里绕、哪一句最不可信？"/></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>Issue tags（逗号分隔）</span><input name="issue_tags" placeholder="late_conclusion, weak_evidence" className="border bg-white px-3 py-2"/></label>
              <label className="grid gap-1 text-sm"><span>Strength tags（逗号分隔）</span><input name="strength_tags" className="border bg-white px-3 py-2"/></label>
            </div>
            <label className="grid gap-1 text-sm"><span>Next Focus · 下一次只改一件事</span><input name="next_focus" defaultValue={prep.next_focus || ""} className="border bg-white px-3 py-2"/></label>
            <label className="grid gap-1 text-sm sm:max-w-48"><span>Confidence after</span><select name="confidence_after" className="border bg-white px-3 py-2"><option value="">—</option>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label>
            <button className="w-fit bg-[#365F78] px-4 py-2.5 text-sm font-medium text-white">保存 Attempt</button>
          </form>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className="border p-4">
            <p className="text-sm font-medium">Current Answer</p>
            {data.answers.length ? data.answers.map((answer: any) => <div key={answer.id} className="mt-3 border-t pt-3"><p className="text-xs text-zinc-500">{answerModeLabels[answer.answer_mode] ?? answer.answer_mode}{answer.target_seconds ? ` · ${answer.target_seconds}s` : ""} · {languageLabels[answer.language] ?? answer.language}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{answer.body_markdown}</p></div>) : <p className="mt-2 text-sm text-zinc-500">还没有 Current Answer。练习仍可进行。</p>}
          </section>
          <section className="border p-4 text-sm">
            <p className="font-medium">Preparation</p>
            <dl className="mt-3 space-y-2 text-xs text-zinc-500"><div className="flex justify-between"><dt>Evidence</dt><dd>{data.evidenceCount}</dd></div><div className="flex justify-between"><dt>Attempts</dt><dd>{data.attempts.length}</dd></div><div className="flex justify-between"><dt>Last</dt><dd>{formatDateTime(prep.last_practiced_at)}</dd></div></dl>
            <Link href={prep.context_id ? `/career/interview/questions/${prep.question_id}?context=${prep.context_id}` : `/career/interview/questions/${prep.question_id}`} className="mt-4 block text-[#365F78]">回到 Question Detail →</Link>
          </section>
          <section className="border p-4">
            <p className="text-sm font-medium">Recent Attempts</p>
            <div className="mt-3 space-y-3">{data.attempts.map((attempt: any) => <div key={attempt.id} className="border-t pt-2 text-xs"><p>{formatDateTime(attempt.practiced_at)}{attempt.duration_seconds ? ` · ${attempt.duration_seconds}s` : ""}</p>{attempt.next_focus ? <p className="mt-1 text-zinc-500">→ {attempt.next_focus}</p> : null}</div>)}</div>
          </section>
        </aside>
      </div>
    </>
  );
}
