import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { getCareerPortfolio } from "@/features/career/queries";

const directionStatus: Record<string, string> = {
  exploring: "探索中",
  active: "主攻",
  paused: "暂停",
  deprioritized: "降级",
  rejected: "放弃",
  archived: "已归档",
};

const milestoneStatus: Record<string, string> = {
  planned: "计划",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "跳过",
};

export default async function CareerPage() {
  const data = await getCareerPortfolio();
  const p = data.profile;
  const activeApplications = data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status));
  const activeDirections = data.directions.filter((item) => ["active", "exploring"].includes(item.status));
  const currentExperiences = data.experiences.filter((item) => item.is_current);
  const upcomingMilestones = data.milestones.filter((item) => item.status !== "completed" && item.status !== "skipped").slice(0, 4);
  const recentResumes = data.resumes.slice(0, 3);
  const activeInterviewTargets = data.interviewTargets.filter((item) => item.status === "active").slice(0, 4);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="职业中心"
        description="只回答三个问题：现在要争取什么、接下来做什么、准备还缺什么。"
        action={<Link href="/career/opportunities" className="rounded-lg bg-[#365F78] px-3 py-2 text-sm font-medium text-white">查看求职机会</Link>}
      />
      <CareerNav current="/career" />

      {data.career2Unavailable ? (
        <p className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          职业数据尚未完成升级，部分机会、申请与简历功能暂不可用。
        </p>
      ) : null}

      <section className="mb-10 rounded-2xl bg-zinc-50 p-6">
        <p className="text-xs font-medium text-zinc-400">当前目标</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{p?.professional_headline || p?.current_stage || "完善你的职业目标"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              {p?.career_summary || "把招聘季、目标方向和当前阶段写清楚，Career 才能围绕真实目标组织后续准备。"}
            </p>
          </div>
          <Link href="/career/profile" className="text-sm text-[#365F78] hover:underline">编辑职业目标 →</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
          {p?.target_recruitment_cycle ? <span>目标招聘季：{p.target_recruitment_cycle}</span> : null}
          {p?.target_graduation_date ? <span>预计毕业：{p.target_graduation_date}</span> : null}
          <span>当前经历：{currentExperiences.length}</span>
          <span>活跃申请：{activeApplications.length}</span>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <main className="space-y-10">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">接下来要做</h2>
                <p className="mt-1 text-sm text-zinc-500">优先看近期节点，而不是系统里一共有多少条数据。</p>
              </div>
              <Link href="/career/roadmap" className="text-sm text-[#365F78]">完整路线图 →</Link>
            </div>
            <div className="mt-4 space-y-1">
              {upcomingMilestones.map((milestone) => (
                <div key={milestone.id} className="grid gap-2 rounded-xl px-3 py-3 hover:bg-zinc-50 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium">{milestone.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{milestoneStatus[milestone.status] ?? milestone.status}</p>
                  </div>
                  <time className="text-xs text-zinc-400">{milestone.target_date}</time>
                </div>
              ))}
              {!upcomingMilestones.length ? (
                <div className="py-6 text-sm text-zinc-500">暂时没有近期职业节点。可以在路线图里添加下一步。</div>
              ) : null}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">重点方向</h2>
                <p className="mt-1 text-sm text-zinc-500">这里只保留当前真正要验证或主攻的方向。</p>
              </div>
              <Link href="/career/directions" className="text-sm text-[#365F78]">管理方向 →</Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activeDirections.slice(0, 4).map((item) => (
                <Link key={item.id} href="/career/directions" className="rounded-2xl bg-zinc-50 p-4 transition-colors hover:bg-zinc-100/80">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">{item.name}</h3>
                    <span className="text-xs text-zinc-500">{directionStatus[item.status] ?? item.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{item.hypothesis_markdown || "尚未填写判断依据。"}</p>
                </Link>
              ))}
              {!activeDirections.length ? <p className="text-sm text-zinc-500">还没有当前主攻方向。</p> : null}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">当前目标岗位</h2>
                <p className="mt-1 text-sm text-zinc-500">从具体岗位进入准备，而不是从题库或功能入口开始。</p>
              </div>
              <Link href="/career/interview" className="text-sm text-[#365F78]">管理目标岗位 →</Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activeInterviewTargets.map((target) => {
                const preparations = data.interviewPreparations.filter((prep) => prep.context_id === target.id);
                const ready = preparations.filter((prep) => prep.status === "ready").length;
                const due = preparations.filter((prep) => prep.status !== "paused" && (!prep.next_practice_at || Date.parse(prep.next_practice_at) <= now)).length;
                return (
                  <Link key={target.id} href={`/career/interview/targets/${target.id}`} className="rounded-2xl bg-zinc-50 p-4 transition-colors hover:bg-zinc-100/80">
                    <p className="text-xs text-zinc-400">{target.organization_snapshot || "目标岗位"}</p>
                    <h3 className="mt-1 font-medium">{target.role_title_snapshot || target.title}</h3>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>{preparations.length ? `${ready}/${preparations.length} 道已准备` : "尚未加入准备题目"}</span>
                      <span className={due ? "font-medium text-amber-700" : ""}>{due ? `${due} 道待练` : "无到期练习"}</span>
                    </div>
                  </Link>
                );
              })}
              {!activeInterviewTargets.length ? (
                <Link href="/career/interview" className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">
                  还没有目标岗位。先建立一个真实求职目标 →
                </Link>
              ) : null}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">最近简历</h2>
                <p className="mt-1 text-sm text-zinc-500">只展示最近使用的版本。</p>
              </div>
              <Link href="/career/resumes" className="text-sm text-[#365F78]">简历中心 →</Link>
            </div>
            <div className="mt-4 divide-y border-y">
              {recentResumes.map((resume) => (
                <div key={resume.id} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-zinc-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{resume.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">更新于 {new Date(resume.updated_at).toLocaleDateString("zh-CN")}</p>
                  </div>
                  <span className="text-xs text-zinc-500">{resume.status === "approved" ? "已定稿" : "草稿"}</span>
                </div>
              ))}
              {!recentResumes.length ? <p className="py-5 text-sm text-zinc-500">还没有简历版本。</p> : null}
            </div>
          </section>
        </main>

        <aside className="space-y-8 lg:pl-3">
          <section>
            <h2 className="font-medium">当前状态</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="活跃申请" value={activeApplications.length} />
              <Row label="重点方向" value={activeDirections.length} />
              <Row label="经历素材" value={data.experiences.length} />
              <Row label="技能记录" value={data.skills.length} />
            </dl>
          </section>

          <section>
            <h2 className="font-medium">快速进入</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <Link href="/career/opportunities" className="text-[#365F78]">求职机会 →</Link>
              <Link href="/career/experiences" className="text-[#365F78]">经历素材 →</Link>
              <Link href="/career/skills" className="text-[#365F78]">能力成长 →</Link>
              <Link href="/career/applications" className="text-[#365F78]">申请记录 →</Link>
            </div>
          </section>

          <section>
            <h2 className="font-medium">近期决定</h2>
            <div className="mt-3 space-y-3">
              {data.decisions.map((decision) => (
                <div key={decision.id}>
                  <p className="text-sm">{decision.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{new Date(decision.decided_at).toLocaleDateString("zh-CN")}</p>
                </div>
              ))}
              {!data.decisions.length ? <p className="text-sm text-zinc-500">暂无近期职业决定。</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt className="text-zinc-500">{label}</dt><dd className="font-mono tabular-nums">{value}</dd></div>;
}
