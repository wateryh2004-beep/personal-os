import { LeisureHome } from "@/components/leisure/leisure-home";
import { getLeisureExperiences } from "@/features/leisure/queries";

export const metadata = { title: "闲暇 · Personal OS" };
export default async function LeisurePage() {
  const { experiences, unavailable, hasMore } = await getLeisureExperiences();
  return <LeisureHome experiences={experiences} unavailable={unavailable} hasMore={hasMore} />;
}
