import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { MultipartError, multipartService } from "@/features/files/multipart-service";
import { multipartOperationSchema } from "@/features/files/multipart-upload";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const headers={"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie","X-Content-Type-Options":"nosniff"};
async function handle(request:Request,action:(service:ReturnType<typeof multipartService>)=>Promise<unknown>) {
  try {
    const {userId}=await requireOwnerApi();
    if(!isR2Configured()) throw new MultipartError(503,"Files 尚未完成云端存储配置。");
    // Mutations are same-origin JSON. No permissive CORS on owner endpoints.
    if(request.method!=="GET" && request.headers.has("origin") && request.headers.get("origin")!==new URL(request.url).origin) throw new MultipartError(403,"请求来源无效。");
    return Response.json(await action(multipartService(userId)),{headers});
  } catch(error) {
    const auth=apiAuthenticationFailure(error);if(auth)return auth;
    return Response.json({error:error instanceof MultipartError?error.message:"续传暂时未完成；已上传的分片会保留，请稍后重试。"},{status:error instanceof MultipartError?error.status:503,headers});
  }
}
function sessionId(request:Request) { const parsed=z.string().uuid().safeParse(new URL(request.url).searchParams.get("sessionId")); if(!parsed.success)throw new MultipartError(400,"上传标识无效。");return parsed.data; }
async function json(request:Request) {
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json" || Number(request.headers.get("content-length")??0)>4096)throw new MultipartError(400,"请求格式无效。");
  const reader=request.body?.getReader();let text="";let bytes=0;const decoder=new TextDecoder();
  if(!reader)throw new MultipartError(400,"请求格式无效。");
  try { while(true) { const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096)throw new MultipartError(400,"请求过大。");text+=decoder.decode(value,{stream:true}); }text+=decoder.decode(); }
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  try{return JSON.parse(text) as unknown;}catch{throw new MultipartError(400,"请求格式无效。");}
}
export async function GET(request:Request) { return handle(request,service=>new URL(request.url).searchParams.has("sessionId")?service.get(sessionId(request)):service.list()); }
export async function POST(request:Request) { return handle(request,async service=>service.create(await json(request))); }
export async function PATCH(request:Request) { return handle(request,async service=>{
  const parsed=multipartOperationSchema.safeParse(await json(request));if(!parsed.success)throw new MultipartError(400,"上传操作无效。");
  return parsed.data.action==="sign"?service.sign(parsed.data.sessionId,parsed.data.partNumber):service.complete(parsed.data.sessionId);
}); }
export async function DELETE(request:Request) { return handle(request,async service=>{await service.cancel(sessionId(request));return {ok:true};}); }
