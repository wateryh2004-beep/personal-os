import { describe, expect, it, vi } from "vitest";
import {
  checkPdfObject, checkPdfPreviewSize, parsePdfRange, pdfInlineDisposition,
  streamPdfBytes, validatePdfSignature,
} from "@/features/files/pdf-preview";
import { maxFileSize } from "@/features/files/schemas";

const signal = () => new AbortController().signal;
const bytes = (text: string) => new TextEncoder().encode(text);
function source(chunks: Uint8Array[], cancel = vi.fn()) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); }, cancel,
  }, { highWaterMark: 0 });
}

describe("PDF preview byte ranges", () => {
  it.each([
    [null, null], ["bytes=0-0", { start: 0, end: 0 }], ["bytes=10-19", { start: 10, end: 19 }],
    ["bytes=90-", { start: 90, end: 99 }], ["bytes=-10", { start: 90, end: 99 }],
    ["bytes=-999", { start: 0, end: 99 }], ["bytes=90-999", { start: 90, end: 99 }],
    [" Bytes=000-009 ", { start: 0, end: 9 }],
  ])("normalizes %s", (header, range) => { expect(parsePdfRange(header, 100)).toEqual(range); });

  it.each(["", "bytes=", "bytes=-", "bytes=-0", "bytes=100-", "bytes=101-102", "bytes=9-8",
    "bytes=0-1,3-4", "bytes=0-1,", "items=0-1", "bytes=0 - 1", "bytes=1.5-2", "bytes=+1-2", "bytes=1e1-20",
    "bytes=9007199254740992-", "bytes=0-9007199254740992", "bytes=-9007199254740992"])("rejects %s", (header) => {
    expect(() => parsePdfRange(header, 100)).toThrow("pdf_preview_range");
  });

  it("uses the existing 100 MiB limit", () => {
    expect(() => checkPdfPreviewSize(maxFileSize)).not.toThrow();
    expect(() => checkPdfPreviewSize(maxFileSize + 1)).toThrow("pdf_preview_too_large");
    for (const value of [NaN, Infinity, -1, 0, 7, 8.5]) expect(() => checkPdfPreviewSize(value)).toThrow("pdf_preview_invalid");
  });

  it("provides an inline UTF-8 filename with a safe ASCII fallback", () => {
    const disposition = pdfInlineDisposition("中文 (v1)'s\r\n.pdf");
    expect(disposition).toBe("inline; filename=\"document.pdf\"; filename*=UTF-8''%E4%B8%AD%E6%96%87%20%28v1%29%27s__.pdf");
    expect(() => pdfInlineDisposition("broken-\ud800.pdf")).not.toThrow();
  });
});

describe("bounded PDF signature and streams", () => {
  it.each(["%PDF-1.0", "%PDF-1.7", "%PDF-2.0"])("accepts the eight-byte signature %s", async (prefix) => {
    await expect(validatePdfSignature(source([bytes(prefix.slice(0, 3)), bytes(prefix.slice(3))]), signal())).resolves.toBeUndefined();
  });
  it.each(["<html>hi", "%PDF-9.9", "%PDF-1.8", "x%PDF-1."])("rejects non-PDF signature %s", async (prefix) => {
    await expect(validatePdfSignature(source([bytes(prefix)]), signal())).rejects.toThrow("pdf_preview_invalid");
  });
  it("does not buffer a whole object when the bounded signature response is oversized", async () => {
    const cancel = vi.fn();
    await expect(validatePdfSignature(source([bytes("%PDF-1.7plus")], cancel), signal())).rejects.toThrow("pdf_preview_invalid");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("streams sequential chunks intact", async () => {
    const body = source([bytes("123"), bytes("456"), bytes("789")]);
    expect(await new Response(streamPdfBytes(body, 9, signal())).text()).toBe("123456789");
    expect(body.locked).toBe(false);
  });
  it("allows empty transport chunks without counting them as file content", async () => {
    const body = source([bytes(""), bytes("123"), bytes(""), bytes("456"), bytes("")]);
    expect(await new Response(streamPdfBytes(body, 6, signal())).text()).toBe("123456");
  });
  it("does not eagerly read while the browser has not requested bytes", async () => {
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => controller.enqueue(bytes("123")));
    const cancel = vi.fn();
    const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
    const stream = streamPdfBytes(body, 12, signal());
    await Promise.resolve();
    expect(pull).not.toHaveBeenCalled();
    const reader = stream.getReader();
    expect((await reader.read()).value).toEqual(bytes("123"));
    expect(pull).toHaveBeenCalledOnce();
    await reader.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it("rejects a truncated stream", async () => {
    await expect(new Response(streamPdfBytes(source([bytes("123")]), 4, signal())).text()).rejects.toThrow("pdf_preview_invalid");
  });
  it("rejects an overflowing chunk before exposing any of it", async () => {
    const cancel = vi.fn();
    const reader = streamPdfBytes(source([bytes("12345")], cancel), 4, signal()).getReader();
    await expect(reader.read()).rejects.toThrow("pdf_preview_invalid");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("checks EOF before exposing the last chunk, rejecting trailing bytes", async () => {
    const cancel = vi.fn();
    const reader = streamPdfBytes(source([bytes("1234"), bytes("5")], cancel), 4, signal()).getReader();
    await expect(reader.read()).rejects.toThrow("pdf_preview_invalid");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("propagates browser cancellation to an idle upstream stream", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    await streamPdfBytes(body, 10, signal()).cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it("cancels an in-flight read on request abort", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const pending = streamPdfBytes(body, 10, controller.signal).getReader().read();
    controller.abort();
    await expect(pending).rejects.toThrow("pdf_preview_unavailable");
    expect(cancel).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(body.locked).toBe(false));
  });
  it("cancels before reading if the request already aborted", async () => {
    const cancel = vi.fn();
    const controller = new AbortController(); controller.abort();
    await expect(new Response(streamPdfBytes(source([], cancel), 10, controller.signal)).text()).rejects.toThrow("pdf_preview_unavailable");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("sanitizes upstream stream errors", async () => {
    const body = new ReadableStream<Uint8Array>({ pull() { throw new Error("private-provider-detail"); } });
    await expect(new Response(streamPdfBytes(body, 10, signal())).text()).rejects.toThrow("pdf_preview_unavailable");
    await vi.waitFor(() => expect(body.locked).toBe(false));
  });
  it("rejects impossible stream lengths and cancels the source", async () => {
    for (const size of [0, -1, NaN, 1.5, maxFileSize + 1]) {
      const cancel = vi.fn();
      await expect(new Response(streamPdfBytes(source([], cancel), size, signal())).text()).rejects.toThrow("pdf_preview_invalid");
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("rejects a missing/different ETag or range metadata and cancels the source", async () => {
    for (const extra of [{ etag: null }, { etag: '"new-version"' }, { contentRange: null }, { size: 9 }]) {
      const cancel = vi.fn();
      await expect(checkPdfObject({ body: source([], cancel), size: 8, contentRange: "bytes 0-7/100", etag: '"version"', ...extra },
        100, { start: 0, end: 7 }, '"version"')).rejects.toThrow("pdf_preview_invalid");
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
});
