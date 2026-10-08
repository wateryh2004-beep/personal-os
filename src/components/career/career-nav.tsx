import Link from "next/link";

const primary = [
  ["工作台", "/career"],
  ["面试准备", "/career/interview"],
  ["履历素材", "/career/experiences"],
  ["机会与申请", "/career/opportunities"],
  ["简历", "/career/resumes"],
] as const;

const secondary = [
  ["路线图", "/career/roadmap"],
  ["技能", "/career/skills"],
  ["职业方向", "/career/directions"],
  ["证书", "/career/certifications"],
  ["职业档案", "/career/profile"],
  ["文件与证明材料", "/files"],
] as const;

function isActive(current: string, href: string) {
  if (href === "/career") return current === href;
  if (href === "/career/opportunities" && current === "/career/applications") return true;
  return current === href || current.startsWith(`${href}/`);
}

export function CareerNav({ current }: { current: string }) {
  const secondaryLabel = secondary.find(([, href]) => isActive(current, href))?.[0];
  return <nav aria-label="职业中心导航" className="mb-8 mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--separator)] text-[14px] leading-5">
    {primary.map(([label, href]) => {
      const active = isActive(current, href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative inline-flex min-h-11 shrink-0 items-center py-2 transition-colors ui-transition after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 ${active ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{label}</Link>;
    })}
    <details className="group relative shrink-0">
      <summary className={`pressable inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-md)] px-1 ${secondaryLabel ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{secondaryLabel ?? "更多"}<span aria-hidden="true" className="ml-1 text-xs">⌄</span></summary>
      <div className="absolute right-0 top-full z-20 w-40 rounded-[var(--radius-lg)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-1.5 shadow-[var(--shadow-popover)]">{secondary.map(([label, href]) => <Link key={href} href={href} aria-current={isActive(current, href) ? "page" : undefined} className={`flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[13px] ${isActive(current, href) ? "bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>{label}</Link>)}</div>
    </details>
  </nav>;
}

export function CareerOpportunityNav({ current }: { current: "opportunities" | "applications" }) {
  return <nav aria-label="机会与申请" className="mb-6 flex gap-2">{[["opportunities", "机会", "/career/opportunities"], ["applications", "申请记录", "/career/applications"]].map(([key, label, href]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[13px] ${current === key ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>{label}</Link>)}</nav>;
}
