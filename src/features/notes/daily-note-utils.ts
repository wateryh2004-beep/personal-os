export function dateInTimeZone(
  value: Date,
  timeZone: string,
) {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const parts = Object.fromEntries(
    fields
      .filter((field) => field.type !== "literal")
      .map((field) => [field.type, field.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dailyNoteTemplate(date: string) {
  const title = `日记 · ${date}`;
  return `# ${title}\n\n## 今天发生了什么\n\n\n## 感受与想法\n\n\n## 明天\n`;
}

export function inboxSourceMarker(inboxId: string) {
  return `<!-- inbox:${inboxId} -->`;
}

export function appendInboxEntryToDailyNote(
  bodyMarkdown: string,
  inboxId: string,
  content: string,
) {
  const marker = inboxSourceMarker(inboxId);
  if (bodyMarkdown.includes(marker)) return bodyMarkdown;

  const entry = `${content.trim()}\n\n${marker}`;
  const section = "## 感受与想法";
  const sectionIndex = bodyMarkdown.indexOf(section);
  if (sectionIndex < 0) {
    return `${bodyMarkdown.trimEnd()}\n\n${section}\n\n${entry}\n`;
  }

  const sectionContentStart = sectionIndex + section.length;
  const nextSectionIndex = bodyMarkdown.indexOf(
    "\n## ",
    sectionContentStart,
  );
  if (nextSectionIndex < 0) {
    return `${bodyMarkdown.trimEnd()}\n\n${entry}\n`;
  }

  const before = bodyMarkdown.slice(0, nextSectionIndex).trimEnd();
  const after = bodyMarkdown.slice(nextSectionIndex);
  return `${before}\n\n${entry}\n${after}`;
}
