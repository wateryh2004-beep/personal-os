import Link from "next/link";
import { CareerNav } from "@/components/career/career-nav";
import { CreateExperienceDialog } from "@/components/career/create-experience-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { getExperiences } from "@/features/career/queries";

const labels: Record<string, string> = { education: "教育经历", internship: "实习经历", employment: "工作经历", project: "项目经历", campus: "校园经历", research: "研究经历", volunteer: "志愿经历", other: "其他" };

export default async function ExperiencesPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [experiences, params] = await Promise.all([getExperiences(), searchParams]);
  return <><PageHeader title="履历素材" description="经历保存真实发生的事；事实、成果与求职表达在详情页逐步建立。" action={<CreateExperienceDialog initialOpen={params.create === "1"} />} /><CareerNav current="/career/experiences" /><div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{experiences.length ? experiences.map((item) => <Link key={item.id} href={`/career/experiences/${item.id}`} className="grid gap-1.5 px-2 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)] md:grid-cols-[1fr_auto] md:items-start"><div><h2 className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{item.organization}{item.role ? ` · ${item.role}` : ""}</h2><p className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">{labels[item.experience_type] || item.experience_type}{item.location ? ` · ${item.location}` : ""}{item.is_current ? " · 进行中" : ""}</p></div><p className="font-mono text-[11px] leading-5 text-[var(--text-tertiary)] tabular-nums">{item.start_date || "未填写"} — {item.end_date || (item.is_current ? "至今" : "")}</p></Link>) : <div className="py-12 text-[13px] leading-6 text-[var(--text-secondary)]"><p>还没有经历。先创建一段真实实习、项目、校园或教育经历。</p><div className="mt-4"><CreateExperienceDialog initialOpen={params.create === "1"} /></div></div>}</div></>;
}
