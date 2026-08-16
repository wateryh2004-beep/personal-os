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
const certificationStatus: Record<string, string> = {
  planned: "计划中",
  registered: "已报名",
  preparing: "备考中",
  passed: "通过",
  failed: "未通过",
  issued: "已获得",
  expired: "已过期",
  abandoned: "已放弃",
};
const skillCategory: Record<string, string> = {
  technical: "技术",
  analytical: "分析",
  business: "商业",
  communication: "沟通",
  language: "语言",
  domain: "领域",
  tool: "工具",
  other: "其他",
};
const milestoneStatus: Record<string, string> = { planned: "计划", in_progress: "进行中", completed: "完成", skipped: "跳过" };

export default async function CareerPage() {
  const data = await getCareerPortfolio();
  const p = data.profile;
  const skills = [...data.skills].sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const byCategory = skills.reduce<Record<string, typeof skills>>((acc, skill) => {
    (acc[skill.category] ??= []).push(skill);
    return acc;
  }, {});
  const identityTags: string[] = [];
  for (const experience of data.experiences.filter((item) => item.is_current)) {
    identityTags.push(`${experience.organization} · ${experience.role || ""}`.replace(/ · $/, ""));
  }
  for (const education of data.experiences.filter((item) => item.experience_type === "education" && item.status === "confirmed")) {
    identityTags.push(education.role || education.organization);
  }

  return <><PageHeader title="长期战略作战室" description="围绕 2027 秋招备战：看清自己是谁、要去哪里、如何变强，以及沉淀每一版简历与提案。" /><CareerNav current="/career" />
    {data.career2Unavailable ? <p className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">Career 2.0 数据库尚未完成升级。应用最新 migration 后可使用机会、申请与简历中心。</p> : null}
    <div className="grid gap-10 lg:grid-cols-[1.35fr_.65fr]"><main className="space-y-10">

      <section className="border-b pb-7">
        <p className="text-xs uppercase tracking-wide text-zinc-400">身份与筹码 · 我是谁</p>
        <h2 className="mt-2 text-2xl font-medium">{p?.professional_headline || p?.current_stage || "完善你的职业定位"}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{p?.career_summary || "职业档案是 Portfolio 的事实入口；这里不复制经历，只聚合已经确认的信息。"}</p>
        <div className="mt-4 flex flex-wrap gap-2">{identityTags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{tag}</span>)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500">
          {p?.target_recruitment_cycle ? <span>目标招聘季：{p.target_recruitment_cycle}</span> : null}
          {p?.target_graduation_date ? <span>预计毕业：{p.target_graduation_date}</span> : null}
          <span>身份筹码：{data.certifications.length} 张证书</span>
          <Link href="/career/profile" className="text-[#365F78] hover:underline">编辑档案 →</Link>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between"><div><h2 className="font-medium">职业目标 · 我要去哪里</h2><p className="mt-1 text-sm text-zinc-500">每条方向都要能回答「为什么信、为什么不信、差在哪」。</p></div><Link href="/career/directions" className="text-sm text-[#365F78]">管理方向 →</Link></div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {data.directions.map((item) => <Link key={item.id} href="/career/directions" className="block rounded-md border border-zinc-200 p-4 transition-colors hover:border-[#365F78]/50"><div className="flex items-center justify-between gap-2"><h3 className="truncate font-medium">{item.name}</h3><span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{directionStatus[item.status] ?? item.status}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{item.hypothesis_markdown || "尚未填写方向假设"}</p>{item.review_date ? <p className="mt-3 text-xs text-zinc-400">下次复核 {item.review_date}</p> : null}</Link>)}
          {!data.directions.length ? <p className="col-span-full py-5 text-sm text-zinc-500">还没有方向，先创建你想验证的职业方向。</p> : null}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between"><div><h2 className="font-medium">实力提升 · 我如何变强</h2><p className="mt-1 text-sm text-zinc-500">用证据说明能力，不刷熟练度百分比。</p></div><Link href="/career/skills" className="text-sm text-[#365F78]">管理技能 →</Link></div>
        {data.skills.length ? <div className="mt-5 flex flex-wrap gap-2">{data.skills.slice(0, 24).map((skill) => <span key={skill.id} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700">{skill.name}</span>)}</div> : <p className="mt-4 text-sm text-zinc-500">还没有技能，先记录你已有的能力与证据。</p>}
        {Object.keys(byCategory).length ? <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">{Object.entries(byCategory).map(([category, items]) => <div key={category} className="flex items-baseline justify-between border-b border-dotted border-zinc-200 py-1.5"><dt className="text-zinc-500">{skillCategory[category] ?? category}</dt><dd className="font-mono text-zinc-700">{items.length}</dd></div>)}</dl> : null}
      </section>

      <section>
        <div className="flex items-end justify-between"><div><h2 className="font-medium">产出 · 简历与提案</h2><p className="mt-1 text-sm text-zinc-500">每一版简历与长期方案都沉淀为版本，投递可追溯。</p></div><Link href="/career/resumes" className="text-sm text-[#365F78]">简历中心 →</Link></div>
        <div className="mt-5 divide-y border-y">
          {data.resumes.map((resume) => <div key={resume.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{resume.title}</p><p className="truncate text-xs text-zinc-500">更新于 {new Date(resume.updated_at).toLocaleDateString("zh-CN")}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${resume.status === "approved" ? "bg-[#365F78] text-white" : "bg-zinc-100 text-zinc-600"}`}>{resume.status === "approved" ? "已定稿" : "草稿"}</span></div>)}
          {!data.resumes.length ? <p className="py-5 text-sm text-zinc-500">还没有简历版本。从「简历中心」创建第一版草稿。</p> : null}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between"><div><h2 className="font-medium">时间线 · 最近里程碑</h2><p className="mt-1 text-sm text-zinc-500">距离 2027 秋招的作战节点。</p></div><Link href="/career/roadmap" className="text-sm text-[#365F78]">查看完整 Timeline →</Link></div>
        <ol className="mt-5 space-y-3 border-l border-zinc-200 pl-4">
          {data.milestones.map((milestone) => <li key={milestone.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{milestone.title}</span><span className="flex shrink-0 items-center gap-2 text-xs text-zinc-400"><span>{milestoneStatus[milestone.status] ?? milestone.status}</span><span>{milestone.target_date}</span></span></li>)}
          {!data.milestones.length ? <li className="text-sm text-zinc-500">还没有里程碑，先在 Timeline 里铺好备战路线。</li> : null}
        </ol>
      </section>
    </main><aside className="space-y-8 border-l pl-0 lg:pl-7">
      <section><h2 className="font-medium">身份筹码</h2><div className="mt-3 space-y-2">{data.certifications.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{item.name}{item.issuer ? ` · ${item.issuer}` : ""}</span><span className="shrink-0 text-xs text-zinc-400">{certificationStatus[item.status] ?? item.status}</span></div>)}{!data.certifications.length ? <p className="text-sm text-zinc-500">还没有证书记录。</p> : null}<Link href="/career/certifications" className="mt-3 inline-block text-sm text-[#365F78]">管理证书 →</Link></div></section>
      <section><h2 className="font-medium">当前流水线</h2><dl className="mt-4 space-y-3 text-sm"><Row label="活跃申请" value={data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status)).length} /><Row label="简历版本" value={data.resumes.length} /><Row label="重点方向" value={data.directions.length} /><Row label="公开成果" value={data.outputs.filter((item) => item.public_url).length} /></dl></section>
      <section><h2 className="font-medium">近期决定</h2><div className="mt-3 space-y-3">{data.decisions.map((decision) => <div key={decision.id}><p className="text-sm">{decision.title}</p><p className="mt-1 text-xs text-zinc-400">{new Date(decision.decided_at).toLocaleDateString("zh-CN")}</p></div>)}{!data.decisions.length ? <p className="text-sm text-zinc-500">尚无生效中的职业决定。</p> : null}</div></section>
      <section><h2 className="font-medium">进入系统</h2><div className="mt-3 grid gap-2 text-sm"><Link href="/career/experiences" className="text-[#365F78]">经历与事实 →</Link><Link href="/career/roadmap" className="text-[#365F78]">Timeline 作战图 →</Link><Link href="/career/search" className="text-[#365F78]">职业档案搜索 →</Link></div></section>
    </aside></div></>;
}
function Row({ label, value }: { label: string; value: number }) { return <div className="flex justify-between"><dt className="text-zinc-500">{label}</dt><dd className="font-mono">{value}</dd></div>; }
