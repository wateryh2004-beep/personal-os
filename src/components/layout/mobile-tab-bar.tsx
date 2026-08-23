"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare2, FileText, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { navActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const tabs: Array<{ name: string; href: string; icon: typeof LayoutDashboard }> = [
  { name: "今日", href: "/today", icon: LayoutDashboard },
  { name: "日历", href: "/calendar", icon: CalendarDays },
  { name: "任务", href: "/tasks", icon: CheckSquare2 },
  { name: "笔记", href: "/notes", icon: FileText },
];

const itemClass = "flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-[10px] text-[10.5px] font-medium tracking-[-0.01em] transition-[color,background-color,opacity,transform] ui-transition active:scale-[0.96]";

export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const moreActive = !tabs.some((tab) => navActive(pathname, tab.href));

  return <nav aria-label="底部导航" className="mobile-tab-bar fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-canvas)_92%,transparent)] px-1.5 pt-1 backdrop-blur-xl md:hidden" style={{ height: "var(--tab-bar-height)", paddingBottom: "var(--safe-area-bottom)" }}>
    {tabs.map(({ name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      return <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined} className={cn(itemClass, active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70")}><Icon className="size-5" strokeWidth={active ? 2.2 : 1.85} aria-hidden="true" /><span className="truncate">{name}</span></Link>;
    })}
    <button type="button" onClick={onOpenMore} aria-current={moreActive ? "page" : undefined} className={cn(itemClass, moreActive ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70")}><MoreHorizontal className="size-5" strokeWidth={moreActive ? 2.2 : 1.85} aria-hidden="true" /><span className="truncate">更多</span></button>
  </nav>;
}
