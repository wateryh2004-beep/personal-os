import type { InvestmentAccount, LedgerEntry } from "./types";
import type { InvestmentDailyData } from "./daily-types";

/** Three append-only books share one account revision. Refuse a torn multi-query read. */
export function hasCompleteInvestmentDailySnapshot(accounts: InvestmentAccount[], entries: LedgerEntry[], daily: InvestmentDailyData): boolean {
  return accounts.every((account) => {
    const sequences = [...entries, ...daily.cashEntries, ...daily.quotes].filter((row) => row.account_id === account.id).map((row) => row.sequence);
    return sequences.length === account.revision && new Set(sequences).size === sequences.length && sequences.every((sequence) => typeof sequence === "number" && Number.isInteger(sequence) && sequence >= 1 && sequence <= account.revision);
  });
}
