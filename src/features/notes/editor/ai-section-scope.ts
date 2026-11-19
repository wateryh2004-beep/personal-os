/** ATX Markdown heading scopes, never index a heading inside fenced code. */
export type NoteAiSection = {
  id: string; title: string; level: number; from: number; to: number;
};
export function noteAiSections(markdown: string): NoteAiSection[] {
  const headings: Array<{ title: string; level: number; from: number }> = [];
  let cursor = 0;
  let fence: { character: string; length: number } | null = null;
  for (const line of markdown.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line);
      if (close) fence = null;
    } else if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
      if (heading) {
        headings.push({ level: heading[1].length, title: heading[2].trim().slice(0, 100), from: cursor });
      }
    }
    cursor += line.length + 1;
  }
  const result: NoteAiSection[] = [];
  if (headings.length && markdown.slice(0, headings[0].from).trim())
    result.push({ id: "intro", title: "开头（首个标题前）", level: 0, from: 0, to: headings[0].from });
  for (let i = 0; i < headings.length; i++) {
    const item = headings[i];
    let to = markdown.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= item.level) {
        to = headings[j].from;
        break;
      }
    }
    result.push({ id: `heading-${item.from}`, title: item.title, level: item.level, from: item.from, to });
  }
  return result.slice(0, 80);
}
