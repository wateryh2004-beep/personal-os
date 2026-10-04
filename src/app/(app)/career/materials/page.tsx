import { CareerMaterialsView } from "@/components/career/career-materials-view";
import { getCareerMaterials } from "@/features/career/materials";

export default async function CareerMaterialsPage() {
  const data = await getCareerMaterials();
  return <CareerMaterialsView data={data} />;
}
