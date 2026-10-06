import Link from "next/link";
import { ArrowUpRight, Brain, Keyboard } from "lucide-react";
import { R2StorageSettings } from "@/components/settings/r2-storage-settings";
import { DeepSeekSettingsForm } from "@/components/settings/deepseek-settings-form";
import { AiPromptSettings } from "@/components/settings/ai-prompt-settings";
import { PageHeader } from "@/components/shared/page-header";
import { getAiGovernanceSettings, getAiSettings, getNoteAiPromptSettings } from "@/features/ai/queries";
import { AiGovernanceSettings } from "@/components/settings/ai-governance-settings";
import { getSystemHealth } from "@/features/system-status/queries";
import { SystemHealth } from "@/components/settings/system-health";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { shortcuts } from "@/features/shortcuts/registry";

export default async function Settings() {
  const [ai, promptSettings, systemHealth, governance] = await Promise.all([
    getAiSettings(), getNoteAiPromptSettings(), getSystemHealth(), getAiGovernanceSettings(),
  ]);
  return <>
    <PageHeader title="设置" description="让你的工作空间，按你的方式运转。" eyebrow="PERSONAL OS / PREFERENCES" />
    <SettingsWorkspace
      storage={<R2StorageSettings />}
      connections={<SystemHealth rows={systemHealth.rows} controlPlane={systemHealth.controlPlane} />}
      ai={<div className="space-y-7">
        <header><p className="text-xs font-medium text-[var(--accent)]">AI & PRIVACY</p><h2 className="mt-2 text-xl font-semibold tracking-tight">你的 AI，你的边界</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">管理模型连接、上下文权限和使用预算。</p></header>
        <DeepSeekSettingsForm configured={Boolean(ai.settings)} settings={ai.settings} />
        <details className="group rounded-xl border border-[var(--separator)] p-4"><summary className="cursor-pointer text-sm font-semibold">隐私与使用预算<span className="mt-1 block text-xs font-normal text-[var(--text-tertiary)]">上下文权限 · 调用限制 · 费用上限</span></summary><div className="mt-4"><AiGovernanceSettings settings={governance} /></div></details>
        <details className="group rounded-xl border border-[var(--separator)] p-4"><summary className="cursor-pointer text-sm font-semibold">提示词工作室<span className="mt-1 block text-xs font-normal text-[var(--text-tertiary)]">查看默认提示词，按需维护个人覆盖</span></summary><div className="mt-4"><AiPromptSettings prompts={promptSettings.prompts} available={promptSettings.available} /></div></details>
      </div>}
      general={<div className="space-y-8">
        <header><p className="text-xs font-medium text-[var(--accent)]">MAKE IT YOURS</p><h2 className="mt-2 text-xl font-semibold tracking-tight">工作习惯</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">更顺手地操作，清楚地管理个人信息。</p></header>
        <section><h3 className="flex items-center gap-2 text-sm font-semibold"><Keyboard size={17} aria-hidden="true" />快捷键</h3><p className="mt-2 text-xs text-[var(--text-secondary)]">编辑文本时不会抢占输入快捷键。</p><dl className="mt-4 divide-y divide-[var(--separator)]">{Object.values(shortcuts).map(shortcut => <div key={shortcut.keys} className="flex min-h-12 items-center justify-between gap-4 py-3 text-[13px]"><dt>{shortcut.label}</dt><dd><kbd className="whitespace-nowrap rounded-md border border-[var(--separator)] bg-[var(--surface-control)] px-2 py-1 font-sans text-xs">{shortcut.keys}</kbd></dd></div>)}</dl></section>
        <Link href="/memory" className="flex items-center gap-3 rounded-xl bg-[var(--surface-control)] p-4 hover:bg-[var(--surface-control-hover)]"><Brain size={20} aria-hidden="true" /><span className="flex-1"><span className="block text-sm font-semibold">个人记忆</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">查看、确认与维护提供给助手的重要信息</span></span><ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>}
    />
  </>;
}
