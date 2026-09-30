import Link from "next/link";

const primary = [
  ["概览", "/career"],
  ["机会", "/career/opportunities"],
  ["面试", "/career/interview"],
  ["素材", "/career/experiences"],
  ["成长", "/career/skills"],
] as const;

const secondary = [
  ["简历", "/career/resumes"],
  ["申请", "/career/applications"],
  ["路线图", "/career/roadmap"],
  ["职业方向", "/career/directions"],
  ["证书", "/career/certifications"],
  ["职业资本", "/career/capital"],
] as const;

function isActive(current: string, href: string) {
  if (href === "/career") return current === href;
  return current === href || current.startsWith(`${href}/`);
}

export function CareerNav({ current }: { current: string }) {
  const interviewSection = current.startsWith("/career/interview");
  return (
    <nav aria-label="职业中心导航" className={`mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] ${interviewSection ? "mb-4" : "mb-10"}`}>
      {primary.map(([label, href]) => {
        const active = isActive(current, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 pb-1.5 transition-colors ui-transition after:absolute after:inset-x-0 after:-bottom-px after:h-px after:rounded-full after:transition-opacity after:duration-[var(--motion-fast)] ${active ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)] after:opacity-100" : "text-[var(--text-tertiary)] after:opacity-0 hover:text-[var(--text-primary)]"}`}
          >
            {label}
          </Link>
        );
      })}
      <details className="group relative shrink-0">
        <summary className="pressable cursor-pointer list-none rounded-[8px] px-1 pb-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">更多</summary>
        <div className="absolute left-0 top-8 z-20 min-w-36 rounded-[12px] border border-[var(--separator)] bg-[var(--material-popover)] p-1.5 shadow-[var(--shadow-popover)] backdrop-blur-2xl backdrop-saturate-[180%]">
          {secondary.map(([label, href]) => (
            <Link key={href} href={href} className="pressable block rounded-[8px] px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-selected)] hover:text-[var(--text-primary)]">
              {label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
