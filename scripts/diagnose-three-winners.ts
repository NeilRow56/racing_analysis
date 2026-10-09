import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { getDatabaseEnv } from "../src/lib/env";
import { canonicalFamilyFormMetrics, getTargetRunnerMetricsForDate } from "../src/lib/racing/horse-metrics";
import { getTrainerPriorMetricsForTargets, getJockeyPriorMetricsForTargets } from "../src/lib/racing/trainer-quality";
import { getGoingFormForTargets } from "../src/lib/racing/going-form";
import { classifyCurrentRaceFamily } from "../src/lib/racing/current-race-classification";
import { attachTurfPerformanceRatings, getSportingLifeCurrentCardRaceStatuses, parseSportingLifeBookmakerQuotes, summarizeTodayMarketPrice, type SportingLifeCurrentCardRaceStatuses, type TodayRace, type TodayRunner, type TodayMeeting } from "../src/lib/racing/todays-racing";
import { attachJumpRaceRatings } from "../src/lib/racing/jump-performance-rating";
import { attachAwRaceRatings } from "../src/lib/racing/aw-performance-rating";
import { getTurfSpeedRatingsForRunners } from "../src/lib/racing/turf-speed-ratings";
import { getJumpSpeedRatingsAsOfRuns } from "../src/lib/racing/jump-speed-ratings";
import { getAwSpeedRatingsAsOfRuns } from "../src/lib/racing/aw-speed-ratings";
import { listSavedResearchRulesWithDb } from "../src/lib/racing/saved-research-rules";
import { attachFrozenRuleMatchesToToday } from "../src/lib/racing/today-rule-matches";
import { getTrainerCohortForRule } from "../src/lib/racing/trainer-cohorts";
import { parseResearchRule, hasStartingPriceCondition } from "../src/lib/racing/research-rule";
import { currentTissueRankOneEdge } from "../src/lib/racing/tissue-rank-one-edge";

const { races, raceRunners, horses, courses, trainers, jockeys, sourceImports } = schema;
const NAMES = ["Ballygeary", "Stanage", "State Express"] as const;
const REPORT_MD = "/tmp/three-winner-case-study.md";
const REPORT_JSON = "/tmp/three-winner-case-study.json";
type RecordValue = Record<string, unknown>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

