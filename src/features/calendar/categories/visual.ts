import type { CalendarCategory } from "./types";
import { managedCalendarCategories } from "../classification/taxonomy";

export type CalendarEventVisual = {
  primaryCategory: CalendarCategory | null;
  background: string;
  border: string;
  foreground: string;
  dot: string;
};

const neutral = { background: "#f4f4f3", border: "#a1a1aa", foreground: "#3f3f46", dot: "#71717a" };

const outlookPresetTokens: Record<string, Omit<CalendarEventVisual, "primaryCategory">> = {
  preset0: { background: "#fdf1f1", border: "#b85757", foreground: "#713737", dot: "#a4262c" },
  preset1: { background: "#fdf4e8", border: "#c47a28", foreground: "#70451e", dot: "#d97706" },
  preset2: { background: "#f8f1eb", border: "#9a6b45", foreground: "#62452f", dot: "#8b5e3c" },
  preset3: { background: "#fbf8e8", border: "#a38b32", foreground: "#65571f", dot: "#927c23" },
  preset4: { background: "#edf7ef", border: "#4f8c5d", foreground: "#31583a", dot: "#4f8c5d" },
  preset5: { background: "#eaf6f5", border: "#39847e", foreground: "#285c58", dot: "#0f766e" },
  preset6: { background: "#f3f4e8", border: "#858846", foreground: "#575a31", dot: "#777b33" },
  preset7: { background: "#edf3f6", border: "#47758f", foreground: "#24495e", dot: "#365f78" },
  preset8: { background: "#f3eff8", border: "#77619a", foreground: "#4d3c67", dot: "#6b4f8a" },
  preset9: { background: "#f9eef2", border: "#a85a73", foreground: "#69394a", dot: "#a42655" },
  preset10: { background: "#eef3f5", border: "#607d8b", foreground: "#3e5661", dot: "#546e7a" },
  preset11: { background: "#f0f1f2", border: "#656a70", foreground: "#3d4146", dot: "#555b61" },
  preset12: { background: "#f4f4f3", border: "#8b8b88", foreground: "#484846", dot: "#71717a" },
  preset13: { background: "#f8ebeb", border: "#8f3535", foreground: "#5d2626", dot: "#7f2727" },
  preset14: { background: "#f8eee5", border: "#9b5721", foreground: "#613817", dot: "#8d4a16" },
  preset15: { background: "#f2ebe5", border: "#795338", foreground: "#4f3828", dot: "#69452d" },
  preset16: { background: "#f6f1dd", border: "#887321", foreground: "#594b18", dot: "#78651a" },
  preset17: { background: "#eaf2eb", border: "#356e42", foreground: "#254c2e", dot: "#2e6039" },
  preset18: { background: "#e7f2f1", border: "#2d6c68", foreground: "#214b48", dot: "#255e5a" },
  preset19: { background: "#edf4ee", border: "#447153", foreground: "#2f503a", dot: "#356443" },
  preset20: { background: "#e8eef4", border: "#315d80", foreground: "#23425c", dot: "#294f6e" },
  preset21: { background: "#eeeaf4", border: "#5c477e", foreground: "#3f3158", dot: "#503d70" },
  preset22: { background: "#f6e9ef", border: "#82415c", foreground: "#582e40", dot: "#71374f" },
  preset23: { background: "#ececec", border: "#3f3f46", foreground: "#27272a", dot: "#27272a" },
  preset24: { background: "#f8eef1", border: "#8d596a", foreground: "#603a47", dot: "#7e475a" },
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
