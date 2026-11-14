import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { expectedPartSize, multipartPartSize, validateMultipartParts } from "@/features/files/multipart-upload";
import { checksumFile } from "@/features/files/file-checksum";
import { innerArchiveSchema, innerByteLimit, innerPartLimit, type InnerArchive } from "@/features/vault/inner-contract";
import { uploadInnerArchive } from "@/features/vault/inner-client";
import { tokenHash } from "@/features/vault/crypto";
import type { InnerOwner } from "@/features/vault/inner-session";

const mocks = vi.hoisted(() => ({
  outer: vi.fn(), authenticated: vi.fn(), cookies: vi.fn(), revoke: vi.fn(), from: vi.fn(), rpc: vi.fn(), parts: vi.fn(), complete: vi.fn(), read: vi.fn(), slice: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({ env: { supabaseSecretKey: "fixture-only-signing-key" } }));
vi.mock("@/lib/auth/require-owner", () => ({ apiAuthenticationFailure: () => null, requireOwnerApi: vi.fn() }));
vi.mock("@/features/vault/server", async importOriginal => ({
  ...await importOriginal<typeof import("@/features/vault/server")>(), requireVault: mocks.outer, vaultOwner: mocks.authenticated,
}));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({
  r2BucketName: () => "fixture", listR2MultipartParts: mocks.parts, completeR2Multipart: mocks.complete,
  readR2ObjectStream: mocks.read, readR2ObjectSlice: mocks.slice,
  isMissingR2Multipart: (error: Error) => error.name === "NoSuchUpload",
}));
import { POST as download } from "@/app/api/vault/inner/download/route";
import { GET as getDownload } from "@/app/api/vault/inner/download/[ticket]/route";
import { DELETE as lock } from "@/app/api/vault/inner/session/route";
import { innerDownloadCookie, watchInnerDownload } from "@/features/vault/inner-download";
import { innerUploads } from "@/features/vault/inner-uploads";
import { VaultError } from "@/features/vault/server";

const userId = "00000000-0000-4000-8000-000000000061";
const id = "00000000-0000-4000-8000-000000000091";
const proof = "1".repeat(64), outerToken = "2".repeat(64), outerHash = tokenHash(outerToken), login = "3".repeat(64);
const expiresAt = "2099-01-01T00:00:00.000Z";
const storagePath = `${userId}/inner-vault/${id}/archive.zip`;
const bytes = Buffer.from("synthetic ZIP transport fixture");
const checksum = createHash("sha256").update(bytes).digest("hex");
const makeRecord = (status: string, digest = checksum) => ({
  id, original_filename: "测试.zip", file_size: bytes.length, checksum: digest, storage_path: storagePath,
  storage_bucket: "fixture", status, expires_at: expiresAt, upload_id: "provider-only",
});
let record: ReturnType<typeof makeRecord> | null;
let innerSession: { expires_at: string; last_seen_at: string } | null;
const filters = vi.fn();
const updates = vi.fn();
const owner = { userId, login, hash: outerHash, innerHash: tokenHash(proof), admin: { from: mocks.from, rpc: mocks.rpc } } as unknown as InnerOwner;
const signal = () => new AbortController().signal;
function request(token?: string, requestOrigin = "https://fixture.invalid") {
  return new Request("https://fixture.invalid/api/vault/inner/download", { method: "POST", headers: {
    origin: requestOrigin, "content-type": "application/json", ...(token ? { "x-vault-inner": token } : {}),
  }, body: JSON.stringify({ id }) });
}

function withCookie(grant?: string, outer = outerToken) {
  mocks.cookies.mockResolvedValue({ get: (key: string) => ({ value: key === innerDownloadCookie ? grant : outer }) });
}

function open(path: string, options?: RequestInit) {
  return getDownload(new Request(`https://fixture.invalid${path}`, options), { params: Promise.resolve({ ticket: path.split("/").at(-1)! }) });
}

async function issue() {
  const response = await download(request(proof));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const { url } = await response.json() as { url: string };
  expect(new URL(url).origin).toBe("https://fixture.invalid");
  const path = new URL(url).pathname;
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain(`Path=${path}`);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toMatch(/SameSite=strict/i);
  expect(path).toMatch(/^\/api\/vault\/inner\/download\/[a-f0-9-]{36}$/);
  const grant = cookie.split(";", 1)[0].slice(innerDownloadCookie.length + 1);
  expect(grant).not.toContain(proof);
  return { url: path, grant };
}

beforeEach(() => {
  vi.clearAllMocks();
  record = makeRecord("completed");
  innerSession = { expires_at: expiresAt, last_seen_at: new Date().toISOString() };
  mocks.outer.mockResolvedValue(owner);
  mocks.authenticated.mockResolvedValue(owner);
  withCookie();
  mocks.rpc.mockImplementation(async () => innerSession ? { data: true, error: null } : { error: { message: "inner_vault_locked" } });
  mocks.revoke.mockImplementation(() => { innerSession = null; });
  mocks.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    update(value: Record<string, unknown>) { updates(value); return this; },
    delete() { mocks.revoke(); return this; },
    eq(key: string, value: unknown) { filters(table, key, value); return this; },
    maybeSingle: async () => ({ data: table === "inner_vault_sessions" ? innerSession : record, error: null }),
  }));
  mocks.slice.mockImplementation(async (_key, { range }) => {
    const data = range ? bytes.subarray(range.start, range.end + 1) : bytes;
    return { size: data.length, body: new Blob([data]).stream(), contentRange: range ? `bytes ${range.start}-${range.end}/${bytes.length}` : null };
  });
  mocks.parts.mockResolvedValue([{ partNumber: 1, size: bytes.length, etag: `"${"a".repeat(32)}"` }]);
  mocks.complete.mockResolvedValue(undefined);
  mocks.read.mockImplementation(async () => ({ size: bytes.length, body: new Blob([bytes]).stream() }));
});

