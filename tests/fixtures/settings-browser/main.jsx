import React from "react";
import { createRoot } from "react-dom/client";
import Settings from "@/app/(app)/settings/page";
import "@/app/globals.css";

const mode = new URLSearchParams(location.search).get("fixture");
let calls = 0;
window.fetch = async (_url, options) => {
  calls++;
  window.fixtureCalls = calls;
  if (mode === "error" && calls > 1) return Response.json({}, { status: 401 });
  const scan = JSON.parse(options.body).scan;
  return Response.json({
    checkedAt: new Date(Date.now() - (mode === "partial" ? 360000 : 0)).toISOString(),
    health: { configured: true, endpointValid: true, bucket: "synthetic-preview-bucket", credentialsReachR2: true, status: "ok" },
    logical: { status: mode === "unavailable" ? "unavailable" : "complete", records: mode === "empty" ? 0 : 583, activeBytes: mode === "empty" ? 0 : 834613248, archivedBytes: mode === "empty" ? 0 : 142024, pendingBytes: 0 },
    usage: !scan ? null : { status: mode === "partial" ? "partial" : mode === "unavailable" ? "unavailable" : "complete", reason: mode === "partial" ? "limit" : mode === "unavailable" ? "access_denied" : undefined, objectCount: mode === "empty" ? 0 : 645, objectBytes: mode === "empty" ? 0 : 843589878, pagesScanned: 1 },
  });
};
const page = await Settings();
createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 sm:py-10"><p className="mb-5 text-xs text-[var(--text-tertiary)]">隔离 UI 预览 · 合成测试数据 · 不连接数据库</p>{page}</main>);
