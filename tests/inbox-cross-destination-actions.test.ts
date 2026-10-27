import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const owner="e1000000-0000-4000-8000-000000000001",inbox="e2000000-0000-4000-8000-000000000001",note="e3000000-0000-4000-8000-000000000001";
const state=vi.hoisted(()=>({ops:[] as Array<Record<string,unknown>>,localNote:false,taskClaim:false,dailyAppends:0,dispatch:vi.fn(),mark:vi.fn(),reconcile:vi.fn()}));
vi.mock("@/lib/workspace-revalidation",()=>({revalidatePath:vi.fn()}));
vi.mock("@/features/links/service",()=>({syncEntityReferenceLinks:vi.fn(async()=>({ok:true}))}));
vi.mock("@/features/inbox/classify",()=>({classifyInboxItem:vi.fn()}));
vi.mock("@/features/notes/daily-note-service",()=>({getOrCreateDailyNote:vi.fn(async()=>({id:"e3000000-0000-4000-8000-000000000001",revision:1,date:"2026-10-27"}))}));
vi.mock("@/features/inbox/service",()=>({markInboxProcessed:(...args:unknown[])=>state.mark(...args)}));
vi.mock("@/features/workbench/operation-provider",()=>({operationRequestHash:(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex"),runCalendarMetadataOperation:vi.fn()}));
vi.mock("@/lib/adapters/microsoft-graph/calendar",()=>({
 executeCalendarOperation:(...args:unknown[])=>state.dispatch(...args),reconcileCalendarOperation:(...args:unknown[])=>state.reconcile(...args),readMicrosoftTodoMutationSnapshot:vi.fn(),readCalendarMutationSnapshot:vi.fn(),
 accessTokenForConnection:vi.fn(),ensureManagedOutlookCategories:vi.fn(),syncOutlookMasterCategories:vi.fn(),updateOutlookMasterCategoryColor:vi.fn(),MicrosoftGraphError:class extends Error{},
}));
function query(table:string){
 let filters:Record<string,unknown>={},patch:Record<string,unknown>|null=null;
 const execute=()=>{
  if(table==="calendar_connections")return {data:{id:"e4000000-0000-4000-8000-000000000001",status:"enabled",oauth_scope_version:1},error:null};
  if(table==="profiles")return {data:{timezone:"Asia/Shanghai"},error:null};
  if(table==="inbox_items")return {data:{id:inbox,content_markdown:"Preserved input",converted_task_id:null,converted_todo_task_id:null,converted_note_id:state.localNote?note:null},error:null};
  if(table==="audit_logs")return {data:null,error:null};
  const row=state.ops.find(row=>Object.entries(filters).every(([key,value])=>row[key]===value));
  if(patch&&row)Object.assign(row,patch);
  return {data:row?{...row}:null,error:null};
 };
 const chain={select(){return chain;},is(){return chain;},eq(key:string,value:unknown){filters={...filters,[key]:value};return chain;},insert(){return chain;},update(value:Record<string,unknown>){patch=value;return chain;},maybeSingle:async()=>execute(),then(resolve:(value:ReturnType<typeof execute>)=>unknown){return Promise.resolve(execute()).then(resolve);}};
 return chain;
}
async function rpc(name:string,input:Record<string,unknown>){
 if(name==="prepare_inbox_calendar_creation"){
  if(state.taskClaim||state.localNote)return {data:null,error:{code:"40001"}};
  const old=state.ops[0];
  if(old&&old.request_hash!==input.p_request_hash)return {data:null,error:{code:"40001"}};
  if(!old)state.ops.push({id:inbox,user_id:owner,request_id:inbox,request_hash:input.p_request_hash,status:"pending_confirmation",payload:input.p_payload});
  return {data:inbox,error:null};
 }
 if(name==="convert_inbox_note"||name==="convert_inbox_daily"){
  if(state.taskClaim||state.ops.some(row=>row.status!=="cancelled"))return {data:null,error:{code:"40001"}};
  state.localNote=true;
  if(name==="convert_inbox_daily"){state.dailyAppends++;return {data:{noteId:note,date:"2026-10-27"},error:null};}
  return {data:note,error:null};
 }
 return {data:null,error:null};
}
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:async()=>({userId:owner,supabase:{from:query,rpc}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:query,rpc})}));
import { createCalendarEvent } from "@/features/calendar/actions";
import { convertInboxToDailyNote,convertInboxToNote } from "@/features/inbox/actions";
function calendar(title="Synthetic event"){
 const form=new FormData();form.set("request_id",crypto.randomUUID());form.set("inbox_id",inbox);form.set("subject",title);form.set("starts_at","2026-10-27T01:00:00Z");form.set("ends_at","2026-10-27T02:00:00Z");return form;
}
function local(){const form=new FormData();form.set("inbox_id",inbox);form.set("title","Synthetic note");form.set("body_markdown","Preserved input");return form;}
const initial={status:"idle" as const,message:""};
beforeEach(()=>{state.ops=[];state.localNote=false;state.taskClaim=false;state.dailyAppends=0;state.mark.mockReset().mockResolvedValue(true);state.reconcile.mockReset();state.dispatch.mockReset().mockImplementation(async()=>{state.ops[0].status="succeeded";});});
describe("Inbox actions respect database claim outcomes",()=>{
 it("does not dispatch Calendar after a Note commit or an existing task claim",async()=>{
  expect((await convertInboxToNote(initial,local())).status).toBe("success");
  expect((await createCalendarEvent(initial,calendar())).status).toBe("error");expect(state.dispatch).not.toHaveBeenCalled();
  state.localNote=false;state.taskClaim=true;
  expect((await createCalendarEvent(initial,calendar())).status).toBe("error");expect((await convertInboxToNote(initial,local())).status).toBe("error");expect(state.dispatch).not.toHaveBeenCalled();
 });
 it("keeps Daily untouched while a Calendar dispatch owns the source",async()=>{
  let finish!:()=>void;state.dispatch.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{state.ops[0].status="succeeded";resolve();};}));
  const pending=createCalendarEvent(initial,calendar());await vi.waitFor(()=>expect(state.dispatch).toHaveBeenCalledOnce());
  expect((await convertInboxToDailyNote(initial,local())).status).toBe("error");expect(state.dailyAppends).toBe(0);expect(state.localNote).toBe(false);
  finish();expect((await pending).status).toBe("success");
 });
 it("uses one Inbox request even with two browser IDs and refuses a changed payload",async()=>{
  expect((await createCalendarEvent(initial,calendar())).status).toBe("success");
  expect((await createCalendarEvent(initial,calendar())).status).toBe("success");
  expect((await createCalendarEvent(initial,calendar("Changed event"))).status).toBe("error");
  expect(state.dispatch).toHaveBeenCalledOnce();expect(state.ops).toHaveLength(1);expect(state.ops[0].request_id).toBe(inbox);
 });
 it("does not advance the source or resend after an unknown result with a fresh ID",async()=>{
  state.dispatch.mockImplementation(async()=>{state.ops[0].status="reconciliation_required";throw new Error("lost response");});state.reconcile.mockRejectedValue(new Error("unknown"));
  expect((await createCalendarEvent(initial,calendar())).status).toBe("error");
  expect((await createCalendarEvent(initial,calendar())).status).toBe("error");
  expect(state.dispatch).toHaveBeenCalledOnce();expect(state.mark).not.toHaveBeenCalled();expect(state.localNote).toBe(false);
 });
 it("reports source finish failure and retries only source bookkeeping",async()=>{
  state.mark.mockResolvedValueOnce(false).mockResolvedValue(true);
  expect((await createCalendarEvent(initial,calendar())).status).toBe("error");
  expect((await createCalendarEvent(initial,calendar())).status).toBe("success");expect(state.dispatch).toHaveBeenCalledOnce();
 });
});
