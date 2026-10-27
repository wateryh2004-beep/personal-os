"use server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {requireOwner} from "@/lib/auth/require-owner";
import {revalidatePath} from "@/lib/workspace-revalidation";
import {shoppingItemCreateSchema} from "./schemas";
import {decidePurchase} from "./rules";
import {parseDraftFields,type DraftFields} from "@/features/workflow-continuity/draft-contracts";
import type {OrdinaryCreationOutcome} from "@/features/workflow-continuity/creation-intent-types";
function parse(intentId:string,fields:DraftFields){z.uuid().parse(intentId);const raw=parseDraftFields("shopping.create",fields);if(!raw)throw new Error("invalid");return shoppingItemCreateSchema.parse({title:raw.title,priceCny:raw.priceCny||undefined,quantity:raw.quantity||null,quantityUnit:raw.quantityUnit||null,necessity:raw.necessity||"unknown",necessityConfirmed:raw.necessityConfirmed===true,reasonToBuy:raw.reasonToBuy||undefined});}
const fingerprint=(value:ReturnType<typeof parse>)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readPurchaseCreationIntent(intentId:string,fields:DraftFields):Promise<OrdinaryCreationOutcome>{
 try{const value=parse(intentId,fields),{supabase,userId}=await requireOwner();const [row,receipt]=await Promise.all([supabase.from("purchase_items").select("id,title,price_cny,quantity,quantity_unit,necessity,necessity_confirmed,reason_to_buy").eq("id",intentId).eq("user_id",userId).maybeSingle(),supabase.from("audit_logs").select("after_data").eq("id",intentId).eq("user_id",userId).eq("action","purchase_item_create").eq("entity_id",intentId).maybeSingle()]);
 if(row.error||receipt.error)return {status:"needs-check",message:"原保存暂时无法核对，输入仍保留。"};
 if(!row.data&&!receipt.data)return {status:"missing",message:"尚未找到原保存记录，可明确重试同一次保存。"};
 const data=receipt.data?.after_data as {intent_fingerprint?:string}|null;
 if(data&&data.intent_fingerprint!==fingerprint(value))return {status:"rejected",code:"conflict",message:"原提交编号与输入不一致，未重复创建。"};
 if(!row.data||!data)return {status:"needs-check",message:"原记录的保存回执尚未确认，系统不会自动重复创建。"};
 const actual=row.data;if(actual.title!==value.title||actual.price_cny!==(value.priceCny??null)||actual.quantity!==(value.quantity??null)||actual.quantity_unit!==(value.quantityUnit??null)||actual.necessity!==value.necessity||actual.necessity_confirmed!==value.necessityConfirmed||actual.reason_to_buy!==(value.reasonToBuy||null))return {status:"needs-check",message:"原记录已有后续修改，请核对原记录；草稿仍保留。"};
 return {status:"saved",id:intentId};
 }catch{return {status:"needs-check",message:"暂时无法核对原待购输入，草稿仍保留。"};}
}
export async function submitPurchaseCreationIntent(intentId:string,fields:DraftFields):Promise<OrdinaryCreationOutcome>{
 let value:ReturnType<typeof parse>;try{value=parse(intentId,fields);}catch{return {status:"rejected",code:"invalid",message:"请检查名称、数量、单位和价格，原输入仍保留。"};}
 const existing=await readPurchaseCreationIntent(intentId,fields);if(existing.status!=="missing")return existing;
 try{const {supabase,userId}=await requireOwner();const decision=decidePurchase({priceCny:value.priceCny??null,necessity:value.necessity,necessityConfirmed:value.necessityConfirmed});const result=await supabase.from("purchase_items").insert({id:intentId,user_id:userId,title:value.title,price_cny:value.priceCny??null,quantity:value.quantity??null,quantity_unit:value.quantityUnit??null,necessity:value.necessity,necessity_confirmed:value.necessityConfirmed,reason_to_buy:value.reasonToBuy||null,status:decision.mode==="buy_now_eligible"?"ready":"cooling",cooldown_until:decision.mode==="cooldown"?new Date(Date.now()+decision.cooldownDays*86400000).toISOString():null}).select("id").single();if(result.error)return readPurchaseCreationIntent(intentId,fields);
 const audit=await supabase.from("audit_logs").insert({id:intentId,user_id:userId,action:"purchase_item_create",entity_type:"purchase_item",entity_id:intentId,actor_type:"user",after_data:{status:decision.mode,intent_fingerprint:fingerprint(value)}});if(audit.error)return {status:"needs-check",message:"待购记录已写入，保存回执尚未确认，请核对原提交。"};await revalidatePath("/shopping");return {status:"saved",id:intentId};
 }catch{return {status:"needs-check",message:"保存结果尚未确认，输入与原提交编号已保留。"};}
}
