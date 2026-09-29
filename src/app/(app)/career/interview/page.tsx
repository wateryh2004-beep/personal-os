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
  const otherTargets = targets.filter((context: any) => context.status !== "active");

  return (
    <>
      <PageHeader
        title="面试准备"
        description="先看目标岗位，再决定该准备什么。题库、练习和复盘都服务于具体岗位。"
        action={<Link href="/career/interview/questions" className="text-sm font-medium text-[#365F78]">查看通用题库 →</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview" />

      {data.unavailable ? (
        <p className="mb-7 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          面试准备数据暂时不可用，请检查数据库升级状态。
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">当前目标岗位</h2>
            <p className="mt-1 text-sm text-zinc-500">每个岗位有自己的题目准备、练习节奏和复盘记录。</p>
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-[#365F78]">+ 添加目标岗位</summary>
            <div className="mt-4 rounded-2xl bg-zinc-50 p-5">
              <form action={createInterviewContext} className="grid gap-4 sm:grid-cols-2 lg:w-[620px]">
                <Field name="title" label="显示名称" required placeholder="太古集团 Management Trainee" />
                <Field name="organization_snapshot" label="公司" placeholder="Swire" />
                <Field name="role_title_snapshot" label="岗位" placeholder="Management Trainee" />
                <label className="grid gap-1.5 text-sm">
                  <span className="text-zinc-600">默认语言</span>
                  <select name="default_language" defaultValue="bilingual" className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                    <option value="bilingual">双语</option>
                  </select>
                </label>
                <Field name="next_interview_at" label="下一场面试" type="datetime-local" />
                <label className="grid gap-1.5 text-sm">
                  <span className="text-zinc-600">优先级</span>
                  <select name="priority" defaultValue="4" className="rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200">
                    {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <span className="text-zinc-600">备注</span>
                  <textarea name="notes_markdown" className="min-h-20 rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200" />
                </label>
                <input type="hidden" name="context_type" value="target" />
                <input type="hidden" name="status" value="active" />
                <input type="hidden" name="career_direction_id" value="" />
                <input type="hidden" name="opportunity_id" value="" />
                <input type="hidden" name="application_id" value="" />
                <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2">创建目标岗位</button>
              </form>
            </div>
          </details>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {activeTargets.map((target: any) => {
            const preparations = data.preparations.filter((prep: any) => prep.context_id === target.id);
            const ready = preparations.filter((prep: any) => prep.status === "ready").length;
            const due = preparations.filter((prep: any) => prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
            const progress = preparations.length ? Math.round((ready / preparations.length) * 100) : 0;
            return (
              <Link
                key={target.id}
                href={`/career/interview/targets/${target.id}`}
                className="group rounded-2xl bg-zinc-50 p-5 transition-colors hover:bg-zinc-100/80"
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400">{target.organization_snapshot || "目标岗位"}</p>
                    <h3 className="mt-1 truncate text-lg font-medium tracking-tight">{target.role_title_snapshot || target.title}</h3>
                    {target.role_title_snapshot && target.title !== target.role_title_snapshot ? <p className="mt-1 truncate text-sm text-zinc-500">{target.title}</p> : null}
                  </div>
                  <span className="text-sm text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>{preparations.length ? `${ready} / ${preparations.length} 道已准备` : "尚未添加准备题目"}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-[#365F78]" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <span className={due ? "font-medium text-amber-700" : "text-zinc-500"}>{due ? `${due} 道需要练习` : "当前没有到期练习"}</span>
                  <span className="text-zinc-500">下一场：{formatDateTime(target.next_interview_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {!activeTargets.length ? (
          <div className="mt-6 rounded-2xl bg-zinc-50 px-6 py-12 text-center">
            <p className="font-medium">还没有当前目标岗位</p>
            <p className="mt-2 text-sm text-zinc-500">先建立一个真实求职目标，再围绕它组织题目和练习。</p>
          </div>
        ) : null}
      </section>

      {otherTargets.length ? (
        <section className="mt-12">
          <h2 className="text-sm font-medium text-zinc-500">暂停或已结束</h2>
          <div className="mt-3 space-y-1">
            {otherTargets.map((target: any) => (
              <Link key={target.id} href={`/career/interview/targets/${target.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-50">
                <span>{target.title}</span>
                <span className="text-xs text-zinc-400">{target.status === "paused" ? "暂停" : "已结束"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <QuickLink href="/career/interview/questions" title="通用题库" description="维护跨岗位复用的核心问题。" />
        <QuickLink href="/career/interview/practice" title="模拟练习" description="按优先级和到期时间进入练习。" />
        <QuickLink href="/career/interview/insights" title="整体复盘" description="查看跨岗位反复出现的问题。" />
      </section>
    </>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-xl px-1 py-3">
      <p className="font-medium">{title} <span className="text-zinc-400">→</span></p>
      <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>
    </Link>
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
