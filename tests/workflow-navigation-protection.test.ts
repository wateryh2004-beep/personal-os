// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { prepareWorkflowNavigation, registerWorkflowNavigationProtection } from "@/features/workflow-continuity/navigation-protection";
const releases: (() => void)[] = [];
function deferred() { let resolve!: (value: boolean) => void; return { promise: new Promise<boolean>(done => { resolve = done; }), resolve: (value: boolean) => resolve(value) }; }
beforeEach(() => { clearWorkspaceResources(); window.history.replaceState({}, "", "/notes"); });
afterEach(() => { releases.splice(0).forEach(release => release()); clearWorkspaceResources(); vi.useRealTimers(); });
it("awaits the real save and refuses dirty/conflicting edits without replacing their current URL", async () => {
  const save = deferred(), beforeLeave = vi.fn(() => save.promise); releases.push(registerWorkflowNavigationProtection(beforeLeave));
  const pending = prepareWorkflowNavigation("/files"); expect(beforeLeave).toHaveBeenCalledTimes(1); expect(window.location.pathname).toBe("/notes");
  save.resolve(false); expect(await pending).toBe(false); expect(window.location.pathname).toBe("/notes");
});
it("accepts only after all mounted owners save successfully, not after dispatch", async () => {
  const save = deferred(), second = vi.fn(async () => true); releases.push(registerWorkflowNavigationProtection(() => save.promise), registerWorkflowNavigationProtection(second));
  const pending = prepareWorkflowNavigation("/files"); expect(second).not.toHaveBeenCalled(); save.resolve(true); expect(await pending).toBe(true); expect(second).toHaveBeenCalledTimes(1);
});
it.each(["new intent", "owner changed", "location changed", "unmount"])("rejects the old save completion after %s", async reason => {
  const save = deferred(), release = registerWorkflowNavigationProtection(() => save.promise); releases.push(release);
  const pending = prepareWorkflowNavigation("/files");
  if (reason === "new intent") announceNavigationIntent();
  else if (reason === "owner changed") clearWorkspaceResources();
  else if (reason === "location changed") window.history.replaceState({}, "", "/projects");
  else release();
  save.resolve(true); expect(await pending).toBe(false);
});
it("unmount aborts a hung owner immediately instead of waiting for its promise", async () => {
  const release = registerWorkflowNavigationProtection(() => new Promise(() => {})); releases.push(release);
  const pending = prepareWorkflowNavigation("/files"); release(); expect(await pending).toBe(false);
});
it("superseding navigation cancels a hung predecessor while retaining the latest save decision", async () => {
  const first = deferred(), second = deferred(), protect = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); releases.push(registerWorkflowNavigationProtection(protect));
  const previous = prepareWorkflowNavigation("/files"), latest = prepareWorkflowNavigation("/projects"); expect(await previous).toBe(false);
  second.resolve(true); expect(await latest).toBe(true); first.resolve(true);
});
it("honors existing cancelable navigation handlers and rejects unsafe paths before saving", async () => {
  const protect = vi.fn(async () => true); releases.push(registerWorkflowNavigationProtection(protect));
  const block = (event: Event) => event.preventDefault(); window.addEventListener("personal-os:navigation-start", block);
  try { expect(await prepareWorkflowNavigation("/files")).toBe(false); expect(await prepareWorkflowNavigation("https://example.com/")).toBe(false); expect(protect).not.toHaveBeenCalled(); }
  finally { window.removeEventListener("personal-os:navigation-start", block); }
});
it("bounds a missing save acknowledgement to ten seconds", async () => {
  vi.useFakeTimers(); releases.push(registerWorkflowNavigationProtection(() => new Promise(() => {})));
  const pending = prepareWorkflowNavigation("/files"); await vi.advanceTimersByTimeAsync(10000); expect(await pending).toBe(false);
});
