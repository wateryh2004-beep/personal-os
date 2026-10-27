// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ apply: vi.fn(), read: vi.fn(), publish: vi.fn() }));
vi.mock("@/features/life/actions", () => ({ applyLifeFieldOperation: boundary.apply, readLifeRequestOutcome: boundary.read }));
vi.mock("@/features/workbench/operation-contracts", () => ({ publishOperationReceipt: boundary.publish }));
import { useLifeMutation } from "@/components/life/use-life-mutation";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
const id = "11111111-1111-4111-8111-111111111111", receipt = "22222222-2222-4222-8222-222222222222";
const input = { requestId: receipt, operation: "shopping_purchased" as const, items: [{ id, expected_revision: 1 }] };
const rows = [{ id, status: "purchased", mutation_revision: 2 }];
const readOutcome = { status: "saved" as const, receiptId: receipt, receiptStatus: "available" as const, operation: "shopping_purchased" as const, rows };
const saved = { ok: true, replayed: false, receiptId: receipt, rows };
let root: Root, host: HTMLDivElement;
const completed = vi.fn();
function Harness() {
  const mutation = useLifeMutation();
  return <div><input aria-label="原输入" defaultValue="原始输入A"/><button onClick={() => void mutation.save(input, "已保存").then(completed)}>保存</button><button onClick={() => void mutation.reconcile(input).then(completed)}>核对</button><span>{String(mutation.pending)}:{mutation.error}</span></div>;
}
const button = (label: string) => [...host.querySelectorAll("button")].find(node => node.textContent === label)!;
function changeScope(kind: string) { if (kind === "clear") clearWorkspaceResources(); else { reconcileWorkspaceScope("owner-B", "r1"); if (kind === "ABA") reconcileWorkspaceScope("owner-A", "r1"); } }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); reconcileWorkspaceScope("owner-A", "r1"); vi.clearAllMocks(); boundary.apply.mockReset().mockResolvedValue(saved); boundary.read.mockReset().mockResolvedValue(readOutcome);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(<Harness/>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
it.each(["owner", "clear", "ABA"])("blocks a still-mounted original confirmation before any save/read I/O after %s", async kind => {
  const field = host.querySelector("input")!; field.focus(); field.setSelectionRange(1, 3);
  await act(async () => changeScope(kind)); await act(async () => { button("保存").click(); button("核对").click(); });
  expect(boundary.apply).not.toHaveBeenCalled(); expect(boundary.read).not.toHaveBeenCalled(); expect(boundary.publish).not.toHaveBeenCalled(); expect(completed.mock.calls.map(call => call[0])).toEqual([null, null]);
  expect(host.querySelector("input")).toBe(field); expect(field.value).toBe("原始输入A"); expect(field.selectionStart).toBe(1); expect(field.selectionEnd).toBe(3);
});
it.each(["save", "read"])("drops an old %s reply and permanently refuses another dispatch after owner change", async operation => {
  let resolve!: (value: typeof saved | typeof readOutcome) => void;
  const pending = new Promise<typeof saved | typeof readOutcome>(done => { resolve = done; });
  (operation === "save" ? boundary.apply : boundary.read).mockReturnValueOnce(pending);
  await act(async () => button(operation === "save" ? "保存" : "核对").click()); expect(operation === "save" ? boundary.apply : boundary.read).toHaveBeenCalledExactlyOnceWith(input);
  await act(async () => { reconcileWorkspaceScope("owner-B", "r1"); resolve(operation === "save" ? saved : readOutcome); await pending; });
  expect(completed).toHaveBeenLastCalledWith(null); expect(boundary.publish).not.toHaveBeenCalled();
  await act(async () => { button("保存").click(); button("核对").click(); }); expect(boundary.apply).toHaveBeenCalledTimes(operation === "save" ? 1 : 0); expect(boundary.read).toHaveBeenCalledTimes(operation === "read" ? 1 : 0);
});
it("same-owner server revision refresh preserves authority, frozen payload and pending completion", async () => {
  let resolve!: (value: typeof saved) => void; boundary.apply.mockReturnValueOnce(new Promise<typeof saved>(done => { resolve = done; }));
  const field = host.querySelector("input")!;
  await act(async () => button("保存").click()); await act(async () => { reconcileWorkspaceScope("owner-A", "r2"); resolve(saved); });
  expect(completed).toHaveBeenLastCalledWith(rows); expect(boundary.publish).toHaveBeenCalledExactlyOnceWith({ receiptId: receipt, message: "已保存" });
  await act(async () => button("核对").click()); expect(completed).toHaveBeenLastCalledWith(readOutcome); expect(boundary.apply).toHaveBeenCalledExactlyOnceWith(input); expect(boundary.read).toHaveBeenCalledExactlyOnceWith(input);
  expect(host.querySelector("input")).toBe(field); expect(field.value).toBe("原始输入A");
});
