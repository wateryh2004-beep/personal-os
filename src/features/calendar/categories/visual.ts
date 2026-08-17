import type { CalendarCategory } from "./types";
import { managedCalendarCategories } from "../classification/taxonomy";

export type CalendarEventVisual = {
  primaryCategory: CalendarCategory | null;
  background: string;
  border: string;
  foreground: string;
  dot: string;
};

// Categories need to be immediately recognisable without turning a full-day
// work block into the loudest element on the page. The fill is a distinct,
// lightly tinted surface; the border, text and dot carry the saturated cue.
const neutral = { background: "#eef2f6", border: "#718096", foreground: "#334155", dot: "#718096" };

const outlookPresetTokens: Record<string, Omit<CalendarEventVisual, "primaryCategory">> = {
  preset0: { background: "#fdeced", border: "#cf4d54", foreground: "#8a2931", dot: "#cf4d54" },
  preset1: { background: "#fff1e5", border: "#d97928", foreground: "#8a4b18", dot: "#d97928" },
  preset2: { background: "#f7eee8", border: "#a66b49", foreground: "#68422d", dot: "#a66b49" },
  preset3: { background: "#fff8de", border: "#b79224", foreground: "#735b0d", dot: "#b79224" },
  preset4: { background: "#e9f7ee", border: "#3e9362", foreground: "#23603d", dot: "#3e9362" },
  preset5: { background: "#e5f6f3", border: "#238a81", foreground: "#155c56", dot: "#238a81" },
  preset6: { background: "#f2f6e3", border: "#809237", foreground: "#526019", dot: "#809237" },
  preset7: { background: "#eaf2ff", border: "#4b7fd0", foreground: "#294f88", dot: "#4b7fd0" },
  preset8: { background: "#f1ebfb", border: "#8465bf", foreground: "#543c83", dot: "#8465bf" },
  preset9: { background: "#fbeaf1", border: "#c56589", foreground: "#813a57", dot: "#c56589" },
  preset10: { background: "#eaf3f7", border: "#52829a", foreground: "#31576a", dot: "#52829a" },
  preset11: { background: "#eef1f4", border: "#68737e", foreground: "#404b57", dot: "#68737e" },
  preset12: { background: "#f1f3f5", border: "#838c96", foreground: "#505861", dot: "#838c96" },
  preset13: { background: "#fae9e9", border: "#a74545", foreground: "#6d2929", dot: "#a74545" },
  preset14: { background: "#fbeddf", border: "#b86425", foreground: "#733d17", dot: "#b86425" },
  preset15: { background: "#f3ebe6", border: "#835d48", foreground: "#52392d", dot: "#835d48" },
  preset16: { background: "#fbf4dc", border: "#9b7d1e", foreground: "#62500f", dot: "#9b7d1e" },
  preset17: { background: "#e8f3eb", border: "#3d7d50", foreground: "#275137", dot: "#3d7d50" },
  preset18: { background: "#e4f2f1", border: "#397a76", foreground: "#24524f", dot: "#397a76" },
  preset19: { background: "#eaf3ec", border: "#4d7f5a", foreground: "#30533a", dot: "#4d7f5a" },
  preset20: { background: "#e8f0fa", border: "#3d6eaa", foreground: "#284b76", dot: "#3d6eaa" },
  preset21: { background: "#eeeafa", border: "#6d58a3", foreground: "#49386f", dot: "#6d58a3" },
  preset22: { background: "#f8e9ef", border: "#a84f70", foreground: "#6e3349", dot: "#a84f70" },
  preset23: { background: "#eceef0", border: "#4b5561", foreground: "#303841", dot: "#4b5561" },
  preset24: { background: "#f9ebf0", border: "#a85b72", foreground: "#713d4d", dot: "#a85b72" },
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
