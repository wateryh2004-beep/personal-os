import { beforeEach, describe, expect, it, vi } from "vitest";
import { readStorageBudget, saveStorageBudget } from "@/features/files/storage-inspection/budget-actions";
import { storageBudgetInput } from "@/features/files/storage-inspection/budget-schema";
const state=vi.hoisted(()=>({from:vi.fn(),update:vi.fn(),eq:vi.fn(),is:vi.fn(),select:vi.fn(),single:vi.fn(),maybeSingle:vi.fn()}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:async()=>({userId:"verified-owner",supabase:{from:state.from}})}));
beforeEach(()=>{vi.clearAllMocks();for(const name of ["from","update","eq","is","select"] as const) state[name].mockReturnValue(state);state.single.mockResolvedValue({data:{storage_budget_gib:12.5},error:null});state.maybeSingle.mockResolvedValue({data:{storage_budget_gib:12.5},error:null});});
describe("persisted storage budget",()=>{
 it("loads saved owner preference and never reads provider billing",async()=>{expect(await readStorageBudget()).toEqual({value:"12.5",available:true});expect(state.from).toHaveBeenCalledWith("profiles");expect(state.eq).toHaveBeenCalledWith("user_id","verified-owner");});
 it("validates units and bounds before writes",async()=>{for(const v of ["0","-1","Infinity","NaN","1e5","1000001",".1","0.000001"]){expect(storageBudgetInput.safeParse(v).success).toBe(false);expect((await saveStorageBudget(v)).ok).toBe(false);}expect(state.update).not.toHaveBeenCalled();});
 it("persists only budget for authenticated owner",async()=>{expect(await saveStorageBudget("12.5")).toEqual({ok:true,value:"12.5"});expect(state.update).toHaveBeenCalledWith({storage_budget_gib:12.5});expect(state.eq).toHaveBeenCalledWith("user_id","verified-owner");expect(state.is).toHaveBeenCalledWith("archived_at",null);});
 it("clears a budget explicitly without deleting the profile",async()=>{state.single.mockResolvedValue({data:{storage_budget_gib:null},error:null});expect(await saveStorageBudget("")).toEqual({ok:true,value:""});expect(state.update).toHaveBeenCalledWith({storage_budget_gib:null});});
 it("distinguishes unavailable read and failed write from unset budget",async()=>{state.maybeSingle.mockResolvedValue({data:null,error:{code:"missing"}});expect(await readStorageBudget()).toEqual({value:"",available:false});state.single.mockResolvedValue({data:null,error:{code:"missing"}});expect((await saveStorageBudget("5")).ok).toBe(false);});
});
