"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureWorkspaceScope, clearWorkspaceResources, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";
import { calendarWorkspaceResource, invalidateCalendarRangeResources } from "@/features/calendar/workspace-resource";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";

type Authorization = { userCode: string; verificationUri: string; expiresIn: number };

export function MicrosoftDeviceConnect({ reconnect = false, onConnected }: { reconnect?: boolean; onConnected?: () => void }) {
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => { generation.current += 1; request.current?.abort(); request.current = null; setAuthorization(null); setState("idle"); setError(null); };
    const unregister = registerWorkspaceScopeCleanup(clear);
    return () => { generation.current += 1; request.current?.abort(); unregister(); };
  }, []);

  async function begin() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const token = ++generation.current; const scope = captureWorkspaceScope();
    const current = () => scope() && token === generation.current && !controller.signal.aborted;
    setState("starting"); setError(null);
    try {
      const response = await fetch("/api/integrations/microsoft/device", { method: "POST", signal: controller.signal, cache: "no-store" });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); return; }
      const data = await response.json() as Authorization & { error?: string };
      if (!current()) return;
      if (!response.ok || typeof data.userCode !== "string" || data.userCode.length > 32 || !data.userCode || typeof data.verificationUri !== "string" || !Number.isFinite(data.expiresIn)) throw new Error("authorization_start_failed");
      const url = new URL(data.verificationUri);
      if (url.protocol !== "https:" || !["microsoft.com", "www.microsoft.com", "login.microsoftonline.com"].includes(url.hostname) || url.username || url.password) throw new Error("authorization_invalid_destination");
      setAuthorization(data);
      window.open(data.verificationUri, "_blank", "noopener,noreferrer");
    } catch {
      if (current()) setError("暂时无法开始 Microsoft 授权，请重试。");
    } finally { if (current()) setState("idle"); }
  }

  async function check() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const token = ++generation.current; const scope = captureWorkspaceScope();
    const current = () => scope() && token === generation.current && !controller.signal.aborted;
    setState("checking"); setError(null);
    try {
      const response = await fetch("/api/integrations/microsoft/device", { method: "PATCH", signal: controller.signal, cache: "no-store" });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); return; }
      const data = await response.json() as { status?: string; error?: string };
      if (!current()) return;
      if (response.status === 202 || data.status === "pending") { setError("Microsoft 还未确认授权。完成网页操作后，再点击检查。 "); return; }
      if (!response.ok || data.status !== "connected") throw new Error(data.error || "authorization_failed");
      setAuthorization(null);
      setError("连接已恢复，正在重新读取同步状态…");
      invalidateCalendarRangeResources();
      const resources = [tasksWorkspaceResource, calendarWorkspaceResource, todayWorkspaceResource];
      resources.forEach(resource => resource.invalidate());
      const results = await Promise.allSettled(resources.map(resource => resource.revalidate({ force: true })));
      if (!current()) return;
      setError(results.every(result => result.status === "fulfilled") ? "连接已恢复。日程和任务以各自同步状态为准。" : "连接已恢复，部分数据尚未刷新，可稍后重试同步。");
      onConnected?.(); router.refresh();
    } catch {
      if (current()) setError("授权未完成或已过期。请重新开始授权。");
    } finally { if (current()) setState("idle"); }
  }

  return <section className="mt-6 border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-4">
    <h2 className="font-medium">{reconnect ? "重新连接 Microsoft" : "连接 Microsoft"}</h2>
    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">在 Microsoft 官方页面完成授权后，返回这里继续。</p>
    {!authorization ? <button type="button" onClick={begin} disabled={state !== "idle"} className="mt-3 bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-60">{state === "starting" ? "正在生成授权码…" : reconnect ? "重新授权 Outlook" : "连接 Outlook"}</button> : <div className="mt-3 border bg-[var(--surface-canvas)] p-3 text-sm"><p>在打开的 Microsoft 页面输入此代码：</p><p className="mt-2 font-mono text-lg font-semibold tracking-[0.16em] text-[var(--accent)]">{authorization.userCode}</p><a className="mt-2 inline-block text-[var(--accent)] underline" href={authorization.verificationUri} target="_blank" rel="noreferrer">重新打开 Microsoft 授权页面</a><br /><button type="button" onClick={check} disabled={state !== "idle"} className="mt-3 border px-3 py-2 text-sm disabled:opacity-60">{state === "checking" ? "正在检查…" : "我已完成授权，检查连接"}</button><button type="button" disabled={state !== "idle"} onClick={() => { setAuthorization(null); setError(null); }} className="ml-3 mt-3 min-h-11 text-[var(--accent)] underline">重新开始授权</button></div>}
    {error ? <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{error}</p> : null}
  </section>;
}
