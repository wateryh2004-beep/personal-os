export const OCR_VERSION = "tesseract7-eng-chi-sim-v1";
export const OCR_ASSET_PATH = "/ocr/v1";
export const OCR_MAX_BYTES = 20 * 1024 * 1024;
export const OCR_MAX_PAGES = 10;
export const OCR_MAX_PIXELS = 4_000_000;
export const OCR_MAX_IMAGE_PIXELS = 20_000_000;
export const OCR_MAX_CHARACTERS = 300_000;
export const OCR_TIMEOUT_MS = 5 * 60_000;
export const OCR_PAGE_TIMEOUT_MS = 45_000;
export function ocrKind(filename: string, mimeType: string) {
  if (mimeType.split(";")[0] === "application/pdf" || /\.pdf$/i.test(filename)) return "pdf";
  if (["image/png", "image/jpeg", "image/webp"].includes(mimeType.split(";")[0]) || /\.(png|jpe?g|webp)$/i.test(filename)) return "image";
  return null;
}
export function ocrText(text: string) {
  return text.replaceAll("\0", "").replace(/\r\n?/g, "\n").replace(/[\t ]+\n/g, "\n").replace(/(?<=\p{Script=Han})[\t ]+(?=\p{Script=Han})/gu, "").trim();
}
export function ocrErrorMessage(code: string) {
  const errors: Record<string, string> = {
    ocr_cancelled: "已停止本次识别；可重新打开查看保存状态或重试。",
    ocr_timeout: "识别超时，已停止。可拆分文件后重试。",
    ocr_too_large: "本地 OCR 支持不超过 20 MiB 的文件。",
    ocr_too_many_pages: "本地 OCR 每份 PDF 最多 10 页，请先拆分。",
    ocr_image_too_large: "图片超过 2000 万像素，请缩小后重试。",
    ocr_no_text: "没有识别到文字。请检查清晰度和文字方向后重试。",
    ocr_too_much_text: "识别内容超过 30 万字，请拆分后重试。",
    ocr_source_changed: "原件已改变或归档，请刷新后重新开始。",
    ocr_busy: "已有 OCR 正在运行；请先取消，或等待最多 6 分钟后重试。",
    ocr_invalid_image: "只支持有效的 PNG、JPEG、WebP 图片。",
    ocr_encrypted: "加密 PDF 无法本地识别，请先解密副本。",
  };
  return errors[code] ?? "本地识别未完成。请检查网络和文件后重试。";
}
/** Read dimensions before decoding compressed images, including decompression bombs. */
export function ocrImageSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.slice(12,16));
    if (kind === "VP8X") {
      if (bytes[20] & 2) throw new Error("ocr_invalid_image"); // No animated WebP.
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    } else if (kind === "VP8L" && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    }
  }
  if (!width || !height) throw new Error("ocr_invalid_image");
  if (width * height > OCR_MAX_IMAGE_PIXELS || width > 32768 || height > 32768) throw new Error("ocr_image_too_large");
  return { width, height };
}

/** Interrupt awaiting browser module/decode work without leaving the UI stuck. */
export function awaitOcr<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("ocr_cancelled"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("ocr_cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
