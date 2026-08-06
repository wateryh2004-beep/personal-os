"use client";

import { useState } from "react";

type Authorization = { userCode: string; verificationUri: string; expiresIn: number };

export function MicrosoftDeviceConnect({ reconnect = false }: { reconnect?: boolean }) {
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setState("starting"); setError(null);
    try {
      const response = await fetch("/api/integrations/microsoft/device", { method: "POST" });
      const data = await response.json() as Authorization & { error?: string };
      if (!response.ok || !data.userCode || !data.verificationUri) throw new Error(data.error || "authorization_start_failed");
      setAuthorization(data);
      window.open(data.verificationUri, "_blank", "noopener,noreferrer");
    } catch {
      setError("无法开始 Microsoft 授权。请确认 Vercel 已设置 SUPABASE_SECRET_KEY 后重试。");
    } finally { setState("idle"); }
  }

  async function check() {
    setState("checking"); setError(null);
    try {
      const response = await fetch("/api/integrations/microsoft/device", { method: "PATCH" });
      const data = await response.json() as { status?: string; error?: string };
      if (response.status === 202 || data.status === "pending") { setError("Microsoft 还未确认授权。完成网页操作后，再点击检查。 "); return; }
      if (!response.ok || data.status !== "connected") throw new Error(data.error || "authorization_failed");
      window.location.reload();
    } catch {
      setError("授权未完成或已过期。请重新开始授权。 ");
    } finally { setState("idle"); }
  }

  return <section className="mt-6 border-l-2 border-[#365F78] bg-[#EDF3F6] px-4 py-4">
    <h2 className="font-medium">{reconnect ? "重新连接 Microsoft" : "连接 Microsoft"}</h2>
    <p className="mt-1 text-sm leading-6 text-zinc-600">在 Microsoft 官方页面完成授权后，返回这里继续。</p>
    {!authorization ? <button type="button" onClick={begin} disabled={state !== "idle"} className="mt-3 bg-[#365F78] px-3 py-2 text-sm text-white disabled:opacity-60">{state === "starting" ? "正在生成授权码…" : reconnect ? "重新授权 Outlook" : "连接 Outlook"}</button> : <div className="mt-3 border bg-white p-3 text-sm"><p>在打开的 Microsoft 页面输入此代码：</p><p className="mt-2 font-mono text-lg font-semibold tracking-[0.16em] text-[#365F78]">{authorization.userCode}</p><a className="mt-2 inline-block text-[#365F78] underline" href={authorization.verificationUri} target="_blank" rel="noreferrer">重新打开 Microsoft 授权页面</a><br /><button type="button" onClick={check} disabled={state !== "idle"} className="mt-3 border px-3 py-2 text-sm disabled:opacity-60">{state === "checking" ? "正在检查…" : "我已完成授权，检查连接"}</button></div>}
    {error ? <p role="status" className="mt-3 text-sm text-zinc-600">{error}</p> : null}
  </section>;
}
