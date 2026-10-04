import Link from "next/link";

export const careerPrimaryNavigation = [
  ["目标岗位", "/career"],
  ["面试学习", "/career/interview"],
  ["我的材料", "/career/materials"],
] as const;

// Keep existing records and workflows reachable without making them the reading surface.
export const careerLegacyNavigation = [
  ["机会与申请", [["岗位机会", "/career/opportunities"], ["申请记录", "/career/applications"], ["路线图", "/career/roadmap"], ["职业方向", "/career/directions"]]],
  ["履历与证明", [["经历与事实", "/career/experiences"], ["简历版本", "/career/resumes"], ["技能", "/career/skills"], ["证书", "/career/certifications"], ["职业资本", "/career/capital"], ["职业档案", "/career/profile"]]],
] as const;

function isActive(current: string, href: string) {
  if (href === "/career") return current === href;
  return current === href || current.startsWith(`${href}/`);
}

export function CareerNav({ current }: { current: string }) {
  const legacyLabel = careerLegacyNavigation.flatMap(([, links]) => [...links]).find(([, href]) => isActive(current, href))?.[0];
  return <nav aria-label="职业中心导航" className="mb-8 mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--separator)] text-[14px] leading-5">
    {careerPrimaryNavigation.map(([label, href]) => {
      const active = isActive(current, href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative inline-flex min-h-11 shrink-0 items-center py-2 transition-colors ui-transition after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 ${active ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{label}</Link>;
    })}
    <details className="group relative ml-auto shrink-0">
      <summary className={`pressable inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-md)] px-1 text-[12px] ${legacyLabel ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>{legacyLabel ? `资料管理 · ${legacyLabel}` : "资料管理"}<span aria-hidden="true" className="ml-1">⌄</span></summary>
      <div className="absolute right-0 top-full z-20 max-h-[70vh] w-52 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-2 shadow-[var(--shadow-popover)]">
        {careerLegacyNavigation.map(([group, links]) => <div key={group} className="py-1">
          <p className="px-3 py-2 text-[11px] font-medium text-[var(--text-tertiary)]">{group}</p>
          {links.map(([label, href]) => <Link key={href} href={href} aria-current={isActive(current, href) ? "page" : undefined} className={`flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[13px] ${isActive(current, href) ? "bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>{label}</Link>)}
        </div>)}
      </div>
    </details>
  </nav>;
}

export function CareerOpportunityNav({ current }: { current: "opportunities" | "applications" }) {
  return <nav aria-label="机会与申请" className="mb-6 flex gap-2">{[["opportunities", "机会", "/career/opportunities"], ["applications", "申请记录", "/career/applications"]].map(([key, label, href]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[13px] ${current === key ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>{label}</Link>)}</nav>;
}
