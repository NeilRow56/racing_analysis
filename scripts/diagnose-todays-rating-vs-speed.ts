import { readFile, writeFile } from "node:fs/promises";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, horses, raceRunners, races, sourceImports } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { isOrdinaryFlatTurfRace } from "@/lib/racing/turf-speed-rating";
import { getTurfSpeedRatingsAsOfRuns } from "@/lib/racing/turf-speed-ratings";
import {
  calculateTurfPerformanceRating,
  TURF_PERFORMANCE_RATING_VERSION,
} from "@/lib/racing/turf-performance-rating";
import {
  DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB,
  WEIGHT_PERFORMANCE_CALCULATION_VERSION,
  calculateWeightAdjustedPerformance,
} from "@/lib/racing/weight-performance";
import { calculateTodaysRating, TODAYS_RATING_CALCULATION_VERSION } from "@/lib/racing/todays-rating";

type Year = "2025" | "2026";
type ScopeKey = "all" | "handicap" | "non_handicap";
type RankSignalKey = "latest_speed" | "best_l3_speed" | "avg_l3_speed" | "todays_rating" | "tpr";

type Context = {
  year: Year;
  cacheFamily: BacktestCacheFamily;
  cacheWindow: string;
  actualCoverage: string;
  rows: Row[];
  races: Race[];
};

type Row = HistoricalTargetRunnerMetricsRow & {
  tpr: number | null;
  latestPriorTurfRunWeightLbs: number | null;
  todayMinusPriorWeightLbs: number | null;
};

type Race = {
  id: string;
  rows: Row[];
  medianWeightLbs: number | null;
  scope: Record<ScopeKey, boolean>;
};

type Signal = {
  key: RankSignalKey;
  label: string;
  value: (row: Row) => number | null;
};

type Evaluation = {
  year: Year;
  scope: ScopeKey;
  signal: Signal;
  raceRows: Row[][];
  ranks: Map<string, number>;
  rank1: Row[];
  top2WinnerRaces: number;
  top3WinnerRaces: number;
};

type Metrics = {
  selections: number;
  winners: number;
  strike: number | null;
  expectedWinners: number | null;
  ae: number | null;
  profit: number | null;
  roi: number | null;
  averageSp: number | null;
};

type PriorRun = {
  runnerId: string;
  horseId: string;
  raceDateTime: Date;
  raceName: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  courseName: string;
  going: string | null;
  surface: string | null;
  distanceYards: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  weightCarriedLbs: number | null;
};

const YEARS: Year[] = ["2025", "2026"];
const SCOPES: Array<{ key: ScopeKey; label: string }> = [
  { key: "all", label: "All Turf" },
  { key: "handicap", label: "Handicaps" },
  { key: "non_handicap", label: "Non-handicaps" },
];
const SIGNALS: Signal[] = [
  { key: "latest_speed", label: "Latest Speed", value: (row) => row.features.latestSpeedRating },
  { key: "best_l3_speed", label: "Best L3 Speed", value: (row) => row.features.bestSpeedLast3 },
  { key: "avg_l3_speed", label: "Avg L3 Speed", value: (row) => row.features.averageSpeedLast3 },
  { key: "todays_rating", label: "Today's Rating", value: (row) => row.features.latestTodaysRating },
  { key: "tpr", label: "TPR", value: (row) => row.tpr },
];
const OUTPUT_PATH = "/tmp/todays-rating-vs-speed-diagnostic.md";
const JSON_OUTPUT_PATH = "/tmp/todays-rating-vs-speed-diagnostic.json";
const YORK_RUNNER_ID = "7ff4aacb-7bc2-4126-a252-b6d8cb662560";
const SOURCE = "sporting_life";
const RESULT_SOURCE_TYPE = "full-result-next-data";
const DB_CHUNK_SIZE = 5_000;

