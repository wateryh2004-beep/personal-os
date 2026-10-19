import { notFound } from "next/navigation";
import { getCareerTarget } from "@/features/career/queries";
import { targetFilters, targetLibraryHref } from "@/features/career/target-library";
import { TargetDetail } from "@/components/career/target-detail";
export default async function InterviewTargetPage({params,searchParams}:{params:Promise<{contextId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const [{contextId},raw]=await Promise.all([params,searchParams]);
  const data=await getCareerTarget(contextId);
  if (!data) notFound();
  const paramsForReturn=new URLSearchParams();
  for(const key of ["target_q","target_status"]) { const value=raw[key]; if(typeof value==="string") paramsForReturn.set(key,value); }
  return <TargetDetail data={data} returnHref={targetLibraryHref(targetFilters(paramsForReturn))}/>;
}
