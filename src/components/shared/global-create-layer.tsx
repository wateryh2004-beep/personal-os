"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { LazyDialogPlaceholder } from "@/components/shared/lazy-surface-placeholder";

export type CreateKind = "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project";
export type CreateRequest = { kind?: CreateKind; title?: string };

const LazyGlobalCreateLayer = lazy(
  () => import("@/components/shared/global-create-layer-impl").then((module) => ({ default: module.GlobalCreateLayer })),
);

// AppShell mounts this tiny listener immediately, but the dialog and all of its
// feature action stubs stay out of the initial client bundle until the first
// quick-create request arrives.
export function GlobalCreateLayer() {
  const [initialRequest, setInitialRequest] = useState<(CreateRequest & { requestId: number }) | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const activate = (event: Event) => {
      const request = (event as CustomEvent<CreateRequest>).detail;
      setInitialRequest({ ...request, requestId: ++requestSequence.current });
    };
    window.addEventListener("personal-os:create-open", activate);
    return () => window.removeEventListener("personal-os:create-open", activate);
  }, []);

  if (!initialRequest) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) setInitialRequest(null); }}>
    <Suspense fallback={<LazyDialogPlaceholder title="快速新建" />}>
      <LazyGlobalCreateLayer key={initialRequest.requestId} initialRequest={initialRequest} contentOnly onClose={() => setInitialRequest((current) => current === initialRequest ? null : current)} />
    </Suspense>
  </Dialog>;
}
