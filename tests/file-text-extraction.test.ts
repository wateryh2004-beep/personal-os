import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  initialExtractionStatus,
  MAX_EXTRACTABLE_FILE_BYTES,
  normalizeExtractedText,
  parseDocumentBytes,
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

  it("extracts actual bilingual DOCX bytes through the patched XML parser", async () => {
    const archive = new JSZip();
    archive.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    archive.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    // A bounded high-attribute element exercises the fixed deduplication path
    // without running an unbounded denial-of-service payload in shared CI.
    const attributes = Array.from({ length: 8_000 }, (_, index) => `a${index}="x"`).join(" ");
    archive.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p ${attributes}><w:r><w:t>合成文档 Synthetic document &amp; preserved text</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>`);
    const bytes = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(await parseDocumentBytes({ bytes, filename: "synthetic.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
      .toBe("合成文档 Synthetic document & preserved text\n\nSecond paragraph");
  });
});
