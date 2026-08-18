import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { fetchLinkTitle } from "@/features/links/link-title";

const querySchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

// 供 Markdown 编辑器「粘贴链接自动解析标题」使用。抓取失败时返回 title: null，
// 由前端回退为普通链接，不让网络波动影响编辑。
export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse({
      url: new URL(request.url).searchParams.get("url") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ title: null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    await requireOwnerApi();
    const result = await fetchLinkTitle(parsed.data.url).catch(() => ({
      url: parsed.data.url,
      title: "",
      source: "none" as const,
    }));
    return NextResponse.json(
      { url: result.url, title: result.title || null, source: result.source },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ title: null });
  }
}
