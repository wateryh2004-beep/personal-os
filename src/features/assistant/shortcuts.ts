export function isAssistantShortcut(input: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}) {
  return Boolean(
    (input.metaKey || input.ctrlKey) && input.key.toLocaleLowerCase() === "j",
  );
}
