import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { createCareerApplication, transitionCareerApplication } from "@/features/career/actions";
import { getApplications } from "@/features/career/queries";

const stages = [
  ["draft","草稿"],
  ["preparing","准备中"],
  ["submitted","已投递"],
  ["interviewing","面试中"],
  ["offer","Offer"],
  ["rejected","未通过"],
  ["withdrawn","已撤回"],
  ["closed","已结束"],
] as const;

const stageLabel = Object.fromEntries(stages);

export default async function ApplicationsPage() {
  const data = await getApplications();

  return (
    <>
      <PageHeader title="申请" description="只保留真实投递和阶段变化。" />
      <CareerNav current="/career/applications" />

      {data.unavailable ? <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">申请历史数据暂时不可用。</p> : null}

      <div className="mb-8 flex justify-end">
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 新建申请</summary>
          <form action={createCareerApplication} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 md:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">机会</span>
              <select required name="opportunity_id" className="px-3 py-2">
                <option value="">选择机会</option>
                {data.opportunities.map((item) => <option key={item.id} value={item.id}>{item.organization} · {item.role_title}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">简历版本</span>
              <select name="resume_version_id" className="px-3 py-2">
                <option value="">尚未确定</option>
                {data.resumes.map((item) => <option key={item.id} value={item.id}>{item.title}{item.status !== "approved" ? "（草稿）" : ""}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">初始阶段</span>
              <select name="status" defaultValue="preparing" className="px-3 py-2">
                {stages.slice(0,3).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-zinc-500">投递时间</span>
              <input name="applied_at" type="datetime-local" className="px-3 py-2"/>
            </label>
            <label className="grid gap-1.5 text-sm md:col-span-3">
              <span className="text-zinc-500">备注</span>
              <textarea name="notes_markdown" rows={3} className="px-3 py-2"/>
            </label>
            <button disabled={!data.opportunities.length} className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">创建</button>
          </form>
        </details>
      </div>

      <div className="space-y-1">
        {data.applications.map((application) => {
          const opportunity = Array.isArray(application.career_opportunities) ? application.career_opportunities[0] : application.career_opportunities;
          const resume = Array.isArray(application.resume_versions) ? application.resume_versions[0] : application.resume_versions;
          const history = data.events.filter((event) => event.application_id === application.id);

          return (
            <article key={application.id} className="rounded-lg px-2 py-4 hover:bg-white/70">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <h2 className="text-sm font-medium text-zinc-900">{opportunity?.role_title || "未知岗位"}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{opportunity?.organization || "未知组织"}</p>
                </div>
                <p className="text-xs text-zinc-400">{stageLabel[application.status] ?? application.status}</p>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
                {resume?.title ? <span>{resume.title}</span> : null}
                {application.applied_at ? <span>{new Date(application.applied_at).toLocaleString("zh-CN")}</span> : null}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">更新与历史</summary>
                <form action={transitionCareerApplication} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="application_id" value={application.id}/>
                  <input type="hidden" name="note" value=""/>
                  <select name="status" defaultValue={application.status} className="px-2 py-1.5 text-sm">
                    {stages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="text-sm text-[#365F78]">更新阶段</button>
                </form>

                {history.length ? (
                  <ol className="mt-4 space-y-2">
                    {history.map((event) => (
                      <li key={event.id} className="text-xs text-zinc-500">
                        <span>{event.from_status ? (stageLabel[event.from_status] ?? event.from_status) + " → " : ""}{stageLabel[event.to_status] ?? event.to_status}</span>
                        <time className="ml-3 text-zinc-400">{new Date(event.occurred_at).toLocaleString("zh-CN")}</time>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </details>
            </article>
          );
        })}
      </div>

      {!data.applications.length ? <div className="py-16 text-center text-sm text-zinc-400">还没有申请记录。</div> : null}
    </>
  );
}
