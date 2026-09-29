import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import {
  addSessionAttempt,
  archiveInterviewSession,
  completeInterviewSession,
  startInterviewSession,
} from "@/features/interview/actions";
import { getInterviewSessionDetail } from "@/features/interview/queries";
import { categoryLabels, languageLabels, sessionFormatLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewSessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const data = await getInterviewSessionDetail(sessionId);
  if (!data) notFound();
  const session: any = data.session;
  const context = Array.isArray(session.interview_contexts) ? session.interview_contexts[0] : session.interview_contexts;

  return (
    <>
      <PageHeader
        title={session.title}
        description={`${session.session_kind === "real" ? "真实面试" : "模拟面试"} · ${sessionFormatLabels[session.session_format] ?? session.session_format} · ${languageLabels[session.language_mode] ?? session.language_mode}`}
        eyebrow={<Link href="/career/interview/sessions" className="hover:text-zinc-700">面试准备 / 面试记录</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/sessions/${sessionId}`} />

      <section className="mb-7 border-y py-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
          <span>目标：{context?.title || "General"}</span>
          <span>状态：<strong className="font-medium text-zinc-900">{session.status}</strong></span>
          <span>轮次：{session.round_label || "—"}</span>
          <span>面试官：{session.interviewer_label || "—"}</span>
          <span>开始时间：{formatDateTime(session.started_at)}</span>
        </div>
        {session.status === "planned" ? <form action={startInterviewSession} className="mt-4"><input type="hidden" name="session_id" value={session.id}/><button className="bg-[#365F78] px-3 py-2 text-sm text-white">开始面试</button></form> : null}
      </section>

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main>
          <section>
            <h2 className="text-lg font-medium">问答过程</h2>
            <p className="mt-1 text-sm text-zinc-500">记录真实问法和追问关系；临场问题不要求提前建立准备项。</p>
            <div className="mt-5 space-y-4">
              {data.attempts.map((attempt: any) => {
                const parent = attempt.parent_attempt_id ? data.attempts.find((item: any) => item.id === attempt.parent_attempt_id) : null;
                return (
                  <article key={attempt.id} className={`border-l-2 pl-4 ${parent ? "ml-6 border-[#365F78]/50" : "border-zinc-200"}`}>
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-zinc-400">Q{attempt.sequence_no}{parent ? ` · 追问 Q${parent.sequence_no}` : ""}</p><h3 className="mt-1 font-medium">{attempt.prompt_snapshot}</h3></div><span className="text-xs text-zinc-400">{attempt.duration_seconds ? `${attempt.duration_seconds}s` : ""}</span></div>
                    {attempt.response_transcript_markdown ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{attempt.response_transcript_markdown}</p> : null}
                    {attempt.self_review_markdown ? <p className="mt-2 text-xs text-zinc-500">自评：{attempt.self_review_markdown}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1">{(attempt.issue_tags ?? []).map((tag: string) => <span key={tag} className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{tag}</span>)}</div>
                  </article>
                );
              })}
              {!data.attempts.length ? <p className="text-sm text-zinc-500">还没有问题。可以从右侧添加第一题。</p> : null}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-medium">整场复盘</h2>
            {session.overall_review_markdown ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{session.overall_review_markdown}</p> : <p className="mt-3 text-sm text-zinc-500">完成后记录整场表现，不要只逐题复盘。</p>}
            <div className="mt-3 flex flex-wrap gap-1">{(session.issue_tags ?? []).map((tag: string) => <span key={tag} className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{tag}</span>)}</div>
            {session.next_focus ? <p className="mt-3 text-sm font-medium">下次重点：{session.next_focus}</p> : null}
          </section>
        </main>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {session.status !== "completed" && session.status !== "cancelled" ? (
            <section className="border p-4">
              <p className="font-medium">记录下一题</p>
              <form action={addSessionAttempt} className="mt-4 grid gap-3">
                <input type="hidden" name="session_id" value={session.id}/>
                <label className="grid gap-1 text-sm"><span>关联准备题目（可选）</span><select name="preparation_id" className="border bg-white px-3 py-2"><option value="">临场问题</option>{data.preparations.map((prep: any) => { const q = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions; const c = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts; return <option key={prep.id} value={prep.id}>{c?.title ? `[${c.title}] ` : ""}{q?.short_title || q?.canonical_prompt}</option>; })}</select></label>
                <label className="grid gap-1 text-sm"><span>追问上一题（可选）</span><select name="parent_attempt_id" className="border bg-white px-3 py-2"><option value="">独立问题</option>{data.attempts.map((attempt: any) => <option key={attempt.id} value={attempt.id}>Q{attempt.sequence_no} · {attempt.prompt_snapshot.slice(0,60)}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>真实问法 *</span><textarea required name="prompt_snapshot" rows={3} className="border bg-white px-3 py-2"/></label>
                <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm"><span>输入方式</span><select name="input_mode" defaultValue="text" className="border bg-white px-3 py-2"><option value="text">Text</option><option value="voice">Voice</option><option value="transcript_import">Transcript</option></select></label><label className="grid gap-1 text-sm"><span>语言</span><select name="language" defaultValue={session.language_mode} className="border bg-white px-3 py-2"><option value="zh">中文</option><option value="en">英文</option><option value="bilingual">双语</option></select></label></div>
                <label className="grid gap-1 text-sm"><span>实际回答</span><textarea name="response_transcript_markdown" rows={5} className="border bg-white px-3 py-2"/></label>
                <label className="grid gap-1 text-sm"><span>自我复盘</span><textarea name="self_review_markdown" rows={3} className="border bg-white px-3 py-2"/></label>
                <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm"><span>时长秒</span><input type="number" name="duration_seconds" min={1} max={7200} className="border bg-white px-3 py-2"/></label><label className="grid gap-1 text-sm"><span>回答后信心</span><select name="confidence_after" className="border bg-white px-3 py-2"><option value="">—</option>{[1,2,3,4,5].map((v) => <option key={v}>{v}</option>)}</select></label></div>
                <input type="hidden" name="confidence_before" value=""/>
                <label className="grid gap-1 text-sm"><span>问题标签</span><input name="issue_tags" placeholder="late_conclusion, weak_evidence" className="border bg-white px-3 py-2"/></label>
                <label className="grid gap-1 text-sm"><span>优势标签</span><input name="strength_tags" className="border bg-white px-3 py-2"/></label>
                <label className="grid gap-1 text-sm"><span>下次重点</span><input name="next_focus" className="border bg-white px-3 py-2"/></label>
                <button className="bg-zinc-900 px-3 py-2 text-sm text-white">保存 Q{data.attempts.length + 1}</button>
              </form>
            </section>
          ) : null}

          <section className="border p-4">
            <p className="font-medium">整场复盘</p>
            <form action={completeInterviewSession} className="mt-4 grid gap-3">
              <input type="hidden" name="session_id" value={session.id}/>
              <label className="grid gap-1 text-sm"><span>整体复盘</span><textarea name="overall_review_markdown" defaultValue={session.overall_review_markdown} rows={5} className="border bg-white px-3 py-2"/></label>
              <label className="grid gap-1 text-sm"><span>Strength tags</span><input name="strength_tags" defaultValue={(session.strength_tags ?? []).join(", ")} className="border bg-white px-3 py-2"/></label>
              <label className="grid gap-1 text-sm"><span>Issue tags</span><input name="issue_tags" defaultValue={(session.issue_tags ?? []).join(", ")} className="border bg-white px-3 py-2"/></label>
              <label className="grid gap-1 text-sm"><span>下次重点</span><input name="next_focus" defaultValue={session.next_focus} className="border bg-white px-3 py-2"/></label>
              <button className="border border-[#365F78] px-3 py-2 text-sm text-[#365F78]">{session.status === "completed" ? "更新复盘" : "完成面试"}</button>
            </form>
          </section>

          <form action={archiveInterviewSession}><input type="hidden" name="session_id" value={session.id}/><button className="text-xs text-zinc-400 hover:text-red-600">归档记录</button></form>
        </aside>
      </div>
    </>
  );
}
