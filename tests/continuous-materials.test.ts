import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { markdownBlocks, blockMove } from "@/features/notes/editor/markdown-blocks";
import { adoptionHunks, adoptHunks } from "@/features/notes/partial-adoption";
import { parseSourceLocator, sourceLocatorHref } from "@/features/links/source-locator";
import { parseInternalEntityLinks } from "@/features/links/parser";
import { parseInternalNoteLinks } from "@/features/notes/links/parser";
import { slashCompletion } from "@/features/notes/editor/slash-completion";
import { CompletionContext } from "@codemirror/autocomplete";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222",hash="a".repeat(64);
const extensions=[markdown({base:markdownLanguage,extensions:[GFM],addKeymap:false}),history()];
describe("continuous material source contracts",()=>{
 it("retains canonical backlinks while requiring the entire locator",()=>{
  const href=sourceLocatorHref({kind:"note",noteId:id,versionId:version,revision:7,from:0,to:12,hash});
  expect(parseSourceLocator(href)?.kind).toBe("note");expect(safeWorkbenchHref(href)).toBe(href);
  expect(parseInternalNoteLinks(`[source](${href})`)).toEqual([id]);
  expect(parseInternalEntityLinks(`[source](${href})`)[0]).toMatchObject({type:"note",id});
  expect(parseSourceLocator(href+"&sh="+hash)).toBeNull();expect(parseSourceLocator(href+"&body=secret")).toBeNull();
  expect(parseInternalNoteLinks(`[forged](${href}&body=secret)`)).toEqual([]);
 });
 it("keeps PDF page independent of the Files list page and rejects unsafe sources",()=>{
  const href=sourceLocatorHref({kind:"pdf",documentId:id,sourceVersion:version,page:500});
  expect(parseSourceLocator(href)).toMatchObject({page:500});expect(parseInternalEntityLinks(`[p](${href})`)[0].type).toBe("document");
  expect(parseSourceLocator(href.replace("500","501"))).toBeNull();expect(parseSourceLocator("https://evil.example"+href)).toBeNull();
 });
});
describe("complete Markdown blocks",()=>{
 for(const block of ["```ts\na()\n\nb()\n```","> a\n>\n> b","- a\n  - child\n\n- b","| a | b |\n|---|---|\n| c | d |","Title\n====="]){
  it(`moves a whole syntax node and supports byte-exact undo (${block.slice(0,12)})`,()=>{
   const text=`# Intro\n\n${block}\n\nTail`;
   const blocks=markdownBlocks(text);expect(blocks).toHaveLength(3);
   const change=blockMove(text,blocks,1,2)!;expect(change).not.toBeNull();
   let state=EditorState.create({doc:text,extensions});state=state.update({changes:{from:change.from,to:change.to,insert:change.insert},userEvent:"move.block"}).state;
   expect(state.doc.toString().endsWith(block)).toBe(true);
   expect(undo({state,dispatch:transaction=>{state=transaction.state;}})).toBe(true);expect(state.doc.toString()).toBe(text);
   expect(redo({state,dispatch:transaction=>{state=transaction.state;}})).toBe(true);expect(state.doc.toString().endsWith(block)).toBe(true);
  });
 }
 it("does not move a frontmatter delimiter away from its document boundary",()=>expect(blockMove("---\ntitle: x\n---\n\nTail",markdownBlocks("---\ntitle: x\n---\n\nTail"),0,1)).toBeNull());
 it("adopts selected structural hunks while preserving an unselected paragraph",()=>{
  const before="First old.\n\nStable.\n\nLast old.",after="First new.\n\nStable.\n\nLast new.";
  const hunks=adoptionHunks(before,after)!;expect(hunks).toHaveLength(2);
  const result=adoptHunks(before,hunks,new Set([hunks[1].id]));expect(result).toBe("First old.\n\nStable.\n\nLast new.");
 });
 it("never offers slash completion inside code or a normal path",async()=>{
  for(const text of ["```\n/list\n```","See /list","https://example.com/list"]){
   const position=text.startsWith("```")?text.indexOf("/list")+5:text.length;
   const state=EditorState.create({doc:text,selection:{anchor:position},extensions});
   expect(await slashCompletion(new CompletionContext(state,position,false))).toBeNull();
  }
  const state=EditorState.create({doc:"/task",selection:{anchor:5},extensions});
  expect((await slashCompletion(new CompletionContext(state,5,false)))?.options[0].displayLabel).toBe("待办");
 });
});
