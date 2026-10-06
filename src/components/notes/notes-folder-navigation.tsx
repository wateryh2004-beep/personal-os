import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";

export type NotesFolder = { id: string; name: string; parent_id: string | null };

/** Metadata only: never infer descendant note counts from a paginated list. */
export function notesFolderAncestors(folder: NotesFolder, folders: NotesFolder[]) {
  const ancestors: NotesFolder[] = [];
  const seen = new Set([folder.id]);
  let parentId = folder.parent_id;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = folders.find((item) => item.id === parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.parent_id;
  }
  return ancestors;
}

export const notesFolderHref = (id: string) => `/notes?${new URLSearchParams({ folder: id })}`;

export function NotesFolderBreadcrumbs({ folder, folders }: { folder: NotesFolder; folders: NotesFolder[] }) {
  return <nav aria-label="文件夹路径" className="mb-3 text-[12px] leading-5 text-[var(--text-secondary)]">
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
      <li><Link href="/notes" className="ui-link inline-flex min-h-11 md:min-h-9 items-center rounded px-1">全部笔记</Link></li>
      {notesFolderAncestors(folder, folders).map((ancestor) => <li key={ancestor.id} className="flex min-w-0 items-start gap-1">
        <ChevronRight aria-hidden="true" className="mt-2.5 size-3.5 shrink-0" />
        <Link href={notesFolderHref(ancestor.id)} className="ui-link inline-flex min-h-11 md:min-h-9 min-w-0 items-center break-words rounded px-1 [overflow-wrap:anywhere]">{ancestor.name}</Link>
      </li>)}
      <li className="flex min-w-0 items-start gap-1"><ChevronRight aria-hidden="true" className="mt-2.5 size-3.5 shrink-0" /><span aria-current="page" className="min-w-0 break-words px-1 py-2 [overflow-wrap:anywhere]">{folder.name}</span></li>
    </ol>
  </nav>;
}

export function NotesChildFolders({ folders }: { folders: NotesFolder[] }) {
  if (!folders.length) return null;
  return <section aria-label="子文件夹" className="mt-5 border-b border-[var(--separator)] pb-5">
    <h2 className="mb-2 text-[12px] font-medium text-[var(--text-secondary)]">子文件夹 <span className="ml-1 tabular-nums text-[var(--text-tertiary)]">{folders.length}</span></h2>
    <ul className="grid gap-2 sm:grid-cols-2">
      {folders.map((folder) => <li key={folder.id} className="min-w-0">
        <Link href={notesFolderHref(folder.id)} className="flex min-h-14 items-center gap-3 rounded-[10px] bg-[var(--surface-control)] px-3 py-3 text-[13px] leading-5 hover:bg-[var(--surface-control-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
          <Folder aria-hidden="true" className="size-4 shrink-0 text-[var(--text-secondary)]" />
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{folder.name}</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--text-tertiary)]" />
        </Link>
      </li>)}
    </ul>
  </section>;
}
