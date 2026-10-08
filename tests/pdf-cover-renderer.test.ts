import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { renderPdfCover } from "@/lib/adapters/pdf-cover-renderer";
import { PDF_COVER_MAX_SOURCE_BYTES } from "@/features/files/pdf-cover-policy";

const artifactDir = path.join(process.cwd(), "test-results/pdf-renderer");
const metrics: { fixture: string; durationMs: number; inputBytes: number; outputBytes: number; width: number; height: number }[] = [];
async function recordedRender(fixture: string, bytes: Uint8Array) {
  const started = performance.now();
  const output = await renderPdfCover(bytes);
  metrics.push({ fixture, durationMs: Math.round(performance.now() - started), inputBytes: bytes.byteLength, outputBytes: output.bytes.byteLength, width: output.width, height: output.height });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, `${fixture}.webp`), output.bytes);
  return output;
}
afterAll(async () => {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, "metrics.json"), JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, renderer: "pdfjs-6.4.299-webp-v1", metrics }, null, 2));
});

function pdfBytes(pdf = new jsPDF()) {
  return new Uint8Array(pdf.output("arraybuffer"));
}

/** An entirely synthetic, valid PDF with an oversized image declaration. */
function oversizedImagePdf() {
  const content = "q 200 0 0 200 0 0 cm /Im1 Do Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /XObject /Subtype /Image /Width 5000 /Height 5000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 1 >>\nstream\nX\nendstream",
  ];
  let data = "%PDF-1.7\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(data);
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  data += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  data += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(data));
}

describe("isolated first-page PDF renderer", () => {
  it("renders only the first complete page as a bounded metadata-free WebP", async () => {
    const pdf = new jsPDF({ unit: "pt", format: [400, 600] });
    pdf.setFillColor(20, 90, 160);
    pdf.rect(0, 0, 400, 600, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text("Synthetic first page", 30, 50);
    pdf.addPage();
    pdf.setFillColor(230, 30, 30);
    pdf.rect(0, 0, 400, 600, "F");
    const input = pdfBytes(pdf);
    const copy = Uint8Array.from(input);
    const output = await recordedRender("portrait", input);
    expect(input).toEqual(copy); // PDF.js must never detach the caller's bytes.
    expect(output.width).toBe(342);
    expect(output.height).toBe(512);
    expect(output.bytes.byteLength).toBeLessThanOrEqual(128 * 1024);
    const meta = await sharp(output.bytes).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 342, height: 512 });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    const { data } = await sharp(output.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(data[0] + 60);
  });

  it("renders genuine embedded Chinese glyphs without host fonts", async () => {
    const bytes = await readFile(path.join(process.cwd(), "tests/fixtures/pdf-covers/chinese-embedded.pdf"));
    const output = await recordedRender("chinese-embedded", bytes);
    expect(output.height).toBe(512);
    const region = { left: 26, top: 44, width: 207, height: 18 };
    const actual = await sharp(output.bytes).extract(region).greyscale().raw().toBuffer();
    const reference = await sharp(path.join(process.cwd(), "tests/fixtures/pdf-covers/chinese-reference.png"))
      .extract(region).greyscale().raw().toBuffer();
    let intersection = 0;
    let union = 0;
    for (let i = 0; i < actual.length; i++) {
      const a = actual[i] < 200;
      const b = reference[i] < 200;
      if (a && b) intersection++;
      if (a || b) union++;
    }
    // Compare actual glyph ink with an independently rasterized reference;
    // empty text or fallback tofu must not pass merely because ink exists.
    expect(intersection / union).toBeGreaterThan(0.75);
  });

  it("falls back for unembedded CJK fonts instead of caching missing glyphs", async () => {
    const bytes = await readFile(path.join(process.cwd(), "tests/fixtures/pdf-covers/chinese-unembedded.pdf"));
    await expect(renderPdfCover(bytes)).rejects.toThrow("pdf_cover_invalid");
  });

  it("preserves /Rotate orientation", async () => {
    const pdf = new jsPDF({ unit: "pt", format: [300, 600] });
    pdf.setFillColor(30, 120, 170);
    pdf.rect(20, 20, 260, 70, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text("Synthetic rotated page", 30, 50);
    pdf.setFillColor(220, 140, 40);
    pdf.rect(20, 520, 260, 60, "F");
    const input = pdfBytes(pdf);
    // jsPDF's xref is repaired by the parser after this controlled fixture edit.
    const rotated = Buffer.from(Buffer.from(input).toString("latin1").replace("/MediaBox", "/Rotate 90\n/MediaBox"), "latin1");
    const output = await recordedRender("rotated", rotated);
    expect(output).toMatchObject({ width: 512, height: 256 });
  });

  it("renders a noisy scanned page and fits the output byte budget", async () => {
    const pixels = Buffer.alloc(1024 * 1024 * 3);
    let seed = 123;
    for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels[i] = seed >>> 24; }
    const jpeg = await sharp(pixels, { raw: { width: 1024, height: 1024, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const pdf = new jsPDF({ unit: "pt", format: [512, 512] });
    pdf.addImage(jpeg, "JPEG", 0, 0, 512, 512);
    const output = await recordedRender("scanned", pdfBytes(pdf));
    expect(output).toMatchObject({ width: 512, height: 512 });
    expect(output.bytes.byteLength).toBeLessThanOrEqual(128 * 1024);
    expect((await sharp(output.bytes).stats()).channels[0].stdev).toBeGreaterThan(5);
  });

  it("rejects password-encrypted input without asking for a password", async () => {
    const pdf = new jsPDF({ encryption: { userPassword: "synthetic-test-only", ownerPassword: "synthetic-owner" } });
    pdf.text("Synthetic protected fixture", 10, 10);
    await expect(renderPdfCover(pdfBytes(pdf))).rejects.toThrow("pdf_cover_encrypted");
  });

  it("rejects malformed PDF bytes", async () => {
    await expect(renderPdfCover(Buffer.from("%PDF-1.7\nnot a PDF"))).rejects.toThrow("pdf_cover_invalid");
  });

  it("rejects more than 500 pages", async () => {
    const pdf = new jsPDF();
    for (let i = 1; i < 501; i++) pdf.addPage();
    await expect(renderPdfCover(pdfBytes(pdf))).rejects.toThrow("pdf_cover_too_many_pages");
  });

  it("rejects oversized image declarations instead of caching a blank cover", async () => {
    await expect(renderPdfCover(oversizedImagePdf())).rejects.toThrow("pdf_cover_too_large");
  });

  it("rejects over-budget input before spawning", async () => {
    await expect(renderPdfCover(new Uint8Array(PDF_COVER_MAX_SOURCE_BYTES + 1))).rejects.toThrow("pdf_cover_too_large");
  });

  it("cancels without rendering an already-aborted request", async () => {
    await expect(renderPdfCover(pdfBytes(), AbortSignal.abort())).rejects.toThrow("pdf_cover_aborted");
  });
});
