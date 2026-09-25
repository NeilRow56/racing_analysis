import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { getSportingLifeEstimatedPricesForDate, type SportingLifeEstimatedPrice } from "@/lib/racing/todays-racing";
import {
  TISSUE_V2_CONFIG,
  loadTissueForward,
  renderTissueTodayReport,
} from "@/lib/racing/tissue-forward";

export async function reportTissueToday(
  path = TISSUE_V2_CONFIG.forwardPath,
  write: (output: string) => void = console.log,
  loadEstimatedPrices: (raceDate: string) => Promise<SportingLifeEstimatedPrice[]> = loadCurrentEstimatedPrices,
): Promise<string> {
  const data = await loadTissueForward(path, TISSUE_V2_CONFIG);
  const latestDate = data.races
    .filter((race) => race.recordedPreRace === true)
    .map((race) => race.raceDate)
    .sort()
    .at(-1);
  let estimatedPrices: SportingLifeEstimatedPrice[] = [];
  if (latestDate) {
    try {
      estimatedPrices = await loadEstimatedPrices(latestDate);
    } catch (error) {
      const code = nestedErrorCode(error);
      console.error(`Sporting Life racecard context unavailable${code ? ` (${code})` : ""}; showing tracker times and missing prices.`);
    }
  }
  const output = renderTissueTodayReport(data, estimatedPrices);
  write(output);
  return output;
}

async function loadCurrentEstimatedPrices(raceDate: string): Promise<SportingLifeEstimatedPrice[]> {
  const connection = createDbConnection();
  try {
    return await getSportingLifeEstimatedPricesForDate(connection.db, raceDate);
  } finally {
    await connection.client.end();
  }
}

function nestedErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? nestedErrorCode(error.cause) : null;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await reportTissueToday();
