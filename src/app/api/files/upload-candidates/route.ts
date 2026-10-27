import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
const schema=z.object({files:z.array(z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(255),size:z.number().int().positive().max(100*1024*1024),checksum:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict()).min(1).max(50)}).strict();
const headers={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"};
export async function POST(request:Request){
 try{
  const {supabase,userId}=await requireOwnerApi();
  if(Number(request.headers.get("content-length")??0)>32_768)return Response.json({error:"文件列表过大。"},{status:413,headers});
  const reader=request.body?.getReader(); if(!reader)return Response.json({error:"文件列表无效。"},{status:400,headers});
  let bytes=0,text="";const decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>32_768)return Response.json({error:"文件列表过大。"},{status:413,headers});text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  let raw:unknown;try{raw=JSON.parse(text);}catch{return Response.json({error:"文件列表无效。"},{status:400,headers});}
  const parsed=schema.safeParse(raw);
  if(!parsed.success)return Response.json({error:"文件列表无效。"},{status:400,headers});
  const matches=await Promise.all(parsed.data.files.map(async input=>{
   let query=supabase.from("documents").select("id,title,original_filename,file_size,checksum,folder_id").eq("user_id",userId).eq("storage_state","available").is("archived_at",null).is("vault_group_id",null).eq("file_size",input.size);
   query=input.checksum?query.eq("checksum",input.checksum):query.eq("original_filename",input.name);
   const {data,error}=await query.order("created_at",{ascending:false}).limit(4);
   if(error)throw new Error("candidate_read_failed");
   return {id:input.id,candidates:(data??[]).map(row=>({id:row.id,title:row.title,folderId:row.folder_id,match:input.checksum?"content":"possible"}))};
  }));
  return Response.json({matches},{headers});
 }catch(error){return apiAuthenticationFailure(error)??Response.json({error:"暂未完成重复检查，仍可单独上传。"},{status:503,headers});}
}
