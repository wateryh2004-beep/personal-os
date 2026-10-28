// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceLibraryWorkspace } from "@/components/experience-library/experience-library-workspace";

const actions = vi.hoisted(() => ({
  appendExperienceCapture: vi.fn(),
  attachExperienceMedia: vi.fn(),
  createImageOnlyExperience: vi.fn(),
  saveExperienceAiSettings: vi.fn(),
  testExperienceAiSettings: vi.fn(),
  removeExperienceAiSettings: vi.fn(),
  findExistingExperience: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => createElement("a", props),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh, replace: actions.replace }),
}));
vi.mock("@/features/experience-library/actions", () => actions);

let host: HTMLDivElement;
let root: Root;
const NativeURL = globalThis.URL;

const data = {
  available: true,
  query: "",
  entries: [],
  total: 0,
  captureTotal: 0,
  mediaTotal: 0,
};
const aiConfig = {
  configured: false,
  provider: null,
  modelId: null,
  lastTestedAt: null,
};

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.sessionStorage.clear();
  actions.findExistingExperience.mockResolvedValue(null);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  class TestURL extends NativeURL {
    static createObjectURL = vi.fn(() => "blob:synthetic-preview");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", TestURL);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mount() {
  await act(async () => root.render(createElement(ExperienceLibraryWorkspace, {
    data,
    aiConfig,
    initialEntry: null,
  })));
}

