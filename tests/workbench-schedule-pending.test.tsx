// @vitest-environment jsdom
import {act,createElement,type ComponentProps} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {OperationScheduleDialog} from "@/components/workbench/operation-schedule-dialog";
import {CalendarWorkspace} from "@/components/calendar/calendar-workspace";
import {WorkspacePanelProvider} from "@/components/layout/workspace-panel-provider";
import type {CalendarFullView} from "@/components/calendar/calendar-full-view";
import {releaseMobileBackLayerForNavigation} from "@/lib/mobile/use-mobile-back-layer";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
const mocks=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),fullView:null as ComponentProps<typeof CalendarFullView>|null}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>"/calendar"}));
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/features/workbench/operation-read-resource",()=>({readCalendarScheduleConflicts:async()=>({events:[]}),readPendingCalendarTasks:async()=>({tasks:[],timezone:"UTC"}),readCalendarTaskForSchedule:vi.fn()}));
vi.mock("@/features/calendar/actions",()=>({createCalendarEvent:mocks.create,readCalendarCreationIntent:mocks.read,readCalendarScheduleConflicts:async()=>({events:[]}),readPendingCalendarTasks:async()=>({tasks:[],timezone:"UTC"}),readCalendarTaskForSchedule:vi.fn(),updateCalendarEvent:vi.fn(),syncAndBackupMicrosoftAction:vi.fn()}));
vi.mock("@/components/calendar/calendar-category-picker",()=>({CalendarCategoryPicker:()=>createElement("input",{type:"hidden",name:"category_choice",value:"__none"})}));
vi.mock("@/components/calendar/calendar-category-manager",()=>({CalendarCategoryManager:()=>null}));
vi.mock("@/components/ai/ai-sidecar",()=>({AISidecar:()=>null}));
vi.mock("@/components/links/entity-backlinks",()=>({EntityBacklinks:()=>null}));
vi.mock("@/components/calendar/calendar-full-view",()=>({CalendarFullView:(props:ComponentProps<typeof CalendarFullView>)=>{mocks.fullView=props;return createElement("main");}}));
vi.mock("@/components/links/entity-mention-textarea",()=>({MentionTextarea:({onChange,...props}:Omit<ComponentProps<"textarea">,"onChange">&{onChange:(value:string)=>void})=>createElement("textarea",{...props,onChange:event=>onChange(event.currentTarget.value)})}));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const intent=(subject="Fixture appointment")=>new CustomEvent("personal-os:calendar-command-preview",{detail:{subject,startsAt:"2030-10-26T09:00:00.000Z",endsAt:"2030-10-26T09:45:00.000Z",timezone:"UTC"}});
let root:Root,host:HTMLDivElement;
const form=()=>document.querySelector<HTMLFormElement>(".calendar-event-form")!;
async function submit(){await act(async()=>form().dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
async function escape(){await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));}
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockReset();mocks.read.mockReset().mockResolvedValue({status:"error",message:"Original result still unknown"});clearWorkspaceResources();sessionStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});window.history.replaceState({__NA:true},"","/calendar");Object.defineProperty(window,"matchMedia",{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{
 // A mounted mobile layer normally calls history.back() on manual unmount.
 // Tests replace the route between cases, so release that history entry first;
 // otherwise its delayed popstate can cancel the next case's create=1 intent.
 releaseMobileBackLayerForNavigation("dialog");
 releaseMobileBackLayerForNavigation("side-panel:inspector");
 const back=vi.spyOn(window.history,"back");
 await act(async()=>root.unmount());
 expect(back).not.toHaveBeenCalled();
 host.remove();clearWorkspaceResources();vi.restoreAllMocks();
});
describe("calendar create containers retain in-flight logical intent",()=>{
 it("vetoes schedule dismissal and replacement while deferred creation runs, then reconciles the same request without redispatch",async()=>{
  const pending=deferred<{status:"error";message:string}>();mocks.create.mockReturnValueOnce(pending.promise);
  await act(async()=>root.render(createElement(OperationScheduleDialog,{initialIntent:intent()})));
  const original=form();await submit();const request=mocks.create.mock.calls[0][1].get("request_id");expect(request).toMatch(/^[0-9a-f-]{36}$/);
  await escape();expect(form()).toBe(original);expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
  await act(async()=>document.body.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true,button:0})));
  expect(form()).toBe(original);
  await act(async()=>root.render(createElement(OperationScheduleDialog,{initialIntent:intent("Replacement must wait")})));
  expect(form()).toBe(original);expect(form().querySelector<HTMLInputElement>('[name="subject"]')!.value).toBe("Fixture appointment");
  await submit();expect(mocks.create).toHaveBeenCalledTimes(1);
  await act(async()=>{pending.resolve({status:"error",message:"Result unavailable"});await pending.promise;});
  await submit();expect(mocks.create).toHaveBeenCalledTimes(1);expect(mocks.read).toHaveBeenCalledOnce();expect(mocks.read.mock.calls[0][0].get("request_id")).toBe(request);expect(mocks.read.mock.calls[0][0].get("subject")).toBe("Fixture appointment");
 });
 it("restores the phone Back marker while creation is pending",async()=>{
  Object.defineProperty(window,"matchMedia",{configurable:true,value:(query:string)=>({matches:query.includes("max-width"),addEventListener(){},removeEventListener(){}})});
  const pending=deferred<{status:"error";message:string}>();mocks.create.mockReturnValue(pending.promise);
  await act(async()=>root.render(createElement(OperationScheduleDialog,{initialIntent:intent()})));
  await submit();const original=form(),marker=window.history.state.__personalOsMobileLayer;expect(marker).toMatch(/^dialog:/);
  const traversed=new Promise<void>(resolve=>window.addEventListener("popstate",()=>resolve(),{once:true}));
  await act(async()=>{window.history.back();await traversed;});
  expect(form()).toBe(original);expect(window.history.state.__personalOsMobileLayer).toBe(marker);expect(mocks.create).toHaveBeenCalledTimes(1);
  await act(async()=>{pending.resolve({status:"error",message:"Not saved"});await pending.promise;});
 });
 it("keeps the Calendar inspector form mounted against close, Escape and another range or event",async()=>{
  const pending=deferred<{status:"error";message:string}>();mocks.create.mockReturnValue(pending.promise);
  await act(async()=>root.render(createElement(WorkspacePanelProvider,null,createElement(CalendarWorkspace,{events:[],categories:[],timezone:"UTC",syncStatus:null,scopeReady:true,initialCreateOpen:true}))));
  await vi.waitFor(async()=>{await act(async()=>{});expect(form()).not.toBeNull();});
  await act(async()=>form().querySelector<HTMLInputElement>('[name="subject"]')!.value="Inspector fixture");
  const original=form();await submit();
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="关闭新建日程"]')!.click());await escape();
  await act(async()=>mocks.fullView!.onCreate({startsAt:"2030-11-01T09:00:00Z",endsAt:"2030-11-01T10:00:00Z",isAllDay:false}));
  await act(async()=>mocks.fullView!.onOpen({id:"fixture-event",provider_event_id:"fixture-provider",subject:"Other event",body_text:null,starts_at:"2030-11-01T09:00:00Z",ends_at:"2030-11-01T10:00:00Z",is_all_day:false,location_name:null,categories:[],importance:"normal",show_as:"busy",last_synced_at:"2030-11-01T00:00:00Z"}));
  expect(form()).toBe(original);expect(mocks.create).toHaveBeenCalledTimes(1);
  await act(async()=>{pending.resolve({status:"error",message:"Not saved"});await pending.promise;});
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="关闭新建日程"]')!.click());expect(form()).toBeNull();
 });
});
