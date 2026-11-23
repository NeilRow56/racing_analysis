import { EPOCHS } from "./prospective-epoch-config";
import { loadEpochManifest } from "./prospective-epoch-integrity";
import { loadTissueGeneration, type GenerationData, type GenerationRace } from "./tissue-generation-forward";
import { loadPositiveNeutral, matchingPositiveNeutralCapture, type PositiveNeutralData, type PositiveNeutralSelection } from "./tissue-positive-neutral";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamilyFilter, type ValueOutcome } from "./tissue-value-metrics";

type Candidate = { selection: PositiveNeutralSelection; outcome: ValueOutcome | null };

function metrics(candidates: Candidate[]) {
  let settled = 0, winners = 0, marketWinners = 0, marketExpected = 0, priced = 0, profit = 0;
  for (const { selection, outcome } of candidates) {
    if (outcome?.status !== "settled") continue;
    const won = outcome.winner === true;
    settled++;
    winners += Number(won);

    const { marketProbability, price } = selection;
    if (marketProbability !== null && Number.isFinite(marketProbability) && marketProbability > 0 && marketProbability <= 1) {
      marketExpected += marketProbability;
      marketWinners += Number(won);
    }
    if (price !== null && Number.isFinite(price) && price > 1 && outcome.profitLoss !== null && Number.isFinite(outcome.profitLoss)) {
      priced++;
      profit += outcome.profitLoss;
    }
  }
  return {
    captured: candidates.length,
    settled,
    winners,
    strikeRate: settled ? winners / settled : null,
    expectedWinners: marketExpected > 0 ? marketExpected : null,
    actualExpected: marketExpected > 0 ? marketWinners / marketExpected : null,
    priced,
    profitLoss: priced ? profit : null,
    roi: priced ? profit / priced : null,
  };
}

export function summarizeCurrentPositiveNeutral(data: PositiveNeutralData, generation: GenerationData) {
  const booksByRace = new Map<string, GenerationRace[]>();
  for (const book of generation.races) {
    const books = booksByRace.get(book.raceId);
    if (books) books.push(book);
    else booksByRace.set(book.raceId, [book]);
  }
  // The validated epoch ledger holds one observation per race and one selection per runner.
  // Distinct runners sharing a frozen Tissue rank remain distinct candidates.
  const candidates = data.observations.flatMap(observation => {
    const book = matchingPositiveNeutralCapture(observation, booksByRace.get(observation.raceId) ?? []);
    return observation.selections
      .filter(selection => selection.badgeState === "POSITIVE" || selection.badgeState === "NEUTRAL")
      .map(selection => ({
        family: observation.family,
        selection,
        outcome: book?.runners.find(runner => runner.runnerId === selection.runnerId)?.outcome ?? null,
      }));
  });
  const families: TissueValueFamilyFilter[] = ["ALL", ...TISSUE_VALUE_FAMILIES];
  return ([1, 2] as const).map(rank => ({
    rank,
    rows: families.map(family => ({
      family,
      ...metrics(candidates.filter(candidate =>
        candidate.selection.tissueRank === rank && (family === "ALL" || candidate.family === family))),
    })),
  }));
}

export async function loadCurrentPositiveNeutralSummary(generation?: GenerationData) {
  const [manifest, data, production] = await Promise.all([
    loadEpochManifest(),
    loadPositiveNeutral(EPOCHS.positiveNeutral.ledger),
    generation ?? loadTissueGeneration(),
  ]);
  if (!manifest || !data || data.armedAt !== manifest.activatedAt) return null;
  return summarizeCurrentPositiveNeutral(data, production);
}
