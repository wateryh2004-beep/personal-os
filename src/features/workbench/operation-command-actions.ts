"use server";
import { readOperationTimezone } from "./operation-read-queries";
import { requireOwner } from "@/lib/auth/require-owner";
import { z } from "zod";
import { parseWorkbenchCommand } from "./operation-command-parser";
export async function previewWorkbenchCommand(query:string) {
 const value=z.string().trim().min(1).max(1000).parse(query);const {supabase,userId}=await requireOwner();
 const {data,error}=await supabase.from("profiles").select("timezone").eq("user_id",userId).maybeSingle();
 if(error)throw new Error("命令时区暂不可读取。");return parseWorkbenchCommand(value,data?.timezone||"Asia/Shanghai",new Date().toISOString());
}
export async function readCommandTasks(ids:string[]) {
 const value=z.array(z.string().uuid()).min(1).max(20).parse(ids);const {supabase,userId}=await requireOwner();
 const [{data,error},{data:profile}]=await Promise.all([supabase.from("microsoft_todo_tasks").select("id,title,status,provider_last_modified_at,due_at,importance").in("id",[...new Set(value)]).is("archived_at",null),supabase.from("profiles").select("timezone").eq("user_id",userId).maybeSingle()]);
 if(error||data?.length!==new Set(value).size)throw new Error("选中任务不可读取。");return {tasks:data as {id:string;title:string;status:string;provider_last_modified_at:string|null;due_at:string|null;importance:string}[],timezone:(profile?.timezone||"Asia/Shanghai") as string};
}
export async function readWorkbenchTimezone(){return (await readOperationTimezone(await requireOwner())).timezone;}
