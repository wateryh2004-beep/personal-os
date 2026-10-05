import { describe, expect, it } from "vitest";
import { decimalString, decimalUnits, deriveHoldings } from "@/features/investment/calculator";
import type { InvestmentAccount, LedgerEntry } from "@/features/investment/types";
const real: InvestmentAccount = { id: "real", name: "真实", mode: "real", currency: "CNY", revision: 0 };
const paper: InvestmentAccount = { ...real, id: "paper", name: "模拟", mode: "paper" };
function entry(kind: LedgerEntry["kind"], quantity: string, price: string | null, changes: Partial<LedgerEntry> = {}): LedgerEntry { return { id: "1", account_id: "real", kind, symbol: "XSHG:TEST", occurred_on: "2026-10-01", quantity, price, fees: "0", source: "Synthetic unit-test fixture", import_key: "1", created_at: "2026-10-01T00:00:00Z", ...changes }; }
describe("investment deterministic ledger", () => {
  it("preserves decimal exactness", () => { expect(decimalString(decimalUnits("0.1") + decimalUnits("0.2"))).toBe("0.3"); expect(decimalString(decimalUnits("-12.12345678"))).toBe("-12.12345678"); });
  it("calculates average-cost realized PnL net of fees", () => {
    const rows = [entry("buy", "10", "10", { fees: "1", sequence: 1 }), entry("buy", "10", "20", { id: "2", sequence: 2 }), entry("sell", "5", "30", { id: "3", fees: "2", sequence: 3 })];
    expect(deriveHoldings([real], rows, "real")[0]).toMatchObject({ quantity: "15", costBasis: "225.75", realizedPnl: "72.75" });
  });
  it("does not mix real and paper accounts or leak another account", () => { const rows = [entry("buy", "1", "10"), entry("buy", "999", "999", { account_id: "paper" }), entry("buy", "999", "999", { account_id: "foreign" })]; expect(deriveHoldings([real, paper], rows, "real")).toHaveLength(1); expect(deriveHoldings([real,paper], rows, "real")[0].quantity).toBe("1"); expect(deriveHoldings([real,paper], rows, "paper")[0].quantity).toBe("999"); });
  it("preserves unknown basis through buys and sales", () => { expect(deriveHoldings([real], [entry("opening", "10", null, { sequence: 1 }), entry("buy", "5", "10", { sequence: 2 }), entry("sell", "2", "15", { sequence: 3 })], "real")[0]).toMatchObject({ quantity: "13", costBasis: null, realizedPnl: null }); });
  it("clears basis after closing while retaining unknown historical PnL", () => { expect(deriveHoldings([real], [entry("opening", "10", null, { sequence: 1 }), entry("sell", "10", "15", { sequence: 2 }), entry("buy", "1", "20", { sequence: 3 })], "real")[0]).toMatchObject({ quantity: "1", costBasis: "20", realizedPnl: null }); });
  it("rejects oversells including backdated events", () => { expect(() => deriveHoldings([real], [entry("buy", "10", "1"), entry("sell", "1", "1", { occurred_on: "2026-09-30" })], "real")).toThrow("超过"); });
  it("rejects duplicate opening snapshots", () => { expect(() => deriveHoldings([real], [entry("opening", "10", null), entry("opening", "10", null)], "real")).toThrow("期初"); });
  it("allocates all remaining basis on a full close", () => { const result = deriveHoldings([real], [entry("buy", "3", "0.33333333", { sequence: 1 }),entry("sell", "1", "1", { sequence: 2 }),entry("sell", "2", "1", { sequence: 3 })], "real")[0]; expect(result.costBasis).toBe("0"); expect(result.realizedPnl).toBe("2.00000001"); });
  it("does not invent holdings for empty accounts", () => { expect(deriveHoldings([real], [], "real")).toEqual([]); });
});

describe("immutable investment corrections", () => {
  it("excludes a voided buy without altering original event", () => { const buy = entry("buy","10","5",{id:"buy",sequence:1}); const correction=entry("void","10",null,{id:"correction",void_entry_id:"buy",sequence:2,source:"mistyped record"}); const original=JSON.stringify(buy); expect(deriveHoldings([real],[buy,correction],"real")).toEqual([]); expect(JSON.stringify(buy)).toBe(original); });
  it("refuses a void that would orphan a later sale", () => { expect(() => deriveHoldings([real],[entry("buy","10","5",{id:"buy",sequence:1}),entry("sell","5","6",{id:"sell",sequence:2}),entry("void","10",null,{id:"correction",void_entry_id:"buy",sequence:3})],"real")).toThrow("超过"); });
  it("can void a mistaken sale and restore cost without PnL contamination", () => { const result=deriveHoldings([real],[entry("buy","10","5",{id:"buy",sequence:1}),entry("sell","5","6",{id:"sell",sequence:2}),entry("void","5",null,{id:"correction",void_entry_id:"sell",sequence:3})],"real"); expect(result[0]).toMatchObject({quantity:"10",costBasis:"50",realizedPnl:"0"}); });
  it("refuses cross-account, missing and repeated correction targets", () => { const original=entry("buy","10","5",{id:"buy"}); const correction=entry("void","10",null,{id:"correction",void_entry_id:"missing"}); expect(() => deriveHoldings([real],[original,correction],"real")).toThrow("作废"); const valid={...correction,void_entry_id:"buy"}; expect(() => deriveHoldings([real],[original,valid,{...valid,id:"again"}],"real")).toThrow("作废"); });
});
