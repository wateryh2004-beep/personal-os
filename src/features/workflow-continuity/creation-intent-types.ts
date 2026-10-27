import type {DraftFields} from "./draft-contracts";
export type OrdinaryCreationOutcome={status:"saved";id:string;savedFields?:DraftFields}|{status:"missing"|"needs-check";message:string}|{status:"rejected";code:"invalid"|"conflict"|"unavailable";message:string};
