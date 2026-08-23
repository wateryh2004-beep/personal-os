"use client";

import { useEffect, useRef, useState } from "react";

type PwaLifecycleProps = { currentVersion: string };

export function PwaLifecycle({ currentVersion }: PwaLifecycleProps) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadOnControllerChange = useRef(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let disposed = false;

    const onControllerChange = () => {
      if (reloadOnControllerChange.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (disposed) return;
      registrationRef.current = registration;
      if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
        });
      });
    }).catch(() => {});

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let disposed = false;
    const checkForUpdate = async () => {
      if (disposed || !navigator.onLine || document.visibilityState !== "visible") return;
      void registrationRef.current?.update().catch(() => {});
      if (currentVersion === "local") return;
      try {
        const response = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const payload = await response.json() as { version?: string };
        if (payload.version && payload.version !== currentVersion) setUpdateReady(true);
      } catch {}
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    const onOnline = () => void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), 300_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [currentVersion]);

  const applyUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      reloadOnControllerChange.current = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(() => window.location.reload(), 1_200);
      return;
    }
    window.location.reload();
  };

  if (!offline && !updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(var(--tab-bar-height)+0.75rem)] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-[14px] border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] px-3.5 py-3 text-[13px] shadow-[var(--shadow-dialog)] backdrop-blur-xl md:bottom-4"
    >
      <p className="min-w-0 flex-1 leading-5 text-[var(--text-secondary)]">
        {offline ? "当前离线。已加载内容仍可查看，需要网络的操作暂不可用。" : "Personal OS 有新版本可用。"}
      </p>
      {!offline && updateReady ? (
        <button type="button" onClick={applyUpdate} className="min-h-10 shrink-0 rounded-[10px] bg-[var(--text-primary)] px-3 font-medium text-[var(--surface-canvas)]">
          立即更新
        </button>
      ) : null}
    </div>
  );
}
