import { classifyCalendarEvent, type CalendarClassificationRule } from "./classification/classifier";
import { categoryNamesForKeys, managedCalendarCategories } from "./classification/taxonomy";
import type { CreateCalendarEvent, UpdateCalendarEvent } from "./schemas";

export function resolveCalendarCategories(value: CreateCalendarEvent, existingCategories: string[] = [], options?: { enabled?: boolean; rules?: CalendarClassificationRule[] }) {
  if (options?.enabled === false) return [];
  if (value.classificationMode === "none") return existingCategories.filter((name) => !managedCalendarCategories.some((category) => category.displayName === name));
  const classification = value.primaryCategoryKey
    ? { primaryCategoryKey: value.primaryCategoryKey, contextCategoryKeys: value.contextCategoryKeys, confidence: value.classificationConfidence ?? 1, needsConfirmation: false, reason: value.classificationReason ?? "用户或 AI 已明确分类" }
    : classifyCalendarEvent(value, options?.rules);
  if (value.classificationMode === "auto" && classification.needsConfirmation) return [];
  return categoryNamesForKeys(classification.primaryCategoryKey, classification.contextCategoryKeys);
}

export function resolveUpdatedCalendarCategories(value: UpdateCalendarEvent, existingCategories: string[]) {
  if (value.preserveCategories || !value.classificationMode) return undefined;
  const external = existingCategories.filter((name) => !managedCalendarCategories.some((category) => category.displayName === name));
  if (value.classificationMode === "none") return external;
  const managed = categoryNamesForKeys(value.primaryCategoryKey ?? null, value.contextCategoryKeys ?? []);
  return [...new Set([...managed, ...external])];
}

export function calendarPayload(value: CreateCalendarEvent, classificationOptions?: { enabled?: boolean; rules?: CalendarClassificationRule[] }) {
  return {
    subject: value.subject,
    description: value.description,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    locationName: value.locationName,
    isAllDay: value.isAllDay,
    categories: resolveCalendarCategories(value, [], classificationOptions),
    importance: value.importance,
    showAs: value.showAs,
  };
}

export function calendarUpdatePayload(value: UpdateCalendarEvent, existing: { categories: string[]; body_text?: string | null; location_name?: string | null; is_all_day?: boolean; importance: "low" | "normal" | "high"; show_as: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown" }) {
  return {
    subject: value.subject,
    description: value.description === undefined ? existing.body_text ?? null : value.description,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    locationName: value.locationName === undefined ? existing.location_name ?? null : value.locationName,
    isAllDay: value.isAllDay ?? existing.is_all_day ?? false,
    categories: resolveUpdatedCalendarCategories(value, existing.categories),
    importance: value.importance ?? existing.importance,
    showAs: value.showAs ?? existing.show_as,
  };
}

export function eventForGraph(value: CreateCalendarEvent) {
  return {
    subject: value.subject,
    ...(value.description ? { body: { contentType: "text", content: value.description } } : {}),
    start: { dateTime: value.startsAt, timeZone: "UTC" },
    end: { dateTime: value.endsAt, timeZone: "UTC" },
    isAllDay: value.isAllDay,
    categories: resolveCalendarCategories(value),
    importance: value.importance,
    showAs: value.showAs,
    ...(value.locationName ? { location: { displayName: value.locationName } } : {}),
  };
}
