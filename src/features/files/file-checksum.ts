import { sha256 } from "@noble/hashes/sha2.js";
/** At most one 1 MiB read buffer, regardless of file size. */
export async function checksumFile(file: Blob, signal?: AbortSignal) {
  const hash = sha256.create();
  try {
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
      signal?.throwIfAborted();
      hash.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()));
    }
    signal?.throwIfAborted();
    return Array.from(hash.digest(), byte => byte.toString(16).padStart(2,"0")).join("");
  } finally { hash.destroy(); }
}
