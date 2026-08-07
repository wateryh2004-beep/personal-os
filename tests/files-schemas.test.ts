import { describe, expect, it } from "vitest";
import { canUpload, canUploadNoteImage, fileExtension, safeFilename } from "@/features/files/schemas";

describe("Files input safety", () => {
  it("sanitizes names without creating a storage path", () => {
    expect(safeFilename("../resume:final.pdf")).toBe(".._resume_final.pdf");
    expect(fileExtension("report.PDF")).toBe("pdf");
  });
  it("rejects executable files and oversized uploads", () => {
    expect(canUpload("notes.exe", "application/octet-stream", 100)).toBe(false);
    expect(canUpload("archive.pdf", "application/pdf", 101 * 1024 * 1024)).toBe(false);
    expect(canUpload("archive.pdf", "application/pdf", 1024)).toBe(true);
  });
  it("only allows safe raster images for direct note insertion", () => {
    expect(canUploadNoteImage("screen.png", "image/png", 1024)).toBe(true);
    expect(canUploadNoteImage("vector.svg", "image/svg+xml", 1024)).toBe(false);
    expect(canUploadNoteImage("screen.png", "image/png", 16 * 1024 * 1024)).toBe(false);
  });
});
