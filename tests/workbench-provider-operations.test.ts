import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], reads: vi.fn(), patches: vi.fn(), seq: 0, failFinish: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: vi.fn(async () => ({ userId: "owner", supabase: {} })) }));
vi.mock("@/lib/adapters/microsoft-graph/calendar", () => ({
 readMicrosoftTodoMutationSnapshot: (...args:unknown[]) => state.reads(...args),
 patchMicrosoftTodoMetadata: (...args:unknown[]) => state.patches(...args),
 sameTodoMutationSnapshot: (a:Record<string,unknown>,b:Record<string,unknown>) => a.id===b.id&&a.etag===b.etag&&a.title===b.title&&a.status===b.status,
 readCalendarMutationSnapshot: vi.fn(), sameCalendarMutationSnapshot: vi.fn(), executeCalendarOperation: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
 from(table:string) {
  const filters: [string,unknown][]=[];let patch:Record<string,unknown>|null=null;
  const matches=(row:Record<string,unknown>)=>filters.every(([key,value])=>row[key]===value);
  const rows=()=>table==="calendar_connections"?[{id:"connection",user_id:"owner",status:"enabled"}]:state.rows;
  const execute=()=>{const values=rows().filter(matches);if(patch)for(const row of values)Object.assign(row,patch);return values;};
  const chain={
   select(){return chain;},eq(key:string,value:unknown){filters.push([key,value]);return chain;},is(){return chain;},
   update(value:Record<string,unknown>){patch=value;return chain;},
   upsert(value:Record<string,unknown>){if(!state.rows.some(row=>row.user_id===value.user_id&&row.request_id===value.request_id))state.rows.push({...value,id:`receipt-${++state.seq}`,expires_at:"2099-01-01T00:00:00Z"});return chain;},
   async single(){return {data:execute()[0]??null,error:null};},async maybeSingle(){return {data:execute()[0]??null,error:null};},
   then(resolve:(value:{data:Record<string,unknown>[];error:null})=>unknown){return Promise.resolve(resolve({data:execute(),error:null}));},
  };return chain;
 },
 async rpc(_name:string,input:Record<string,unknown>){if(state.failFinish)return {error:{message:"db_failed"}};const row=state.rows.find(row=>row.id===input.p_receipt_id&&row.user_id===input.p_owner);if(row)Object.assign(row,{after_data:input.p_after,status:input.p_status});return {error:null};},
 }) }));
import { runTodoMetadataOperation, undoProviderReceipt } from "@/features/workbench/operation-provider";
const taskId="10000000-0000-4000-8000-000000000001";
const before={id:taskId,title:"fixture",importance:"normal" as const,dueAt:null,status:"inProgress" as const,completedAt:null,lastModifiedAt:"2026-10-25T01:00:00Z",etag:'W/"before"'};
const after={...before,status:"completed" as const,completedAt:"2026-10-25T02:00:00Z",lastModifiedAt:"2026-10-25T02:00:00Z",etag:'W/"after"'};
const input={userId:"owner",requestId:"20000000-0000-4000-8000-000000000001",taskId,patch:{status:"completed" as const},operation:"tasks_complete" as const};
beforeEach(()=>{state.rows=[];state.seq=0;state.failFinish=false;state.reads.mockReset();state.patches.mockReset();state.reads.mockResolvedValue(before);state.patches.mockResolvedValue({after,cacheSaved:true});});
describe("provider operation receipts with isolated transport fixtures",()=>{
 it("dispatches one logical operation once and does not install frozen rows on replay",async()=>{
  const first=await runTodoMetadataOperation(input);const second=await runTodoMetadataOperation(input);
  expect(first.status).toBe("success");expect(second.receiptId).toBe(first.receiptId);expect(second.rows).toBeUndefined();expect(state.patches).toHaveBeenCalledTimes(1);
 });
 it("does not resend an unknown write after a lost provider response",async()=>{
  state.patches.mockRejectedValue(new Error("graph_unavailable"));
  expect((await runTodoMetadataOperation(input)).status).toBe("unknown");expect((await runTodoMetadataOperation(input)).status).toBe("unknown");expect(state.patches).toHaveBeenCalledTimes(1);
 });
 it("refuses an observed external change before dispatch",async()=>{
  const result=await runTodoMetadataOperation({...input,expected:{status:"notStarted",title:before.title,lastModifiedAt:before.lastModifiedAt}});
  expect(result.status).toBe("conflict");expect(state.patches).not.toHaveBeenCalled();
 });
 it("never offers a receipt when the remote write succeeded but receipt finalization failed",async()=>{
  state.failFinish=true;const result=await runTodoMetadataOperation(input);expect(result.status).toBe("unknown");expect(result.receiptId).toBeUndefined();expect(state.patches).toHaveBeenCalledTimes(1);
 });
 it("restores the exact original status and completion metadata, and duplicate undo is inert",async()=>{
  const first=await runTodoMetadataOperation(input);state.reads.mockResolvedValue(after);state.patches.mockResolvedValue({after:{...before,etag:'W/"undo"'},cacheSaved:true});
  expect((await undoProviderReceipt(first.receiptId!,"owner")).status).toBe("success");
  expect(state.patches.mock.calls[1][4]).toEqual({status:"inProgress",completedAt:null});
  await undoProviderReceipt(first.receiptId!,"owner");expect(state.patches).toHaveBeenCalledTimes(2);
 });
 it("compensates only intended fields even if the response includes another field change",async()=>{
  const concurrentAfter={...after,title:"changed elsewhere"};state.patches.mockResolvedValue({after:concurrentAfter,cacheSaved:true});
  const first=await runTodoMetadataOperation(input);state.reads.mockResolvedValue(concurrentAfter);state.patches.mockResolvedValue({after:{...concurrentAfter,status:"inProgress",completedAt:null},cacheSaved:true});
  expect((await undoProviderReceipt(first.receiptId!,"owner")).status).toBe("success");
  expect(state.patches.mock.calls[1][4]).toEqual({status:"inProgress",completedAt:null});
 });
 it("rejects a later provider version and another owner's receipt",async()=>{
  const first=await runTodoMetadataOperation(input);state.reads.mockResolvedValue({...after,etag:'W/"later"'});
  expect((await undoProviderReceipt(first.receiptId!,"owner")).status).toBe("conflict");expect(state.patches).toHaveBeenCalledTimes(1);
  expect((await undoProviderReceipt(first.receiptId!,"other-owner")).status).toBe("error");
 });
});
