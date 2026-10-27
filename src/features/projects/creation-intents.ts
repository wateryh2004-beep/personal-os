"use server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {projectSchema} from "./schemas";
import {requireOwner} from "@/lib/auth/require-owner";
import {revalidatePath} from "@/lib/workspace-revalidation";
import type {DraftFields} from "@/features/workflow-continuity/draft-contracts";
import {parseDraftFields} from "@/features/workflow-continuity/draft-contracts";
import type {OrdinaryCreationOutcome} from "@/features/workflow-continuity/creation-intent-types";
function parse(id:string,fields:DraftFields){z.uuid().parse(id);const raw=parseDraftFields("project.create",fields);if(!raw)throw new Error("invalid");return projectSchema.parse(raw);}
const hash=(value:ReturnType<typeof parse>)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readProjectCreationIntent(id:string,fields:DraftFields):Promise<OrdinaryCreationOutcome>{
 try{const value=parse(id,fields),{supabase,userId}=await requireOwner();const [row,audit]=await Promise.all([supabase.from("projects").select("id,name,description,due_date").eq("user_id",userId).eq("id",id).maybeSingle(),supabase.from("audit_logs").select("after_data").eq("id",id).eq("user_id",userId).eq("entity_type","project").eq("entity_id",id).eq("action","create").maybeSingle()]);if(row.error||audit.error)return {status:"needs-check",message:"原项目保存暂时无法核对，输入仍保留。"};if(!row.data&&!audit.data)return {status:"missing",message:"尚未找到原项目，可明确重试同一次保存。"};const receipt=audit.data?.after_data as {intent_fingerprint?:string}|null;if(receipt&&receipt.intent_fingerprint!==hash(value))return {status:"rejected",code:"conflict",message:"原提交编号与项目输入不一致，未重复创建。"};if(!row.data||!receipt)return {status:"needs-check",message:"原项目的保存回执尚未确认，未重复创建。"};if(row.data.name!==value.name||row.data.description!==value.description||row.data.due_date!==value.due_date)return {status:"needs-check",message:"原项目已有后续修改，草稿仍保留，请核对当前项目。"};return {status:"saved",id};}catch{return {status:"needs-check",message:"暂时无法核对原项目，输入仍保留。"};}
}
export async function submitProjectCreationIntent(id:string,fields:DraftFields):Promise<OrdinaryCreationOutcome>{
 let value:ReturnType<typeof parse>;try{value=parse(id,fields);}catch{return {status:"rejected",code:"invalid",message:"请检查项目名称、说明和日期。"};}const prior=await readProjectCreationIntent(id,fields);if(prior.status!=="missing")return prior;
 try{const {supabase,userId}=await requireOwner();const row=await supabase.from("projects").insert({id,user_id:userId,...value,status:"active"}).select("id").single();if(row.error)return readProjectCreationIntent(id,fields);const audit=await supabase.from("audit_logs").insert({id,user_id:userId,action:"create",entity_type:"project",entity_id:id,actor_type:"user",after_data:{intent_fingerprint:hash(value)}});if(audit.error)return {status:"needs-check",message:"原项目已写入，保存回执尚未确认，请核对原提交。"};await revalidatePath("/projects");await revalidatePath("/today");return {status:"saved",id};}catch{return {status:"needs-check",message:"保存结果尚未确认，原项目输入与编号仍保留。"};}
}
