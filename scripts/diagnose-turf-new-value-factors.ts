import { writeFile } from "node:fs/promises";
import { and, eq, inArray, lt } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, jockeys, raceRunners, races } from "@/db/schema";
import { settleSelection } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";
type Db = ReturnType<typeof createDbConnection>["db"];
type Classification = "favourable both years" | "favourable 2025 only" | "favourable 2026 only" | "reversed" | "neutral" | "too sparse";

type Context = {
  year: Year;
  rows: RankedResearchRow[];
  features: Map<string, ExtraFeatures>;
};

type Metrics = {
  runners: number;
  settled: number;
  winners: number;
  strike: number | null;
  averageSp: number | null;
  medianSp: number | null;
  profitLoss: number;
  roi: number | null;
  expectedWins: number;
  ae: number | null;
};

type ExtraFeatures = {
  drawThird: string;
  courseForm: string;
  cdForm: string;
  goingForm: string;
  distanceForm: string;
  ageGroup: string;
  classMovement: string;
  orMovement: string;
  weightChange: string;
  jockeyChange: string;
  headgear: string;
  orCompetitiveness: string;
  tprMedianCompetitiveness: string;
  tprGapCompetitiveness: string;
};

type TargetMeta = {
  runnerId: string;
  jockeyId: string | null;
  jockeyName: string | null;
  headgear: string | null;
};

type HistoryRun = {
  runnerId: string;
  horseId: string;
  trainerId: string | null;
  jockeyId: string | null;
  headgear: string | null;
  raceDateTime: Date;
  raceDate: string;
  courseId: string;
  raceClass: string | null;
  distanceYards: number | null;
  going: string | null;
  officialRating: number | null;
  weightCarriedLbs: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
};

type FeatureDefinition = {
  key: keyof ExtraFeatures;
  title: string;
  buckets: string[];
};

const OUTPUT_PATH = "/tmp/turf-new-value-factors.md";
const YEARS: Year[] = ["2025", "2026"];
const SAMPLE_FLOOR = 50;
const QUERY_CHUNK_SIZE = 5_000;

async function main() {
  const db = createDbConnection().db;
  const contexts = await loadContexts(db);
  const features = featureDefinitions();
  const lines: string[] = [];
  writeReport(lines, contexts, features);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const metrics = metricsFor(context.rows);
    console.log(`${context.year}: runners ${metrics.runners}, settled ${metrics.settled}, ROI ${pct(metrics.roi)}, A/E ${number(metrics.ae)}`);
  }
  process.exit(0);
}

async function loadContexts(db: Db): Promise<Context[]> {
  const baseContexts = await Promise.all(YEARS.map(async (year) => {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    if (!cache) throw new Error(`Missing compatible Turf cache for ${year}`);
    return {
      year,
      rows: rankRows(cache.rows.filter((row) => row.features.raceCode === "turf")),
    };
  }));
  const allRows = baseContexts.flatMap((context) => context.rows);
  const targetIds = allRows.map((row) => row.features.targetRunnerId);
  const horseIds = unique(allRows.map((row) => row.features.horseId));
  const jockeyMeta = await loadTargetMeta(db, targetIds);
  const maxDate = allRows.reduce((max, row) => row.features.raceDateTime > max ? row.features.raceDateTime : max, allRows[0]!.features.raceDateTime);
  const horseHistory = groupBy(await loadHorseHistory(db, horseIds, maxDate), (run) => run.horseId);
  const competitiveness = buildCompetitiveness(baseContexts);

  return baseContexts.map((context) => ({
    ...context,
    features: (() => {
      const drawBuckets = buildDrawBuckets(context.rows);
      return new Map(context.rows.map((row) => [
        row.features.targetRunnerId,
        deriveExtraFeatures(row, drawBuckets, jockeyMeta.get(row.features.targetRunnerId) ?? null, horseHistory, competitiveness),
      ]));
    })(),
  }));
}

