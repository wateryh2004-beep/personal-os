// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from "vitest";
import {captureWorkbenchViewState,registerWorkbenchViewState,restoreWorkbenchViewState} from "@/features/workbench/view-state-registry";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import type {WorkbenchViewState} from "@/features/workbench/contracts";
const task={kind:"tasks" as const,view:"upcoming" as const,listId:null};
const calendar={kind:"calendar" as const,view:"month" as const,cursor:"2026-11-05",selectedCategories:[],hideInternship:false};
beforeEach(()=>{clearWorkspaceResources();window.history.replaceState(null,"","/tasks");});
describe("finite owner-scoped scene view adapters",()=>{
 it("captures only the mounted matching route's finite state",()=>{registerWorkbenchViewState("tasks",{capture:()=>task,restore:vi.fn()});expect(captureWorkbenchViewState("/tasks")).toEqual(task);expect(captureWorkbenchViewState("/calendar")).toBeUndefined();});
 it("waits for matching mounted route, consumes once, and cannot overwrite later choices",()=>{const restore=vi.fn();restoreWorkbenchViewState(calendar);registerWorkbenchViewState("calendar",{capture:()=>calendar,restore});expect(restore).not.toHaveBeenCalled();window.history.replaceState(null,"","/calendar");const old=registerWorkbenchViewState("calendar",{capture:()=>calendar,restore});expect(restore).toHaveBeenCalledExactlyOnceWith(calendar);registerWorkbenchViewState("calendar",{capture:()=>({...calendar,view:"day"}),restore});old();expect(captureWorkbenchViewState("/calendar")).toMatchObject({view:"day"});expect(restore).toHaveBeenCalledTimes(1);});
 it("cancels a queued restore and clears both old-owner adapters and queued state",()=>{const restore=vi.fn();const cancel=restoreWorkbenchViewState(calendar);cancel();window.history.replaceState(null,"","/calendar");registerWorkbenchViewState("calendar",{capture:()=>calendar,restore});expect(restore).not.toHaveBeenCalled();restoreWorkbenchViewState(task);clearWorkspaceResources();expect(captureWorkbenchViewState("/calendar")).toBeUndefined();window.history.replaceState(null,"","/tasks");registerWorkbenchViewState("tasks",{capture:()=>task,restore});expect(restore).not.toHaveBeenCalled();});
 it("rejects forged or oversized state without calling an adapter",()=>{const restore=vi.fn();registerWorkbenchViewState("tasks",{capture:()=>task,restore});restoreWorkbenchViewState({...task,body:"not allowed"} as unknown as WorkbenchViewState);expect(restore).not.toHaveBeenCalled();});
});
