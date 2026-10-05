import { notFound } from "next/navigation";
import { LeisureDetail } from "@/components/leisure/leisure-detail";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { getLeisureExperience, getLeisureExperiences } from "@/features/leisure/queries";

import { leisureBackHref, normalizeLeisureFrom } from "@/features/leisure/browse";

export const metadata = { title: "体验 · 闲暇" };
export default async function LeisureDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string | string[] }> }) {
  const { id } = await params;
  const [{ experience, unavailable }, collection, { from: rawFrom }] = await Promise.all([getLeisureExperience(id), getLeisureExperiences(), searchParams]);
  const from = normalizeLeisureFrom(rawFrom);
  if (unavailable) return <LeisureHome experiences={[]} unavailable />;
  if (!experience) notFound();
  // Request-time source freshness is intentionally computed on this dynamic server route.
  // eslint-disable-next-line react-hooks/purity
  return <LeisureDetail experience={experience} now={Date.now()} neighbors={collection.experiences} from={from} backHref={leisureBackHref(from)} />;
}
