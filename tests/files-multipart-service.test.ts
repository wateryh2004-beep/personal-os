import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({session:{} as Record<string,unknown>,document:{} as Record<string,unknown>,parts:vi.fn(),begin:vi.fn(),sign:vi.fn(),complete:vi.fn(),abort:vi.fn(),stream:vi.fn(),claim:true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from,rpc})}));
vi.mock("@/lib/adapters/cloudflare-r2",()=>({r2BucketName:()=>"private-test",beginR2Multipart:state.begin,signR2MultipartPart:state.sign,listR2MultipartParts:state.parts,completeR2Multipart:state.complete,abortR2Multipart:state.abort,readR2ObjectStream:state.stream,isMissingR2Multipart:(error:Error)=>error.name==="NoSuchUpload"}));
import { multipartService } from "@/features/files/multipart-service";
const user="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",doc="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",id="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function from(table:string){
 let update:Record<string,unknown>|null=null;const filters:[string,unknown][]=[];
 const query={select(){return query;},eq(k:string,v:unknown){filters.push([k,v]);return query;},update(v:Record<string,unknown>){update=v;return query;},in(){return query;},order(){return query;},limit(){return query;},maybeSingle:async()=>result(false),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result(true)).then(resolve)};
 function result(many:boolean){const row=table==="documents"?state.document:state.session;const matches=filters.every(([k,v])=>row[k]===v);if(matches&&update)Object.assign(row,update);return {data:many?(matches?[{...row}]:[]):matches?{...row}:null,error:null};}return query;
}
async function rpc(name:string,args:Record<string,unknown>){
 if(name==="finish_file_upload_abort") {
  if(state.document.storage_state!=="pending"||state.session.status!=="aborting"||state.session.lease_token!==args.p_token)return {data:false,error:null};
  state.document.storage_state="cancelled";state.session.status="aborted";state.session.lease_token=null;return {data:true,error:null};
 }
 if(name==="prepare_file_upload_session")return {data:{...state.session},error:null};
 if(!state.claim||state.document.storage_state!=="pending"||!["uploading","completing","initializing","expired","aborting","failed"].includes(String(state.session.status)))return {data:false,error:null};
 if(args.p_operation==="abort"&&state.session.status==="completing")return {data:false,error:null};
 state.session.lease_token=args.p_token;state.session.status=args.p_operation==="initialize"?"initializing":args.p_operation==="complete"?"completing":"aborting";return {data:true,error:null};
}
beforeEach(()=>{
 const checksum=createHash("sha256").update("hello").digest("hex"),storage_path=`${user}/files/${doc}/fixture.pdf`;
 state.session={id,user_id:user,document_id:doc,storage_path,storage_bucket:"private-test",upload_id:"provider-private",file_size:5,checksum,status:"uploading",expires_at:"2099-01-01"};
 state.document={id:doc,user_id:user,title:"fixture",original_filename:"fixture.pdf",mime_type:"application/pdf",storage_provider:"cloudflare_r2",storage_bucket:"private-test",storage_path,storage_state:"pending",upload_mode:"multipart",file_size:5,checksum,archived_at:null,folder_id:null,text_extraction_status:"pending"};
 state.claim=true;for(const fn of [state.begin,state.sign,state.parts,state.complete,state.abort,state.stream])fn.mockReset();
 state.parts.mockResolvedValue([{partNumber:1,size:5,etag:'"'+'a'.repeat(32)+'"'}]);state.sign.mockResolvedValue("https://r2.example/signed");
 state.stream.mockImplementation(async()=>({size:5,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("hello"));c.close();}})}));
});
describe("private multipart orchestration",()=>{
 it("binds URLs to authenticated owner/session, exact provider identity, part number and length",async()=>{
  await expect(multipartService("foreign").sign(id,1)).rejects.toMatchObject({status:404});expect(state.sign).not.toHaveBeenCalled();
  await multipartService(user).sign(id,1);expect(state.sign).toHaveBeenCalledWith(state.session.storage_path,"provider-private",1,5);
  await expect(multipartService(user).sign(id,2)).rejects.toThrow();
 });
 it("uses server-listed ETags, verifies bytes, and repeats completed upload idempotently",async()=>{
  expect((await multipartService(user).complete(id)).status).toBe("uploaded");expect(state.complete).toHaveBeenCalledWith(state.session.storage_path,"provider-private",[{partNumber:1,size:5,etag:'"'+'a'.repeat(32)+'"'}]);
  expect(state.session.status).toBe("uploaded");await multipartService(user).complete(id);expect(state.complete).toHaveBeenCalledTimes(1);
 });
 it("cannot finalize missing or corrupted parts",async()=>{
  state.parts.mockResolvedValue([]);await expect(multipartService(user).complete(id)).rejects.toMatchObject({status:409});expect(state.complete).not.toHaveBeenCalled();
  state.parts.mockResolvedValue([{partNumber:1,size:6,etag:'"'+'a'.repeat(32)+'"'}]);await expect(multipartService(user).complete(id)).rejects.toThrow();expect(state.complete).not.toHaveBeenCalled();
 });
 it("recovers a lost provider completion response only after verifying the actual complete bytes",async()=>{
  state.session.status="completing";state.parts.mockRejectedValue(Object.assign(new Error("gone"),{name:"NoSuchUpload"}));
  expect((await multipartService(user).complete(id)).status).toBe("uploaded");expect(state.complete).not.toHaveBeenCalled();expect(state.stream).toHaveBeenCalledTimes(1);
 });
 it("leaves a corrupt completed object unavailable",async()=>{
  state.document.checksum=state.session.checksum="f".repeat(64);
  await expect(multipartService(user).complete(id)).rejects.toThrow("校验未通过");expect(state.session.status).toBe("failed");
  await multipartService(user).cancel(id);expect(state.session.status).toBe("aborted");
 });
 it("blocks cancellation during completion and after available publication",async()=>{
  state.session.status="completing";await expect(multipartService(user).cancel(id)).rejects.toMatchObject({status:409});
  state.document.storage_state="available";await expect(multipartService(user).cancel(id)).rejects.toMatchObject({status:409});expect(state.abort).not.toHaveBeenCalled();
 });
 it("explicit cancellation aborts only the owned multipart and retains document metadata",async()=>{
  await multipartService(user).cancel(id);expect(state.abort).toHaveBeenCalledWith(state.session.storage_path,"provider-private");expect(state.session.status).toBe("aborted");expect(state.document.storage_state).toBe("cancelled");
  await multipartService(user).cancel(id);expect(state.abort).toHaveBeenCalledTimes(1);
 });
 it("does not expose provider IDs, keys, or ETags in client snapshots",async()=>{
  const snapshot=await multipartService(user).get(id);expect(JSON.stringify(snapshot)).not.toContain("provider-private");expect(snapshot.parts).toEqual([{partNumber:1,size:5}]);
  expect(snapshot).not.toHaveProperty("storage_path");
 });
 it("stops expired or archived sessions without provider writes",async()=>{
  state.session.expires_at="2000-01-01";await expect(multipartService(user).sign(id,1)).rejects.toMatchObject({status:410});
  state.document.archived_at="now";await expect(multipartService(user).complete(id)).rejects.toMatchObject({status:409});expect(state.complete).not.toHaveBeenCalled();
 });
});
