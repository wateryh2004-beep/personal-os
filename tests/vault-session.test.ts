import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({owner:vi.fn(),from:vi.fn(),rpc:vi.fn(),set:vi.fn(),proof:vi.fn(),signOut:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined,set:mocks.set})}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwnerApi:mocks.owner,apiAuthenticationFailure:()=>null}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock("@/lib/env",()=>({env:{supabaseUrl:"https://synthetic.invalid",supabasePublishableKey:"synthetic-key"}}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({auth:{signInWithPassword:mocks.proof,signOut:mocks.signOut}})}));
import { POST } from "@/app/api/vault/session/route";
import { hashVaultPassword } from "@/features/vault/crypto";
const owner="00000000-0000-4000-8000-000000000001";
const password="Synthetic-independent-password";
const hash=await hashVaultPassword(password);
let credential: {password_hash:string;draft_salt:string}|null;
let writes: {table:string;op:string;value:unknown}[];
function request(data:unknown) { return new Request("https://fixture.invalid/api/vault/session",{method:"POST",headers:{origin:"https://fixture.invalid","content-type":"application/json"},body:JSON.stringify(data)}); }
beforeEach(()=>{
 vi.clearAllMocks();writes=[];credential={password_hash:hash,draft_salt:"c".repeat(64)};
 mocks.owner.mockResolvedValue({userId:owner,email:"synthetic@example.invalid",supabase:{auth:{getClaims:async()=>({data:{claims:{sub:owner,session_id:"verified-login"}},error:null})}}});
 mocks.rpc.mockResolvedValue({data:true,error:null});
 mocks.signOut.mockResolvedValue({error:null});
 mocks.proof.mockResolvedValue({data:{user:{id:owner},session:{access_token:"synthetic-only"}},error:null});
 mocks.from.mockImplementation((table:string)=>{
  const b={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn(async()=>({data:credential,error:null})),
   insert:vi.fn((value:unknown)=>{writes.push({table,op:"insert",value});return Promise.resolve({error:null});}),
   update:vi.fn((value:unknown)=>{writes.push({table,op:"update",value});return b;}),
   delete:vi.fn(()=>{writes.push({table,op:"delete",value:null});return b;}),
   then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)};
  return b;
 });
});
describe("independent password setup and unlock",()=>{
 it("does not issue a session or cookie for an incorrect independent password",async()=>{
  const response=await POST(request({password:"Synthetic-wrong-password"}));
  expect(response.status).toBe(403);expect(mocks.set).not.toHaveBeenCalled();expect(writes).toEqual([]);
 });
 it("issues a hashed login-bound session, httpOnly cookie, and separate in-memory tab proof",async()=>{
  const response=await POST(request({password}));const body=await response.json();
  expect(response.status).toBe(200);expect(body.tabToken).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(body)).not.toContain(hash);expect(JSON.stringify(body)).not.toContain(password);
  const row=writes.find(value=>value.table==="vault_sessions"&&value.op==="insert")!.value as Record<string,string>;
  expect(row.user_id).toBe(owner);expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);expect(row.tab_hash).not.toBe(body.tabToken);
  expect(mocks.set).toHaveBeenCalledWith("personal-os-vault",expect.any(String),expect.objectContaining({httpOnly:true,sameSite:"strict",path:"/api/vault"}));
  expect(writes).toContainEqual({table:"vault_attempts",op:"update",value:{attempts:0}});
 });
 it("requires fresh ordinary password proof for first setup and never replaces a configured credential",async()=>{
  credential=null;
  expect((await POST(request({password}))).status).toBe(400);
  expect(writes).toEqual([]);
  mocks.proof.mockResolvedValueOnce({data:{user:{id:"wrong-owner"},session:null},error:null});
  expect((await POST(request({password,loginPassword:"Synthetic-login"}))).status).toBe(403);
  expect(writes).toEqual([]);
  const response=await POST(request({password,loginPassword:"Synthetic-login"}));
  expect(response.status).toBe(200);
  expect(mocks.signOut).toHaveBeenCalledWith({scope:"local"});
  const record=writes.find(value=>value.table==="vault_credentials")!.value as Record<string,string>;
  expect(record.password_hash).toMatch(/^scrypt-v1\$/);expect(JSON.stringify(record)).not.toContain(password);
 });
 it("fails closed on shared throttle rejection and oversized chunked JSON",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:false,error:null});
  expect((await POST(request({password}))).status).toBe(429);expect(writes).toEqual([]);
  const large=new Request("https://fixture.invalid/api/vault/session",{method:"POST",headers:{origin:"https://fixture.invalid","content-type":"application/json"},body:JSON.stringify({password,extra:"x".repeat(9000)})});
  expect((await POST(large)).status).toBe(413);expect(mocks.set).not.toHaveBeenCalled();
 });
});