async function loadTargetMeta(db: Db, runnerIds: string[]): Promise<Map<string, TargetMeta>> {
  const rows = (await Promise.all(chunks(runnerIds, QUERY_CHUNK_SIZE).map((chunk) =>
    db.select({
      runnerId: raceRunners.id,
      jockeyId: raceRunners.jockeyId,
      jockeyName: jockeys.displayName,
      headgear: raceRunners.headgear,
    })
      .from(raceRunners)
      .leftJoin(jockeys, eq(raceRunners.jockeyId, jockeys.id))
      .where(inArray(raceRunners.id, chunk))
  ))).flat();
  return new Map(rows.map((row) => [row.runnerId, row]));
}

async function loadHorseHistory(db: Db, horseIds: string[], maxDate: Date): Promise<HistoryRun[]> {
  return (await Promise.all(chunks(horseIds, QUERY_CHUNK_SIZE).map((chunk) =>
    db.select(historySelect())
      .from(raceRunners)
      .innerJoin(races, eq(raceRunners.raceId, races.id))
      .innerJoin(courses, eq(races.courseId, courses.id))
      .where(and(inArray(raceRunners.horseId, chunk), lt(races.raceDatetime, maxDate)))
  ))).flat().filter(hasRaceDateTime);
}

function historySelect() {
  return {
    runnerId: raceRunners.id,
    horseId: raceRunners.horseId,
    trainerId: raceRunners.trainerId,
    jockeyId: raceRunners.jockeyId,
    headgear: raceRunners.headgear,
    raceDateTime: races.raceDatetime,
    raceDate: races.raceDate,
    courseId: races.courseId,
    raceClass: races.raceClass,
    distanceYards: races.distanceYards,
    going: races.going,
    officialRating: raceRunners.officialRating,
    weightCarriedLbs: raceRunners.weightCarriedLbs,
    finishingPosition: raceRunners.finishingPosition,
    resultStatus: raceRunners.resultStatus,
  };
}

function deriveExtraFeatures(
  row: RankedResearchRow,
  drawBuckets: Map<string, string>,
  targetMeta: TargetMeta | null,
  horseHistory: Map<string, HistoryRun[]>,
  competitiveness: Map<string, { or: string; tprMedian: string; tprGap: string }>,
): ExtraFeatures {
  const priorHorseRuns = priorRuns(horseHistory.get(row.features.horseId) ?? [], row.features.raceDateTime);
  const latestRun = priorHorseRuns[0] ?? null;
  return {
    drawThird: drawBuckets.get(row.features.targetRunnerId) ?? "missing",
    courseForm: formBucketFor("course", priorHorseRuns.filter((run) => run.courseId === row.features.courseId)),
    cdForm: formBucketFor("C&D", priorHorseRuns.filter((run) => run.courseId === row.features.courseId && run.distanceYards === row.features.distanceYards)),
    goingForm: formBucketFor("broad-going", priorHorseRuns.filter((run) => broadGoing(run.going) !== "missing" && broadGoing(run.going) === broadGoing(row.features.going))),
    distanceForm: formBucketFor("distance-band", priorHorseRuns.filter((run) => distanceBand(run.distanceYards) === distanceBand(row.features.distanceYards) && distanceBand(run.distanceYards) !== "missing")),
    ageGroup: ageGroup(row.features.horseAge),
    classMovement: classMovement(row.features.raceClass, latestRun?.raceClass ?? null),
    orMovement: orMovement(row.features.officialRating, row.features.previousOr),
    weightChange: weightChange(row.features.weightCarriedLbs, latestRun?.weightCarriedLbs ?? null),
    jockeyChange: jockeyChange(targetMeta?.jockeyId ?? null, latestRun?.jockeyId ?? null),
    headgear: headgearBucket(targetMeta?.headgear ?? null, latestRun?.headgear ?? null),
    orCompetitiveness: competitiveness.get(row.features.targetRaceId)?.or ?? "missing",
    tprMedianCompetitiveness: competitiveness.get(row.features.targetRaceId)?.tprMedian ?? "missing",
    tprGapCompetitiveness: competitiveness.get(row.features.targetRaceId)?.tprGap ?? "missing",
  };
}

