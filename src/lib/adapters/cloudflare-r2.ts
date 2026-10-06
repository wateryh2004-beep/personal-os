import "server-only";

import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export { r2FailureMessage } from "@/features/files/r2-errors";

type R2Configuration = { endpoint: string; accessKeyId: string; secretAccessKey: string; bucketName: string };
export type R2Health = { configured: boolean; endpointValid: boolean; bucket: string | null; credentialsReachR2: boolean; status: "ok" | "misconfigured" | "unreachable" };

/** Accept only the account-level S3 endpoint. Public/custom R2 URLs cannot presign S3 operations. */
export function normalizeR2Endpoint(input: string) {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("r2_invalid_endpoint"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i.test(url.hostname)) throw new Error("r2_invalid_endpoint");
  return url.origin;
}

function configuration(): R2Configuration | null {
  const rawEndpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AccessKeyID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.SecretAccessKey;
  const bucketName = process.env.R2_BUCKET_NAME ?? process.env.BucketName ?? process.env.R2_BUCKET ?? "life-of-hang-files-prod";
  if (!rawEndpoint || !accessKeyId || !secretAccessKey || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucketName)) return null;
  try { return { endpoint: normalizeR2Endpoint(rawEndpoint), accessKeyId, secretAccessKey, bucketName }; } catch { return null; }
}

export function isR2EndpointValid(value = process.env.R2_ENDPOINT) {
  if (!value) return false;
  try { normalizeR2Endpoint(value); return true; } catch { return false; }
}

function client(config: R2Configuration) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Recent AWS SDK releases default to adding CRC32 query parameters to
    // presigned PUT requests. R2 does not require those parameters and can
    // reject a browser upload when the generated checksum describes an empty
    // payload rather than the file that is sent later through the signed URL.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function requiredConfiguration() {
  const value = configuration();
  if (!value) throw new Error("r2_not_configured");
  return value;
}

export function isR2Configured() { return configuration() !== null; }
export function r2BucketName() { return requiredConfiguration().bucketName; }

export async function createUploadUrl(key: string, contentType: string) {
  const config = requiredConfiguration();
  return getSignedUrl(client(config), new PutObjectCommand({ Bucket: config.bucketName, Key: key, ContentType: contentType }), { expiresIn: 300 });
}

