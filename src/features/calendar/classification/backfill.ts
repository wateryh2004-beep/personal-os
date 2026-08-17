import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyCalendarEvent } from "./classifier";
import { categoryNamesForKeys, managedCalendarCategories } from "./taxonomy";

export type CalendarBackfillCounts = {
  updated: number;
  alreadyLabeled: number;
  lowConfidence: number;
};

/**
 * 为尚无托管主分类的历史日程回填分类（纯本地，不依赖 Outlook）。
 *
 * 1) 补齐 calendar_categories 缺失的托管分类，保证事件可按颜色渲染；
 * 2) 对尚无托管主分类的事件用真实分类器打标，保留外部分类，低置信度不打标。
 *
 * 同步全量重读会把 App 打好的分类清空（Graph 对无分类日程返回 []），因此手动
 * 同步后也应调用本函数，让「同步一次、分类还在」成立。
 */
export async function classifyUnlabeledCalendarEvents(userId: string): Promise<CalendarBackfillCounts> {
  const admin = createAdminClient();

  const { data: existing } = await admin.from("calendar_categories").select("display_name").eq("user_id", userId).is("archived_at", null);
  const existingNames = new Set((existing ?? []).map((row) => row.display_name));
  const missing = managedCalendarCategories.filter((category) => !existingNames.has(category.displayName));
  if (missing.length) {
    const { error } = await admin.from("calendar_categories").upsert(
      missing.map((category) => ({
        user_id: userId,
        display_name: category.displayName,
        color: category.color,
        managed_key: category.key,
        category_kind: category.kind,
        keywords: category.keywords,
        ai_description: category.aiDescription,
        is_ai_managed: true,
        ai_enabled: true,
        display_order: category.order,
      })),
      { onConflict: "user_id,display_name" },
    );
    if (error) throw error;
  }

  const { data: preferences, error: rulesError } = await admin
    .from("calendar_categories")
    .select("managed_key,keywords,ai_enabled")
    .eq("user_id", userId)
    .not("managed_key", "is", null)
    .is("archived_at", null);
  if (rulesError) throw rulesError;
  const rules = (preferences ?? []).map((row) => ({ managed_key: row.managed_key, keywords: row.keywords ?? [], ai_enabled: row.ai_enabled ?? true }));
  const managedNames = new Set(managedCalendarCategories.map((category) => category.displayName));

  const counts: CalendarBackfillCounts = { updated: 0, alreadyLabeled: 0, lowConfidence: 0 };
  let offset = 0;
  for (;;) {
    const { data: events, error: eventsError } = await admin
      .from("calendar_events")
      .select("id,subject,body_text,location_name,categories")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("provider_event_id")
      .range(offset, offset + 999);
    if (eventsError) throw eventsError;
    const batch = events ?? [];
    if (!batch.length) break;
    for (const event of batch) {
      const existingCategories: string[] = event.categories ?? [];
      const external = existingCategories.filter((name) => !managedNames.has(name));
      const hasManagedPrimary = existingCategories.some((name) => managedNames.has(name) && name.startsWith("领域·"));
      if (hasManagedPrimary) {
        counts.alreadyLabeled += 1;
        continue;
      }
      const result = classifyCalendarEvent(
        { subject: event.subject ?? "", description: event.body_text ?? null, locationName: event.location_name ?? null },
        rules,
      );
      let next: string[];
      if (result.needsConfirmation) {
        next = external;
        counts.lowConfidence += 1;
      } else {
        next = [...new Set([...categoryNamesForKeys(result.primaryCategoryKey, result.contextCategoryKeys), ...external])];
        counts.updated += 1;
      }
      if (JSON.stringify(next) !== JSON.stringify(existingCategories)) {
        const { error: updateError } = await admin.from("calendar_events").update({ categories: next }).eq("id", event.id).eq("user_id", userId);
        if (updateError) throw updateError;
      }
    }
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return counts;
}
