import { settleSelection, settledWinValue } from "./backtest";
import { isVoidSettlementOutcome } from "./settlement-outcome";
import type { HistoricalTargetRunnerMetricsRow as HistoricalRow, HistoricalPostRaceOutcome } from "./historical-target-metrics";
import { classifyHandicapStatus } from "./research-rule";
import { normalizeCompleteMarket, valueCompetitionRanks } from "./tissue-value-metrics";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import type { TissueForwardData, FrozenTissueModel } from "./tissue-forward";

// Explicit stored feature sources only. No tissue scoring, fitting or reconstruction.
export const RESEARCH_MODELS = [
  { id: "latestSpeedRating", name: "Latest Speed" },
  { id: "latestPerformanceRating", name: "Latest Performance" },
  { id: "latestTodaysRating", name: "Latest Today's Rating" },
  { id: "bestSpeedLast3", name: "Best L3 Speed" },
  { id: "bestPerformanceLast3", name: "Best L3 Performance" },
  { id: "bestTodaysRatingLast3", name: "Best L3 Today's Rating" },
  { id: "turf-v3", name: "Turf Tissue V3" },
] as const;
export type ResearchModelId = typeof RESEARCH_MODELS[number]["id"];
export type ModelObservation = {
  key: string; raceId: string; date: string; row?: HistoricalRow;
  value: number; rank: number; probability: number | null;
  outcome: HistoricalPostRaceOutcome; fieldSize: number | null;
  handicap: string; subtype: string; market: number | null;
};
export const observationKey = (raceId: string, runnerId: string) => `${raceId}:${runnerId}`;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export function validSp(outcome: HistoricalPostRaceOutcome): number | null {
  const sp = outcome.startingPriceDecimal === null ? NaN : Number(outcome.startingPriceDecimal);
  return Number.isFinite(sp) && sp > 1 ? sp : null;
}

/** Complete actual starter fields only; never normalize a selected subset. */
export function normalizedSpMarkets(rows: HistoricalRow[]): Map<string, number> {
  const races = new Map<string, HistoricalRow[]>();
  for (const row of rows) {
    if (isVoidSettlementOutcome(row.outcome)) continue;
    const id = row.features.targetRaceId;
    const field = races.get(id) ?? [];
    field.push(row); races.set(id, field);
  }
  const markets = new Map<string, number>();
  for (const field of races.values()) {
    const count = field[0].features.actualRunnerCount;
    if (!count || count < 2 || field.length !== count ||
      new Set(field.map(r => r.features.targetRunnerId)).size !== count ||
      field.some(r => r.features.actualRunnerCount !== count || validSp(r.outcome) === null || settledWinValue(r.outcome) === null) ||
      !field.some(r => settledWinValue(r.outcome) === true)) continue;
    const normalized = normalizeCompleteMarket(field.map(r => validSp(r.outcome)));
    if (!normalized) continue;
    field.forEach((r, index) => markets.set(observationKey(r.features.targetRaceId, r.features.targetRunnerId), normalized.probabilities[index]));
  }
  return markets;
}

export function cachedModelObservations(rows: HistoricalRow[], model: Exclude<ResearchModelId, "turf-v3">, market = normalizedSpMarkets(rows)): ModelObservation[] {
  const fields = new Map<string, HistoricalRow[]>();
  for (const r of rows) {
    if (isVoidSettlementOutcome(r.outcome) || !finite(r.features[model])) continue;
    const field = fields.get(r.features.targetRaceId) ?? [];
    field.push(r); fields.set(r.features.targetRaceId, field);
  }
  const observations: ModelObservation[] = [];
  for (const field of fields.values()) {
    field.sort((a, b) => b.features[model]! - a.features[model]!);
    let rank = 1;
    field.forEach((r, i) => {
      if (i && r.features[model] !== field[i - 1].features[model]) rank = i + 1;
      const key = observationKey(r.features.targetRaceId, r.features.targetRunnerId);
      observations.push({ key, raceId: r.features.targetRaceId, date: r.features.raceDate, row: r,
        value: r.features[model]!, rank, probability: null, outcome: r.outcome,
        fieldSize: r.features.actualRunnerCount, handicap: classifyHandicapStatus(r.features),
        subtype: r.features.raceCode === "jump" ? classifyJumpRaceSubtype(r.features) ?? "unknown" : "flat",
        market: market.get(key) ?? null });
    });
  }
  return observations;
}

