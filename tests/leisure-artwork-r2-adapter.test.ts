import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return { S3Client: class { send = fake.send; }, PutObjectCommand: Command, GetObjectCommand: Command,
    DeleteObjectCommand: Command, HeadBucketCommand: Command, HeadObjectCommand: Command };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));
import { createImmutableR2Artwork, readR2Artwork } from "@/lib/adapters/cloudflare-r2";
const key = `00000000-0000-4000-8000-000000000000/leisure-artwork/v1/test/${"a".repeat(64)}.webp`;
beforeEach(() => {
  fake.send.mockReset().mockResolvedValue({});
  vi.stubEnv("R2_ENDPOINT", "https://test.r2.cloudflarestorage.com");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-not-a-real-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-not-a-real-secret");
  vi.stubEnv("R2_BUCKET_NAME", "test-private");
});
afterEach(() => vi.unstubAllEnvs());
function object(bytes: Uint8Array, length = bytes.byteLength) {
  return { ContentLength: length, ContentType: "image/webp", Body: { transformToWebStream: () => new ReadableStream({
    start(controller) { controller.enqueue(bytes); controller.close(); },
  }) } };
}
describe("immutable narrow R2 artwork adapter", () => {
  it("uses conditional create and private cache without any ACL/public setting", async () => {
    await createImmutableR2Artwork(key, Buffer.from("webp"), "image/webp");
    expect(fake.send.mock.calls[0][0].input).toEqual({ Bucket: "test-private", Key: key, Body: Buffer.from("webp"), ContentType: "image/webp",
      CacheControl: "private, no-store, max-age=0", IfNoneMatch: "*" });
  });
  it("treats a pre-existing object as a verification obligation, not an overwrite retry", async () => {
    fake.send.mockRejectedValue({ $metadata: { httpStatusCode: 412 } });
    await expect(createImmutableR2Artwork(key, Buffer.from("webp"), "image/webp")).resolves.toBeUndefined();
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it("rejects keys outside the exact artwork prefix before making a request", async () => {
    await expect(createImmutableR2Artwork("owner/files/private.pdf", Buffer.from("x"), "image/webp")).rejects.toThrow("invalid_artwork_key");
    await expect(readR2Artwork("../private.json", 100)).rejects.toThrow("invalid_artwork_key");
    expect(fake.send).not.toHaveBeenCalled();
  });
  it("reads bounded bytes and rejects oversized streams or size mismatches", async () => {
    fake.send.mockResolvedValueOnce(object(Buffer.from("webp")));
    expect(await readR2Artwork(key, 4)).toEqual({ bytes: Buffer.from("webp"), contentType: "image/webp" });
    fake.send.mockResolvedValueOnce(object(Buffer.from("too big"), 4));
    await expect(readR2Artwork(key, 4)).rejects.toThrow("artwork_too_large");
    fake.send.mockResolvedValueOnce(object(Buffer.from("x"), 4));
    await expect(readR2Artwork(key, 4)).rejects.toThrow("artwork_size_mismatch");
    fake.send.mockResolvedValueOnce(object(Buffer.from("large")));
    await expect(readR2Artwork(key, 4)).rejects.toThrow("invalid_artwork_size");
  });
  it("distinguishes absence from an authentication or provider failure", async () => {
    fake.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect(await readR2Artwork(key, 100)).toBeNull();
    fake.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 } });
    await expect(readR2Artwork(key, 100)).rejects.toEqual({ $metadata: { httpStatusCode: 403 } });
  });
});
