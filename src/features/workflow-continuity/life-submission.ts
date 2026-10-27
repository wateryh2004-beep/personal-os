import {z} from "zod";
import {lifeFieldInputSchema,type LifeFieldInput,type LifeFieldRow} from "@/features/life/contracts";
import {parseDraftFields,type DraftFields,type DraftOperation} from "./draft-contracts";
export type LifeFormSubmission={input:LifeFieldInput;fields:DraftFields};
export function encodeLifeSubmission(input:LifeFieldInput,fields:DraftFields){const raw={...fields};delete raw.submitted_input;return JSON.stringify({input,fields:raw});}
export function parseLifeSubmission(encoded:string,operation:DraftOperation,expectedOperation:LifeFieldInput["operation"],ids:readonly string[]):LifeFormSubmission|null{
 try{const value=z.object({input:lifeFieldInputSchema,fields:z.unknown()}).strict().safeParse(JSON.parse(encoded));if(!value.success||value.data.input.operation!==expectedOperation||value.data.input.items.map(row=>row.id).sort().join(",")!==[...ids].sort().join(","))return null;const fields=parseDraftFields(operation,{...(value.data.fields as DraftFields),submitted_input:encoded});return fields?{input:value.data.input,fields}:null;}catch{return null;}
}
/** A historical receipt is not the current desired value after a later edit/undo. */
export function lifeSubmissionStillCurrent(input:LifeFieldInput,rows:LifeFieldRow[]):boolean{
 return input.items.every(item=>{
  const row=rows.find(row=>row.id===item.id&&(input.operation!=="travel_document"||("document_id" in item&&row.document_id===item.document_id)));
  if(!row||row.mutation_revision!==item.expected_revision+1)return false;
  switch(input.operation){
   case "shopping_quantity": {const desired=input.items.find(value=>value.id===item.id)!;return (desired.quantity===null?row.quantity===null:Number(row.quantity)===Number(desired.quantity))&&row.quantity_unit===desired.quantity_unit;}
   case "shopping_purchased":return row.status==="purchased";
   case "travel_stop_metadata":{const desired=input.items.find(value=>value.id===item.id)!;return row.day_number===desired.day_number&&(typeof row.planned_time==="string"?row.planned_time.slice(0,5):row.planned_time)===(desired.planned_time?.slice(0,5)??null)&&row.duration_minutes===desired.duration_minutes;}
   case "travel_document":{const desired=input.items.find(value=>value.id===item.id)!;return row.document_id===desired.document_id&&row.linked===desired.linked;}
   case "leisure_progress":{const desired=input.items.find(value=>value.id===item.id)!;return row.progress_unit===desired.progress_unit&&row.progress_value===desired.progress_value&&row.progress_total===desired.progress_total;}
   default:return false;
  }
 });
}
