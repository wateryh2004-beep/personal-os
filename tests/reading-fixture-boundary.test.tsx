// @vitest-environment jsdom
import{act,useEffect}from"react";
import{createRoot}from"react-dom/client";
import{expect,it,vi,afterEach}from"vitest";
const gate=vi.hoisted(()=>({allowed:false}));
vi.mock("@/features/testing/continuous-fixture-gate",()=>({assertContinuousFixtureTransport:(value:unknown)=>{if(value!==undefined&&!gate.allowed)throw Error("fixture_transport_forbidden");}}));
import{ReadingVerificationProvider,useReadingVerificationTransport}from"@/features/files/reading-verification-context";
const read=vi.fn(async()=>null),save=vi.fn(async()=>({status:"source_changed"as const}));
let root:ReturnType<typeof createRoot>|undefined,host:HTMLDivElement|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());host?.remove();root=undefined;gate.allowed=false;vi.clearAllMocks();});
it("ordinary builds reject reading transport overrides before read/save",()=>{expect(()=>ReadingVerificationProvider({transport:{read,save},children:null})).toThrow("fixture_transport_forbidden");expect(read).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();});
it("selected fixture consumers receive only the two narrow original reading action signatures",async()=>{gate.allowed=true;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});function Reader(){const transport=useReadingVerificationTransport();useEffect(()=>{void transport?.read("e4000000-0000-4000-8000-000000000001");void transport?.save({documentId:"e4000000-0000-4000-8000-000000000001",sourceVersion:"e4000000-0000-4000-8000-000000000099",page:2,totalPages:3,expectedRevision:1,mutationId:"e4000000-0000-4000-8000-000000000088"});},[transport]);return null;}host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root!.render(<ReadingVerificationProvider transport={{read,save}}><Reader/></ReadingVerificationProvider>));expect(read).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:1,page:2}));});
