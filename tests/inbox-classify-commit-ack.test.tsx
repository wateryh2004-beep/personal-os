// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const remote = vi.hoisted(() => ({ model: vi.fn(), db: undefined as unknown, refresh: vi.fn() }));
vi.mock("ai", async original => ({ ...await original<typeof import("ai")>(), generateObject: remote.model }));
vi.mock("@/lib/ai/deepseek", async original => ({ ...await original<typeof import("@/lib/ai/deepseek")>(), getDeepSeekModel: async () => ({ model: {} }) }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ userId: "11111111-1111-4111-8111-111111111111", supabase: remote.db }) }));
vi.mock("@/lib/workspace-revalidation", () => ({ revalidatePath: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: remote.refresh }) }));
import { classifyInboxItem } from "@/features/inbox/classify";
import { reclassifyInboxItem } from "@/features/inbox/actions";
import { InboxReclassifyControl } from "@/components/inbox/inbox-ai-continuity";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getAiActionRecords } from "@/features/assistant/ai-action-runtime";
const inboxId = "22222222-2222-4222-8222-222222222222";
type Ack = "true" | "false" | "error" | "throw" | "null";
let ack: Ack, reads: number, commits: number;
function database() {
  return { from: (table: string) => {
    const query = { select: () => query, eq: () => query, is: () => query, order: async () => ({ data: [], error: null }), insert: async () => ({ data: null, error: null }), maybeSingle: async () => { reads++; return { data: table === "profiles" ? { timezone: "UTC" } : { id: inboxId, content_markdown: "Original source", ai_status: "ready", ai_classification_started_at: null, processed_at: null, archived_at: null }, error: null }; } }; return query;
  }, rpc: async (name: string) => {
    if (name === "claim_inbox_classification") return { data: true, error: null };
    if (name !== "commit_inbox_classification") throw new Error("unexpected RPC");
    commits++;
    if (ack === "throw") throw new Error("lost after possible commit");
    return { data: ack === "true" ? true : ack === "false" ? false : null, error: ack === "error" ? { code: "FETCH_ERROR" } : null };
  } };
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); vi.clearAllMocks(); ack = "error"; reads = 0; commits = 0; remote.db = database(); });
afterEach(() => clearWorkspaceResources());
it.each((["true", "false", "error", "throw", "null"] as const).flatMap(value => ["proposal", "provider-failure", "unclear"].map(mode => ({ value, mode }))))("keeps commit $value distinct on $mode", async ({ value, mode }) => {
  ack = value;
  if (mode === "provider-failure") remote.model.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAIL"));
  else remote.model.mockResolvedValue({ object: mode === "proposal" ? { target: "daily", confidence: 1 } : { target: "none", confidence: 0.2, reason: "Insufficient evidence" } });
  const result = await classifyInboxItem({ supabase: remote.db as never, userId: "11111111-1111-4111-8111-111111111111", inboxId });
  expect(result.status).toBe(value === "true" ? mode === "proposal" ? "ready" : "failed" : value === "false" ? "superseded" : "needs-check");
  expect(commits).toBe(1); expect(remote.model).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
it("the real action and runtime prohibit regeneration after an unknown commit and read metadata without a second model", async () => {
  remote.model.mockResolvedValue({ object: { target: "daily", confidence: 1 } });
  const form = new FormData(); form.set("inbox_id", inboxId);
  expect(await reclassifyInboxItem({ status: "idle", message: "" }, form)).toMatchObject({ status: "error", needsCheck: true });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<InboxReclassifyControl inboxId={inboxId}/>));
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "智能整理")!.click());
    expect(getAiActionRecords()[0].status).toBe("needs-check");
    expect([...host.querySelectorAll("button")].find(button => button.textContent === "智能整理")!.disabled).toBe(true);
    const before = remote.model.mock.calls.length, previousCommits = commits, previousReads = reads;
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "核对识别结果")!.click());
    expect(reads).toBeGreaterThan(previousReads); expect(remote.model).toHaveBeenCalledTimes(before); expect(commits).toBe(previousCommits);
    expect(host.textContent).toContain("当前识别状态已读取");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
