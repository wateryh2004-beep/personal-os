"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { finishInnerUpload, innerSessionPath, innerUploadsPath, privateJson, uploadInnerArchive, type VaultCall } from "@/features/vault/inner-client";
import type { InnerArchive } from "@/features/vault/inner-contract";

const field = "ui-field mt-2 block min-h-12 w-full rounded-lg px-3 text-base";
const inputButton = "relative inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-[var(--separator)] px-3 text-sm font-medium hover:bg-[var(--surface-control)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]";
const detail = "text-sm leading-6 text-[var(--text-secondary)]";
type Cursor = { id: string; created: string };
type Page = { files: InnerArchive[]; next: Cursor | null };
type Progress = { filename: string; phase: "hashing" | "uploading" | "verifying"; uploaded: number; size: number };
const message = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试。";
const sizeText = (size: number) => size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(2)} GiB` : size >= 1024 ** 2 ? `${(size / 1024 ** 2).toFixed(1)} MiB` : `${Math.ceil(size / 1024)} KiB`;
const stateText = {
  completed: "已保存", initializing: "待继续", uploading: "待继续",
  completing: "待校验", failed: "校验未通过", expired: "续传已过期", aborting: "待取消",
};

export function InnerVault({ call, onBack }: { call: VaultCall; onBack: (notice?: string) => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cancel, setCancel] = useState<InnerArchive | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef<AbortController | null>(null);
  const access = useRef<string | null>(null);

  const readSetup = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await (await call(innerSessionPath, { signal })).json();
      signal.throwIfAborted();
      setConfigured(Boolean(data.configured));
    } catch (error) {
      if (!signal.aborted) setError(message(error));
    }
  }, [call]);

  useEffect(() => {
    const scope = new AbortController();
    mounted.current = scope;
    const init = window.setTimeout(() => void readSetup(scope.signal), 0);
    const seal = () => operation.current?.abort();
    window.addEventListener("personal-os:private-seal", seal);
    return () => {
      clearTimeout(init); scope.abort(); seal();
      const proof = access.current;
      access.current = null;
      if (proof) void call(innerSessionPath, { method: "DELETE", headers: { "x-vault-inner": proof }, keepalive: true }).catch(() => {});
      window.removeEventListener("personal-os:private-seal", seal);
    };
  }, [call, readSetup]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [token]);

  const close = useCallback(async () => {
    const current = access.current;
    access.current = null;
    operation.current?.abort();
    if (!current) { onBack(); return; }
    onBack("内层已收起，正在确认锁定。");
    try {
      await call(innerSessionPath, { method: "DELETE", headers: { "x-vault-inner": current }, keepalive: true,
        signal: AbortSignal.timeout(8000) });
      onBack("内层已锁定。");
    } catch {
      onBack("内层已收起，服务端锁定尚未确认。");
    }
  }, [call, onBack]);

  const innerCall = useCallback<VaultCall>(async (url, init) => {
    const current = access.current;
    const scope = mounted.current?.signal;
    if (!current || !scope) throw new Error("请重新验证内层口令。");
    const signal = init?.signal ? AbortSignal.any([scope, init.signal]) : scope;
    try {
      const result = await call(url, { ...init, signal, headers: { ...init?.headers, "x-vault-inner": current } });
      signal.throwIfAborted();
      if (current !== access.current) throw new Error("内层已锁定。");
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "InnerVaultLocked" && current === access.current && !scope.aborted) {
        access.current = null;
        operation.current?.abort();
        setToken(null); setPage(null); setCancel(null); setProgress(null);
        setPassword(""); setConfirm(""); setNotice(""); setError(error.message);
      }
      throw error;
    }
  }, [call]);

  const refresh = useCallback(async (signal?: AbortSignal, cursor?: Cursor) => {
    const params = cursor ? `?${new URLSearchParams(cursor)}` : "";
    const result: Page = await (await innerCall(innerUploadsPath + params, { signal })).json();
    if (mounted.current?.signal.aborted || !access.current) return;
    setPage(previous => cursor && previous ? { ...result, files: [...previous.files, ...result.files] } : result);
  }, [innerCall]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const initial = window.setTimeout(() => { void refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)); }); }, 0);
    let lastActivity = Date.now();
    let lastRenewed = lastActivity;
    const activity = () => { if (document.visibilityState === "visible") lastActivity = Date.now(); };
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastActivity >= 300_000) { void close(); return; }
      if (now - lastRenewed >= 60_000 && now - lastActivity < 60_000 && document.visibilityState === "visible") {
        lastRenewed = now;
        void innerCall(innerSessionPath, { method: "PATCH", signal: controller.signal })
          .catch(error => { if (!controller.signal.aborted && access.current) { setError(message(error)); void close(); } });
      }
    }, 1000);
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity);
    window.addEventListener("personal-os:private-transfer-progress", activity);
    return () => {
      controller.abort(); clearInterval(timer); clearTimeout(initial);
      window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity);
      window.removeEventListener("personal-os:private-transfer-progress", activity);
    };
  }, [close, innerCall, refresh, token]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (busy || configured === null) return;
    if (!configured && password !== confirm) { setError("两次输入的口令不一致。"); return; }
    const signal = mounted.current!.signal;
    setBusy(true); setError("");
    try {
      const data = await (await call(innerSessionPath, privateJson("POST", { password }, signal))).json();
      signal.throwIfAborted();
      if (typeof data.token !== "string" || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error("验证未完成，请重试。");
      access.current = data.token;
      setConfigured(true); setToken(data.token); setPassword(""); setConfirm("");
    } catch (error) { if (!signal.aborted) { setPassword(""); setConfirm(""); setError(message(error)); } }
    finally { if (!signal.aborted) setBusy(false); }
  }

  async function run(task: (signal: AbortSignal) => Promise<void>, reload = true) {
    if (operation.current || !access.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(""); setNotice("");
    try { await task(controller.signal); }
    catch (error) {
      if (access.current && !mounted.current?.signal.aborted) {
        if (controller.signal.aborted) setNotice("上传已暂停，重新选择原 ZIP 可继续。");
        else setError(message(error));
      }
    } finally {
      if (reload && access.current && !mounted.current?.signal.aborted) {
        try { await refresh(); }
        catch (error) { if (access.current) setError(previous => previous || message(error)); }
      }
      if (!mounted.current?.signal.aborted) { setProgress(null); setBusy(false); }
      if (operation.current === controller) operation.current = null;
    }
  }

  function upload(file: File, resume?: InnerArchive) {
    void run(async signal => {
      const saved = await uploadInnerArchive(file, innerCall, {
        signal, resume, onProgress: (phase, uploaded) => {
          setProgress({ filename: file.name, size: file.size, phase, uploaded });
          if (uploaded > 0) window.dispatchEvent(new Event("personal-os:private-transfer-progress"));
        },
      });
      signal.throwIfAborted();
      setNotice(`${saved.filename} 已保存。`);
    });
  }

  function download(file: InnerArchive) {
    void run(async signal => {
      const { url } = await (await innerCall("/api/vault/inner/download", privateJson("POST", { id: file.id }, signal))).json();
      signal.throwIfAborted();
      if (!access.current || document.visibilityState !== "visible") throw new Error("请返回内层后重新下载。");
      const destination = new URL(typeof url === "string" ? url : "", window.location.origin);
      if (destination.origin !== window.location.origin || destination.search || destination.hash ||
        !/^\/api\/vault\/inner\/download\/[a-f0-9-]{36}$/.test(destination.pathname)) throw new Error("下载链接无效，请重试。");
      // A normal browser download streams to disk. No fetch().blob() for a 2 GiB object.
      const link = document.createElement("a");
      link.href = destination.href; link.download = file.filename; link.referrerPolicy = "no-referrer"; link.rel = "noreferrer";
      document.body.appendChild(link); link.click(); link.remove();
      setNotice("已交给浏览器下载，请查看下载进度。");
    }, false);
  }

  const finished = page?.files.some(file => file.status === "completed");
  return <section aria-labelledby="inner-vault-title" className="min-h-0 flex-1 overflow-auto px-5 py-5 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="inner-vault-title" ref={heading} tabIndex={-1} className="font-serif text-xl font-medium outline-none">内层文件</h2>
        <Button variant="ghost" className="min-h-11" onClick={() => void close()}>{token ? "锁定并返回" : "返回暗格"}</Button>
      </div>
      {error ? <p role="alert" className="break-words text-sm text-[var(--danger)]">{error}</p> : null}
      {!token ? configured === null ? <div>
        {error ? <Button variant="outline" onClick={() => { setError(""); void readSetup(mounted.current!.signal); }}>重新读取</Button> : <p role="status">正在读取…</p>}
      </div> : <form onSubmit={unlock} className="max-w-sm space-y-4">
        <p className={detail}>{configured ? "输入内层口令查看 ZIP 文件。" : "设置和外层不同的口令，至少 12 个字符。口令无法找回，请妥善保管。"}</p>
        <label className="block">内层口令<input className={field} autoComplete={configured ? "current-password" : "new-password"} type="password" required minLength={12} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {!configured ? <label className="block">确认内层口令<input className={field} autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={confirm} onChange={e => setConfirm(e.target.value)} /></label> : null}
        <Button className="min-h-11" type="submit" disabled={busy}>{busy ? "正在验证…" : configured ? "解锁内层" : "设置并解锁"}</Button>
      </form> : <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className={`${inputButton} ${busy ? "cursor-default opacity-50" : ""}`}>上传 ZIP<input type="file" className="sr-only" accept=".zip,application/zip" disabled={busy} onChange={e => { const file = e.currentTarget.files?.[0]; if (file) upload(file); e.currentTarget.value = ""; }} /></label>
          <p className={detail}>单个 ZIP 最多 2 GiB，可断点续传。</p>
        </div>
        {notice ? <p role="status" className="break-words">{notice}</p> : null}
        {progress ? <div className="space-y-2 rounded-lg border border-[var(--separator)] px-3 py-2">
          <p className="break-all">{progress.filename}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className={detail}>{progress.phase === "hashing" ? "正在检查原 ZIP…" : progress.phase === "verifying" ? "正在核对上传的原件…" : `已上传 ${Math.floor(progress.uploaded / progress.size * 100)}%`}</p>
            <Button variant="ghost" onClick={() => operation.current?.abort()}>暂停</Button>
          </div>
          {progress.phase === "uploading" ? <progress aria-label="ZIP 上传进度" value={progress.uploaded} max={progress.size} className="h-2 w-full accent-[var(--accent)]" /> : null}
        </div> : null}
        {!page ? error ? <Button variant="outline" disabled={busy} onClick={() => void run(() => refresh(), false)}>重新读取</Button> : <p role="status">正在读取文件…</p>
          : !page.files.length ? <p className={detail}>还没有文件。可以上传一份 ZIP。</p> : <ul>
            {page.files.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--separator)] py-3">
              <div className="min-w-0 flex-1 basis-40"><p className="break-all">{file.filename}</p><p className={detail}>{sizeText(file.size)} · {stateText[file.status]}</p></div>
              <div className="flex flex-wrap gap-1">
                {file.status === "completed" ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => download(file)}>下载 ZIP</Button> : <>
                  {["uploading", "initializing"].includes(file.status) ? <label className={`${inputButton} ${busy ? "opacity-50" : ""}`}>续传<input aria-label={`续传 ${file.filename}`} type="file" className="sr-only" accept=".zip,application/zip" disabled={busy} onChange={e => { const chosen = e.currentTarget.files?.[0]; if (chosen) upload(chosen, file); e.currentTarget.value = ""; }} /></label> : null}
                  {file.status === "completing" ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(async signal => { setProgress({ filename: file.filename, phase: "verifying", size: file.size, uploaded: file.size }); await finishInnerUpload(innerCall, file.id, signal); setNotice("ZIP 已保存。"); })}>重试校验</Button> : null}
                  <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setCancel(file)}>取消上传</Button>
                </>}
              </div>
              {cancel?.id === file.id ? <div className="w-full space-y-2 rounded-lg bg-[var(--surface-control)] px-3 py-2">
                <p>放弃已上传的分片？之后需要从头上传。</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => setCancel(null)}>保留分片</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void run(async signal => {
                    await innerCall(innerUploadsPath, privateJson("PATCH", { action: "cancel", id: file.id }, signal));
                    setCancel(null); setNotice("已取消上传。");
                  })}>确认取消</Button>
                </div>
              </div> : null}
            </li>)}
          </ul>}
        {page?.next ? <Button variant="outline" disabled={busy} onClick={() => void run(signal => refresh(signal, page.next!), false)}>加载更多</Button> : null}
        {finished ? <p className={detail}>内层文件单独下载备份。下载到设备的副本由你保管。</p> : null}
      </>}
    </div>
  </section>;
}
