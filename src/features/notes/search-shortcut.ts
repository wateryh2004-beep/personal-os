/** Slash is deliberately unmodified: browser address/find shortcuts stay native. */
export function isNotesSearchShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target;
  return !(target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"]'));
}
