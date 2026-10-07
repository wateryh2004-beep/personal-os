import { beforeEach, describe, expect, it, vi } from "vitest";
const fake=vi.hoisted(()=>({extract:vi.fn(),status:vi.fn()}));
vi.mock("@/features/files/text-extraction",async original=>({...await original<typeof import("@/features/files/text-extraction")>(),extractPrivateDocument:fake.extract}));
vi.mock("@/features/system-status/service",()=>({recordStatusSafely:fake.status}));
import { extractDocumentForOwner } from "@/features/files/extraction-service";
let row: Record<string,unknown>;
function from(table:string) {
 const filters:Array<[string,unknown]>=[];let mutation:Record<string,unknown>|undefined;
 const query={select:()=>query,update:(value:Record<string,unknown>)=>{mutation=value;return query;},eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},
  is:(key:string,value:unknown)=>{filters.push([key,value]);return query;},in:(key:string,values:unknown[])=>{filters.push([key,values]);return query;},
  insert:async()=>({error:null}),maybeSingle:async()=>{if(table!=="documents")return{data:null,error:null};
   if(!filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value))return{data:null,error:null};
   if(mutation)Object.assign(row,mutation,{updated_at:"claimed-version"});return{data:{...row},error:null};}};
 return query;
}
const input={supabase:{from} as unknown as Parameters<typeof extractDocumentForOwner>[0]["supabase"],userId:"owner",documentId:"document"};
beforeEach(()=>{vi.clearAllMocks();row={id:"document",user_id:"owner",storage_provider:"cloudflare_r2",storage_state:"available",storage_path:"owner/files/document/sealed.pdf",storage_bucket:"private",file_size:100,checksum:"a".repeat(64),original_filename:"scan.pdf",mime_type:"application/pdf",text_extraction_status:"pending",extracted_character_count:0,updated_at:"old-version",archived_at:null};});
describe("text-layer / OCR races",()=>{
 it.each(["empty-layer-error","successful-old-layer"])("does not overwrite OCR that wins while %s is running",async kind=>{
  fake.extract.mockImplementation(async()=>{Object.assign(row,{text_extraction_status:"completed",extracted_text:"OCR 搜索结果",extracted_character_count:8,updated_at:"ocr-version"});
   if(kind==="empty-layer-error")throw Error("no_extractable_text");return{text:"old layer",characterCount:9};});
  expect(await extractDocumentForOwner(input)).toEqual({status:"completed",characterCount:8});
  expect(row.extracted_text).toBe("OCR 搜索结果");expect(row.text_extraction_status).toBe("completed");expect(fake.status).not.toHaveBeenCalled();
 });
 it("rejects stale legacy extraction when the original changes",async()=>{
  fake.extract.mockImplementation(async()=>{Object.assign(row,{storage_path:"owner/files/document/replaced.pdf",checksum:"b".repeat(64),text_extraction_status:"not_requested",extracted_text:null,updated_at:"replacement-version"});return{text:"stale",characterCount:5};});
  expect(await extractDocumentForOwner(input)).toEqual({status:"not_requested",characterCount:0});expect(row.extracted_text).toBeNull();
 });
 it("does not rerun or erase completed image OCR",async()=>{
  Object.assign(row,{mime_type:"image/png",original_filename:"scan.png",text_extraction_status:"completed",extracted_character_count:120,extracted_text:"recognized"});
  expect(await extractDocumentForOwner(input)).toEqual({status:"completed",characterCount:120});expect(fake.extract).not.toHaveBeenCalled();expect(row.extracted_text).toBe("recognized");
 });
});
