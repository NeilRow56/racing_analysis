import { readFile } from "node:fs/promises";
import { connection, json, save, ROOT, FROM, TO, type Race, type Runner } from "./common";
import { getJumpSpeedRatingsAsOfRuns } from "@/lib/racing/jump-speed-ratings";
import { cacheDirectory } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow } from "@/lib/racing/historical-target-metrics";
const directory=cacheDirectory({outputDir:`${ROOT}/cache`,from:FROM,to:TO,family:"jump",source:"sporting_life"});
const features=(await readFile(`${directory}/features.ndjson`,"utf8")).trim().split("\n").map(l=>JSON.parse(l) as HistoricalPreRaceFeatureRow);
const races=await json<Race[]>(`${ROOT}/database-races.json`), runners=await json<Runner[]>(`${ROOT}/database-runners.json`);
const byRace=new Map(races.map(r=>[r.id,r])), latest=new Map<string,number>();
for(const f of features) latest.set(f.horseId,Math.max(latest.get(f.horseId)??0,Date.parse(String(f.raceDateTime))));
const priorIds=runners.filter(r=>r.result_status!=="non_runner"&&(r.result_status!==null||r.finishing_position!==null)&&byRace.get(r.race_id)!.winning_time?.trim()&&Date.parse(byRace.get(r.race_id)!.at)<(latest.get(r.horse_id)??0)).map(r=>r.id);
const {client,db}=connection();
try {
 await client.unsafe("begin isolation level repeatable read read only");
 console.log(`Auditing ${priorIds.length} distinct historical prior ratings with the unchanged V2 guard`);
 const ratings=await getJumpSpeedRatingsAsOfRuns(db,priorIds,{source:"sporting_life"});
 await save("prior-ratings.json",Object.fromEntries(ratings));
 console.log(JSON.stringify({ratings:ratings.size,withheld:[...ratings.values()].filter(r=>r.method==="withheld").length,missingMinute:[...ratings.values()].filter(r=>r.withheldReason==="LIKELY_MISSING_MINUTE").length}));
 await client.unsafe("commit");
} catch(error) {await client.unsafe("rollback");throw error;} finally{await client.end();}
