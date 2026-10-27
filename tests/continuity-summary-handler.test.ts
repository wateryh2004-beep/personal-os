import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), rows: {} as Record<string, Record<string, unknown>[]>, failed: new Set<string>(), calls: [] as Array<{table:string;columns:string;filters:Array<[string,string,unknown]>;limit:number}> }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mocks.require, apiAuthenticationFailure: (error: unknown) => error instanceof Error && error.message === "auth" ? Response.json({ error: "auth" }, { status: 401 }) : null }));
import { GET } from "@/app/api/workflow-continuity/summary/route";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", run = "33333333-3333-4333-8333-333333333333";
const now = new Date().toISOString();
function owner(userId = a) {
  return { userId, supabase: { from: (table: string) => {
    const call = { table, columns: "", filters: [] as Array<[string,string,unknown]>, limit: 100 }; mocks.calls.push(call);
    const query = { select(columns: string) { call.columns = columns; return query; }, eq(key:string,value:unknown) { call.filters.push(["eq",key,value]); return query; }, gte(key:string,value:unknown) { call.filters.push(["gte",key,value]); return query; }, is(key:string,value:unknown) { call.filters.push(["eq",key,value]); return query; }, in(key:string,value:unknown) { call.filters.push(["in",key,value]); return query; }, order() { return query; }, limit(limit:number) { call.limit=limit;return query; }, then(resolve:(value:unknown)=>unknown) {
      const rows = (mocks.rows[table] ?? []).filter(row => call.filters.every(([op,key,value]) => op === "eq" ? (row[key] ?? null) === value : op === "gte" ? String(row[key]) >= String(value) : (value as unknown[]).includes(row[key]))).slice(0,call.limit).map(row => Object.fromEntries(call.columns.split(",").map(key => [key,row[key]])));
      return Promise.resolve({ data: rows, error: mocks.failed.has(table) ? { message: "unavailable" } : null }).then(resolve);
    } }; return query;
  }, rpc: vi.fn(() => { throw new Error("metadata must never mutate"); }) } };
}
beforeEach(() => { mocks.calls=[]; mocks.rows={}; mocks.failed.clear(); mocks.require.mockReset(); mocks.require.mockResolvedValue(owner()); });
it("returns narrow private metadata, enforces every owner filter, and does not claim persisted running work is live", async () => {
  mocks.rows.agent_runs = [{ id: run,user_id:a,surface:"tasks",status:"running",current_entity_type:null,current_entity_id:null,updated_at:now,completed_at:null,user_request:"PRIVATE_BODY",kernel_state:{secret:"PRIVATE_KERNEL"} }, { id:b,user_id:b,surface:"global",status:"completed",updated_at:now }];
  mocks.rows.agent_actions = [{ id:a,user_id:a,run_id:run,status:"proposed",updated_at:now,expires_at:null,payload_json:{secret:"PRIVATE_PAYLOAD"},preview_json:{title:"PRIVATE_TITLE"},result_json:{secret:"PRIVATE_RESULT"} }];
  const response=await GET(), json=await response.json(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("private, no-store");expect(response.headers.get("vary")).toBe("Cookie");
  expect(json.entries).toHaveLength(2);expect(json.entries[0].status).toBe("needs-check");expect(JSON.stringify(json)).not.toContain("PRIVATE_");
  for(const call of mocks.calls) { expect(call.filters).toContainEqual(["eq","user_id",a]);expect(call.columns).not.toMatch(/user_request|kernel|payload|preview|result_json|content_|filename|storage_path|upload_id|token/); }
  expect(mocks.calls.find(call=>call.table==="agent_actions")?.filters).toContainEqual(["in","run_id",[run]]);
  mocks.require.mockResolvedValue(owner(b)); const other=await (await GET()).json();expect(other.entries.some((entry:{sourceId:string})=>entry.sourceId===run)).toBe(false);
});
it("reports independent unavailable coverage and explicit truncation without converting an error to zero checked", async()=>{
  mocks.rows.agent_runs=Array.from({length:22},(_,index)=>({id:`33333333-3333-4333-8333-${String(index).padStart(12,"0")}`,user_id:a,surface:"tasks",status:"completed",current_entity_type:null,current_entity_id:null,updated_at:now}));mocks.failed.add("inbox_items");
  const json=await (await GET()).json();expect(json.partial).toBe(true);expect(json.truncated).toBe(true);expect(json.coverage.find((entry:{kind:string})=>entry.kind==="agent-runs")).toMatchObject({checked:true,count:20,truncated:true});expect(json.coverage.find((entry:{kind:string})=>entry.kind==="inbox")).toMatchObject({checked:false,error:"unavailable"});
});
it("hides Vault and archived document parents and returns no-store on authentication failure",async()=>{
  mocks.rows.document_ocr_jobs=[{document_id:run,user_id:a,status:"running",updated_at:now}];mocks.rows.documents=[{id:run,user_id:a,vault_group_id:b,archived_at:null,storage_state:"available",updated_at:now}];
  expect((await (await GET()).json()).entries).toEqual([]);
  mocks.require.mockRejectedValue(new Error("auth"));const response=await GET();expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");
});
it("does not read agent actions if visible run discovery fails",async()=>{mocks.failed.add("agent_runs");const json=await (await GET()).json();expect(mocks.calls.some(call=>call.table==="agent_actions")).toBe(false);expect(json.coverage.find((entry:{kind:string})=>entry.kind==="agent-actions")).toMatchObject({checked:false,error:"dependency-unavailable"});});