function writeReport(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("# Turf New Betting-Factor Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No TPR, Research, Today, saved/frozen rule, cache, importer, schema, or holdout behavior was changed.");
  lines.push("");
  writeAvailability(lines);
  writeFeatureTables(lines, contexts, features);
  writeReplication(lines, contexts, features);
  writeOutlierStress(lines, contexts, features);
  writeFeatureSummary(lines, contexts, features);
  writeConclusion(lines, contexts, features);
}

function writeAvailability(lines: string[]) {
  lines.push("## 1. Feature Availability Audit");
  lines.push("");
  table(lines, [
    { feature: "draw / stall position", status: "directly available", source: "cache features.draw plus race runner counts" },
    { feature: "course form", status: "derivable exactly from existing historical rows", source: "race_runners/races courseId, prior horse runs" },
    { feature: "course-and-distance form", status: "derivable exactly from existing historical rows", source: "courseId plus exact distanceYards, matching existing exact-distance helper convention" },
    { feature: "going-specific horse form", status: "derivable approximately", source: "races.going normalized to broad diagnostic going bands" },
    { feature: "distance suitability", status: "derivable approximately", source: "distanceYards mapped to fixed broad Turf distance bands" },
    { feature: "age profile", status: "directly available", source: "cache features.horseAge" },
    { feature: "class movement", status: "derivable exactly from existing historical rows", source: "target raceClass vs latest prior run raceClass" },
    { feature: "Official Rating movement", status: "directly available", source: "cache officialRating and previousOr" },
    { feature: "weight change", status: "derivable exactly from existing historical rows", source: "target weightCarriedLbs vs latest prior run weightCarriedLbs" },
    { feature: "trainer recent form", status: "omitted from screen", source: "requires broad trainer-history aggregation outside current cache; not added in this narrow diagnostic" },
    { feature: "trainer course record", status: "omitted from screen", source: "requires broad trainer-course aggregation outside current cache; not added in this narrow diagnostic" },
    { feature: "jockey change", status: "derivable exactly from existing historical rows", source: "race_runners.jockeyId and latest prior horse run jockeyId" },
    { feature: "jockey prior strike rate", status: "omitted from screen", source: "requires broad jockey-history aggregation outside current cache; not added in this narrow diagnostic" },
    { feature: "headgear changes", status: "derivable exactly from existing historical rows", source: "race_runners.headgear and latest prior headgear" },
    { feature: "race competitiveness", status: "directly derivable from cache", source: "within-race OR and TPR distributions; 2025 quartiles frozen to 2026" },
  ]);
  lines.push("");
}

function writeFeatureTables(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  let section = 2;
  for (const feature of features) {
    lines.push(`## ${section}. ${feature.title}`);
    for (const context of contexts) {
      lines.push("");
      lines.push(`### ${context.year}`);
      table(lines, feature.buckets.map((bucket) => ({
        bucket,
        ...metricColumns(metricsFor(rowsFor(context, feature, bucket))),
      })));
    }
    lines.push("");
    section += 1;
  }
}

function writeReplication(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("## 16. Replication Summary");
  lines.push("");
  table(lines, features.flatMap((feature) => feature.buckets.map((bucket) => {
    const left = metricsFor(rowsFor(contextFor(contexts, "2025"), feature, bucket));
    const right = metricsFor(rowsFor(contextFor(contexts, "2026"), feature, bucket));
    return {
      feature: feature.title,
      bucket,
      "2025 settled": left.settled,
      "2025 ROI": pct(left.roi),
      "2025 A/E": number(left.ae),
      "2026 settled": right.settled,
      "2026 ROI": pct(right.roi),
      "2026 A/E": number(right.ae),
      classification: classify(left, right),
    };
  })));
  lines.push("");
}

