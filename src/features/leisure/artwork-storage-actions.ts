"use server";

import { requireOwnerApi } from "@/lib/auth/require-owner";
import { findArtworkImport } from "./artwork-import-registry";
import { importPrivateArtwork } from "./artwork-storage";

export async function importLeisureArtwork(id: string) {
  try {
    const { userId } = await requireOwnerApi();
    if (typeof id !== "string" || !findArtworkImport(id)) return { ok: false as const, error: "这张图片不在本次迁移清单中。" };
    const manifest = await importPrivateArtwork(userId, id);
    return { ok: true as const, id, sha256: manifest.original.sha256, bytes: manifest.original.bytes, verifiedAt: manifest.verifiedAt };
  } catch {
    // Never expose R2 endpoints, credentials, signed URLs, provider bodies, or session details.
    return { ok: false as const, error: "未能完成复制与校验，原来的图片地址仍然有效。可稍后重试。" };
  }
}
