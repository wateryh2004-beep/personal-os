import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { copyVerifiedR2Object, createUploadUrl, readR2ObjectStream, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { canUpload, safeFilename } from "@/features/files/schemas";
import { verifyFileStream } from "@/features/files/integrity";
import { readVaultJson, requireVault, sameOrigin, sessionArgs, VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const schema = z.object({ filename: z.string().min(1).max(240), contentType: z.string().min(1).max(200), size: z.number().int().min(1).max(104857600), folderId: z.string().uuid().nullable(), checksum: z.string().regex(/^[a-f0-9]{64}$/) });
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const input = schema.safeParse(await readVaultJson(request, 4096));
    if (!input.success || !canUpload(input.data.filename, input.data.contentType, input.data.size)) throw new VaultError(400, "文件类型或大小不受支持，最大 100 MB。");
    const { filename, contentType, size, folderId, checksum } = input.data;
    let group = randomUUID();
    if (folderId) {
      const folder = await owner.admin.from("file_folders").select("vault_group_id").eq("id", folderId).eq("user_id", owner.userId).not("vault_group_id", "is", null).maybeSingle();
      if (folder.error || !folder.data) throw new VaultError(404, "文件夹不可用。");
      group = folder.data.vault_group_id;
    }
    const name = safeFilename(filename);
    let pendingQuery = owner.admin.from("documents").select("id,storage_path")
      .eq("user_id", owner.userId).not("vault_group_id", "is", null).eq("storage_state", "pending")
      .eq("storage_provider", "cloudflare_r2").eq("checksum", checksum).eq("file_size", size)
      .eq("mime_type", contentType).eq("original_filename", name);
    pendingQuery = folderId ? pendingQuery.eq("folder_id", folderId) : pendingQuery.is("folder_id", null);
    const pending = await pendingQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pending.error) throw new VaultError(503, "暂时无法检查未完成上传。");
    if (pending.data && pending.data.storage_path.startsWith(`${owner.userId}/files/${pending.data.id}/`)) {
      return Response.json({ id: pending.data.id, uploadUrl: await createUploadUrl(pending.data.storage_path, contentType) }, { headers: vaultHeaders });
    }
    const id = randomUUID();
    const path = `${owner.userId}/files/${id}/${name}`;
    const saved = await owner.admin.from("documents").insert({ id, user_id: owner.userId, title: name, document_type: "other", original_filename: name,
      storage_provider: "cloudflare_r2", storage_bucket: r2BucketName(), storage_path: path, storage_state: "pending", mime_type: contentType, file_size: size,
      checksum, folder_id: folderId, vault_group_id: group, ai_visibility: "never", text_extraction_status: "not_requested" });
    if (saved.error) throw new VaultError(503, "上传准备未完成。");
    return Response.json({ id, uploadUrl: await createUploadUrl(path, contentType) }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const input = z.object({ id: z.string().uuid() }).safeParse(await readVaultJson(request, 4096));
    if (!input.success) throw new VaultError(400, "文件标识无效。");
    const result = await owner.admin.from("documents").select("id,storage_state,storage_path,original_filename,file_size,checksum")
      .eq("id", input.data.id).eq("user_id", owner.userId).not("vault_group_id", "is", null).eq("storage_provider", "cloudflare_r2").maybeSingle();
    const file = result.data;
    if (result.error || !file || !file.storage_path.startsWith(`${owner.userId}/files/${file.id}/`)) throw new VaultError(404, "上传不可用。");
    if (file.storage_state === "available") return Response.json({ saved: true }, { headers: vaultHeaders });
    if (file.storage_state !== "pending") throw new VaultError(409, "上传状态已变化。");
    const source = await readR2ObjectStream(file.storage_path, request.signal);
    if (source.size !== Number(file.file_size) || !source.etag) { await source.body.cancel(); throw new VaultError(409, "原件尚未完整上传。"); }
    await verifyFileStream(source.body, Number(file.file_size), file.checksum);
    const finalPath = `${owner.userId}/files/${file.id}/sealed-${randomUUID()}/${safeFilename(file.original_filename)}`;
    await copyVerifiedR2Object(file.storage_path, finalPath, source.etag);
    const sealed = await readR2ObjectStream(finalPath, request.signal);
    await verifyFileStream(sealed.body, Number(file.file_size), file.checksum);
    // Recheck after potentially long R2 work. Losing a session never publishes.
    const check = await owner.admin.rpc("vault_assert_session", sessionArgs(owner));
    if (check.error) throw new VaultError(423, "验证已过期，请重新进入后完成上传。");
    const saved = await owner.admin.from("documents").update({ storage_path: finalPath, storage_state: "available", uploaded_at: new Date().toISOString() })
      .eq("id", file.id).eq("user_id", owner.userId).eq("storage_path", file.storage_path).eq("storage_state", "pending").not("vault_group_id", "is", null).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new VaultError(409, "上传状态已变化，请重新打开检查。");
    return Response.json({ saved: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}