/** Accept only captured V3 semantics, matching frozen artifact and pre-race cutoff. */
export function storedTissueObservations(data: TissueForwardData, model: Pick<FrozenTissueModel, "version" | "checksum" | "trainedAt" | "trainingWindow">, rows: HistoricalRow[]) {
  const historical = new Map(rows.map(r => [observationKey(r.features.targetRaceId, r.features.targetRunnerId), r]));
  const markets = normalizedSpMarkets(rows);
  const observations: ModelObservation[] = [];
  let excludedRaces = 0;
  const raceCounts = new Map<string, number>();
  for (const race of data.races) raceCounts.set(race.raceId, (raceCounts.get(race.raceId) ?? 0) + 1);
  for (const race of data.races) {
    const recorded = Date.parse(race.recordedAt);
    const cutoff = Date.parse(race.featureCutoffAt ?? "");
    // Race times are British local times, including daylight saving time.
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Number.isFinite(recorded) ? recorded : 0));
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    const localCapture = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    if (raceCounts.get(race.raceId) !== 1 || !/^\d{2}:\d{2}/.test(race.raceTime) ||
      !Number.isFinite(Date.parse(model.trainedAt)) || !Number.isFinite(Date.parse(model.trainingWindow.to)) || race.recordedPreRace !== true || race.tissueModelVersion !== "tissue_model_v3" ||
      race.tissueModelVersion !== model.version || race.tissueModelChecksum !== model.checksum ||
      race.liveSemanticsVersion !== "TURF_TISSUE_V3_PRERACE" || !Number.isFinite(recorded) || !Number.isFinite(cutoff) ||
      cutoff > recorded || recorded < Date.parse(model.trainedAt) || race.raceDate <= model.trainingWindow.to ||
      localCapture >= `${race.raceDate}T${race.raceTime.slice(0, 5)}` ||
      race.runners.length < 2 || new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length ||
      race.runners.some(r => !finite(r.probability) || r.probability <= 0 || r.probability > 1) ||
      Math.abs(race.runners.reduce((sum, r) => sum + r.probability, 0) - 1) > 0.001) {
      excludedRaces++; continue;
    }
    // The V3 capture contract stores the complete declared active field. Only use
    // ledger SP if every captured runner has a final valid result and price.
    // A withdrawal/missing result invalidates this field rather than being inferred.
    const completeLedger = race.settledAt !== null && race.runners.every(r => settledWinValue({ finishingPosition: r.finishingPosition, resultStatus: r.resultStatus ?? (r.finishingPosition !== null ? "finished" : null), won: null }) !== null && finite(r.finalSp) && r.finalSp > 1);
    const ledgerMarket = completeLedger ? normalizeCompleteMarket(race.runners.map(r => r.finalSp)) : null;
    const ranks = valueCompetitionRanks(race.runners.map(r => r.probability));
    const winners = race.runners.filter(r => r.finishingPosition === 1).length;
    for (const [index, runner] of race.runners.entries()) {
      const key = observationKey(race.raceId, runner.runnerId);
      const row = historical.get(key);
      const outcome: HistoricalPostRaceOutcome = {
        targetRaceId: race.raceId, targetRunnerId: runner.runnerId,
        finishingPosition: runner.finishingPosition, resultStatus: runner.resultStatus ?? (runner.finishingPosition !== null ? "finished" : null),
        won: runner.finishingPosition === null ? null : runner.finishingPosition === 1, placed: null,
        startingPrice: null, startingPriceDecimal: finite(runner.finalSp) ? String(runner.finalSp) : null,
        deadHeatDivisor: runner.finishingPosition === 1 ? Math.max(1, winners) : 1,
      };
      observations.push({ key, raceId: race.raceId, date: race.raceDate, row,
        value: runner.probability, probability: runner.probability,
        rank: ranks[index],
        outcome, fieldSize: row?.features.actualRunnerCount ?? (completeLedger ? race.runners.length : null),
        handicap: row ? classifyHandicapStatus(row.features) : classifyHandicapStatus({ raceName: race.raceName, raceType: null, raceTypeCode: null }),
        subtype: "flat", market: ledgerMarket?.probabilities[index] ?? markets.get(key) ?? null });
    }
  }
  return { observations, excludedRaces };
}

