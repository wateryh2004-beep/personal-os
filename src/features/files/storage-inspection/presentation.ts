/** Capacity planning is user-defined, never a provider quota or billing estimate. */
export function storageBudget(bytes: number | null, budgetGiB: string, complete: boolean) {
  const budget = Number(budgetGiB);
  if (!budgetGiB.trim() || !Number.isFinite(budget) || budget <= 0 || !complete || bytes === null) return null;
  const total = budget * 1024 ** 3;
  if (total < 1 || !Number.isSafeInteger(Math.round(total))) return null;
  return { total, remaining: Math.max(0, total - bytes), excess: Math.max(0, bytes - total), percent: Math.min(100, bytes / total * 100) };
}
