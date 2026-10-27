import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({rows:[] as Array<Record<string,unknown>>,create:vi.fn(),mark:vi.fn(),audits:0,otherDestination:false}));
const owner="11111111-1111-4111-8111-111111111111",inbox="22222222-2222-4222-8222-222222222222",list="33333333-3333-4333-8333-333333333333",task="44444444-4444-4444-8444-444444444444";
vi.mock("@/lib/workspace-revalidation",()=>({revalidatePath:vi.fn()}));
vi.mock("@/features/tasks/repository",()=>({microsoftTodoRepository:{create:state.create}}));
vi.mock("@/lib/adapters/microsoft-graph/todo",()=>({syncMicrosoftTodo:vi.fn()}));
vi.mock("@/features/links/service",()=>({syncEntityReferenceLinks:vi.fn(async()=>({ok:true}))}));
vi.mock("@/features/inbox/service",()=>({markInboxProcessed:state.mark}));
vi.mock("@/features/workbench/operation-provider",()=>({runTodoMetadataOperation:vi.fn()}));
function query(){
 let kind="read",values:Record<string,unknown>={},filters:Record<string,unknown>={};
 const execute=()=>{
  if(kind==="upsert"){
   if(!state.rows.some(row=>row.user_id===values.user_id&&row.request_id===values.request_id))state.rows.push({id:crypto.randomUUID(),status:"prepared",task_id:null,...values});
   return {data:null,error:null};
  }
  const row=state.rows.find(row=>Object.entries(filters).every(([key,value])=>row[key]===value));
  if(kind==="update"&&row)Object.assign(row,values);
  return {data:row?{...row}:null,error:null};
 };
 const chain={upsert(value:Record<string,unknown>){kind="upsert";values=value;return chain;},update(value:Record<string,unknown>){kind="update";values=value;return chain;},select(){return chain;},eq(key:string,value:unknown){filters={...filters,[key]:value};return chain;},single:async()=>execute(),maybeSingle:async()=>execute(),then(resolve:(value:ReturnType<typeof execute>)=>unknown,reject:(error:unknown)=>unknown){return Promise.resolve(execute()).then(resolve,reject);}};
 return chain;
}
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>query(),rpc:async(name:string,input:Record<string,unknown>)=>{
 if(name==="prepare_inbox_todo_creation"){
  if(state.otherDestination)return {data:null,error:{code:"40001"}};
  let row=state.rows.find(row=>row.user_id===input.p_owner&&row.inbox_id===input.p_inbox_id);
  if(!row){row={id:crypto.randomUUID(),user_id:input.p_owner,inbox_id:input.p_inbox_id,request_id:input.p_inbox_id,request_hash:input.p_request_hash,status:"prepared",task_id:null};state.rows.push(row);}
  else if(["rejected","cancelled"].includes(String(row.status))){state.audits++;Object.assign(row,{status:"prepared",request_hash:input.p_request_hash});}
  else if(row.request_hash!==input.p_request_hash)return {data:null,error:{code:"40001"}};
  return {data:{...row},error:null};
 }
 const row=state.rows.find(row=>row.id===input.p_receipt_id&&row.user_id===input.p_owner);
 if(name!=="finish_todo_creation_receipt"||!row)return {data:false,error:null};
 if(row.status!=="available"){state.audits++;row.status="available";}return {data:true,error:null};
}})}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:async()=>({userId:"11111111-1111-4111-8111-111111111111",supabase:{from:()=>({select:()=>({is:()=>({maybeSingle:async()=>({data:{id:"connection",status:"enabled"},error:null})})})})}})}));
import { createMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
function form(requestId=crypto.randomUUID(),title="Synthetic task"){
 const value=new FormData();value.set("request_id",requestId);value.set("inbox_id",inbox);value.set("todo_list_id",list);value.set("title",title);value.set("body_text","Original source");return value;
}
const initial={status:"idle" as const,message:""};
beforeEach(()=>{state.rows=[];state.audits=0;state.otherDestination=false;state.create.mockReset().mockResolvedValue(task);state.mark.mockReset().mockResolvedValue(true);});
describe("Inbox provider dispatch receipt",()=>{
 it("serializes two different browser request IDs for the same Inbox source",async()=>{
  let finish!:(id:string)=>void;state.create.mockImplementation(()=>new Promise<string>(resolve=>{finish=resolve;}));
  const first=createMicrosoftTodoTaskAction(initial,form());
  await vi.waitFor(()=>expect(state.create).toHaveBeenCalledOnce());
  const second=await createMicrosoftTodoTaskAction(initial,form());
  expect(second.status).toBe("error");expect(second.message).toContain("不会重复发送");
  finish(task);expect((await first).status).toBe("success");expect(state.create).toHaveBeenCalledOnce();expect(state.rows).toHaveLength(1);expect(state.rows[0].request_id).toBe(inbox);
 });
 it("repairs a failed source commit without creating another provider task",async()=>{
  state.mark.mockResolvedValueOnce(false).mockResolvedValue(true);
  expect((await createMicrosoftTodoTaskAction(initial,form())).message).toContain("任务已创建");
  expect(state.rows[0]).toMatchObject({status:"remote_committed",task_id:task});
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("success");
  expect(state.create).toHaveBeenCalledOnce();expect(state.audits).toBe(1);
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("success");expect(state.audits).toBe(1);
 });
 it("never resends an unknown remote outcome, including with a fresh browser ID",async()=>{
  state.create.mockRejectedValueOnce(new Error("lost response"));
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("error");expect(state.rows[0].status).toBe("unknown");
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("error");expect(state.create).toHaveBeenCalledOnce();expect(state.mark).not.toHaveBeenCalled();
 });
 it("rejects changed content against an existing intent rather than reusing its success",async()=>{
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("success");
  const result=await createMicrosoftTodoTaskAction(initial,form(crypto.randomUUID(),"Changed intention"));
  expect(result.status).toBe("error");expect(result.message).toContain("不一致");expect(state.create).toHaveBeenCalledOnce();expect(state.rows[0].user_id).toBe(owner);
 });
 it("does not dispatch when the database reports a Note or Calendar claim",async()=>{
  state.otherDestination=true;
  const result=await createMicrosoftTodoTaskAction(initial,form());
  expect(result.status).toBe("error");expect(state.create).not.toHaveBeenCalled();expect(state.mark).not.toHaveBeenCalled();expect(state.rows).toHaveLength(0);
 });
 it("allows a fresh explicit confirmation with changed input only after a proven rejection",async()=>{
  state.create.mockRejectedValueOnce(Object.assign(new Error("Graph rejected"),{writeOutcome:"not_written"}));
  expect((await createMicrosoftTodoTaskAction(initial,form())).status).toBe("error");expect(state.rows[0].status).toBe("rejected");
  expect((await createMicrosoftTodoTaskAction(initial,form(crypto.randomUUID(),"Corrected title"))).status).toBe("success");
  expect(state.create).toHaveBeenCalledTimes(2);expect(state.rows).toHaveLength(1);expect(state.audits).toBe(2);
 });
});

describe("actual To Do action composed-body boundary", () => {
 it("accepts exactly 10,000 characters including the source and dispatches only after confirmation", async () => {
  const href = "/notes/55555555-5555-4555-8555-555555555555";
  const suffix = `\n\n原文：${href}`;
  const body = "x".repeat(10_000 - suffix.length) + suffix;
  const value = form(); value.set("body_text", body);
  expect(body.length).toBe(10_000);
  expect((await createMicrosoftTodoTaskAction(initial, value)).status).toBe("success");
  expect(state.create).toHaveBeenCalledOnce();
  expect(state.create.mock.calls[0][2].bodyText).toBe(body);
 });
 it("rejects one extra composed character with an accurate body error before auth/provider work", async () => {
  const href = "/notes/55555555-5555-4555-8555-555555555555";
  const suffix = `\n\n原文：${href}`;
  const value = form(); value.set("body_text", "x".repeat(10_001 - suffix.length) + suffix);
  const result = await createMicrosoftTodoTaskAction(initial, value);
  expect(result.status).toBe("error"); expect(result.message).toContain("任务正文最多 10,000");
  expect(result.message).toContain("包含来源链接"); expect(result.message).not.toContain("截止时间");
  expect(state.create).not.toHaveBeenCalled(); expect(state.rows).toEqual([]);
 });
 it("identifies invalid body input separately from title/list/date errors", async () => {
  const value = form(); value.delete("body_text");
  const result = await createMicrosoftTodoTaskAction(initial, value);
  expect(result).toEqual({ status: "error", message: "任务正文格式无效，请检查后重试。", writeOutcome: "not_written" });
  expect(state.create).not.toHaveBeenCalled(); expect(state.rows).toEqual([]);
 });

});
