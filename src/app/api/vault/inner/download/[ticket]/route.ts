import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { readR2ObjectSlice } from "@/lib/adapters/cloudflare-r2";
import { innerByteLimit } from "@/features/vault/inner-contract";
import { innerDownloadRange, requireInnerDownload, watchInnerDownload } from "@/features/vault/inner-download";
import { assertInnerVault, innerFailure } from "@/features/vault/inner-session";
import { innerUploads } from "@/features/vault/inner-uploads";
import { VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ ticket: string }> }) {
  try {
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new VaultError(403, "请从当前页面操作。");
    const { ticket } = await params;
    if (!z.uuid().safeParse(ticket).success) throw new VaultError(404, "文件不可用。");
    const { owner, fileId } = await requireInnerDownload(ticket);
    const file = await innerUploads(owner).downloadFile(fileId);
    const size = Number(file.file_size);
    if (!Number.isSafeInteger(size) || size < 1 || size > innerByteLimit) throw new VaultError(503, "文件暂不可用。");

    const etag = `"${file.checksum}"`;
    const ifRange = request.headers.get("if-range");
    const range = innerDownloadRange(ifRange === null || ifRange === etag ? request.headers.get("range") : null, size);
    const headers = new Headers({ ...vaultHeaders, "Accept-Ranges": "bytes" });
    if (range === false) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const length = range ? range.end - range.start + 1 : size;
    const contentRange = range ? `bytes ${range.start}-${range.end}/${size}` : null;
    const encoded = encodeURIComponent(file.original_filename.toWellFormed()).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16)}`);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="archive.zip"; filename*=UTF-8''${encoded}`);
    headers.set("Content-Length", String(length));
    headers.set("ETag", etag);
    if (contentRange) headers.set("Content-Range", contentRange);

    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
    const object = await readR2ObjectSlice(file.storage_path, { range: range ?? undefined, signal: request.signal, timeoutMs: 290_000 })
      .catch(() => { throw new VaultError(503, "文件暂时无法下载，请稍后重试。"); });
    try {
      if (object.size !== length || object.contentRange !== contentRange) throw new VaultError(503, "文件暂时无法下载，请稍后重试。");
      await assertInnerVault(owner); // Cover a lock while the R2 request was opening.
      return new Response(watchInnerDownload(object.body, owner, length, request.signal), { status: range ? 206 : 200, headers });
    } catch (error) {
      await object.body.cancel().catch(() => {});
      throw error;
    }
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

export const HEAD = GET;
