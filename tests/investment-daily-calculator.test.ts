import { describe, expect, it } from "vitest";
import { hasCompleteInvestmentDailySnapshot } from "@/features/investment/daily-snapshot";
import { deriveInvestmentDaily } from "@/features/investment/daily-calculator";
import { investmentCashSchema, investmentQuoteImportSchema, investmentQuoteSchema } from "@/features/investment/daily-schemas";
import type { InvestmentAccount, LedgerEntry } from "@/features/investment/types";
import type { InvestmentCashEntry, InvestmentQuote } from "@/features/investment/daily-types";
const now = "2026-10-07T12:00:00Z";
const real: InvestmentAccount = { id:"11111111-1111-4111-8111-111111111111",name:"Synthetic real",mode:"real",currency:"CNY",revision:0 };
const paper: InvestmentAccount = { ...real,id:"22222222-2222-4222-8222-222222222222",name:"Synthetic paper",mode:"paper" };
const usd: InvestmentAccount = { ...real,id:"33333333-3333-4333-8333-333333333333",name:"Synthetic USD",currency:"USD" };
const key = "44444444-4444-4444-8444-444444444444";
const trade = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({ id:"buy",account_id:real.id,sequence:1,kind:"buy",symbol:"TEST:ASSET",occurred_on:"2026-10-01",quantity:"10",price:"10",fees:"1",source:"Synthetic",import_key:key,created_at:now,...overrides });
const cash = (overrides: Partial<InvestmentCashEntry> = {}): InvestmentCashEntry => ({ id:"opening",account_id:real.id,sequence:1,kind:"opening",void_entry_id:null,symbol:null,occurred_on:"2026-10-01",amount:"1000",tax:"0",fees:"0",source:"Synthetic",import_key:key,created_at:now,...overrides });
const quote = (overrides: Partial<InvestmentQuote> = {}): InvestmentQuote => ({ id:"quote",account_id:real.id,sequence:2,symbol:"TEST:ASSET",currency:"CNY",price:"20",as_of:"2026-10-07T10:00:00Z",source_kind:"manual",source:"Synthetic",import_key:key,created_at:now,...overrides });
const derive = (ledger: LedgerEntry[] = [], entries: InvestmentCashEntry[] = [], quotes: InvestmentQuote[] = []) => deriveInvestmentDaily([real,paper,usd],ledger,entries,quotes,"real",now);

