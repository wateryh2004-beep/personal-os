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
      <PageHeader title="设置" />
      <div className="space-y-4.5 text-[13px]">
        <DeepSeekSettingsForm
          configured={Boolean(ai.settings)}
          settings={ai.settings}
        />
        <AiPromptSettings
          prompts={promptSettings.prompts}
          available={promptSettings.available}
        />
        <AiGovernanceSettings settings={governance} />
        <SystemHealth rows={systemHealth.rows} controlPlane={systemHealth.controlPlane} />
        <section className="border-t border-[var(--separator)] pt-4.5">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">快捷键</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">常用操作保持一致；编辑文本时不会抢占输入快捷键。</p>
          <dl className="mt-2.5 divide-y divide-[var(--separator)] border-y border-[var(--separator)] text-[12.5px]">{Object.values(shortcuts).map((shortcut) => <div key={shortcut.keys} className="flex min-h-10 items-center justify-between gap-4 px-1 py-2"><dt>{shortcut.label}</dt><dd><kbd className="rounded-[6px] bg-[var(--surface-control)] px-1.5 py-0.5 font-sans text-[10.5px] tabular-nums">{shortcut.keys}</kbd></dd></div>)}</dl>
        </section>
        <section className="border-t border-[var(--separator)] pt-4.5">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">记忆</h2>
          <p className="mt-1 text-[var(--text-secondary)]">
            查看、确认与维护提供给个人助手的重要信息。
          </p>
          <Link
            className="mt-3 inline-block text-[var(--accent)] hover:underline"
            href="/memory"
          >
            管理记忆 →
          </Link>
        </section>
      </div>
    </>
  );
}
