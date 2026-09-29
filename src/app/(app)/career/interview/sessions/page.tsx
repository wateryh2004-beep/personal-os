import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewSession } from "@/features/interview/actions";
import { getInterviewSessions } from "@/features/interview/queries";
import { languageLabels, sessionFormatLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewSessionsPage() {
  const data = await getInterviewSessions();

  return (
    <>
      <PageHeader title="Sessions" description="把连续问答当成一场完整面试：Mock 和 Real 都保留上下文、追问和整场复盘。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview/sessions" />

      <details className="mb-8 border-b pb-6">
        <summary className="cursor-pointer text-sm font-medium text-[#365F78]">+ 新建 Interview Session</summary>
        <form action={createInterviewSession} className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm"><span>标题 *</span><input required name="title" placeholder="Swire MT · Mock #1" className="border bg-white px-3 py-2"/></label>
          <label className="grid gap-1 text-sm"><span>Context</span><select name="context_id" className="border bg-white px-3 py-2"><option value="">General</option>{data.contexts.map((context: any) => <option key={context.id} value={context.id}>{context.title}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span>类型</span><select name="session_kind" defaultValue="mock" className="border bg-white px-3 py-2"><option value="mock">Mock</option><option value="real">Real Interview</option></select></label>
          <label className="grid gap-1 text-sm"><span>形式</span><select name="session_format" defaultValue="one_to_one" className="border bg-white px-3 py-2">{Object.entries(sessionFormatLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span>Facilitator</span><select name="facilitator" defaultValue="self" className="border bg-white px-3 py-2"><option value="self">Self</option><option value="ai">AI</option><option value="human">Human</option><option value="mixed">Mixed</option></select></label>
          <label className="grid gap-1 text-sm"><span>语言</span><select name="language_mode" defaultValue="bilingual" className="border bg-white px-3 py-2"><option value="zh">中文</option><option value="en">英文</option><option value="bilingual">双语</option></select></label>
          <label className="grid gap-1 text-sm"><span>Round</span><input name="round_label" placeholder="First Round" className="border bg-white px-3 py-2"/></label>
          <label className="grid gap-1 text-sm"><span>Interviewer</span><input name="interviewer_label" placeholder="HR / Business Leader" className="border bg-white px-3 py-2"/></label>
          <label className="grid gap-1 text-sm"><span>计划时间</span><input type="datetime-local" name="scheduled_at" className="border bg-white px-3 py-2"/></label>
          <button className="w-fit bg-[#365F78] px-3 py-2 text-sm text-white">创建 Session</button>
        </form>
      </details>

      <div className="grid gap-5 lg:grid-cols-2">
        {data.sessions.map((session: any) => {
          const context = Array.isArray(session.interview_contexts) ? session.interview_contexts[0] : session.interview_contexts;
          return (
            <Link href={`/career/interview/sessions/${session.id}`} key={session.id} className="border-t pt-4 hover:border-[#365F78]">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-medium">{session.title}</h2><p className="mt-1 text-sm text-zinc-500">{context?.title || "General"} · {session.session_kind === "real" ? "Real" : "Mock"}</p></div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs">{session.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-zinc-500">
                <div><p className="text-zinc-400">Format</p><p className="mt-1">{sessionFormatLabels[session.session_format] ?? session.session_format}</p></div>
                <div><p className="text-zinc-400">Language</p><p className="mt-1">{languageLabels[session.language_mode] ?? session.language_mode}</p></div>
                <div><p className="text-zinc-400">Questions</p><p className="mt-1">{data.counts[session.id] ?? 0}</p></div>
              </div>
              <p className="mt-3 text-xs text-zinc-400">{formatDateTime(session.scheduled_at || session.started_at || session.created_at)}</p>
              {session.next_focus ? <p className="mt-3 text-sm text-zinc-600">Next focus: {session.next_focus}</p> : null}
            </Link>
          );
        })}
      </div>
      {!data.sessions.length ? <div className="py-20 text-center"><p className="font-medium">还没有 Session</p><p className="mt-2 text-sm text-zinc-500">先创建一次 Mock；真实面试同样可以事后录入。</p></div> : null}
    </>
  );
}
