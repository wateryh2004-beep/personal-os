import { notFound } from "next/navigation";
import { LeisureDetail } from "@/components/leisure/leisure-detail";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { getLeisureExperience } from "@/features/leisure/queries";

export const metadata = { title: "体验 · 闲暇" };
export default async function LeisureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { experience, unavailable } = await getLeisureExperience(id);
  if (unavailable) return <LeisureHome experiences={[]} unavailable />;
  if (!experience) notFound();
  // Request-time source freshness is intentionally computed on this dynamic server route.
  // eslint-disable-next-line react-hooks/purity
  return <LeisureDetail experience={experience} now={Date.now()} />;
}
