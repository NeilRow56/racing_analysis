import { CANDIDATE_FEATURES, type CandidateFeature, type analyzeCandidateRace } from "./jump-candidate-eligibility";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { settleSelection } from "./backtest";
import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";

export const JUMP_EXPLORATORY_SOURCE = "jump-2026-reconstructed";
export const JUMP_EXPLORATORY_LABEL = "Jump 2026 — Reconstructed Exploratory";
export const JUMP_EXPLORATORY_WARNING = "Reconstructed exploratory evidence. Historical publication-time provenance is incomplete. Results are not an independent holdout.";
export const isJumpExploratorySource = (params: URLSearchParams) => params.get("cmpSource") === JUMP_EXPLORATORY_SOURCE;
export const EXPLORATORY_FEATURE_OPTIONS: { value: CandidateFeature | "outcomeSP"; label: string }[] = [
  { value: "outcomeSP", label: "Historical outcome / SP analysis" },
  ...CANDIDATE_FEATURES.map(value => ({ value, label: value.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).replace("Todays", "Today's").replace("Last3", "L3").replace("Last5", "L5") })),
];
export const SP_BANDS = ["all", "(1,3]", "(3,6]", "(6,11]", "(11,21]", ">21"] as const;
export type ExploratoryOptions = {
  feature: CandidateFeature | "outcomeSP"; from: string; to: string;
  min?: number; max?: number; rankMax?: number; leadMin?: number; startersMin?: number; startersMax?: number;
  spBand: typeof SP_BANDS[number]; compare2025: boolean; errors: string[];
};
export function parseExploratoryOptions(params: URLSearchParams): ExploratoryOptions {
  const errors: string[] = [];
  const feature = EXPLORATORY_FEATURE_OPTIONS.find(f => f.value === params.get("jumpFeature"))?.value ?? "outcomeSP";
  if (params.has("jumpFeature") && !EXPLORATORY_FEATURE_OPTIONS.some(f => f.value === params.get("jumpFeature"))) errors.push("Unsupported analysis feature.");
  const date = (key: string, fallback: string) => {
    const value = params.get(key) ?? fallback;
    if (!/^2026-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < "2026-01-01" || value > "2026-10-14") errors.push("Dates must be valid and within 1 January–14 October 2026.");
    return value;
  };
  const numeric = (key: string, integer = false) => {
    const raw = params.get(key); if (!raw?.trim()) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || integer && (!Number.isInteger(n) || n < 1)) { errors.push(`Invalid ${key} value.`); return undefined; }
    return n;
  };
  const result: ExploratoryOptions = { feature, from: date("jumpFrom", "2026-01-01"), to: date("jumpTo", "2026-10-14"),
    min: numeric("jumpMin"), max: numeric("jumpMax"), rankMax: numeric("jumpRankMax", true), leadMin: numeric("jumpLeadMin"),
    startersMin: numeric("jumpStartersMin", true), startersMax: numeric("jumpStartersMax", true),
    spBand: SP_BANDS.find(b => b === params.get("jumpSPBand")) ?? "all", compare2025: params.get("jumpCompare2025") === "yes", errors };
  if (params.has("jumpSPBand") && !SP_BANDS.some(b => b === params.get("jumpSPBand"))) errors.push("Unsupported retrospective SP band.");
  if (result.from > result.to) errors.push("From date must precede to date.");
  if (result.min !== undefined && result.max !== undefined && result.min > result.max) errors.push("Minimum feature value must not exceed maximum.");
  if (result.startersMin !== undefined && result.startersMax !== undefined && result.startersMin > result.startersMax) errors.push("Minimum starter count must not exceed maximum.");
  if (feature === "outcomeSP" && [result.min, result.max, result.rankMax, result.leadMin].some(v => v !== undefined)) errors.push("Outcome/SP analysis does not support rating or rank criteria. Clear them to continue.");
  result.errors = [...new Set(errors)];
  return result;
}
export type ExploratoryRace = ReturnType<typeof analyzeCandidateRace>;
export type ExploratoryObservation = ExploratoryRace["observations"][number];
export function inSPBand(price: number | null, band: ExploratoryOptions["spBand"]) {
  if (band === "all") return true;
  if (price === null) return false;
  return band === "(1,3]" ? price <= 3 : band === "(3,6]" ? price > 3 && price <= 6 : band === "(6,11]" ? price > 6 && price <= 11 : band === "(11,21]" ? price > 11 && price <= 21 : price > 21;
}
export function exploratoryEligibilityText(feature: ExploratoryOptions["feature"]) {
  if (feature === "outcomeSP") return "Source-backed canonical Settlement V3 and valid final decimal SP; no rating requirement. Final SP is retrospective settlement evidence only.";
  if (feature === "officialRating") return "Finite recorded target Official Rating with verified target source evidence. Whole-race ranks additionally require every verified starter's eligible value.";
  if (feature === "priorRuns" || feature === "daysSinceLastRun") return "Finite requested history metric, source evidence and no definite untimed, uncertain or hidden last-three history dependencies. Recorded history depth does not prove real-world completeness.";
  return "Finite requested rating and recorded rated history, with all definite untimed, uncertain, hidden last-three, last-three context and wider historical context exclusions retained. Other rating families are not required. Whole-race ranks and leads require a complete eligible comparison field.";
}
export function summarizeExploratory(rows: readonly ExploratoryObservation[]) {
  const settled = rows.filter(o => o.settlement !== null);
  const winners = settled.filter(o => o.outcomeState === "win");
  const benchmark = settled.filter(o => o.normalizedSPProbability !== null);
  const expected = benchmark.reduce((sum, o) => sum + o.normalizedSPProbability!, 0);
  const actualShares = benchmark.reduce((sum, o) => sum + (o.outcomeState === "win" && o.historicalSP ? o.settlement!.grossReturn / o.historicalSP : 0), 0);
  const profit = settled.reduce((sum, o) => sum + o.settlement!.profitLoss, 0);
  return { runners: rows.length, races: new Set(rows.map(o => o.raceId)).size, settled: settled.length, wins: winners.length,
    profit, roi: settled.length ? profit / settled.length * 100 : null, expected: benchmark.length ? expected : null,
    ae: expected > 0 ? actualShares / expected : null, benchmarkRunners: benchmark.length, missingMarket: settled.length - benchmark.length,
    settlementVersion: CANONICAL_SETTLEMENT_VERSION };
}

