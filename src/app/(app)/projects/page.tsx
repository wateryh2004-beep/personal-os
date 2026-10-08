import { redirect } from "next/navigation";

// Preserve old bookmarks and create intents without another workspace.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const { create } = await searchParams;
  redirect(create === "1" ? "/tasks/projects?create=1" : "/tasks/projects");
}
