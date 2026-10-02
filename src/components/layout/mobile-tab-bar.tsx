"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { mobileTabNavigation } from "@/lib/navigation-registry";
import { navActive } from "@/lib/navigation";
import type { ShellNavigationEvent } from "@/components/layout/use-shell-navigation";
import { cn } from "@/lib/utils";

const itemClass = "navigation-tab pressable relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10.5px] font-medium tracking-[-0.01em]";

type MobileTabBarProps = {
  onOpenMore: () => void;
  presentationPathname?: string;
  pendingHref?: string | null;
  onNavigate?: (href: string, event: ShellNavigationEvent) => void;
  onIntent?: (href: string) => void;
};

function pathnameFromHref(href: string | null | undefined) {
  if (!href) return null;
  return href.split(/[?#]/, 1)[0] || "/";
}

export function MobileTabBar({ onOpenMore, presentationPathname, pendingHref, onNavigate, onIntent }: MobileTabBarProps) {
  const routePathname = usePathname();
  const pathname = presentationPathname ?? routePathname;
  const pendingPathname = pathnameFromHref(pendingHref);
  const moreActive = !mobileTabNavigation.some((tab) => navActive(pathname, tab.href));
  const morePending = Boolean(
    pendingPathname
      && !mobileTabNavigation.some((tab) => navActive(pendingPathname, tab.href)),
  );

  return <nav aria-label="底部导航" className="mobile-tab-bar fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--border-subtle)] bg-[var(--material-toolbar)] px-1.5 pt-1 md:hidden" style={{ height: "var(--tab-bar-height)", paddingBottom: "var(--safe-area-bottom)" }}>
    {mobileTabNavigation.map(({ mobileName, name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      const pending = pendingPathname ? navActive(pendingPathname, href) : false;
      return <Link
        key={href}
        href={href}
        prefetch={false}
        onNavigate={(event) => onNavigate?.(href, event)}
        onPointerEnter={() => onIntent?.(href)}
        onFocus={() => onIntent?.(href)}
        onPointerDown={() => onIntent?.(href)}
        onTouchStart={() => onIntent?.(href)}
        aria-current={active ? "page" : undefined}
        aria-busy={pending || undefined}
        data-pending={pending || undefined}
        className={cn(
          itemClass,
          (pendingPathname ? pending : active)
            ? "text-[var(--accent)]"
            : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70",
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
      data-pending={morePending || undefined}
      className={cn(
        itemClass,
        (pendingPathname ? morePending : moreActive)
          ? "text-[var(--accent)]"
          : "text-[var(--text-tertiary)] active:bg-[var(--surface-hover)] active:opacity-70",
      )}
    >
      <MoreHorizontal className="size-5" strokeWidth={moreActive || morePending ? 2.2 : 1.85} aria-hidden="true" />
      <span className="truncate">更多</span>
    </button>
  </nav>;
}
