import "server-only";

import { createHash, createHmac } from "crypto";

const required = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;

export function isR2Configured() {
  return required.every((name) => Boolean(process.env[name]));
}

function bucket() {
  if (!process.env.R2_BUCKET_NAME) throw new Error("r2_not_configured");
  return process.env.R2_BUCKET_NAME;
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
  if (!isR2Configured()) throw new Error("r2_not_configured");
  const endpoint = new URL(process.env.R2_ENDPOINT!);
  const now = amzTime(new Date());
  const scope = `${now.dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${encodePath(bucket())}/${encodePath(key)}`;
  const signedHeaders = options.contentType ? "content-type;host" : "host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${process.env.R2_ACCESS_KEY_ID!}/${scope}`,
    "X-Amz-Date": now.timestamp,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (options.filename) query.set("response-content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(options.filename)}`);
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonicalHeaders = `${options.contentType ? `content-type:${options.contentType}\n` : ""}host:${endpoint.host}\n`;
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${now.timestamp}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const dateKey = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY!}`, now.dateStamp);
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
