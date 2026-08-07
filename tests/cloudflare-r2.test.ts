import { afterEach, describe, expect, it } from "vitest";
import { createDownloadUrl, createUploadUrl } from "@/lib/adapters/cloudflare-r2";

const previous = { ...process.env };

afterEach(() => {
  process.env = { ...previous };
});

function configure() {
  process.env.R2_ENDPOINT = "https://0123456789abcdef.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "life-of-hang-files-prod";
}

describe("Cloudflare R2 presigning", () => {
  it("uses the documented bucket subdomain and signs the upload content type", () => {
    configure();
    const url = new URL(createUploadUrl("user/notes/image.png", "image/png"));
    expect(url.hostname).toBe("life-of-hang-files-prod.0123456789abcdef.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/user/notes/image.png");
    expect(url.searchParams.get("X-Amz-Content-Sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
  });

  it("keeps normal downloads as attachments while allowing authenticated image rendering inline", () => {
    configure();
    expect(new URL(createDownloadUrl("user/notes/image.png", "image.png")).searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
    expect(new URL(createDownloadUrl("user/notes/image.png", "image.png", true)).searchParams.get("response-content-disposition")).toMatch(/^inline;/);
  });
});
