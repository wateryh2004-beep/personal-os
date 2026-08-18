import { describe, expect, it } from "vitest";
import {
  bilibiliBvidFromUrl,
  extractPastedUrl,
  youtubeVideoIdFromUrl,
} from "@/features/links/link-url";
import { fetchTitleForUrl } from "@/features/links/link-title";

function makeFetcher(routes: Record<string, () => Response>) {
  return async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const key = String(input);
    return routes[key]?.() ?? new Response("", { status: 404 });
  };
}

describe("extractPastedUrl 识别纯 URL", () => {
  it("返回普通链接原样", () => {
    expect(extractPastedUrl("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe(
      "https://www.bilibili.com/video/BV1GJ411x7h7",
    );
  });

  it("剥离句末半角/全角标点", () => {
    expect(extractPastedUrl("https://example.com/a?x=1。")).toBe("https://example.com/a?x=1");
    expect(extractPastedUrl("https://example.com/a.")).toBe("https://example.com/a");
  });

  it("保留成对的圆括号", () => {
    expect(extractPastedUrl("https://en.wikipedia.org/wiki/Example_(disambiguation)")).toBe(
      "https://en.wikipedia.org/wiki/Example_(disambiguation)",
    );
  });

  it("带前后文字、多链接或非 http 一律返回 null", () => {
    expect(extractPastedUrl("看这个 https://example.com/a 链接")).toBeNull();
    expect(extractPastedUrl("https://a.com https://b.com")).toBeNull();
    expect(extractPastedUrl("ftp://example.com/a")).toBeNull();
    expect(extractPastedUrl("不是链接")).toBeNull();
  });
});

describe("视频站点 ID 识别", () => {
  it("B 站仅识别 bilibili.com 视频链接", () => {
    expect(bilibiliBvidFromUrl("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe(
      "BV1GJ411x7h7",
    );
    expect(bilibiliBvidFromUrl("https://b23.tv/abc123")).toBeNull();
    expect(bilibiliBvidFromUrl("https://example.com/video/BV1GJ411x7h7")).toBeNull();
  });

  it("YouTube 支持 watch / youtu.be / shorts", () => {
    expect(youtubeVideoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(youtubeVideoIdFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoIdFromUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(youtubeVideoIdFromUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("fetchTitleForUrl 按站点分发抓标题", () => {
  it("B 站走官方 API 拿到干净标题", async () => {
    const fetcher = makeFetcher({
      "https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7": () =>
        new Response(JSON.stringify({ code: 0, data: { title: "测试视频" } }), {
          status: 200,
        }),
    });
    const result = await fetchTitleForUrl(
      new URL("https://www.bilibili.com/video/BV1GJ411x7h7"),
      fetcher,
    );
    expect(result).toEqual({
      url: "https://www.bilibili.com/video/BV1GJ411x7h7",
      title: "测试视频",
      source: "bilibili_api",
    });
  });

  it("B 站 API 失败时回退 og:title", async () => {
    const fetcher = makeFetcher({
      "https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7": () =>
        new Response(JSON.stringify({ code: -404 }), { status: 200 }),
      "https://www.bilibili.com/video/BV1GJ411x7h7": () =>
        new Response(
          '<html><head><meta property="og:title" content="Fallback 标题"></head></html>',
          { status: 200 },
        ),
    });
    const result = await fetchTitleForUrl(
      new URL("https://www.bilibili.com/video/BV1GJ411x7h7"),
      fetcher,
    );
    expect(result.title).toBe("Fallback 标题");
    expect(result.source).toBe("og");
  });

  it("YouTube 走 oEmbed", async () => {
    const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`;
    const fetcher = makeFetcher({
      [endpoint]: () =>
        new Response(JSON.stringify({ title: "Rick Astley - Never Gonna Give You Up" }), {
          status: 200,
        }),
    });
    const result = await fetchTitleForUrl(
      new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      fetcher,
    );
    expect(result).toEqual({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up",
      source: "youtube_oembed",
    });
  });

  it("普通站点解析 og:title 并剥离站点后缀", async () => {
    const fetcher = makeFetcher({
      "https://example.com/article": () =>
        new Response(
          '<html><head><meta property="og:title" content="My Article - example.com"></head></html>',
          { status: 200 },
        ),
    });
    const result = await fetchTitleForUrl(new URL("https://example.com/article"), fetcher);
    expect(result).toEqual({
      url: "https://example.com/article",
      title: "My Article",
      source: "og",
    });
  });

  it("HTML entity 正确解码", async () => {
    const fetcher = makeFetcher({
      "https://example.com/post": () =>
        new Response(
          '<html><head><meta property="og:title" content="A &amp; B &#39;quoted&#39;"></head></html>',
          { status: 200 },
        ),
    });
    const result = await fetchTitleForUrl(new URL("https://example.com/post"), fetcher);
    expect(result.title).toBe("A & B 'quoted'");
  });

  it("所有途径都失败时返回空标题", async () => {
    const result = await fetchTitleForUrl(new URL("https://example.com/nothing"), makeFetcher({}));
    expect(result).toEqual({
      url: "https://example.com/nothing",
      title: "",
      source: "none",
    });
  });
});
