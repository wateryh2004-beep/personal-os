import { describe, expect, it } from "vitest";
import { OCR_MAX_IMAGE_PIXELS, awaitOcr, ocrImageSize, ocrKind, ocrText } from "@/features/files/ocr-policy";
import { readSource } from "@/features/files/ocr-source";
const png = (w: number, h: number) => { const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); const v = new DataView(bytes.buffer); v.setUint32(16,w); v.setUint32(20,h); return bytes; };
describe("private OCR policy", () => {
  it("offers only deliberate supported formats", () => {
    expect(ocrKind("scan.PDF", "application/octet-stream")).toBe("pdf");
    expect(ocrKind("photo.webp", "image/webp")).toBe("image");
    expect(ocrKind("unsafe.svg", "image/svg+xml")).toBeNull();
    expect(ocrKind("animation.gif", "image/gif")).toBeNull();
  });
  it("validates image dimensions before decode", () => {
    expect(ocrImageSize(png(1000,1000))).toEqual({width:1000,height:1000});
    expect(() => ocrImageSize(png(OCR_MAX_IMAGE_PIXELS,2))).toThrow("ocr_image_too_large");
    expect(() => ocrImageSize(png(0,10))).toThrow("ocr_invalid_image");
    expect(() => ocrImageSize(new Uint8Array(10))).toThrow("ocr_invalid_image");
  });
  it("cancels unresolved imports without hanging the UI", async () => {
    const controller = new AbortController();
    const pending = awaitOcr(new Promise(() => {}), controller.signal); controller.abort();
    await expect(pending).rejects.toThrow("ocr_cancelled");
  });
  it("normalizes without silently truncating search text", () => {
    expect(ocrText("  私有\0扫描\r\nhello \n")).toBe("私有扫描\nhello");
    expect(ocrText("私人 文档 中 文 识别 测试 English text")).toBe("私人文档中文识别测试 English text");
    expect(ocrText("x".repeat(300001)).length).toBe(300001);
  });
  it("rejects short and overflowing bodies and cancels the source", async () => {
    const body = (text: string) => new ReadableStream<Uint8Array>({start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); }});
    await expect(readSource(body("abc"),3,new AbortController().signal)).resolves.toEqual(Buffer.from("abc"));
    await expect(readSource(body("abc"),2,new AbortController().signal)).rejects.toThrow("ocr_too_large");
    await expect(readSource(body("abc"),4,new AbortController().signal)).rejects.toThrow("ocr_source_changed");
    const controller=new AbortController();controller.abort();
    await expect(readSource(body("abc"),3,controller.signal)).rejects.toThrow();
  });
});
