"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { collectionReturnHref, markCollectionReturn } from "./leisure-collection-link";

/** Explicit navigation must not quietly discard a reflection draft. */
export function LeisureDetailLink({ returnToCollection = false, ...props }: ComponentProps<typeof Link> & { returnToCollection?: boolean }) {
  const href = returnToCollection && typeof props.href === "string" ? collectionReturnHref(props.href) : props.href;
  return <Link {...props} href={href} scroll={href !== props.href ? false : props.scroll} onNavigate={(event) => {
    const blocker = document.querySelector<HTMLElement>("[data-leisure-navigation-block]")?.dataset.leisureNavigationBlock;
    if (blocker === "saving") { event.preventDefault(); return; }
    if (blocker === "draft" && !window.confirm("感想尚未保存。确定离开这一页吗？")) { event.preventDefault(); return; }
    props.onNavigate?.(event);
    if (returnToCollection && typeof href === "string") markCollectionReturn(href);
  }} />;
}
