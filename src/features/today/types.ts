export type NowCalendarEvent = {
  id: string;
  subject: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  location_name: string | null;
};
export type NowTask = {
  id: string;
  title: string;
  due_at: string | null;
  importance: string | null;
  status: string;
};
export type NowCareerMilestone = {
  id: string;
  track_id: string;
  career_direction_id: string | null;
  title: string;
  starts_on: string | null;
  target_date: string;
  status: string;
  importance: string | null;
};
export type NowAvailability = "ready" | "unavailable";
export type NowAttentionItem = {
  id: string;
  kind:
    | "task_overdue"
    | "calendar_upcoming"
    | "career_milestone_approaching"
    | "weekly_review_due"
    | "decision_review_due";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description?: string;
  href: string;
};
export type NowNextAction =
  | {
      kind: "event";
      event: NowCalendarEvent;
      state: "ongoing" | "starting_soon" | "upcoming";
      reason: string;
      href: "/calendar";
    }
  | { kind: "task"; task: NowTask; reason: string; href: "/tasks" }
  | {
      kind: "career_milestone";
      milestone: NowCareerMilestone;
      reason: string;
      href: "/career/roadmap";
    }
  | { kind: "inbox"; count: number; reason: string; href: "/inbox" }
  | { kind: "none"; reason: string };
export type NowUpcomingItem = {
  id: string;
  kind: "event" | "task" | "milestone";
  title: string;
  at: string;
  href: string;
  detail?: string;
};
export type TodayBriefItem = {
  id: string;
  title: string;
  reason: string;
  priority: number;
  sourceRefs: Array<{
    id: string;
    domain: string;
    title: string;
    href: string;
    updatedAt?: string | null;
  }>;
  suggestedAction?: {
    label: string;
    agentPrompt: string;
  };
};
export type NowWorkspace = {
  timezone: string;
  calendar: {
    today: NowCalendarEvent[];
    upcoming: NowCalendarEvent[];
    connection: {
      status: string;
      last_sync_at: string | null;
      last_error_code: string | null;
    } | null;
  };
  tasks: { overdue: NowTask[]; today: NowTask[]; upcoming: NowTask[] };
  career: { upcomingMilestones: NowCareerMilestone[] };
  briefing: { entries: Array<{ id: string; title: string; url: string | null; section: string; reason: string | null }> };
  inboxCount: number;
  nextAction: NowNextAction;
  todayBrief: TodayBriefItem[];
  attention: NowAttentionItem[];
  upcoming: NowUpcomingItem[];
  availability: {
    calendar: NowAvailability;
    tasks: NowAvailability;
    career: NowAvailability;
    inbox: NowAvailability;
    briefing: NowAvailability;
  };
  summary: {
    todayEventCount: number;
    todayTaskCount: number;
    attentionCount: number;
  };
};
