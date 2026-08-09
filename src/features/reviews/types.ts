export const reviewTypes = ["daily", "weekly", "decision"] as const;
export type ReviewType = (typeof reviewTypes)[number];
export type ReviewStatus = "draft" | "completed" | "archived";

export type ReviewPeriod = {
  key: string;
  startDate: string;
  endDate: string;
  timezone: string;
};

export type ReviewStructuredData = {
  wins: string[];
  friction: string[];
  openLoops: string[];
  changes: string[];
  lessons: string[];
  nextFocus: string[];
  freeReflection: string;
};

export type ReviewSourceRole = "origin" | "context" | "cited";

export type ReviewSourceInput = {
  sourceType: string;
  sourceId: string;
  sourceRole: ReviewSourceRole;
};
