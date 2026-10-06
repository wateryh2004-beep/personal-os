import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  class ListObjectsV2Command extends Command {}
  class HeadBucketCommand extends Command {}
  return { S3Client: class { send = mock.send; }, ListObjectsV2Command, HeadBucketCommand,
    CopyObjectCommand: Command, DeleteObjectCommand: Command, GetObjectCommand: Command, HeadObjectCommand: Command, PutObjectCommand: Command };
});
import { checkR2Health, inspectR2ObjectUsage } from "@/lib/adapters/cloudflare-r2";
const signal = () => AbortSignal.timeout(5_000);
beforeEach(() => {
  mock.send.mockReset();
  vi.stubEnv("R2_ENDPOINT", "https://fixture.r2.cloudflarestorage.com");
  vi.stubEnv("R2_ACCESS_KEY_ID", "fixture-only"); vi.stubEnv("R2_SECRET_ACCESS_KEY", "fixture-only");
  vi.stubEnv("R2_BUCKET_NAME", "fixture-private");
});
afterEach(() => vi.unstubAllEnvs());

describe("bounded aggregate-only R2 usage", () => {
  it("follows all pages and strips object names and provider data", async () => {
    mock.send.mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: "next", Contents: [{ Key: "private-name", Size: 10 }] })
      .mockResolvedValueOnce({ IsTruncated: false, Contents: [{ Key: "another-private-name", Size: 20 }] });
    const result = await inspectR2ObjectUsage(signal());
    expect(result).toEqual({ status: "complete", objectBytes: 30, objectCount: 2, pagesScanned: 2 });
    expect(mock.send.mock.calls[1][0].input).toEqual({ Bucket: "fixture-private", MaxKeys: 1000, ContinuationToken: "next" });
    expect(mock.send.mock.calls.every(([command]) => command.constructor.name === "ListObjectsV2Command")).toBe(true);
  });
  it("distinguishes an empty successful bucket from an unavailable listing", async () => {
    mock.send.mockResolvedValueOnce({ IsTruncated: false });
    expect(await inspectR2ObjectUsage(signal())).toMatchObject({ status: "complete", objectCount: 0, objectBytes: 0 });
    mock.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 }, secret: "do-not-return" });
    expect(await inspectR2ObjectUsage(signal())).toEqual({ status: "unavailable", objectCount: 0, objectBytes: 0, pagesScanned: 0, reason: "access_denied" });
  });
  it("preserves only observed totals on interruption", async () => {
    mock.send.mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: "next", Contents: [{ Size: 10 }] }).mockRejectedValueOnce(new Error("private-provider-error"));
    expect(await inspectR2ObjectUsage(signal())).toEqual({ status: "partial", objectCount: 1, objectBytes: 10, pagesScanned: 1, reason: "network_or_service" });
  });
  it("caps requests at 20 pages even if a caller asks for more", async () => {
    let page = 0;
    mock.send.mockImplementation(async () => ({ IsTruncated: true, NextContinuationToken: String(++page), Contents: [{ Size: 1 }] }));
    expect(await inspectR2ObjectUsage(signal(), 100)).toMatchObject({ status: "partial", pagesScanned: 20, objectCount: 20, reason: "limit" });
    expect(mock.send).toHaveBeenCalledTimes(20);
  });
  it.each([{ IsTruncated: false, Contents: [{ Size: -1 }] }, { IsTruncated: false, Contents: [{ Size: Number.MAX_SAFE_INTEGER }, { Size: 1 }] }, {}])("does not certify malformed totals or missing completion markers", async (page) => {
    mock.send.mockResolvedValue(page);
    expect(await inspectR2ObjectUsage(signal())).toMatchObject({ status: "unavailable", objectCount: 0 });
  });
  it("stops a repeated cursor and honors abort without network access", async () => {
    mock.send.mockResolvedValue({ IsTruncated: true, NextContinuationToken: "repeat", Contents: [] });
    expect(await inspectR2ObjectUsage(signal())).toMatchObject({ status: "partial", pagesScanned: 2 });
    mock.send.mockClear();
    expect(await inspectR2ObjectUsage(AbortSignal.abort())).toMatchObject({ status: "unavailable" });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("returns not-configured without attempting storage requests", async () => {
    vi.stubEnv("R2_ENDPOINT", "");
    expect(await inspectR2ObjectUsage(signal())).toMatchObject({ status: "unavailable", reason: "not_configured" });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it.each([[403, "access_denied"], [404, "not_found"], [503, "network_or_service"]])("reports scoped HeadBucket failures (%s)", async (status, reason) => {
    mock.send.mockRejectedValue({ $metadata: { httpStatusCode: status }, message: "secret-provider-response" });
    expect(await checkR2Health(signal())).toMatchObject({ status: "unreachable", reason, configured: true });
  });
});
