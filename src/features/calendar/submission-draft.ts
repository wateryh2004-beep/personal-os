import {z} from "zod";
import {parseDraftFields,type DraftFields} from "@/features/workflow-continuity/draft-contracts";
const names=["request_id","subject","description","location_name","starts_at","ends_at","is_all_day","is_all_day_present","importance","show_as","category_choice","classification_mode","primary_category_key","context_category_keys","preserve_categories","inbox_id","source_task_id","source_task_modified","provider_event_id","original_subject","original_starts_at","original_ends_at"] as const;
const schema=z.object({operation:z.enum(["calendar.create","calendar.edit"]),entries:z.array(z.tuple([z.enum(names),z.string().max(10000)])).max(40),fields:z.unknown()}).strict();
export type CalendarSubmission={operation:"calendar.create"|"calendar.edit";entries:Array<[typeof names[number],string]>;fields:DraftFields};
export function makeCalendarSubmission(form:HTMLFormElement,operation:CalendarSubmission["operation"],fields:DraftFields):CalendarSubmission{
 const data=new FormData(form),entries:CalendarSubmission["entries"]=[];for(const name of names)for(const value of data.getAll(name))if(typeof value==="string")entries.push([name,value]);
 const raw={...fields};delete raw.submitted_input;return {operation,entries,fields:raw};
}
export function parseCalendarSubmission(encoded:string,operation:CalendarSubmission["operation"]):CalendarSubmission|null{
 try{const result=schema.safeParse(JSON.parse(encoded));if(!result.success||result.data.operation!==operation)return null;const fields=parseDraftFields(operation,result.data.fields);if(!fields)return null;for(const name of names)if(name!=="context_category_keys"&&result.data.entries.filter(row=>row[0]===name).length>1)return null;const request=result.data.entries.find(row=>row[0]==="request_id")?.[1];if(!z.uuid().safeParse(request).success)return null;return {...result.data,fields};}catch{return null;}
}
export function calendarSubmissionForm(value:CalendarSubmission){const form=new FormData();for(const [key,raw] of value.entries)form.append(key,raw);return form;}