function writeOutlierStress(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("## 17. Outlier Stress");
  lines.push("");
  const candidates = stressCandidates(contexts, features);
  if (candidates.length === 0) {
    lines.push("No bucket had A/E >1.0 in both years or positive ROI in both years with adequate sample.");
    lines.push("");
    return;
  }
  table(lines, candidates.map((candidate) => {
    const original = metricsFor(candidate.rows);
    const stressedRows = removeBiggestPricedWinner(candidate.rows);
    const stressed = metricsFor(stressedRows);
    const winner = biggestPricedWinner(candidate.rows);
    return {
      feature: candidate.feature.title,
      bucket: candidate.bucket,
      year: candidate.context.year,
      settled: original.settled,
      "original ROI": pct(original.roi),
      "original A/E": number(original.ae),
      "ROI without biggest winner": pct(stressed.roi),
      "A/E without biggest winner": number(stressed.ae),
      "biggest winner SP": number(winner?.sp ?? null),
      "biggest winner P/L contribution": pct(original.profitLoss === 0 ? null : ((winner?.profit ?? 0) / original.profitLoss) * 100),
    };
  }));
  lines.push("");
}

function writeFeatureSummary(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("## 18. Feature-Family Summary");
  lines.push("");
  table(lines, features.map((feature) => {
    const spread2025 = aeSpread(contextFor(contexts, "2025"), feature);
    const spread2026 = aeSpread(contextFor(contexts, "2026"), feature);
    const repeated = repeatedBuckets(contexts, feature);
    return {
      feature: feature.title,
      "2025 A/E spread": number(spread2025),
      "2026 A/E spread": number(spread2026),
      "repeat favourable buckets": repeated.length === 0 ? "none" : repeated.join("; "),
      "sample adequacy": sampleAdequacy(contexts, feature),
      "stress": stressCandidates(contexts, [feature]).length === 0 ? "not triggered" : "see stress table",
    };
  }).sort((left, right) => Number.parseFloat(String(right["2025 A/E spread"])) - Number.parseFloat(String(left["2025 A/E spread"]))));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("## 19. Conclusion");
  lines.push("");
  numbered(lines, [
    "Cleanly screened features: draw, course form, exact C&D form, age, class movement, OR movement, weight change, jockey change, headgear changes, and race competitiveness. Going and distance history are screened as broad approximations from existing fields. Trainer recent/course form and jockey prior strike rate were omitted because they require broad trainer/jockey aggregation outside the current cache path.",
    `Strongest repeatable A/E separation: ${strongestSeparation(contexts, features)}.`,
    `Draw global signal: ${featureConclusion(contexts, featureByKey(features, "drawThird"))}`,
    `Course / C&D form: course ${featureConclusion(contexts, featureByKey(features, "courseForm"))} C&D ${featureConclusion(contexts, featureByKey(features, "cdForm"))}`,
    `Going / distance history: going ${featureConclusion(contexts, featureByKey(features, "goingForm"))} distance ${featureConclusion(contexts, featureByKey(features, "distanceForm"))}`,
    `Class movement: ${featureConclusion(contexts, featureByKey(features, "classMovement"))}`,
    `OR movement: ${featureConclusion(contexts, featureByKey(features, "orMovement"))}`,
    `Weight change: ${featureConclusion(contexts, featureByKey(features, "weightChange"))}`,
    "Trainer recent/course form: not screened in this run; both need broad trainer-history aggregation not present in the cache path.",
    `Jockey/headgear: jockey change ${featureConclusion(contexts, featureByKey(features, "jockeyChange"))} jockey prior not screened; headgear ${featureConclusion(contexts, featureByKey(features, "headgear"))}`,
    `Race competitiveness: OR spread ${featureConclusion(contexts, featureByKey(features, "orCompetitiveness"))} TPR median spread ${featureConclusion(contexts, featureByKey(features, "tprMedianCompetitiveness"))} TPR gap ${featureConclusion(contexts, featureByKey(features, "tprGapCompetitiveness"))}`,
    `Follow-up candidates: ${followUpCandidates(contexts, features)}`,
    repeatedAny(contexts, features) ? "At least one bucket replicated by A/E; treat it only as a follow-up diagnostic candidate, not a betting rule." : "No bucket replicated strongly enough to recommend a betting rule from this screen.",
  ]);
}

