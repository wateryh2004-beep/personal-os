import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return { S3Client: class { send = fake.send; }, CopyObjectCommand: Command, PutObjectCommand: Command, GetObjectCommand: Command,
    DeleteObjectCommand: Command, HeadBucketCommand: Command, HeadObjectCommand: Command };
});
import { readR2ObjectStream, copyVerifiedR2Object } from "@/lib/adapters/cloudflare-r2";
beforeEach(() => {
  fake.send.mockReset();
  vi.stubEnv("R2_ENDPOINT", "https://test.r2.cloudflarestorage.com"); vi.stubEnv("R2_ACCESS_KEY_ID", "test-only");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-only"); vi.stubEnv("R2_BUCKET_NAME", "test-private");
});
afterEach(() => vi.unstubAllEnvs());
describe("bounded private R2 stream and sealing", () => {
  it("returns a stream without materializing bytes, including ETag for conditional copy", async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
    fake.send.mockResolvedValue({ Body: { transformToWebStream: () => body }, ContentLength: 4, ETag: '"version"' });
    expect(await readR2ObjectStream("owner/files/doc/x")).toEqual({ body, size: 4, etag: '"version"' });
  });
  it("rejects unknown length and cancels unusable body", async () => {
    const cancelled = vi.fn();
    fake.send.mockResolvedValue({ Body: { transformToWebStream: () => new ReadableStream({ cancel: cancelled }) } });
    await expect(readR2ObjectStream("owner/files/doc/x")).rejects.toThrow("r2_invalid_size");
    expect(cancelled).toHaveBeenCalled();
  });
  it("encodes source path and copies only the verified version to a same-document seal", async () => {
    fake.send.mockResolvedValue({});
    await copyVerifiedR2Object("owner/files/doc/中文 name.pdf", "owner/files/doc/sealed-random/name.pdf", '"version"');
    expect(fake.send.mock.calls[0][0].input).toEqual({ Bucket: "test-private", Key: "owner/files/doc/sealed-random/name.pdf", CopySource: "test-private/owner/files/doc/%E4%B8%AD%E6%96%87%20name.pdf", CopySourceIfMatch: '"version"' });
  });
  it("rejects cross-owner or arbitrary destination before writing", async () => {
    await expect(copyVerifiedR2Object("owner/files/doc/x", "other/files/doc/sealed-a/x", '"v"')).rejects.toThrow("invalid_seal_target");
    await expect(copyVerifiedR2Object("owner/files/doc/x", "owner/files/doc/x", '"v"')).rejects.toThrow("invalid_seal_target");
    expect(fake.send).not.toHaveBeenCalled();
  });
});
