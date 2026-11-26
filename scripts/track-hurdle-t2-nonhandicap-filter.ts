import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadVerifiedFinalSpResults } from "@/lib/racing/hurdle-final-sp";
import {
  armHurdleT2Filter, captureHurdleT2Filter, loadHurdleT2Filter, pendingHurdleT2Filter,
  settleHurdleT2Filter, summarizeHurdleT2Filter,
} from "@/lib/racing/hurdle-t2-nonhandicap-filter";
import { loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { getLocalRacingDate } from "@/lib/racing/todays-racing";

export async function main([action = "summary", sinceText, ...extra]: string[]) {
  if (extra.length || !["init", "summary", "capture", "settle"].includes(action) ||
      (action === "capture") !== (sinceText !== undefined)) throw new Error("Use init, summary, settle, or capture <current collection start>");
  const data = action === "init" ? await armHurdleT2Filter() : await loadHurdleT2Filter();
  if (!data) {
    if (action !== "summary") throw new Error("Hurdle T2 filter is unarmed");
    console.log("Hurdle T2 filter is unarmed");
    return;
  }
  let updated = data;
  if (action === "capture") {
    const since = new Date(sinceText ?? "");
    const now = new Date();
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== getLocalRacingDate(now))
      throw new Error("Capture requires the start of today's collection run");
    updated = (await captureHurdleT2Filter((await loadTissueGeneration()).races, since)) ?? data;
  } else if (action === "settle" && pendingHurdleT2Filter(data).length) {
    const { races } = await loadTissueGeneration();
    const pending = new Map(pendingHurdleT2Filter(data).map(r => [r.raceId, r]));
    const spRaceIds = races.filter(book => {
      const row = pending.get(book.raceId);
      return row?.sourceCapturedAt === book.capturedAt &&
        book.runners.some(r => r.runnerId === row.t2.runnerId && r.outcome?.status === "settled");
    }).map(book => book.raceId);
    const results = await loadVerifiedFinalSpResults(spRaceIds);
    updated = (await settleHurdleT2Filter(races, results)) ?? data;
  }
  console.log(JSON.stringify({ armedAt: updated.armedAt, ...summarizeHurdleT2Filter(updated) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