function featureDefinitions(): FeatureDefinition[] {
  return [
    { key: "drawThird", title: "Draw / Stall Position", buckets: ["lowest third", "middle third", "highest third", "missing"] },
    { key: "courseForm", title: "Course Form", buckets: ["no prior course run", "prior course run, no win", "prior course win", "missing"] },
    { key: "cdForm", title: "Course-And-Distance Form", buckets: ["no prior C&D run", "prior C&D run, no win", "prior C&D win", "missing"] },
    { key: "goingForm", title: "Going-Specific Horse Form", buckets: ["no prior broad-going run", "prior broad-going run, no win", "prior broad-going win", "missing"] },
    { key: "distanceForm", title: "Distance Suitability", buckets: ["no prior distance-band run", "prior distance-band run, no win", "prior distance-band win", "missing"] },
    { key: "ageGroup", title: "Age Profile", buckets: ["2yo", "3yo", "4yo", "5yo+", "missing"] },
    { key: "classMovement", title: "Class Movement", buckets: ["dropping 2+ classes", "dropping 1 class", "same class", "rising 1 class", "rising 2+ classes", "missing"] },
    { key: "orMovement", title: "Official Rating Movement", buckets: ["down 5+", "down 2-4", "down 1", "unchanged", "up 1", "up 2-4", "up 5+", "missing"] },
    { key: "weightChange", title: "Weight Change From Previous Run", buckets: ["7lb+ less", "3-6lb less", "within 2lb", "3-6lb more", "7lb+ more", "missing"] },
    { key: "jockeyChange", title: "Jockey Change", buckets: ["same jockey as previous run", "changed jockey", "missing"] },
    { key: "headgear", title: "Headgear Changes", buckets: ["no headgear", "first-time headgear", "repeat headgear", "headgear removed", "missing/unknown"] },
    { key: "orCompetitiveness", title: "Race Competitiveness: Top OR Minus Median OR", buckets: ["low spread", "mid-low spread", "mid-high spread", "high spread", "missing"] },
    { key: "tprMedianCompetitiveness", title: "Race Competitiveness: Top TPR Minus Median TPR", buckets: ["low spread", "mid-low spread", "mid-high spread", "high spread", "missing"] },
    { key: "tprGapCompetitiveness", title: "Race Competitiveness: TPR Rank-1 Gap", buckets: ["low spread", "mid-low spread", "mid-high spread", "high spread", "missing"] },
  ];
}

function rowsFor(context: Context, feature: FeatureDefinition, bucket: string): RankedResearchRow[] {
  return context.rows.filter((row) => context.features.get(row.features.targetRunnerId)?.[feature.key] === bucket);
}

function metricsFor(rows: RankedResearchRow[]): Metrics {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0
    );
  const winners = settled.filter((entry) => entry.row.outcome.won).length;
  const profitLoss = settled.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const sps = settled.map((entry) => entry.settlement.settlementOddsDecimal);
  return {
    runners: rows.length,
    settled: settled.length,
    winners,
    strike: settled.length === 0 ? null : (winners / settled.length) * 100,
    averageSp: average(sps),
    medianSp: median(sps),
    profitLoss,
    roi: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
    expectedWins,
    ae: expectedWins === 0 ? null : winners / expectedWins,
  };
}

function metricColumns(metrics: Metrics) {
  return {
    runners: metrics.runners,
    settled: metrics.settled,
    winners: metrics.winners,
    strike: pct(metrics.strike),
    "avg SP": number(metrics.averageSp),
    "median SP": number(metrics.medianSp),
    "P/L": money(metrics.profitLoss),
    ROI: pct(metrics.roi),
    "A/E": number(metrics.ae),
  };
}

