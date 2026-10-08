import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import type { InvestmentDailyData } from "./daily-types";

export async function getInvestmentDailyData(): Promise<InvestmentDailyData> {
  const { supabase, userId } = await requireOwner();
  const [cash, quotes] = await Promise.all([
    supabase.from("investment_cash_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,amount,tax,fees,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).order("sequence").limit(5001),
    supabase.from("investment_quotes").select("id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).order("as_of", { ascending: false }).limit(5001),
  ]);
  const checkedAt = new Date().toISOString();
  // Separate availability: a pending additive migration must not hide existing trade history.
  if ([cash, quotes].some((result) => result.error || result.count === null || result.count !== (result.data?.length ?? 0) || (result.data?.length ?? 0) > 5000)) return { cashEntries: [], quotes: [], unavailable: true, checkedAt };
  return { cashEntries: cash.data ?? [], quotes: quotes.data ?? [], unavailable: false, checkedAt } as InvestmentDailyData;
}
