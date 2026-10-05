import type { Holding, InvestmentAccount, InvestmentMode, LedgerEntry } from "./types";

// Fixed point, eight decimal places. No floating-point math or LLM-supplied P&L.
const SCALE = BigInt(100000000);
export function decimalUnits(value: string): bigint {
  if (!/^-?\d{1,12}(\.\d{1,8})?$/.test(value)) throw new Error("无效金额或数量（最多 8 位小数）");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0"))) * BigInt(negative ? -1 : 1);
}
export function decimalString(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const fraction = (absolute % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / SCALE}${fraction ? `.${fraction}` : ""}`;
}
function roundedDivide(value: bigint, divisor: bigint) {
  const sign = value < BigInt(0) ? BigInt(-1) : BigInt(1);
  const absolute = value < BigInt(0) ? -value : value;
  return ((absolute + divisor / BigInt(2)) / divisor) * sign;
}

type Balance = { quantity: bigint; cost: bigint | null; realized: bigint | null; openingSeen: boolean; seen: boolean };
export function deriveHoldings(accounts: InvestmentAccount[], entries: LedgerEntry[], mode: InvestmentMode): Holding[] {
  const accountMap = new Map(accounts.filter((account) => account.mode === mode).map((account) => [account.id, account]));
  const balances = new Map<string, { account: InvestmentAccount; symbol: string; balance: Balance }>();
  const scoped = entries.filter((entry) => accountMap.has(entry.account_id));
  const voided = new Set<string>();
  for (const correction of scoped.filter((entry) => entry.kind === "void")) {
    const target = scoped.find((entry) => entry.id === correction.void_entry_id);
    if (!target || target.kind === "void" || target.account_id !== correction.account_id || target.symbol !== correction.symbol || voided.has(target.id)) throw new Error("作废记录无效或原记录已经作废");
    voided.add(target.id);
  }
  const sorted = scoped.filter((entry) => entry.kind !== "void" && !voided.has(entry.id)).toSorted((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.sequence !== undefined && b.sequence !== undefined ? a.sequence - b.sequence : a.created_at.localeCompare(b.created_at)) || a.id.localeCompare(b.id));
  for (const entry of sorted) {
    const account = accountMap.get(entry.account_id)!;
    const key = `${entry.account_id}:${entry.symbol}`;
    const record = balances.get(key) ?? { account, symbol: entry.symbol, balance: { quantity: BigInt(0), cost: BigInt(0), realized: BigInt(0), openingSeen: false, seen: false } };
    const balance = record.balance;
    const quantity = decimalUnits(entry.quantity);
    const fees = decimalUnits(entry.fees);
    if (quantity <= BigInt(0) || fees < BigInt(0)) throw new Error("数量必须大于 0，费用不能为负");
    const price = entry.price === null ? null : decimalUnits(entry.price);
    if (price !== null && price < BigInt(0)) throw new Error("价格不能为负");
    if (entry.kind !== "opening" && price === null) throw new Error("买卖记录必须提供成交价格");
    if (entry.kind === "opening") {
      if (balance.seen || balance.openingSeen) throw new Error("期初持仓必须是该标的第一条记录，不能重复建立");
      balance.openingSeen = true;
    }
    if (entry.kind === "sell") {
      if (quantity > balance.quantity) throw new Error(`${entry.symbol} 的卖出数量超过当日可用持仓，请核对日期和数量`);
      const allocated = balance.cost === null ? null : quantity === balance.quantity ? balance.cost : roundedDivide(balance.cost * quantity, balance.quantity);
      const proceeds = roundedDivide(quantity * price!, SCALE) - fees;
      balance.realized = balance.realized === null || allocated === null ? null : balance.realized + proceeds - allocated;
      balance.cost = allocated === null ? null : balance.cost! - allocated;
      balance.quantity -= quantity;
      if (balance.quantity === BigInt(0)) balance.cost = BigInt(0);
    } else {
      const addedCost = price === null ? null : roundedDivide(quantity * price, SCALE) + fees;
      balance.cost = balance.cost === null || addedCost === null ? null : balance.cost + addedCost;
      balance.quantity += quantity;
    }
    balance.seen = true;
    balances.set(key, record);
  }
  return [...balances.values()].map(({ account, symbol, balance }) => ({ accountId: account.id, accountName: account.name, currency: account.currency, symbol, quantity: decimalString(balance.quantity), costBasis: balance.cost === null ? null : decimalString(balance.cost), realizedPnl: balance.realized === null ? null : decimalString(balance.realized) }));
}
