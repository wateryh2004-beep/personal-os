import "server-only";
import { z } from "zod";
import { parseDraftFields } from "@/features/workflow-continuity/draft-contracts";
import { fixtureTrip } from "./continuous-domain-fixture-data";
import type { FixtureState } from "./continuous-fixture-state";
export function syntheticTripRead(state:FixtureState,id:unknown){if(id!==fixtureTrip.trip.id)return{ok:false};return{ok:true,trip:{...fixtureTrip.trip,destination_label:null,notes_markdown:"",...state.lifeRows.get(fixtureTrip.trip.id)},stops:fixtureTrip.stops.map(row=>({...row,...state.lifeRows.get(row.id)})),documents:fixtureTrip.documents,availableDocuments:fixtureTrip.availableDocuments};}
export function syntheticStopText(state:FixtureState,raw:unknown,readOnly:boolean){
 const value=z.object({intentId:z.uuid(),tripId:z.literal(fixtureTrip.trip.id),stopId:z.uuid(),fields:z.record(z.string(),z.union([z.string(),z.boolean(),z.array(z.string())]))}).strict().parse(raw),fields=parseDraftFields("travel.stop-text",value.fields);
 const parsed=z.object({placeName:z.string().trim().min(1).max(500),notes:z.string().trim().max(10000),expectedRevision:z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1)),dayNumber:z.string().refine(v=>!v||/^\d+$/.test(v)&&Number(v)>=1&&Number(v)<=366),plannedTime:z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),durationMinutes:z.string().refine(v=>!v||/^\d+$/.test(v)&&Number(v)>=1&&Number(v)<=10080)}).strict().safeParse(fields);
 if(!parsed.success)return{status:"rejected",code:"invalid",message:"地点输入无效。"};const input=parsed.data,current=state.lifeRows.get(value.stopId),signature=JSON.stringify(value),key=`stop-text:${value.intentId}`,prior=z.object({signature:z.string(),revision:z.number()}).safeParse(state.domainObjects.get(key));
 if(prior.success){if(prior.data.signature!==signature)return{status:"rejected",code:"conflict",message:"原提交内容不同。"};if(current?.mutation_revision!==prior.data.revision)return{status:"needs-check",message:"地点已有后续版本。"};return{status:"saved",id:value.stopId,savedFields:{expectedRevision:String(prior.data.revision)}};}
 if(!current||current.trip_id!==value.tripId)return{status:"rejected",code:"unavailable",message:"原地点不可用。"};
 if(readOnly)return{status:current.mutation_revision===input.expectedRevision?"missing":"needs-check",message:"原保存尚未核对，未重发。"};
 if(current.mutation_revision!==input.expectedRevision)return{status:"needs-check",message:"原地点版本已变化。"};
 const revision=input.expectedRevision+1;state.lifeRows.set(value.stopId,{...current,place_name:input.placeName,notes:input.notes||null,day_number:input.dayNumber?Number(input.dayNumber):null,planned_time:input.plannedTime||null,duration_minutes:input.durationMinutes?Number(input.durationMinutes):null,mutation_revision:revision});state.domainObjects.set(key,{signature,revision});state.writes["stop-text"]=(state.writes["stop-text"]??0)+1;return{status:"saved",id:value.stopId,savedFields:{expectedRevision:String(revision)}};
}
