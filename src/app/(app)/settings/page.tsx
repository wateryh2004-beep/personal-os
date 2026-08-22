import { DeepSeekSettingsForm } from "@/components/settings/deepseek-settings-form";
import { AiPromptSettings } from "@/components/settings/ai-prompt-settings";
import { PageHeader } from "@/components/shared/page-header";
import { getAiGovernanceSettings, getAiSettings, getNoteAiPromptSettings } from "@/features/ai/queries";
import { AiGovernanceSettings } from "@/components/settings/ai-governance-settings";
import { getSystemHealth } from "@/features/system-status/queries";
import { SystemHealth } from "@/components/settings/system-health";
import Link from "next/link";
import { shortcuts } from "@/features/shortcuts/registry";

export default async function Settings() {
  const [ai, promptSettings, systemHealth, governance] = await Promise.all([
    getAiSettings(),
    getNoteAiPromptSettings(),
    getSystemHealth(),
    getAiGovernanceSettings(),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-5 text-sm">
        <DeepSeekSettingsForm
          configured={Boolean(ai.settings)}
          settings={ai.settings}
        />
        <AiPromptSettings
          prompts={promptSettings.prompts}
          available={promptSettings.available}
        />
        <AiGovernanceSettings settings={governance} />
        <SystemHealth rows={systemHealth} />
        <section className="border-t pt-5">
          <h2 className="font-medium">快捷键</h2>
          <p className="mt-1 text-[var(--text-secondary)]">常用操作保持一致；编辑文本时不会抢占输入快捷键。</p>
          <dl className="mt-3 divide-y border-y text-sm">{Object.values(shortcuts).map((shortcut) => <div key={shortcut.keys} className="flex items-center justify-between gap-4 px-1 py-2.5"><dt>{shortcut.label}</dt><dd><kbd className="rounded border bg-[var(--surface-hover)] px-1.5 py-0.5 font-sans text-xs tabular-nums">{shortcut.keys}</kbd></dd></div>)}</dl>
        </section>
        <section className="border-t pt-5">
          <h2 className="font-medium">Memory</h2>
          <p className="mt-1 text-[var(--text-secondary)]">
            查看、确认与维护提供给个人助手的重要信息。
          </p>
          <Link
            className="mt-3 inline-block text-[var(--accent)] hover:underline"
            href="/memory"
          >
            管理 Memory →
          </Link>
        </section>
      </div>
    </>
  );
}