describe("investment daily fixed-point accounting", () => {
  it("accounts for buys, partial sells, fees, dividends, deposits and withdrawals exactly", () => {
    const [daily] = derive([trade(),trade({id:"sell",sequence:2,kind:"sell",occurred_on:"2026-10-02",quantity:"4",price:"20",fees:"2"})], [cash(),cash({id:"deposit",kind:"deposit",amount:"100"}),cash({id:"withdrawal",kind:"withdrawal",amount:"30"}),cash({id:"dividend",kind:"dividend",symbol:"TEST:ASSET",amount:"10",tax:"2",fees:"1"}),cash({id:"fee",kind:"fee",amount:"3"})],[quote()]);
    expect(daily).toMatchObject({cash:"1051",netDividends:"7",marketValue:"120",unrealizedPnl:"59.4",recordedAssets:"1171",missingQuotes:0,staleQuotes:0});
    expect(daily.holdings[0]).toMatchObject({quantity:"6",costBasis:"60.6",realizedPnl:"37.6",quoteState:"recorded"});
  });
  it("does not spend opening holding cost a second time", () => { expect(derive([trade({kind:"opening",fees:"20"})],[cash()],[quote()])[0].cash).toBe("1000"); });
  it("keeps missing cash opening and missing quote unknown rather than zero", () => {
    const [daily] = derive([trade()],[cash({kind:"deposit"})]);
    expect(daily).toMatchObject({cash:null,cashState:"missing_opening",marketValue:null,unrealizedPnl:null,recordedAssets:null,missingQuotes:1});
    expect(daily.holdings[0].quoteState).toBe("missing");
  });
  it("accepts an explicitly recorded zero cash balance and zero quote", () => { const [daily]=derive([trade({kind:"opening",price:null})],[cash({amount:"0"})],[quote({price:"0"})]); expect(daily).toMatchObject({cash:"0",marketValue:"0",unrealizedPnl:null,recordedAssets:"0"}); });
  it("keeps partial valuations out of account totals", () => { const [daily]=derive([trade(),trade({id:"second",symbol:"TEST:MISSING"})],[cash()],[quote()]); expect(daily.marketValue).toBeNull(); expect(daily.holdings[0].marketValue).toBe("200"); });
  it("labels older prices and never treats an imported quote as live", () => {
    const [daily]=derive([trade()],[cash()],[quote({as_of:"2026-10-04T11:59:59Z",source_kind:"imported"})]);
    expect(daily.staleQuotes).toBe(1);expect(daily.holdings[0]).toMatchObject({quoteState:"stale",marketValue:"200"});
  });
  it("selects the newest as-of, breaking corrections by sequence, not insertion order", () => {
    const [daily]=derive([trade()],[],[quote({price:"4",sequence:10,as_of:"2026-10-06T00:00:00Z"}),quote({price:"20",sequence:2}),quote({price:"22",sequence:3})]);
    expect(daily.marketValue).toBe("220");
  });
  it("strictly separates real/paper accounts and currencies even for identical symbols", () => {
    const daily=derive([trade(),trade({id:"paper",account_id:paper.id}),trade({id:"usd",account_id:usd.id})],[cash({account_id:paper.id})],[quote({account_id:paper.id}),quote({currency:"USD"}),quote({account_id:usd.id,currency:"USD",price:"3"})]);
    expect(daily).toHaveLength(2);expect(daily[0]).toMatchObject({cash:null,marketValue:null});expect(daily[1]).toMatchObject({marketValue:"30"});
    expect(deriveInvestmentDaily([real,paper], [trade(),trade({id:"paper",account_id:paper.id})], [cash({account_id:paper.id})], [quote({account_id:paper.id})],"paper",now)).toMatchObject([{account:{id:paper.id},cash:"899",marketValue:"200"}]);
  });
  it("respects voided trades and dividends without mutating history", () => {
    const trades=[trade(),trade({id:"sell",kind:"sell",quantity:"10",price:"30"}),trade({id:"void-sell",kind:"void",void_entry_id:"sell"})];
    const entries=[cash(),cash({id:"dividend",kind:"dividend",symbol:"TEST:ASSET",amount:"10"}),cash({id:"void-dividend",kind:"void",void_entry_id:"dividend",amount:"0"})];
    expect(derive(trades,entries,[quote()])[0]).toMatchObject({cash:"899",netDividends:"0",marketValue:"200"});expect(entries).toHaveLength(3);
  });
  it("requires a new cash anchor after voiding opening and flags newly backdated trades", () => {
    expect(derive([], [cash(),cash({id:"void",kind:"void",void_entry_id:"opening",amount:"0"})])[0].cashState).toBe("missing_opening");
    expect(derive([trade({occurred_on:"2026-09-30"})],[cash()])[0]).toMatchObject({cash:null,cashState:"invalid_opening",recordedAssets:null});
  });
  it("closed positions have known zero market value and do not require quotes", () => { expect(derive([trade(),trade({id:"sell",kind:"sell",quantity:"10",price:"20"})],[cash()])[0]).toMatchObject({cash:"1098",marketValue:"0",unrealizedPnl:"0",missingQuotes:0}); });
  it("keeps computed totals beyond the input digit limit exact", () => {
    const [daily] = derive([trade({quantity:"999999999999",price:"999999999999",fees:"0"})],[cash()],[quote({price:"999999999999"})]);
    expect(daily.marketValue).toBe("999999999998000000000001");
    expect(daily.unrealizedPnl).toBe("0");
    expect(daily.recordedAssets).toBe("1000");
  });
  it.each([
    ["600000000000", "1200000000000", "2400000000000", "1200000001000"],
    ["600000000000.00000001", "1200000000000.00000002", "2400000000000.00000004", "1200000001000.00000002"],
  ])("values accumulated quantities beyond 12 digits exactly (%s)", (quantity, accumulated, marketValue, recordedAssets) => {
    const [daily] = derive([
      trade({ id: "buy-first", sequence: 1, quantity, price: "1", fees: "0" }),
      trade({ id: "buy-second", sequence: 2, quantity, price: "1", fees: "0" }),
    ], [cash()], [quote({ price: "2" })]);
    expect(daily.holdings[0]).toMatchObject({ quantity: accumulated, costBasis: accumulated, quoteState: "recorded" });
    expect(daily).toMatchObject({ marketValue, unrealizedPnl: accumulated, recordedAssets, cashState: "known", missingQuotes: 0 });
  });
  it("retains sub-cent precision and rejects future prices and invalid voids", () => {
    expect(derive([trade({quantity:"0.00000001",price:"1",fees:"0"})],[cash({amount:"0"})],[quote({price:"2"})])[0]).toMatchObject({cash:"-0.00000001",marketValue:"0.00000002",unrealizedPnl:"0.00000001"});
    expect(()=>derive([trade()],[],[quote({as_of:"2099-01-01T00:00:00Z"})])).toThrow();
    expect(()=>derive([],[cash({kind:"void",void_entry_id:"foreign"})])).toThrow();
  });
});
describe("cash and quote validation", () => {
  const cashInput={account_id:real.id,kind:"dividend",symbol:"TEST:ASSET",occurred_on:"2026-01-01",amount:"10",tax:"2",fees:"1",source:"Synthetic",import_key:key,confirmed:true};
  const quoteInput={symbol:"TEST:ASSET",currency:"CNY",price:"0",as_of:"2026-01-01T00:00:00+08:00",source_kind:"manual",source:"Synthetic",import_key:key};
  it("validates net dividends, true dates, confirmation and decimal strings", () => {
    expect(investmentCashSchema.safeParse(cashInput).success).toBe(true);
    for(const overrides of [{tax:"11"},{confirmed:false},{occurred_on:"2026-02-30"},{occurred_on:"2099-01-01"},{kind:"deposit"},{amount:"-1"}]) expect(investmentCashSchema.safeParse({...cashInput,...overrides}).success).toBe(false);
  });
  it("requires actual as-of with timezone and source, preserves true zero, rejects future or missing quotes", () => {
    expect(investmentQuoteSchema.safeParse(quoteInput).success).toBe(true);
    for(const overrides of [{as_of:"2026-01-01T00:00:00"},{as_of:"2099-01-01T00:00:00Z"},{source:""},{price:""},{price:20},{currency:"EUR"}]) expect(investmentQuoteSchema.safeParse({...quoteInput,...overrides}).success).toBe(false);
  });
  it("requires versioned bounded imports and unique keys", () => {
    const {source_kind:_source,...row}=quoteInput;void _source;
    expect(investmentQuoteImportSchema.safeParse({schema_version:1,quotes:[row]}).success).toBe(true);
    for(const quotes of [[],[row,row],Array(101).fill(row)]) expect(investmentQuoteImportSchema.safeParse({schema_version:1,quotes}).success).toBe(false);
  });
});

describe("complete daily snapshot", () => {
  const daily={cashEntries:[cash({sequence:2})],quotes:[quote({sequence:3})],unavailable:false,checkedAt:now};
  it("requires a contiguous shared revision across trades, cash and quotes",()=>{
    expect(hasCompleteInvestmentDailySnapshot([{...real,revision:3}],[trade()],daily)).toBe(true);
    expect(hasCompleteInvestmentDailySnapshot([{...real,revision:2}],[trade()],daily)).toBe(false);
    expect(hasCompleteInvestmentDailySnapshot([{...real,revision:4}],[trade()],daily)).toBe(false);
    expect(hasCompleteInvestmentDailySnapshot([{...real,revision:3}],[trade()],{...daily,quotes:[quote({sequence:2})]})).toBe(false);
    expect(hasCompleteInvestmentDailySnapshot([{...real,revision:0}],[],{...daily,cashEntries:[],quotes:[]})).toBe(true);
  });
});
