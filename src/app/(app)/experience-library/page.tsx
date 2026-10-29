import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ExperienceLibraryWorkspace } from "@/components/experience-library/experience-library-workspace";
import {
  getExperienceAiConfig,
  getExperienceEntry,
  getExperienceLibraryWorkspace,
} from "@/features/experience-library/queries";

export const dynamic = "force-dynamic";

export default async function ExperienceLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entry?: string; tag?: string; status?: string; media?: string; analyzed?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 120);
  const [data, aiConfig, initialDetail] = await Promise.all([
    getExperienceLibraryWorkspace(query, { tag: params.tag?.slice(0, 100), status: ["unmarked", "to_read", "useful", "outdated"].includes(params.status ?? "") ? params.status : "", hasMedia: params.media === "1", analyzed: params.analyzed === "1", sort: params.sort }, Number(params.page ?? "1")),
    getExperienceAiConfig(),
    params.entry ? getExperienceEntry(params.entry) : Promise.resolve(null),
  ]);
  if (!data.available) {
    return (
      <section className="max-w-2xl">
        <PageHeader title="经验资料库" />
        <p className="mt-4 rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning)]">
          经验资料暂时无法读取。请确认最新 migration 已应用后刷新。
        </p>
        <Link href="/" className="ui-link mt-5 inline-block">返回</Link>
      </section>
    );
  }
  return (
    <ExperienceLibraryWorkspace
      key={initialDetail?.entry.id ?? "new"}
      data={data}
      aiConfig={aiConfig}
      initialEntry={initialDetail ? {
        id: initialDetail.entry.id,
        title: initialDetail.entry.title,
        sourceUrl: initialDetail.entry.sourceUrl,
      } : null}
    />
  );
}
