"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HardDrive, Workflow, Sparkles, SlidersHorizontal, ChevronRight } from "lucide-react";

const sections = [
  { id: "storage", title: "存储空间", subtitle: "用量与容量规划", icon: HardDrive },
  { id: "connections", title: "连接与同步", subtitle: "服务状态与运行记录", icon: Workflow },
  { id: "ai", title: "AI 与隐私", subtitle: "模型、提示词与边界", icon: Sparkles },
  { id: "general", title: "通用", subtitle: "快捷键与个人记忆", icon: SlidersHorizontal },
] as const;
type Section = typeof sections[number]["id"];
function sectionFromHash(): Section {
  const id = window.location.hash.slice(1);
  return sections.find(section => section.id === id)?.id ?? "storage";
}
export function SettingsWorkspace({ storage, connections, ai, general }: Record<Section, ReactNode>) {
  const [selected, setSelected] = useState<Section>("storage");
  useEffect(() => {
    const sync = () => setSelected(sectionFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const panels = { storage, connections, ai, general };
  return <div className="settings-workspace mt-7 grid min-w-0 gap-5 lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-8">
    <nav aria-label="设置分类" className="min-w-0">
      <div className="grid grid-cols-2 gap-1.5 lg:sticky lg:top-5 lg:grid-cols-1">
        {sections.map(({ id, title, subtitle, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={selected === id ? "page" : undefined} onClick={() => setSelected(id)} className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${selected === id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-control)]"}`}>
          <Icon aria-hidden="true" size={18} className="shrink-0" />
          <span className="min-w-0"><span className="block text-[13px] font-semibold">{title}</span><span className="mt-1 hidden text-[11px] text-[var(--text-tertiary)] lg:block">{subtitle}</span></span>
          {selected === id ? <ChevronRight aria-hidden="true" size={14} className="ml-auto hidden shrink-0 lg:block" /> : null}
        </a>)}
      </div>
    </nav>
    <div className="min-w-0 rounded-2xl border border-[var(--separator)] bg-[var(--surface-canvas)] p-4 sm:p-6 lg:p-7">
      {sections.map(section => <div key={section.id} hidden={selected !== section.id} aria-label={section.title}>{panels[section.id]}</div>)}
    </div>
  </div>;
}
