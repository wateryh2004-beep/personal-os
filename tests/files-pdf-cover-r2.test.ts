import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return { S3Client: class { send = fake.send; }, PutObjectCommand: Command, GetObjectCommand: Command,
    DeleteObjectCommand: Command, HeadBucketCommand: Command, HeadObjectCommand: Command };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));
import { createImmutableR2PdfCover, readR2PdfCover } from "@/lib/adapters/cloudflare-r2";
import { pdfCoverKey } from "@/features/files/pdf-cover-policy";
const key = pdfCoverKey("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "a".repeat(64));
beforeEach(() => {
  fake.send.mockReset().mockResolvedValue({});
  vi.stubEnv("R2_ENDPOINT", "https://test.r2.cloudflarestorage.com"); vi.stubEnv("R2_ACCESS_KEY_ID", "fixture-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "fixture-secret"); vi.stubEnv("R2_BUCKET_NAME", "private-test");
});
afterEach(() => vi.unstubAllEnvs());
function object(bytes: Uint8Array, size = bytes.byteLength, type = "image/webp") {
  return { ContentLength: size, ContentType: type, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) } };
}
describe("private immutable PDF cover R2 adapter", () => {
  it("only conditionally creates inside the existing private bucket without an ACL", async () => {
    await createImmutableR2PdfCover(key, Buffer.from("webp"));
    expect(fake.send.mock.calls[0][0].input).toEqual({ Bucket: "private-test", Key: key, Body: Buffer.from("webp"), ContentType: "image/webp", CacheControl: "private, max-age=0, must-revalidate", IfNoneMatch: "*" });
  });
  it("permits a competing conditional winner only for caller verification", async () => {
    fake.send.mockRejectedValue({ $metadata: { httpStatusCode: 412 } }); await expect(createImmutableR2PdfCover(key, Buffer.from("webp"))).resolves.toBeUndefined(); expect(fake.send).toHaveBeenCalledOnce();
  });
  it.each(["owner/files/private.pdf", key.replace("/pdf-covers/", "/files/"), key.replace(".webp", ".pdf"), key.replace("/pdfjs-", "/../pdfjs-")])("rejects keys outside the derivative keyspace: %s", async (invalid) => {
    await expect(createImmutableR2PdfCover(invalid, Buffer.from("x"))).rejects.toThrow("pdf_cover_invalid_identity"); await expect(readR2PdfCover(invalid)).rejects.toThrow("pdf_cover_invalid_identity"); expect(fake.send).not.toHaveBeenCalled();
  });
  it("enforces the output budget before uploading", async () => {
    await expect(createImmutableR2PdfCover(key, new Uint8Array(128 * 1024 + 1))).rejects.toThrow("pdf_cover_invalid_output"); expect(fake.send).not.toHaveBeenCalled();
  });
  it("only buffers declared bounded WebP bytes, rejects truncated and excess streams", async () => {
    fake.send.mockResolvedValue(object(Buffer.from("webp"))); expect(await readR2PdfCover(key)).toEqual(Buffer.from("webp"));
    for (const fixture of [object(Buffer.from("small"), 100), object(Buffer.from("oversized"), 4), object(Buffer.from("x"), 129 * 1024), object(Buffer.from("html"), 4, "text/html")]) {
      fake.send.mockResolvedValue(fixture); await expect(readR2PdfCover(key)).rejects.toThrow("pdf_cover_invalid_output");
    }
  });
  it("treats only real404 as absence", async () => {
    fake.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } }); expect(await readR2PdfCover(key)).toBeNull();
    fake.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 } }); await expect(readR2PdfCover(key)).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  });
  it("cancels a stalled artifact body when the request aborts", async () => {
    const cancel = vi.fn(); const controller = new AbortController();
    fake.send.mockResolvedValue({ ContentLength: 4, ContentType: "image/webp", Body: { transformToWebStream: () => new ReadableStream({ cancel }) } });
    const result = readR2PdfCover(key, controller.signal); await Promise.resolve(); controller.abort(); await expect(result).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
  });
});
