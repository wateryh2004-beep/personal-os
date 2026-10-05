import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { artworkPrivateHeaders, getPrivateArtworkSources } from "@/features/leisure/artwork-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await requireOwnerApi();
    return Response.json({ sources: await getPrivateArtworkSources(userId) }, { headers: artworkPrivateHeaders });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({ error: "图片存储暂时不可用。" }, { status: 503, headers: artworkPrivateHeaders });
  }
}
