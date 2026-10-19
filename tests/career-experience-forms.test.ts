// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/features/career/form-actions", () => ({ submitCareerForm: actions.submit }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
import { ExperienceFormDialog } from "@/components/career/experience-form-dialog";
import { CreateExperienceDialog } from "@/components/career/create-experience-dialog";
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text)!;
const form = () => document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function openFact() {
  await act(async () => root.render(createElement(ExperienceFormDialog, { operation: "updateFact", title: "编辑事实", description: "修改保留历史", submitLabel: "保存事实" }, createElement("input", { name: "content", defaultValue: "原事实" }))));
  await act(async () => button("编辑事实").click());
}
async function change(value: string) { const input = form().querySelector("input")!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
it("protects dirty fields, continues editing and discards only explicitly", async () => {
  await openFact(); expect(actions.submit).not.toHaveBeenCalled();
  await change("未保存事实");
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  await act(async () => button("取消").click()); expect(document.body.textContent).toContain("放弃尚未保存");
  await act(async () => button("继续编辑").click()); expect(form().querySelector("input")?.value).toBe("未保存事实");
  await act(async () => button("取消").click()); await act(async () => button("放弃修改").click());
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(actions.submit).not.toHaveBeenCalled();
});
it("keeps server validation fields and feedback focus after a failed mutation", async () => {
  actions.submit.mockResolvedValue({ status: "error", message: "请核对", fieldErrors: { content: "内容无效" } });
  await openFact(); await change("不能丢失"); await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(actions.submit.mock.calls[0][0]).toBe("updateFact"); expect(actions.submit.mock.calls[0][1].get("content")).toBe("不能丢失");
  expect(form().querySelector("input")?.value).toBe("不能丢失"); expect(form().querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement?.getAttribute("role")).toBe("alert"); expect(document.body.textContent).toContain("核对记录");
});
it("blocks duplicate submission and closing while pending, then closes only on confirmed success", async () => {
  let finish!: (value: { status: string; message: string }) => void;
  actions.submit.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await openFact();
  await act(async () => { form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(actions.submit).toHaveBeenCalledTimes(1); expect(button("取消").matches(":disabled")).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => finish({ status: "success", message: "已保存" }));
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(host.textContent).toContain("已保存");
});
it("retains all new-experience fields and private/draft defaults after uncertain failure", async () => {
  actions.submit.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(createElement(CreateExperienceDialog, { initialOpen: true })));
  const organization = form().elements.namedItem("organization") as HTMLInputElement; organization.value = "示例组织";
  const background = form().elements.namedItem("background_markdown") as HTMLTextAreaElement; background.value = "完整背景";
  await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(organization.value).toBe("示例组织"); expect(background.value).toBe("完整背景");
  expect(actions.submit.mock.calls[0][1].get("status")).toBe("draft"); expect(actions.submit.mock.calls[0][1].get("confidentiality_level")).toBe("private");
  expect(document.body.textContent).toContain("未能确认操作结果");
});
it("archive confirmation can be cancelled without invoking the original action", async () => {
  await act(async () => root.render(createElement(ExperienceFormDialog, { operation: "archiveExperience", title: "归档经历", description: "原有事实和冻结简历保留", submitLabel: "确认归档" }, createElement("input", { type: "hidden", name: "experience_id", value: "e1" }))));
  await act(async () => button("归档经历").click()); expect(document.body.textContent).toContain("冻结简历保留");
  await act(async () => button("取消").click()); expect(actions.submit).not.toHaveBeenCalled();
});
