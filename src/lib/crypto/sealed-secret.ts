import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(keyMaterial: string) {
  return createHash("sha256").update(keyMaterial).digest();
}

export function sealSecret(value: string, keyMaterial: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function unsealSecret(value: string, keyMaterial: string) {
  const [ivText, tagText, ciphertextText, ...rest] = value.split(".");
  if (!ivText || !tagText || !ciphertextText || rest.length) throw new Error("sealed_secret_invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyMaterial), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("sealed_secret_invalid");
  }
}
