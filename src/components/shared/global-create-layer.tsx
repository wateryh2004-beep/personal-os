"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export type CreateKind = "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project";
export type CreateRequest = { kind?: CreateKind; title?: string };

const LazyGlobalCreateLayer = dynamic(
  () => import("@/components/shared/global-create-layer-impl").then((module) => module.GlobalCreateLayer),
  { ssr: false },
);

// AppShell mounts this tiny listener immediately, but the dialog and all of its
// feature action stubs stay out of the initial client bundle until the first
// quick-create request arrives.
export function GlobalCreateLayer() {
  const [initialRequest, setInitialRequest] = useState<CreateRequest | null>(null);

  useEffect(() => {
    const activate = (event: Event) => {
      const request = (event as CustomEvent<CreateRequest>).detail;
      setInitialRequest((current) => current ?? request ?? {});
    };
    window.addEventListener("personal-os:create-open", activate);
    return () => window.removeEventListener("personal-os:create-open", activate);
  }, []);

  if (!initialRequest) return null;
  return <LazyGlobalCreateLayer initialRequest={initialRequest} />;
}
