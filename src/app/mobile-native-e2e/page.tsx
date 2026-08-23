import { notFound } from "next/navigation";
import { MobileNativeHarness } from "@/components/testing/mobile-native-harness";

export const dynamic = "force-dynamic";

export default function MobileNativeE2EPage() {
  if (process.env.E2E_MOBILE_HARNESS !== "1") notFound();
  return <MobileNativeHarness />;
}
