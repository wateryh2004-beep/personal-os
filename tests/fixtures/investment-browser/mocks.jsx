import React from "react";

// The preview has no authentication or database connector. All writes fail safely.
export default function Link({ children, scroll: _scroll, href, ...props }) {
  void _scroll;
  const destination = new URL(href, window.location.href);
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  if (fixture) destination.searchParams.set("fixture", fixture);
  return <a {...props} href={`${destination.pathname}${destination.search}`}>{children}</a>;
}

export const useRouter = () => ({ refresh() {} });
async function previewWrite() {
  // A short deterministic delay makes repeated clicks and pending UI testable.
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { ok: false, error: "这是隔离的 UI 预览，不会写入任何数据。" };
}
export const createInvestmentAccount = previewWrite;
export const addInvestmentEntry = previewWrite;
export const voidInvestmentEntry = previewWrite;
export const importInvestmentResearch = previewWrite;
export const saveInvestmentStrategy = previewWrite;
