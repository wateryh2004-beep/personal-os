import type { Holding, InvestmentAccount } from "./types";

export type CashKind = "opening" | "deposit" | "withdrawal" | "dividend" | "fee" | "void";
export type InvestmentCashEntry = {
  id: string; account_id: string; sequence: number; kind: CashKind; void_entry_id: string | null;
  symbol: string | null; occurred_on: string; amount: string; tax: string; fees: string;
  source: string; import_key: string; created_at: string;
};
export type InvestmentQuote = {
  id: string; account_id: string; sequence: number; symbol: string; currency: InvestmentAccount["currency"];
  price: string; as_of: string; source_kind: "manual" | "imported"; source: string; import_key: string; created_at: string;
};
export type InvestmentDailyData = { cashEntries: InvestmentCashEntry[]; quotes: InvestmentQuote[]; unavailable: boolean; checkedAt: string };
export type ValuedHolding = Holding & { quote: InvestmentQuote | null; quoteState: "missing" | "stale" | "recorded" | "closed"; marketValue: string | null; unrealizedPnl: string | null };
export type InvestmentDailyAccount = {
  account: InvestmentAccount; holdings: ValuedHolding[]; cash: string | null;
  cashState: "known" | "missing_opening" | "invalid_opening";
  netDividends: string; marketValue: string | null; unrealizedPnl: string | null; recordedAssets: string | null;
  missingQuotes: number; staleQuotes: number;
};
