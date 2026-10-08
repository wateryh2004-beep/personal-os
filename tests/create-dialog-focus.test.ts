// @vitest-environment jsdom
import { act, createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { MicrosoftTodoCreateDialog } from "@/components/tasks/microsoft-todo-create-dialog";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), unstable_rethrow: () => {} }));
vi.mock("@/features/projects/actions", () => ({ createProject: vi.fn() }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: vi.fn() }));
let host: HTMLDivElement, root: Root;
const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
const cancel = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "取消")!;
const launchers = () => [...host.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent?.includes("新建") || button.getAttribute("aria-label") === "新建任务");
async function render(kind: "tasks" | "projects", initialOpen = false) {
  window.history.replaceState(null, "", `/${kind}`);
  await act(async () => root.render(kind === "tasks"
    ? createElement(MicrosoftTodoCreateDialog, { lists: [{ id: "fixture", displayName: "测试清单", isDefault: true }], initialOpen, onCreated: vi.fn() })
    : createElement(ProjectsWorkspace, { projects: [], initialCreateOpen: initialOpen })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); await pause(); }); host.remove(); vi.unstubAllGlobals(); });
it.each(["tasks", "projects"] as const)("restores %s manual launcher on Cancel and Escape", async (kind) => {
  await render(kind);
  for (const method of ["cancel", "escape"] as const) {
    const launch = launchers()[0];
    await act(async () => launch.click());
    expect(document.activeElement).not.toBe(launch);
    await act(async () => {
      if (method === "cancel") cancel().click();
      else document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await pause();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // Radix restores focus in a timer scheduled by the close commit. A pause
    // inside act can expire before that commit, especially under suite load.
    await vi.waitFor(() => expect(document.activeElement).toBe(launch));
  }
});
it("returns to the actual empty-state Projects launcher", async () => {
  await render("projects"); const launch = launchers()[1];
  await act(async () => launch.click());
  await act(async () => { cancel().click(); await pause(); });
  await vi.waitFor(() => expect(document.activeElement).toBe(launch));
});
it.each(["tasks", "projects"] as const)("does not restore stale %s launch focus after route changes", async (kind) => {
  await render(kind); const launch = launchers()[0]; const focus = vi.spyOn(launch, "focus");
  await act(async () => launch.click());
  window.history.replaceState(null, "", "/notes");
  await act(async () => { cancel().click(); await pause(); });
  expect(focus).not.toHaveBeenCalled();
});
it.each(["tasks", "projects"] as const)("does not restore %s focus after a newer navigation starts", async (kind) => {
  await render(kind); const launch = launchers()[0]; const focus = vi.spyOn(launch, "focus");
  await act(async () => launch.click());
  window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { detail: { href: "/notes" } }));
  await act(async () => { cancel().click(); await pause(); });
  expect(focus).not.toHaveBeenCalled();
});
it.each(["tasks", "projects"] as const)("does not restore %s focus during route unmount", async (kind) => {
  await render(kind); const launch = launchers()[0]; const focus = vi.spyOn(launch, "focus");
  await act(async () => launch.click());
  await act(async () => { root.render(createElement("button", { autoFocus: true }, "New route control")); await pause(); });
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe("New route control");
});
it.each(["tasks", "projects"] as const)("does not invent a launcher for URL-opened %s dialogs", async (kind) => {
  await render(kind, true);
  const focus = vi.spyOn(launchers()[0], "focus");
  await act(async () => { cancel().click(); await pause(); });
  expect(focus).not.toHaveBeenCalled();
});

it.each(["tasks", "projects"] as const)("respects newer control focus when %s closes", async (kind) => {
  await render(kind); const launch = launchers()[0];
  await act(async () => launch.click());
  const nextControl = document.createElement("button"); nextControl.textContent = "New focus"; document.body.append(nextControl);
  try {
    await act(async () => { flushSync(() => cancel().click()); nextControl.focus(); await pause(); });
    expect(document.activeElement).toBe(nextControl);
  } finally { nextControl.remove(); }
});
