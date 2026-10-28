// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ lists: vi.fn(), create: vi.fn(), link: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/features/experience-library/actions", () => ({ getExperienceTaskLists: state.lists, linkExperienceTask: state.link }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: state.create }));
import { ExperienceTaskAction } from "@/components/experience-library/experience-task-action";

it("requires confirmation, sends a source link, and links only a confirmed task", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  state.lists.mockResolvedValue({ connected: true, lists: [{ id: "list", name: "待办", isDefault: true }] });
  state.create.mockResolvedValue({ status: "success", taskId: "task", message: "ok" });
  state.link.mockResolvedValue(undefined);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<ExperienceTaskAction entryId="11111111-1111-4111-8111-111111111111" entryTitle="合成经验" tasks={[]} />));
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(name))!;
  await act(async () => button("创建关联任务").click());
  expect(state.create).not.toHaveBeenCalled();
  const title = document.querySelector<HTMLInputElement>('input[name="title"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "查看招聘官网"); title.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(state.create).toHaveBeenCalledOnce();
  const form = state.create.mock.calls[0][1] as FormData;
  expect(form.get("title")).toBe("查看招聘官网");
  expect(form.get("body_text")).toContain("/experience-library/11111111-1111-4111-8111-111111111111");
  expect(state.link).toHaveBeenCalledWith({ entryId: "11111111-1111-4111-8111-111111111111", taskId: "task" });
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
