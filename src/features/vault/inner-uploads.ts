import "server-only";

import { randomUUID } from "node:crypto";
import { verifyFileStream } from "@/features/files/integrity";
import { expectedPartSize, validateMultipartParts } from "@/features/files/multipart-upload";
import { safeFilename } from "@/features/files/schemas";
import {
  abortR2Multipart, beginR2Multipart, completeR2Multipart, isMissingR2Multipart,
  listR2MultipartParts, r2BucketName, readR2ObjectStream, signR2MultipartPart,
} from "@/lib/adapters/cloudflare-r2";
import { innerArchiveSchema, innerArchiveType, innerByteLimit, innerPartLimit, type InnerArchive } from "./inner-contract";
import { assertInnerVault, innerSessionArgs, throwInnerDatabaseError, type InnerOwner } from "./inner-session";
import { VaultError } from "./server";

type FileRecord = {
  id: string; original_filename: string; file_size: number; checksum: string;
  storage_path: string; storage_bucket: string; upload_id: string | null;
  status: InnerArchive["status"] | "aborted"; expires_at: string; lease_token: string | null;
  created_at: string;
};
const columns = "id,original_filename,file_size,checksum,storage_path,storage_bucket,upload_id,status,expires_at,lease_token,created_at";
const conflict = () => new VaultError(409, "上传状态正在确认，请稍后重试。");
const unavailable = () => new VaultError(404, "文件不可用。");
const expired = (file: FileRecord) => Date.parse(file.expires_at) <= Date.now();

function summary(file: FileRecord, parts: InnerArchive["parts"] = []): InnerArchive {
  return {
    id: file.id, filename: file.original_filename, size: Number(file.file_size), expiresAt: file.expires_at, parts,
    status: file.status === "completed" ? "completed" : file.status === "aborted" || expired(file) ? "expired" : file.status,
  };
}

