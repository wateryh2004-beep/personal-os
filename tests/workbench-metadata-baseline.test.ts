import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:async()=>({userId:"owner",supabase:{rpc:mocks.rpc,from:mocks.from}})}));
vi.mock("@/lib/workspace-revalidation",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("@/lib/adapters/cloudflare-r2",()=>({readR2ObjectStream:vi.fn()}));
vi.mock("@/features/workbench/operation-provider",()=>({undoProviderReceipt:vi.fn()}));
import {runMetadataForm,listWorkbenchOperations,previewWorkbenchUndo} from "@/features/workbench/operation-actions";
const id="10000000-0000-4000-8000-000000000001",request="20000000-0000-4000-8000-000000000001";
function form(revision?:string){const value=new FormData();value.set("note_id",id);value.set("title","My draft");value.set("request_id",request);if(revision!==undefined)value.set("expected_revision",revision);return value;}
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:{receiptId:id,rows:[]},error:null});});
describe("metadata form displayed baselines and RLS receipt reads",()=>{
 it.each([undefined,"","-1","NaN","9007199254740992"])("rejects missing/invalid baseline %s without reading a replacement or writing",async(value)=>{await expect(runMetadataForm("note_rename",form(value),"note")).rejects.toThrow("重新打开操作");expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();});
 it("retains the displayed baseline and logical request across a stale conflict and retry",async()=>{const input=form("7");mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"workbench_conflict"}});await expect(runMetadataForm("note_rename",input,"note")).rejects.toThrow("其他地方修改");expect(input.get("title")).toBe("My draft");await runMetadataForm("note_rename",input,"note");for(const [name,args] of mocks.rpc.mock.calls){expect(name).toBe("apply_workbench_metadata");expect(args).toMatchObject({p_request_id:request,p_items:[{id,expectedRevision:7,title:"My draft"}]});}expect(mocks.from).not.toHaveBeenCalled();});
 it("does not turn a now-invisible receipt into old title or field previews",async()=>{mocks.from.mockImplementation((table:string)=>{const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:table==="profiles"?{timezone:"UTC"}:null,error:null})};return query;});expect(await listWorkbenchOperations()).toEqual([]);await expect(previewWorkbenchUndo(id)).rejects.toThrow("workbench_missing");});
 it("derives expired availability at the trusted list boundary while retaining terminal failures",async()=>{
  const rows=[{id,operation:"note_rename",status:"available",target_id:id,created_at:"2020-01-01T00:00:00Z",expires_at:"2020-01-02T00:00:00Z",after_data:[],before_data:[]},{id:request,operation:"note_move",status:"failed",target_id:id,created_at:"2020-01-01T00:00:00Z",expires_at:"2020-01-02T00:00:00Z",after_data:[],before_data:[]}];
  mocks.from.mockImplementation(()=>{const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:rows,error:null})};return query;});
  expect((await listWorkbenchOperations()).map(row=>row.status)).toEqual(['expired','failed']);
 });

});
