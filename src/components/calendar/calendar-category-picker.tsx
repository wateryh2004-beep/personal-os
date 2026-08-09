"use client";

import { contextCategoryKeys, getManagedCalendarCategory, primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";

export function CalendarCategoryPicker({ defaultCategories = [], enabled = true, compact = false }: { defaultCategories?: string[]; enabled?: boolean; compact?: boolean }) {
  const primary = primaryCalendarCategories.find((category) => defaultCategories.includes(category.displayName));
  const contexts = contextCategoryKeys.filter((key) => {
    const category = getManagedCalendarCategory(key);
    return category ? defaultCategories.includes(category.displayName) : false;
  });
  if (!enabled) return <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800"><input type="hidden" name="category_choice" value="__none" />重新授权 Outlook 后可同步和编辑分类。</div>;
  return <fieldset className="grid gap-2"><label className="grid gap-1 text-xs text-zinc-600">分类<select name="category_choice" defaultValue={primary?.key ?? (defaultCategories.length ? "__none" : "__auto")} className="h-9 rounded-md border bg-white px-2 text-sm"><option value="__auto">自动判断</option><option value="__none">不设置主分类</option>{primaryCalendarCategories.filter((category) => category.key !== "other").map((category) => <option key={category.key} value={category.key}>{category.shortName}</option>)}</select></label>{compact ? null : <div><p className="text-xs text-zinc-600">长期场景（可选）</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{contextCategoryKeys.map((key) => { const category = getManagedCalendarCategory(key)!; return <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-600"><input type="checkbox" name="context_category_keys" value={key} defaultChecked={contexts.includes(key)} />{category.shortName}</label>; })}</div></div>}</fieldset>;
}
