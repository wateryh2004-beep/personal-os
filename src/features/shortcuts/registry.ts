export type ShortcutId = "command" | "assistant" | "contextual-create";

export const shortcuts: Record<ShortcutId, { keys: string; label: string }> = {
  command: { keys: "⌘ / Ctrl + K", label: "搜索与命令中心" },
  assistant: { keys: "⌘ / Ctrl + J", label: "询问 Personal OS" },
  "contextual-create": { keys: "⌘ / Ctrl + N", label: "快速新建" },
};

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (id === "command") return event.key.toLowerCase() === "k";
  if (id === "assistant") return event.key.toLowerCase() === "j";
  return event.key.toLowerCase() === "n" && !isEditableTarget(event.target);
}
