import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return { S3Client: class { send = fake.send; }, CopyObjectCommand: Command, PutObjectCommand: Command, GetObjectCommand: Command,
    DeleteObjectCommand: Command, HeadBucketCommand: Command, HeadObjectCommand: Command, ListObjectsV2Command: Command };
});
import { readR2ObjectSlice } from "@/lib/adapters/cloudflare-r2";

beforeEach(() => {
  fake.send.mockReset();
  vi.stubEnv("R2_ENDPOINT", "https://test.r2.cloudflarestorage.com"); vi.stubEnv("R2_ACCESS_KEY_ID", "test-only");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-only"); vi.stubEnv("R2_BUCKET_NAME", "test-private");
});
afterEach(() => vi.unstubAllEnvs());

describe("private conditional R2 preview reads", () => {
  it("passes a normalized byte range and IfMatch without buffering", async () => {
    const body = new ReadableStream<Uint8Array>();
    const buffer = vi.fn();
    fake.send.mockResolvedValue({ Body: { transformToWebStream: () => body, transformToByteArray: buffer }, ContentLength: 8, ETag: '"version"', ContentRange: "bytes 0-7/100" });
    expect(await readR2ObjectSlice("owner/files/doc/x", { range: { start: 0, end: 7 }, ifMatch: '"version"' }))
      .toEqual({ body, size: 8, etag: '"version"', contentRange: "bytes 0-7/100" });
    expect(fake.send.mock.calls[0][0].input).toEqual({ Bucket: "test-private", Key: "owner/files/doc/x", Range: "bytes=0-7", IfMatch: '"version"' });
    expect(buffer).not.toHaveBeenCalled();
  });
  it("supports a conditional full stream and propagates request abort", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>();
    fake.send.mockResolvedValue({ Body: { transformToWebStream: () => body }, ContentLength: 100, ETag: '"version"' });
    expect(await readR2ObjectSlice("owner/files/doc/x", { ifMatch: '"version"', signal: controller.signal }))
      .toEqual({ body, size: 100, etag: '"version"', contentRange: null });
    expect(fake.send.mock.calls[0][0].input).toEqual({ Bucket: "test-private", Key: "owner/files/doc/x", IfMatch: '"version"' });
    const forwarded = fake.send.mock.calls[0][1].abortSignal;
    expect(forwarded.aborted).toBe(false);
    controller.abort();
    expect(forwarded.aborted).toBe(true);
  });
  it("rejects invalid ranges and weak or malformed conditions before sending", async () => {
    for (const range of [{ start: -1, end: 7 }, { start: 8, end: 7 }, { start: 0, end: 7.5 }, { start: NaN, end: 7 }])
      await expect(readR2ObjectSlice("x", { range })).rejects.toThrow("r2_invalid_range");
    for (const ifMatch of ["", "*", "version", 'W/"version"', '"bad\nvalue"'])
      await expect(readR2ObjectSlice("x", { ifMatch })).rejects.toThrow("r2_invalid_etag");
    expect(fake.send).not.toHaveBeenCalled();
  });
  it("rejects unknown, empty or invalid lengths and cancels the returned body", async () => {
    for (const ContentLength of [undefined, 0, -1, 1.5]) {
      const cancel = vi.fn();
      fake.send.mockResolvedValue({ Body: { transformToWebStream: () => new ReadableStream({ cancel }) }, ContentLength });
      await expect(readR2ObjectSlice("x", {})).rejects.toThrow("r2_invalid_size");
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("does not retry a changed version as an unconditional read", async () => {
    const changed = { $metadata: { httpStatusCode: 412 } };
    fake.send.mockRejectedValue(changed);
    await expect(readR2ObjectSlice("x", { ifMatch: '"old"' })).rejects.toBe(changed);
    expect(fake.send).toHaveBeenCalledOnce();
  });
});
