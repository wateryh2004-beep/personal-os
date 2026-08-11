import type { PersonalOsModuleId } from "../kernel/types";
export type AssistantSkill = { id:string; name:string; description:string; activateWhen:string[]; avoidWhen?:string[]; suggestedModules:PersonalOsModuleId[]; instructions:string; maxSources?:number };
