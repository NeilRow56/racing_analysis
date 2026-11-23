/** Read-only prediction replay for the frozen four-family research policies. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { PROFITABILITY_FIRST_V1, predictProfitabilityFirstV1, profitabilityAbstain } from "../src/lib/racing/profitability-first-model";
import { loadTissueGeneration } from "../src/lib/racing/tissue-generation-forward";
import { loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";

export async function replayProfitabilityFirst(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args], options: { date: { type: "string" }, "race-id": { type: "string" }, ledger: { type: "string" } },
  });
  const { date, "race-id": raceId, ledger } = values;
  if (!date && !raceId) throw new Error("Provide --date YYYY-MM-DD or --race-id ID.");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected --date YYYY-MM-DD.");
  const [data, models] = await Promise.all([loadTissueGeneration(ledger), loadTissueGenerationModels()]);
  const books = latestPreOffCaptures(data.races.filter(book => (!date || book.raceDate === date) && (!raceId || book.raceId === raceId)));
  const predictions = books.toSorted((a, b) => a.scheduledOff.localeCompare(b.scheduledOff))
    .map(book => predictProfitabilityFirstV1(models[book.family], book));
  if (!predictions.length) predictions.push({ capture: null, decisions: profitabilityAbstain("no-matching-capture") });
  return { mode: "captured-preoff-replay", definition: PROFITABILITY_FIRST_V1, predictions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await replayProfitabilityFirst(process.argv.slice(2)), null, 2));
}
