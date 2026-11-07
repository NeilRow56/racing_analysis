import { readFile, writeFile } from "node:fs/promises";
import { hurdleV3Checksum, validateHurdleV3Model, HURDLE_V3_CHALLENGER_PATH, type HurdleV3ChallengerModel } from "../src/lib/racing/hurdle-v3-challenger-model";

const source=process.argv[2]??"/tmp/hurdle-v3-rebuild/challenger-draft.json",destination=process.argv[3]??HURDLE_V3_CHALLENGER_PATH;
const draft=JSON.parse(await readFile(source,"utf8")) as Omit<HurdleV3ChallengerModel,"checksum">;
const artifact=validateHurdleV3Model({...draft,checksum:hurdleV3Checksum(draft)}),text=JSON.stringify(artifact,null,2)+"\n";
try{await writeFile(destination,text,{flag:"wx"});}
catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST"||await readFile(destination,"utf8")!==text)throw error;}
console.log(JSON.stringify({version:artifact.version,status:artifact.status,checksum:artifact.checksum,destination,productionPromotion:false}));