async function main() {
  if (process.argv.includes("--validate-weight-swing")) {
    validateWeightSwing();
    console.log("Weight-swing focused validation passed.");
    return;
  }
  if (process.argv.includes("--skip-weight-swing-db")) {
    throw new Error("Weight-swing analysis requires DB access; cache fallback is disabled.");
  }
  const weightOnly = process.argv.includes("--weight-swing-only");
  const previousReport = weightOnly ? await readFile(OUTPUT_PATH, "utf8") : null;
  console.error("Loading Turf backtest caches...");
  const baseContexts = await Promise.all(YEARS.map(loadContextWithoutWeightSwings));
  console.error(`Loaded ${baseContexts.map((context) => `${context.year}:${context.rows.length}`).join(" ")} runners.`);
  console.error("Loading latest usable prior Turf run weights from DB...");
  const yorkTarget = await loadYorkTarget();
  const priorRuns = await loadLatestPriorTurfRunWeights([...baseContexts.flatMap((context) => context.rows), yorkTarget]);
  const priorWeights = new Map([...priorRuns].map(([id, run]) => [id, run?.weightCarriedLbs ?? null]));
  const contexts = baseContexts.map((context) => addWeightSwings(context, priorWeights));
  const evaluations = contexts.flatMap((context) =>
    (weightOnly ? SCOPES.slice(0, 1) : SCOPES).flatMap((scope) =>
      (weightOnly ? SIGNALS.filter((signal) => WEIGHT_SIGNALS.includes(signal.key)) : SIGNALS)
        .map((signal) => evaluate(context, scope.key, signal))),
  );
  const weightDiagnostic = buildWeightDiagnostic(contexts, evaluations, priorRuns, yorkTarget);
  const weightLines: string[] = [];
  renderWeightDiagnostic(weightLines, weightDiagnostic);
  let lines: string[];
  if (previousReport !== null) {
    const section = /^## Weight-Swing Effect\n[\s\S]*?(?=^## Reuse Note\n)/m;
    if (!section.test(previousReport)) throw new Error("Existing weight-swing section not found; refusing to overwrite completed research.");
    lines = previousReport.replace(section, `${weightLines.join("\n")}\n`).trimEnd().split("\n");
  } else {
    lines = renderReport(contexts, evaluations);
    const start = lines.indexOf("## Weight-Swing Effect");
    const end = lines.indexOf("## Reuse Note", start);
    lines.splice(start, end - start, ...weightLines);
  }
  let previousJson: Record<string, unknown> = {};
  try { previousJson = JSON.parse(await readFile(JSON_OUTPUT_PATH, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await writeFile(JSON_OUTPUT_PATH, `${JSON.stringify({ ...previousJson, weightSwing: weightDiagnostic }, null, 2)}\n`, "utf8");
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(weightOnly ? weightLines.join("\n") : lines.join("\n"));
  console.log(`\nWrote ${OUTPUT_PATH} and ${JSON_OUTPUT_PATH}`);
}

async function loadContextWithoutWeightSwings(year: Year): Promise<Context> {
  const candidates = (await Promise.all([
    loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" }),
    loadLatestBacktestFeatureCacheForYear({ year, family: "all" }),
  ])).filter((cache): cache is NonNullable<typeof cache> => cache !== null);
  const cache = candidates
    .map((candidate) => ({
      ...candidate,
      turfRows: candidate.rows
        .filter((row) => row.features.raceCode === "turf")
        .filter(isSettledRunner)
        .sort(compareRows),
    }))
    .filter((candidate) => candidate.turfRows.length > 0)
    .sort((left, right) => {
      const leftTo = left.actualCoverage?.actualTo ?? left.manifest.to;
      const rightTo = right.actualCoverage?.actualTo ?? right.manifest.to;
      return rightTo.localeCompare(leftTo) || right.turfRows.length - left.turfRows.length;
    })[0];
  if (!cache) throw new Error(`Missing compatible Turf cache for ${year}`);

  const racesById = groupBy(cache.turfRows, (row) => row.features.targetRaceId);
  const medians = new Map(
    [...racesById.entries()].map(([raceId, rows]) => [
      raceId,
      median(rows.map((row) => row.features.weightCarriedLbs).filter(isNumber)),
    ]),
  );
  const rows = cache.turfRows.map((row): Row => ({
    ...row,
    tpr: calculateTurfPerformanceRating({
      latestPerformanceRating: row.features.latestPerformanceRating,
      previousPerformanceRating: row.features.previousPerformanceRating,
      averagePerformanceLast3: row.features.averagePerformanceLast3,
      latestSpeedRating: row.features.latestSpeedRating,
      previousSpeedRating: row.features.previousSpeedRating,
      averageSpeedLast3: row.features.averageSpeedLast3,
      raceClass: row.features.raceClass,
      weightCarriedLbs: row.features.weightCarriedLbs,
      raceMedianWeightCarriedLbs: medians.get(row.features.targetRaceId) ?? null,
    })?.rating ?? null,
    latestPriorTurfRunWeightLbs: null,
    todayMinusPriorWeightLbs: null,
  }));
  const races = [...groupBy(rows, (row) => row.features.targetRaceId).entries()].map(([id, raceRows]) => ({
    id,
    rows: raceRows,
    medianWeightLbs: medians.get(id) ?? null,
    scope: {
      all: true,
      handicap: isHandicapRace(raceRows[0]!),
      non_handicap: !isHandicapRace(raceRows[0]!),
    },
  }));
  return {
    year,
    cacheFamily: cache.manifest.family,
    cacheWindow: `${cache.manifest.from} to ${cache.manifest.to}`,
    actualCoverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    rows,
    races,
  };
}

function addWeightSwings(context: Context, priorWeights: Map<string, number | null>): Context {
  const rows = context.rows.map((row): Row => {
    const priorWeight = priorWeights.get(row.features.targetRunnerId) ?? null;
    const todayWeight = row.features.weightCarriedLbs;
    return {
      ...row,
      latestPriorTurfRunWeightLbs: priorWeight,
      todayMinusPriorWeightLbs: todayWeight !== null && priorWeight !== null ? todayWeight - priorWeight : null,
    };
  });
  const byRace = groupBy(rows, (row) => row.features.targetRaceId);
  return {
    ...context,
    rows,
    races: context.races.map((race) => ({ ...race, rows: byRace.get(race.id) ?? [] })),
  };
}

type WeightTarget = { features: Pick<Row["features"], "targetRunnerId" | "horseId" | "raceDateTime" | "weightCarriedLbs"> };
type UsablePriorRun = PriorRun & { speed: number; performance: number };

async function loadYorkTarget(): Promise<WeightTarget> {
  const { db, client } = createDbConnection();
  try {
    const [row] = await db.select({ targetRunnerId: raceRunners.id, horseId: raceRunners.horseId,
      raceDateTime: races.raceDatetime, weightCarriedLbs: raceRunners.weightCarriedLbs,
      horseName: horses.displayName, courseName: courses.displayName })
      .from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id))
      .innerJoin(horses, eq(raceRunners.horseId, horses.id))
      .innerJoin(courses, eq(races.courseId, courses.id)).where(eq(raceRunners.id, YORK_RUNNER_ID));
    if (!row?.raceDateTime || row.horseName !== "Capitano Josepi" || row.courseName !== "York") {
      throw new Error("Existing Capitano Josepi York case not found in DB.");
    }
    return { features: { ...row, raceDateTime: row.raceDateTime } };
  } finally { await client.end(); }
}

async function loadLatestPriorTurfRunWeights(rows: WeightTarget[]): Promise<Map<string, UsablePriorRun | null>> {
  const result = new Map<string, UsablePriorRun | null>();
  for (const row of rows) result.set(row.features.targetRunnerId, null);
  const timedRows = rows.filter((row) => row.features.raceDateTime instanceof Date);
  if (timedRows.length === 0) return result;

  const { db, client } = createDbConnection();
  try {
    const horseIds = [...new Set(timedRows.map((row) => row.features.horseId))];
    const latestTarget = timedRows.reduce(
      (latest, row) => row.features.raceDateTime > latest ? row.features.raceDateTime : latest,
      timedRows[0]!.features.raceDateTime,
    );
    const priorRuns = (
      await Promise.all(chunks(horseIds, DB_CHUNK_SIZE).map((horseChunk) =>
        db
          .select({
            runnerId: raceRunners.id,
            horseId: raceRunners.horseId,
            raceDateTime: races.raceDatetime,
            raceName: races.raceName,
            raceType: races.raceType,
            raceTypeCode: races.raceTypeCode,
            courseName: courses.displayName,
            going: races.going,
            surface: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'`,
            distanceYards: races.distanceYards,
            finishingPosition: raceRunners.finishingPosition,
            resultStatus: raceRunners.resultStatus,
            weightCarriedLbs: raceRunners.weightCarriedLbs,
          })
          .from(raceRunners)
          .innerJoin(races, eq(raceRunners.raceId, races.id))
          .innerJoin(courses, eq(races.courseId, courses.id))
          .leftJoin(sourceImports, sourceImportJoinCondition())
          .where(and(
            inArray(raceRunners.horseId, horseChunk),
            eq(raceRunners.source, SOURCE),
            eq(races.source, SOURCE),
            lt(races.raceDatetime, latestTarget),
            sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`,
          ))
          .orderBy(desc(races.raceDatetime)),
      ))
    ).flat()
      .filter((run): run is PriorRun & { raceDateTime: Date } => run.raceDateTime !== null)
      .filter((run) => run.resultStatus !== "non_runner" && (run.resultStatus !== null || run.finishingPosition !== null))
      .filter(isOrdinaryFlatTurfRace);

    const runsByHorse = groupBy(
      priorRuns
        .filter((run) => run.weightCarriedLbs !== null)
        .sort((left, right) => right.raceDateTime.getTime() - left.raceDateTime.getTime()),
      (run) => run.horseId,
    );
    // Walk backwards until each target finds a usable performance, without an arbitrary run limit.
    let pending = timedRows.map((row) => ({ row, candidates: (runsByHorse.get(row.features.horseId) ?? [])
      .filter((run) => run.raceDateTime < row.features.raceDateTime), index: 0 }));
    const usable = new Map<string, UsablePriorRun | null>();
    while (pending.length > 0) {
      const candidateIds = [...new Set(pending.flatMap(({ candidates, index }) => {
        const run = candidates[index];
        return run && !usable.has(run.runnerId) ? [run.runnerId] : [];
      }))];
      if (candidateIds.length > 0) {
        console.error(`Calculating ${candidateIds.length} prior-run speeds; ${pending.length} targets unresolved.`);
        const ratings = await getTurfSpeedRatingsAsOfRuns(db, candidateIds, { source: SOURCE });
        const byId = new Map(priorRuns.map((run) => [run.runnerId, run]));
        for (const id of candidateIds) {
          const run = byId.get(id)!;
          const speed = ratings.get(id)?.rating ?? null;
          const performance = calculateWeightAdjustedPerformance({ rawSpeedRating: speed,
            weightCarriedLb: run.weightCarriedLbs })?.performanceRating ?? null;
          usable.set(id, speed !== null && performance !== null ? { ...run, speed, performance } : null);
        }
      }
      pending = pending.filter((entry) => {
        const candidate = entry.candidates[entry.index++];
        if (!candidate) return false;
        const prior = usable.get(candidate.runnerId);
        if (!prior) return true;
        result.set(entry.row.features.targetRunnerId, prior);
        return false;
      });
    }
  } finally {
    await client.end();
  }
  return result;
}

function evaluate(context: Context, scope: ScopeKey, signal: Signal): Evaluation {
  const raceRows = context.races
    .filter((race) => race.scope[scope])
    .map((race) => race.rows)
    .filter((rows) => rows.length > 0);
  const ranks = rankRows(raceRows, signal.value);
  const rank1 = raceRows.flatMap((rows) => rows.filter((row) => ranks.get(row.features.targetRunnerId) === 1));
  return {
    year: context.year,
    scope,
    signal,
    raceRows,
    ranks,
    rank1,
    top2WinnerRaces: winnerCaptureRaces(raceRows, ranks, 2),
    top3WinnerRaces: winnerCaptureRaces(raceRows, ranks, 3),
  };
}

function renderReport(contexts: Context[], evaluations: Evaluation[]): string[] {
  const lines = [
    "# Today's Rating Vs Speed Diagnostic",
    "",
    "Diagnostic only. No production rating/model, Research rule, cache schema/generation, UI, or betting threshold has been changed.",
    "",
  ];
  renderSignalSemantics(lines);
  renderCacheCoverage(lines, contexts);
  renderSignalCoverage(lines, evaluations);
  renderRankingPerformance(lines, evaluations);
  renderMarketAdjusted(lines, evaluations);
  renderYearStability(lines, evaluations);
  renderAgreement(lines, evaluations);
  lines.push("## Weight-Swing Effect", "");
  renderReuseNote(lines);
  renderConclusion(lines, evaluations);
  return lines;
}

function renderSignalSemantics(lines: string[]) {
  lines.push("## Signal Semantics", "");
  table(lines, [
    { signal: "Latest Speed", semantics: "Chronology-safe latest prior Turf-family speed rating available before the target race." },
    { signal: "Best L3 Speed", semantics: "Maximum Turf-family speed rating among the latest three prior runs, using the existing form aggregation." },
    { signal: "Avg L3 Speed", semantics: "Mean Turf-family speed rating among the latest three prior runs with a usable speed rating." },
    { signal: "Today's Rating", semantics: `Existing ${TODAYS_RATING_CALCULATION_VERSION}: latest usable prior Turf performance re-rated to today's weight. Formula: prior performance + today-vs-prior weight adjustment. In code: prior performance - (today weight - ${DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB}). Prior performance is ${WEIGHT_PERFORMANCE_CALCULATION_VERSION}: prior Turf speed + (prior run weight - ${DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB}). Therefore Today's Rating = prior Turf speed + prior run weight - today weight. No class, recency, comment text, hidden-form, or normalization adjustment is present.` },
    { signal: "TPR", semantics: `Production ${TURF_PERFORMANCE_RATING_VERSION}, rebuilt from cached as-of rows: weighted recent performance and speed, 2025 robust scaling constants, class offset, and target weight relative to same-race median weight.` },
  ]);
  lines.push("");
}

function renderCacheCoverage(lines: string[], contexts: Context[]) {
  lines.push("## Input Cache Coverage", "");
  table(lines, contexts.map((context) => ({
    year: context.year,
    "cache family": context.cacheFamily,
    "manifest window": context.cacheWindow,
    "actual coverage": context.actualCoverage,
    races: context.races.length,
    runners: context.rows.length,
    winners: context.rows.filter((row) => row.outcome.won === true).length,
    handicaps: context.races.filter((race) => race.scope.handicap).length,
    "non-handicaps": context.races.filter((race) => race.scope.non_handicap).length,
  })));
  lines.push("");
}

function renderSignalCoverage(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Signal Coverage", "");
  table(lines, evaluations.map((evaluation) => {
    const rows = evaluation.raceRows.flat();
    const availableByRace = evaluation.raceRows.map((raceRows) => raceRows.filter((row) => isNumber(evaluation.signal.value(row))).length);
    return {
      year: evaluation.year,
      scope: scopeLabel(evaluation.scope),
      signal: evaluation.signal.label,
      "eligible races": evaluation.raceRows.length,
      runners: rows.length,
      "missing %": pct(rate(rows.length - availableByRace.reduce((sum, value) => sum + value, 0), rows.length)),
      "races >=2 rated": availableByRace.filter((count) => count >= 2).length,
      "races full/near-full": availableByRace.filter((count, index) => {
        const field = evaluation.raceRows[index]!.length;
        return count === field || count >= Math.max(2, field - 1);
      }).length,
    };
  }));
  lines.push("");
}

function renderRankingPerformance(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Ranking Performance", "");
  table(lines, evaluations.map((evaluation) => {
    const raceCount = comparableRaceCount(evaluation);
    return {
      year: evaluation.year,
      scope: scopeLabel(evaluation.scope),
      signal: evaluation.signal.label,
      "rank-1 selections": evaluation.rank1.length,
      winners: count(evaluation.rank1, (row) => row.outcome.won === true),
      "rank-1 strike": pct(rate(count(evaluation.rank1, (row) => row.outcome.won === true), evaluation.rank1.length)),
      "top-2 capture": pct(rate(evaluation.top2WinnerRaces, raceCount)),
      "top-3 capture": pct(rate(evaluation.top3WinnerRaces, raceCount)),
    };
  }));
  lines.push("");
}

function renderMarketAdjusted(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Market-Adjusted Rank-1 Performance", "");
  table(lines, evaluations.map((evaluation) => ({ year: evaluation.year, scope: scopeLabel(evaluation.scope), signal: evaluation.signal.label, ...metricsRow(selectionMetrics(evaluation.rank1)) })));
  lines.push("");
}

function renderYearStability(lines: string[], evaluations: Evaluation[]) {
  lines.push("## 2025 Vs 2026", "");
  table(lines, SCOPES.flatMap((scope) => SIGNALS.map((signal) => {
    const e2025 = findEvaluation(evaluations, "2025", scope.key, signal.key);
    const e2026 = findEvaluation(evaluations, "2026", scope.key, signal.key);
    const m2025 = selectionMetrics(e2025.rank1);
    const m2026 = selectionMetrics(e2026.rank1);
    return {
      scope: scope.label,
      signal: signal.label,
      "2025 strike": pct(m2025.strike),
      "2025 A/E": num(m2025.ae),
      "2025 ROI": pct(m2025.roi),
      "2026 strike": pct(m2026.strike),
      "2026 A/E": num(m2026.ae),
      "2026 ROI": pct(m2026.roi),
      classification: stability(m2025, m2026),
    };
  })));
  lines.push("");
}

function renderAgreement(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Today's Rating Agreement / Disagreement", "");
  table(lines, SCOPES.flatMap((scope) => YEARS.flatMap((year) => {
    const today = findEvaluation(evaluations, year, scope.key, "todays_rating");
    return SIGNALS
      .filter((signal) => signal.key !== "todays_rating")
      .map((signal) => agreementRow(today, findEvaluation(evaluations, year, scope.key, signal.key)));
  })));
  lines.push("");
}

function renderReuseNote(lines: string[]) {
  lines.push("## Reuse Note", "");
  lines.push("The historical metrics layer already exposes family-specific Today's Rating fields for Jump and All Weather. This diagnostic could be reused there by swapping the cache family and speed/performance field family, but this run stayed strictly on Turf as requested.");
  lines.push("");
}

function renderConclusion(lines: string[], evaluations: Evaluation[]) {
  const allRows = SIGNALS.map((signal) => {
    const y2025 = selectionMetrics(findEvaluation(evaluations, "2025", "all", signal.key).rank1);
    const y2026 = selectionMetrics(findEvaluation(evaluations, "2026", "all", signal.key).rank1);
    return { signal: signal.label, y2025, y2026 };
  });
  const sortedByAe = [...allRows].sort((left, right) =>
    ((right.y2025.ae ?? 0) + (right.y2026.ae ?? 0)) - ((left.y2025.ae ?? 0) + (left.y2026.ae ?? 0)),
  );
  const today = allRows.find((row) => row.signal === "Today's Rating")!;
  lines.push("## Interpretation", "");
  table(lines, [
    { question: "Does Today's Rating look independently useful?", answer: todayAnswer(evaluations) },
    { question: "Best repeated A/E direction, all Turf", answer: sortedByAe.slice(0, 3).map((row) => `${row.signal} (${num(row.y2025.ae)}/${num(row.y2026.ae)})`).join(", ") },
    { question: "Today's Rating all-Turf summary", answer: `Strike ${pct(today.y2025.strike)} / ${pct(today.y2026.strike)}, A/E ${num(today.y2025.ae)} / ${num(today.y2026.ae)}, ROI ${pct(today.y2025.roi)} / ${pct(today.y2026.roi)}.` },
    { question: "Primary caution", answer: "Use A/E consistency and comparable coverage ahead of ROI; non-handicap cells may be sample-limited." },
  ]);
}

function agreementRow(today: Evaluation, comparator: Evaluation) {
  const todayLeaders = leadersByRace(today);
  const comparatorLeaders = leadersByRace(comparator);
  let same = 0;
  let different = 0;
  let agreeWins = 0;
  let todayDisagreeWins = 0;
  let comparatorDisagreeWins = 0;
  let neitherDisagreeWins = 0;
  let disagreementExpected = 0;
  for (const [raceId, todayIds] of todayLeaders) {
    const comparatorIds = comparatorLeaders.get(raceId);
    if (!comparatorIds) continue;
    const raceRows = today.raceRows.find((rows) => rows[0]?.features.targetRaceId === raceId) ?? [];
    if (todayIds.size !== 1 || comparatorIds.size !== 1) continue;
    const todayId = [...todayIds][0]!;
    const comparatorId = [...comparatorIds][0]!;
    if (todayId === comparatorId) {
      same += 1;
      if (raceRows.find((row) => row.features.targetRunnerId === todayId)?.outcome.won === true) agreeWins += 1;
    } else {
      different += 1;
      const todayRow = raceRows.find((row) => row.features.targetRunnerId === todayId);
      const comparatorRow = raceRows.find((row) => row.features.targetRunnerId === comparatorId);
      const todayWon = todayRow?.outcome.won === true;
      const comparatorWon = comparatorRow?.outcome.won === true;
      if (todayWon) todayDisagreeWins += 1;
      else if (comparatorWon) comparatorDisagreeWins += 1;
      else neitherDisagreeWins += 1;
      disagreementExpected += impliedWinProbability(todayRow) ?? 0;
    }
  }
  return {
    year: today.year,
    scope: scopeLabel(today.scope),
    comparator: comparator.signal.label,
    "same leader races": same,
    "different leader races": different,
    "winner rate when agreeing": pct(rate(agreeWins, same)),
    "Today's wins when disagreeing": todayDisagreeWins,
    "comparator wins when disagreeing": comparatorDisagreeWins,
    "neither wins": neitherDisagreeWins,
    "SP expected winners in disagreement races": num(disagreementExpected),
  };
}

function selectionMetrics(rows: Row[]): Metrics {
  const priced = rows.map((row) => ({ row, sp: decimalSp(row) })).filter((entry): entry is { row: Row; sp: number } => entry.sp !== null);
  const winners = count(rows, (row) => row.outcome.won === true);
  const profit = priced.reduce((sum, entry) => sum + (entry.row.outcome.won === true ? entry.sp - 1 : -1), 0);
  const expectedWinners = priced.reduce((sum, entry) => sum + (1 / entry.sp), 0);
  return {
    selections: rows.length,
    winners,
    strike: rate(winners, rows.length),
    expectedWinners: priced.length === 0 ? null : expectedWinners,
    ae: expectedWinners > 0 ? winners / expectedWinners : null,
    profit: priced.length === 0 ? null : profit,
    roi: priced.length === 0 ? null : profit / priced.length,
    averageSp: priced.length === 0 ? null : average(priced.map((entry) => entry.sp)),
  };
}

function metricsRow(metrics: Metrics) {
  return {
    selections: metrics.selections,
    winners: metrics.winners,
    strike: pct(metrics.strike),
    "expected winners from SP": num(metrics.expectedWinners),
    "A/E": num(metrics.ae),
    "£1 P/L": gbp(metrics.profit),
    ROI: pct(metrics.roi),
    "average SP": num(metrics.averageSp),
  };
}

function rankRows(racesRows: Row[][], valueFor: (row: Row) => number | null): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const rows of racesRows) {
    const rankable = rows
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: Row; value: number } => isNumber(entry.value))
      .sort((left, right) => right.value - left.value || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    let previousValue: number | null = null;
    let previousRank = 0;
    rankable.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      ranks.set(entry.row.features.targetRunnerId, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return ranks;
}

function winnerCaptureRaces(racesRows: Row[][], ranks: Map<string, number>, topN: number): number {
  return racesRows.filter((rows) => rows.some((row) => row.outcome.won === true && (ranks.get(row.features.targetRunnerId) ?? Infinity) <= topN)).length;
}

function comparableRaceCount(evaluation: Evaluation) {
  return evaluation.raceRows.filter((rows) => rows.filter((row) => isNumber(evaluation.signal.value(row))).length >= 2).length;
}

function leadersByRace(evaluation: Evaluation): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const rows of evaluation.raceRows) {
    const leaders = rows.filter((row) => evaluation.ranks.get(row.features.targetRunnerId) === 1);
    if (leaders.length > 0) result.set(rows[0]!.features.targetRaceId, new Set(leaders.map((row) => row.features.targetRunnerId)));
  }
  return result;
}

function findEvaluation(evaluations: Evaluation[], year: Year, scope: ScopeKey, signal: RankSignalKey): Evaluation {
  const value = evaluations.find((evaluation) => evaluation.year === year && evaluation.scope === scope && evaluation.signal.key === signal);
  if (!value) throw new Error(`Missing evaluation ${year} ${scope} ${signal}`);
  return value;
}

const WEIGHT_BANDS = [
  { label: "8+ lb lighter", min: -Infinity, max: -8 },
  { label: "4-7 lb lighter", min: -7, max: -4 },
  { label: "1-3 lb lighter", min: -3, max: -1 },
  { label: "approximately same", min: 0, max: 0 },
  { label: "1-3 lb heavier", min: 1, max: 3 },
  { label: "4-7 lb heavier", min: 4, max: 7 },
  { label: "8+ lb heavier", min: 8, max: Infinity },
];

const WEIGHT_SIGNALS: RankSignalKey[] = ["todays_rating", "latest_speed", "best_l3_speed"];
const PERIODS = [...YEARS, "combined"] as const;
type Period = typeof PERIODS[number];
type WeightBand = typeof WEIGHT_BANDS[number];

function inWeightBand(row: Row, band: WeightBand) {
  const diff = row.todayMinusPriorWeightLbs;
  return diff !== null && diff >= band.min && diff <= band.max;
}

function weightMetrics(rows: Row[]) {
  const priced = rows.filter((row) => decimalSp(row) !== null);
  const market = selectionMetrics(priced);
  const all = selectionMetrics(rows);
  return { ...market, selections: all.selections, winners: all.winners, strike: all.strike,
    races: new Set(rows.map((row) => row.features.targetRaceId)).size,
    pricedSelections: priced.length, pricedWinners: market.winners, missingSp: rows.length - priced.length };
}

function buildWeightDiagnostic(contexts: Context[], evaluations: Evaluation[], priorRuns: Map<string, UsablePriorRun | null>, york: WeightTarget) {
  const coverage = contexts.map((context) => {
    const rated = context.rows.filter((row) => isNumber(row.features.latestTodaysRating));
    let reconstructed = 0;
    const mismatches: Array<{ runnerId: string; cached: number; reconstructed: number; priorRunnerId: string }> = [];
    for (const row of rated) {
      const prior = priorRuns.get(row.features.targetRunnerId);
      const rating = prior ? calculateTodaysRating({ historicalPerformanceRating: prior.performance,
        currentWeightCarriedLb: row.features.weightCarriedLbs })?.todaysRating ?? null : null;
      if (rating === null) continue;
      if (Math.abs(rating - row.features.latestTodaysRating!) <= 0.000001) reconstructed++;
      else mismatches.push({ runnerId: row.features.targetRunnerId, cached: row.features.latestTodaysRating!,
        reconstructed: rating, priorRunnerId: prior!.runnerId });
    }
    return { year: context.year, runners: context.rows.length, ratedRunners: rated.length,
      weightAvailable: context.rows.filter((row) => row.todayMinusPriorWeightLbs !== null).length,
      ratedWithWeight: rated.filter((row) => row.todayMinusPriorWeightLbs !== null).length,
      reconstructed, mismatchCount: mismatches.length, mismatches };
  });
  // A changed DB history must not silently assign weight bands to stale cached ratings.
  if (coverage.some((row) => row.mismatchCount > 0)) {
    throw new Error(`DB/cache Today's Rating reconstruction mismatch: ${JSON.stringify(coverage.map(({ mismatches, ...row }) => ({ ...row, examples: mismatches.slice(0, 3) })))}`);
  }
  const yorkPrior = priorRuns.get(york.features.targetRunnerId);
  if (!yorkPrior || york.features.weightCarriedLbs === null || yorkPrior.weightCarriedLbs === null) {
    throw new Error("York sanity check lacks a usable prior Turf performance/weight.");
  }
  const yorkRating = calculateTodaysRating({ historicalPerformanceRating: yorkPrior.performance,
    currentWeightCarriedLb: york.features.weightCarriedLbs })!.todaysRating;
  const sanityCheck = { horse: "Capitano Josepi", course: "York", targetRunnerId: YORK_RUNNER_ID,
    targetDate: york.features.raceDateTime.toISOString(), priorRunnerId: yorkPrior.runnerId,
    priorDate: yorkPrior.raceDateTime.toISOString(), latestUsableSpeed: yorkPrior.speed,
    priorWeight: yorkPrior.weightCarriedLbs, todayWeight: york.features.weightCarriedLbs,
    signedWeightDifference: york.features.weightCarriedLbs - yorkPrior.weightCarriedLbs,
    todaysRating: yorkRating, passed: Math.abs(yorkPrior.speed - 94.4) < 0.1 &&
      york.features.weightCarriedLbs - yorkPrior.weightCarriedLbs === -8 && Math.abs(yorkRating - 102.4) < 0.1 };
  if (!sanityCheck.passed) throw new Error(`York sanity check failed: ${JSON.stringify(sanityCheck)}`);
  const forPeriod = (period: Period, signal: RankSignalKey) => evaluations.filter((evaluation) =>
    evaluation.scope === "all" && evaluation.signal.key === signal && (period === "combined" || evaluation.year === period));
  const bandPerformance = PERIODS.flatMap((period) => WEIGHT_BANDS.flatMap((band) => WEIGHT_SIGNALS.map((signal) => ({
    period, band: band.label, signal,
    ...weightMetrics(forPeriod(period, signal).flatMap((evaluation) => evaluation.rank1).filter((row) => inWeightBand(row, band))),
  }))));
  const matchedComparisons = PERIODS.flatMap((period) => WEIGHT_BANDS.flatMap((band) =>
    (["latest_speed", "best_l3_speed"] as const).flatMap((comparator) =>
      ["all", ...(comparator === "best_l3_speed" ? ["older_peak_proxy"] : [])].map((subset) => {
        const todayRows: Row[] = [];
        const comparatorRows: Row[] = [];
        for (const today of forPeriod(period, "todays_rating")) {
          const other = findEvaluation(evaluations, today.year, "all", comparator);
          const otherByRace = groupBy(other.rank1, (row) => row.features.targetRaceId);
          const todayByRace = groupBy(today.rank1, (row) => row.features.targetRaceId);
          for (const [raceId, leaders] of todayByRace) {
            const rival = otherByRace.get(raceId);
            if (leaders.length !== 1 || rival?.length !== 1) continue;
            const leader = leaders[0]!;
            const competitor = rival[0]!;
            if (!inWeightBand(leader, band) || decimalSp(leader) === null || decimalSp(competitor) === null) continue;
            if (subset === "older_peak_proxy" && !(isNumber(competitor.features.bestSpeedLast3) &&
              isNumber(competitor.features.latestSpeedRating) && competitor.features.bestSpeedLast3 > competitor.features.latestSpeedRating)) continue;
            todayRows.push(leader);
            comparatorRows.push(competitor);
          }
        }
        const today = weightMetrics(todayRows);
        const other = weightMetrics(comparatorRows);
        return { period, band: band.label, comparator, subset, today, comparatorMetrics: other,
          aeDifference: today.ae !== null && other.ae !== null ? today.ae - other.ae : null };
      }))));
  const agreement = PERIODS.flatMap((period) => WEIGHT_BANDS.slice(0, 2).flatMap((band) =>
    ["agree", "disagree"].flatMap((relationship) => {
      const todayRows: Row[] = [];
      const rivalRows: Row[] = [];
      for (const today of forPeriod(period, "todays_rating")) {
        const other = findEvaluation(evaluations, today.year, "all", "latest_speed");
        const rivals = groupBy(other.rank1, (row) => row.features.targetRaceId);
        for (const [raceId, leaders] of groupBy(today.rank1, (row) => row.features.targetRaceId)) {
          const rival = rivals.get(raceId);
          if (leaders.length !== 1 || rival?.length !== 1) continue;
          const leader = leaders[0]!;
          const competitor = rival[0]!;
          const agrees = leader.features.targetRunnerId === competitor.features.targetRunnerId;
          if (!inWeightBand(leader, band) || agrees !== (relationship === "agree") ||
            decimalSp(leader) === null || decimalSp(competitor) === null) continue;
          todayRows.push(leader);
          rivalRows.push(competitor);
        }
      }
      return [{ period, band: band.label, relationship, signal: "todays_rating", ...weightMetrics(todayRows) },
        { period, band: band.label, relationship, signal: "latest_speed", ...weightMetrics(rivalRows) }];
    })));
  const replicatedBands = WEIGHT_BANDS.slice(0, 2).filter((band) => YEARS.every((year) =>
    matchedComparisons.filter((row) => row.period === year && row.band === band.label && row.subset === "all")
      .every((row) => row.today.ae !== null && row.today.ae > 1 && (row.aeDifference ?? 0) > 0) &&
    (() => {
      const today = agreement.find((row) => row.period === year && row.band === band.label && row.relationship === "disagree" && row.signal === "todays_rating");
      const latest = agreement.find((row) => row.period === year && row.band === band.label && row.relationship === "disagree" && row.signal === "latest_speed");
      return today?.ae !== null && latest?.ae !== null && (today?.ae ?? 0) > 1 && (today?.ae ?? 0) > (latest?.ae ?? 0);
    })()));
  const someImprovement = matchedComparisons.some((row) => row.period !== "combined" &&
    row.subset === "all" && WEIGHT_BANDS.slice(0, 2).some((band) => band.label === row.band) && (row.aeDifference ?? 0) > 0);
  const strong = replicatedBands.some((band) => YEARS.every((year) => {
    const row = agreement.find((row) => row.period === year && row.band === band.label && row.relationship === "disagree" && row.signal === "todays_rating")!;
    return row.expectedWinners !== null && row.winners - 1.96 * Math.sqrt(row.winners) > row.expectedWinners;
  }));
  const classification = replicatedBands.length ? (strong ? "STRONG REPLICATED SIGNAL" : "MODEST REPLICATED SIGNAL") :
    someImprovement ? "WEAK / UNSTABLE" : "NO USEFUL SIGNAL";
  return { generatedAt: new Date().toISOString(), coverage, bandPerformance, matchedComparisons, agreement, sanityCheck,
    verdict: { classification, replicatedBands: replicatedBands.map((band) => band.label),
      displayOnly: "Yes. This diagnostic alone does not justify changing the production role of Today's Rating.",
      prospectiveMonitoring: someImprovement || replicatedBands.length ? "Yes, as a fixed-band shadow diagnostic; the evidence does not establish a betting edge." : "Low priority; no useful market-adjusted advantage found.",
      modelExperiment: replicatedBands.length ? "A separate preregistered holdout experiment is justified; no production model change is recommended here." : "No. The weight-swing advantage has not replicated in both years after market control." } };
}

type WeightDiagnostic = ReturnType<typeof buildWeightDiagnostic>;

function renderWeightDiagnostic(lines: string[], diagnostic: WeightDiagnostic) {
  lines.push("## Weight-Swing Effect", "",
    "DB-backed lookup only. Signed difference = today's weight minus the latest usable prior Turf run's weight. Negative means lighter today; approximately same means exactly 0 lb. Rankings and cached signal values are unchanged.", "",
    "### Reconstruction And Coverage", "");
  table(lines, diagnostic.coverage.map((row) => ({ year: row.year, runners: row.runners,
    "rated runners": row.ratedRunners, "weight available": row.weightAvailable,
    "rated with weight": row.ratedWithWeight, reconstructed: row.reconstructed, mismatches: row.mismatchCount })));
  lines.push("### Rank-1 Performance By Each Selection's Weight Band", "",
    "All Turf, separately for 2025, 2026 and combined. Ranks are calculated across the original race field before band filtering; every tied rank-1 runner remains a selection. A/E and ROI use priced selections only. SP is decimal, unnormalised, with no commission or dead-heat adjustment.", "");
  table(lines, diagnostic.bandPerformance.map((row) => ({ period: row.period, band: row.band, signal: row.signal,
    races: row.races, ...metricsRow(row), "priced selections": row.pricedSelections, "priced winners": row.pricedWinners, "missing SP": row.missingSp })));
  lines.push("### Same-Race Comparisons", "",
    "Bands below are anchored to Today's Rating's leader. Both signals must have one unique leader and valid SP. Comparator leaders may belong to a different weight band: keeping the same races controls the selection cohort. Ties and missing prices are excluded here. Each large-swing band stays separate.", "",
    "The older-peak subset means the Best L3 leader's Best L3 exceeds its Latest Speed, so its peak is not its latest usable speed. This is a proxy for an older peak, not a direct reconstruction of the peak's date; association does not establish that weight caused the advantage.", "");
  table(lines, diagnostic.matchedComparisons.map((row) => ({ period: row.period, band: row.band,
    comparator: row.comparator, subset: row.subset, races: row.today.races,
    "Today's winners": row.today.winners, "Today's expected": num(row.today.expectedWinners),
    "Today's A/E": num(row.today.ae), "Today's ROI": pct(row.today.roi),
    "comparator winners": row.comparatorMetrics.winners, "comparator expected": num(row.comparatorMetrics.expectedWinners),
    "comparator A/E": num(row.comparatorMetrics.ae), "comparator ROI": pct(row.comparatorMetrics.roi),
    "A/E difference": num(row.aeDifference) })));
  lines.push("### Materially Lighter: Agreement / Disagreement", "",
    "The two lighter bands are kept separate and anchored to Today's Rating's leader. Unique leaders and valid SP for both are required. Reporting both sides of disagreements tests whether the changed leader helps after market control.", "");
  table(lines, diagnostic.agreement.map((row) => ({ period: row.period, band: row.band,
    relationship: row.relationship, signal: row.signal, races: row.races, winners: row.winners,
    "market expected winners": num(row.expectedWinners), "A/E": num(row.ae) })));
  lines.push("### Capitano Josepi York Sanity Check", "");
  table(lines, [diagnostic.sanityCheck]);
  lines.push("Validation only; this case is outside the historical cache window and is not included in the performance samples.", "",
    "### Weight-Adjustment Verdict", "", `**${diagnostic.verdict.classification}**`, "",
    "Replication requires the same fixed materially-lighter band to exceed both comparator A/E values and A/E 1 in both years, plus a market-adjusted advantage in Latest Speed disagreements in both years. Strong evidence additionally requires the approximate 95% Poisson lower bound on disagreement wins to exceed expectation in each year. These are descriptive evidence checks, not optimised betting thresholds; no multiple-comparison correction or causal claim is made.", "",
    `Replicated bands: ${diagnostic.verdict.replicatedBands.join(", ") || "none"}.`, "",
    `A. Should Today's Rating remain display-only? ${diagnostic.verdict.displayOnly}`, "",
    `B. Is the weight-adjustment component worth prospective monitoring? ${diagnostic.verdict.prospectiveMonitoring}`, "",
    `C. Is any further model experiment justified? ${diagnostic.verdict.modelExperiment}`, "");
}

function validateWeightSwing() {
  const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  for (let diff = -30; diff <= 30; diff++) {
    const matching = WEIGHT_BANDS.filter((band) => diff >= band.min && diff <= band.max);
    assert(matching.length === 1, `Band partition failed at ${diff}`);
  }
  assert(WEIGHT_BANDS[0]!.max === -8 && WEIGHT_BANDS[1]!.min === -7 && WEIGHT_BANDS[1]!.max === -4,
    "Materially-lighter band boundaries changed");
  const performance = calculateWeightAdjustedPerformance({ rawSpeedRating: 94.4, weightCarriedLb: 133 })!;
  const today = calculateTodaysRating({ historicalPerformanceRating: performance.performanceRating, currentWeightCarriedLb: 125 })!;
  assert(Math.abs(today.todaysRating - 102.4) < 0.000001 && 125 - 133 === -8, "Signed weight reconstruction failed");
  const fixture = (id: string, race: string, won: boolean, sp: string | null) => ({
    features: { targetRunnerId: id, targetRaceId: race }, outcome: { won, startingPriceDecimal: sp },
  }) as Row;
  const metrics = weightMetrics([fixture("a", "r", true, "4"), fixture("b", "r", false, "2"), fixture("c", "s", true, null)]);
  assert(metrics.races === 2 && metrics.selections === 3 && metrics.winners === 2 && metrics.pricedWinners === 1 &&
    metrics.expectedWinners === 0.75 && metrics.ae === 1 / 0.75 && metrics.roi === 1,
    "Priced A/E, ROI, tie selection or race counting failed");
  const ranks = rankRows([[fixture("a", "r", false, "2"), fixture("b", "r", false, "2")]], () => 100);
  assert(ranks.get("a") === 1 && ranks.get("b") === 1, "Existing rank-1 tie handling changed");
  const york: WeightTarget = { features: { targetRunnerId: YORK_RUNNER_ID, horseId: "york-horse",
    raceDateTime: new Date("2026-10-09T12:05:00Z"), weightCarriedLbs: 125 } };
  const prior: UsablePriorRun = { runnerId: "prior", horseId: "york-horse", raceDateTime: new Date("2026-08-30T12:00:00Z"),
    raceName: null, raceType: null, raceTypeCode: null, courseName: "Yarmouth", going: null, surface: "TURF",
    distanceYards: 1543, finishingPosition: 1, resultStatus: "finished", weightCarriedLbs: 133,
    speed: 94.4, performance: performance.performanceRating };
  const priors = new Map<string, UsablePriorRun | null>([[YORK_RUNNER_ID, prior]]);
  const contexts = YEARS.map((year): Context => {
    const make = (id: string, race: string, speed: number, swing: number, best: number, won: boolean): Row => {
      const row = fixture(`${year}-${id}`, `${year}-${race}`, won, "4");
      row.features = { ...row.features, horseId: id, raceDateTime: new Date(`${year}-09-01T12:00:00Z`),
        weightCarriedLbs: 125, latestSpeedRating: speed, bestSpeedLast3: best, latestTodaysRating: speed - swing };
      row.latestPriorTurfRunWeightLbs = 125 - swing;
      row.todayMinusPriorWeightLbs = swing;
      priors.set(row.features.targetRunnerId, { ...prior, weightCarriedLbs: 125 - swing, speed,
        performance: speed + (125 - swing) - DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB });
      return row;
    };
    const rows = [make("a", "different", 94, -8, 94, true), make("b", "different", 99, 0, 105, false),
      make("c", "same", 100, -8, 100, false), make("d", "same", 90, 0, 90, true)];
    return { year, cacheFamily: "turf_flat", cacheWindow: "fixture", actualCoverage: "fixture", rows,
      races: [...groupBy(rows, (row) => row.features.targetRaceId)].map(([id, raceRows]) => ({ id, rows: raceRows,
        medianWeightLbs: 125, scope: { all: true, handicap: true, non_handicap: false } })) };
  });
  const evaluations = contexts.flatMap((context) => SIGNALS.filter((signal) => WEIGHT_SIGNALS.includes(signal.key))
    .map((signal) => evaluate(context, "all", signal)));
  const diagnostic = buildWeightDiagnostic(contexts, evaluations, priors, york);
  const matched = diagnostic.matchedComparisons.find((row) => row.period === "combined" && row.band === "8+ lb lighter" &&
    row.comparator === "latest_speed" && row.subset === "all")!;
  assert(matched.today.races === 4 && matched.today.winners === 2 && matched.comparatorMetrics.winners === 0,
    "Same-race comparison or combined pooling failed");
  const older = diagnostic.matchedComparisons.find((row) => row.period === "2025" && row.band === "8+ lb lighter" &&
    row.comparator === "best_l3_speed" && row.subset === "older_peak_proxy")!;
  assert(older.today.races === 1, "Older-peak subset failed");
  const disagree = diagnostic.agreement.find((row) => row.period === "2025" && row.band === "8+ lb lighter" &&
    row.relationship === "disagree" && row.signal === "todays_rating")!;
  assert(disagree.races === 1 && disagree.winners === 1 && disagree.expectedWinners === 0.25,
    "Band-anchored disagreement or market expectation failed");
}

function todayAnswer(evaluations: Evaluation[]) {
  const pairs = YEARS.map((year) => {
    const today = selectionMetrics(findEvaluation(evaluations, year, "all", "todays_rating").rank1);
    const latest = selectionMetrics(findEvaluation(evaluations, year, "all", "latest_speed").rank1);
    const best = selectionMetrics(findEvaluation(evaluations, year, "all", "best_l3_speed").rank1);
    const tpr = selectionMetrics(findEvaluation(evaluations, year, "all", "tpr").rank1);
    return `${year}: Today's A/E ${num(today.ae)} vs Latest ${num(latest.ae)}, Best L3 ${num(best.ae)}, TPR ${num(tpr.ae)}`;
  });
  return pairs.join("; ");
}

function stability(left: Metrics, right: Metrics) {
  if (left.selections < 30 || right.selections < 30) return "too small";
  const leftPositive = (left.ae ?? 0) >= 1 || (left.roi ?? 0) >= 0;
  const rightPositive = (right.ae ?? 0) >= 1 || (right.roi ?? 0) >= 0;
  if (leftPositive && rightPositive) return "stable direction";
  if (leftPositive !== rightPositive) return "reversal";
  return left.selections >= 100 && right.selections >= 100 ? "stable weak/negative" : "one-year only";
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow) {
  return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null;
}

function isHandicapRace(row: Row | HistoricalTargetRunnerMetricsRow) {
  const values = [row.features.raceName, row.features.raceType, row.features.raceTypeCode]
    .filter((value): value is string => value !== null)
    .join(" ")
    .toLowerCase();
  return /\bhcap\b|handicap/.test(values);
}

function sourceImportJoinCondition() {
  return and(
    eq(sourceImports.source, SOURCE),
    eq(sourceImports.sourceId, races.sourceId),
    eq(sourceImports.sourceType, RESULT_SOURCE_TYPE),
  )!;
}

function impliedWinProbability(row: Row | undefined) {
  const sp = row ? decimalSp(row) : null;
  return sp === null ? null : 1 / sp;
}

function decimalSp(row: Row): number | null {
  const value = Number(row.outcome.startingPriceDecimal);
  return Number.isFinite(value) && value > 1 ? value : null;
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function scopeLabel(scope: ScopeKey) {
  return SCOPES.find((entry) => entry.key === scope)?.label ?? scope;
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("_No rows._", "");
    return;
  }
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => escapeCell(row[header])).join(" | ")} |`);
  }
  lines.push("");
}

function escapeCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function count<T>(values: T[], predicate: (value: T) => boolean) {
  return values.filter(predicate).length;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function gbp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `£${value.toFixed(2)}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
