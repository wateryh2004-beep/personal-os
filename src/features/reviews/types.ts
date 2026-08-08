export const reviewTypes = ["daily", "weekly", "decision"] as const;
export type ReviewType = (typeof reviewTypes)[number];
export type ReviewStatus = "draft" | "completed" | "archived";

export type ReviewPeriod = {
  key: string;
  startDate: string;
  endDate: string;
  timezone: string;
};
