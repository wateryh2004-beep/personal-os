import "server-only";
import { z } from "zod";
import { parseDraftFields } from "@/features/workflow-continuity/draft-contracts";
import { projectSchema } from "@/features/projects/schemas";
import { shoppingItemCreateSchema } from "@/features/shopping/schemas";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureTask, fixtureTimestamp } from "./continuous-fixture-data";
import { fixtureTrip } from "./continuous-domain-fixture-data";
const record=z.object({signature:z.string(),id:z.uuid()}).strict();
const input=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("project"),id:z.uuid(),fields:z.record(z.string(),z.union([z.string(),z.boolean(),z.array(z.string())]))}).strict(),
 z.object({kind:z.literal("shopping"),id:z.uuid(),fields:z.record(z.string(),z.union([z.string(),z.boolean(),z.array(z.string())]))}).strict(),
 z.object({kind:z.literal("trip"),intentId:z.uuid(),title:z.string().trim().min(1).max(500),description:z.string().max(20000)}).strict(),
 z.object({kind:z.literal("stop"),intentId:z.uuid(),tripId:z.uuid(),placeName:z.string().trim().min(1).max(500),dayNumber:z.string().max(30).refine(v=>v===""||/^\d+$/.test(v)&&Number(v)>=1&&Number(v)<=366)}).strict(),
]);
export function syntheticCreation(state:FixtureState,raw:unknown,readOnly:boolean){
 const parsed=input.safeParse(raw);if(!parsed.success)return{status:"rejected",code:"invalid",message:"合成输入无效。"};const value=parsed.data;
 let normalized:unknown;
 if(value.kind==="project"){const fields=parseDraftFields("project.create",value.fields);if(!fields)return{status:"rejected",code:"invalid",message:"项目输入无效。"};normalized=projectSchema.parse(fields);}
 else if(value.kind==="shopping"){const fields=parseDraftFields("shopping.create",value.fields);if(!fields)return{status:"rejected",code:"invalid",message:"待购输入无效。"};normalized=shoppingItemCreateSchema.parse({title:fields.title,priceCny:fields.priceCny||undefined,quantity:fields.quantity||null,quantityUnit:fields.quantityUnit||null,necessity:fields.necessity||"unknown",necessityConfirmed:fields.necessityConfirmed===true,reasonToBuy:fields.reasonToBuy||undefined});}
 else {if(value.kind==="stop"&&value.tripId!==fixtureTrip.trip.id)return{status:"rejected",code:"unavailable",message:"原行程不可用。"};normalized=value;}
 const id="id"in value?value.id:value.intentId,signature=JSON.stringify(normalized),key=`creation:${value.kind}:${id}`,previous=record.safeParse(state.domainObjects.get(key));
 if(previous.success)return previous.data.signature===signature?{status:"saved",id}:{status:"rejected",code:"conflict",message:"原意图已对应其他输入。"};
 if(readOnly)return{status:"missing",message:"尚未找到原意图，未重发。"};
 state.domainObjects.set(key,{signature,id});state.domainObjects.set(`created:${id}`,structuredClone(normalized));state.writes[`create:${value.kind}`]=(state.writes[`create:${value.kind}`]??0)+1;return{status:"saved",id};
}
export function syntheticTaskCreation(state:FixtureState,raw:unknown,readOnly:boolean){
 const entries=z.array(z.tuple([z.string(),z.string()])).max(30).parse(raw),form=new FormData();entries.forEach(([k,v])=>form.append(k,v));
 const parsed=z.object({requestId:z.uuid(),todoListId:z.literal(fixtureTask.todoListId),title:z.string().trim().min(1).max(500),bodyText:z.string().trim().max(10000),importance:z.enum(["low","normal","high"]),dueAt:z.string().nullable()}).safeParse({requestId:form.get("inbox_id")||form.get("request_id"),todoListId:form.get("todo_list_id"),title:form.get("title"),bodyText:String(form.get("body_text")||""),importance:form.get("importance")||"normal",dueAt:form.get("due_at")||null});
 if(!parsed.success)return{status:"error",message:"请核对原任务输入。"};const value=parsed.data,signature=JSON.stringify(value),key=`task-create:${value.requestId}`,previous=record.safeParse(state.domainObjects.get(key));
 if(previous.success)return previous.data.signature===signature?{status:"success",message:"已核对原任务。",taskId:previous.data.id}:{status:"error",message:"原任务意图不匹配。"};
 if(readOnly)return{status:"error",message:"原提交仍待核对，未重复发送。"};
 const taskId=crypto.randomUUID();if(form.get("inbox_id")){const sourceId=z.uuid().parse(form.get("inbox_id"));if(state.domainObjects.has(`inbox-terminal:${sourceId}`))return{status:"error",message:"来源已有其他去向。"};state.domainObjects.set(`inbox-terminal:${sourceId}`,{kind:"task",destination:taskId,signature});}state.domainObjects.set(key,{signature,id:taskId});state.domainObjects.set(`todo:${taskId}`,{...fixtureTask,id:taskId,providerTaskId:`synthetic-${taskId}`,title:value.title,bodyText:value.bodyText||null,importance:value.importance,dueAt:value.dueAt,lastModifiedAt:fixtureTimestamp});state.writes["task-create"]=(state.writes["task-create"]??0)+1;return{status:"success",message:"合成任务已保存。",taskId};
}
