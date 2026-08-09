import type { OutlookCategoryColor } from "@/features/calendar/classification/taxonomy";

export type CalendarCategory = {
  id: string;
  provider_category_id: string | null;
  display_name: string;
  color: OutlookCategoryColor;
  managed_key: string | null;
  category_kind: "primary" | "context" | "external";
  ai_description: string | null;
  keywords: string[];
  display_order: number;
  is_ai_managed: boolean;
  ai_enabled: boolean;
  last_synced_at: string;
};
