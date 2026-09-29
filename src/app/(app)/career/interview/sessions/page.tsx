import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewSession } from "@/features/interview/actions";
import { getInterviewSessions } from "@/features/interview/queries";
import { languageLabels, sessionFormatLabels } from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

const sessionStatusLabels: Record<string, string> = {
  planned: "计划中",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export default async function InterviewSessionsPage() {
  const data = await getInterviewSessions();

  return (
    <>
      <PageHeader title="面试记录" description="把一次连续问答作为完整面试保存；模拟面试和真实面试都保留追问与整场复盘。" />
      <CareerNav current="/career/interview/sessions" />
      <InterviewNav current="/career/interview/sessions" />

      <div className="mb-8 flex justify-end">
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-[#365F78]">+ 新建面试记录</summary>
          <div className="mt-4 rounded-2xl bg-zinc-50 p-5">
            <form action={createInterviewSession} className="grid gap-4 md:grid-cols-3 lg:w-[760px]">
              <Field name="title" label="标题" required placeholder="太古 MT · 模拟面试 #1" />
              <Select name="context_id" label="目标岗位" defaultValue="" options={[["", "通用"] as [string, string], ...data.contexts.map((context: any) => [String(context.id), String(context.title)] as [string, string])]} />
              <Select name="session_kind" label="类型" defaultValue="mock" options={[["mock","模拟面试"],["real","真实面试"]]} />
              <Select name="session_format" label="形式" defaultValue="one_to_one" options={Object.entries(sessionFormatLabels)} />
              <Select name="facilitator" label="组织方式" defaultValue="self" options={[["self","自练"],["ai","AI 模拟"],["human","真人"],["mixed","混合"]]} />
              <Select name="language_mode" label="语言" defaultValue="bilingual" options={[["zh","中文"],["en","英文"],["bilingual","双语"]]} />
              <Field name="round_label" label="轮次" placeholder="一面" />
              <Field name="interviewer_label" label="面试官" placeholder="HR / 业务负责人" />
              <Field name="scheduled_at" label="计划时间" type="datetime-local" />
              <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">创建记录</button>
            </form>
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.sessions.map((session: any) => {
          const context = Array.isArray(session.interview_contexts) ? session.interview_contexts[0] : session.interview_contexts;
          return (
            <Link href={`/career/interview/sessions/${session.id}`} key={session.id} className="rounded-2xl bg-zinc-50 p-5 transition-colors hover:bg-zinc-100/80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{session.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{context?.title || "通用"} · {session.session_kind === "real" ? "真实面试" : "模拟面试"}</p>
                </div>
                <span className="text-xs text-zinc-400">{sessionStatusLabels[session.status] ?? session.status}</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-zinc-500">
                <div><p className="text-zinc-400">形式</p><p className="mt-1">{sessionFormatLabels[session.session_format] ?? session.session_format}</p></div>
                <div><p className="text-zinc-400">语言</p><p className="mt-1">{languageLabels[session.language_mode] ?? session.language_mode}</p></div>
                <div><p className="text-zinc-400">题目</p><p className="mt-1">{data.counts[session.id] ?? 0}</p></div>
              </div>
              <p className="mt-4 text-xs text-zinc-400">{formatDateTime(session.scheduled_at || session.started_at || session.created_at)}</p>
              {session.next_focus ? <p className="mt-3 text-sm text-zinc-600">下次重点：{session.next_focus}</p> : null}
            </Link>
          );
        })}
      </div>

      {!data.sessions.length ? (
        <div className="rounded-2xl bg-zinc-50 px-6 py-14 text-center">
          <p className="font-medium">还没有面试记录</p>
          <p className="mt-2 text-sm text-zinc-500">可以先创建一次模拟面试；真实面试也可以事后录入。</p>
        </div>
      ) : null}
    </>
  );
}

function Field({ name, label, type = "text", required = false, placeholder = "" }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder} className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200" />
    </label>
  );
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: [string, string][] }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <select name={name} defaultValue={defaultValue} className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
        {options.map(([value, text]) => <option key={value || "none"} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
