import Link from "next/link";
import { getCareerCapitalSummary } from "@/features/career/queries";

export async function CareerCapitalSummary() {
  const data = await getCareerCapitalSummary();
  const rows = [
    ["事实", data.facts, "/career/experiences"],
    ["有证据或已确认", data.verifiedFacts, "/career/experiences"],
    ["已批准表达", data.approvedBullets, "/career/experiences"],
    ["成果", data.outputs, "/career/experiences"],
    ["技能", data.skills, "/career/skills"],
    ["证书", data.certifications, "/career/certifications"],
  ] as const;
  return <section aria-labelledby="capital-title" className="mt-10 scroll-mt-20 border-t border-[var(--separator)] pt-6">
    <h2 id="capital-title" className="text-[15px] font-medium">职业资本</h2>
    <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">已有事实、证据与表达的摘要。查看原始资料时，可按需更正。</p>
    {data.unavailable ? <p role="status" className="mt-3 text-sm text-amber-800">部分资料暂时无法读取，未读取的数量显示为未知。</p> : null}
    <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">{rows.map(([label, value, href]) => <div key={label}><dt className="text-[12px] text-[var(--text-secondary)]">{label}</dt><dd><Link href={href} className="inline-flex min-h-11 items-center text-[23px] font-semibold hover:text-[var(--accent)]">{value ?? "—"}</Link></dd></div>)}</dl>
    {data.gaps.length ? <details className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--text-secondary)]">最近差距分析 · {data.gaps.length}</summary><div className="space-y-4">{data.gaps.map(gap => <article key={gap.id}><p className="text-sm leading-6 text-[var(--text-secondary)]">{gap.summary}</p><Link href="/career/opportunities" className="inline-flex min-h-11 items-center text-xs text-[var(--accent)]">查看机会与分析 →</Link></article>)}</div></details> : null}
    <Link href="/files" className="mt-2 inline-flex min-h-11 items-center text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">在文件中查看证明材料 →</Link>
  </section>;
}
