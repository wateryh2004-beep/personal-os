import "server-only";
import { z } from "zod";
import { createCalendarEventSchema, updateCalendarEventSchema } from "@/features/calendar/schemas";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureUnknownTask } from "./continuous-domain-fixture-data";
import { fixtureTask, fixtureTimestamp } from "./continuous-fixture-data";
const entriesSchema=z.array(z.tuple([z.string().max(100),z.string().max(10000)])).max(50);
const receiptSchema=z.object({signature:z.string(),eventId:z.uuid(),operationId:z.uuid()}).strict();
export function syntheticCalendarAction(state:FixtureState,path:string,raw:unknown){
 const form=new FormData();for(const[key,value]of entriesSchema.parse(raw))form.append(key,value);
 const request=z.uuid().safeParse(form.get("inbox_id")||form.get("request_id"));if(!request.success)return{status:"error",message:"原日程请求编号无效。"};
 const choice=String(form.get("category_choice")||""),explicit=String(form.get("classification_mode")||""),base={subject:String(form.get("subject")||""),description:String(form.get("description")||""),startsAt:String(form.get("starts_at")||""),endsAt:String(form.get("ends_at")||""),locationName:String(form.get("location_name")||""),isAllDay:form.get("is_all_day")==="on",importance:String(form.get("importance")||"normal"),showAs:String(form.get("show_as")||"busy"),classificationMode:explicit||(choice==="__none"?"none":choice&&!choice.startsWith("__")?"manual":"auto"),primaryCategoryKey:String(form.get("primary_category_key")||(choice.startsWith("__")?"":choice))||null,contextCategoryKeys:form.getAll("context_category_keys").map(String),classificationConfidence:null,classificationReason:null};
 const editing=path.startsWith("calendar-edit"),parsed=editing?updateCalendarEventSchema.safeParse({...base,providerEventId:String(form.get("provider_event_id")||""),originalSubject:String(form.get("original_subject")||""),originalStartsAt:String(form.get("original_starts_at")||""),originalEndsAt:String(form.get("original_ends_at")||""),preserveCategories:form.get("preserve_categories")!=="false"}):createCalendarEventSchema.safeParse(base);
 if(!parsed.success)return{status:"error",message:"请检查日程标题和时间。"};
 const sourceTask=String(form.get("source_task_id")||""),signature=JSON.stringify({input:parsed.data,sourceTask,modified:String(form.get("source_task_modified")||"")}),key=`calendar-intent:${request.data}`,prior=receiptSchema.safeParse(state.domainObjects.get(key));
 if(prior.success){if(prior.data.signature!==signature)return{status:"error",message:"原日程请求已对应其他内容。"};return state.events.some(event=>event.id===prior.data.eventId)?{status:"success",message:"已核对原日程记录。",operationId:prior.data.operationId}:{status:"error",message:"原日程当前不可读，不会另建。"};}
 if(path.endsWith("-read"))return{status:"error",message:"尚未核对到原日程，未重复发送。"};
 if(sourceTask){const rawTask=state.domainObjects.get(`todo:${sourceTask}`)??([fixtureTask,fixtureUnknownTask].find(task=>task.id===sourceTask)??null);const task=z.object({id:z.uuid(),status:z.string(),lastModifiedAt:z.string().nullable()}).passthrough().safeParse(rawTask);if(!task.success||task.data.status==="completed"||String(form.get("source_task_modified")||"")!==(task.data.lastModifiedAt??""))return{status:"error",message:"来源任务已完成或版本变化，未创建日程。"};}
 const value=parsed.data;
 let eventId:string;
 if("providerEventId"in value){const event=state.events.find(event=>event.provider_event_id===value.providerEventId);if(!event||event.subject!==value.originalSubject||event.starts_at!==value.originalStartsAt||event.ends_at!==value.originalEndsAt)return{status:"error",message:"原日程已有新版本，输入已保留。"};Object.assign(event,{subject:parsed.data.subject,body_text:parsed.data.description,starts_at:parsed.data.startsAt,ends_at:parsed.data.endsAt,location_name:parsed.data.locationName,is_all_day:parsed.data.isAllDay,importance:parsed.data.importance,show_as:parsed.data.showAs});eventId=event.id;}
 else{eventId=crypto.randomUUID();state.events.push({id:eventId,provider_event_id:`synthetic-${request.data}`,subject:value.subject,body_text:value.description,starts_at:value.startsAt,ends_at:value.endsAt,is_all_day:value.isAllDay,location_name:value.locationName,categories:[],importance:value.importance,show_as:value.showAs,last_synced_at:fixtureTimestamp});}
 state.domainObjects.set(key,{signature,eventId,operationId:request.data});state.writes[editing?"calendar-provider-edit":"calendar-provider-create"]=(state.writes[editing?"calendar-provider-edit":"calendar-provider-create"]??0)+1;
 return{status:"success",message:"合成日程已保存。",operationId:request.data};
}
