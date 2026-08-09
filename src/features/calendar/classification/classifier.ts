import {
  contextCategoryKeys,
  getManagedCalendarCategory,
  primaryCalendarCategories,
  type ContextCategoryKey,
  type PrimaryCategoryKey,
} from "./taxonomy";

export type CalendarClassification = {
  primaryCategoryKey: PrimaryCategoryKey;
  contextCategoryKeys: ContextCategoryKey[];
  confidence: number;
  needsConfirmation: boolean;
  reason: string;
};

export type CalendarClassificationRule = { managed_key: string | null; keywords: string[]; ai_enabled: boolean };

export function classifyCalendarEvent(input: { subject: string; description?: string | null; locationName?: string | null }, rules?: CalendarClassificationRule[]): CalendarClassification {
  const text = `${input.subject}\n${input.description ?? ""}\n${input.locationName ?? ""}`.toLocaleLowerCase("zh-CN");
  const matchedPrimary = primaryCalendarCategories
    .filter((category) => category.key !== "other")
    .filter((category) => rules?.find((rule) => rule.managed_key === category.key)?.ai_enabled !== false)
    .map((category) => { const configured = rules?.find((rule) => rule.managed_key === category.key); const keywords = configured ? configured.keywords : category.keywords; return { category, matches: keywords.filter((keyword) => text.includes(keyword.toLocaleLowerCase("zh-CN"))) }; })
    .filter((result) => result.matches.length > 0)
    .sort((left, right) => right.matches.length - left.matches.length || left.category.order - right.category.order)[0];
  const contexts = contextCategoryKeys.filter((key) => {
    const category = getManagedCalendarCategory(key);
    const configured = rules?.find((rule) => rule.managed_key === key);
    if (configured?.ai_enabled === false) return false;
    const keywords = configured ? configured.keywords : category?.keywords ?? [];
    return keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase("zh-CN")));
  });
  if (!matchedPrimary) return { primaryCategoryKey: "other", contextCategoryKeys: contexts, confidence: 0.35, needsConfirmation: true, reason: "没有匹配到稳定分类规则" };
  const confidence = Math.min(0.98, 0.82 + (matchedPrimary.matches.length - 1) * 0.06 + (contexts.length ? 0.04 : 0));
  return { primaryCategoryKey: matchedPrimary.category.key as PrimaryCategoryKey, contextCategoryKeys: contexts, confidence, needsConfirmation: confidence < 0.75, reason: `匹配：${matchedPrimary.matches.join("、")}` };
}
