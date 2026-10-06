import { redirect } from "next/navigation";

/** Photos share Files ownership, originals and recovery; no duplicate library. */
export default function Photos() {
  redirect("/files?type=photo&view=grid");
}
