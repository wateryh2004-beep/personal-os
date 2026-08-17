import type { CalendarCategory } from "./types";
import { managedCalendarCategories } from "../classification/taxonomy";

export type CalendarEventVisual = {
  primaryCategory: CalendarCategory | null;
  background: string;
  border: string;
  foreground: string;
  dot: string;
};

const neutral = { background: "#64748b", border: "#475569", foreground: "#ffffff", dot: "#64748b" };

const outlookPresetTokens: Record<string, Omit<CalendarEventVisual, "primaryCategory">> = {
  preset0: { background: "#dc2626", border: "#b91c1c", foreground: "#ffffff", dot: "#dc2626" },
  preset1: { background: "#ea580c", border: "#c2410c", foreground: "#ffffff", dot: "#ea580c" },
  preset2: { background: "#a16207", border: "#854d0e", foreground: "#ffffff", dot: "#a16207" },
  preset3: { background: "#ca8a04", border: "#a16207", foreground: "#ffffff", dot: "#ca8a04" },
  preset4: { background: "#16a34a", border: "#15803d", foreground: "#ffffff", dot: "#16a34a" },
  preset5: { background: "#0f766e", border: "#0f5f59", foreground: "#ffffff", dot: "#0f766e" },
  preset6: { background: "#65a30d", border: "#4d7c0f", foreground: "#ffffff", dot: "#65a30d" },
  preset7: { background: "#2563eb", border: "#1d4ed8", foreground: "#ffffff", dot: "#2563eb" },
  preset8: { background: "#7c3aed", border: "#6d28d9", foreground: "#ffffff", dot: "#7c3aed" },
  preset9: { background: "#db2777", border: "#be185d", foreground: "#ffffff", dot: "#db2777" },
  preset10: { background: "#0284c7", border: "#0369a1", foreground: "#ffffff", dot: "#0284c7" },
  preset11: { background: "#475569", border: "#334155", foreground: "#ffffff", dot: "#475569" },
  preset12: { background: "#64748b", border: "#475569", foreground: "#ffffff", dot: "#64748b" },
  preset13: { background: "#b91c1c", border: "#991b1b", foreground: "#ffffff", dot: "#b91c1c" },
  preset14: { background: "#c2410c", border: "#9a3412", foreground: "#ffffff", dot: "#c2410c" },
  preset15: { background: "#78350f", border: "#5c2a0b", foreground: "#ffffff", dot: "#78350f" },
  preset16: { background: "#a16207", border: "#854d0e", foreground: "#ffffff", dot: "#a16207" },
  preset17: { background: "#15803d", border: "#166534", foreground: "#ffffff", dot: "#15803d" },
  preset18: { background: "#0f766e", border: "#115e59", foreground: "#ffffff", dot: "#0f766e" },
  preset19: { background: "#15803d", border: "#166534", foreground: "#ffffff", dot: "#15803d" },
  preset20: { background: "#1d4ed8", border: "#1e40af", foreground: "#ffffff", dot: "#1d4ed8" },
  preset21: { background: "#6d28d9", border: "#5b21b6", foreground: "#ffffff", dot: "#6d28d9" },
  preset22: { background: "#be185d", border: "#9d174d", foreground: "#ffffff", dot: "#be185d" },
  preset23: { background: "#27272a", border: "#18181b", foreground: "#ffffff", dot: "#27272a" },
  preset24: { background: "#9f1239", border: "#881337", foreground: "#ffffff", dot: "#9f1239" },
};

export const outlookCategoryPalette: Record<string, { label: string }> = {
  None: { label: "无颜色" },
  preset0: { label: "红色" }, preset1: { label: "橙色" }, preset2: { label: "棕色" }, preset3: { label: "黄色" },
  preset4: { label: "绿色" }, preset5: { label: "青色" }, preset6: { label: "橄榄色" }, preset7: { label: "蓝色" },
  preset8: { label: "紫色" }, preset9: { label: "粉色" }, preset10: { label: "灰蓝色" }, preset11: { label: "深灰色" },
  preset12: { label: "浅灰色" }, preset13: { label: "深红色" }, preset14: { label: "深橙色" }, preset15: { label: "深棕色" },
  preset16: { label: "深黄色" }, preset17: { label: "深绿色" }, preset18: { label: "深青色" }, preset19: { label: "森林绿" },
  preset20: { label: "深蓝色" }, preset21: { label: "深紫色" }, preset22: { label: "深粉色" }, preset23: { label: "黑色" }, preset24: { label: "莓红色" },
};

export function resolveCalendarEventVisual(eventCategories: string[], categories: CalendarCategory[]): CalendarEventVisual {
  const records = eventCategories.flatMap((name) => {
    const category = categories.find((item) => item.display_name === name && !item.provider_category_id?.startsWith("archived:"));
    return category ? [category] : [];
  });
  const primaryCategory = records.find((category) => category.category_kind === "primary") ?? records[0] ?? null;
  let tokens;
  if (primaryCategory) {
    tokens = outlookPresetTokens[primaryCategory.color] ?? neutral;
  } else {
    // 分类表尚未同步时，回退到 taxonomy 内置色，保证已带管理分类的事件仍有颜色。
    const managed = eventCategories.flatMap((name) => {
      const category = managedCalendarCategories.find((item) => item.displayName === name);
      return category ? [category] : [];
    });
    const managedPrimary = managed.find((category) => category.kind === "primary") ?? managed[0] ?? null;
    tokens = managedPrimary ? outlookPresetTokens[managedPrimary.color] ?? neutral : neutral;
  }
  return { primaryCategory, ...tokens };
}

/**
 * 按 Outlook 预设色直接取色点 hex。用于无需依赖同步分类列表即可
 * 呈现「颜色=类别」的场景（如图例行），保证每个类别颜色恒有区分。
 */
export function outlookCategoryDot(color: string): string {
  return outlookPresetTokens[color]?.dot ?? neutral.dot;
}