export function coverage(rows: ModelObservation[]) {
  const dates = rows.map(r => r.date).sort();
  return { runners: rows.length, races: new Set(rows.map(r => r.raceId)).size, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
export function matchedPopulation(models: ModelObservation[][]): Set<string> {
  const sets = models.map(rows => new Set(rows.map(r => r.key)));
  return new Set([...(sets[0] ?? [])].filter(key => sets.every(s => s.has(key))));
}
export type HistoricalPeriod = { from: string; to: string };
export function inPeriod(row: ModelObservation, period: HistoricalPeriod) { return row.date >= period.from && row.date <= period.to; }
export function evidenceLabel(date: string) {
  return date.startsWith("2025") ? "2025 development evidence" : date.startsWith("2026") ? "2026 exploratory / previously used evidence" : "Historical exploratory evidence";
}
export function selectObservations(rows: ModelObservation[], options: { period: HistoricalPeriod; population?: Set<string>; rankMax?: number; edgeMin?: number; advancedKeys?: Set<string> }) {
  return rows.filter(r => inPeriod(r, options.period) && (!options.population || options.population.has(r.key)) &&
    (!options.advancedKeys || options.advancedKeys.has(r.key)) && (options.rankMax === undefined || r.rank <= options.rankMax) &&
    (options.edgeMin === undefined || (r.probability !== null && r.market !== null && (r.probability - r.market) * 100 >= options.edgeMin)));
}
export function summarizeModel(rows: ModelObservation[]) {
  const settled = rows.flatMap(r => {
    const settlement = validSp(r.outcome) === null ? null : settleSelection(r.outcome);
    return settlement ? [{ r, settlement }] : [];
  });
  const benchmark = settled.filter(({ r }) => r.market !== null);
  const expected = benchmark.reduce((sum, { r }) => sum + r.market!, 0);
  const wins = settled.filter(({ r }) => settledWinValue(r.outcome)).length;
  const benchmarkWins = benchmark.reduce((sum, { r }) => sum + (settledWinValue(r.outcome) ? 1 / (r.outcome.deadHeatDivisor ?? 1) : 0), 0);
  const profit = settled.reduce((sum, { settlement }) => sum + settlement.profitLoss, 0);
  return { ...coverage(rows), settled: settled.length, wins, strikeRate: settled.length ? wins / settled.length * 100 : null,
    profit, roi: settled.length ? profit / settled.length * 100 : null,
    expected: benchmark.length ? expected : null, ae: expected ? benchmarkWins / expected : null,
    benchmarkRunners: benchmark.length, missingSettlement: rows.length - settled.length, missingMarket: rows.length - benchmark.length };
}
export type ModelSummary = ReturnType<typeof summarizeModel>;
export function modelBreakdowns(rows: ModelObservation[], supportsEdge: boolean) {
  const definitions: { name: string; group: (r: ModelObservation) => string }[] = [
    { name: "Historical period", group: r => `${r.date.slice(0, 4)} Q${Math.ceil(Number(r.date.slice(5, 7)) / 3)} · ${evidenceLabel(r.date)}` },
    { name: "Handicap versus non-handicap", group: r => r.handicap },
    { name: "Hurdle versus chase", group: r => r.subtype },
    { name: "Field-size ranges", group: r => r.fieldSize === null ? "Missing" : r.fieldSize <= 7 ? "2–7" : r.fieldSize <= 11 ? "8–11" : r.fieldSize <= 15 ? "12–15" : "16+" },
    { name: "Historical SP bands (decimal)", group: r => { const sp = validSp(r.outcome); return sp === null ? "Missing" : sp <= 3 ? "(1, 3]" : sp <= 6 ? "(3, 6]" : sp <= 11 ? "(6, 11]" : sp <= 21 ? "(11, 21]" : "21+"; } },
    { name: "Model rank", group: r => r.rank <= 3 ? String(r.rank) : r.rank <= 6 ? "4–6" : "7+" },
  ];
  if (supportsEdge) definitions.push({ name: "Predicted edge versus normalized SP (percentage points, retrospective)", group: r => r.market === null || r.probability === null ? "Missing" : r.probability < r.market ? "Negative" : (r.probability - r.market) < 0.05 ? "0–<5pp" : "5pp+" });
  return definitions.map(({ name, group }) => {
    const groups = new Map<string, ModelObservation[]>();
    for (const row of rows) { const key = group(row); const list = groups.get(key) ?? []; list.push(row); groups.set(key, list); }
    return { name, rows: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, ...summarizeModel(items) })) };
  });
}
