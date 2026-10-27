import { z } from "zod";
import { contentHash } from "@/features/notes/utils";
import { parseSourceLocator } from "@/features/links/source-locator";
import type { NoteSourceExcerptData } from "@/components/notes/note-source-excerpt-view";
import { headers } from "next/headers";
import { isContinuousFixtureRequest } from "@/features/testing/continuous-fixture-gate";
import { continuousFixtureState } from "@/features/testing/continuous-fixture-state";
import { syntheticInboxItems } from "@/features/testing/continuous-inbox-fixture";
import { notFound } from "next/navigation";
import { isContinuousFixturePath } from "@/features/testing/continuous-fixture-routes";
import { ContinuousFixtureWorkspace } from "@/components/testing/continuous-fixture-workspace";
export default async function ContinuousFixturePage({ params, searchParams }: { params: Promise<{ path: string[] }>; searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const path = "/" + (await params).path.join("/");
  const requestHeaders=await headers();
  if(!isContinuousFixtureRequest(`http://${requestHeaders.get("host")??"invalid"}${path}`,requestHeaders.get("cookie")))notFound();
  if (!isContinuousFixturePath(path)) notFound();
  const query=new URLSearchParams();for(const[key,value]of Object.entries(await searchParams))if(typeof value==="string")query.set(key,value);
  const locator=parseSourceLocator(`${path}?${query}`);let sourceExcerpt:NoteSourceExcerptData|undefined;
  if(locator?.kind==="note"){const state=continuousFixtureState(requestHeaders.get("cookie")),current=state.notes.find(row=>row.note.id===locator.noteId)?.note;const version=state.domainObjects.get(`note-version:${locator.versionId}`);const parsed=z.object({noteId:z.string(),revision:z.number(),body:z.string()}).safeParse(version);const text=parsed.success?parsed.data.body.slice(locator.from,locator.to):null;sourceExcerpt={revision:locator.revision,currentRevision:current?.revision??null,excerpt:current&&parsed.success&&parsed.data.noteId===locator.noteId&&parsed.data.revision===locator.revision&&locator.to<=parsed.data.body.length&&text&&contentHash(text)===locator.hash?text:null};}
  return <ContinuousFixtureWorkspace path={path} sourceExcerpt={sourceExcerpt} inboxItems={path==="/inbox"?syntheticInboxItems(continuousFixtureState(requestHeaders.get("cookie"))):undefined} />;
}
