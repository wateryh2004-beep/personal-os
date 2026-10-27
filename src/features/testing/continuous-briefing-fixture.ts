import "server-only";
import {z} from "zod";
import {fixtureBriefingEvents} from "./continuous-domain-fixture-data";
import {fixtureOwner,fixtureTimestamp} from "./continuous-fixture-data";
import type {FixtureState} from "./continuous-fixture-state";
export const syntheticEventWire=z.object({id:z.uuid(),user_id:z.uuid(),title:z.string(),revision:z.number().int(),created_at:z.string(),updated_at:z.string(),archived_at:z.string().nullable()}).strict();
export const syntheticSourceWire=z.object({id:z.uuid(),user_id:z.uuid(),event_id:z.uuid(),feed_item_id:z.uuid(),revision:z.number().int(),created_at:z.string(),updated_at:z.string(),archived_at:z.string().nullable()}).strict();
export function syntheticBriefingEvent(state:FixtureState,raw:unknown,readOnly:boolean){
 const value=readOnly?z.object({id:z.uuid(),expectedExists:z.boolean()}).strict().parse(raw):z.object({eventId:z.uuid(),revision:z.number().int().nonnegative(),title:z.string().trim().min(1).max(240),itemId:z.uuid(),linked:z.boolean()}).strict().parse(raw),id="eventId"in value?value.eventId:value.id;
 const existing=state.domainObjects.get(`briefing-event:${id}`)??fixtureBriefingEvents.events.find(row=>row.id===id),event=existing?syntheticEventWire.parse(existing):null;
 const sources=z.array(syntheticSourceWire).parse(state.domainObjects.get(`briefing-links:${id}`)??fixtureBriefingEvents.sources.filter(row=>row.event_id===id));
 if("expectedExists"in value){if(value.expectedExists&&!event)throw Error("synthetic_event_missing");return{event,sources,truncated:false};}
 if(value.revision!==(event?.revision??0))throw Error("synthetic_event_conflict");if(!fixtureBriefingEvents.items.some(row=>row.id===value.itemId))throw Error("synthetic_item_missing");
 const next={id,user_id:fixtureOwner,title:value.title,revision:value.revision+1,created_at:event?.created_at??fixtureTimestamp,updated_at:fixtureTimestamp,archived_at:null},previous=sources.find(row=>row.feed_item_id===value.itemId),source={id:previous?.id??crypto.randomUUID(),user_id:fixtureOwner,event_id:id,feed_item_id:value.itemId,revision:(previous?.revision??0)+1,created_at:previous?.created_at??fixtureTimestamp,updated_at:fixtureTimestamp,archived_at:value.linked?null:fixtureTimestamp};
 state.domainObjects.set(`briefing-event:${id}`,next);state.domainObjects.set(`briefing-links:${id}`,[...sources.filter(row=>row.feed_item_id!==value.itemId),source]);state.writes["briefing-event-source"]=(state.writes["briefing-event-source"]??0)+1;return{event:next,source};
}
