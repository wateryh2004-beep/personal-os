import "server-only";
import type { requireOwnerApi } from "@/lib/auth/require-owner";
import { readMicrosoftTodoMutationSnapshot } from "@/lib/adapters/microsoft-graph/calendar";
import { operationTimezoneSchema, pendingCalendarTasksSchema, calendarScheduleConflictsSchema, calendarScheduleTaskSchema } from "./operation-read-contracts";
type Owner=Awaited<ReturnType<typeof requireOwnerApi>>;
/** Owner is verified at the calling HTTP/action boundary, never supplied by the browser. */
export async function readOperationTimezone(owner:Owner){
 const {data,error}=await owner.supabase.from("profiles").select("timezone").eq("user_id",owner.userId).maybeSingle();
 if(error)throw new Error("timezone_unavailable");
 return operationTimezoneSchema.parse({timezone:data?.timezone||"Asia/Shanghai"});
}
export async function readPendingCalendarTasksQuery(owner:Owner){
 const [result,profile]=await Promise.all([owner.supabase.from("microsoft_todo_tasks").select("id,title,status,provider_last_modified_at").eq("user_id",owner.userId).neq("status","completed").is("archived_at",null).order("due_at",{ascending:true}).limit(101),readOperationTimezone(owner)]);
 if(result.error)throw new Error("todo_read_unavailable");
 const ids=(result.data??[]).slice(0,100).map(task=>task.id);
 const planning=ids.length?await owner.supabase.from("task_planning").select("task_id,estimated_minutes").eq("user_id",owner.userId).in("task_id",ids):{data:[],error:null};
 if(planning.error)throw new Error("planning_read_unavailable");
 return pendingCalendarTasksSchema.parse({tasks:(result.data??[]).slice(0,100).map(task=>({...task,estimated_minutes:planning.data?.find(plan=>plan.task_id===task.id)?.estimated_minutes??null})),timezone:profile.timezone,truncated:(result.data?.length??0)>100});
}
export async function readCalendarScheduleConflictsQuery(owner:Owner,value:{startsAt:string;endsAt:string}){
 const {data,error}=await owner.supabase.from("calendar_events").select("id,subject,starts_at,ends_at").eq("user_id",owner.userId).lt("starts_at",value.endsAt).gt("ends_at",value.startsAt).is("archived_at",null).order("starts_at").limit(21);
 if(error)throw new Error("calendar_conflicts_unavailable");
 return calendarScheduleConflictsSchema.parse({events:(data??[]).slice(0,20),truncated:(data?.length??0)>20});
}
export async function readCalendarScheduleTaskQuery(owner:Owner,id:string){
 const {data,error}=await owner.supabase.from("calendar_connections").select("id,status").eq("user_id",owner.userId).is("archived_at",null).maybeSingle();
 if(error||!data||data.status!=="enabled")throw new Error("calendar_not_connected");
 return calendarScheduleTaskSchema.parse(await readMicrosoftTodoMutationSnapshot(data.id,owner.userId,id));
}
