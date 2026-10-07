import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { abortR2Multipart, beginR2Multipart, completeR2Multipart, isMissingR2Multipart, listR2MultipartParts, r2BucketName, readR2ObjectStream, signR2MultipartPart } from "@/lib/adapters/cloudflare-r2";
import { canUpload, safeFilename } from "./schemas";
import { initialExtractionStatus } from "./text-extraction";
import { verifyFileStream } from "./integrity";
import { expectedPartSize, multipartCreateSchema, multipartPartSize, validateMultipartParts, type MultipartSnapshot, type MultipartStatus } from "./multipart-upload";

export class MultipartError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
type Session = { id: string; user_id: string; document_id: string; storage_path: string; storage_bucket: string; upload_id: string | null; file_size: number; checksum: string; status: MultipartStatus; expires_at: string };
type Document = { id: string; title: string; original_filename: string; mime_type: string; file_size: number; folder_id: string | null; text_extraction_status: MultipartSnapshot["file"]["textExtractionStatus"]; storage_state: string; archived_at: string | null; storage_path: string; storage_bucket: string; checksum: string; upload_mode: string };
const documentColumns = "id,title,original_filename,mime_type,file_size,folder_id,text_extraction_status,storage_state,archived_at,storage_path,storage_bucket,checksum,upload_mode";
const busy = () => new MultipartError(409,"上传状态正在确认，请稍后重试；已完成的分片会保留。");

