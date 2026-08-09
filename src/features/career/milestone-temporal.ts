import { differenceDateKeys } from "@/lib/date-keys";

export type CareerMilestoneTemporalInput = {
  target_date: string;
  status: string;
  importance?: string | null;
};

export type CareerMilestoneTemporalState =
  | "future"
  | "today"
  | "past_completed"
  | "past_unresolved";

const resolvedStatuses = new Set(["completed", "skipped", "cancelled", "archived"]);

export function isOpenCareerMilestone(milestone: CareerMilestoneTemporalInput) {
  return !resolvedStatuses.has(milestone.status);
}

export function daysUntilCareerMilestone(targetDate: string, today: string) {
  return differenceDateKeys(targetDate, today);
}

export function getCareerMilestoneTemporalState(
  milestone: CareerMilestoneTemporalInput,
  today: string,
): CareerMilestoneTemporalState {
  const days = daysUntilCareerMilestone(milestone.target_date, today);
  if (days > 0) return "future";
  if (days === 0) return "today";
  return isOpenCareerMilestone(milestone) ? "past_unresolved" : "past_completed";
}

function milestoneSort<T extends CareerMilestoneTemporalInput>(left: T, right: T) {
  const importance = { high: 0, normal: 1, low: 2 } as const;
  return (
    left.target_date.localeCompare(right.target_date) ||
    (importance[left.importance as keyof typeof importance] ?? 1) -
      (importance[right.importance as keyof typeof importance] ?? 1)
  );
}

export function classifyCareerMilestones<T extends CareerMilestoneTemporalInput>(
  milestones: T[],
  today: string,
) {
  const result: {
    today: T[];
    upcoming: T[];
    pastCompleted: T[];
    pastUnresolved: T[];
  } = { today: [], upcoming: [], pastCompleted: [], pastUnresolved: [] };

  for (const milestone of milestones) {
    const state = getCareerMilestoneTemporalState(milestone, today);
    if (state === "today") result.today.push(milestone);
    else if (state === "future") result.upcoming.push(milestone);
    else if (state === "past_completed") result.pastCompleted.push(milestone);
    else result.pastUnresolved.push(milestone);
  }

  result.today.sort(milestoneSort);
  result.upcoming.sort(milestoneSort);
  result.pastCompleted.sort(milestoneSort);
  result.pastUnresolved.sort(milestoneSort);
  return result;
}

export function selectOpenCareerMilestones<T extends CareerMilestoneTemporalInput>(
  milestones: T[],
  today: string,
  maxDays: number,
) {
  const classified = classifyCareerMilestones(milestones, today);
  return [...classified.today, ...classified.upcoming]
    .filter(
      (milestone) =>
        isOpenCareerMilestone(milestone) &&
        daysUntilCareerMilestone(milestone.target_date, today) <= maxDays,
    )
    .sort(milestoneSort);
}
