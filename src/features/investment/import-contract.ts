import { createHash } from "node:crypto";
import { investmentResearchSchema } from "./schemas";
export function parseResearchImport(payload: string) {
  if (Buffer.byteLength(payload, "utf8") > 120000) throw new Error("导入内容超过 120 KB，请缩短报告正文");
  let input: unknown;
  try { input = JSON.parse(payload); } catch { throw new Error("请输入有效的 JSON 研究记录"); }
  const value = investmentResearchSchema.parse(input);
  return { value, hash: contentHash(value) };
}
export function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