/** Authenticated API supplies userId. Session storage uses the existing server-only client. */
export function multipartService(userId: string, admin = createAdminClient()) {
  async function load(id: string) {
    const session = await admin.from("file_upload_sessions").select("*").eq("id",id).eq("user_id",userId).maybeSingle();
    if (session.error) throw new MultipartError(503,"暂时无法读取续传状态。");
    if (!session.data) throw new MultipartError(404,"续传记录不存在。");
    const s = session.data as Session;
    const result = await admin.from("documents").select(documentColumns).eq("id",s.document_id).eq("user_id",userId).eq("storage_provider","cloudflare_r2").maybeSingle();
    const d = result.data as Document | null;
    if (result.error || !d || d.archived_at || (!["pending","available"].includes(d.storage_state) && !(d.storage_state==="cancelled" && s.status==="aborted")) || d.upload_mode !== "multipart" ||
        s.storage_bucket !== r2BucketName() || d.storage_bucket !== s.storage_bucket || Number(d.file_size)!==Number(s.file_size) || d.checksum!==s.checksum ||
        !s.storage_path.startsWith(`${userId}/files/${s.document_id}/`) || (d.storage_state === "pending" && d.storage_path !== s.storage_path))
      throw new MultipartError(409,"文件状态已变化，请刷新检查。");
    return { s,d };
  }
  async function claim(s: Session, operation: "initialize" | "complete" | "abort") {
    const token=randomUUID();
    const result=await admin.rpc("claim_file_upload_operation",{p_user_id:userId,p_session_id:s.id,p_operation:operation,p_token:token});
    if (result.error || result.data !== true) throw busy();
    return token;
  }
  async function finish(s: Session, token: string, status: MultipartStatus, uploadId = s.upload_id) {
    const result=await admin.from("file_upload_sessions").update({status,upload_id:uploadId,lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()})
      .eq("id",s.id).eq("user_id",userId).eq("lease_token",token)
      .eq("status",status==="uploading"?"initializing":status==="aborted"?"aborting":"completing").select("id").maybeSingle();
    if (result.error || !result.data) throw busy();
  }
  function active(s: Session) {
    if (Date.parse(s.expires_at)<=Date.now()) throw new MultipartError(410,"续传已过期，请取消此记录后重新选择文件上传。");
    if (["aborting","aborted","expired"].includes(s.status)) throw new MultipartError(409,"此上传已取消或过期。");
  }
  async function snapshot(s: Session,d: Document,inspectParts = true): Promise<MultipartSnapshot> {
    let status = d.storage_state === "available" ? "completed" as const : s.status;
    if (status !== "completed" && Date.parse(s.expires_at)<=Date.now()) status="expired";
    let parts: MultipartSnapshot["parts"] = [];
    if (inspectParts && status === "uploading" && s.upload_id) {
      try { parts=validateMultipartParts(await listR2MultipartParts(s.storage_path,s.upload_id),Number(s.file_size)).map(({partNumber,size})=>({partNumber,size})); }
      catch(error) { if (isMissingR2Multipart(error)) status="expired"; else throw error; }
    }
    return { sessionId:s.id,documentId:d.id,status,filename:d.original_filename,contentType:d.mime_type,size:Number(s.file_size),checksum:s.checksum,folderId:d.folder_id,
      partSize:multipartPartSize,expiresAt:s.expires_at,parts,
      file:{id:d.id,title:d.title,originalFilename:d.original_filename,mimeType:d.mime_type,fileSize:Number(s.file_size),folderId:d.folder_id,textExtractionStatus:d.text_extraction_status} };
  }
  return {
    async create(input: unknown) {
      const parsed=multipartCreateSchema.safeParse(input);
      if (!parsed.success || !canUpload(parsed.data.filename,parsed.data.contentType,parsed.data.size)) throw new MultipartError(400,"文件类型或大小无效；单个文件最多 100 MiB。");
      const value=parsed.data, filename=safeFilename(value.filename);
      const identity=createHash("sha256").update(JSON.stringify([value.checksum,value.size,value.contentType,value.folderId??null,filename])).digest("hex");
      const prepared=await admin.rpc("prepare_file_upload_session",{p_user_id:userId,p_identity_key:identity,p_filename:filename,p_content_type:value.contentType,p_file_size:value.size,p_checksum:value.checksum,p_folder_id:value.folderId??null,p_bucket:r2BucketName(),p_extraction_status:initialExtractionStatus(filename,value.contentType,value.size)});
      if (prepared.error || !prepared.data) throw new MultipartError(503,"暂时无法准备断点续传，请稍后重试。");
      let {s,d}=await load((prepared.data as Session).id);
      if (s.status === "initializing") {
        const token=await claim(s,"initialize");
        const uploadId=await beginR2Multipart(s.storage_path,d.mime_type);
        await finish(s,token,"uploading",uploadId);
        ({s,d}=await load(s.id));
      }
      return snapshot(s,d);
    },
    async get(id: string) { const {s,d}=await load(id); return snapshot(s,d); },
    async list() {
      const result=await admin.from("file_upload_sessions").select("id").eq("user_id",userId).in("status",["initializing","uploading","completing","uploaded","aborting","expired","failed"]).order("updated_at",{ascending:false}).limit(20);
      if (result.error) throw new MultipartError(503,"暂时无法列出未完成的上传。");
      const sessions: MultipartSnapshot[]=[];
      for (const row of result.data??[]) {
        try { const {s,d}=await load(row.id); if(d.storage_state!=="available") sessions.push(await snapshot(s,d,false)); }
        catch(error) { if (!(error instanceof MultipartError && error.status===409)) throw error; }
      }
      return sessions;
    },
    async sign(id: string,partNumber: number) {
      const {s,d}=await load(id); active(s);
      if(s.status!=="uploading" || !s.upload_id || d.storage_state!=="pending") throw busy();
      const size=expectedPartSize(Number(s.file_size),partNumber);
      return {uploadUrl:await signR2MultipartPart(s.storage_path,s.upload_id,partNumber,size),size};
    },
    async complete(id: string) {
      const {s,d}=await load(id);
      if(d.storage_state==="available" || s.status==="uploaded") return snapshot(s,d);
      active(s);
      if(!s.upload_id) throw busy();
      // Validate authoritative geometry before acquiring the terminal-operation lease.
      let parts;
      try { parts=validateMultipartParts(await listR2MultipartParts(s.storage_path,s.upload_id),Number(s.file_size),true); }
      catch(error) {
        if (!isMissingR2Multipart(error) || s.status!=="completing") {
          if(error instanceof Error && error.message==="incomplete_multipart_parts") throw new MultipartError(409,"部分分片尚未完成，请重新选择原文件继续。");
          throw error;
        }
      }
      const token=await claim(s,"complete");
      if(parts) await completeR2Multipart(s.storage_path,s.upload_id,parts);
      // Also recovers CompleteMultipartUpload success followed by a lost response.
      // Content is checked before changing status, never inferred from NoSuchUpload.
      try {
        const object=await readR2ObjectStream(s.storage_path);
        if(object.size!==Number(s.file_size)) { await object.body.cancel(); throw new Error("file_size_mismatch"); }
        await verifyFileStream(object.body,Number(s.file_size),s.checksum);
      } catch(error) {
        if(error instanceof Error && ["file_size_mismatch","file_checksum_mismatch"].includes(error.message)) {
          await finish(s,token,"failed");
          throw new MultipartError(409,"文件校验未通过，尚未保存；请取消此上传后重新选择原文件。");
        }
        throw error;
      }
      await finish(s,token,"uploaded");
      return snapshot({...s,status:"uploaded"},d);
    },
    async cancel(id: string) {
      const {s,d}=await load(id);
      if(s.status==="aborted") return;
      if(d.storage_state!=="pending") throw new MultipartError(409,"文件已经保存，不能取消上传。");
      const token=await claim(s,"abort");
      if(s.upload_id) await abortR2Multipart(s.storage_path,s.upload_id);
      const finalized=await admin.rpc("finish_file_upload_abort",{p_user_id:userId,p_session_id:s.id,p_token:token});
      if(finalized.error || finalized.data!==true)throw busy();
      // Retain explicit terminal metadata; never delete a document or completed object.
    },
  };
}

/** Old finalization URLs cannot bypass the multipart state machine. */
export async function multipartIsReady(userId: string,documentId: string) {
  const result=await createAdminClient().from("file_upload_sessions").select("status").eq("user_id",userId).eq("document_id",documentId).maybeSingle();
  return !result.error && !!result.data && ["uploaded","completed"].includes(result.data.status);
}


export async function publishMultipartFile(userId:string,documentId:string,sourcePath:string,finalPath:string,checksum:string) {
  try {
    const result=await createAdminClient().rpc("publish_file_upload_session",{p_user_id:userId,p_document_id:documentId,p_source_path:sourcePath,p_final_path:finalPath,p_checksum:checksum});
    return { data:result.data===true?{id:documentId}:null,error:result.error };
  } catch { return {data:null,error:{message:"multipart_publication_unavailable"}}; }
}
