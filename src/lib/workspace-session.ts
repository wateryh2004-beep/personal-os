/**
 * Short-lived, same-tab recovery for unfinished private work.
 *
 * This is deliberately sessionStorage, not a cloud data source and not a
 * long-lived browser cache. Confirmed records remain authoritative in
 * Supabase; these snapshots only prevent a route transition from discarding
 * in-progress text.
 */
export const WORKSPACE_SESSION_PREFIX = "life-of-hang:workspace:";
export const WORKSPACE_SESSION_TTL_MS = 15 * 60 * 1000;

export type WorkspaceSnapshot<T> = {
  value: T;
  expiresAt: number;
};

export function createWorkspaceSnapshot<T>(value: T, now = Date.now(), ttlMs = WORKSPACE_SESSION_TTL_MS): WorkspaceSnapshot<T> {
  return { value, expiresAt: now + ttlMs };
}

export function parseWorkspaceSnapshot<T>(raw: string | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as Partial<WorkspaceSnapshot<T>>;
    if (typeof snapshot.expiresAt !== "number" || snapshot.expiresAt <= now || !("value" in snapshot)) return null;
    return snapshot.value as T;
  } catch {
    return null;
  }
}

function storageKey(key: string) {
  return `${WORKSPACE_SESSION_PREFIX}${key}`;
}

export function loadWorkspaceSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const fullKey = storageKey(key);
  try {
    const value = parseWorkspaceSnapshot<T>(window.sessionStorage.getItem(fullKey));
    if (value === null) window.sessionStorage.removeItem(fullKey);
    return value;
  } catch {
    return null;
  }
}

export function saveWorkspaceSession<T>(key: string, value: T, ttlMs = WORKSPACE_SESSION_TTL_MS) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(createWorkspaceSnapshot(value, Date.now(), ttlMs)));
  } catch {
    // Private browsing or a full storage quota must never block the editor.
  }
}

export function removeWorkspaceSession(key: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(storageKey(key)); } catch { /* unavailable storage */ }
}

export function clearWorkspaceSessions() {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(WORKSPACE_SESSION_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch { /* unavailable storage */ }
}
