export const experienceReviewIntervalDays = 90;
export function experienceReviewDue(createdAt: string, reviewedAt: string | null | undefined, now = Date.now()) {
  const baseline = Date.parse(reviewedAt || createdAt);
  return Number.isFinite(baseline) && now - baseline >= experienceReviewIntervalDays * 24 * 60 * 60 * 1000;
}
