import { DeepSeekSettingsForm } from "@/components/settings/deepseek-settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { getAiSettings } from "@/features/ai/queries";

export default async function Settings() {
  const ai = await getAiSettings();
  return <><PageHeader title="Settings" description="账户、安全与系统配置。" /><div className="space-y-5 text-sm"><section className="border-b pb-5"><h2 className="font-medium">账户</h2><p className="mt-2 text-zinc-500">私人所有者账户。</p></section><DeepSeekSettingsForm configured={Boolean(ai.settings)} settings={ai.settings} timezone={ai.timezone} /><section className="border-b pb-5"><h2 className="font-medium">外观 · 模块 · Integrations</h2><p className="mt-2 text-zinc-500">占位设置，暂未启用。</p></section><section><h2 className="font-medium">数据导出与 Audit Log</h2><p className="mt-2 text-zinc-500">导出与审计列表将在数据库迁移后启用。</p></section></div></>;
}
