// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({rename:vi.fn(),move:vi.fn(),visibility:vi.fn(),read:vi.fn()}));
vi.mock("@/features/workflow-continuity/ordinary-comparison",()=>({readOrdinaryDraftComparison:api.read}));
vi.mock("@/features/notes/actions",()=>({renameNote:api.rename,moveNote:api.move,setNoteAiVisibility:api.visibility}));
vi.mock("next/navigation",()=>({unstable_rethrow:vi.fn()}));
import {NoteRenameForm,NoteMoveForm,NoteVisibilityForm} from "@/components/notes/note-metadata-forms";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
const id="11111111-1111-4111-8111-111111111111",folder="22222222-2222-4222-8222-222222222222";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
async function input(value:string){await act(async()=>{const node=host.querySelector<HTMLInputElement>('input[name="title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("actual inline rename preserves editable B while A saves and does not close B",async()=>{
 let finish!:(value:unknown)=>void;api.rename.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const saved=vi.fn();
 await act(async()=>root.render(<NoteRenameForm noteId={id} revision={3} initialTitle="Original" onSaved={saved} onCancel={vi.fn()}/>));await input("A");await submit();await input("B");
 expect(host.querySelector("input[name=title]")!.matches(":disabled")).toBe(false);
 await act(async()=>finish({saved:true}));expect(host.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("B");expect(saved).not.toHaveBeenCalled();expect(getWorkflowDrafts()).toHaveLength(1);expect(host.textContent).toContain("当前新输入尚未保存");
});
it("rename unknown survives route return with original revision and blocks retry until fresh explicit comparison",async()=>{
 api.rename.mockRejectedValue(new Error("Unknown result"));
 const render=(revision:number)=>root.render(<NoteRenameForm noteId={id} revision={revision} initialTitle="Fresh authority" onSaved={vi.fn()} onCancel={vi.fn()}/>);
 await act(async()=>render(3));await input("Draft title");await submit();const sent=api.rename.mock.calls[0][0] as FormData;
 await act(async()=>root.render(null));await act(async()=>render(9));expect(host.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("Draft title");expect(host.querySelector<HTMLInputElement>('input[name="expected_revision"]')!.value).toBe("3");await submit();expect(api.rename).toHaveBeenCalledOnce();expect(host.querySelector<HTMLInputElement>('[name="request_id"]')!.value).toBe(sent.get("request_id"));api.read.mockResolvedValue({status:"ready",fields:{title:"Canonical current"},baselines:{expected_revision:"9"}});const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent===text)!;await act(async()=>button("读取原记录并比较").click());await submit();expect(api.rename).toHaveBeenCalledOnce();await act(async()=>button("采用比较后的当前版本，保留输入").click());await submit();const retried=api.rename.mock.calls[1][0] as FormData;expect(retried.get("request_id")).not.toBe(sent.get("request_id"));expect(retried.get("expected_revision")).toBe("9");expect(retried.get("title")).toBe("Draft title");
});
it("actual move keeps folder selection across remount and never picks a different unavailable folder",async()=>{
 const render=(folders:Array<{id:string;name:string;parent_id:null}>)=>root.render(<NoteMoveForm noteId={id} revision={3} initialFolderId={null} folders={folders}/>);
 await act(async()=>render([{id:folder,name:"Destination",parent_id:null}]));await act(async()=>{const select=host.querySelector("select")!;select.value=folder;select.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>root.render(null));await act(async()=>render([]));
 expect(host.querySelector("select")!.value).toBe(folder);expect(host.textContent).toContain("不可用");expect(api.move).not.toHaveBeenCalled();
});
it("AI visibility restores unfinished raw selection and clears it only after known action completion",async()=>{
 await act(async()=>root.render(<NoteVisibilityForm noteId={id} visibility="normal"/>));await act(async()=>{const select=host.querySelector("select")!;select.value="never";select.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>root.render(null));await act(async()=>root.render(<NoteVisibilityForm noteId={id} visibility="normal"/>));expect(host.querySelector("select")!.value).toBe("never");api.visibility.mockResolvedValue(undefined);await submit();expect((api.visibility.mock.calls[0][0] as FormData).get("ai_visibility")).toBe("never");expect(getWorkflowDrafts()).toHaveLength(0);
});
