import { describe, expect, it } from "vitest";
import { hashVaultPassword, newVaultToken, tokenHash, validVaultToken, vaultSessionActive, verifyVaultPassword } from "@/features/vault/crypto";
import { deriveDraftKey, openDraft, sealDraft } from "@/features/vault/client-crypto";

describe("additional vault verification", () => {
  it("salts slow password hashes, rejects wrong/malformed/oversized passwords", async () => {
    const first = await hashVaultPassword("synthetic-private-password");
    const second = await hashVaultPassword("synthetic-private-password");
    expect(first).not.toBe(second);
    expect(first).not.toContain("synthetic-private-password");
    expect(await verifyVaultPassword("synthetic-private-password", first)).toBe(true);
    expect(await verifyVaultPassword("synthetic-wrong-password", first)).toBe(false);
    expect(await verifyVaultPassword("synthetic-private-password", "bad")).toBe(false);
    expect(await verifyVaultPassword("x".repeat(257), first)).toBe(false);
  });
  it("uses unguessable bearer tokens, hashes and both idle and absolute expiry", () => {
    const a = newVaultToken(), b = newVaultToken();
    expect(a).not.toBe(b); expect(validVaultToken(a)).toBe(true); expect(validVaultToken("bad")).toBe(false);
    expect(tokenHash(a)).not.toBe(a);
    const now=Date.now();
    expect(vaultSessionActive({expires_at:new Date(now+1000).toISOString(),last_seen_at:new Date(now).toISOString()},now)).toBe(true);
    expect(vaultSessionActive({expires_at:new Date(now+1000).toISOString(),last_seen_at:new Date(now-300001).toISOString()},now)).toBe(false);
    expect(vaultSessionActive({expires_at:new Date(now-1).toISOString(),last_seen_at:new Date(now).toISOString()},now)).toBe(false);
  });
  it("encrypts draft titles and bodies, authenticates owner/record and rejects tampering", async () => {
    const key = await deriveDraftKey("synthetic-password", "synthetic-salt");
    const draft={id:"note-fixture",title:"private fixture title",body:"private fixture body 中文",revision:3,savedAt:123};
    const sealed=await sealDraft(key,draft,"owner-a");
    expect(sealed).not.toContain(draft.title); expect(sealed).not.toContain(draft.body);
    expect(await openDraft(key,sealed,"owner-a",draft.id)).toEqual(draft);
    await expect(openDraft(key,sealed,"owner-b",draft.id)).rejects.toThrow();
    await expect(openDraft(key,sealed,"owner-a","other-note")).rejects.toThrow();
    const wrong=await deriveDraftKey("different-password","synthetic-salt");
    await expect(openDraft(wrong,sealed,"owner-a",draft.id)).rejects.toThrow();
    const tampered=JSON.parse(sealed); tampered.data=(tampered.data[0]==="a"?"b":"a")+tampered.data.slice(1);
    await expect(openDraft(key,JSON.stringify(tampered),"owner-a",draft.id)).rejects.toThrow();
  });
});
