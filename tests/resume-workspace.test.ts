// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeWorkspace } from "@/components/career/resume-workspace";
import { parseCareerFocus } from "@/components/career/career-focus-picker";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { unstable_rethrow() {}, useSearchParams: () => new URLSearchParams(useSyncExternalStore(notify => { window.addEventListener("popstate", notify); return () => window.removeEventListener("popstate", notify); }, () => window.location.search)) };
});
vi.mock("@/features/career/form-actions", () => ({ submitCareerForm: vi.fn(async () => ({ status: "error", message: "合成保存失败，输入保留。" })) }));
vi.mock("@/components/links/entity-mention-textarea", () => ({ MentionTextarea: ({ onChange, ...props }: { onChange: (value: string) => void }) => createElement("textarea", { ...props, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value) }) }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: ({ body }: { body: string }) => createElement("p", null, body) }));

const data = {
  resumes: [
    { id: "one", title: "研究简历", version_label: "V1", content_markdown: "第一份完整原文", status: "draft", document_id: null, target_direction_id: "research", updated_at: "2026-10-19T00:00:00Z" },
    { id: "two", title: "产品简历", version_label: "V2", content_markdown: "第二份只读原文", status: "approved", document_id: "doc", target_direction_id: "product", updated_at: "2026-10-18T00:00:00Z" },
  ], directions: [{ id: "research", name: "研究" }, { id: "product", name: "产品" }], documents: [{ id: "doc", title: "正式原件", original_filename: "正式原件.pdf" }], bullets: [], links: [], applications: [{ id: "app", resume_version_id: "two", status: "submitted" }], unavailable: false,
};
let root: Root, host: HTMLDivElement;
let originalPush: History["pushState"], originalReplace: History["replaceState"];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 0; });
  originalPush = window.history.pushState.bind(window.history); originalReplace = window.history.replaceState.bind(window.history);
  originalReplace(null, "", "/career/resumes");
  window.history.pushState = (...args) => { originalPush(...args); window.dispatchEvent(new PopStateEvent("popstate")); };
  window.history.replaceState = (...args) => { originalReplace(...args); window.dispatchEvent(new PopStateEvent("popstate")); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.history.pushState = originalPush; window.history.replaceState = originalReplace; vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(createElement(ResumeWorkspace, { data, createForm: createElement("p", null, "创建草稿") }))); }
const title = () => host.querySelector<HTMLInputElement>('input[name="title"]')!;
const list = () => host.querySelector('nav[aria-label="简历版本列表"]')!;
async function select(id: string) { await act(async () => list().querySelector<HTMLAnchorElement>(`a[href*="resume=${id}"]`)!.click()); }

describe("resume list and reading workspace", () => {
  it("shows metadata for all versions but mounts only the selected full document", async () => {
    await render();
    expect(list().textContent).toContain("研究简历"); expect(list().textContent).toContain("产品简历");
    expect(host.textContent).toContain("第一份完整原文"); expect(host.textContent).not.toContain("第二份只读原文");
    expect(list().textContent).toContain("已关联原件"); expect(list().textContent).toContain("1 次申请引用");
  });
  it("preserves an uncontrolled edit across selecting another version and returning", async () => {
    await render();
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title(), "未提交的标题"); title().dispatchEvent(new Event("input", { bubbles: true })); });
    await select("two"); await select("one");
    expect(title().value).toBe("未提交的标题");
    expect(location.search).toContain("resume=one");
  });
  it("keeps approved versions read-only and their original file accessible", async () => {
    originalReplace(null, "", "/career/resumes?resume=two"); await render();
    expect(host.querySelector('input[name="title"]')).toBeNull();
    expect(host.textContent).not.toContain("定稿此版本");
    expect(host.querySelector('a[href="/files?file=doc"]')).not.toBeNull();
    expect(host.textContent).toContain("第二份只读原文");
  });
  it("restores selection from navigation state and reports invalid deep links without replacing records", async () => {
    originalReplace(null, "", "/career/resumes?resume=missing"); await render();
    expect(host.textContent).toContain("这个版本不可用或已归档");
    await act(async () => window.history.replaceState(null, "", "/career/resumes?resume=two"));
    expect(host.textContent).toContain("第二份只读原文");
  });
  it("filters on real approved status and clears filters without changing the record", async () => {
    originalReplace(null, "", "/career/resumes?status=approved&direction=product"); await render();
    expect(list().querySelectorAll("a")).toHaveLength(1); expect(list().textContent).toContain("产品简历");
    const clear = [...host.querySelectorAll("button")].find(button => button.textContent === "清除筛选")!;
    await act(async () => clear.click()); expect(list().querySelectorAll("a")).toHaveLength(2);
    expect(data.resumes[1].status).toBe("approved");
  });
  it("keeps input and error feedback after a failed update", async () => {
    await render(); title().value = "保留的输入";
    const form = title().closest("form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(title().value).toBe("保留的输入"); expect(host.textContent).toContain("合成保存失败");
  });
});

describe("focus preference input", () => {
  it("rejects corrupt values, removes duplicates and enforces the three-target bound", () => {
    expect(parseCareerFocus("{bad")).toEqual([]); expect(parseCareerFocus('{"id":"one"}')).toEqual([]);
    expect(parseCareerFocus('["a",null,"a",3,"b","c","d"]')).toEqual(["a", "b", "c"]);
  });
});