function buildDrawBuckets(rows: RankedResearchRow[]): Map<string, string> {
  const buckets = new Map<string, string>();
  for (const raceRows of groupBy(rows, (row) => row.features.targetRaceId).values()) {
    const sorted = raceRows
      .filter((row) => row.features.draw !== null)
      .sort((left, right) =>
        (left.features.draw ?? 0) - (right.features.draw ?? 0) ||
        left.features.targetRunnerId.localeCompare(right.features.targetRunnerId)
      );
    const third = Math.ceil(sorted.length / 3);
    sorted.forEach((row, index) => {
      if (index < third) buckets.set(row.features.targetRunnerId, "lowest third");
      else if (index < third * 2) buckets.set(row.features.targetRunnerId, "middle third");
      else buckets.set(row.features.targetRunnerId, "highest third");
    });
  }
  return buckets;
}

function ageGroup(age: number | null): string {
  if (age === null) return "missing";
  if (age === 2) return "2yo";
  if (age === 3) return "3yo";
  if (age === 4) return "4yo";
  return "5yo+";
}

function classMovement(current: string | null, previous: string | null): string {
  const currentClass = raceClassNumber(current);
  const previousClass = raceClassNumber(previous);
  if (currentClass === null || previousClass === null) return "missing";
  const diffValue = currentClass - previousClass;
  if (diffValue <= -2) return "dropping 2+ classes";
  if (diffValue === -1) return "dropping 1 class";
  if (diffValue === 0) return "same class";
  if (diffValue === 1) return "rising 1 class";
  return "rising 2+ classes";
}

function orMovement(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "missing";
  const delta = current - previous;
  if (delta <= -5) return "down 5+";
  if (delta <= -2) return "down 2-4";
  if (delta === -1) return "down 1";
  if (delta === 0) return "unchanged";
  if (delta === 1) return "up 1";
  if (delta <= 4) return "up 2-4";
  return "up 5+";
}

function weightChange(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "missing";
  const delta = current - previous;
  if (delta <= -7) return "7lb+ less";
  if (delta <= -3) return "3-6lb less";
  if (Math.abs(delta) <= 2) return "within 2lb";
  if (delta <= 6) return "3-6lb more";
  return "7lb+ more";
}

function jockeyChange(current: string | null, previous: string | null): string {
  if (!current || !previous) return "missing";
  return current === previous ? "same jockey as previous run" : "changed jockey";
}

function headgearBucket(currentRaw: string | null, previousRaw: string | null): string {
  const current = normalizeHeadgear(currentRaw);
  const previous = normalizeHeadgear(previousRaw);
  if (current === "missing" && previous === "missing") return "missing/unknown";
  if (current === "none") return previous === "none" || previous === "missing" ? "no headgear" : "headgear removed";
  if (previous === "none" || previous === "missing") return "first-time headgear";
  return current === previous ? "repeat headgear" : "repeat headgear";
}

function buildCompetitiveness(contexts: Array<{ year: Year; rows: RankedResearchRow[] }>) {
  const raceStats = contexts.flatMap((context) => raceCompetitivenessRows(context.rows).map((entry) => ({ ...entry, year: context.year })));
  const qOr = quartiles(raceStats.filter((entry) => entry.year === "2025").map((entry) => entry.orSpread).filter(isNumber));
  const qTprMedian = quartiles(raceStats.filter((entry) => entry.year === "2025").map((entry) => entry.tprMedianSpread).filter(isNumber));
  const qTprGap = quartiles(raceStats.filter((entry) => entry.year === "2025").map((entry) => entry.tprGap).filter(isNumber));
  return new Map(raceStats.map((entry) => [entry.raceId, {
    or: quartileBucket(entry.orSpread, qOr),
    tprMedian: quartileBucket(entry.tprMedianSpread, qTprMedian),
    tprGap: quartileBucket(entry.tprGap, qTprGap),
  }]));
}

