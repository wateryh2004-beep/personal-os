/** Shared by every read tool in one request; direct editor input is separate. */
export function createRetrievalBudget(limit: number, initialChars = 0) {
  let used = initialChars;
  return {
    get usedChars() { return used; },
    accept(result: unknown) {
      const chars = JSON.stringify(result)?.length ?? 0;
      if (used + chars > limit) return false;
      used += chars;
      return true;
    },
  };
}
