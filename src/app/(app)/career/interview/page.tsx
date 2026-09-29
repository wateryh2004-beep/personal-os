import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewContext } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewHomePage() {
  const data = await getInterviewQuestions();
  const now = Date.now();
  const targets = data.contexts.filter((context: any) => context.context_type !== "general");
  const activeTargets = targets.filter((context: any) => context.status === "active");
  const inactiveTargets = targets.filter((context: any) => context.status !== "active");

  return (
    <>
      <PageHeader title="面试" description="按目标岗位推进准备。" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview" />

      <div className="mb-8 flex justify-end">
        <details>
          <summary className="cursor-pointer list-none text-sm text-zinc-500 hover:text-zinc-900">+ 新增岗位</summary>
          <form action={createInterviewContext} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 sm:grid-cols-2">
            <Field name="title" label="显示名称" required placeholder="太古集团 Management Trainee" />
            <Field name="organization_snapshot" label="公司" required placeholder="Swire" />
            <Field name="role_title_snapshot" label="岗位" required placeholder="Management Trainee" />
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">默认语言</span>
              <select name="default_language" defaultValue="bilingual" className={controlClass}>
                <option value="zh">中文</option>
                <option value="en">英文</option>
                <option value="bilingual">双语</option>
              </select>
            </label>
            <Field name="next_interview_at" label="下一场面试" type="datetime-local" />
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">优先级</span>
              <select name="priority" defaultValue="4" className={controlClass}>
                {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="text-zinc-500">备注</span>
              <textarea name="notes_markdown" rows={3} className={controlClass} />
            </label>
            <input type="hidden" name="context_type" value="target" />
            <input type="hidden" name="status" value="active" />
            <input type="hidden" name="career_direction_id" value="" />
            <input type="hidden" name="opportunity_id" value="" />
            <input type="hidden" name="application_id" value="" />
            <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">创建</button>
          </form>
        </details>
      </div>

      <section>
        <h2 className="text-[15px] font-medium text-zinc-950">当前岗位</h2>
        <div className="mt-4 space-y-1">
          {activeTargets.map((target: any) => {
            const preparations = data.preparations.filter((prep: any) => prep.context_id === target.id);
            const ready = preparations.filter((prep: any) => prep.status === "ready").length;
            const due = preparations.filter((prep: any) => prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
            return (
              <Link key={target.id} href={`/career/interview/targets/${target.id}`} className="group grid gap-1 rounded-lg px-2 py-4 hover:bg-white/70 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-zinc-900">{target.role_title_snapshot || target.title}</p>
                  <p className="mt-1 truncate text-xs text-zinc-400">{target.organization_snapshot || target.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <span>{preparations.length ? `${ready}/${preparations.length} 已准备` : "尚未开始"}</span>
                  {due ? <span className="text-amber-700">{due} 待练</span> : null}
                  {target.next_interview_at ? <span>{formatDateTime(target.next_interview_at)}</span> : null}
                  <span className="text-zinc-300 group-hover:text-zinc-500">→</span>
                </div>
              </Link>
            );
          })}

          {!activeTargets.length ? (
            <p className="py-6 text-sm text-zinc-400">还没有目标岗位。</p>
          ) : null}
        </div>
      </section>

      {inactiveTargets.length ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">暂停或已结束 · {inactiveTargets.length}</summary>
          <div className="mt-3 space-y-1">
            {inactiveTargets.map((target: any) => (
              <Link key={target.id} href={`/career/interview/targets/${target.id}`} className="flex items-center justify-between rounded-lg px-2 py-3 text-sm hover:bg-white/70">
                <span className="text-zinc-700">{target.title}</span>
                <span className="text-xs text-zinc-400">{target.status === "paused" ? "暂停" : "已结束"}</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

const controlClass = "rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200 outline-none focus:ring-zinc-400";

function Field({ name, label, type = "text", required = false, placeholder = "" }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder} className={controlClass} />
    </label>
  );
}
