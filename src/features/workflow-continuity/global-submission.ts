import {z} from "zod";
import {parseDraftFields} from "./draft-contracts";
export const globalSubmissionNames={task:["title","todo_list_id","due_at","body_text","importance"],calendar:["subject","starts_at","ends_at","description","is_all_day"],shopping:["title","priceCny","necessity"],travel:["title","description"],project:["name","description","due_date"]} as const;
export type GlobalSubmissionKind=keyof typeof globalSubmissionNames;
export type GlobalSubmission={kind:GlobalSubmissionKind;intentId:string;raw:Record<string,string>;entries:Array<[string,string]>};
const schema=z.object({kind:z.enum(["task","calendar","shopping","travel","project"]),intentId:z.uuid(),raw:z.record(z.string(),z.string().max(20000)),entries:z.array(z.tuple([z.string().max(80),z.string().max(20000)])).max(12)}).strict();
export function readGlobalRaw(form:HTMLFormElement,kind:GlobalSubmissionKind){const data=new FormData(form),fields:Record<string,string>={};for(const name of globalSubmissionNames[kind])fields[name]=String(data.get(name)??"");return fields;}
export function parseGlobalSubmission(encoded:string,kind:GlobalSubmissionKind):GlobalSubmission|null{
 try{const result=schema.safeParse(JSON.parse(encoded));if(!result.success||result.data.kind!==kind)return null;const {raw,entries}=result.data;const names=globalSubmissionNames[kind] as readonly string[];if(Object.keys(raw).some(name=>!names.includes(name))||entries.some(([name])=>name!=="request_id"&&!names.includes(name))||new Set(entries.map(row=>row[0])).size!==entries.length||entries.find(([name])=>name==="request_id")?.[1]!==result.data.intentId)return null;const rawForSchema={...raw};if(kind==="calendar")delete rawForSchema.is_all_day;if(!parseDraftFields(`global.${kind}`,rawForSchema))return null;return result.data;}catch{return null;}
}
export function globalSubmissionForm(value:GlobalSubmission){const data=new FormData();for(const [name,raw] of value.entries)data.set(name,raw);return data;}
