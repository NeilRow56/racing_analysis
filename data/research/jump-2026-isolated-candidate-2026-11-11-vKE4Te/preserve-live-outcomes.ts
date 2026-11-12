import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ROOT, json, save } from "./common";
const digest=(bytes:string|Buffer)=>createHash("sha256").update(bytes).digest("hex");
const before=await json<Record<string,string>>(`${ROOT}/preservation-before.json`);
const result=await json<{filesChecked:number;changed:{path:string;expected:string;actual:string}[]}>(`${ROOT}/preservation-after.json`);
const snapshot=(await json<{server:{snapshot_at:string}[]}>(`${ROOT}/prebuild.json`)).server[0].snapshot_at;
const verification=[];
for(const change of result.changed){
 assert.ok(["data/research/context-weight-shadow-v1.json","data/research/tissue-generation-forward-2026-11.json"].includes(change.path));
 const bytes=await readFile(change.path,"utf8");const data:unknown=JSON.parse(bytes);let additions=0;
 function originalProjection(value:unknown):unknown {
  if(Array.isArray(value))return value.map(originalProjection);
  if(value!==null&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>{
   if(key==="outcome"&&item!==null&&typeof item==="object"&&"settledAt" in item&&typeof item.settledAt==="string"&&Date.parse(item.settledAt)>Date.parse(snapshot)){additions++;return [key,null];}
   return [key,originalProjection(item)];
  }));
  return value;
 }
 const original=JSON.stringify(originalProjection(data),null,2)+"\n";
 const verified=digest(original)===before[change.path];
 const evidence=`${ROOT}/${change.path.split("/").at(-1)}.original.txt`;
 await writeFile(`${ROOT}/${change.path.split("/").at(-1)}.observed-current.txt`,bytes,{flag:"wx"});
 if(verified)await writeFile(evidence,original,{flag:"wx"});
 verification.push({...change,observedCurrentDigest:digest(bytes),newOutcomes:additions,originalDigest:digest(original),verifiedOutcomeOnly:verified,originalEvidence:verified?evidence:null});
 assert.ok(verified,`Cannot establish frozen capture preservation for ${change.path}`);
}
await save("preservation-live-outcomes.json",{baselineSnapshot:snapshot,filesChecked:result.filesChecked,byteExact:result.filesChecked-result.changed.length,changed:verification,
 explanation:"Task connections were read-only and no collection/settlement workflow was invoked. Concurrent external outcomes are retained in live files. Removing only their newly timed outcomes in memory exactly reconstructs each starting SHA-256, proving unchanged captures, prior outcomes, prices, inputs, identities and record counts. Original digests were not replaced."});
console.log(JSON.stringify(verification,null,2));
