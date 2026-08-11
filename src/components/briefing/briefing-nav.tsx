import Link from "next/link";
const links = [["/briefing", "今日"], ["/briefing/sources", "信源"], ["/briefing/interests", "兴趣"], ["/briefing/history", "历史"]] as const;
export function BriefingNav() { return <nav className="flex gap-1 border-b" aria-label="Briefing 导航">{links.map(([href,label]) => <Link key={href} href={href} className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">{label}</Link>)}</nav>; }
