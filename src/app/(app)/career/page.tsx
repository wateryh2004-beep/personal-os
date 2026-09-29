import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { getCareerPortfolio } from "@/features/career/queries";
import { formatDateTime } from "@/features/interview/utils";

export default async function CareerPage() {
  const data = await getCareerPortfolio();
  const p = data.profile;
  const now = Date.now();

  const activeApplications = data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status));
  const activeDirections = data.directions.filter((item) => ["active", "exploring"].includes(item.status));
  const targets = data.interviewTargets.filter((item) => item.status === "active").slice(0, 3);
  const milestones = data.milestones.filter((item) => !["completed", "skipped"].includes(item.status)).slice(0, 3);

  return (
    <>
      <PageHeader
        title="职业"
        description={p?.professional_headline || p?.current_stage || "围绕真实岗位推进下一步。"}
      />
      <CareerNav current="/career" />

      {data.career2Unavailable ? (
        <p className="mb-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          部分职业数据暂时不可用。
        </p>
      ) : null}

      <section className="mb-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-950">下一步</h2>
          <Link href="/career/roadmap" className="text-xs text-zinc-400 hover:text-zinc-700">路线图 →</Link>
        </div>

        <div className="mt-4 space-y-1">
          {targets.flatMap((target) => {
            const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id);
            const due = preparations.filter((prep) => prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
            if (!due) return [];
            return [{
              key: `target-${target.id}`,
              href: `/career/interview?context=${target.id}`,
              title: `${target.organization_snapshot || ""} ${target.role_title_snapshot || target.title}`.trim(),
              meta: `${due} 道题需要练习`,
            }];
          }).concat(
            milestones.map((milestone) => ({
              key: `milestone-${milestone.id}`,
              href: "/career/roadmap",
              title: milestone.title,
              meta: milestone.target_date || "未设日期",
            })),
          ).slice(0, 4).map((item) => (
            <Link key={item.key} href={item.href} className="group flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-white/70">
              <span className="min-w-0 truncate text-[14px] text-zinc-800">{item.title}</span>
              <span className="shrink-0 text-xs text-zinc-400 group-hover:text-zinc-600">{item.meta}</span>
            </Link>
          ))}

          {!targets.length && !milestones.length ? (
            <p className="py-3 text-sm text-zinc-400">目前没有需要立即处理的职业事项。</p>
          ) : null}
        </div>
      </section>

      <section className="mb-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-zinc-950">目标岗位</h2>
          <Link href="/career/interview" className="text-xs text-zinc-400 hover:text-zinc-700">全部 →</Link>
        </div>

        <div className="mt-4 space-y-1">
          {targets.map((target) => {
            const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id);
            const ready = preparations.filter((prep) => prep.status === "ready").length;
            const due = preparations.filter((prep) => prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
            return (
              <Link key={target.id} href={`/career/interview?context=${target.id}`} className="group grid gap-1 rounded-lg px-2 py-3 hover:bg-white/70 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-zinc-900">{target.role_title_snapshot || target.title}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">{target.organization_snapshot || target.title}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{preparations.length ? `${ready}/${preparations.length} 已准备` : "尚未开始"}</span>
                  {due ? <span className="text-amber-700">{due} 待练</span> : null}
                  {target.next_interview_at ? <span className="hidden sm:inline">{formatDateTime(target.next_interview_at)}</span> : null}
                </div>
              </Link>
            );
          })}

          {!targets.length ? (
            <Link href="/career/interview" className="block py-3 text-sm text-zinc-400 hover:text-zinc-700">添加第一个目标岗位 →</Link>
          ) : null}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-[15px] font-medium text-zinc-950">关键资产</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <Asset href="/career/experiences" label="经历" value={data.experiences.length} />
          <Asset href="/career/resumes" label="简历" value={data.resumes.length} />
          <Asset href="/career/skills" label="能力" value={data.skills.length} />
          <Asset href="/career/applications" label="申请" value={activeApplications.length} />
        </div>
      </section>

      {activeDirections.length ? (
        <section className="pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-medium text-zinc-950">职业方向</h2>
            <Link href="/career/directions" className="text-xs text-zinc-400 hover:text-zinc-700">管理 →</Link>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {activeDirections.slice(0, 3).map((item) => item.name).join(" · ")}
          </p>
        </section>
      ) : null}
    </>
  );
}

function Asset({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="group">
      <p className="text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-400 group-hover:text-zinc-700">{label}</p>
    </Link>
  );
}
