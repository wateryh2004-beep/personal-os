import { describe, expect, it } from "vitest";
import {
  initialExtractionStatus,
  MAX_EXTRACTABLE_FILE_BYTES,
  normalizeExtractedText,
} from "@/features/files/text-extraction";

describe("private file text extraction", () => {
  it("recognizes supported text, PDF and DOCX formats", () => {
    expect(initialExtractionStatus("note.md", "text/markdown", 100)).toBe("pending");
    expect(initialExtractionStatus("paper.pdf", "application/pdf", 100)).toBe("pending");
    expect(initialExtractionStatus("resume.docx", "application/octet-stream", 100)).toBe("pending");
    expect(initialExtractionStatus("photo.png", "image/png", 100)).toBe("unsupported");
  });

  it("does not buffer large files and sanitizes extracted text", () => {
    expect(initialExtractionStatus("paper.pdf", "application/pdf", MAX_EXTRACTABLE_FILE_BYTES + 1)).toBe("too_large");
    expect(normalizeExtractedText("a\u0000  \r\n\r\n\r\n\r\nb")).toBe("a\n\n\nb");
  });
});
