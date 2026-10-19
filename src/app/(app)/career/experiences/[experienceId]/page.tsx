import { notFound } from "next/navigation";
import { getExperience } from "@/features/career/queries";
import { getExperienceGraph } from "@/features/graph/queries";
import { experienceFilters, experienceLibraryHref } from "@/features/career/experience-library";
import { ExperienceDetail } from "@/components/career/experience-detail";

type ReturnParams = Record<string, string | string[] | undefined>;
export default async function ExperiencePage({ params, searchParams }: { params: Promise<{ experienceId: string }>; searchParams?: Promise<ReturnParams> }) {
  const [{ experienceId }, values] = await Promise.all([params, searchParams ?? Promise.resolve({} as ReturnParams)]);
  const data = await getExperience(experienceId);
  if (!data) notFound();
  const graph = await getExperienceGraph(data.experience.id, [data.experience.organization, data.experience.role].filter(Boolean).join(" "));
  const query = new URLSearchParams();
  for (const key of ["q", "type", "period", "status"]) { const value = values[key]; if (value) query.set(key, Array.isArray(value) ? value[0] : value); }
  return <ExperienceDetail data={data} graph={graph} returnHref={experienceLibraryHref(experienceFilters(query))} />;
}
