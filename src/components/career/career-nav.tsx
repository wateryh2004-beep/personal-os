import Link from "next/link";

const items = [
  ["Portfolio", "/career"],
  ["Capital", "/career/capital"],
  ["Opportunities", "/career/opportunities"],
  ["Applications", "/career/applications"],
  ["Resumes", "/career/resumes"],
  ["Timeline", "/career/roadmap"],
] as const;

export function CareerNav({ current }: { current: string }) {
  return <nav aria-label="Career 导航" className="mb-8 flex gap-4 overflow-x-auto border-b text-sm">{items.map(([label, href]) => { const active=current===href||(href!=="/career"&&current.startsWith(`${href}/`)); return <Link key={href} href={href} aria-current={active?"page":undefined} className={`shrink-0 border-b-2 px-1 py-3 ${active ? "border-[#365F78] text-[#365F78]" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}>{label}</Link>;})}</nav>;
}
