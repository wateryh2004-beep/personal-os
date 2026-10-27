import {beforeEach,expect,it,vi} from "vitest";
const model=vi.hoisted(()=>vi.fn());vi.mock("ai",()=>({generateObject:model}));vi.mock("@/lib/ai/deepseek",()=>({getDeepSeekModel:async()=>({model:{}})}));
import {classifyInboxItem} from "@/features/inbox/classify";
type Client=Parameters<typeof classifyInboxItem>[0]["supabase"];
const owner="11111111-1111-4111-8111-111111111111", id="22222222-2222-4222-8222-222222222222";
let body:string,token:string|null,processed:boolean,status:string,claimed:boolean;
let calls:Array<{name:string;args:Record<string,unknown>}>;
function client(){return {from:(table:string)=>{const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,maybeSingle:async()=>({data:table==="profiles"?{timezone:"UTC"}:{id,content_markdown:body,processed_at:processed?"now":null}}),then:(resolve:(value:unknown)=>void)=>Promise.resolve({data:[]}).then(resolve)};return query;},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});if(name==="claim_inbox_classification"){if(!claimed)return{data:false,error:null};token=String(args.p_token);return{data:true,error:null};}const success=args.p_token===token&&args.p_expected_content===body&&!processed;if(success)status=args.p_error?"failed":"ready";return{data:success,error:null};}} as unknown as Client;}
beforeEach(()=>{body="Original body";token=null;processed=false;status="unclassified";claimed=true;calls=[];model.mockReset();});
it("late old success cannot overwrite a newer classification with a new token and exact source",async()=>{
 let release!:(value:unknown)=>void;model.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));const db=client();const old=classifyInboxItem({supabase:db,userId:owner,inboxId:id});await vi.waitFor(()=>expect(model).toHaveBeenCalledTimes(1));
 body="New body";model.mockResolvedValueOnce({object:{target:"daily",confidence:0.8}});expect((await classifyInboxItem({supabase:db,userId:owner,inboxId:id,explicitRestart:true})).status).toBe("ready");
 release({object:{target:"note",confidence:0.8,title:"Old title",bodyMarkdown:"Old output"}});expect((await old).status).toBe("superseded");expect(status).toBe("ready");
 const commits=calls.filter(call=>call.name==="commit_inbox_classification");expect(commits[0].args.p_expected_content).toBe("New body");expect(commits[1].args.p_expected_content).toBe("Original body");expect(commits[0].args.p_token).not.toBe(commits[1].args.p_token);
});
it("late failure after processing also fails CAS and never exposes the provider error",async()=>{
 let reject!:(value:unknown)=>void;model.mockImplementation(()=>new Promise((_,failure)=>{reject=failure;}));const pending=classifyInboxItem({supabase:client(),userId:owner,inboxId:id});await vi.waitFor(()=>expect(model).toHaveBeenCalled());processed=true;reject(new Error("PRIVATE_PROVIDER_CREDENTIAL"));const result=await pending;expect(result.status).toBe("superseded");expect(JSON.stringify(result)).not.toContain("PRIVATE_");expect(calls.at(-1)?.args.p_error).toBe("classification_failed");expect(status).toBe("unclassified");
});
it("does not call the model unless its classification claim really succeeded",async()=>{claimed=false;expect((await classifyInboxItem({supabase:client(),userId:owner,inboxId:id})).status).toBe("superseded");expect(model).not.toHaveBeenCalled();expect(calls).toHaveLength(1);});
