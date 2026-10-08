// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileRecord } from "@/features/files/queries";

const mocks = vi.hoisted(() => ({ recognize: vi.fn() }));
vi.mock("@/lib/adapters/private-ocr-browser", () => ({ recognizePrivateDocument: mocks.recognize }));
import { FileOcrControl } from "@/components/files/file-ocr-control";

const bytes = new TextEncoder().encode("synthetic private source");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const token = "33333333-3333-4333-8333-333333333333";
const file = {
  id: "22222222-2222-4222-8222-222222222222", title: "Synthetic OCR source", original_filename: "scan.pdf",
  mime_type: "application/pdf", file_size: bytes.length,
} as FileRecord;
let host: HTMLDivElement, root: Root, source: Response;
let actions: Record<string, unknown>[];
let completed: (count: number) => void;
const button = (label: string) => [...document.querySelectorAll("button")].find(element => element.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  source = new Response(bytes, { headers: { "X-Ocr-Sha256": sha256 } });
  actions = []; completed = vi.fn();
  mocks.recognize.mockReset().mockResolvedValue({ text: "Synthetic OCR text", pages: 1, emptyPages: 0 });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ token });
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body as string); actions.push(body);
      return Response.json({ ok: true, characterCount: body.text?.length ?? 0 });
    }
    if (url.endsWith("?source=1")) return source;
    return Response.json({ job: null });
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function recognize() {
  await act(async () => root.render(createElement(FileOcrControl, { file, onComplete: completed })));
  await act(async () => button("OCR").click());
  await act(async () => {
    button("开始 / 重新识别").click();
    await vi.waitFor(() => expect(actions.length).toBeGreaterThan(0));
  });
}

describe("private OCR transport integrity", () => {
  it.each([
    ["omitted by a streaming response", {}],
    ["the encoded transfer size", { "Content-Length": "8", "Content-Encoding": "gzip" }],
    ["the original source size", { "Content-Length": String(bytes.length) }],
  ])("recognizes checksum-verified decoded bytes when Content-Length is %s", async (_label, transportHeaders) => {
    source = new Response(bytes, { headers: { ...transportHeaders, "X-Ocr-Sha256": sha256 } as HeadersInit });
    await recognize();
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(Array.from(mocks.recognize.mock.calls[0][0].bytes)).toEqual(Array.from(bytes));
    expect(actions).toEqual([expect.objectContaining({ action: "complete", token, sha256 })]);
    expect(completed).toHaveBeenCalledWith("Synthetic OCR text".length);
  });

  it.each([
    ["missing digest", bytes, undefined],
    ["malformed digest", bytes, "invalid"],
    ["changed bytes of the same length", new Uint8Array(bytes.length), sha256],
    ["truncated source", bytes.slice(0, -1), sha256],
    ["longer source", new Uint8Array(bytes.length + 1), sha256],
  ])("rejects %s before recognition or publication", async (_label, body, digest) => {
    source = new Response(body as Uint8Array<ArrayBuffer>, { headers: { "Content-Length": String(bytes.length), ...(digest ? { "X-Ocr-Sha256": digest } : {}) } });
    await recognize();
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    expect(actions).toEqual([expect.objectContaining({ action: "fail", token, error: "ocr_source_changed" })]);
    expect(document.body.textContent).toContain("原件已改变或归档");
  });
});
