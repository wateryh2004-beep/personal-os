export type VaultDraft = { id: string; title: string; body: string; revision: number; savedAt: number };
const encoder = new TextEncoder();
const prefix = "personal-os:sealed-draft:";
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
function bytes(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/.test(value)) throw new Error("invalid_ciphertext");
  return Uint8Array.from(value.match(/../g)!, value => parseInt(value, 16));
}
export async function deriveDraftKey(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 310000, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealDraft(key: CryptoKey, draft: VaultDraft, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`${owner}:${draft.id}`);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, encoder.encode(JSON.stringify(draft)));
  return JSON.stringify({ v: 1, iv: hex(iv), data: hex(new Uint8Array(encrypted)) });
}
export async function openDraft(key: CryptoKey, raw: string, owner: string, id: string): Promise<VaultDraft> {
  const payload = JSON.parse(raw);
  if (payload.v !== 1 || typeof payload.iv !== "string" || typeof payload.data !== "string") throw new Error("invalid_ciphertext");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(payload.iv), additionalData: encoder.encode(`${owner}:${id}`) }, key, bytes(payload.data));
  const draft = JSON.parse(new TextDecoder().decode(plaintext));
  if (draft.id !== id || typeof draft.title !== "string" || typeof draft.body !== "string" || !Number.isInteger(draft.revision)) throw new Error("invalid_draft");
  return draft;
}
export function draftStorageKey(owner: string, id: string) { return `${prefix}${owner}:${id}`; }
