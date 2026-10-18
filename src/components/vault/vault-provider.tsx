"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { WORKSPACE_SESSION_PREFIX } from "@/lib/workspace-session";
import { deriveDraftKey } from "@/features/vault/client-crypto";
import dynamic from "next/dynamic";
const VaultWorkspace = dynamic(() => import("./vault-workspace").then(module => module.VaultWorkspace), { ssr: false });

type Kind = "note" | "document" | "note_folder" | "file_folder";
type Access = { tab: string; owner: string; key: CryptoKey };
type VaultContextValue = { unlocked: boolean; open: () => void; lock: () => void; hide: (kind: Kind, id: string) => Promise<void> };
const VaultContext = createContext<VaultContextValue>({ unlocked: false, open: () => {}, lock: () => {}, hide: async () => {} });
export const useVault = () => useContext(VaultContext);
export const VAULT_OPEN_EVENT = "personal-os:private-open";
const shortcutKey = "personal-os:private-shortcut";

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const accessRef = useRef<Access | null>(null);
  const [panel, setPanel] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [masked, setMasked] = useState(false);
  const [shortcut, setShortcut] = useState("p");
  const generation = useRef(0);
  const lastActivity = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const [credentials, setCredentials] = useState({ password: "", confirm: "", loginPassword: "" });
  const lock = useCallback(() => {
    generation.current++;
    accessRef.current = null;
    document.documentElement.dataset.vaultCovered = "true";
    window.dispatchEvent(new Event("personal-os:private-seal"));
    setAccess(null); setPanel(false); setAuthOpen(false); setMasked(false);
    void fetch("/api/vault/session", { method: "DELETE", keepalive: true }).then(async response => {
      if (!response.ok) setMessage("内容已收起，但服务端撤销尚未确认；解锁会话最长闲置 5 分钟失效。");
    }).catch(() => setMessage("内容已收起；网络恢复前无法确认服务端撤销。"));
  }, []);

  const open = useCallback(() => {
    if (accessRef.current) { setPanel(true); return; }
    const epoch = ++generation.current;
    setError(""); setConfigured(null); setCredentials({ password: "", confirm: "", loginPassword: "" }); setAuthOpen(true);
    void fetch("/api/vault/session", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (epoch !== generation.current) return;
      if (!response.ok) throw new Error(data.error || "读取失败。");
      setConfigured(data.configured);
    }).catch(reason => { if (epoch === generation.current) setError(reason.message); });
  }, []);

  useEffect(() => {
    const restoreShortcut = window.setTimeout(() => { try { const saved = localStorage.getItem(shortcutKey); if (saved && /^[a-z]$/.test(saved)) setShortcut(saved); } catch {} }, 0);
    const activate = (event: Event) => { if (!event.defaultPrevented) open(); };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === shortcut) {
        event.preventDefault();
        if (accessRef.current) lock(); else window.dispatchEvent(new Event(VAULT_OPEN_EVENT, { cancelable: true }));
      }
    };
    window.addEventListener(VAULT_OPEN_EVENT, activate); window.addEventListener("keydown", keyboard);
    return () => { clearTimeout(restoreShortcut); window.removeEventListener(VAULT_OPEN_EVENT, activate); window.removeEventListener("keydown", keyboard); };
  }, [lock, open, shortcut]);

  const call = useCallback(async (url: string, init?: RequestInit) => {
    const current = accessRef.current;
    if (!current) throw new Error("需要重新验证。");
    const response = await fetch(url, { ...init, cache: "no-store", headers: { ...init?.headers, "x-vault-tab": current.tab } });
    if (current !== accessRef.current) throw new Error("会话已锁定。");
    if (response.status === 401 || response.status === 423) { lock(); throw new Error("需要重新验证。"); }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "操作未完成。"); }
    return response;
  }, [lock]);

  useEffect(() => {
    if (!access) return;
    lastActivity.current = Date.now();
    let lastHeartbeat = Date.now();
    const activity = () => { if (document.visibilityState === "visible") lastActivity.current = Date.now(); };
    const visibility = () => {
      if (document.visibilityState !== "visible") {
        hiddenAt.current = Date.now(); document.documentElement.dataset.vaultCovered = "true"; setMasked(true);
        // Seal the current draft before a possible background freeze.
        window.dispatchEvent(new Event("personal-os:private-seal"));
      } else if (hiddenAt.current !== null) {
        const elapsed = Date.now() - hiddenAt.current; hiddenAt.current = null;
        if (elapsed >= 30_000) { lock(); return; }
        void call("/api/vault/session", { method: "PATCH" }).then(() => {
          if (accessRef.current === access) { delete document.documentElement.dataset.vaultCovered; setMasked(false); }
        }).catch(() => lock());
      }
    };
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity.current >= 300_000 || (hiddenAt.current !== null && now - hiddenAt.current >= 30_000)) { lock(); return; }
      if (now - lastHeartbeat >= 60_000 && now - lastActivity.current < 60_000 && document.visibilityState === "visible") {
        lastHeartbeat = now;
        void call("/api/vault/session", { method: "PATCH" }).catch(() => lock());
      }
    }, 1000);
    const pagehide = () => lock();
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity);
    window.addEventListener("pagehide", pagehide); document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(tick); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); window.removeEventListener("pagehide", pagehide); document.removeEventListener("visibilitychange", visibility); };
  }, [access, call, lock]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!configured && credentials.password !== credentials.confirm) { setError("两次独立口令不一致。"); return; }
    const epoch = generation.current;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/vault/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: credentials.password, ...(!configured ? { loginPassword: credentials.loginPassword } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "验证失败。");
      const key = await deriveDraftKey(credentials.password, data.draftSalt);
      if (epoch !== generation.current) return;
      const next = { tab: data.tabToken, owner: data.owner, key };
      accessRef.current = next; setAccess(next); setCredentials({ password: "", confirm: "", loginPassword: "" });
      delete document.documentElement.dataset.vaultCovered; setMasked(false); setAuthOpen(false); setPanel(true);
    } catch (reason) { if (epoch === generation.current) setError(reason instanceof Error ? reason.message : "验证失败。"); }
    finally { setBusy(false); }
  }

  async function hide(kind: Kind, id: string) {
    try {
      const result = await (await call("/api/vault/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, hidden: true }) })).json();
      clearWorkspaceResources();
      // Existing ordinary draft/recent caches must not retain content just hidden.
      // Remove only the affected IDs returned by the server, preserving other drafts.
      const ids: string[] = [...result.noteIds, ...result.documentIds];
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const name = sessionStorage.key(i)!;
        if (name.startsWith(WORKSPACE_SESSION_PREFIX)) {
          const raw = sessionStorage.getItem(name) || "";
          if (ids.some((hidden: string) => name.includes(hidden) || raw.includes(hidden))) sessionStorage.removeItem(name);
        }
      }
      for (const key of ["personal-os:recent:v1"]) {
        const raw = localStorage.getItem(key);
        if (raw && ids.some((hidden: string) => raw.includes(hidden))) localStorage.removeItem(key);
      }
      // A fresh document discards ordinary editor/list/preview memory as well as
      // route caches. The tab-only proof is intentionally lost on this reload.
      window.location.replace(kind === "note" || kind === "note_folder" ? "/notes" : "/files");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "操作失败。"); }
  }

  return <VaultContext.Provider value={{ unlocked: Boolean(access) && !masked, open, lock, hide }}>
    {children}
    <style>{`html[data-vault-covered="true"] [data-vault-content] { visibility: hidden !important; }`}</style>
    {message ? <div role="status" className="fixed bottom-20 left-1/2 z-[100] max-w-[90vw] -translate-x-1/2 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-sm shadow-lg"><span>{message}</span><button className="ml-3 min-h-11 px-2" onClick={() => setMessage("")} aria-label="关闭提示">×</button></div> : null}
    <Dialog open={authOpen || Boolean(access && panel)} onOpenChange={value => {
      if (!value && accessRef.current) { lock(); return; }
      if (!value) { generation.current++; setCredentials({ password: "", confirm: "", loginPassword: "" }); }
      setAuthOpen(value);
    }}>
      {access && panel ? <VaultWorkspace key={access.tab} access={access} call={call} lock={lock} masked={masked} onOrganize={() => setPanel(false)} shortcut={shortcut} onShortcut={value => { setShortcut(value); try { localStorage.setItem(shortcutKey, value); } catch {} }} /> : authOpen ?
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{configured === false ? "设置独立口令" : "验证"}</DialogTitle><DialogDescription>{configured === false ? "首次设置需验证登录密码。独立口令至少 12 个字符，请妥善保管。" : "输入独立口令以继续。"}</DialogDescription></DialogHeader>
        <form onSubmit={unlock} className="space-y-4">
          {configured === false ? <label className="block text-sm">当前登录密码<input required type="password" autoComplete="current-password" value={credentials.loginPassword} onChange={e => setCredentials({ ...credentials, loginPassword: e.target.value })} className="ui-field mt-2 min-h-11 w-full rounded-lg px-3 text-base" /></label> : null}
          <label className="block text-sm">独立口令<input autoFocus required minLength={12} maxLength={256} type="password" autoComplete={configured ? "current-password" : "new-password"} value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} className="ui-field mt-2 min-h-11 w-full rounded-lg px-3 text-base" /></label>
          {configured === false ? <label className="block text-sm">再次输入<input required type="password" autoComplete="new-password" value={credentials.confirm} onChange={e => setCredentials({ ...credentials, confirm: e.target.value })} className="ui-field mt-2 min-h-11 w-full rounded-lg px-3 text-base" /></label> : null}
          {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button disabled={busy || configured === null} className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 text-[var(--text-on-accent,#fff)] disabled:opacity-50">{busy ? "正在验证…" : configured === false ? "设置并进入" : "继续"}</button>
        </form>
      </DialogContent> : null}
    </Dialog>
    {access && !panel ? <button onClick={() => setPanel(true)} aria-label="返回暗格" title="返回" className="fixed bottom-5 right-5 z-40 grid size-11 place-items-center rounded-full bg-[var(--surface-elevated)] shadow-md"><span className="size-2 rounded-full bg-[var(--accent)]" /></button> : null}
  </VaultContext.Provider>;
}

export function VaultHideButton({ kind, id, onDone, className = "" }: { kind: Kind; id: string; onDone?: () => void; className?: string }) {
  const vault = useVault();
  const [busy, setBusy] = useState(false);
  if (!vault.unlocked) return null;
  return <button type="button" disabled={busy} onClick={async () => { setBusy(true); await vault.hide(kind, id); setBusy(false); onDone?.(); }} className={`min-h-11 px-2 text-[13px] text-[var(--text-secondary)] ${className}`}>{busy ? "正在收纳…" : "收入暗格"}</button>;
}

export function VaultHideMenuItem({ kind, id }: { kind: Kind; id: string }) {
  const vault = useVault();
  if (!vault.unlocked) return null;
  return <DropdownMenuItem onSelect={() => { void vault.hide(kind, id); }}>收入暗格</DropdownMenuItem>;
}
