import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/require-owner";

// The root is private. Never render or client-navigate through the app shell
// before the request session has been verified.
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireOwner();
  redirect("/today");
}
