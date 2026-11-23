/** Read-only local replay from the existing frozen capture ledger. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { AW_V3_NO_SAME_OR_T2, predictAwV3NoSameOrT2 } from "../src/lib/racing/aw-v3-no-same-or-t2";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { loadTissueGeneration } from "../src/lib/racing/tissue-generation-forward";
import { loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";

export async function replayAwV3NoSameOrT2(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args], options: { date: { type: "string" }, "race-id": { type: "string" }, ledger: { type: "string" } },
  });
  const { date, "race-id": raceId, ledger } = values;
  if (!date && !raceId) throw new Error("Provide --date YYYY-MM-DD or --race-id ID.");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected --date YYYY-MM-DD.");

  const [data, models] = await Promise.all([loadTissueGeneration(ledger), loadTissueGenerationModels()]);
  const books = latestPreOffCaptures(data.races.filter(book =>
    (raceId || book.family === "AW") && (!raceId || book.raceId === raceId) && (!date || book.raceDate === date)));
  const decisions = books.toSorted((a, b) => a.scheduledOff.localeCompare(b.scheduledOff))
    .map(book => predictAwV3NoSameOrT2(models.AW, book));
  if (!decisions.length) return { mode: "frozen-replay", model: AW_V3_NO_SAME_OR_T2, status: "no-selection", reason: "no-matching-capture" };
  return { mode: "frozen-replay", model: AW_V3_NO_SAME_OR_T2, decisions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await replayAwV3NoSameOrT2(process.argv.slice(2)), null, 2));
}
