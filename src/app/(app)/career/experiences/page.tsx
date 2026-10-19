import { CareerNav } from "@/components/career/career-nav";
import { CreateExperienceDialog } from "@/components/career/create-experience-dialog";
import { ExperienceLibrary } from "@/components/career/experience-library";
import { PageHeader } from "@/components/shared/page-header";
import { getExperiences } from "@/features/career/queries";

export default async function ExperiencesPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [data, params] = await Promise.all([getExperiences(), searchParams]);
  return <><PageHeader title="经历素材" action={<CreateExperienceDialog initialOpen={params.create === "1"} />} /><CareerNav current="/career/experiences" /><ExperienceLibrary rows={data.experiences} unavailable={data.unavailable} /></>;
}
