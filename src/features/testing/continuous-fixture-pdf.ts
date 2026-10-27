/** Original synthetic text pages (second rotated) and a text-free scan-style diagram. */
export function continuousFixturePdf() {
  const streams = [1, 2].map(page => `BT /F1 18 Tf 40 720 Td (SYNTHETIC PAGE ${page} - original source evidence) Tj 0 -36 Td (Select this exact synthetic sentence.) Tj ET\n`);
  const scan = "0.2 0.3 0.2 rg 40 500 150 120 re f 220 500 150 200 re f 400 500 150 80 re f 40 490 m 550 490 l S\n";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}endstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>", `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}endstream`, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 9 0 R >>", `<< /Length ${scan.length} >>\nstream\n${scan}endstream`];
  let content = "%PDF-1.4\n"; const offsets: number[] = [];
  for (const [index, object] of objects.entries()) { offsets.push(content.length); content += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = content.length;
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}
