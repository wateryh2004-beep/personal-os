// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readFileMetadata } from "@/features/files/metadata-read";
afterEach(() => vi.unstubAllGlobals());
it("shares two real HTTP slots between automatic IDs and explicit directory pages", async () => {
 let active = 0, maximum = 0;
 const releases: (() => void)[] = [];
 const fetcher = vi.fn<typeof fetch>(async () => {
  active++; maximum = Math.max(active, maximum);
  return new Promise<Response>(resolve => releases.push(() => { active--; resolve(Response.json({ ok: true })); }));
 });
 vi.stubGlobal("fetch", fetcher);
 const first = readFileMetadata("/api/files/a/record", new AbortController().signal);
 const second = readFileMetadata("/api/files/b/record", new AbortController().signal);
 const directory = readFileMetadata("/api/files/publication-directory?", new AbortController().signal);
 expect(fetcher).toHaveBeenCalledTimes(2); releases[0](); await first;
 await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
 expect(fetcher.mock.calls[2][0]).toBe("/api/files/publication-directory?"); expect(maximum).toBe(2);
 releases[1](); releases[2](); await Promise.all([second, directory]); expect(active).toBe(0);
});
it("removes an aborted queued page without issuing its request or blocking later reads", async () => {
 const releases: (() => void)[] = [];
 const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(resolve => releases.push(() => resolve(Response.json({ ok: true })))));
 vi.stubGlobal("fetch", fetcher);
 const first = readFileMetadata("/one", new AbortController().signal), second = readFileMetadata("/two", new AbortController().signal);
 const controller = new AbortController();
 const page = readFileMetadata("/cancelled-page", controller.signal).then(() => "unexpected", () => "aborted"); controller.abort();
 expect(await page).toBe("aborted"); expect(fetcher).toHaveBeenCalledTimes(2);
 releases[0](); releases[1](); await Promise.all([first, second]);
 const next = readFileMetadata("/next", new AbortController().signal); expect(fetcher).toHaveBeenCalledTimes(3); releases[2](); await next;
 expect(fetcher.mock.calls.some(([url]) => url === "/cancelled-page")).toBe(false);
});
