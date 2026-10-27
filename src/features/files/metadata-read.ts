"use client";
import { readWorkspaceResponse } from "@/lib/workspace-resource-cache";
let active = 0;
const waiters = new Set<() => void>();
/** Automatic publication reads and explicit directory pages share two slots. */
export async function readFileMetadata<T>(url: string, signal: AbortSignal): Promise<T> {
  while (active >= 2) {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const wake = () => { signal.removeEventListener("abort", cancel); waiters.delete(wake); resolve(); };
      const cancel = () => { waiters.delete(wake); reject(signal.reason); };
      waiters.add(wake); signal.addEventListener("abort", cancel, { once: true });
    });
  }
  signal.throwIfAborted(); active++;
  let cancel: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { cancel = () => reject(signal.reason); signal.addEventListener("abort", cancel, { once: true }); });
  try { return await Promise.race([readWorkspaceResponse<T>(url, signal), aborted]); }
  finally { signal.removeEventListener("abort", cancel); active--; for (const wake of [...waiters]) wake(); }
}
