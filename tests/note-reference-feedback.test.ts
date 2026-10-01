// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyNoteReference } from "@/components/notes/copy-note-reference";
import { EntityBacklinks } from "@/components/links/entity-backlinks";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("@/features/assistant/client-context", () => ({ publishAssistantContext: vi.fn() }));

const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
let container: HTMLDivElement;
let root: Root;
const response = (backlinks: unknown[], ok = true) => ({ ok, json: async () => ({ backlinks }) });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reference feedback", () => {
  it("copies an exact Markdown reference and exposes failure plus retry", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("permission")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await act(async () => root.render(createElement(CopyNoteReference, { title: "同名笔记", href: `/notes/${id}`, showLabel: true })));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("复制失败");
    await act(async () => container.querySelector("button")!.click());
    expect(writeText).toHaveBeenLastCalledWith(`[同名笔记](/notes/${id})`);
    expect(container.textContent).toContain("已复制引用");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => root.render(createElement(CopyNoteReference, { title: "新标题", href: `/notes/${id}`, showLabel: true })));
    expect(container.textContent).not.toContain("已复制引用");
  });

  it("removes old entity references immediately when switching to a new entity", async () => {
    let resolveSecond: (value: ReturnType<typeof response>) => void = () => {};
    const fetcher = vi.fn().mockResolvedValueOnce(response([{ sourceType: "note", sourceId: id, title: "原先引用", href: `/notes/${id}`, label: "笔记" }])).mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(EntityBacklinks, { type: "note", id })));
    expect(container.textContent).toContain("原先引用");
    await act(async () => root.render(createElement(EntityBacklinks, { type: "note", id: secondId })));
    expect(container.textContent).not.toContain("原先引用");
    expect(container.textContent).toContain("正在读取");
    await act(async () => resolveSecond(response([])));
    expect(container.textContent).toBe("");
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("does not interpret HTTP failure as an empty list and can retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([], false)).mockResolvedValueOnce(response([{ sourceType: "todo_task", sourceId: id, title: "跟进任务", href: `/tasks?task=${id}`, label: "任务" }]));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(EntityBacklinks, { type: "note", id })));
    expect(container.textContent).toContain("暂时无法读取");
    await act(async () => container.querySelector("button")!.click());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/tasks?task=${id}`);
    expect(container.textContent).toContain("跟进任务");
  });
});
