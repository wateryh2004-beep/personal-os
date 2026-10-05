"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

// Same-tab, in-memory browsing context only. No personal data or persistent storage.
let origin: { url: string; anchor: string } | undefined;
let returning: string | undefined;
function collectionKey(value: string) {
  const url = new URL(value, window.location.href);
  url.hash = "";
  url.searchParams.sort();
  return url.href;
}
export function collectionReturnHref(fallback: string) {
  if (typeof window === "undefined" || !origin || collectionKey(fallback) !== origin.url) return fallback;
  return `${fallback.split("#")[0]}#${origin.anchor}`;
}
export function markCollectionReturn(href: string) {
  returning = origin && collectionKey(href) === origin.url && new URL(href, window.location.href).hash === `#${origin.anchor}` ? origin.anchor : undefined;
}
export function focusCollectionReturn() {
  const anchor = returning;
  returning = undefined;
  if (!anchor || !origin || collectionKey(window.location.href) !== origin.url || window.location.hash !== `#${anchor}`) return;
  const card = document.getElementById(anchor);
  if (card) { card.focus({ preventScroll: true }); return; }
  // The item may have been archived or moved out of this filtered collection.
  const heading = document.getElementById("leisure-collection-heading");
  heading?.scrollIntoView({ block: "start", behavior: "instant" });
  heading?.focus({ preventScroll: true });
}
export function LeisureCollectionLink({ itemId, ...props }: ComponentProps<typeof Link> & { itemId?: string }) {
  return <Link {...props} onNavigate={(event) => {
    props.onNavigate?.(event);
    // onNavigate only runs for same-tab client navigation, not modified clicks.
    returning = undefined;
    origin = itemId ? { url: collectionKey(window.location.href), anchor: `leisure-item-${itemId}` } : undefined;
  }} />;
}
