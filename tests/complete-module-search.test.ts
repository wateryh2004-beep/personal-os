import { describe, expect, it, vi } from "vitest";
import { entityHref, searchPersonalOs } from "@/features/search/queries";
import { searchInputSchema } from "@/features/search/types";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ supabase: { rpc: state.rpc } }) }));
const id="20cbfbca-c1af-40aa-9796-7564f985f009";
const parent="30cbfbca-c1af-40aa-9796-7564f985f009";
describe("Complete module search", () => {
  it("accepts all additional domains without changing existing ones", () => {
    expect(searchInputSchema.parse({query:"估值",domains:["leisure","briefing","investment","notes"]}).domains).toHaveLength(4);
  });
  it("deep links to an actual Leisure detail and Briefing entry", () => {
    expect(entityHref("leisure_experience",id,"leisure",{})).toBe(`/leisure/${id}`);
    expect(entityHref("briefing_entry",id,"briefing",{briefing_id:parent})).toBe(`/briefing/history/${parent}#entry-${id}`);
    expect(entityHref("briefing_entry",id,"briefing",{briefing_id:"//evil.example"})).toBe("/briefing");
  });
  it("keeps real and paper account destinations explicit", () => {
    expect(entityHref("investment_account",id,"investment",{mode:"paper"})).toBe(`/investments?tab=holdings&mode=paper&item=${id}`);
    expect(entityHref("investment_account",id,"investment",{mode:"real"})).toBe(`/investments?tab=holdings&mode=real&item=${id}`);
    expect(entityHref("investment_research_run",id,"investment",{})).toBe(`/investments?tab=research&item=${id}`);
    expect(entityHref("investment_strategy_version",id,"investment",{})).toBe(`/investments?tab=strategies&item=${id}`);
  });
  it("parses new domains and preserves snippets, stable IDs and rank", async () => {
    state.rpc.mockResolvedValue({error:null,data:[{domain:"leisure",entity_type:"leisure_experience",entity_id:id,title:"散步",subtitle:"outing",snippet:"合成测试",metadata:{},source_updated_at:null,score:40}]});
    expect((await searchPersonalOs({query:"散步"}))[0]).toMatchObject({id:`leisure_experience:${id}`,href:`/leisure/${id}`,score:40});
    expect(state.rpc).toHaveBeenLastCalledWith("search_personal_os",{p_query:"散步",p_limit:30,p_domains:null});
  });
  it("does not request empty searches and reports query failures", async () => {
    state.rpc.mockClear();
    expect(await searchPersonalOs({query:"  "})).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({data:null,error:{code:"failure"}});
    await expect(searchPersonalOs({query:"x"})).rejects.toThrow("search_unavailable");
  });
});
