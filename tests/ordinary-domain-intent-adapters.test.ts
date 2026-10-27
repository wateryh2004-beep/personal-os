import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({owner:vi.fn(),from:vi.fn(),records:new Map<string,Record<string,unknown>>(),reads:[] as Array<{table:string;filters:Array<[string,unknown]>}>,writes:[] as string[],failAudit:false}));
vi.mock("@/lib/auth/require-owner",()=>({requireOwner:api.owner}));
vi.mock("@/lib/workspace-revalidation",()=>({revalidatePath:vi.fn()}));
import {readProjectCreationIntent,submitProjectCreationIntent} from "@/features/projects/creation-intents";
import {readPurchaseCreationIntent,submitPurchaseCreationIntent} from "@/features/shopping/creation-intents";
import {readTravelCreationIntent,submitTravelCreationIntent} from "@/features/travel/create-intents";
import {readTripStopTextIntent,submitTripStopTextIntent} from "@/features/travel/stop-text-intents";
import {projectSchema} from "@/features/projects/schemas";
import {shoppingItemCreateSchema} from "@/features/shopping/schemas";
const id="11111111-1111-4111-8111-111111111111",trip="22222222-2222-4222-8222-222222222222",stop="33333333-3333-4333-8333-333333333333";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const project={name:"Original project",description:"Details",due_date:"2026-11-01"};
const shopping={title:"Original purchase",priceCny:"2",necessity:"unknown"};
const travel={kind:"trip" as const,intentId:id,title:"Original trip",description:"Details"};
const text={placeName:"Original stop",notes:"Original notes",expectedRevision:"4",dayNumber:"1",plannedTime:"09:00",durationMinutes:"30"};
beforeEach(()=>{vi.clearAllMocks();api.records.clear();api.reads.length=0;api.writes.length=0;api.failAudit=false;api.owner.mockResolvedValue({userId:"A",supabase:{from:api.from}});api.from.mockImplementation((table:string)=>{
 const read={table,filters:[] as Array<[string,unknown]>};api.reads.push(read);let inserted:Record<string,unknown>|null=null,updated:Record<string,unknown>|null=null;
 const execute=()=>{if(inserted||updated){api.writes.push(table);if(table==="audit_logs"&&api.failAudit)return {data:null,error:{message:"synthetic audit unavailable"}};const row={...api.records.get(table),...(inserted??updated)};api.records.set(table,row);return {data:row,error:null};}const row=api.records.get(table);return {data:row&&read.filters.every(([name,value])=>row[name]===value)?row:null,error:null,count:0};};
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn((name,value)=>{read.filters.push([name,value]);return query;}),is:vi.fn((name,value)=>{read.filters.push([name,value]);return query;}),insert:vi.fn((value)=>{inserted=value;return query;}),update:vi.fn((value)=>{updated=value;return query;}),maybeSingle:vi.fn(async()=>execute()),single:vi.fn(async()=>execute()),then:(resolve:(value:ReturnType<typeof execute>)=>unknown)=>Promise.resolve(execute()).then(resolve)};return query;
});});
function receipt(action:string,entity:string,value:unknown,extra:Record<string,unknown>={}){api.records.set("audit_logs",{id,user_id:"A",action,entity_type:entity,entity_id:entity==="trip_stop"?stop:id,after_data:{intent_fingerprint:hash(value),...extra}});}
it("all local creation readers require exact owned receipt and canonical fields with no writes",async()=>{
 api.records.set("projects",{id,user_id:"A",...project});receipt("create","project",projectSchema.parse(project));expect(await readProjectCreationIntent(id,project)).toMatchObject({status:"saved",id});
 const normalized=shoppingItemCreateSchema.parse({title:shopping.title,priceCny:shopping.priceCny,quantity:null,quantityUnit:null,necessity:"unknown",necessityConfirmed:false,reasonToBuy:undefined});api.records.set("purchase_items",{id,user_id:"A",title:shopping.title,price_cny:2,quantity:null,quantity_unit:null,necessity:"unknown",necessity_confirmed:false,reason_to_buy:null});receipt("purchase_item_create","purchase_item",normalized);expect(await readPurchaseCreationIntent(id,shopping)).toMatchObject({status:"saved",id});
 api.records.set("trips",{id,user_id:"A",title:travel.title,description:travel.description});receipt("trip_create","trip",travel);expect(await readTravelCreationIntent(travel)).toMatchObject({status:"saved",id});expect(api.writes).toEqual([]);expect(api.reads.every(read=>read.filters.some(([name,value])=>name==="user_id"&&value==="A"))).toBe(true);
});
it("later canonical changes and another owner never confirm an original creation",async()=>{
 api.records.set("projects",{id,user_id:"A",...project,name:"Later changed"});receipt("create","project",projectSchema.parse(project));expect(await readProjectCreationIntent(id,project)).toMatchObject({status:"needs-check"});api.owner.mockResolvedValue({userId:"B",supabase:{from:api.from}});expect(await readProjectCreationIntent(id,project)).toMatchObject({status:"missing"});expect(api.writes).toEqual([]);
});
it.each(["project","purchase","trip"])("%s row written but audit missing stays unknown and a second explicit submission does not insert again",async kind=>{
 api.failAudit=true;const submit=()=>kind==="project"?submitProjectCreationIntent(id,project):kind==="purchase"?submitPurchaseCreationIntent(id,shopping):submitTravelCreationIntent(travel);expect(await submit()).toMatchObject({status:"needs-check"});const count=api.writes.length;expect(count).toBe(2);expect(await submit()).toMatchObject({status:"needs-check"});expect(api.writes).toHaveLength(count);
});
it("stop text read checks exact owner/trip/fingerprint and canonical revision; it never replays an update",async()=>{
 const normalized={tripId:trip,stopId:stop,placeName:text.placeName,notes:text.notes,expectedRevision:4,dayNumber:text.dayNumber,plannedTime:text.plannedTime,durationMinutes:text.durationMinutes};api.records.set("trip_stops",{id:stop,user_id:"A",trip_id:trip,mutation_revision:5,place_name:text.placeName,notes:text.notes,day_number:1,planned_time:"09:00:00",duration_minutes:30});receipt("trip_stop_update","trip_stop",normalized,{mutation_revision:5});expect(await readTripStopTextIntent(id,trip,stop,text)).toMatchObject({status:"saved",savedFields:{expectedRevision:"5"}});api.records.get("trip_stops")!.mutation_revision=8;expect(await readTripStopTextIntent(id,trip,stop,text)).toMatchObject({status:"needs-check"});expect(await submitTripStopTextIntent(id,trip,stop,{...text,notes:"Other frozen intent"})).toMatchObject({status:"rejected",code:"conflict"});expect(api.writes).toEqual([]);
});
it("missing or hidden stop parent blocks writes and preserves the same intent for checking",async()=>{
 api.records.set("trip_stops",{id:stop,user_id:"A",trip_id:trip,mutation_revision:4});expect(await submitTripStopTextIntent(id,trip,stop,text)).toMatchObject({status:"rejected",code:"unavailable"});expect(api.writes).toEqual([]);
});
