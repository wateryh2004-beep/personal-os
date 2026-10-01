"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { mobileTabNavigation } from "@/lib/navigation-registry";
import { navActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const itemClass = "pressable flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10.5px] font-medium tracking-[-0.01em]";

type MobileTabBarProps = {
  onOpenMore: () => void;
  pendingHref?: string | null;
  onNavigate?: (href: string) => void;
  onIntent?: (href: string) => void;
};

function pathnameFromHref(href: string | null | undefined) {
  if (!href) return null;
  return href.split(/[?#]/, 1)[0] || "/";
}

export function MobileTabBar({ onOpenMore, pendingHref, onNavigate, onIntent }: MobileTabBarProps) {
  const pathname = usePathname();
  const pendingPathname = pathnameFromHref(pendingHref);
  const moreActive = !mobileTabNavigation.some((tab) => navActive(pathname, tab.href));
  const morePending = Boolean(
    pendingPathname
      && !mobileTabNavigation.some((tab) => navActive(pendingPathname, tab.href)),
  );

  return <nav aria-label="底部导航" className="mobile-tab-bar fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/50 bg-[var(--material-toolbar)] px-1.5 pt-1 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_-8px_28px_rgba(0,0,0,.04)] md:hidden" style={{ height: "var(--tab-bar-height)", paddingBottom: "var(--safe-area-bottom)" }}>
    {mobileTabNavigation.map(({ mobileName, name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      const pending = pendingPathname ? navActive(pendingPathname, href) : false;
      return <Link
        key={href}
        href={href}
        prefetch={false}
        onNavigate={() => onNavigate?.(href)}
        onPointerEnter={() => onIntent?.(href)}
        onFocus={() => onIntent?.(href)}
        onPointerDown={() => onIntent?.(href)}
        onTouchStart={() => onIntent?.(href)}
        aria-current={active ? "page" : undefined}
        aria-busy={pending || undefined}
        className={cn(
          itemClass,
          active || pending
            ? "text-[var(--accent)]"
            : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70",
          pending && "opacity-60",
        )}
      >
        <Icon className="size-5" strokeWidth={active || pending ? 2.2 : 1.85} aria-hidden="true" />
        <span className="truncate">{mobileName ?? name}</span>
      </Link>;
    })}
    <button
      type="button"
      onClick={onOpenMore}
      aria-current={moreActive ? "page" : undefined}
      aria-busy={morePending || undefined}
      className={cn(
        itemClass,
        moreActive || morePending
          ? "text-[var(--accent)]"
          : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70",
        morePending && "opacity-60",
      )}
    >
      <MoreHorizontal className="size-5" strokeWidth={moreActive || morePending ? 2.2 : 1.85} aria-hidden="true" />
      <span className="truncate">更多</span>
    </button>
  </nav>;
}
