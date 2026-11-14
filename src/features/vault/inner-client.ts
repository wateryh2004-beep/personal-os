import { checksumFile } from "@/features/files/file-checksum";
import { expectedPartSize, multipartPartSize } from "@/features/files/multipart-upload";
import { safeFilename } from "@/features/files/schemas";
import { innerByteLimit, type InnerArchive } from "./inner-contract";

export const innerSessionPath = "/api/vault/inner/session";
export const innerUploadsPath = "/api/vault/inner/uploads";
export type VaultCall = (url: string, init?: RequestInit) => Promise<Response>;

export const privateJson = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({
  method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, signal,
});

export async function finishInnerUpload(call: VaultCall, id: string, signal: AbortSignal) {
  const response = await call(innerUploadsPath, privateJson("PATCH", { action: "complete", id }, signal));
  const archive: InnerArchive = await response.json();
  if (archive.id !== id || archive.status !== "completed") throw new Error("保存尚未确认，请重试校验。");
  return archive;
}

export async function uploadInnerArchive(file: File, call: VaultCall, options: {
  signal: AbortSignal; resume?: InnerArchive; onProgress: (phase: "hashing" | "uploading" | "verifying", uploaded: number) => void;
}, fetchPart: typeof fetch = fetch) {
  if (!/\.zip$/i.test(file.name.trim()) || file.size <= 0 || file.size > innerByteLimit) throw new Error("请选择不超过 2 GiB 的 ZIP 文件。");
  if (options.resume && (options.resume.filename !== safeFilename(file.name) || options.resume.size !== file.size))
    throw new Error("请选择与此记录对应的原 ZIP 文件。");
  const { signal, onProgress } = options;
  onProgress("hashing", 0);
  const checksum = await checksumFile(file, signal);
  const response = await call(innerUploadsPath, privateJson("POST", {
    filename: file.name, size: file.size, checksum, ...(options.resume ? { resumeId: options.resume.id } : {}),
  }, signal));
  const archive: InnerArchive = await response.json();
  if (options.resume && archive.id !== options.resume.id) throw new Error("所选 ZIP 与原上传记录不一致。");
  if (archive.status === "completed") return archive;
  if (archive.status !== "completing" && archive.status !== "uploading")
    throw new Error("上传暂不可继续，请查看文件状态。");
  if (archive.status === "uploading") {
    const known = new Set<number>();
    let uploaded = 0;
    for (const part of archive.parts) {
      if (known.has(part.partNumber) || part.size !== expectedPartSize(file.size, part.partNumber, innerByteLimit))
        throw new Error("分片状态无效，请重新进入后重试。");
      known.add(part.partNumber);
      uploaded += part.size;
    }
    onProgress("uploading", uploaded);
    const remaining = Array.from({ length: Math.ceil(file.size / multipartPartSize) }, (_, i) => i + 1).filter(n => !known.has(n));
    const workers = new AbortController();
    const partSignal = AbortSignal.any([signal, workers.signal]);
    let next = 0;
    let failure: unknown;
    async function sendParts() {
      try {
        while (next < remaining.length) {
          partSignal.throwIfAborted();
          const partNumber = remaining[next++];
          const size = expectedPartSize(file.size, partNumber, innerByteLimit);
          const signing = await call(innerUploadsPath, privateJson("PATCH", { action: "sign", id: archive.id, partNumber }, partSignal));
          const signed = await signing.json();
          if (signed.size !== size || typeof signed.uploadUrl !== "string") throw new Error("分片状态无效，请稍后重试。");
          const from = (partNumber - 1) * multipartPartSize;
          try {
            const result = await fetchPart(signed.uploadUrl, {
              method: "PUT", body: file.slice(from, from + size), signal: AbortSignal.any([partSignal, AbortSignal.timeout(180_000)]),
              credentials: "omit", referrerPolicy: "no-referrer",
            });
            if (!result.ok) throw new Error();
          } catch {
            partSignal.throwIfAborted();
            throw new Error("传输中断。重新选择原 ZIP 即可继续。");
          }
          uploaded += size;
          onProgress("uploading", uploaded);
        }
      } catch (error) {
        failure ??= error;
        workers.abort();
      }
    }
    await Promise.all([sendParts(), sendParts()]);
    if (failure) throw failure;
  }
  signal.throwIfAborted();
  onProgress("verifying", file.size);
  return finishInnerUpload(call, archive.id, signal);
}
