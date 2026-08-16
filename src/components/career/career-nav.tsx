import Link from "next/link";

// 主导航：围绕长期秋招备战的核心板块。
const primary = [
  ["概览", "/career"],
  ["方向", "/career/directions"],
  ["经历", "/career/experiences"],
  ["技能", "/career/skills"],
  ["简历", "/career/resumes"],
  ["Timeline", "/career/roadmap"],
] as const;

// 二级折叠区：投递流水线降级保留，数据不删，从入口可回。
const secondary = [
  ["证书", "/career/certifications"],
  ["机会", "/career/opportunities"],
  ["申请", "/career/applications"],
  ["资本", "/career/capital"],
  ["材料", "/career/materials"],
  ["搜索", "/career/search"],
  ["档案编辑", "/career/profile"],
] as const;

function isActive(current: string, href: string) {
  return current === href || (href !== "/career" && current.startsWith(`${href}/`));
}

function TabLink({ href, label, current }: { href: string; label: string; current: string }) {
  const active = isActive(current, href);
  return (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 border-b-2 px-1 py-2 ${active ? "border-[#365F78] text-[#365F78]" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
    >
      {label}
    </Link>
  );
}

export function CareerNav({ current }: { current: string }) {
  return (
    <nav aria-label="Career 导航" className="mb-8 border-b text-sm">
      <div className="flex gap-4 overflow-x-auto">
        {primary.map(([label, href]) => <TabLink key={href} href={href} label={label} current={current} />)}
      </div>
      <details className="group py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700">
          <span className="transition-transform group-open:rotate-90">▸</span>投递流水线与更多
        </summary>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pb-1">
          {secondary.map(([label, href]) => {
            const active = isActive(current, href);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`px-1 py-1 ${active ? "font-medium text-[#365F78]" : "text-zinc-500 hover:text-zinc-900"}`}>{label}</Link>;
          })}
        </div>
      </details>
    </nav>
  );
}