export function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function array(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function string(value: unknown): string | null { return typeof value === "string" ? value : null; }
export function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function before(value: unknown, cutoff: Date): boolean {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date !== null && Number.isFinite(date.getTime()) && date.getTime() < cutoff.getTime();
}
export function cleanCapture(value: RecordValue, cutoff: Date): boolean {
  return value.recordedPreRace === true && before(value.recordedAt, cutoff);
}
export function rank(value: number | null, values: Array<number | null>, ascending = false): number | null {
  if (value === null) return null;
  return 1 + values.filter((v) => v !== null && (ascending ? v < value : v > value)).length;
}
export function parseOptions(args: string[]): { date: string; validate: boolean } {
  let date = "2026-10-08";
  let validate = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--validate") validate = true;
    else if (args[i] === "--date" && args[i + 1]) date = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid --date; use YYYY-MM-DD");
  return { date, validate };
}

// These are original forward capture ledgers, never substitutes for database history.
const LEDGERS = [
  "tissue-forward-v2.json", "jump-rating-forward-v1.json", "jump-tissue-forward-v1.json",
  "aw-rating-forward-v1.json", "aw-tissue-forward-v1.json", "forward-value-v1.json",
  "tpr-vs-timewise-forward.json", "aw-forward-comparisons.json", "aw-tissue-parity-shadow-forward-v1.json",
] as const;
type Ledger = { file: string; sha256: string | null; entries: RecordValue[]; status: string };
async function loadLedgers(): Promise<Ledger[]> {
  const output: Ledger[] = [];
  for (const file of LEDGERS) {
    try {
      const raw = await readFile(resolve("data/research", file), "utf8");
      const data = record(JSON.parse(raw));
      const entries = data.races ?? data.records;
      if (!Array.isArray(entries)) throw new Error(`Invalid forward ledger structure: ${file}`);
      output.push({ file, sha256: createHash("sha256").update(raw).digest("hex"), entries: array(entries), status: "read original forward ledger" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      output.push({ file, sha256: null, entries: [], status: "missing; selection status unknown" });
    }
  }
  return output;
}
type ModelEvidence = { system: string; rank: number | null; probability: number | null; source: string; capturedAt: string; eligible: boolean; details: RecordValue };
type PriceEvidence = { decimal: number; probability: number; capturedAt: string; source: string; quoteCount: number | null };
type Selection = { system: string; source: string; capturedAt: string; reason: string };

export type TargetMatch = { raceId: string; runnerId: string; name: string };
export function canonicalTargetMatches(targets: TargetMatch[], statuses: Pick<SportingLifeCurrentCardRaceStatuses, "supersededRaceIds">): TargetMatch[] {
  return targets.filter((target) => !statuses.supersededRaceIds.has(target.raceId));
}

export type FieldValidationRunner = {
  runnerId: string;
  name: string;
  resultStatus: string | null;
  finishingPosition?: number | null;
  optionalUnavailable?: string[];
};
export type FieldValidation = {
  ok: boolean;
  declaredField: number | null;
  activeRunnerCount: number;
  actualStarterCount: number;
  dbDeclaredRunnerCount: number | null;
  dbActualRunnerCount: number | null;
  reconstructedRunnerRows: number;
  excludedNonRunners: string[];
  unavailableOptionalFeatures: Array<{ runner: string; features: string[] }>;
  diagnostics: string[];
};
function isNonRunnerStatus(status: string | null): boolean {
  return status?.toLowerCase() === "non_runner";
}
export function validateReconstructedField(input: {
  raceName: string;
  dbDeclaredRunnerCount: number | null;
  dbActualRunnerCount: number | null;
  racecardRideCount: number | null;
  resultRideCount: number | null;
  runners: FieldValidationRunner[];
  reconciliation?: Pick<SportingLifeCurrentCardRaceStatuses, "version" | "diagnostics">;
}): FieldValidation {
  const active = input.runners.filter((runner) => !isNonRunnerStatus(runner.resultStatus));
  const nonRunners = input.runners.filter((runner) => isNonRunnerStatus(runner.resultStatus));
  const declaredField = input.racecardRideCount ?? (
    input.dbActualRunnerCount === input.runners.length && nonRunners.length > 0
      ? input.dbActualRunnerCount
      : input.dbDeclaredRunnerCount
  );
  const starterCount = input.resultRideCount ?? active.length;
  const diagnostics: string[] = [];
  const unavailableOptionalFeatures = input.runners
    .map((runner) => ({ runner: runner.name, features: runner.optionalUnavailable ?? [] }))
    .filter((entry) => entry.features.length > 0);

  if (input.reconciliation?.diagnostics.some((diagnostic) => diagnostic.status === "ambiguous")) {
    diagnostics.push(`${input.reconciliation.version}: duplicate/superseded racecard ambiguity remains unresolved`);
  }
  if (declaredField !== null && declaredField !== active.length) {
    if (declaredField === input.runners.length && declaredField - active.length === nonRunners.length && nonRunners.length > 0) {
      diagnostics.push(`Declared field: ${declaredField}; active reconstructed runners: ${active.length}; Excluded genuine NR: ${nonRunners.map((runner) => runner.name).join(", ")}`);
    } else {
      diagnostics.push(`Field reconstruction incomplete for ${input.raceName}: declared field ${declaredField}, active reconstructed runners ${active.length}, excluded NRs ${nonRunners.length}`);
    }
  }
  if (starterCount !== active.length) {
    diagnostics.push(`Starter count mismatch for ${input.raceName}: result starters ${starterCount}, active reconstructed runners ${active.length}`);
  }
  if (input.dbActualRunnerCount !== null && input.dbActualRunnerCount !== active.length) {
    if (input.dbActualRunnerCount === input.runners.length && nonRunners.length > 0) {
      diagnostics.push(`DB actual_runner_count ${input.dbActualRunnerCount} matches total race rows including NRs, not active starters`);
    } else {
      diagnostics.push(`DB actual_runner_count ${input.dbActualRunnerCount} is not explained by active runners ${active.length}`);
    }
  }
  for (const entry of unavailableOptionalFeatures) {
    diagnostics.push(`Optional feature unavailable for ${entry.runner}: ${entry.features.join(", ")}`);
  }

  const hasUnresolvedCountFailure = diagnostics.some((message) =>
    /incomplete|Starter count mismatch|not explained|ambiguity remains unresolved/.test(message)
  );
  return {
    ok: !hasUnresolvedCountFailure,
    declaredField,
    activeRunnerCount: active.length,
    actualStarterCount: starterCount,
    dbDeclaredRunnerCount: input.dbDeclaredRunnerCount,
    dbActualRunnerCount: input.dbActualRunnerCount,
    reconstructedRunnerRows: input.runners.length,
    excludedNonRunners: nonRunners.map((runner) => runner.name),
    unavailableOptionalFeatures,
    diagnostics,
  };
}

export function ledgerEvidence(ledgers: Ledger[], raceId: string, runnerId: string, name: string, cutoff: Date) {
  const models: ModelEvidence[] = [];
  const prices: PriceEvidence[] = [];
  const selections: Selection[] = [];
  const audit: Array<{ source: string; status: string }> = [];
  const addModel = (system: string, value: unknown, probability: unknown, entry: RecordValue, file: string, eligible = true, details: RecordValue = {}) => {
    const r = number(value);
    const p = number(probability);
    if (p !== null && (p <= 0 || p > 1)) throw new Error(`Invalid probability in ${file}`);
    if (r !== null && (!Number.isInteger(r) || r < 1)) throw new Error(`Invalid rank in ${file}`);
    models.push({ system, rank: r, probability: p, source: file, capturedAt: String(entry.recordedAt), eligible, details });
    if (r === 1 && eligible) selections.push({ system, source: file, capturedAt: String(entry.recordedAt), reason: "frozen rank 1" });
  };
  const addPrice = (snapshot: RecordValue, source: string) => {
    const quoteCount = number(snapshot.bookmakerQuoteCount);
    const verifiedBookmakerBasis = snapshot.medianBookmakerPriceDecimal !== undefined || (snapshot.marketPriceBasisVersion === "median_bookmaker_v1" && quoteCount !== null && quoteCount > 0);
    if (!verifiedBookmakerBasis) return;
    const decimal = number(snapshot.medianBookmakerPriceDecimal ?? snapshot.decimalPrice);
    if (decimal !== null && decimal > 1 && before(snapshot.capturedAt, cutoff)) prices.push({ decimal, probability: 1 / decimal, capturedAt: String(snapshot.capturedAt), source, quoteCount: number(snapshot.bookmakerQuoteCount) });
  };
  for (const ledger of ledgers) {
    const entries = ledger.entries.filter((e) => e.raceId === raceId || e.raceKey === raceId);
    audit.push({ source: ledger.file, status: entries.length ? `${entries.length} matching capture(s)` : ledger.status === "read original forward ledger" ? "no matching race; does not prove no selection" : ledger.status });
    for (const originalEntry of entries) {
      const entry = ledger.file === "aw-tissue-parity-shadow-forward-v1.json"
        ? { ...originalEntry, recordedAt: originalEntry.capturedAt, recordedPreRace: originalEntry.captureMode === "live_sync" && before(originalEntry.v1RecordedAt, cutoff) }
        : originalEntry;
      if (!cleanCapture(entry, cutoff)) { audit.push({ source: ledger.file, status: "excluded: absent/invalid pre-race timestamp or flag" }); continue; }
      const runner = array(entry.runners).find((r) => r.runnerId === runnerId);
      if (ledger.file === "tissue-forward-v2.json" && runner) addModel("Turf Tissue v2", runner.tissueRank, runner.probability, entry, ledger.file, true, { commentFeatures: runner.commentFeatures, checksum: entry.tissueModelChecksum });
      if (ledger.file === "jump-rating-forward-v1.json" && runner) {
        addModel("JPR-A", runner.jprARank, null, entry, ledger.file, entry.jprARankEligible !== false && entry.ratingCoverageStatus !== "insufficient_coverage", { score: runner.jprAScore, components: runner.components });
        addModel("JPR-B", runner.jprBRank, null, entry, ledger.file, true, { score: runner.jprBScore, components: runner.components });
        if (runner.jprA0Rank !== undefined) addModel("JPR-A0", runner.jprA0Rank, null, entry, ledger.file, true, { ratingSource: runner.jprA0RatingSource });
      }
      if (ledger.file === "aw-rating-forward-v1.json" && runner) {
        addModel("AW-D", runner.awDRank, null, entry, ledger.file, entry.awDRankEligible !== false && entry.ratingCoverageStatus !== "insufficient_coverage", { score: runner.awDScore, components: runner.components });
        addModel("AW-A", runner.awARank, null, entry, ledger.file, true, { score: runner.awAScore, components: runner.components });
      }
      if (["jump-tissue-forward-v1.json", "aw-tissue-forward-v1.json"].includes(ledger.file) && runner) {
        const system = ledger.file.startsWith("jump") ? "Jump Tissue" : ledger.file.includes("shadow") ? "AW Tissue parity shadow" : "AW Tissue";
        addModel(system, runner.rank, runner.probability, entry, ledger.file, !entry.excludedReason, { rawInputs: runner.rawInputs, commentProvenance: runner.commentProvenance, hash: entry.modelHash });
        if (entry.top1 === runnerId) for (const [stage, snapshot] of Object.entries(record(entry.prices))) addPrice(record(snapshot), `${ledger.file}:${stage}`);
      }
      if (ledger.file === "aw-tissue-parity-shadow-forward-v1.json" && runner) {
        addModel("AW Tissue parity shadow", runner.candidateRank, runner.candidateProbability, entry, ledger.file, !entry.excludedReason, { candidateInputs: runner.candidateInputs, extras: runner.extras });
      }
      if (ledger.file === "tpr-vs-timewise-forward.json") {
        const input = array(record(entry.tprInputSnapshot).runners).find((r) => r.runnerId === runnerId);
        if (input) {
          addModel("TPR W100", input.w100Rank, null, entry, ledger.file, entry.tprRankEligible !== false && entry.ratingCoverageStatus !== "insufficient_coverage", { input: input.input, rating: input.w100Rating });
          addModel("TPR W50", input.w50Rank, null, entry, ledger.file, true, { rating: input.w50Rating, orLeader: entry.orRank1 });
        } else {
          if (entry.tprRank1 === name && entry.tprRank1NonRunner !== true) addModel("TPR W100", 1, null, entry, ledger.file, entry.tprRankEligible !== false && entry.ratingCoverageStatus !== "insufficient_coverage");
          if (entry.w50Rank1 === name && entry.w50Rank1NonRunner !== true) addModel("TPR W50", 1, null, entry, ledger.file, true, { orLeader: entry.orRank1 });
        }
        if (entry.timewiseRank1 === name && entry.timewiseRecordedPreRace === true && before(entry.timewiseRecordedAt, cutoff)) selections.push({ system: "Timewise", source: ledger.file, capturedAt: String(entry.timewiseRecordedAt), reason: "recorded rank 1" });
      }
      if (ledger.file === "forward-value-v1.json") {
        if (entry.leaderRunnerId === runnerId) {
          addModel(`Forward Value (${entry.ratingVersion})`, 1, entry.calibratedProbability, entry, ledger.file, entry.captureMode === "live_sync" && !entry.phase2ExclusionReason);
          for (const stage of ["early", "t180", "t60", "t15"]) addPrice(record(entry[`${stage}PriceSnapshot`]), `${ledger.file}:${stage}`);
          addPrice({ decimalPrice: entry.medianBookmakerPriceDecimal, capturedAt: entry.priceCapturedAt, bookmakerQuoteCount: entry.bookmakerQuoteCount }, `${ledger.file}:median`);
        }
        if (entry.tissueRunnerId === runnerId) {
          for (const stage of ["Early", "T180", "T60"]) addPrice(record(entry[`tissue${stage}PriceSnapshot`]), `${ledger.file}:tissue${stage}`);
          addPrice({ decimalPrice: entry.tissueMedianBookmakerPriceDecimal, capturedAt: entry.tissuePriceCapturedAt, bookmakerQuoteCount: entry.tissueBookmakerQuoteCount }, `${ledger.file}:tissueMedian`);
        }
      }
      if (ledger.file === "aw-forward-comparisons.json" && entry.runnerKey === runnerId) {
        for (const id of Array.isArray(entry.comparisonIds) ? entry.comparisonIds : []) selections.push({ system: `AW comparison ${id}`, source: ledger.file, capturedAt: String(entry.recordedAt), reason: "frozen comparison membership" });
      }
    }
  }
  return { models, prices, selections, audit };
}

export function positiveTissueSelections(models: ModelEvidence[], price: PriceEvidence | null): Selection[] {
  if (!price) return [];
  return models.filter((m) => /Tissue/.test(m.system) && m.rank === 1 && m.eligible && m.probability !== null).flatMap((m) => {
    const edge = currentTissueRankOneEdge(m.probability, {
      raceId: "diagnostic", runnerId: "diagnostic", marketPrice: String(price.decimal), marketDecimalOdds: price.decimal,
      bookmakerQuoteCount: price.quoteCount ?? 0, forecastPrice: null, forecastDecimalOdds: null, displayRaceTime: "",
    });
    return edge && edge.edge > 0 ? [{ system: `${m.system} positive-edge`, source: `${m.source} + ${price.source}`, capturedAt: m.capturedAt > price.capturedAt ? m.capturedAt : price.capturedAt, reason: "reconstructed existing rank-one positive-edge condition from timestamp-verified captures; display unproven" }] : [];
  });
}

export function commentSignals(comment: string | null): string[] {
  if (!comment) return [];
  const patterns: Array<[string, RegExp]> = [
    ["trouble in running", /hampered|denied.*(?:run|room)|blocked|short of room|checked|not clear run|no clear run|switched/i],
    ["wide", /(?:raced|trapped|forced|carried|caught) wide|wide throughout/i],
    ["slow start", /slowly away|slow(?:ly)? (?:into stride|to start)|dwelt/i],
    ["jumping error", /mistake|not fluent|blunder|jumped poorly/i],
    ["keen", /keen|pulled hard/i],
    ["late progress", /stayed on|ran on|nearest finish|finished well/i],
    ["travelled then weakened", /(?:travelled|traveling|travelling).*(?:weaken|faded|tired)/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(comment)).map(([label]) => label);
}
function classNumber(value: string | null): number | null {
  const match = value?.match(/(?:class\s*)?([1-7])/i);
  return match ? Number(match[1]) : null;
}
const priorSurface = sql<string | null>`(select si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' from source_imports si where si.source = races.source and si.source_id = races.source_id and si.source_type = 'full-result-next-data' limit 1)`;
async function loadPriorRuns(db: Db, horseIds: string[], cutoff: Date) {
  return db.select({
    runnerId: raceRunners.id, horseId: raceRunners.horseId, raceId: races.id, date: races.raceDate, datetime: races.raceDatetime,
    courseId: races.courseId, course: courses.displayName, raceName: races.raceName, raceType: races.raceType,
    raceTypeCode: races.raceTypeCode, class: races.raceClass, distance: races.distance, distanceYards: races.distanceYards,
    going: races.going, surface: priorSurface, position: raceRunners.finishingPosition, status: raceRunners.resultStatus,
    beatenDistance: raceRunners.beatenDistance, beatenDistanceToWinner: raceRunners.beatenDistanceToWinner,
    officialRating: raceRunners.officialRating, weight: raceRunners.weight, weightLbs: raceRunners.weightCarriedLbs,
    rpr: raceRunners.racingPostRating, topspeed: raceRunners.topspeedRating, comment: raceRunners.runnerComment,
  }).from(raceRunners).innerJoin(races, eq(races.id, raceRunners.raceId)).innerJoin(courses, eq(courses.id, races.courseId))
    .where(and(inArray(raceRunners.horseId, horseIds), eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), lt(races.raceDatetime, cutoff), sql`races.winning_time is not null and btrim(races.winning_time) <> ''`, sql`coalesce(race_runners.result_status, '') not in ('non_runner','abandoned','cancelled','canceled','void','void_race','race_void','no_race')`)).orderBy(desc(races.raceDatetime));
}
type Prior = Awaited<ReturnType<typeof loadPriorRuns>>[number] & { speed: number | null; speedDetails: unknown; signals: string[] };
export type FieldRow = {
  runnerId: string; name: string; officialRating: number | null; orRank: number | null;
  market: PriceEvidence | null; marketRank: number | null; marketRankComplete: boolean;
  speed: ReturnType<typeof canonicalFamilyFormMetrics>["speed"] | null;
  speedRanks: { latest: number | null; bestL3: number | null; averageL3: number | null };
  trainer: string | null; jockey: string | null; trainerRank: number | null; jockeyRank: number | null; trainerPrior: TodayRunner["trainerMetrics"]; jockeyPrior: TodayRunner["jockeyMetrics"];
  trainerContext: RecordValue; daysSinceRun: number | null; classMove: string; records: RecordValue;
  recentForm: Array<number | string | null>; priors: Prior[]; metrics: TodayRunner["metrics"]; goingForm: TodayRunner["goingForm"];
  models: ModelEvidence[]; reconstructedModels: RecordValue; selections: Selection[]; ruleMatches: string[]; ruleAudit: RecordValue[];
  signals: string[]; priceComparisons: Array<{ system: string; probability: number; marketProbability: number | null; edgePp: number | null; finalSpProbability: number | null }>;
  outcome: { position: number | null; status: string | null; sp: string | null; spDecimal: number | null; spRank: number | null };
  ledgerAudit: Array<{ source: string; status: string }>;
};
export type Case = { name: string; race: Omit<TodayRace, "runners"> & { course: string; family: string; cutoff: string; metadataProvenance: string; fieldValidation?: FieldValidation }; winner: FieldRow; field: FieldRow[]; comparators: { favourites: string[]; modelLeaders: string[]; secondRanked: string[] }; positives: string[]; hiddenForm: string; missed: string[] };

async function buildCase(db: Db, date: string, target: { raceId: string; runnerId: string; name: string }, ledgers: Ledger[]): Promise<Case> {
  const rows = await db.select({ race: races, runner: raceRunners, horse: horses, course: courses, trainer: trainers.displayName, jockey: jockeys.displayName })
    .from(races).innerJoin(raceRunners, eq(raceRunners.raceId, races.id)).innerJoin(horses, eq(horses.id, raceRunners.horseId))
    .innerJoin(courses, eq(courses.id, races.courseId)).leftJoin(trainers, eq(trainers.id, raceRunners.trainerId)).leftJoin(jockeys, eq(jockeys.id, raceRunners.jockeyId))
    .where(and(eq(races.id, target.raceId), eq(raceRunners.source, "sporting_life")));
  if (!rows.length || !rows[0].race.raceDatetime) throw new Error(`Missing field or race timestamp for ${target.name}`);
  const metadata = rows[0].race;
  const cutoff = metadata.raceDatetime!;
  const imports = await db.select().from(sourceImports).where(and(eq(sourceImports.source, "sporting_life"), eq(sourceImports.sourceId, metadata.sourceId!), inArray(sourceImports.sourceType, ["racecard-next-data", "full-result-next-data"])));
  const card = imports.find((i) => i.sourceType === "racecard-next-data" && before(i.fetchedAt, cutoff));
  const payloadRace = record(record(record(record(card?.payload).props).pageProps).race);
  const summary = record(payloadRace.race_summary);
  const resultImport = imports.find((i) => i.sourceType === "full-result-next-data");
  const resultRace = record(record(record(record(resultImport?.payload).props).pageProps).race);
  const resultSummary = record(resultRace.race_summary);
  const surface = string(record(summary.course_surface).surface) ?? string(record(resultSummary.course_surface).surface);
  const validation = validateReconstructedField({
    raceName: target.name,
    dbDeclaredRunnerCount: metadata.declaredRunnerCount,
    dbActualRunnerCount: metadata.actualRunnerCount,
    racecardRideCount: number(summary.ride_count),
    resultRideCount: number(resultSummary.ride_count),
    runners: rows.map((r) => ({
      runnerId: r.runner.id,
      name: r.horse.displayName,
      resultStatus: r.runner.resultStatus,
      finishingPosition: r.runner.finishingPosition,
      optionalUnavailable: [
        r.runner.trainerId && !r.trainer ? "trainer name" : null,
        r.runner.jockeyId && !r.jockey ? "jockey name" : null,
      ].filter((value): value is string => value !== null),
    })),
  });
  if (!validation.ok) {
    throw new Error(`${target.name} field reconstruction failed: ${validation.diagnostics.join("; ")}`);
  }
  for (const diagnostic of validation.diagnostics) {
    console.log(`${target.name}: ${diagnostic}`);
  }
  const activeRows = rows.filter((r) => r.runner.resultStatus !== "non_runner");
  const ids = activeRows.map((r) => r.runner.id);
  // Load one race at a time: the metric helper's maximum cutoff must equal this race's cutoff.
  const metrics = await getTargetRunnerMetricsForDate(db, date, "sporting_life", { targetRunnerIds: ids, completedPriorRunsOnly: true });
  if (metrics.some((r) => r.target.raceDateTime.getTime() !== cutoff.getTime())) throw new Error("Metric cutoff mismatch");
  const participants = activeRows.map((r) => ({ targetRunnerId: r.runner.id, trainerId: r.runner.trainerId, jockeyId: r.runner.jockeyId, raceDateTime: cutoff }));
  const trainerMetrics = await getTrainerPriorMetricsForTargets(db, participants, "sporting_life");
  const jockeyMetrics = await getJockeyPriorMetricsForTargets(db, participants, "sporting_life");
  let race: TodayRace = {
    raceId: metadata.id, sourceId: metadata.sourceId, scheduledTime: metadata.scheduledTime, raceDateTime: cutoff, courseCountry: rows[0].course.country,
    raceName: metadata.raceName, raceClass: metadata.raceClass, raceType: metadata.raceType, raceTypeCode: metadata.raceTypeCode,
    distance: metadata.distance, distanceYards: metadata.distanceYards, going: metadata.going, surface,
    declaredRunnerCount: metadata.declaredRunnerCount, actualRunnerCount: null, winningTime: null,
    runners: activeRows.map((r): TodayRunner => ({
      runnerId: r.runner.id, runnerSourceId: r.runner.sourceId, horseId: r.horse.id, horseName: r.horse.displayName,
      saddleclothNumber: r.runner.saddleclothNumber, horseAge: r.runner.horseAge, horseSex: r.runner.horseSex, weight: r.runner.weight,
      weightCarriedLbs: r.runner.weightCarriedLbs, draw: r.runner.draw, trainerId: r.runner.trainerId, trainerName: r.trainer,
      jockeyId: r.runner.jockeyId, jockeyName: r.jockey, officialRating: r.runner.officialRating,
      odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null,
      metrics: metrics.find((m) => m.target.runnerId === r.runner.id)?.metrics ?? null,
      trainerMetrics: trainerMetrics.get(r.runner.id), jockeyMetrics: jockeyMetrics.get(r.runner.id),
    })),
  };
  const family = classifyCurrentRaceFamily({ ...race, courseName: rows[0].course.displayName, courseSourceId: rows[0].course.sourceId });
  if (family === "unknown") throw new Error(`Unsupported race family ${family}`);
  const metricFamily = family === "turf_flat" ? "turf" : family === "all_weather_flat" ? "aw" : "jump";
  const going = await getGoingFormForTargets(db, race.runners.map((r) => ({ targetRunnerId: r.runnerId, targetRaceId: race.raceId, horseId: r.horseId, raceDateTime: cutoff, raceFamily: family })), "sporting_life");
  race.runners = race.runners.map((r) => ({ ...r, goingForm: going.get(r.runnerId) }));
  race = attachAwRaceRatings(attachJumpRaceRatings(attachTurfPerformanceRatings(race)));
  const priorRows = await loadPriorRuns(db, activeRows.map((r) => r.horse.id), cutoff);
  if (priorRows.some((r) => !before(r.datetime, cutoff) || r.raceId === target.raceId)) throw new Error("Prior-run chronology violation");
  const priorIds = priorRows.map((r) => r.runnerId);
  const speedRatings = metricFamily === "turf" ? await getTurfSpeedRatingsForRunners(db, priorIds, { source: "sporting_life", calculationCutoffDateTime: cutoff })
    : metricFamily === "jump" ? await getJumpSpeedRatingsAsOfRuns(db, priorIds, { source: "sporting_life" })
      : await getAwSpeedRatingsAsOfRuns(db, priorIds, { source: "sporting_life" });
  const saved = await listSavedResearchRulesWithDb(db);
  const ruleAudit = saved.map((rule) => {
    const parsed = parseResearchRule(JSON.stringify(rule.canonicalRule));
    const valid = rule.status === "frozen" && before(rule.frozenAt, cutoff) && before(rule.updatedAt, cutoff) && parsed !== null && !hasStartingPriceCondition(parsed);
    return { ruleId: rule.id, name: rule.name, eligible: valid, reason: valid ? "pre-race frozen rule; matching reconstructed, actual live selection unproven" : "excluded: draft, later modification/freezing, invalid definition, or final-SP condition" };
  });
  const safeRules = saved.filter((r) => ruleAudit.find((a) => a.ruleId === r.id)?.eligible);
  const cohorts = new Map();
  for (const rule of safeRules) {
    const parsed = parseResearchRule(JSON.stringify(rule.canonicalRule))!;
    cohorts.set(rule.id, await getTrainerCohortForRule(db, parsed, Number(date.slice(0, 4))));
  }
  const meeting: TodayMeeting = { courseId: rows[0].course.id, courseSourceId: rows[0].course.sourceId, courseName: rows[0].course.displayName, country: rows[0].course.country, order: 0, races: [race] };
  race = attachFrozenRuleMatchesToToday([meeting], safeRules, date, cohorts)[0].races[0];
  const field: FieldRow[] = [];
  for (const runner of race.runners) {
    const original = activeRows.find((r) => r.runner.id === runner.runnerId)!;
    const evidence = ledgerEvidence(ledgers, race.raceId, runner.runnerId, runner.horseName, cutoff);
    const ride = array(payloadRace.rides).find((r) => String(record(r.ride_reference).id) === runner.runnerSourceId);
    const quotes = parseSportingLifeBookmakerQuotes(ride?.bookmakerOdds);
    const median = summarizeTodayMarketPrice({ bookmakerQuotes: quotes }).medianDecimalOdds;
    if (card && median !== null) evidence.prices.push({ decimal: median, probability: 1 / median, capturedAt: card.fetchedAt.toISOString(), source: "DB source_imports: pre-race racecard bookmaker median", quoteCount: quotes.length });
    const market = evidence.prices.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))[0] ?? null;
    const priors: Prior[] = priorRows.filter((p) => p.horseId === runner.horseId).map((p) => ({ ...p, speed: speedRatings.get(p.runnerId)?.rating ?? null, speedDetails: speedRatings.get(p.runnerId) ?? null, signals: commentSignals(p.comment) }));
    const trainerContextRows = runner.trainerId ? await db.select({ datetime: races.raceDatetime, courseId: races.courseId, position: raceRunners.finishingPosition }).from(raceRunners).innerJoin(races, eq(races.id, raceRunners.raceId)).where(and(eq(raceRunners.trainerId, runner.trainerId), eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), lt(races.raceDatetime, cutoff), sql`races.winning_time is not null and btrim(races.winning_time) <> ''`, sql`coalesce(race_runners.result_status, '') not in ('non_runner','abandoned','cancelled','canceled','void','void_race','race_void','no_race')`)) : [];
    const recent = trainerContextRows.filter((r) => r.datetime && r.datetime.getTime() >= cutoff.getTime() - 14 * 86400000);
    const courseRuns = trainerContextRows.filter((r) => r.courseId === original.course.id);
    const stats = (list: Array<{ position: number | null }>) => ({ runs: list.length, wins: list.filter((r) => r.position === 1).length, rate: list.length ? list.filter((r) => r.position === 1).length / list.length * 100 : null });
    const recentStats = stats(recent);
    const baseline = stats(trainerContextRows);
    const form = runner.metrics ? canonicalFamilyFormMetrics(runner.metrics, metricFamily).speed : null;
    const lastClass = classNumber(priors[0]?.class ?? null);
    const currentClass = classNumber(race.raceClass);
    const recordOf = (list: Prior[]) => stats(list);
    field.push({
      runnerId: runner.runnerId, name: runner.horseName, officialRating: runner.officialRating, orRank: null, market, marketRank: null, marketRankComplete: false,
      speed: form, speedRanks: { latest: null, bestL3: null, averageL3: null }, trainer: runner.trainerName, jockey: runner.jockeyName, trainerRank: null, jockeyRank: null,
      trainerPrior: runner.trainerMetrics, jockeyPrior: runner.jockeyMetrics,
      trainerContext: { baseline, previous14Days: recentStats, recentMinusBaselinePp: recentStats.rate !== null && baseline.rate !== null ? recentStats.rate - baseline.rate : null, course: stats(courseRuns) },
      daysSinceRun: runner.metrics?.daysSinceLastRun ?? null,
      classMove: lastClass === null || currentClass === null ? "unknown" : currentClass > lastClass ? `drop: class ${lastClass} to ${currentClass}` : currentClass < lastClass ? `rise: class ${lastClass} to ${currentClass}` : "same class",
      records: { course: recordOf(priors.filter((p) => p.courseId === original.course.id)), exactDistance: recordOf(priors.filter((p) => p.distanceYards === race.distanceYards && race.distanceYards !== null)), exactGoing: recordOf(priors.filter((p) => p.going === race.going && race.going !== null)), exactSurface: surface ? recordOf(priors.filter((p) => p.surface?.toLowerCase() === surface.toLowerCase())) : null },
      recentForm: priors.slice(0, 6).map((p) => p.position ?? p.status), priors, metrics: runner.metrics, goingForm: runner.goingForm,
      models: evidence.models, reconstructedModels: { tprW100: runner.turfPerformanceRating ?? null, tprW50: runner.turfPerformanceShadowRating ?? null, jump: runner.jumpRating ?? null, aw: runner.awRating ?? null },
      selections: evidence.selections, ruleMatches: (runner.savedRuleMatches ?? []).map((r) => r.ruleName), ruleAudit,
      signals: [...new Set(priors.slice(0, 3).flatMap((p) => p.signals))], priceComparisons: [],
      outcome: { position: original.runner.finishingPosition, status: original.runner.resultStatus, sp: original.runner.startingPrice, spDecimal: number(original.runner.startingPriceDecimal), spRank: null }, ledgerAudit: evidence.audit,
    });
  }
  // Saved DB snapshots are inspected separately; updated-after-off rows cannot prove frozen output.
  for (const table of [schema.turfPerformanceRatingSnapshots, schema.turfPerformanceRatingShadowSnapshots]) {
    const snapshots = await db.select().from(table).where(eq(table.raceId, race.raceId));
    for (const snapshot of snapshots) {
      const item = record(snapshot);
      const row = field.find((r) => r.runnerId === item.runnerId);
      if (!row) continue;
      const clean = before(item.createdAt, cutoff) && before(item.updatedAt, cutoff);
      row.ledgerAudit.push({ source: table === schema.turfPerformanceRatingSnapshots ? "DB TPR snapshots" : "DB TPR shadow snapshots", status: clean ? "timestamp-verified pre-race snapshot" : "excluded: created/updated after cutoff or missing timestamps" });
      if (!clean) continue;
      for (const [system, key] of table === schema.turfPerformanceRatingSnapshots ? [["TPR W100", "rank"]] : [["TPR W100", "w100Rank"], ["TPR W50", "w50Rank"]]) {
        const r = number(item[key]);
        row.models.push({ system, rank: r, probability: null, source: "DB TPR snapshot", capturedAt: (item.createdAt as Date).toISOString(), eligible: true, details: { formulaVersion: item.formulaVersion } });
        // A rating snapshot is evidence of rank, not necessarily of a live tracker selection.
      }
    }
  }
  for (const row of field) {
    row.orRank = rank(row.officialRating, field.map((r) => r.officialRating));
    row.trainerRank = rank(row.trainerPrior?.trainerPriorWinRate ?? null, field.map((r) => r.trainerPrior?.trainerPriorWinRate ?? null));
    row.jockeyRank = rank(row.jockeyPrior?.jockeyPriorWinRate ?? null, field.map((r) => r.jockeyPrior?.jockeyPriorWinRate ?? null));
    row.marketRank = rank(row.market?.decimal ?? null, field.map((r) => r.market?.decimal ?? null), true);
    row.marketRankComplete = field.every((r) => r.market !== null);
    row.outcome.spRank = rank(row.outcome.spDecimal, field.map((r) => r.outcome.spDecimal), true);
    row.speedRanks = { latest: rank(row.speed?.latest ?? null, field.map((r) => r.speed?.latest ?? null)), bestL3: rank(row.speed?.bestLast3 ?? null, field.map((r) => r.speed?.bestLast3 ?? null)), averageL3: rank(row.speed?.averageLast3 ?? null, field.map((r) => r.speed?.averageLast3 ?? null)) };
    row.priceComparisons = row.models.filter((m) => m.probability !== null).map((m) => ({ system: m.system, probability: m.probability!, marketProbability: row.market?.probability ?? null, edgePp: row.market ? (m.probability! - row.market.probability) * 100 : null, finalSpProbability: row.outcome.spDecimal ? 1 / row.outcome.spDecimal : null }));
    // An observed positive edge is distinguishable from the existing rank-one positive-edge selector.
    row.selections.push(...positiveTissueSelections(row.models, row.market));
  }
  const winner = field.find((r) => r.runnerId === target.runnerId)!;
  if (!winner || winner.outcome.position !== 1) throw new Error(`${target.name} is not a confirmed winner on ${date}`);
  const positives = describePositives(winner);
  const hidden = winner.priors.slice(0, 3).filter((p) => p.position !== null && p.position > 3 && p.signals.some((s) => ["trouble in running", "wide", "slow start", "jumping error", "travelled then weakened"].includes(s)));
  const missed = [
    `Highest frozen rank: ${bestModel(winner)}. ${winner.priceComparisons.some((p) => p.edgePp !== null && p.edgePp > 0) ? "A captured probability exceeded a verified market price; see the price table." : "No positive value comparison established from available timestamp-verified captures."}`,
    `Existing features already cover speed, participant rates and entered conditions. ${winner.signals.length ? `Prior comments include ${winner.signals.join(", ")}; Tissue captures may already encode them (see model details).` : "No specific hidden-form comment angle established."}`,
    "Feature weights and causal reasons for a ranking cannot be identified from a winner case alone. A potentially useful feature is not proven missing until the model input schema is checked; no missing-feature claim is made here.",
  ];
  if (winner.speedRanks.averageL3 !== null && winner.speedRanks.averageL3 <= 3) {
    const lower = winner.models.filter((m) => m.rank !== null && m.rank > 3 && m.eligible);
    if (lower.length) missed.push(`Average L3 speed ranked ${winner.speedRanks.averageL3}, while ${lower.map((m) => `${m.system} ranked ${m.rank}`).join(", ")}. Speed was already present in the feature set; whether it deserved more influence is a research hypothesis, not a finding from the result.`);
  }
  const { runners: omittedRunners, ...raceMeta } = race;
  void omittedRunners;
  return { name: target.name, race: { ...raceMeta, declaredRunnerCount: validation.declaredField, actualRunnerCount: validation.activeRunnerCount, course: rows[0].course.displayName, family, cutoff: cutoff.toISOString(), fieldValidation: validation, metadataProvenance: "Entered race/runner metadata reconstructed from imported DB rows and timestamped racecard/result payloads. Bookmaker prices require a pre-off fetchedAt; results and SP are confined to outcome context. Active field uses confirmed starters; declared racecard differences are reported only when fully explained by named non-runners or canonical reconciliation." }, winner, field,
    comparators: { favourites: field.filter((r) => r.marketRank === 1 && r.marketRankComplete).map((r) => r.name), modelLeaders: field.filter((r) => r.models.some((m) => m.rank === 1 && m.eligible)).map((r) => r.name), secondRanked: field.filter((r) => r.models.some((m) => m.rank === 2 && m.eligible)).map((r) => r.name) },
    positives, hiddenForm: hidden.length ? `Plausible better-than-result angle, unproven: ${hidden.map((p) => `${p.date} ${p.course}, position ${p.position}: ${p.signals.join(", ")} (${p.comment})`).join("; ")}` : "No convincing hidden-form explanation established from the last three prior runs; do not infer one from the win.", missed };
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}
function pct(value: number | null): string { return value === null ? "unknown" : `${(value * 100).toFixed(2)}%`; }
function bestModel(row: FieldRow): string {
  const ranked = row.models.filter((m) => m.rank !== null && m.eligible).sort((a, b) => a.rank! - b.rank!);
  return ranked.length ? `${ranked[0].rank} (${[...new Set(ranked.filter((m) => m.rank === ranked[0].rank).map((m) => m.system))].join(", ")})` : "unknown";
}
function describePositives(row: FieldRow): string[] {
  const positives: string[] = [];
  if (row.speedRanks.averageL3 !== null) positives.push(`Average L3 ${fmt(row.speed?.averageLast3)}, field rank ${row.speedRanks.averageL3}; latest ${fmt(row.speed?.latest)}, best L3 ${fmt(row.speed?.bestLast3)}.`);
  if (row.speed?.latest !== null && row.speed?.latest !== undefined && row.speed.previous !== null && row.speed.latest > row.speed.previous) positives.push(`Latest speed improved from ${fmt(row.speed.previous)} to ${fmt(row.speed.latest)}; this is one change, not proof of a trend.`);
  if (row.classMove.startsWith("drop")) positives.push(`Entered class ${row.classMove}.`);
  const value = row.priceComparisons.filter((p) => p.edgePp !== null && p.edgePp > 0).sort((a, b) => b.edgePp! - a.edgePp!)[0];
  if (value) positives.push(`${value.system}: ${pct(value.probability)} versus stored market ${pct(value.marketProbability)}, ${fmt(value.edgePp)} percentage points above market.`);
  if (row.signals.length) positives.push(`Prior-run comment cues: ${row.signals.join(", ")}; inspect the dated comments before interpreting suitability or pace.`);
  if (!positives.length) positives.push("Available pre-race evidence does not establish a specific positive angle.");
  return positives.slice(0, 5);
}
export function commonality(cases: Case[]) {
  const checks: Array<[string, (r: FieldRow) => boolean | null]> = [
    ["Not market rank 1", (r) => r.marketRankComplete && r.marketRank !== null ? r.marketRank > 1 : null],
    ["Average L3 speed in field top 3", (r) => r.speedRanks.averageL3 === null ? null : r.speedRanks.averageL3 <= 3],
    ["Latest speed improved over previous", (r) => r.speed?.latest != null && r.speed.previous != null ? r.speed.latest > r.speed.previous : null],
    ["Class drop", (r) => r.classMove === "unknown" ? null : r.classMove.startsWith("drop")],
    ["Prior trouble/error comment in last three runs", (r) => r.priors.slice(0, 3).some((p) => p.signals.some((s) => ["trouble in running", "wide", "slow start", "jumping error"].includes(s)))],
    ["Captured model probability above stored pre-race market", (r) => r.priceComparisons.some((p) => p.edgePp !== null) ? r.priceComparisons.some((p) => p.edgePp !== null && p.edgePp > 0) : null],
    ["Trainer had a winner in previous 14 days", (r) => number(record(r.trainerContext.previous14Days).wins) === null ? null : number(record(r.trainerContext.previous14Days).wins)! > 0],
  ];
  return checks.map(([feature, check]) => {
    const evidence = cases.map((c) => ({ horse: c.name, present: check(c.winner) }));
    const count = evidence.filter((e) => e.present === true).length;
    const unknown = evidence.filter((e) => e.present === null).length;
    return { feature, count, unknown, classification: count === 3 ? "PRESENT IN ALL 3" : count === 2 ? "PRESENT IN 2 OF 3" : count === 1 ? "PRESENT IN 1 OF 3" : "NOT SUPPORTED", evidence };
  });
}
type Report = { date: string; generatedAt: string; methodology: string[]; ledgers: Array<Omit<Ledger, "entries">>; cases: Case[]; common: ReturnType<typeof commonality>; leads: Array<{ priority: string; feature: string; supportingCases: number }> };
function fieldTable(rows: FieldRow[]): string {
  return ["| Runner | Pre price / p | Market rank | OR / rank | Latest / rank | Best L3 / rank | Avg L3 / rank | Trainer % | Jockey % | Days | Class move | Frozen models |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${fmt(r.name)} | ${fmt(r.market?.decimal)} / ${pct(r.market?.probability ?? null)} | ${fmt(r.marketRank)}${r.marketRankComplete ? "" : " (partial)"} | ${fmt(r.officialRating)} / ${fmt(r.orRank)} | ${fmt(r.speed?.latest)} / ${fmt(r.speedRanks.latest)} | ${fmt(r.speed?.bestLast3)} / ${fmt(r.speedRanks.bestL3)} | ${fmt(r.speed?.averageLast3)} / ${fmt(r.speedRanks.averageL3)} | ${fmt(r.trainerPrior?.trainerPriorWinRate)} (rank ${fmt(r.trainerRank)}) | ${fmt(r.jockeyPrior?.jockeyPriorWinRate)} (rank ${fmt(r.jockeyRank)}) | ${fmt(r.daysSinceRun)} | ${r.classMove} | ${r.models.map((m) => `${m.system} ${fmt(m.rank)}${m.eligible ? "" : " (ineligible)"}`).join("; ") || "unknown"} |`)].join("\n");
}
export function renderReport(report: Report): string {
  const lines = ["# Three-Winner Retrospective Case Study", "", "## Executive Summary", "", `Racing date: ${report.date}. Generated: ${report.generatedAt}. Three outcome-selected cases support description only, with no estimate of predictive significance.`, "", ...report.methodology.map((m) => `- ${m}`), ""];
  for (const c of report.cases) {
    lines.push(`## ${c.name}`, "", `${fmt(c.race.scheduledTime)} ${c.race.course}; ${fmt(c.race.raceType)} / ${c.race.family}; ${fmt(c.race.surface)} / ${fmt(c.race.going)}; class ${fmt(c.race.raceClass)}; ${fmt(c.race.distance)} (${fmt(c.race.distanceYards)} yards); ${c.field.length} confirmed starters. Cutoff ${c.race.cutoff}.`, "",
      c.race.fieldValidation ? `Field validation: declared racecard field ${fmt(c.race.fieldValidation.declaredField)}, active reconstructed runners ${fmt(c.race.fieldValidation.activeRunnerCount)}, actual starters ${fmt(c.race.fieldValidation.actualStarterCount)}${c.race.fieldValidation.excludedNonRunners.length ? `, excluded genuine NR: ${c.race.fieldValidation.excludedNonRunners.map(fmt).join(", ")}` : ""}.` : "",
      "",
      `Outcome context only: position ${fmt(c.winner.outcome.position)}, ${fmt(c.winner.outcome.status)}, final SP ${fmt(c.winner.outcome.sp)} (${fmt(c.winner.outcome.spDecimal)} decimal).`, "", c.race.metadataProvenance, "", "Why this horse could have appealed pre-race:", "", ...c.positives.map((p) => `- ${p}`), "",
      "Prior runs, newest first (all dated before the cutoff):", "", "| Date | Course | Pos/status | Beaten / to winner | Class | OR | Weight | Speed | RPR / TS | Trip | Going / surface | Comment |", "|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...c.winner.priors.slice(0, 8).map((p) => `| ${p.date} | ${p.course} | ${fmt(p.position ?? p.status)} | ${fmt(p.beatenDistance)} / ${fmt(p.beatenDistanceToWinner)} | ${fmt(p.class)} | ${fmt(p.officialRating)} | ${fmt(p.weight)} | ${fmt(p.speed)} | ${fmt(p.rpr)} / ${fmt(p.topspeed)} | ${fmt(p.distance)} | ${fmt(p.going)} / ${fmt(p.surface)} | ${fmt(p.comment)} |`), "",
      `Course/distance/going/surface records: \`${JSON.stringify(c.winner.records)}\`. These are exact-match descriptions, not claims of preference.`, "", `Recent form: ${c.winner.recentForm.map(fmt).join(" - ")}. Latest class context: ${c.winner.classMove}.`, "");
  }
  lines.push("## Existing Model Selections", "", "YES below means a recorded eligible rank-one/selection capture, or the separately labelled reconstructed positive-edge condition. Absence of a capture is UNKNOWN, not NO. A saved-rule match alone cannot establish an actual live selection.", "");
  for (const c of report.cases) {
    lines.push(`### ${c.name}`, "", `Selection attribution: ${c.winner.selections.length ? c.winner.selections.map((s) => `${s.system}: ${s.reason} (${s.source}, ${s.capturedAt})`).join("; ") : "UNKNOWN: no qualifying pre-race selection capture found"}.`, "", `Highest frozen rank: ${bestModel(c.winner)}.`, "",
      `Saved rules matching reconstructed inputs: ${c.winner.ruleMatches.join(", ") || "none among eligible rules"}. Actual selection remains unproven without a selection log.`, "", "| System | Rank | Probability | Eligible | Capture | Source |", "|---|---|---|---|---|---|",
      ...c.winner.models.map((m) => `| ${m.system} | ${fmt(m.rank)} | ${pct(m.probability)} | ${m.eligible} | ${m.capturedAt} | ${m.source} |`), "",
      "Stored model input/comment evidence:", "", ...c.winner.models.map((m) => `- ${m.system}: \`${JSON.stringify(m.details)}\``), "",
      `Current-code reconstruction (not a frozen selection): \`${JSON.stringify(c.winner.reconstructedModels)}\`.`, "", `W100/OR agreement: ${c.winner.models.some((m) => m.system === "TPR W100" && m.rank === 1) && c.winner.orRank === 1}; W50/OR agreement: ${c.winner.models.some((m) => m.system === "TPR W50" && m.rank === 1) && c.winner.orRank === 1} (winner-specific, unknown captures do not establish disagreement).`, "",
      "Capture coverage:", "", ...c.winner.ledgerAudit.map((a) => `- ${a.source}: ${a.status}`), "", "Saved-rule audit:", "", ...c.winner.ruleAudit.map((a) => `- ${a.name}: ${a.reason}`), "");
    if (c.name === "Stanage") {
      const tissue = c.winner.models.find((m) => m.system === "Turf Tissue v2");
      lines.push(`Stanage: Turf Tissue involved: ${tissue ? "YES (recorded output)" : "UNKNOWN"}; Turf Tissue rank 1: ${tissue ? tissue.rank === 1 ? "YES" : "NO" : "UNKNOWN"}; positive-edge selector: ${c.winner.selections.some((s) => s.system === "Turf Tissue v2 positive-edge") ? "YES (condition reconstructed from verified captures)" : "NOT ESTABLISHED"}.`, "");
    }
  }
  lines.push("## Full-Field Comparisons", "");
  for (const c of report.cases) {
    lines.push(`### ${c.name}`, "", fieldTable(c.field), "", "Additional full-field records:", "", "| Runner | Trainer / jockey | Course/distance/going/surface records | Recent form | Comment cues | Final SP / rank (context only) |", "|---|---|---|---|---|---|", ...c.field.map((r) => `| ${r.name} | ${fmt(r.trainer)} / ${fmt(r.jockey)} | ${fmt(JSON.stringify(r.records))} | ${r.recentForm.map(fmt).join(" - ")} | ${r.signals.join(", ") || "none established"} | ${fmt(r.outcome.sp)} / ${fmt(r.outcome.spRank)} |`), "",
      `Verified pre-race favourites: ${c.comparators.favourites.join(", ") || "unknown (full-field prices unavailable)"}. Frozen model leaders: ${c.comparators.modelLeaders.join(", ") || "unknown"}. Second-ranked relevant runners: ${c.comparators.secondRanked.join(", ") || "unknown"}.`, "");
  }
  lines.push("## Hidden Form", "", ...report.cases.map((c) => `- ${c.name}: ${c.hiddenForm}`), "", "Trip/surface changes and exact records are shown above. Suitability, pace disadvantage and a class that was too high require evidence beyond a keyword or finishing position; no such explanation is assumed.", "", "## Trainer Context", "", "| Horse | Trainer | Baseline runners/winners/% | Prior 14 days runners/winners/% | Recent minus baseline pp | Course runners/winners/% |", "|---|---|---|---|---|---|");
  const statsLabel = (v: unknown) => { const s = record(v); return `${fmt(s.runs)}/${fmt(s.wins)}/${fmt(s.rate)}`; };
  for (const c of report.cases) lines.push(`| ${c.name} | ${fmt(c.winner.trainer)} | ${statsLabel(c.winner.trainerContext.baseline)} | ${statsLabel(c.winner.trainerContext.previous14Days)} | ${fmt(c.winner.trainerContext.recentMinusBaselinePp)} | ${statsLabel(c.winner.trainerContext.course)} |`);
  lines.push("", "Baseline means imported completed prior runners, not necessarily a trainer's whole career. Recent form is descriptive; previous trainer research was weak/unstable and these cases do not change that conclusion.", "", "## Price / Value Context", "", "| Horse | System | Model p | Stored pre-race market p | Edge pp | Final SP p (context) |", "|---|---|---|---|---|---|");
  for (const c of report.cases) {
    for (const p of c.winner.priceComparisons) lines.push(`| ${c.name} | ${p.system} | ${pct(p.probability)} | ${pct(p.marketProbability)} | ${fmt(p.edgePp)} | ${pct(p.finalSpProbability)} |`);
    lines.push(`| ${c.name} | Price provenance | ${fmt(c.winner.market?.source)} | ${fmt(c.winner.market?.capturedAt)} | | |`);
  }
  lines.push("", "Probabilities use raw 1/decimal odds (not overround-normalised). The earliest verified available price is chosen per runner; snapshot times may differ. A partial market rank is not a favourite determination. Model-versus-price edges reconstruct information available by the later of the two timestamps; they do not prove a bet or display occurred.", "", "## Common Characteristics", "", "| Feature | Classification | Count | Unknown |", "|---|---|---|---|", ...report.common.map((c) => `| ${c.feature} | ${c.classification} | ${c.count}/3 | ${c.unknown}/3 |`), "", "## Favourite Comparisons", "");
  for (const c of report.cases) {
    const comparisons = c.field.filter((r) => c.comparators.favourites.includes(r.name) || c.comparators.modelLeaders.includes(r.name) || c.comparators.secondRanked.includes(r.name));
    lines.push(`### ${c.name}`, "", fieldTable([c.winner, ...comparisons.filter((r) => r.runnerId !== c.winner.runnerId)]), "", `A form analyst could consider: ${c.positives.join(" ")} Preference over the favourite is not established merely because the horse won. This reconstructs possible reasoning; the tipster's actual inputs are unknown.`, "");
  }
  lines.push("## What Our Models Missed", "");
  for (const c of report.cases) lines.push(`### ${c.name}`, "", ...c.missed.map((m) => `- ${m}`), "");
  lines.push("## Research Leads", "", ...(report.leads.length ? report.leads.map((l) => `- ${l.priority}: ${l.feature}, supported in ${l.supportingCases}/3. Study in a separate chronology-safe broad sample with controls before considering any change.`) : ["No concept supported in at least two cases; no research lead promoted."]), "", "No fitting, threshold optimisation, betting-rule creation or production/ledger modification was performed. All unproven claims remain unproven.", "");
  return lines.join("\n");
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.validate) {
    console.log(`Non-database validation passed: imports/options loaded; fixed date ${options.date}; database and forward ledgers not read; no report generated. Run the focused Bun tests for chronology and attribution checks.`);
    return;
  }
  // Server-side read-only enforcement also protects against accidental writes in helpers.
  const client = postgres(getDatabaseEnv().DATABASE_URL, { max: 1, connect_timeout: 10, connection: { default_transaction_read_only: true, application_name: "three-winner-case-study" } });
  const db = drizzle(client, { schema });
  try {
    await client`begin isolation level repeatable read read only`;
    const targetMatches = await db.select({ raceId: races.id, runnerId: raceRunners.id, name: horses.displayName }).from(raceRunners)
      .innerJoin(races, eq(races.id, raceRunners.raceId)).innerJoin(horses, eq(horses.id, raceRunners.horseId))
      .where(and(eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), eq(races.raceDate, options.date), sql`lower(horses.display_name) in ('ballygeary','stanage','state express')`));
    const reconciliation = await getSportingLifeCurrentCardRaceStatuses(db, targetMatches.map((target) => target.raceId));
    if (reconciliation.diagnostics.some((diagnostic) => diagnostic.status === "ambiguous")) {
      throw new Error(`Unresolved racecard-version ambiguity under ${reconciliation.version}; stop without reports`);
    }
    const targets = canonicalTargetMatches(targetMatches, reconciliation);
    for (const name of NAMES) if (targets.filter((t) => t.name.toLowerCase() === name.toLowerCase()).length !== 1) throw new Error(`Expected exactly one canonical DB race match for ${name} on ${options.date}; raw matches ${targetMatches.length}, superseded removed ${targetMatches.length - targets.length}; stop without reports`);
    const ledgers = await loadLedgers();
    const cases: Case[] = [];
    for (const name of NAMES) {
      console.log(`Reconstructing ${name} from PostgreSQL (read-only)...`);
      cases.push(await buildCase(db, options.date, targets.find((t) => t.name.toLowerCase() === name.toLowerCase())!, ledgers));
    }
    await client`commit`;
    const common = commonality(cases);
    const leads = common.filter((c) => c.count >= 2 && !/market rank|Trainer/.test(c.feature)).map((c) => ({ priority: c.count === 3 ? "HIGH" : "MEDIUM", feature: c.feature, supportingCases: c.count }));
    const report: Report = { date: options.date, generatedAt: new Date().toISOString(), ledgers: ledgers.map(({ entries, ...metadata }) => { void entries; return metadata; }), cases, common, leads,
      methodology: ["Database is mandatory; repeatable-read, server-enforced read-only transaction. No history/research cache fallback.", "Each target requires a unique exact Sporting Life database match and a confirmed win. Prior runs strictly precede each race timestamp; current-race result/comments/SP never enter model or rule inputs.", "Original forward ledgers are read only after DB resolution, solely as stored selection/model evidence; SHA-256 hashes are recorded. Pre-race flags and timestamps are checked. Missing evidence is UNKNOWN.", "Entered metadata is reconstructed from current imported rows; original values or withdrawal timing may not be recoverable. Frozen model outputs are separated from current-code reconstructions.", "Saved-rule matches require pre-off freezing and last modification, exclude final-SP conditions, and remain reconstructed matches rather than proof of a live selection.", "Keyword comment cues describe prior text; they do not infer unsuitable conditions, hidden ability, or the cause of a win."] };
    const markdown = renderReport(report);
    await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(REPORT_MD, markdown);
    for (const c of cases) {
      console.log(`\n${c.name.toUpperCase()}\nExisting model/rule selected: ${c.winner.selections.length ? `YES: ${[...new Set(c.winner.selections.map((s) => s.system))].join(", ")}` : "UNKNOWN (no verified selection capture)"}\nMarket rank: ${fmt(c.winner.marketRank)}${c.winner.marketRankComplete ? "" : " (partial/unknown field prices)"}\nBest model rank: ${bestModel(c.winner)}\nMain pre-race positive: ${c.positives[0]}\nPossible hidden-form angle: ${c.hiddenForm}`);
      if (c.name === "Stanage") { const tissue = c.winner.models.find((m) => m.system === "Turf Tissue v2"); console.log(`Was Turf Tissue involved: ${tissue ? "YES" : "UNKNOWN"}\nWas Turf Tissue rank 1: ${tissue ? tissue.rank === 1 ? "YES" : "NO" : "UNKNOWN"}`); }
    }
    console.log(`\nCOMMON FEATURES\n${common.map((c) => `- ${c.feature}: ${c.count}/3 (${c.unknown} unknown)`).join("\n")}\nMost interesting research lead: ${leads[0]?.feature ?? "none supported in at least two cases"}\n\nWrote ${REPORT_MD}\nWrote ${REPORT_JSON}`);
  } catch (error) {
    await client`rollback`.catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    console.error(`Diagnostic stopped${code ? ` (${code})` : ""}: ${code === "ECONNREFUSED" || code === "CONNECT_TIMEOUT" ? "this process could not reach PostgreSQL; this does not establish that your Mac's server is down" : error instanceof Error ? error.message : "unknown error"}. No cache fallback; report generation did not complete.`);
    process.exitCode = 1;
  } finally { await client.end({ timeout: 5 }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
