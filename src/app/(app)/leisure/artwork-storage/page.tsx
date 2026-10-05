import { ArtworkStoragePanel } from "@/components/leisure/artwork-storage-panel";
import { requireOwner } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { getPrivateArtworkSources } from "@/features/leisure/artwork-storage";

export const metadata = { title: "宣传图片存储 · Personal OS" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export default async function ArtworkStoragePage() {
  const { userId } = await requireOwner();
  return <ArtworkStoragePanel configured={isR2Configured()} initialSources={await getPrivateArtworkSources(userId)} />;
}