describe("Experience Library quick capture", () => {
  it("protects unfinished input on close and restores text with an explicit image reselection warning", async () => {
    await mount();
    await act(async () => setTextarea(host.querySelector<HTMLTextAreaElement>("textarea")!, "尚未保存的合成文字"));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "draft.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const event = new Event("beforeunload", { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("尚未保存的合成文字");
    expect(host.textContent).toContain("请重新选择此前的 1 张图片");
  });

  it("starts a new entry after a successful save instead of appending the next paste", async () => {
    actions.appendExperienceCapture.mockResolvedValue({ entryId: "11111111-1111-4111-8111-111111111111", captureId: "22222222-2222-4222-8222-222222222222", title: "第一篇", createdEntry: true, appended: true });
    vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-4333-8333-333333333333" });
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => setTextarea(textarea, "第一篇"));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("保存经验"))!;
    await act(async () => save.click());
    await vi.waitFor(() => expect(host.textContent).toContain("继续收录下一篇"));
    await act(async () => setTextarea(textarea, "第二篇"));
    await act(async () => save.click());
    await vi.waitFor(() => expect(actions.appendExperienceCapture).toHaveBeenCalledTimes(2));
    expect(actions.appendExperienceCapture.mock.calls[1][0]).toMatchObject({ entryId: null, content: "第二篇" });
  });

  it("offers an explicit append target when the source URL has already been saved", async () => {
    actions.findExistingExperience.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", title: "已收录的帖子", sourceUrl: "https://example.test/post" });
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="url"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://example.test/post"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await vi.waitFor(() => expect(host.textContent).toContain("这篇已收录"));
    const append = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("补充到这篇"))!;
    await act(async () => append.click());
    expect(host.textContent).toContain("正在补充");
    expect(input.disabled).toBe(true);
  });
  it("saves a Xiaohongshu share message using the extracted URL and keeps its query", async () => {
    const link = "https://www.xiaohongshu.com/discovery/item/synthetic?source=webshare&xsec_token=synthetic%3D";
    actions.appendExperienceCapture.mockResolvedValue({ entryId: "11111111-1111-4111-8111-111111111111", captureId: "22222222-2222-4222-8222-222222222222", title: "合成评论", createdEntry: true, appended: true });
    vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-4333-8333-333333333333" });
    await mount();
    await act(async () => setTextarea(host.querySelector<HTMLTextAreaElement>("textarea")!, "合成的原始评论"));
    const input = host.querySelector<HTMLInputElement>('input[type="url"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, `40 【合成分享 | 小红书】 😆 ABC 😆 ${link}`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("保存经验"))!;
    await act(async () => save.click());
    await vi.waitFor(() => expect(actions.appendExperienceCapture).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl: link, content: "合成的原始评论" })));
  });
  it("explains an invalid source link locally without losing text or calling the server", async () => {
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => setTextarea(textarea, "合成的原始评论"));
    const url = host.querySelector<HTMLInputElement>('input[type="url"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(url, "不是链接");
      url.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("保存经验"))!;
    await act(async () => save.click());
    expect(host.textContent).toContain("来源链接格式不正确");
    expect(textarea.value).toBe("合成的原始评论");
    expect(actions.appendExperienceCapture).not.toHaveBeenCalled();
  });
  it("keeps both text and image from a mixed clipboard paste", async () => {
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    const file = new File(["synthetic-image"], "comment.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [file],
        getData: (type: string) => type === "text/plain" ? "评论：请看 GPA" : "",
      },
    });
    await act(async () => textarea.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(host.textContent).toContain("1 张待处理图片");
    expect(host.textContent).toContain("文字会正常保留");
    expect(host.querySelector('img[alt="comment.png"]')).toBeTruthy();
  });

  it("prevents default only for an image-only paste and does not turn an HTML image link into an original", async () => {
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    const file = new File(["synthetic-image"], "screenshot.png", { type: "image/png" });
    const imageOnly = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(imageOnly, "clipboardData", {
      value: { files: [file], getData: () => "" },
    });
    await act(async () => textarea.dispatchEvent(imageOnly));
    expect(imageOnly.defaultPrevented).toBe(true);

    const linkOnly = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(linkOnly, "clipboardData", {
      value: {
        files: [],
        getData: (type: string) => type === "text/html" ? '<img src="https://example.test/a.jpg">' : "",
      },
    });
    await act(async () => textarea.dispatchEvent(linkOnly));
    expect(linkOnly.defaultPrevented).toBe(false);
    expect(host.textContent).toContain("没有图片字节");
  });

  it("reports saved text separately when its image upload fails", async () => {
    actions.appendExperienceCapture.mockResolvedValue({
      entryId: "11111111-1111-4111-8111-111111111111",
      captureId: "22222222-2222-4222-8222-222222222222",
      title: "评论经验",
      createdEntry: true,
      appended: true,
    });
    vi.stubGlobal("crypto", {
      randomUUID: () => "33333333-3333-4333-8333-333333333333",
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "图片上传准备失败。" },
      { status: 503 },
    )));
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => setTextarea(textarea, "评论：这次面试先做了笔试"));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["synthetic-image"], "failure.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("保存经验"))!;
    await act(async () => save.click());
    await vi.waitFor(() => expect(host.textContent).toContain("文字已保存；1 张图片未完成"));
    expect(actions.appendExperienceCapture).toHaveBeenCalledWith(expect.objectContaining({
      content: "评论：这次面试先做了笔试",
    }));
    expect(actions.attachExperienceMedia).not.toHaveBeenCalled();
    expect(host.textContent).toContain("图片上传准备失败");
  });

  it("reconciles the same pending original, uploads again and finalizes before attaching on retry", async () => {
    const entryId = "11111111-1111-4111-8111-111111111111";
    const captureId = "22222222-2222-4222-8222-222222222222";
    const documentId = "44444444-4444-4444-8444-444444444444";
    actions.appendExperienceCapture.mockResolvedValue({ entryId, captureId, title: "合成评论", createdEntry: true, appended: true });
    actions.attachExperienceMedia.mockResolvedValue({ mediaId: "55555555-5555-4555-8555-555555555555", alreadyAttached: false });
    vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-4333-8333-333333333333", subtle: { digest: async () => new Uint8Array(32).buffer } });
    let putCount = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/experience-library/upload-url" && init?.method === "POST") return Response.json({ documentId, uploadUrl: "https://r2.example/put" });
      if (url.startsWith("/api/experience-library/upload-url?")) return Response.json({ documentId, state: "pending", uploadUrl: "https://r2.example/put" });
      if (url === "/api/experience-library/upload-bytes") return new Response(null, { status: ++putCount === 1 ? 503 : 200 });
      if (url === "/api/files/upload-url" && init?.method === "PATCH") return Response.json({ ok: true });
      throw new Error("unexpected request");
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => setTextarea(textarea, "评论：合成内容"));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "retry.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button("保存经验").click());
    await vi.waitFor(() => expect(host.textContent).toContain("1 张图片未完成"));
    expect(actions.attachExperienceMedia).not.toHaveBeenCalled();
    await act(async () => button("重试未完成项").click());
    await vi.waitFor(() => expect(actions.attachExperienceMedia).toHaveBeenCalledOnce());
    expect(putCount).toBe(2);
    expect(fetcher.mock.calls.some(([url, init]) => String(url) === "/api/files/upload-url" && init?.method === "PATCH")).toBe(true);
    expect(actions.appendExperienceCapture).toHaveBeenCalledOnce();
    expect(actions.attachExperienceMedia).toHaveBeenCalledWith(expect.objectContaining({ entryId, captureId, documentId }));
  });

  it("saves three images in selection order through the same-origin relay and attaches each to the saved capture", async () => {
    const entryId = "11111111-1111-4111-8111-111111111111";
    const captureId = "22222222-2222-4222-8222-222222222222";
    actions.appendExperienceCapture.mockResolvedValue({ entryId, captureId, title: "合成评论", createdEntry: true, appended: true });
    actions.attachExperienceMedia.mockResolvedValue({ mediaId: "55555555-5555-4555-8555-555555555555", alreadyAttached: false });
    let sequence = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, "0")}`, subtle: { digest: async () => new Uint8Array(32).buffer } });
    const order: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/experience-library/upload-url") {
        const filename = JSON.parse(String(init?.body)).filename as string;
        order.push(filename);
        return Response.json({ documentId: `44444444-4444-4444-8444-${String(order.length).padStart(12, "0")}`, uploadUrl: "https://r2.example/put" });
      }
      if (url === "/api/experience-library/upload-bytes" || (url === "/api/files/upload-url" && init?.method === "PATCH")) return Response.json({ ok: true });
      throw new Error("unexpected request");
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await act(async () => setTextarea(host.querySelector<HTMLTextAreaElement>("textarea")!, "合成评论"));
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: ["one.png", "two.png", "three.png"].map(name => new File(["image"], name, { type: "image/png" })) });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes("保存经验"))!;
    await act(async () => save.click());
    await vi.waitFor(() => expect(actions.attachExperienceMedia).toHaveBeenCalledTimes(3));
    expect(order).toEqual(["one.png", "two.png", "three.png"]);
    expect(actions.attachExperienceMedia.mock.calls.map(([value]) => value.captureId)).toEqual([captureId, captureId, captureId]);
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/api/experience-library/upload-bytes")).toHaveLength(3);
  });
});

it("carries the search term into the selected experience so image matches can be located", async () => {
  const entry = { id: "11111111-1111-4111-8111-111111111111", title: "合成资料", sourceUrl: null, tags: [], summary: null, aiStatus: "not_requested" as const, aiErrorCode: null, aiProvider: null, aiModel: null, aiAnalyzedAt: null, createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z", captureCount: 0, mediaCount: 1, matchExcerpt: "图片识别：秋招经验" };
  await act(async () => root.render(createElement(ExperienceLibraryWorkspace, { data: { ...data, query: "秋招", entries: [entry] }, aiConfig, initialEntry: null })));
  expect(host.querySelector<HTMLAnchorElement>(".experience-recent-main")?.getAttribute("href")).toBe(`/experience-library/${entry.id}?q=${encodeURIComponent("秋招")}`);
});
