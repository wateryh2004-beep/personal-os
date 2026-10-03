// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { attachmentRole, notePdfAttachments, type NoteAttachment } from "@/features/notes/attachments";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/layout/workspace-panel-provider", () => ({ useWorkspacePanel: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }) }));
vi.mock("@/components/shared/inspector", () => ({ Inspector: () => null }));

const pdf: NoteAttachment = { id: "11111111-1111-4111-8111-111111111111", title: "原件", original_filename: "原件.pdf", mime_type: "application/pdf", file_size: 1024, role: "pdf_snapshot" };
let root: Root | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { if (root) await act(async () => root!.unmount()); document.body.innerHTML = ""; root = undefined; });

async function mount(attachments: NoteAttachment[]) {
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(NoteDocumentShell, { noteId: "note", attachments,
    editor: createElement("input", { "aria-label": "正文草稿", defaultValue: "未保存的文字" }), inspector: null,
  })));
  return container;
}

describe("Document PDF reader", () => {
  it("keeps the same editor and draft alive across PDF switches", async () => {
    const container = await mount([pdf]);
    const input = container.querySelector("input")!; input.value = "新的未保存正文";
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent === "PDF")!;
    await act(async () => button.click());
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("新的未保存正文");
    expect(input.parentElement!.hidden).toBe(true);
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("src")).toBe(`/api/files/${pdf.id}/download?inline=1#view=FitH`);
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "正文")!.click());
    expect(input.parentElement!.hidden).toBe(false);
    expect(input.value).toBe("新的未保存正文");
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(iframe.parentElement!.hidden).toBe(true);
    await act(async () => button.click());
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(iframe.parentElement!.hidden).toBe(false);
  });

  it("opens an independent PDF document directly and provides fallback links", async () => {
    const container = await mount([{ ...pdf, role: "primary_pdf" }]);
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("iframe")!.title).toBe("PDF 阅读器：原件");
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      `/api/files/${pdf.id}/download?inline=1`, `/api/files/${pdf.id}/download`,
    ]);
  });

  it("provides an explicit reload and replaces the reader when choosing another PDF", async () => {
    const second = { ...pdf, id: "second", title: "第二份原件" };
    const container = await mount([{ ...pdf, role: "primary_pdf" }, second]);
    const firstReader = container.querySelector("iframe")!;
    await act(async () => firstReader.dispatchEvent(new Event("load")));
    expect(firstReader.parentElement!.getAttribute("aria-busy")).toBe("false");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="重新加载 PDF"]')!.click());
    const reloadedReader = container.querySelector("iframe")!;
    expect(reloadedReader).not.toBe(firstReader);
    expect(reloadedReader.parentElement!.getAttribute("aria-busy")).toBe("true");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = second.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector("iframe")!.title).toBe("PDF 阅读器：第二份原件");
    expect(container.querySelector("iframe")).not.toBe(reloadedReader);
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "正文")!.click());
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("shows Markdown normally when no PDF is attached", async () => {
    const container = await mount([]);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("input")!.parentElement!.hidden).toBe(false);
  });

  it("selects primary PDFs ahead of snapshots and excludes non-PDF attachments", () => {
    const files = [pdf, { ...pdf, id: "image", mime_type: "image/png" }, { ...pdf, id: "primary", role: "primary_pdf" }];
    expect(notePdfAttachments(files).map((file) => file.id)).toEqual(["primary", pdf.id]);
    expect(files).toHaveLength(3);
    expect(attachmentRole({ document_role: "primary_pdf" })).toBe("primary_pdf");
    expect(attachmentRole(null)).toBe("attachment");
    expect(attachmentRole({ document_role: 4 })).toBe("attachment");
  });
});
