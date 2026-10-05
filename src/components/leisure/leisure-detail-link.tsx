"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/** Explicit navigation must not quietly discard a reflection draft. */
export function LeisureDetailLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} onNavigate={(event) => {
    const blocker = document.querySelector<HTMLElement>("[data-leisure-navigation-block]")?.dataset.leisureNavigationBlock;
    if (blocker === "saving") { event.preventDefault(); return; }
    if (blocker === "draft" && !window.confirm("感想尚未保存。确定离开这一页吗？")) { event.preventDefault(); return; }
    props.onNavigate?.(event);
  }} />;
}
