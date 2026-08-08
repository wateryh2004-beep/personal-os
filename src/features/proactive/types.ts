export type ProactiveInsight = {
  id: string;
  kind:
    | "task_overdue"
    | "calendar_upcoming"
    | "career_milestone_approaching"
    | "weekly_review_due";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description?: string;
  href: string;
  fingerprint: string;
};
