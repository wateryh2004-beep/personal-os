"use server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {requireOwner} from "@/lib/auth/require-owner";
import {revalidatePath} from "@/lib/workspace-revalidation";
import type {OrdinaryCreationOutcome} from "@/features/workflow-continuity/creation-intent-types";
const schema=z.discriminatedUnion("kind",[z.object({kind:z.literal("trip"),intentId:z.uuid(),title:z.string().trim().min(1).max(500),description:z.string().max(20000)}).strict(),z.object({kind:z.literal("stop"),intentId:z.uuid(),tripId:z.uuid(),placeName:z.string().trim().min(1).max(500),dayNumber:z.string().max(30).refine(v=>v===""||/^\d+$/.test(v)&&Number(v)>=1&&Number(v)<=366)}).strict()]);
export type TravelCreationIntent=z.infer<typeof schema>;
const fingerprint=(value:TravelCreationIntent)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readTravelCreationIntent(input:TravelCreationIntent):Promise<OrdinaryCreationOutcome>{
 const parsed=schema.safeParse(input);if(!parsed.success)return {status:"rejected",code:"invalid",message:"原旅行输入不完整，草稿仍保留。"};
 try{const {supabase,userId}=await requireOwner();const value=parsed.data;
 const row=value.kind==="trip"?await supabase.from("trips").select("id,title,description").eq("id",value.intentId).eq("user_id",userId).maybeSingle():await supabase.from("trip_stops").select("id,place_name,day_number").eq("id",value.intentId).eq("trip_id",value.tripId).eq("user_id",userId).maybeSingle();
 if(row.error)return {status:"needs-check",message:"暂时无法核对原记录，输入仍保留。"};
 const action=value.kind==="trip"?"trip_create":"trip_stop_create";
 const receipt=await supabase.from("audit_logs").select("after_data").eq("id",value.intentId).eq("user_id",userId).eq("action",action).eq("entity_id",value.intentId).maybeSingle();
 if(receipt.error)return {status:"needs-check",message:"原保存暂时无法核对，输入仍保留。"};
 if(receipt.data&&!row.data)return {status:"needs-check",message:"原记录暂不可用，未重复保存。"};
 if(receipt.data&&row.data){const actual=row.data;if(value.kind==="trip"&&("title" in actual&&(actual.title!==value.title||actual.description!==(value.description||null)))||value.kind==="stop"&&("place_name" in actual&&(actual.place_name!==value.placeName||actual.day_number!==(value.dayNumber?Number(value.dayNumber):null))))return {status:"needs-check",message:"原记录已有后续修改，输入仍保留，请核对原记录。"};const data=receipt.data.after_data as {intent_fingerprint?:string}|null;return data?.intent_fingerprint===fingerprint(value)?{status:"saved",id:value.intentId}:{status:"rejected",code:"conflict",message:"原提交编号与输入不一致，未重复保存。"};}
 const existing=value.kind==="trip"?await supabase.from("trips").select("id").eq("id",value.intentId).eq("user_id",userId).maybeSingle():await supabase.from("trip_stops").select("id").eq("id",value.intentId).eq("user_id",userId).eq("trip_id",value.tripId).maybeSingle();
 return existing.error||existing.data?{status:"needs-check",message:"原记录的保存回执尚未确认，系统不会自动重复创建。"}:{status:"missing",message:"尚未找到原保存记录，可明确重试同一次保存。"};
 }catch{return {status:"needs-check",message:"暂时无法核对原保存，输入仍保留。"};}
}
export async function submitTravelCreationIntent(input:TravelCreationIntent):Promise<OrdinaryCreationOutcome>{
 const parsed=schema.safeParse(input);if(!parsed.success)return {status:"rejected",code:"invalid",message:"请检查目的地、名称和天数。"};
 const value=parsed.data;const existing=await readTravelCreationIntent(value);if(existing.status!=="missing")return existing;
 try{const {supabase,userId}=await requireOwner();
 if(value.kind==="trip"){const result=await supabase.from("trips").insert({id:value.intentId,user_id:userId,title:value.title,description:value.description||null,status:"dream",created_via:"manual"}).select("id").single();if(result.error)return readTravelCreationIntent(value);}
 else {const parent=await supabase.from("trips").select("id").eq("id",value.tripId).eq("user_id",userId).is("archived_at",null).maybeSingle();if(parent.error||!parent.data)return {status:"rejected",code:"unavailable",message:"原行程当前不可用，输入仍保留。"};const count=await supabase.from("trip_stops").select("id",{count:"exact",head:true}).eq("trip_id",value.tripId).eq("user_id",userId);if(count.error)return {status:"needs-check",message:"暂时无法确认原行程，输入仍保留。"};const result=await supabase.from("trip_stops").insert({id:value.intentId,user_id:userId,trip_id:value.tripId,place_name:value.placeName,day_number:value.dayNumber?Number(value.dayNumber):null,sort_order:count.count??0}).select("id").single();if(result.error)return readTravelCreationIntent(value);}
 const audit=await supabase.from("audit_logs").insert({id:value.intentId,user_id:userId,action:value.kind==="trip"?"trip_create":"trip_stop_create",entity_type:value.kind==="trip"?"trip":"trip_stop",entity_id:value.intentId,actor_type:"user",after_data:{intent_fingerprint:fingerprint(value)}});if(audit.error)return {status:"needs-check",message:"原记录已写入，保存回执尚未确认，请核对原提交。"};
 await revalidatePath(value.kind==="trip"?"/travel":`/travel/${value.tripId}`);return {status:"saved",id:value.intentId};
 }catch{return {status:"needs-check",message:"保存结果尚未确认，输入与原提交编号仍保留。"};}
}
