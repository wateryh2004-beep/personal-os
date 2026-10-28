import { createHash, webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ recognize: vi.fn() }));
vi.mock("@/lib/adapters/private-ocr-browser", () => ({ recognizePrivateDocument: state.recognize }));
import { recognizeExperienceImage } from "@/features/experience-library/browser-image-ocr";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("publishes local OCR only after validating the sealed original digest", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const calls: { method: string; body?: string }[] = [];
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET"; calls.push({ method, body: init.body as string | undefined });
    if (method === "POST") return Response.json({ token: "11111111-1111-4111-8111-111111111111" });
    if (method === "GET") return new Response(bytes, { headers: { "X-Ocr-Sha256": sha } });
    return Response.json({ ok: true });
  }));
  state.recognize.mockImplementation(async ({ onPage }: { onPage: (a: number, b: number) => Promise<void> }) => { await onPage(1, 1); return { text: "截图内容", pages: 1, emptyPages: 0 }; });
  const file = { name: "source.png", type: "image/png", size: bytes.byteLength } as File;
  expect(await recognizeExperienceImage(file, "doc", new AbortController().signal, () => {})).toBe("completed");
  expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "PATCH", "PATCH"]);
  expect(JSON.parse(calls[3].body!)).toMatchObject({ action: "complete", sha256: sha, text: "截图内容" });
});
it("does not publish recognition if source bytes fail verification", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (method === "POST") return Response.json({ token: "11111111-1111-4111-8111-111111111111" });
    if (method === "GET") return new Response(new Uint8Array([1]), { headers: { "X-Ocr-Sha256": "0".repeat(64) } });
    calls.push(JSON.parse(String(init.body)).action); return Response.json({ ok: true });
  }));
  await expect(recognizeExperienceImage({ name: "x.png", type: "image/png", size: 1 } as File, "doc", new AbortController().signal, () => {})).rejects.toThrow("ocr_source_changed");
  expect(calls).toEqual(["fail"]); expect(state.recognize).not.toHaveBeenCalled();
});
