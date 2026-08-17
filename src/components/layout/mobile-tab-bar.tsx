"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare2, FileText, Inbox, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { navActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const tabs: Array<{ name: string; href: string; icon: typeof LayoutDashboard }> = [
  { name: "今日", href: "/today", icon: LayoutDashboard },
  { name: "日历", href: "/calendar", icon: CalendarDays },
  { name: "任务", href: "/tasks", icon: CheckSquare2 },
  { name: "笔记", href: "/notes", icon: FileText },
  { name: "收件箱", href: "/inbox", icon: Inbox },
];

export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const moreActive = !tabs.some((tab) => navActive(pathname, tab.href));
  return <nav aria-label="底部导航" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-sidebar)_92%,white)] px-1.5 shadow-[0_-5px_18px_rgba(24,24,27,0.035)] backdrop-blur-md md:hidden" style={{ height: "var(--tab-bar-height)", paddingBottom: "var(--safe-area-bottom)" }}>
    {tabs.map(({ name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("my-1 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] text-[10px] font-medium transition-[background-color,color] ui-transition", active ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)]")}><Icon className="size-[19px]" aria-hidden="true" /><span className="truncate">{name}</span></Link>;
    })}
    <button type="button" onClick={onOpenMore} aria-current={moreActive ? "page" : undefined} className={cn("my-1 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] text-[10px] font-medium transition-[background-color,color] ui-transition", moreActive ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)]")}><MoreHorizontal className="size-[19px]" aria-hidden="true" /><span className="truncate">更多</span></button>
  </nav>;
}
