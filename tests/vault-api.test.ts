import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), cookie: vi.fn(), from: vi.fn(), claims: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mocks.owner, apiAuthenticationFailure: () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { requireVault, sameOrigin } from "@/features/vault/server";
import { tokenHash } from "@/features/vault/crypto";
import { POST } from "@/app/api/vault/items/route";

const owner="00000000-0000-4000-8000-000000000001", cookie="a".repeat(64), tab="b".repeat(64);
let filters: [string,unknown][];
function session(data: unknown, error: unknown = null) {
  const builder={ select:vi.fn().mockReturnThis(),eq:vi.fn((key:string,value:unknown)=>{filters.push([key,value]);return builder;}),maybeSingle:vi.fn().mockResolvedValue({data,error}) };
  mocks.from.mockReturnValue(builder);
}
function request(headers: Record<string,string> = {}) { return new Request("https://fixture.invalid/api/vault/items",{headers}); }
beforeEach(() => {
  vi.clearAllMocks();filters=[];
  mocks.owner.mockResolvedValue({userId:owner,email:"fixture@example.invalid",supabase:{auth:{getClaims:mocks.claims}}});
  mocks.claims.mockResolvedValue({data:{claims:{sub:owner,session_id:"verified-login-session"}},error:null});
  mocks.cookie.mockReturnValue({value:cookie});
  session({expires_at:new Date(Date.now()+60000).toISOString(),last_seen_at:new Date().toISOString()});
});
describe("vault HTTP authorization boundary",()=>{
  it("does not accept a cookie without the tab's in-memory proof (including reload)",async()=>{
    await expect(requireVault(request())).rejects.toMatchObject({status:423});
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.cookie.mockReturnValue(undefined);
    await expect(requireVault(request({"x-vault-tab":tab}))).rejects.toMatchObject({status:423});
  });
  it("binds the hashed capability to owner, verified login and tab",async()=>{
    const value=await requireVault(request({"x-vault-tab":tab}));
    expect(value.userId).toBe(owner);
    expect(filters).toEqual(expect.arrayContaining([["user_id",owner],["token_hash",tokenHash(cookie)],["login_session",tokenHash("verified-login-session")],["tab_hash",tokenHash(tab)]]));
  });
  it("rejects wrong tab, idle expiration, absolute expiration and storage failure",async()=>{
    for(const data of [null,{expires_at:new Date(Date.now()+60000).toISOString(),last_seen_at:new Date(Date.now()-300001).toISOString()},{expires_at:new Date(Date.now()-1).toISOString(),last_seen_at:new Date().toISOString()}]){
      session(data);await expect(requireVault(request({"x-vault-tab":tab}))).rejects.toMatchObject({status:423});
    }
    session(null,{code:"missing_migration"});
    await expect(requireVault(request({"x-vault-tab":tab}))).rejects.toMatchObject({status:503});
  });
  it("requires actual verified claims, even if an owner guard returned an identity",async()=>{
    mocks.claims.mockResolvedValue({data:{claims:{sub:"forged-owner",session_id:"forged"}},error:null});
    await expect(requireVault(request({"x-vault-tab":tab}))).rejects.toMatchObject({status:401});
  });
  it("rejects cross-site writes before owner/database work",async()=>{
    expect(()=>sameOrigin(request({origin:"https://attacker.invalid"}))).toThrow();
    const response=await POST(new Request("https://fixture.invalid/api/vault/items",{method:"POST",headers:{origin:"https://attacker.invalid","Content-Type":"application/json"},body:JSON.stringify({kind:"note",id:owner,hidden:true})}));
    expect(response.status).toBe(403);expect(mocks.owner).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a protocol lock response without running a mutation",async()=>{
    const response=await POST(new Request("https://fixture.invalid/api/vault/items",{method:"POST",headers:{origin:"https://fixture.invalid","Content-Type":"application/json"},body:JSON.stringify({kind:"note",id:owner,hidden:true})}));
    expect(response.status).toBe(423);expect(response.headers.get("Cache-Control")).toContain("no-store");expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
