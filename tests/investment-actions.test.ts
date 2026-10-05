import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), from: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), calls: [] as unknown[][], results: {} as Record<string, unknown> }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { addInvestmentEntry, createInvestmentAccount, importInvestmentResearch, saveInvestmentStrategy, voidInvestmentEntry } from "@/features/investment/actions";
import { getInvestmentWorkspace } from "@/features/investment/queries";
import { RESEARCH_IMPORT_EXAMPLE } from "@/features/investment/schemas";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string,string>) { const result = new FormData(); Object.entries(values).forEach(([key,value]) => result.set(key,value)); return result; }
const event = { account_id:accountId,kind:"opening",symbol:"XSHG:TEST",occurred_on:"2026-01-01",quantity:"1",price:"",fees:"0",source:"unit-test fixture",import_key:"22222222-2222-4222-8222-222222222222",confirmed:"on" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.calls.length = 0; mocks.results = {};
  mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from:mocks.from,rpc:mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data:{duplicate:false},error:null });
  mocks.from.mockImplementation((table:string) => { const builder: Record<string,unknown> = {}; for (const method of ["select","eq","is","order","limit","insert","single"]) builder[method] = (...args:unknown[]) => { mocks.calls.push([table,method,...args]); return builder; }; builder.then = (resolve:(value:unknown)=>unknown) => Promise.resolve(mocks.results[table] ?? {data:[],error:null,count:0}).then(resolve); return builder; });
});
describe("investment authenticated actions", () => {
  it("gets ownership from the session and ignores browser owner IDs", async () => { const result = await createInvestmentAccount(form({name:"Test",mode:"real",currency:"CNY",user_id:"attacker"})); expect(result.ok).toBe(true); expect(mocks.calls).toContainEqual(["investment_accounts","insert",{name:"Test",mode:"real",currency:"CNY",user_id:ownerId}]); });
  it("requires confirmation before posting a ledger record", async () => { expect((await addInvestmentEntry(form({...event,confirmed:""}))).ok).toBe(false); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("refuses missing/foreign account and does not write", async () => { mocks.results.investment_accounts={data:null,error:{code:"PGRST116"}}; expect((await addInvestmentEntry(form(event))).ok).toBe(false); expect(mocks.calls).toContainEqual(["investment_accounts","eq","user_id",ownerId]); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("passes session-selected revision to atomic append", async () => { mocks.results.investment_accounts={data:{id:accountId,name:"Test",mode:"real",currency:"CNY",revision:7},error:null}; expect((await addInvestmentEntry(form(event))).ok).toBe(true); expect(mocks.rpc).toHaveBeenCalledWith("append_investment_entry",expect.objectContaining({p_account_id:accountId,p_expected_revision:7,p_entry:expect.objectContaining({price:null,source:"unit-test fixture"})})); });
  it("surfaces concurrent edit without pretending to have saved", async () => { mocks.results.investment_accounts={data:{id:accountId,name:"Test",mode:"real",currency:"CNY",revision:7},error:null}; mocks.rpc.mockResolvedValue({data:null,error:{code:"40001"}}); const result=await addInvestmentEntry(form(event)); expect(result.ok).toBe(false); expect(result.error).toContain("刷新"); expect(mocks.revalidate).not.toHaveBeenCalled(); });
  it("reports exact retry as duplicate but conflicts as errors", async () => { mocks.rpc.mockResolvedValue({data:{duplicate:true},error:null}); expect(await importInvestmentResearch(form({payload:RESEARCH_IMPORT_EXAMPLE}))).toMatchObject({ok:true,duplicate:true}); mocks.rpc.mockResolvedValue({data:null,error:{code:"23505"}}); expect((await importInvestmentResearch(form({payload:RESEARCH_IMPORT_EXAMPLE}))).ok).toBe(false); });
  it("appends strategy versions and never updates old versions", async () => { await saveInvestmentStrategy(form({strategy_key:"test-v1",title:"Test",body_markdown:"Conditions and limitations"})); expect(mocks.rpc).toHaveBeenCalledWith("append_investment_strategy",{p_strategy:{strategy_key:"test-v1",title:"Test",body_markdown:"Conditions and limitations"}}); expect(mocks.from).not.toHaveBeenCalled(); });
  it("requires explicit correction confirmation before reading or writing", async () => { const result=await voidInvestmentEntry(form({entry_id:accountId,reason:"mistyped",import_key:event.import_key})); expect(result.ok).toBe(false); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("keeps the correction target owner-scoped and rejects missing records", async () => { mocks.results.investment_ledger={data:null,error:{code:"PGRST116"}}; const result=await voidInvestmentEntry(form({entry_id:accountId,reason:"mistyped",import_key:event.import_key,confirmed:"on"})); expect(result.ok).toBe(false); expect(mocks.calls).toContainEqual(["investment_ledger","eq","user_id",ownerId]); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("preserves authentication redirects", async () => { mocks.owner.mockRejectedValue(new Error("NEXT_REDIRECT")); await expect(createInvestmentAccount(form({}))).rejects.toThrow("NEXT_REDIRECT"); });
});
describe("investment read isolation", () => {
  it("scopes every query to the verified owner", async () => { expect((await getInvestmentWorkspace()).unavailable).toBe(false); for (const table of ["investment_accounts","investment_ledger","investment_strategy_versions","investment_research_runs"]) expect(mocks.calls).toContainEqual([table,"eq","user_id",ownerId]); });
  it("does not turn missing storage into empty portfolio data", async () => { mocks.results.investment_ledger={data:null,error:{code:"42P01"}}; expect(await getInvestmentWorkspace()).toEqual({accounts:[],entries:[],strategies:[],research:[],unavailable:true}); });
  it("fails closed on malformed nested research data from an older schema", async () => { mocks.results.investment_research_runs={data:[{...JSON.parse(RESEARCH_IMPORT_EXAMPLE),provenance:{producer:{untrusted:true},limitations:"test"}}],error:null}; expect((await getInvestmentWorkspace()).unavailable).toBe(true); });
  it("detects a lower PostgREST server row cap instead of trusting requested limits", async () => { mocks.results.investment_ledger={data:Array(1000).fill({}),count:1500,error:null}; expect((await getInvestmentWorkspace()).unavailable).toBe(true); });
  it("rejects truncated ledger rather than calculating partial holdings", async () => { mocks.results.investment_ledger={data:Array(5001).fill({}),error:null}; expect((await getInvestmentWorkspace()).unavailable).toBe(true); });
});
