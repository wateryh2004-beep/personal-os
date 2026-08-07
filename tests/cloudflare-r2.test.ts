import { afterEach, describe, expect, it } from "vitest";
import { createDownloadUrl, createUploadUrl, isR2Configured, isR2EndpointValid, normalizeR2Endpoint, sanitizeR2Health } from "@/lib/adapters/cloudflare-r2";
import { directUploadFailureMessage } from "@/features/files/r2-errors";

const previous = { ...process.env };

afterEach(() => { process.env = { ...previous }; });

function configure(endpoint = "https://0123456789abcdef.r2.cloudflarestorage.com") {
  process.env.R2_ENDPOINT = endpoint;
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "life-of-hang-files-prod";
}

describe("Cloudflare R2 SDK adapter", () => {
  it("normalizes a trailing slash but rejects bucket paths and public endpoints", () => {
    expect(normalizeR2Endpoint("https://0123456789abcdef.r2.cloudflarestorage.com/")).toBe("https://0123456789abcdef.r2.cloudflarestorage.com");
    expect(() => normalizeR2Endpoint("https://0123456789abcdef.r2.cloudflarestorage.com/life-of-hang-files-prod")).toThrow("r2_invalid_endpoint");
    expect(() => normalizeR2Endpoint("https://bucket.r2.dev")).toThrow("r2_invalid_endpoint");
  });

  it("creates SDK presigned PUT and GET URLs without exposing credentials in code", async () => {
    configure();
    const upload = new URL(await createUploadUrl("user/files/example.png", "image/png"));
    expect(upload.hostname).toBe("life-of-hang-files-prod.0123456789abcdef.r2.cloudflarestorage.com");
    expect(upload.pathname).toBe("/user/files/example.png");
    expect(upload.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(upload.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(upload.searchParams.get("X-Amz-SignedHeaders")).toContain("host");
    const download = new URL(await createDownloadUrl("user/files/example.png", "example.png", true));
    expect(download.searchParams.get("response-content-disposition")).toMatch(/^inline;/);
  });

  it("reports missing or malformed configuration without attempting a request", () => {
    delete process.env.R2_ACCESS_KEY_ID;
    expect(isR2Configured()).toBe(false);
    configure("https://api.cloudflare.com");
    expect(isR2Configured()).toBe(false);
    expect(isR2EndpointValid()).toBe(false);
  });

  it("maps browser network and status failures without secrets", () => {
    expect(directUploadFailureMessage(null)).toContain("CORS");
    expect(directUploadFailureMessage(403)).toContain("Object Read & Write");
    expect(directUploadFailureMessage(502)).toContain("HTTP 502");
  });

  it("sanitizes server health output", () => {
    expect(sanitizeR2Health({ configured: true, endpointValid: true, bucket: "life-of-hang-files-prod", credentialsReachR2: true })).toEqual({ configured: true, endpointValid: true, bucket: "life-of-hang-files-prod", credentialsReachR2: true, status: "ok" });
    expect(sanitizeR2Health({ configured: true, endpointValid: true, bucket: "life-of-hang-files-prod", credentialsReachR2: false }).status).toBe("unreachable");
  });
});
