import "server-only";

import { createHash, createHmac } from "crypto";

type R2Configuration = { endpoint: string; accessKeyId: string; secretAccessKey: string; bucketName: string };

/** Cloudflare labels generated credentials as AccessKeyID / SecretAccessKey.
 * Keep accepting those existing Vercel names alongside our R2_* convention. */
function configuration(): R2Configuration | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AccessKeyID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.SecretAccessKey;
  // This is the production bucket created for Life of HANG. Keeping a
  // default prevents a harmless omitted Vercel variable from disabling the
  // entire Files workspace; deployments can still override it when migrated.
  const bucketName = process.env.R2_BUCKET_NAME ?? process.env.BucketName ?? process.env.R2_BUCKET ?? "life-of-hang-files-prod";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey, bucketName };
}

export function isR2Configured() {
  return configuration() !== null;
}

export function r2BucketName() {
  const value = configuration();
  if (!value) throw new Error("r2_not_configured");
  return value.bucketName;
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function amzTime(date: Date) {
  const value = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { dateStamp: value.slice(0, 8), timestamp: value.slice(0, 16) + "Z" };
}

function encodePath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

/** Minimal AWS SigV4 presigner for R2's S3-compatible API. It keeps the
 * credentials in Vercel and avoids making an upload pass through the server. */
export function createSignedUrl(method: "GET" | "HEAD" | "PUT", key: string, options: { contentType?: string; filename?: string } = {}) {
  const config = configuration();
  if (!config) throw new Error("r2_not_configured");
  const endpoint = new URL(config.endpoint);
  const now = amzTime(new Date());
  const scope = `${now.dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${encodePath(config.bucketName)}/${encodePath(key)}`;
  const signedHeaders = options.contentType ? "content-type;host" : "host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": now.timestamp,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (options.filename) query.set("response-content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(options.filename)}`);
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonicalHeaders = `${options.contentType ? `content-type:${options.contentType}\n` : ""}host:${endpoint.host}\n`;
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${now.timestamp}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, now.dateStamp);
  const regionKey = hmac(dateKey, "auto"); const serviceKey = hmac(regionKey, "s3"); const signingKey = hmac(serviceKey, "aws4_request");
  query.set("X-Amz-Signature", hmac(signingKey, stringToSign).toString("hex"));
  return `${endpoint.origin}${canonicalUri}?${query.toString()}`;
}

export function createUploadUrl(key: string, contentType: string) {
  return createSignedUrl("PUT", key, { contentType });
}

export function createDownloadUrl(key: string, filename: string) {
  return createSignedUrl("GET", key, { filename });
}

export async function objectExists(key: string) {
  try {
    const response = await fetch(createSignedUrl("HEAD", key), { method: "HEAD", cache: "no-store" });
    return { exists: response.ok, size: Number(response.headers.get("content-length") ?? 0), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
  } catch { return { exists: false, size: 0, contentType: "" }; }
}
