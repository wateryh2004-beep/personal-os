import {
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare2,
  FileText,
  FolderClosed,
  Inbox,
  LayoutDashboard,
  Newspaper,
  Plane,
  Settings,
  ShoppingBag,
  SquareKanban,
  Star,
} from "lucide-react";
import { navActive } from "@/lib/navigation";

export type NavigationGroup = "now" | "plan" | "knowledge" | "life" | "career" | "system";
export type ContextualCreateKind = "note" | "task" | "calendar" | "shopping" | "travel" | "project" | "inbox";

export type NavigationRegistryItem = {
  name: string;
  mobileName?: string;
  href: string;
  icon: typeof LayoutDashboard;
  group: NavigationGroup;
  desktopMain: boolean;
  mobileTab: boolean;
  commandPalette: boolean;
  contextualCreate?: {
    kind: ContextualCreateKind;
    descendants?: boolean;
  };
};

export const navigationRegistry: readonly NavigationRegistryItem[] = [
  { name: "Now", mobileName: "今日", href: "/today", icon: LayoutDashboard, group: "now", desktopMain: true, mobileTab: true, commandPalette: true },
  { name: "Inbox", href: "/inbox", icon: Inbox, group: "now", desktopMain: true, mobileTab: false, commandPalette: true, contextualCreate: { kind: "inbox" } },
  { name: "Calendar", mobileName: "日历", href: "/calendar", icon: CalendarDays, group: "plan", desktopMain: true, mobileTab: true, commandPalette: true, contextualCreate: { kind: "calendar" } },
  { name: "Tasks", mobileName: "任务", href: "/tasks", icon: CheckSquare2, group: "plan", desktopMain: true, mobileTab: true, commandPalette: true, contextualCreate: { kind: "task" } },
  { name: "Projects", href: "/projects", icon: SquareKanban, group: "plan", desktopMain: true, mobileTab: false, commandPalette: true, contextualCreate: { kind: "project" } },
  { name: "Reviews", href: "/reviews", icon: Star, group: "plan", desktopMain: true, mobileTab: false, commandPalette: true },
  { name: "Notes", mobileName: "笔记", href: "/notes", icon: FileText, group: "knowledge", desktopMain: true, mobileTab: true, commandPalette: true, contextualCreate: { kind: "note", descendants: true } },
  { name: "Files", href: "/files", icon: FolderClosed, group: "knowledge", desktopMain: true, mobileTab: false, commandPalette: true },
  { name: "Briefing", href: "/briefing", icon: Newspaper, group: "knowledge", desktopMain: true, mobileTab: false, commandPalette: true },
  { name: "Shopping", href: "/shopping", icon: ShoppingBag, group: "life", desktopMain: true, mobileTab: false, commandPalette: true, contextualCreate: { kind: "shopping" } },
  { name: "Travel", href: "/travel", icon: Plane, group: "life", desktopMain: true, mobileTab: false, commandPalette: true, contextualCreate: { kind: "travel", descendants: true } },
  { name: "Career", href: "/career", icon: BriefcaseBusiness, group: "career", desktopMain: true, mobileTab: false, commandPalette: true },
  { name: "Settings", href: "/settings", icon: Settings, group: "system", desktopMain: false, mobileTab: false, commandPalette: true },
];

const desktopGroupDefinitions: ReadonlyArray<{ id: NavigationGroup; label: string | null }> = [
  { id: "now", label: null },
  { id: "plan", label: "Plan" },
  { id: "knowledge", label: "Knowledge" },
  { id: "life", label: "Life" },
  { id: "career", label: null },
];

export const desktopNavigationGroups = desktopGroupDefinitions
  .map(({ id, label }) => ({
    label,
    items: navigationRegistry.filter((item) => item.desktopMain && item.group === id),
  }))
  .filter((group) => group.items.length > 0);

export const mobileTabNavigation = navigationRegistry.filter((item) => item.mobileTab);
export const commandPaletteNavigation = navigationRegistry.filter((item) => item.commandPalette);

export function navigationItemForPath(pathname: string) {
  let match: NavigationRegistryItem | undefined;
  for (const item of navigationRegistry) {
    if (!navActive(pathname, item.href)) continue;
    if (!match || item.href.length > match.href.length) match = item;
  }
  return match;
}

export function contextualCreateKindForPath(pathname: string): ContextualCreateKind | undefined {
  for (const item of navigationRegistry) {
    const create = item.contextualCreate;
    if (!create) continue;
    const matches = create.descendants ? navActive(pathname, item.href) : pathname === item.href;
    if (matches) return create.kind;
  }
  return undefined;
}

export const RECENT_NAVIGATION_STORAGE_KEY = "personal-os:recent:v1";

export type RecentNavigationItem = {
  href: string;
  label: string;
};

export function parseRecentNavigation(value: string | null): RecentNavigationItem[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentNavigationItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RecentNavigationItem>;
      return typeof candidate.href === "string" && typeof candidate.label === "string";
    });
  } catch {
    return [];
  }
}

export function mergeRecentNavigation(
  previous: readonly RecentNavigationItem[],
  current: RecentNavigationItem,
  limit = 8,
) {
  return [current, ...previous.filter((item) => item.href !== current.href)].slice(0, limit);
}

export type MobileRecentNavigationItem = {
  targetHref: string;
  item: NavigationRegistryItem;
};

export function getMobileRecentNavigation(
  recents: readonly RecentNavigationItem[],
  pathname: string,
  limit = 3,
): MobileRecentNavigationItem[] {
  const seenModules = new Set<string>();
  const result: MobileRecentNavigationItem[] = [];

  for (const recent of recents) {
    const item = navigationItemForPath(recent.href);
    if (!item || !item.desktopMain || item.mobileTab) continue;
    if (navActive(pathname, item.href) || seenModules.has(item.href)) continue;

    seenModules.add(item.href);
    result.push({ targetHref: recent.href, item });
    if (result.length >= limit) break;
  }

  return result;
}
