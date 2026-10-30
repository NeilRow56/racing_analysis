import { buildProspectiveTissueSources } from "./tissue-prospective-sources";
import { attachChaseSpeedState, loadChaseSpeedSnapshots, type ChaseSpeedSnapshot } from "./chase-speed-reliability-capture";
import { loadTissueForward, ACTIVE_TURF_TISSUE_CONFIG } from "./tissue-forward";
import { loadAwV2Forward } from "./aw-tissue-v2";
import { loadJumpTissueForward } from "./jump-tissue-forward";
import { loadAllTissueValue } from "./tissue-value-readers";
import { loadHurdleRecency, type HurdleRecencyData } from "./hurdle-recency-forward";
import { AW_VALUE_CONFIG, HURDLE_VALUE_CONFIG } from "./tissue-value-config";
import { descendingRanks } from "./descending-ranks";
import { summarizeWinterResearch, type WinterObservation } from "./winter-research";

type Input = Parameters<typeof buildProspectiveTissueSources>[0];
type FrozenBook = {
  scheduledOff: string; featureNames: readonly string[];
  runners: readonly { runnerId: string; modelInputs?: readonly number[] | null }[];
};

/** Read-only projections from each owning frozen book; no historical reconstruction. */
export function buildWinterResearchSources(input: Input, snapshots: ChaseSpeedSnapshot[], recency: HurdleRecencyData) {
  const source = buildProspectiveTissueSources(input);
  const books = new Map<string, FrozenBook>();
  for (const [data, names] of [[input.aw, AW_VALUE_CONFIG.featureNames], [input.jump, HURDLE_VALUE_CONFIG.featureNames]] as const) {
    for (const race of data.races) books.set(`primary|${race.raceId}|${race.recordedAt}`, {
      scheduledOff: race.scheduledOffAt, featureNames: names, runners: race.runners,
    });
  }
  for (const { data } of input.cohorts) for (const race of data.races) books.set(`price|${race.raceId}|${race.capturedAt}`, race);
  const recencyByRunner = new Map(recency.observations.map(r => [`${r.raceId}|${r.runnerId}`, r]));
  const enrich = (rows: typeof source.observations, cohort: "primary" | "price"): WinterObservation[] =>
    attachChaseSpeedState(rows, snapshots, cohort).filter(r => r.family !== "TURF").map(row => {
      const book = books.get(`${cohort}|${row.raceId}|${row.capturedAt}`);
      if (!book) throw new Error("Winter research observation has no owning frozen book");
      const value = (runner: FrozenBook["runners"][number], name: string) => {
        const i = book.featureNames.indexOf(name), missing = book.featureNames.indexOf(`${name}_missing`);
        if (i < 0 || !runner.modelInputs || runner.modelInputs.length !== book.featureNames.length ||
          missing < 0 || runner.modelInputs[missing] !== 0 || !Number.isFinite(runner.modelInputs[i])) return null;
        return runner.modelInputs[i];
      };
      const runner = book.runners.find(r => r.runnerId === row.runnerId);
      const handicap = runner ? value(runner, "handicap") : null;
      const earlier = row.family === "HURDLE" ? recencyByRunner.get(`${row.raceId}|${row.runnerId}`) : undefined;
      // A later snapshot cannot classify an earlier Tissue capture, even on the same day.
      const eligible = earlier && row.capturedAt && earlier.firstCapturedAt <= row.capturedAt &&
        earlier.firstCapturedAt < earlier.scheduledOff && earlier.firstCapturedAt < book.scheduledOff;
      return { ...row, scheduledOff: book.scheduledOff,
        handicapFrozen: handicap === 0 ? false : handicap === 1 ? true : null,
        orFrozen: descendingRanks(book.runners, r => value(r, "official_rating")).get(row.runnerId!) ?? null,
        recency: eligible ? { flags: earlier.flags, features: earlier.features } : null,
      };
    });
  return { observations: enrich(source.observations, "primary"), priceObservations: enrich(source.priceObservations, "price"),
    quarantined: source.quarantined, unresolvedResults: source.unresolvedResults };
}

export async function loadWinterResearch() {
  const [turf, aw, jump, cohorts, snapshots, recency] = await Promise.all([
    loadTissueForward(ACTIVE_TURF_TISSUE_CONFIG.forwardPath, ACTIVE_TURF_TISSUE_CONFIG),
    loadAwV2Forward(), loadJumpTissueForward(), loadAllTissueValue(), loadChaseSpeedSnapshots(), loadHurdleRecency(),
  ]);
  const source = buildWinterResearchSources({ turf, aw, jump, cohorts }, snapshots, recency);
  return { summary: summarizeWinterResearch(source.observations, source.priceObservations), quarantined: source.quarantined };
}
