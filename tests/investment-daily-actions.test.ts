import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner:vi.fn(),from:vi.fn(),rpc:vi.fn(),revalidate:vi.fn(),calls:[] as unknown[][],results:{} as Record<string,unknown> }));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:mocks.owner}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { addInvestmentCash, saveInvestmentQuotes, voidInvestmentCash } from "@/features/investment/daily-actions";
import { getInvestmentLinkedRecord } from "@/features/investment/linked-record";
import { getInvestmentDailyData } from "@/features/investment/daily-queries";
const ownerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",accountId="11111111-1111-4111-8111-111111111111",key="22222222-2222-4222-8222-222222222222";
const form=(values:Record<string,string | undefined>)=>{ const result=new FormData();Object.entries(values).forEach(([key,value])=>value !== undefined && result.set(key,value));return result; };
const cash={account_id:accountId,kind:"opening",occurred_on:"2026-01-01",amount:"0",source:"Synthetic",import_key:key,confirmed:"on"};
const quote={account_id:accountId,symbol:"TEST:ASSET",currency:"CNY",price:"12",as_of:"2026-01-01T00:00:00Z",source:"Synthetic",import_key:key,confirmed:"on"};
beforeEach(()=>{
  vi.clearAllMocks();mocks.calls.length=0;mocks.results={};mocks.owner.mockResolvedValue({userId:ownerId,supabase:{from:mocks.from,rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{duplicate:false},error:null});
  mocks.from.mockImplementation((table:string)=>{const builder:Record<string,unknown>={};for(const method of ["select","eq","order","limit","is","maybeSingle"]) builder[method]=(...args:unknown[])=>{mocks.calls.push([table,method,...args]);return builder;};builder.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(mocks.results[table]??{data:[],count:0,error:null}).then(resolve);return builder;});
});
describe("daily owner-scoped actions",()=>{
  it("requires confirmed cash records and ignores browser ownership",async()=>{
    expect((await addInvestmentCash(form({...cash,confirmed:""}))).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await addInvestmentCash(form({...cash,user_id:"attacker"}))).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("append_investment_cash",{p_account_id:accountId,p_entry:{kind:"opening",symbol:null,occurred_on:"2026-01-01",amount:"0",tax:"0",fees:"0",source:"Synthetic",import_key:key,void_entry_id:null}});
  });
  it("requires confirmed cash corrections and preserves the reference",async()=>{const entry={account_id:accountId,entry_id:key,source:"Mistyped",import_key:key,confirmed:"on"};expect((await voidInvestmentCash(form({...entry,confirmed:""}))).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();expect((await voidInvestmentCash(form(entry))).ok).toBe(true);expect(mocks.rpc).toHaveBeenCalledWith("append_investment_cash",expect.objectContaining({p_entry:expect.objectContaining({kind:"void",void_entry_id:key,amount:"0"})}));});
  it("retains exact prices and source/as-of; labels manual and imported paths honestly",async()=>{
    await saveInvestmentQuotes(form(quote));expect(mocks.rpc).toHaveBeenLastCalledWith("append_investment_quotes",{p_account_id:accountId,p_quotes:[{symbol:"TEST:ASSET",currency:"CNY",price:"12",as_of:"2026-01-01T00:00:00Z",source:"Synthetic",source_kind:"manual",import_key:key}]});
    await saveInvestmentQuotes(form({...quote,as_of:"2026-01-01T00:00"}));expect(mocks.rpc).toHaveBeenLastCalledWith("append_investment_quotes",expect.objectContaining({p_quotes:[expect.objectContaining({as_of:"2026-01-01T00:00:00Z"})]}));
    const {account_id:_account,confirmed:_confirmed,...row}=quote;void _account;void _confirmed;
    await saveInvestmentQuotes(form({account_id:accountId,confirmed:"on",payload:JSON.stringify({schema_version:1,quotes:[row]})}));expect(mocks.rpc).toHaveBeenLastCalledWith("append_investment_quotes",expect.objectContaining({p_quotes:[expect.objectContaining({source_kind:"imported"})]}));
  });
  it("refuses unconfirmed, invalid, oversized and future quote imports without writes",async()=>{for(const overrides of [{confirmed:""},{price:""},{as_of:"2099-01-01T00:00:00Z"},{payload:"{"},{payload:"x".repeat(180001)}]) expect((await saveInvestmentQuotes(form({...quote,...overrides}))).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("reports duplicates and storage conflicts without claiming saves",async()=>{mocks.rpc.mockResolvedValueOnce({data:{duplicate:true},error:null});expect(await addInvestmentCash(form(cash))).toMatchObject({ok:true,duplicate:true});mocks.revalidate.mockClear();mocks.rpc.mockResolvedValue({data:null,error:{code:"23505"}});expect((await saveInvestmentQuotes(form(quote))).ok).toBe(false);expect(mocks.revalidate).not.toHaveBeenCalled();});
  it("preserves authentication redirects",async()=>{mocks.owner.mockRejectedValue(new Error("NEXT_REDIRECT"));await expect(saveInvestmentQuotes(form(quote))).rejects.toThrow("NEXT_REDIRECT");});
});
describe("daily read completeness",()=>{
  it("scopes both tables to the session owner",async()=>{expect((await getInvestmentDailyData()).unavailable).toBe(false);for(const table of ["investment_cash_ledger","investment_quotes"]) expect(mocks.calls).toContainEqual([table,"eq","user_id",ownerId]);});
  it("does not value from truncated, uncounteable or unavailable data",async()=>{for(const result of [{data:[],error:{code:"42P01"},count:0},{data:[],error:null,count:null},{data:[{}],error:null,count:2},{data:Array(5001).fill({}),error:null,count:5001}]) {mocks.results.investment_quotes=result;expect(await getInvestmentDailyData()).toMatchObject({cashEntries:[],quotes:[],unavailable:true});}});
});

describe("investment linked records",()=>{
  it("loads only the session owner's unarchived linked strategy beyond the recent window",async()=>{
    const row={id:key,strategy_key:"test",title:"Synthetic",version:1,body_markdown:"Original",created_at:"2026-01-01T00:00:00Z"};mocks.results.investment_strategy_versions={data:row,error:null};
    expect(await getInvestmentLinkedRecord("strategies",key)).toEqual({strategy:row});
    expect(mocks.calls).toContainEqual(["investment_strategy_versions","eq","id",key]);expect(mocks.calls).toContainEqual(["investment_strategy_versions","eq","user_id",ownerId]);expect(mocks.calls).toContainEqual(["investment_strategy_versions","is","archived_at",null]);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never substitutes an inaccessible or malformed result and does not read account links",async()=>{
    mocks.results.investment_research_runs={data:null,error:null};expect(await getInvestmentLinkedRecord("research",key)).toEqual({});
    mocks.results.investment_research_runs={data:{title:"Invalid",provenance:{producer:{bad:true}}},error:null};expect(await getInvestmentLinkedRecord("research",key)).toEqual({});
    mocks.from.mockClear();expect(await getInvestmentLinkedRecord("holdings",key)).toEqual({});expect(mocks.from).not.toHaveBeenCalled();
  });
});
