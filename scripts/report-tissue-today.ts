import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { getSportingLifeCurrentPricesForDate, type SportingLifeCurrentPrice } from "@/lib/racing/todays-racing";
import {
  TISSUE_V2_CONFIG,
  loadTissueForward,
  renderTissueTodayReport,
} from "@/lib/racing/tissue-forward";

export async function reportTissueToday(
  path = TISSUE_V2_CONFIG.forwardPath,
  write: (output: string) => void = console.log,
  loadCurrentPrices: (raceDate: string) => Promise<SportingLifeCurrentPrice[]> = loadCurrentMarketPrices,
): Promise<string> {
  const data = await loadTissueForward(path, TISSUE_V2_CONFIG);
  const latestDate = data.races
    .filter((race) => race.recordedPreRace === true)
    .map((race) => race.raceDate)
    .sort()
    .at(-1);
  let currentPrices: SportingLifeCurrentPrice[] = [];
  let currentRaceIds: Set<string> | undefined;
  if (latestDate) {
    try {
      currentPrices = await loadCurrentPrices(latestDate);
      currentRaceIds = new Set(currentPrices.map((price) => price.raceId));
    } catch (error) {
      const code = nestedErrorCode(error);
      console.error(`Sporting Life racecard context unavailable${code ? ` (${code})` : ""}; showing tracker times and missing prices.`);
    }
  }
  const output = renderTissueTodayReport(data, currentPrices, { currentRaceIds });
  write(output);
  return output;
}

async function loadCurrentMarketPrices(raceDate: string): Promise<SportingLifeCurrentPrice[]> {
  const connection = createDbConnection();
  try {
    return await getSportingLifeCurrentPricesForDate(connection.db, raceDate);
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
