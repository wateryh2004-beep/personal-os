"use client";
import {createWorkspaceResource,readWorkspaceResponse,captureWorkspaceScope,registerWorkspaceScopeCleanup,clearWorkspaceResources,WorkspaceAuthenticationError,WorkspaceReadSupersededError} from "@/lib/workspace-resource-cache";
import {clearWorkspaceSessions} from "@/lib/workspace-session";
import {operationTimezoneSchema,pendingCalendarTasksSchema,calendarScheduleRangeSchema,calendarScheduleConflictsSchema,calendarScheduleTaskSchema} from "./operation-read-contracts";
/** Two fixed slots, tab memory only; scope clear aborts and discards the old owner. */
export const operationTimezoneResource=createWorkspaceResource("workbench:operation-timezone",async signal=>operationTimezoneSchema.parse(await readWorkspaceResponse("/api/workbench/timezone",signal)),45_000);
export const pendingCalendarTasksResource=createWorkspaceResource("workbench:pending-calendar-tasks",async signal=>pendingCalendarTasksSchema.parse(await readWorkspaceResponse("/api/calendar/pending-tasks",signal)),30_000);
export async function readWorkbenchTimezone(){return (await operationTimezoneResource.revalidate()).timezone;}
export async function readPendingCalendarTasks(options?:{force?:boolean}){return pendingCalendarTasksResource.revalidate(options);}
// Real-time previews keep only at most eight abort handles, never read DTOs.
const transientReads=new Set<AbortController>();
registerWorkspaceScopeCleanup(()=>{transientReads.forEach(controller=>controller.abort());transientReads.clear();});
async function readTransientOperationResponse<T>(url:string,signal?:AbortSignal):Promise<T>{
 if(signal?.aborted)throw new WorkspaceReadSupersededError("operation_read_cancelled");
 const current=captureWorkspaceScope(),controller=new AbortController();
 let rejectAbort!:(error:WorkspaceReadSupersededError)=>void;
 const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
 const onAbort=()=>rejectAbort(new WorkspaceReadSupersededError("operation_read_cancelled"));
 const externalAbort=()=>controller.abort();
 controller.signal.addEventListener("abort",onAbort,{once:true});
 signal?.addEventListener("abort",externalAbort,{once:true});
 while(transientReads.size>=8){const oldest=transientReads.values().next().value!;transientReads.delete(oldest);oldest.abort();}
 transientReads.add(controller);
 try{
  const value=await Promise.race([readWorkspaceResponse<T>(url,controller.signal),aborted]);
  if(!current()||controller.signal.aborted)throw new WorkspaceReadSupersededError("operation_read_superseded");
  return value;
 }catch(error){
  if(!current()||controller.signal.aborted)throw new WorkspaceReadSupersededError("operation_read_superseded");
  if(error instanceof WorkspaceAuthenticationError){
   clearWorkspaceResources();clearWorkspaceSessions();
   if(typeof window!=="undefined")window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
  }
  throw error;
 }finally{
  transientReads.delete(controller);
  controller.signal.removeEventListener("abort",onAbort);
  signal?.removeEventListener("abort",externalAbort);
 }
}
export async function readCalendarScheduleConflicts(input:unknown,signal?:AbortSignal){const value=calendarScheduleRangeSchema.parse(input);const params=new URLSearchParams(value);return calendarScheduleConflictsSchema.parse(await readTransientOperationResponse(`/api/calendar/schedule-conflicts?${params}`,signal));}
export async function readCalendarTaskForSchedule(id:string,signal?:AbortSignal){return calendarScheduleTaskSchema.parse(await readTransientOperationResponse(`/api/calendar/schedule-task?id=${encodeURIComponent(id)}`,signal));}
