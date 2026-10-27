// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Only remote action imports are replaced; real shortcut, scope gate and queue execute.
vi.mock("@/features/reviews/actions", () => ({ completeReview: vi.fn(), generateReviewDraft: vi.fn(), generateReviewProposals: vi.fn(), readReviewProposalGeneration: vi.fn() }));
vi.mock("@/features/notes/ai-actions", () => ({ generateNoteAiSuggestion: vi.fn() }));
vi.mock("@/features/briefing/actions", () => ({ generateBriefingAction: vi.fn(), ensureTodayBriefingAction: vi.fn(), readBriefingGenerationAction: vi.fn() }));
import { TodayBriefAction } from "@/components/today/today-brief";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { takeAssistantSubmission } from "@/features/assistant/pending-submission";
const ownerA = "11111111-1111-4111-8111-111111111111", ownerB = "22222222-2222-4222-8222-222222222222";
const item = { id: "synthetic-inbox", title: "Synthetic inbox", reason: "Synthetic reason", priority: 1, sourceRefs: [], suggestedAction: { label: "处理收集箱", agentPrompt: "SYNTHETIC OWNER A INBOX CONTEXT" } };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); reconcileWorkspaceScope(ownerA, "r1"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
it("preserves the native focusable shortcut and same-owner revision activation", async () => {
  await act(async () => root.render(<TodayBriefAction item={item} />));
  const button = host.querySelector("button")!; expect(button.type).toBe("button"); expect(button.textContent).toBe(item.suggestedAction.label); expect(button.classList.contains("min-h-11")).toBe(true); button.focus(); expect(document.activeElement).toBe(button);
  await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); button.click(); });
  expect(takeAssistantSubmission()).toBe(item.suggestedAction.agentPrompt); expect(host.querySelector('[role="status"]')).toBeNull();
});
for (const revoke of ["owner replacement", "owner A-B-A", "vault eviction"] as const) it(`refuses old mounted shortcut context after ${revoke} and explains reopening`, async () => {
  await act(async () => root.render(<TodayBriefAction item={item} />));
  await act(async () => { if (revoke === "vault eviction") clearWorkspaceResources(); else { reconcileWorkspaceScope(ownerB, "r1"); if (revoke === "owner A-B-A") reconcileWorkspaceScope(ownerA, "r2"); } });
  await act(async () => host.querySelector("button")!.click());
  expect(takeAssistantSubmission()).toBeNull(); expect(host.querySelector('[role="status"]')?.textContent).toBe("工作区已变化，请重新打开今日页面。"); expect(host.querySelector("button")!.textContent).toBe(item.suggestedAction.label);
});
it("initial authenticated identity gating establishes the owner before mounting shortcut scope", async () => {
  clearWorkspaceResources();
  await act(async () => root.render(<WorkspaceIdentityBoundary ownerId={ownerA} revision="initial"><TodayBriefAction item={item} /></WorkspaceIdentityBoundary>));
  expect(host.querySelector("button")).not.toBeNull();
  await act(async () => host.querySelector("button")!.click());
  expect(takeAssistantSubmission()).toBe(item.suggestedAction.agentPrompt); expect(host.querySelector('[role="status"]')).toBeNull();
  await act(async () => root.render(<WorkspaceIdentityBoundary ownerId={ownerA} revision="fresh-server-revision"><TodayBriefAction item={item} /></WorkspaceIdentityBoundary>));
  await act(async () => host.querySelector("button")!.click());
  expect(takeAssistantSubmission()).toBe(item.suggestedAction.agentPrompt); expect(host.querySelector('[role="status"]')).toBeNull();
});
