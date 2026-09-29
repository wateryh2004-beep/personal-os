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
  return (
    <nav aria-label="职业中心导航" className="mb-10 flex items-center gap-6 overflow-x-auto text-[13px]">
      {primary.map(([label, href]) => {
        const active = isActive(current, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 pb-1 transition-colors ${active ? "font-medium text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}`}
          >
            {label}
          </Link>
        );
      })}
      <details className="group relative shrink-0">
        <summary className="cursor-pointer list-none pb-1 text-zinc-400 hover:text-zinc-700">更多</summary>
        <div className="absolute left-0 top-7 z-20 min-w-36 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/5">
          {secondary.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950">
              {label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
