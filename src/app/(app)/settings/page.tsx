import { DeepSeekSettingsForm } from "@/components/settings/deepseek-settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { getAiSettings } from "@/features/ai/queries";

export default async function Settings() {
  const ai = await getAiSettings();
  return <><PageHeader title="Settings" /><div className="space-y-5 text-sm"><DeepSeekSettingsForm configured={Boolean(ai.settings)} settings={ai.settings} /></div></>;
}