function raceCompetitivenessRows(rows: RankedResearchRow[]) {
  return [...groupBy(rows, (row) => row.features.targetRaceId).entries()].map(([raceId, raceRows]) => {
    const ors = raceRows.map((row) => row.features.officialRating).filter(isNumber);
    const tprs = raceRows.map((row) => row.turfPerformance?.rating ?? null).filter(isNumber);
    const tprTop = [...tprs].sort((left, right) => right - left);
    return {
      raceId,
      orSpread: ors.length === 0 ? null : Math.max(...ors) - (median(ors) ?? Math.max(...ors)),
      tprMedianSpread: tprs.length === 0 ? null : Math.max(...tprs) - (median(tprs) ?? Math.max(...tprs)),
      tprGap: tprTop.length < 2 ? null : tprTop[0]! - tprTop[1]!,
    };
  });
}

function classify(left: Metrics, right: Metrics): Classification {
  if (left.settled < SAMPLE_FLOOR || right.settled < SAMPLE_FLOOR) return "too sparse";
  const leftGood = (left.ae ?? -Infinity) > 1;
  const rightGood = (right.ae ?? -Infinity) > 1;
  if (leftGood && rightGood) return "favourable both years";
  if (leftGood) return "favourable 2025 only";
  if (rightGood) return "favourable 2026 only";
  if ((left.ae ?? 0) < 0.95 && (right.ae ?? 0) < 0.95) return "reversed";
  return "neutral";
}

function stressCandidates(contexts: Context[], features: FeatureDefinition[]) {
  return features.flatMap((feature) => feature.buckets.flatMap((bucket) => {
    const entries = contexts.map((context) => ({ context, feature, bucket, rows: rowsFor(context, feature, bucket) }));
    const adequate = entries.every((entry) => metricsFor(entry.rows).settled >= SAMPLE_FLOOR);
    const aeBoth = entries.every((entry) => (metricsFor(entry.rows).ae ?? -Infinity) > 1);
    const roiBoth = entries.every((entry) => (metricsFor(entry.rows).roi ?? -Infinity) > 0);
    return adequate && (aeBoth || roiBoth) ? entries : [];
  }));
}

function repeatedBuckets(contexts: Context[], feature: FeatureDefinition): string[] {
  return feature.buckets.filter((bucket) => contexts.every((context) => {
    const metrics = metricsFor(rowsFor(context, feature, bucket));
    return metrics.settled >= SAMPLE_FLOOR && (metrics.ae ?? -Infinity) > 1;
  }));
}

function repeatedAny(contexts: Context[], features: FeatureDefinition[]): boolean {
  return features.some((feature) => repeatedBuckets(contexts, feature).length > 0);
}

function aeSpread(context: Context, feature: FeatureDefinition): number | null {
  const aes = feature.buckets.map((bucket) => metricsFor(rowsFor(context, feature, bucket))).filter((metrics) => metrics.settled >= SAMPLE_FLOOR).map((metrics) => metrics.ae).filter(isNumber);
  return aes.length === 0 ? null : Math.max(...aes) - Math.min(...aes);
}

function sampleAdequacy(contexts: Context[], feature: FeatureDefinition): string {
  const adequate = feature.buckets.filter((bucket) => contexts.every((context) => metricsFor(rowsFor(context, feature, bucket)).settled >= SAMPLE_FLOOR)).length;
  return `${adequate}/${feature.buckets.length} buckets adequate both years`;
}

function strongestSeparation(contexts: Context[], features: FeatureDefinition[]): string {
  return features.map((feature) => {
    const spreads = contexts.map((context) => aeSpread(context, feature)).filter(isNumber);
    return { feature, averageSpread: average(spreads) ?? 0 };
  }).sort((left, right) => right.averageSpread - left.averageSpread).slice(0, 3).map((entry) => `${entry.feature.title} avg spread ${number(entry.averageSpread)}`).join("; ");
}

function featureConclusion(contexts: Context[], feature: FeatureDefinition): string {
  const repeated = repeatedBuckets(contexts, feature);
  if (repeated.length > 0) return `repeat A/E >1.0 bucket(s): ${repeated.join(", ")}.`;
  const best = contexts.map((context) => {
    const entries = feature.buckets.map((bucket) => ({ bucket, metrics: metricsFor(rowsFor(context, feature, bucket)) })).filter((entry) => entry.metrics.settled >= SAMPLE_FLOOR).sort((a, b) => (b.metrics.ae ?? -Infinity) - (a.metrics.ae ?? -Infinity));
    return `${context.year} best ${entries[0]?.bucket ?? "none"} A/E ${number(entries[0]?.metrics.ae ?? null)}`;
  });
  return `no repeat A/E >1.0; ${best.join("; ")}.`;
}

