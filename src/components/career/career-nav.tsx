import Link from "next/link";

const items = [
  ["求职总览", "/career"],
  ["履历档案", "/career/experiences"],
  ["职业方向", "/career/directions"],
  ["材料与知识", "/career/materials"],
] as const;

export function CareerNav({ current }: { current: string }) {
  return <nav aria-label="Career 导航" className="mb-8 flex gap-4 overflow-x-auto border-b text-sm">{items.map(([label, href]) => <Link key={href} href={href} className={`shrink-0 border-b-2 px-1 py-3 ${current === href || (href === "/career/experiences" && current.startsWith("/career/experiences")) ? "border-[#365F78] text-[#365F78]" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}>{label}</Link>)}<span className="shrink-0 px-1 py-3 text-zinc-400">简历中心 · 即将启用</span><span className="shrink-0 px-1 py-3 text-zinc-400">职业路线 · 即将启用</span><span className="shrink-0 px-1 py-3 text-zinc-400">岗位与投递 · 即将启用</span></nav>;
}