export function innerUploads(owner: InnerOwner) {
  const files = () => owner.admin.from("inner_vault_files");
  const args = innerSessionArgs(owner);
  const validLocation = (file: FileRecord) =>
    file.storage_bucket === r2BucketName() && file.storage_path === `${owner.userId}/inner-vault/${file.id}/archive.zip`;

  async function load(id: string) {
    const result = await files().select(columns).eq("user_id", owner.userId).eq("id", id).maybeSingle<FileRecord>();
    if (result.error) throw new VaultError(503, "暂时无法读取上传状态。");
    if (!result.data || !validLocation(result.data)) throw unavailable();
    return result.data;
  }

  async function claim(file: FileRecord, status: "initializing" | "completing" | "aborting") {
    const lease = randomUUID();
    const now = Date.now();
    const result = await files().update({
      status, lease_token: lease, lease_expires_at: new Date(now + 330_000).toISOString(),
    }).eq("user_id", owner.userId).eq("id", file.id).eq("status", file.status)
      .or(`lease_token.is.null,lease_expires_at.lte.${new Date(now).toISOString()}`)
      .select("id").maybeSingle();
    if (result.error || !result.data) throw conflict();
    return lease;
  }

  async function transition(file: FileRecord, lease: string, status: FileRecord["status"], uploadId = file.upload_id) {
    const result = await files().update({
      status, upload_id: uploadId, lease_token: null, lease_expires_at: null,
    }).eq("user_id", owner.userId).eq("id", file.id).eq("lease_token", lease).select("id").maybeSingle();
    if (result.error || !result.data) throw conflict();
  }

  async function availableParts(file: FileRecord) {
    if (!file.upload_id) throw conflict();
    return validateMultipartParts(await listR2MultipartParts(file.storage_path, file.upload_id, innerPartLimit), Number(file.file_size), false, innerByteLimit);
  }

  async function inspect(file: FileRecord) {
    const value = summary(file);
    if (value.status !== "uploading") return value;
    try {
      return summary(file, (await availableParts(file)).map(({partNumber, size}) => ({partNumber, size})));
    } catch (error) {
      if (!isMissingR2Multipart(error)) throw error;
      // A concurrent completion may have consumed the provider ID. Re-read the
      // DB state before exposing an expired upload or creating a replacement.
      const latest = await load(file.id);
      if (latest.status !== "uploading") return summary(latest);
      return { ...value, status: "expired" as const };
    }
  }

  return {
    async list(cursor?: { created: string; id: string }) {
      let query = files().select(columns).eq("user_id", owner.userId).neq("status", "aborted")
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
      if (cursor) query = query.or(`created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`);
      const result = await query.returns<FileRecord[]>();
      if (result.error) throw new VaultError(503, "读取文件列表失败。");
      const page = result.data.slice(0, 50);
      const last = page.at(-1);
      return {
        files: page.map(file => summary(file)),
        next: result.data.length > page.length && last ? { created: last.created_at, id: last.id } : null,
      };
    },

    async create(input: unknown) {
      const parsed = innerArchiveSchema.safeParse(input);
      if (!parsed.success) throw new VaultError(400, "请选择不超过 2 GiB 的 ZIP 文件。");
      const { size, checksum } = parsed.data;
      const filename = safeFilename(parsed.data.filename);
      if (!/\.zip$/i.test(filename)) throw new VaultError(400, "请缩短 ZIP 文件名后重试。");
      let file: FileRecord;
      if (parsed.data.resumeId) {
        file = await load(parsed.data.resumeId);
        if (file.original_filename !== filename || Number(file.file_size) !== size || file.checksum !== checksum)
          throw new VaultError(409, "所选 ZIP 与原上传记录不一致。");
      } else {
        const prepared = await owner.admin.rpc("inner_vault_prepare_file", {
          ...args, p_filename: filename, p_size: size, p_checksum: checksum, p_bucket: r2BucketName(),
        });
        if (prepared.error) throwInnerDatabaseError(prepared.error.message);
        if (!prepared.data) throw conflict();
        file = await load(prepared.data.id);
      }
      if (file.status !== "initializing") return inspect(file);
      if (expired(file)) throw conflict();
      const lease = await claim(file, "initializing");
      try {
        const uploadId = await beginR2Multipart(file.storage_path, innerArchiveType, filename);
        await transition(file, lease, "uploading", uploadId);
      } catch (error) {
        // A lost initiation reply can only leave an empty multipart upload;
        // R2's existing lifecycle handles that orphan.
        await transition(file, lease, "initializing").catch(() => {});
        throw error;
      }
      return inspect(await load(file.id));
    },

    async sign(id: string, partNumber: number) {
      const file = await load(id);
      if (file.status !== "uploading" || expired(file) || !file.upload_id) throw conflict();
      let size: number;
      try { size = expectedPartSize(Number(file.file_size), partNumber, innerByteLimit); }
      catch { throw new VaultError(400, "分片编号无效。"); }
      await assertInnerVault(owner);
      return { size, uploadUrl: await signR2MultipartPart(file.storage_path, file.upload_id, partNumber, size, innerPartLimit) };
    },

    async complete(id: string, signal: AbortSignal) {
      const file = await load(id);
      if (file.status === "completed") return summary(file);
      if (!["uploading","completing"].includes(file.status) || expired(file) || !file.upload_id) throw conflict();
      let parts;
      try { parts = validateMultipartParts(await availableParts(file), Number(file.file_size), true, innerByteLimit); }
      catch (error) {
        // Recover a lost CompleteMultipartUpload response using the actual
        // object and its SHA-256. Missing provider upload state is not success.
        if (!isMissingR2Multipart(error) || file.status !== "completing") {
          if (isMissingR2Multipart(error) || (error instanceof Error && error.message === "incomplete_multipart_parts"))
            throw new VaultError(409, "分片未上传完整，请重新选择原 ZIP 继续。");
          throw error;
        }
      }
      const lease = await claim(file, "completing");
      try {
        if (parts) await completeR2Multipart(file.storage_path, file.upload_id, parts);
        signal.throwIfAborted();
        const verification = AbortSignal.any([signal, AbortSignal.timeout(200_000)]);
        const object = await readR2ObjectStream(file.storage_path, verification, 200_000);
        if (object.size !== Number(file.file_size)) {
          await object.body.cancel().catch(() => {});
          throw new Error("file_size_mismatch");
        }
        // No PutObject URL was issued for this key. Once the only multipart ID
        // completes, even still-valid part URLs cannot modify the object.
        await verifyFileStream(object.body, Number(file.file_size), file.checksum, innerByteLimit, verification);
        signal.throwIfAborted();
        const saved = await owner.admin.rpc("inner_vault_publish_file", { ...args, p_id: id, p_lease: lease });
        if (saved.error) throwInnerDatabaseError(saved.error.message);
        if (saved.data !== true) throw conflict();
        return summary({ ...file, status: "completed" });
      } catch (error) {
        const corrupt = error instanceof Error && ["file_size_mismatch", "file_checksum_mismatch"].includes(error.message);
        await transition(file, lease, corrupt ? "failed" : "completing").catch(() => {});
        if (corrupt) throw new VaultError(409, "原件校验未通过。请取消此上传，再重新选择 ZIP。");
        throw error;
      }
    },

    async cancel(id: string) {
      const file = await load(id);
      if (file.status === "aborted") return;
      if (file.status === "completed") throw conflict();
      const lease = await claim(file, "aborting");
      try {
        if (file.upload_id) await abortR2Multipart(file.storage_path, file.upload_id);
        await transition(file, lease, "aborted", null);
      } catch (error) {
        await transition(file, lease, "aborting").catch(() => {});
        throw error;
      }
    },

    async downloadFile(id: string) {
      await assertInnerVault(owner);
      const file = await load(id);
      if (file.status !== "completed") throw unavailable();
      return file;
    },
  };
}
