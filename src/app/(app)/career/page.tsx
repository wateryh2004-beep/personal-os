import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { getCareerPortfolio } from "@/features/career/queries";

export default async function CareerPage() {
  const data = await getCareerPortfolio(); const p = data.profile;
  const evidenceCoverage = data.facts.length ? Math.round(data.facts.filter((fact) => fact.source_document_id || fact.verification_status !== "unverified").length / data.facts.length * 100) : 0;
  const expressionCoverage = data.experiences.length ? Math.round(new Set(data.approvedBullets.map((bullet) => bullet.experience_id)).size / data.experiences.length * 100) : 0;
  const activeApplications = data.applications.filter((item) => !["rejected", "withdrawn", "closed"].includes(item.status));
  return <><PageHeader title="Career Portfolio" description="把真实经历、职业资本、机会与投递版本连接成一套可追溯的职业系统。" /><CareerNav current="/career" />
    {data.career2Unavailable ? <p className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">Career 2.0 数据库尚未完成升级。应用最新 migration 后可使用机会、申请与简历中心。</p> : null}
    <div className="grid gap-10 lg:grid-cols-[1.35fr_.65fr]"><main className="space-y-10">
      <section className="border-b pb-7"><p className="text-xs uppercase tracking-wide text-zinc-400">Current position</p><h2 className="mt-2 text-2xl font-medium">{p?.professional_headline || p?.current_stage || "完善你的职业定位"}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{p?.career_summary || "职业档案是 Portfolio 的事实入口；这里不复制经历，只聚合已经确认的信息。"}</p><Link href="/career/profile" className="mt-4 inline-block text-sm text-[#365F78]">编辑职业档案 →</Link></section>
      <section><div className="flex items-end justify-between"><div><h2 className="font-medium">Career capital</h2><p className="mt-1 text-sm text-zinc-500">证据覆盖与可用表达，不生成虚构的职业分数。</p></div><Link href="/career/capital" className="text-sm text-[#365F78]">查看资本 →</Link></div><div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4"><Metric label="经历" value={data.experiences.length} /><Metric label="事实" value={data.facts.length} /><Metric label="证据覆盖" value={`${evidenceCoverage}%`} /><Metric label="表达覆盖" value={`${expressionCoverage}%`} /></div></section>
      <section><div className="flex items-end justify-between"><div><h2 className="font-medium">Opportunity horizon</h2><p className="mt-1 text-sm text-zinc-500">关注中的机会与当前申请。</p></div><Link href="/career/opportunities" className="text-sm text-[#365F78]">管理机会 →</Link></div><div className="mt-4 divide-y border-y">{data.opportunities.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.role_title}</p><p className="truncate text-xs text-zinc-500">{item.organization}</p></div><span className="shrink-0 text-xs text-zinc-500">{item.deadline_at ? new Date(item.deadline_at).toLocaleDateString("zh-CN") : item.status}</span></div>)}{!data.opportunities.length ? <p className="py-5 text-sm text-zinc-500">还没有关注的机会。</p> : null}</div></section>
    </main><aside className="space-y-8 border-l pl-0 lg:pl-7">
      <section><h2 className="font-medium">当前流水线</h2><dl className="mt-4 space-y-3 text-sm"><Row label="活跃申请" value={activeApplications.length} /><Row label="简历版本" value={data.resumes.length} /><Row label="重点方向" value={data.directions.length} /><Row label="公开成果" value={data.outputs.filter((item) => item.public_url).length} /></dl></section>
      <section><h2 className="font-medium">近期决定</h2><div className="mt-3 space-y-3">{data.decisions.map((decision) => <div key={decision.id}><p className="text-sm">{decision.title}</p><p className="mt-1 text-xs text-zinc-400">{new Date(decision.decided_at).toLocaleDateString("zh-CN")}</p></div>)}{!data.decisions.length ? <p className="text-sm text-zinc-500">尚无生效中的职业决定。</p> : null}</div></section>
      <section><h2 className="font-medium">进入系统</h2><div className="mt-3 grid gap-2 text-sm"><Link href="/career/experiences" className="text-[#365F78]">经历与事实 →</Link><Link href="/career/resumes" className="text-[#365F78]">简历中心 →</Link><Link href="/career/applications" className="text-[#365F78]">申请流水线 →</Link></div></section>
    </aside></div></>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div><p className="text-2xl font-medium text-zinc-900">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>; }
function Row({ label, value }: { label: string; value: number }) { return <div className="flex justify-between"><dt className="text-zinc-500">{label}</dt><dd className="font-mono">{value}</dd></div>; }