describe("inner vault storage boundary", () => {
  it("denies requests with only the outer unlock, an expired inner session, or a foreign origin", async () => {
    expect((await download(request())).status).toBe(423);
    innerSession = { expires_at: expiresAt, last_seen_at: "2000-01-01T00:00:00Z" };
    expect((await download(request(proof))).status).toBe(423);
    expect((await download(request(proof, "https://elsewhere.invalid"))).status).toBe(403);
    mocks.outer.mockRejectedValueOnce(new VaultError(423, "locked"));
    expect((await download(request(proof))).status).toBe(423);
    expect(mocks.slice).not.toHaveBeenCalled();
  });

  it("streams the ZIP and ranges without exposing R2 or reusing the grant at another URL", async () => {
    const { url, grant } = await issue();
    expect(filters).toHaveBeenCalledWith("inner_vault_sessions", "outer_token_hash", outerHash);
    expect(filters).toHaveBeenCalledWith("inner_vault_sessions", "token_hash", tokenHash(proof));
    expect(filters).toHaveBeenCalledWith("inner_vault_files", "user_id", userId);
    expect((await open(url)).status).toBe(423);
    withCookie(grant);
    expect((await open(`/api/vault/inner/download/${id}`)).status).toBe(423);
    expect((await open(url, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    withCookie(grant, "4".repeat(64));
    expect((await open(url)).status).toBe(423);
    expect(mocks.slice).not.toHaveBeenCalled();
    withCookie(grant);
    const full = await open(url);
    expect(full.status).toBe(200);
    expect(full.headers.get("location")).toBeNull();
    expect(full.headers.get("cache-control")).toContain("no-store");
    expect(full.headers.get("content-disposition")).toContain("%E6%B5%8B%E8%AF%95.zip");
    expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
    const partial = await open(url, { headers: { range: "bytes=-5" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes ${bytes.length - 5}-${bytes.length - 1}/${bytes.length}`);
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(bytes.subarray(-5));
    expect((await open(url, { headers: { range: `bytes=${bytes.length}-` } })).status).toBe(416);
    expect(mocks.slice).toHaveBeenCalledWith(storagePath, expect.objectContaining({ range: { start: bytes.length - 5, end: bytes.length - 1 } }));
    record = makeRecord("uploading");
    expect((await download(request(proof))).status).toBe(404);
    expect((await open(url)).status).toBe(404);
    expect(mocks.slice).toHaveBeenCalledTimes(2);
  });

  it("revokes full, range and HEAD requests for an already-issued link on confirmed lock", async () => {
    const { url, grant } = await issue();
    withCookie(grant);
    const response = await lock(new Request("https://fixture.invalid/api/vault/inner/session", { method: "DELETE", headers: {
      origin: "https://fixture.invalid", "x-vault-inner": proof,
    } }));
    expect(response.status).toBe(200);
    expect((await open(url)).status).toBe(423);
    expect((await open(url, { headers: { range: "bytes=0-10" } })).status).toBe(423);
    expect((await open(url, { method: "HEAD" })).status).toBe(423);
    expect((await download(request(proof))).status).toBe(423);
    expect(mocks.slice).not.toHaveBeenCalled();
  });

  it("stops the upstream stream when a download in progress loses access", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array([7])); }, cancel });
      const reader = watchInnerDownload(body, owner, 10, signal()).getReader();
      expect((await reader.read()).value).toEqual(new Uint8Array([7]));
      innerSession = null;
      clock.mockReturnValue(2100);
      await expect(reader.read()).rejects.toThrow("Download access ended");
      await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    } finally { clock.mockRestore(); }
  });

  it("publishes only after assembled-byte verification and recovers the lost completion response", async () => {
    record = makeRecord("completing");
    mocks.parts.mockRejectedValueOnce(Object.assign(new Error(), {name: "NoSuchUpload"}));
    const result = await innerUploads(owner).complete(id, signal());
    expect(result.status).toBe("completed");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("inner_vault_publish_file", expect.objectContaining({ p_id: id, p_outer: outerHash, p_inner: tokenHash(proof) }));
    expect(mocks.read.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
  });

  it("does not publish corrupt bytes, and lets a verified upload resume after a lock", async () => {
    record = makeRecord("uploading", "0".repeat(64));
    await expect(innerUploads(owner).complete(id, signal())).rejects.toThrow("校验未通过");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", lease_token: null }));
    record = makeRecord("uploading");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "inner_vault_locked" } });
    await expect(innerUploads(owner).complete(id, signal())).rejects.toMatchObject({ status: 423 });
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completing", lease_token: null }));
  });

  it("checks the reselected full digest before provider access or new metadata", async () => {
    record = makeRecord("uploading");
    await expect(innerUploads(owner).create({ filename: record.original_filename, size: bytes.length, checksum: "0".repeat(64), resumeId: id })).rejects.toThrow("不一致");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.parts).not.toHaveBeenCalled();
  });
});

describe("ZIP transport", () => {
  it("accepts exactly 2 GiB and validates all 256 parts without changing the ordinary limit", () => {
    expect(innerPartLimit).toBe(256);
    expect(innerArchiveSchema.safeParse({ filename: "backup.ZIP", size: innerByteLimit, checksum }).success).toBe(true);
    expect(innerArchiveSchema.safeParse({ filename: "backup.ZIP", size: innerByteLimit + 1, checksum }).success).toBe(false);
    expect(innerArchiveSchema.safeParse({ filename: "backup.pdf", size: 512, checksum }).success).toBe(false);
    const parts = Array.from({ length: 256 }, (_, i) => ({ partNumber: i + 1, size: multipartPartSize, etag: `"${"a".repeat(32)}"` }));
    expect(validateMultipartParts(parts, innerByteLimit, true, innerByteLimit)).toHaveLength(256);
    expect(() => validateMultipartParts(parts.slice(1), innerByteLimit, true, innerByteLimit)).toThrow();
    expect(() => expectedPartSize(innerByteLimit, 1)).toThrow();
  });

  it("skips verified parts, sends bounded blobs without app credentials, then waits for publication", async () => {
    const file = new File([new Uint8Array(multipartPartSize + 13)], "测试.zip");
    const archive: InnerArchive = {
      id, filename: file.name, size: file.size, status: "uploading", expiresAt,
      parts: [{ partNumber: 1, size: multipartPartSize }],
    };
    const call = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const data = JSON.parse(String(init?.body));
      if (init?.method === "POST") {
        expect(data).toEqual({ filename: file.name, size: file.size, checksum: await checksumFile(file), resumeId: id });
        return Response.json(archive);
      }
      if (data.action === "sign") return Response.json({ uploadUrl: "https://fixture.r2.example/part/2", size: 13 });
      return Response.json({ ...archive, status: "completed" });
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await uploadInnerArchive(file, call, { signal: signal(), resume: archive, onProgress: vi.fn() }, fetcher);
    expect(result.status).toBe("completed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://fixture.r2.example/part/2", expect.objectContaining({ credentials: "omit" }));
    expect((fetcher.mock.calls[0][1]?.body as Blob).size).toBe(13);
    expect(JSON.parse(String(call.mock.lastCall?.[1]?.body))).toEqual({ action: "complete", id });
  });
});
