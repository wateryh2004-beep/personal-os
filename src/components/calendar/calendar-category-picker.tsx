"use client";

import { contextCategoryKeys, getManagedCalendarCategory, primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";

export function CalendarCategoryPicker({ defaultCategories = [], enabled = true, compact = false, onModeChange }: { defaultCategories?: string[]; enabled?: boolean; compact?: boolean; onModeChange?: (mode: string) => void }) {
  const primary = primaryCalendarCategories.find((category) => defaultCategories.includes(category.displayName));
  const contexts = contextCategoryKeys.filter((key) => {
    const category = getManagedCalendarCategory(key);
    return category ? defaultCategories.includes(category.displayName) : false;
  });
  if (!enabled) return <div className="border-l-2 border-[var(--warning)] bg-[rgba(255,249,235,.7)] px-3 py-2 text-xs leading-5 text-[var(--warning)]"><input type="hidden" name="category_choice" value="__none" />重新授权 Outlook 后可同步和编辑分类。</div>;
  return <fieldset className="grid gap-2.5"><label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">分类<select name="category_choice" defaultValue={primary?.key ?? (defaultCategories.length ? "__none" : "__auto")} onChange={(event) => onModeChange?.(event.target.value)} className="h-9 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"><option value="__auto">自动判断</option><option value="__none">不设置主分类</option>{primaryCalendarCategories.filter((category) => category.key !== "other").map((category) => <option key={category.key} value={category.key}>{category.shortName}</option>)}</select></label>{compact ? null : <div><p className="text-[11px] text-[var(--text-tertiary)]">长期场景</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">{contextCategoryKeys.map((key) => { const category = getManagedCalendarCategory(key)!; return <label key={key} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" name="context_category_keys" value={key} defaultChecked={contexts.includes(key)} className="size-3.5 accent-[var(--accent)]" />{category.shortName}</label>; })}</div></div>}</fieldset>;
}
