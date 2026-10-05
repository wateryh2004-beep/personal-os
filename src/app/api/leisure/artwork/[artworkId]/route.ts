import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { artworkPrivateHeaders, getPrivateArtworkBytes } from "@/features/leisure/artwork-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ artworkId: string }> }) {
  try {
    const { userId } = await requireOwnerApi();
    const { artworkId } = await params;
    const width = new URL(request.url).searchParams.get("w") ?? "1280";
    if (width !== "640" && width !== "1280") return new Response(null, { status: 400, headers: artworkPrivateHeaders });
    const bytes = await getPrivateArtworkBytes(userId, artworkId, Number(width) as 640 | 1280);
    if (!bytes) return new Response(null, { status: 404, headers: artworkPrivateHeaders });
    return new Response(new Uint8Array(bytes), { headers: { ...artworkPrivateHeaders, "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength) } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? new Response(null, { status: 503, headers: artworkPrivateHeaders });
  }
}
