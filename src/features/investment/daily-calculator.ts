import { decimalString, decimalUnits, deriveHoldings } from "./calculator";
import type { InvestmentAccount, InvestmentMode, LedgerEntry } from "./types";
import type { InvestmentCashEntry, InvestmentDailyAccount, InvestmentQuote, ValuedHolding } from "./daily-types";

const SCALE = BigInt(100000000);
// A disclosure threshold, not an exchange calendar or a claim of live pricing.
export const QUOTE_STALE_HOURS = 72;
function computedUnits(value: string): bigint {
  if (!/^-?\d+(\.\d{1,8})?$/.test(value)) throw new Error("计算金额无效");
  const [integer, fraction = ""] = value.replace(/^-/, "").split(".");
  return (BigInt(integer) * SCALE + BigInt(fraction.padEnd(8, "0"))) * (value.startsWith("-") ? BigInt(-1) : BigInt(1));
}
function multiply(quantity: string, price: string) {
  // A position can aggregate many valid 12-digit trade quantities. Keep the input
  // limit on prices; the already-validated/computed quantity has no digit cap.
  return (computedUnits(quantity) * decimalUnits(price) + SCALE / BigInt(2)) / SCALE;
}
function activeCash(entries: InvestmentCashEntry[]) {
  const voided = new Set<string>();
  for (const entry of entries.filter((row) => row.kind === "void")) {
    const target = entries.find((row) => row.id === entry.void_entry_id);
    if (!target || target.kind === "void" || target.account_id !== entry.account_id || voided.has(target.id)) throw new Error("现金作废记录无效");
    voided.add(target.id);
  }
  return entries.filter((row) => row.kind !== "void" && !voided.has(row.id));
}

export function deriveInvestmentDaily(accounts: InvestmentAccount[], ledger: LedgerEntry[], cashEntries: InvestmentCashEntry[], quotes: InvestmentQuote[], mode: InvestmentMode, checkedAt: string): InvestmentDailyAccount[] {
  const now = Date.parse(checkedAt);
  if (!Number.isFinite(now)) throw new Error("估值核对时间无效");
  const holdings = deriveHoldings(accounts, ledger, mode);
  return accounts.filter((account) => account.mode === mode).map((account) => {
    const scopedLedger = ledger.filter((entry) => entry.account_id === account.id);
    const voided = new Set(scopedLedger.filter((row) => row.kind === "void").map((row) => row.void_entry_id));
    const trades = scopedLedger.filter((row) => (row.kind === "buy" || row.kind === "sell") && !voided.has(row.id));
    const cashEvents = activeCash(cashEntries.filter((entry) => entry.account_id === account.id));
    const openings = cashEvents.filter((entry) => entry.kind === "opening");
    if (openings.length > 1) throw new Error("现金期初记录重复");
    const opening = openings[0];
    const cashState = !opening ? "missing_opening" : [...cashEvents, ...trades].some((entry) => entry.occurred_on < opening.occurred_on) ? "invalid_opening" : "known";
    let cash = BigInt(0), dividends = BigInt(0);
    for (const entry of cashEvents) {
      const amount = decimalUnits(entry.amount), tax = decimalUnits(entry.tax), fees = decimalUnits(entry.fees);
      if (amount < BigInt(0) || tax < BigInt(0) || fees < BigInt(0) || (entry.kind !== "opening" && amount === BigInt(0))) throw new Error("现金金额无效");
      if (entry.kind !== "dividend" && (tax !== BigInt(0) || fees !== BigInt(0))) throw new Error("非分红记录不能携带扣税或分红费用");
      if (entry.kind === "dividend") {
        if (!entry.symbol || tax + fees > amount) throw new Error("分红金额无效");
        dividends += amount - tax - fees;
      }
      cash += entry.kind === "withdrawal" || entry.kind === "fee" ? -amount : amount - tax - fees;
    }
    // Opening positions were already held when the cash book began: do not charge them twice.
    for (const trade of trades) cash += trade.kind === "buy" ? -multiply(trade.quantity, trade.price!) - decimalUnits(trade.fees) : multiply(trade.quantity, trade.price!) - decimalUnits(trade.fees);
    const valued: ValuedHolding[] = holdings.filter((holding) => holding.accountId === account.id).map((holding) => {
      if (holding.quantity === "0") return { ...holding, quote: null, quoteState: "closed", marketValue: "0", unrealizedPnl: "0" };
      const quote = quotes.filter((row) => row.account_id === account.id && row.symbol === holding.symbol && row.currency === account.currency)
        .toSorted((a, b) => Date.parse(b.as_of) - Date.parse(a.as_of) || b.sequence - a.sequence)[0] ?? null;
      if (!quote) return { ...holding, quote: null, quoteState: "missing", marketValue: null, unrealizedPnl: null };
      const timestamp = Date.parse(quote.as_of);
      if (!Number.isFinite(timestamp) || timestamp > now || decimalUnits(quote.price) < BigInt(0)) throw new Error("报价时间或价格无效");
      const value = multiply(holding.quantity, quote.price);
      return { ...holding, quote, quoteState: now - timestamp > QUOTE_STALE_HOURS * 3600000 ? "stale" : "recorded", marketValue: decimalString(value), unrealizedPnl: holding.costBasis === null ? null : decimalString(value - computedUnits(holding.costBasis)) };
    });
    const missingQuotes = valued.filter((holding) => holding.quoteState === "missing").length;
    const staleQuotes = valued.filter((holding) => holding.quoteState === "stale").length;
    const sum = (field: "marketValue" | "unrealizedPnl") => valued.some((holding) => holding[field] === null) ? null : decimalString(valued.reduce((total, holding) => total + computedUnits(holding[field]!), BigInt(0)));
    const marketValue = sum("marketValue");
    return { account, holdings: valued, cash: cashState === "known" ? decimalString(cash) : null, cashState, netDividends: decimalString(dividends), marketValue, unrealizedPnl: sum("unrealizedPnl"), recordedAssets: cashState === "known" && marketValue !== null ? decimalString(cash + computedUnits(marketValue)) : null, missingQuotes, staleQuotes };
  });
}
