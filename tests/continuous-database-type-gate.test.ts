import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("hard-fails both original omitted core fields and nullable/default/argument/FK/return/catalog counterexamples",()=>{
 const output=JSON.parse(execFileSync(process.execPath,["scripts/check-continuous-type-gate.mjs"],{encoding:"utf8"}));expect(output).toEqual({syntheticOnly:true,nativePostgresExecuted:false,cases:17,expectedFailures:14,allExpected:true});
 const report=JSON.parse(readFileSync("test-results/continuous-workflows-postgres/author-static-type-gate/results.json","utf8"));expect(report.generationIsActual).toBe(false);
 for(const name of ["coreTableMismatch","coreRpcMismatch","nullableRowMismatch","insertDefaultOptionalMismatch","rpcArgumentMismatch","rpcDefaultOptionalMismatch","fkMismatch","enumMismatch","catalogNullable","catalogJsonNullable","catalogDefault","catalogRpcDefault","catalogFk","catalogTrigger"])expect(report.cases.find((row:{name:string})=>row.name===name)).toMatchObject({passed:false,expectedPass:false});
 for(const name of ["baseline","compositeReturnInline","unionOrderEquivalent"])expect(report.cases.find((row:{name:string})=>row.name===name)).toMatchObject({passed:true,expectedPass:true});
});
