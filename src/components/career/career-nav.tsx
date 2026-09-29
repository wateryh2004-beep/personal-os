import Link from "next/link";

const primary = [
  ["概览", "/career"],
  ["机会", "/career/opportunities"],
  ["面试准备", "/career/interview"],
  ["经历素材", "/career/experiences"],
  ["练习记录", "/career/interview/sessions"],
  ["能力成长", "/career/skills"],
] as const;

const secondary = [
  ["职业方向", "/career/directions"],
  ["简历", "/career/resumes"],
  ["路线图", "/career/roadmap"],
  ["申请记录", "/career/applications"],
  ["证书", "/career/certifications"],
  ["职业资本", "/career/capital"],
  ["材料", "/career/materials"],
  ["搜索", "/career/search"],
  ["档案设置", "/career/profile"],
] as const;

function isActive(current: string, href: string) {
  if (href === "/career") return current === href;
  if (href === "/career/interview" && current.startsWith("/career/interview/sessions")) return false;
  return current === href || current.startsWith(`${href}/`);
}

function TabLink({ href, label, current }: { href: string; label: string; current: string }) {
  const active = isActive(current, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 border-b-2 px-1 py-2.5 transition-colors ${active ? "border-[#365F78] font-medium text-[#365F78]" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
    >
      {label}
    </Link>
  );
}

export function CareerNav({ current }: { current: string }) {
  return (
    <nav aria-label="职业中心导航" className="mb-8 border-b text-sm">
      <div className="flex gap-5 overflow-x-auto">
        {primary.map(([label, href]) => <TabLink key={href} href={href} label={label} current={current} />)}
      </div>
      <details className="group py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700">
          <span className="transition-transform group-open:rotate-90">▸</span>
          规划、简历与更多工具
        </summary>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pb-1">
          {secondary.map(([label, href]) => {
            const active = isActive(current, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`px-1 py-1 ${active ? "font-medium text-[#365F78]" : "text-zinc-500 hover:text-zinc-900"}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