function followUpCandidates(contexts: Context[], features: FeatureDefinition[]): string {
  const candidates = features.filter((feature) => repeatedBuckets(contexts, feature).length > 0);
  if (candidates.length === 0) return "none from this screen.";
  return candidates.slice(0, 2).map((feature) => `${feature.title}: ${repeatedBuckets(contexts, feature).join(", ")}`).join("; ");
}

function biggestPricedWinner(rows: RankedResearchRow[]): { row: RankedResearchRow; sp: number; profit: number } | null {
  return rows.filter((row) => row.outcome.won).map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } => entry.settlement !== null).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal)[0]
    ? (() => {
        const first = rows.filter((row) => row.outcome.won).map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } => entry.settlement !== null).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal)[0]!;
        return { row: first.row, sp: first.settlement.settlementOddsDecimal, profit: first.settlement.profitLoss };
      })()
    : null;
}

function removeBiggestPricedWinner(rows: RankedResearchRow[]): RankedResearchRow[] {
  const winner = biggestPricedWinner(rows);
  return winner ? rows.filter((row) => row.features.targetRunnerId !== winner.row.features.targetRunnerId) : rows;
}

function formBucketFor(label: "course" | "C&D" | "broad-going" | "distance-band", runs: HistoryRun[]): string {
  if (runs.length === 0) return `no prior ${label} run`;
  return runs.some(won) ? `prior ${label} win` : `prior ${label} run, no win`;
}

function priorRuns(runs: HistoryRun[], before: Date): HistoryRun[] {
  return runs.filter((run) => completed(run) && run.raceDateTime < before).sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
}

function completed(run: HistoryRun): boolean {
  return run.resultStatus !== "non_runner" && (run.resultStatus !== null || run.finishingPosition !== null);
}

function won(run: HistoryRun): boolean {
  return run.finishingPosition === 1;
}

function broadGoing(going: string | null): string {
  const text = (going ?? "").toLowerCase();
  if (!text) return "missing";
  if (text.includes("firm")) return "firm/good-firm";
  if (text.includes("good to soft")) return "good-soft";
  if (text.includes("soft")) return "soft/heavy";
  if (text.includes("heavy")) return "soft/heavy";
  if (text.includes("good")) return "good";
  return "missing";
}

function distanceBand(yards: number | null): string {
  if (yards === null) return "missing";
  if (yards <= 1320) return "sprint";
  if (yards <= 1760) return "mile-ish";
  if (yards <= 2640) return "middle distance";
  return "staying";
}

function raceClassNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeHeadgear(value: string | null): string {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return "none";
  if (text === "-" || text === "none") return "none";
  return text;
}

function quartiles(values: number[]): [number, number, number] | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
}

function quartileBucket(value: number | null, qs: [number, number, number] | null): string {
  if (value === null || qs === null) return "missing";
  if (value <= qs[0]) return "low spread";
  if (value <= qs[1]) return "mid-low spread";
  if (value <= qs[2]) return "mid-high spread";
  return "high spread";
}

function quantile(sorted: number[], q: number): number {
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((entry) => entry.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function featureByKey(features: FeatureDefinition[], key: keyof ExtraFeatures): FeatureDefinition {
  const feature = features.find((entry) => entry.key === key);
  if (!feature) throw new Error(`Missing feature ${key}`);
  return feature;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(value: T): value is T & { raceDateTime: Date } {
  return value.raceDateTime !== null;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value < 0 ? `-${Math.abs(value).toFixed(2)}` : value.toFixed(2);
}

function number(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
}

function numbered(lines: string[], items: string[]) {
  items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