export async function createDownloadUrl(key: string, filename: string, inline = false) {
  const config = requiredConfiguration();
  return getSignedUrl(client(config), new GetObjectCommand({ Bucket: config.bucketName, Key: key, ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}` }), { expiresIn: 300 });
}

export type R2ObjectCheck = { exists: boolean; size: number; contentType: string; status: number | null };

export async function objectExists(key: string): Promise<R2ObjectCheck> {
  try {
    const config = requiredConfiguration();
    const result = await client(config).send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
    return { exists: true, size: Number(result.ContentLength ?? 0), contentType: result.ContentType ?? "application/octet-stream", status: 200 };
  } catch (error) {
    const status = typeof error === "object" && error && "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0) || null : null;
    return { exists: false, size: 0, contentType: "", status };
  }
}

export async function deleteR2Object(key: string) {
  const config = requiredConfiguration();
  await client(config).send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}

/** Read a private object on the server with a hard limit before buffering it. */
export async function readR2ObjectBytes(key: string, maxBytes: number) {
  const config = requiredConfiguration();
  const r2 = client(config);
  const head = await r2.send(
    new HeadObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
  const size = Number(head.ContentLength ?? 0);
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes)
    throw new Error("r2_object_too_large");
  const result = await r2.send(
    new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
  if (!result.Body) throw new Error("r2_object_empty");
  const bytes = await result.Body.transformToByteArray();
  if (bytes.byteLength > maxBytes) throw new Error("r2_object_too_large");
  return bytes;
}

export function sanitizeR2Health(input: { configured: boolean; endpointValid: boolean; bucket: string | null; credentialsReachR2: boolean }): R2Health {
  return { ...input, status: !input.configured || !input.endpointValid ? "misconfigured" : input.credentialsReachR2 ? "ok" : "unreachable" };
}

/** Server-to-R2 diagnostic: no credentials, endpoint, signed URL, or provider body is returned. */
export async function checkR2Health(): Promise<R2Health> {
  const config = configuration();
  if (!config) return sanitizeR2Health({ configured: false, endpointValid: isR2EndpointValid(), bucket: null, credentialsReachR2: false });
  try {
    await client(config).send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return sanitizeR2Health({ configured: true, endpointValid: true, bucket: config.bucketName, credentialsReachR2: true });
  } catch {
    return sanitizeR2Health({ configured: true, endpointValid: true, bucket: config.bucketName, credentialsReachR2: false });
  }
}

/** Narrow immutable writes for artwork. Never overwrites or cleans up other files. */
export async function createImmutableR2Artwork(key: string, bytes: Uint8Array, contentType: string) {
  assertArtworkKey(key);
  const config = requiredConfiguration();
  try {
    await client(config).send(new PutObjectCommand({
      Bucket: config.bucketName, Key: key, Body: bytes, ContentType: contentType,
      CacheControl: "private, no-store, max-age=0", IfNoneMatch: "*",
    }), { abortSignal: AbortSignal.timeout(15_000) });
  } catch (error) {
    // Another identical request may win. The caller must read back and verify.
    if (r2Status(error) !== 412) throw error;
  }
}

function assertArtworkKey(key: string) {
  if (!/^[0-9a-f-]{36}\/leisure-artwork\/v1\/[a-z0-9-]+\/[0-9a-f]{64}\.(?:json|jpg|png|webp)$/.test(key))
    throw new Error("invalid_artwork_key");
}
function r2Status(error: unknown) {
  return typeof error === "object" && error && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

/** Bounded private read. Only an actual missing object returns null. */
export async function readR2Artwork(key: string, maxBytes: number) {
  assertArtworkKey(key);
  const config = requiredConfiguration();
  try {
    const object = await client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
      { abortSignal: AbortSignal.timeout(15_000) });
    if (!object.Body || !Number.isSafeInteger(object.ContentLength) || object.ContentLength! < 1 || object.ContentLength! > maxBytes) {
      await object.Body?.transformToWebStream().cancel().catch(() => {});
      throw new Error("invalid_artwork_size");
    }
    const reader = object.Body.transformToWebStream().getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("artwork_too_large");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== object.ContentLength) throw new Error("artwork_size_mismatch");
    return { bytes: Buffer.concat(chunks), contentType: object.ContentType ?? "application/octet-stream" };
  } catch (error) {
    if (r2Status(error) === 404) return null;
    throw error;
  }
}

/** A private GET with no buffering. Consumers must enforce their byte budget. */
export async function readR2ObjectStream(key: string, signal?: AbortSignal) {
  const config = requiredConfiguration();
  const timeout = AbortSignal.timeout(120_000);
  const result = await client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
    { abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!result.Body) throw new Error("r2_object_empty");
  const body = result.Body.transformToWebStream();
  if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0) {
    await body.cancel().catch(() => {});
    throw new Error("r2_invalid_size");
  }
  return { body, size: result.ContentLength!, etag: result.ETag ?? null };
}

/** Seal the exact version just verified into a fresh, never-browser-signed key. */
export async function copyVerifiedR2Object(source: string, destination: string, etag: string) {
  const config = requiredConfiguration();
  const sourceParts = source.split("/");
  const destinationParts = destination.split("/");
  if (!etag || source === destination || sourceParts[1] !== "files" ||
      sourceParts[0] !== destinationParts[0] || sourceParts[2] !== destinationParts[2] ||
      destinationParts[1] !== "files" || !destinationParts[3]?.startsWith("sealed-")) {
    throw new Error("invalid_seal_target");
  }
  await client(config).send(new CopyObjectCommand({
    Bucket: config.bucketName, Key: destination,
    CopySource: [config.bucketName, ...sourceParts].map(encodeURIComponent).join("/"),
    CopySourceIfMatch: etag,
  }), { abortSignal: AbortSignal.timeout(60_000) });
}
