import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),create:vi.fn(),list:vi.fn(),get:vi.fn(),sign:vi.fn(),complete:vi.fn(),cancel:vi.fn(),service:vi.fn()}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwnerApi:mocks.auth,apiAuthenticationFailure:(error:Error)=>error.message==="unauthenticated"?new Response(null,{status:401}):null}));
vi.mock("@/lib/adapters/cloudflare-r2",()=>({isR2Configured:()=>true}));
vi.mock("@/features/files/multipart-service",()=>({MultipartError:class extends Error {constructor(public status:number,message:string){super(message);}},multipartService:mocks.service}));
import { POST, PATCH, GET, DELETE } from "@/app/api/files/multipart/route";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request=(method:string,body?:unknown,origin?:string)=>new Request("https://app.example/api/files/multipart",{method,headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue({userId:"verified-owner"});
 mocks.service.mockReturnValue({create:mocks.create,list:mocks.list,get:mocks.get,sign:mocks.sign,complete:mocks.complete,cancel:mocks.cancel});
 for(const fn of [mocks.create,mocks.list,mocks.get,mocks.sign,mocks.complete,mocks.cancel])fn.mockResolvedValue({ok:true});
});
describe("multipart authenticated HTTP boundary",()=>{
 it("authenticates all methods before touching provider state",async()=>{
  mocks.auth.mockRejectedValue(new Error("unauthenticated"));
  for(const [method,handler] of [["GET",GET],["POST",POST],["PATCH",PATCH],["DELETE",DELETE]] as const)expect((await handler(request(method))).status).toBe(401);
  expect(mocks.service).not.toHaveBeenCalled();
 });
 it("uses only verified identity and private no-store responses",async()=>{
  const response=await PATCH(request("PATCH",{action:"sign",sessionId:id,partNumber:1},"https://app.example"));
  expect(response.status).toBe(200);expect(mocks.service).toHaveBeenCalledWith("verified-owner");expect(mocks.sign).toHaveBeenCalledWith(id,1);expect(response.headers.get("cache-control")).toContain("no-store");
 });
 it("rejects forged provider fields, cross-origin and oversized chunked bodies before service methods",async()=>{
  expect((await PATCH(request("PATCH",{action:"sign",sessionId:id,partNumber:1,uploadId:"foreign"}))).status).toBe(400);
  expect((await POST(request("POST",{filename:"test"},"https://evil.example"))).status).toBe(403);
  expect((await POST(request("POST","x".repeat(5000)))).status).toBe(400);
  expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
 });
});
