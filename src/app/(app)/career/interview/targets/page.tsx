import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import { TargetForm } from "@/components/career/target-form";
import { TargetLibrary } from "@/components/career/target-library";
import { getInterviewTargetIndex } from "@/features/career/queries";

export default async function InterviewTargetsPage() {
  const data = await getInterviewTargetIndex();
  return <>
    <PageHeader title="面试准备情境" description="保存题库、答案与模拟练习；这些记录不是正在招聘的岗位，也不是投递证明。" action={<TargetForm timezone={data.timezone} />} />
    <CareerNav current="/career/interview/targets" />
    <InterviewNav current="/career/interview/targets" />
    <TargetLibrary ownerId={data.ownerId} targets={data.targets} preparations={data.preparations} now={data.now} timezone={data.timezone} unavailable={data.unavailable} />
  </>;
}