/** Input is already ranked/benchmarked by Phase 1 on full races. Never re-rank selections. */
export function evaluateJumpExploratory(races: readonly ExploratoryRace[], options: ExploratoryOptions) {
  const scoped = races.filter(r => r.observations[0]?.date >= options.from && r.observations[0]?.date <= options.to);
  const raw = scoped.flatMap(r => r.observations), settled = raw.filter(o => o.settlement);
  const featureEligible = settled.filter(o => options.feature === "outcomeSP" || o.eligibility.eligible);
  const reasons: Record<string, number> = {};
  const settlementReasons: Record<string, number> = {};
  for (const o of raw.filter(o => !o.settlement)) for (const reason of o.settlementExclusions) settlementReasons[reason] = (settlementReasons[reason] ?? 0) + 1;
  if (options.feature !== "outcomeSP") for (const o of settled) for (const reason of o.eligibility.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  const selected: (ExploratoryObservation & { lead: number | null })[] = [];
  let rankUnavailable = 0, starterUnavailable = 0, criteriaExcluded = 0;
  for (const race of scoped) {
    // Leads are computed against all independently verified eligible starters.
    const values = race.completeComparisonField ? race.observations.filter(o => o.rank.wholeFieldRank !== null).map(o => ({ id: o.runnerId, value: o.value! })) : [];
    for (const o of race.observations) {
      if (!o.settlement || options.feature !== "outcomeSP" && !o.eligibility.eligible) continue;
      const others = values.filter(v => v.id !== o.runnerId);
      const lead = others.length && o.value !== null ? o.value - Math.max(...others.map(v => v.value)) : null;
      if ((options.rankMax !== undefined && o.rank.wholeFieldRank === null) || (options.leadMin !== undefined && lead === null)) { rankUnavailable++; continue; }
      if ((options.startersMin !== undefined || options.startersMax !== undefined) && race.field.verifiedStarterCount === null) { starterUnavailable++; continue; }
      const count = race.field.verifiedStarterCount;
      if ((options.min !== undefined && (o.value === null || o.value < options.min)) || (options.max !== undefined && (o.value === null || o.value > options.max))
        || (options.rankMax !== undefined && o.rank.wholeFieldRank! > options.rankMax) || (options.leadMin !== undefined && lead! < options.leadMin)
        || (options.startersMin !== undefined && count! < options.startersMin) || (options.startersMax !== undefined && count! > options.startersMax)
        || !inSPBand(o.historicalSP, options.spBand)) { criteriaExcluded++; continue; }
      if (!options.errors.length) selected.push({ ...o, lead });
    }
  }
  return {
    options, summary: summarizeExploratory(selected), selected,
    coverage: { runners: raw.length, races: scoped.length, settled: settled.length, settlementExcluded: raw.length - settled.length,
      usableBeforeCriteria: featureEligible.length, featureExcluded: settled.length - featureEligible.length,
      rankUnavailable, starterUnavailable, criteriaExcluded, exclusionsByReason: reasons, settlementExclusionsByReason: settlementReasons,
      completeComparisonFields: options.feature === "outcomeSP" ? null : scoped.filter(r => r.completeComparisonField).length,
      partialComparisonFields: options.feature === "outcomeSP" ? null : scoped.filter(r => !r.completeComparisonField && r.observations.some(o => o.rank.status === "partial_field_diagnostic")).length,
      unavailableComparisonFields: options.feature === "outcomeSP" ? null : scoped.filter(r => r.observations.every(o => o.rank.status === "unavailable")).length,
      validMarketFields: scoped.filter(r => r.market.valid).length, validMarketObservations: raw.filter(o => o.normalizedSPProbability !== null).length,
    },
  };
}
export function canCompareExploratory2025(options: ExploratoryOptions) {
  return options.feature === "outcomeSP" && !options.errors.length && [options.min, options.max, options.rankMax, options.leadMin, options.startersMin, options.startersMax].every(v => v === undefined);
}
/** Only outcome/SP definitions can match 2025 without a matching rating sidecar.
 * Require explicit terminal source evidence; no unknown race stage is promoted. */
export function compare2025Outcomes(rows: HistoricalTargetRunnerMetricsRow[], options: ExploratoryOptions) {
  if (!canCompareExploratory2025(options)) return null;
  const from = options.from.replace("2026", "2025"), to = options.to.replace("2026", "2025");
  const scoped = rows.filter(r => r.features.raceDate >= from && r.features.raceDate <= to && r.features.raceCode === "jump");
  const sourceVerified = scoped.filter(r => r.outcome.raceStage && ["WEIGHEDIN", "OFFICIAL", "COMPLETED"].includes(r.outcome.raceStage));
  const settled = sourceVerified.flatMap(r => { const s = settleSelection(r.outcome); return s ? [{ r, s }] : []; });
  const selected = settled.filter(({ r }) => inSPBand(Number(r.outcome.startingPriceDecimal), options.spBand));
  const profit = selected.reduce((sum, r) => sum + r.s.profitLoss, 0);
  return { from, to, runners: scoped.length, races: new Set(scoped.map(r => r.features.targetRaceId)).size,
    usable: settled.length, exclusions: scoped.length - settled.length, criteriaExcluded: settled.length - selected.length,
    unverifiedSource: scoped.length - sourceVerified.length, selected: selected.length, selectedRaces: new Set(selected.map(({ r }) => r.features.targetRaceId)).size,
    wins: selected.filter(r => r.r.outcome.finishingPosition === 1).length, profit, roi: selected.length ? profit / selected.length * 100 : null };
}
