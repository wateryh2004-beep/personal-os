import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isContinuousFixtureRequest } from "@/features/testing/continuous-fixture-gate";
import { ContinuousFixtureClientShell } from "@/components/testing/continuous-fixture-client-shell";
export const dynamic = "force-dynamic";
export default async function ContinuousFixtureLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  if (!isContinuousFixtureRequest(`http://${requestHeaders.get("host") ?? "invalid"}/continuous-workflows-e2e`, requestHeaders.get("cookie"))) notFound();
  return <ContinuousFixtureClientShell>{children}</ContinuousFixtureClientShell>;
}
