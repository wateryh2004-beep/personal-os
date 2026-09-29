import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { createInterviewContext } from "@/features/interview/actions";
import { getInterviewQuestions } from "@/features/interview/queries";

export default async function InterviewHomePage() {
  const data = await getInterviewQuestions();
  const targets = data.contexts.filter((context: any) => context.context_type !== "general");
  const activeTargets = targets.filter((context: any) => context.status === "active");
  const inactiveTargets = targets.filter((context: any) => context.status !== "active");

  return (
    <>
      <PageHeader title="面试" />
      <CareerNav current="/career/interview" />
      <InterviewNav current="/career/interview" />

      <div className="mb-8 flex justify-end">
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 新岗位</summary>
          <form action={createInterviewContext} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 sm:grid-cols-2">
            <Field name="organization_snapshot" label="公司" required placeholder="Swire" />
            <Field name="role_title_snapshot" label="岗位" required placeholder="Management Trainee" />
            <input type="hidden" name="context_type" value="target" />
            <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">创建</button>
          </form>
        </details>
      </div>

      <div className="space-y-1">
        {activeTargets.map((target: any) => (
          <Link
            key={target.id}
            href={`/career/interview/targets/${target.id}`}
            className="group flex items-center justify-between gap-4 rounded-lg px-2 py-4 hover:bg-white/70"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-zinc-900">{target.role_title_snapshot || target.title}</p>
              <p className="mt-1 truncate text-xs text-zinc-400">{target.organization_snapshot || ""}</p>
            </div>
            <span className="text-zinc-300 group-hover:text-zinc-500">→</span>
          </Link>
        ))}
        {!activeTargets.length ? <p className="py-6 text-sm text-zinc-400">还没有岗位。</p> : null}
      </div>

      {inactiveTargets.length ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">其他岗位 · {inactiveTargets.length}</summary>
          <div className="mt-3 space-y-1">
            {inactiveTargets.map((target: any) => (
              <Link key={target.id} href={`/career/interview/targets/${target.id}`} className="flex items-center justify-between rounded-lg px-2 py-3 text-sm hover:bg-white/70">
                <span className="text-zinc-700">{target.role_title_snapshot || target.title}</span>
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

function Field({ name, label, required = false, placeholder = "" }: { name: string; label: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <input name={name} required={required} placeholder={placeholder} className={controlClass} />
    </label>
  );
}
