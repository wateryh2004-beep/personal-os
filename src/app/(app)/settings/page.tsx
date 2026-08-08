import { DeepSeekSettingsForm } from "@/components/settings/deepseek-settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { getAiSettings } from "@/features/ai/queries";
import Link from "next/link";

export default async function Settings() {
  const ai = await getAiSettings();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-5 text-sm">
        <DeepSeekSettingsForm
          configured={Boolean(ai.settings)}
          settings={ai.settings}
        />
        <section className="border-t pt-5">
          <h2 className="font-medium">Memory</h2>
          <p className="mt-1 text-zinc-500">
            查看、确认与维护提供给个人助手的重要信息。
          </p>
          <Link
            className="mt-3 inline-block text-[#365F78] hover:underline"
            href="/memory"
          >
            管理 Memory →
          </Link>
        </section>
      </div>
    </>
  );
}
