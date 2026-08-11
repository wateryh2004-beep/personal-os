export type CalendarEventRecord = {
  id: string;
  provider_event_id: string;
  subject: string;
  body_text: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  location_name: string | null;
  categories: string[];
  importance: "low" | "normal" | "high";
  show_as: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  last_synced_at: string;
};
