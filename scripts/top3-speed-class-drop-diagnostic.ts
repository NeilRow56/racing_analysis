import { readFile, writeFile } from "node:fs/promises";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { calculateAwRaceRatings } from "@/lib/racing/aw-performance-rating";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus, rankRows } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type Family = "jump" | "turf" | "aw";
type GroupId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6";
type ClassMovement = "drop" | "same" | "rise" | "unknown";
type LatestSpeedMovement = "improved" | "flat" | "declined" | "unavailable";
type SignalClassification = "NO SIGNAL" | "WEAK / UNSTABLE" | "MODEST REPLICATED SIGNAL" | "STRONG REPLICATED SIGNAL";

type Runner = {
  row: Row;
  family: Family;
  year: Year;
  avgL3SpeedRank: number | null;
  classMovement: ClassMovement;
  classDropSize: number | null;
  latestSpeedMovement: LatestSpeedMovement;
  marketRank: number | null;
  models: Record<string, number | null>;
};

type Summary = {
  runners: number;
  races: number;
  winners: number;
  strike: number | null;
  averageRunnersPerRace: number | null;
  expectedWinners: number;
  ae: number | null;
  profitLoss: number;
  roi: number | null;
  averageSp: number | null;
  largestWinnerReturn: number | null;
  profitLossExLargestWinner: number | null;
  profitLossExTop3WinnerReturns: number | null;
};

type Report = {
  generatedAt: string;
  featureDefinitions: string[];
  coverage: Record<string, unknown>[];
  groupSummaries: Record<string, Record<GroupId, Summary>>;
  splitSummaries: Record<string, Record<GroupId, Summary>>;
  latestSpeedSplit: Record<string, Summary>;
  classDropSizeSplit: Record<string, Summary>;
  marketRankSplit: Record<string, Summary>;
  priceBandSplit: Record<string, Summary>;
  modelRankSplit: Record<string, Summary>;
  classifications: Record<string, { g3: SignalClassification; g4: SignalClassification }>;
  threeWinnerCheck: Array<Record<string, unknown>>;
  notes: string[];
};

const YEARS: Year[] = ["2025", "2026"];
const FAMILIES: Array<{ family: Family; cache: BacktestCacheFamily; title: string }> = [
  { family: "jump", cache: "jump", title: "JUMP" },
  { family: "turf", cache: "turf_flat", title: "TURF" },
  { family: "aw", cache: "all_weather_flat", title: "AW" },
];
const GROUPS: GroupId[] = ["G0", "G1", "G2", "G3", "G4", "G5", "G6"];
const MARKDOWN = "/tmp/top3-speed-class-drop-diagnostic.md";
const JSON_OUTPUT = "/tmp/top3-speed-class-drop-diagnostic.json";

async function main() {
  const loaded = await Promise.all(FAMILIES.flatMap((family) => YEARS.map((year) => loadFamilyYear(family.family, family.cache, year))));
  const cacheRows = loaded.flatMap((item) => item.rows);
  const previousClasses = await loadPreviousRaceClasses(cacheRows);
  const runners = buildRunners(cacheRows, previousClasses);
  const caseStudyCheck = await loadThreeWinnerCaseStudyCheck();
  const report = buildReport(runners, loaded, caseStudyCheck);
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN, renderMarkdown(report), "utf8");
  printTerminalSummary(report);
}

async function loadFamilyYear(family: Family, cacheFamily: BacktestCacheFamily, year: Year) {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: cacheFamily, year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing backtest feature cache for ${family} ${year}`);
  const rows = cache.rows
    .filter((row) => familyFor(row) === family)
    .filter(isStartedSettledWithSp)
    .sort(compareRows);
  return {
    family,
    year,
    rows,
    directory: cache.directory,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    generatedAt: cache.manifest.generatedAt,
  };
}

async function loadPreviousRaceClasses(rows: Row[]): Promise<Map<string, { previousClass: number | null; currentClass: number | null }>> {
  const { db, client } = createDbConnection();
  try {
    const horseIds = [...new Set(rows.map((row) => row.features.horseId))];
    const maxDate = rows.map((row) => row.features.raceDate).sort().at(-1) ?? "2026-12-31";
    const history: Array<{ runnerId: string; horseId: string; raceDateTime: Date | null; raceDate: string; raceClass: string | null }> = [];
    for (const chunk of chunks(horseIds, 2_000)) {
      history.push(...await db
        .select({
          runnerId: raceRunners.id,
          horseId: raceRunners.horseId,
          raceDateTime: races.raceDatetime,
          raceDate: races.raceDate,
          raceClass: races.raceClass,
        })
        .from(raceRunners)
        .innerJoin(races, eq(raceRunners.raceId, races.id))
        .where(and(
          eq(raceRunners.source, "sporting_life"),
          eq(races.source, "sporting_life"),
          inArray(raceRunners.horseId, chunk),
          lte(races.raceDate, maxDate),
        ))
        .orderBy(asc(raceRunners.horseId), asc(races.raceDatetime), asc(races.raceDate), asc(raceRunners.id)));
    }
    const byHorse = group(history, (row) => row.horseId);
    const result = new Map<string, { previousClass: number | null; currentClass: number | null }>();
    for (const row of rows) {
      const targetTime = row.features.raceDateTime.getTime();
      const prior = (byHorse.get(row.features.horseId) ?? [])
        .filter((run) => run.runnerId !== row.features.targetRunnerId)
        .filter((run) => timeForHistoryRun(run) < targetTime)
        .at(-1);
      result.set(row.features.targetRunnerId, {
        previousClass: raceClassNumber(prior?.raceClass ?? null),
        currentClass: raceClassNumber(row.features.raceClass),
      });
    }
    return result;
  } finally {
    await client.end();
  }
}

function buildRunners(rows: Row[], previousClasses: Map<string, { previousClass: number | null; currentClass: number | null }>): Runner[] {
  const speedRanks = rankWithinRace(rows, (row) => row.features.averageSpeedLast3);
  const marketRanks = rankWithinRace(rows, (row) => sp(row) === null ? null : -sp(row)!);
  const modelRanks = modelRanksForRows(rows);
  return rows.map((row) => {
    const classes = previousClasses.get(row.features.targetRunnerId) ?? { previousClass: null, currentClass: raceClassNumber(row.features.raceClass) };
    const classDropSize = classes.currentClass !== null && classes.previousClass !== null && classes.currentClass > classes.previousClass
      ? classes.currentClass - classes.previousClass
      : null;
    return {
      row,
      family: familyFor(row)!,
      year: row.features.raceDate.slice(0, 4) as Year,
      avgL3SpeedRank: speedRanks.get(row.features.targetRunnerId) ?? null,
      classMovement: classMovement(classes.currentClass, classes.previousClass),
      classDropSize,
      latestSpeedMovement: latestSpeedMovement(row),
      marketRank: marketRanks.get(row.features.targetRunnerId) ?? null,
      models: modelRanks.get(row.features.targetRunnerId) ?? {},
    };
  });
}

function modelRanksForRows(rows: Row[]): Map<string, Record<string, number | null>> {
  const rankedTurf = new Map(rankRows(rows.filter((row) => familyFor(row) === "turf")).map((row) => [row.features.targetRunnerId, row]));
  const result = new Map<string, Record<string, number | null>>();
  for (const raceRows of group(rows, (row) => row.features.targetRaceId).values()) {
    const family = familyFor(raceRows[0]!);
    if (family === "jump") {
      const ratings = calculateJumpRaceRatings(raceRows.map((row) => ({
        runnerId: row.features.targetRunnerId,
        resultStatus: row.outcome.resultStatus,
        averageJumpSpeedLast3: row.features.averageJumpSpeedLast3,
        trainerPriorStrikeRate: row.features.trainerPriorWinRate,
        officialRating: row.features.officialRating,
      })));
      for (const row of raceRows) {
        const rating = ratings.get(row.features.targetRunnerId);
        result.set(row.features.targetRunnerId, {
          "JPR-A": rating?.jprA?.rank ?? null,
          "JPR-B": rating?.jprB?.rank ?? null,
          "Jump Tissue": null,
        });
      }
    } else if (family === "aw") {
      const ratings = calculateAwRaceRatings(raceRows.map((row) => ({
        runnerId: row.features.targetRunnerId,
        resultStatus: row.outcome.resultStatus,
        averageAwSpeedLast3: row.features.averageAwSpeedLast3,
        trainerPriorStrikeRate: row.features.trainerPriorWinRate,
        jockeyPriorStrikeRate: row.features.jockeyPriorWinRate ?? null,
      })));
      for (const row of raceRows) {
        const rating = ratings.get(row.features.targetRunnerId);
        result.set(row.features.targetRunnerId, {
          "AW-D": rating?.awD?.rank ?? null,
          "AW-A": rating?.awA?.rank ?? null,
          "AW Tissue": null,
        });
      }
    }
  }
  for (const row of rows.filter((row) => familyFor(row) === "turf")) {
    const ranked = rankedTurf.get(row.features.targetRunnerId);
    result.set(row.features.targetRunnerId, {
      "TPR W100": ranked?.turfPerformance?.rank ?? null,
      "TPR W50": ranked?.turfPerformanceW50?.rank ?? null,
      "Turf Tissue v2": null,
    });
  }
  return result;
}

function buildReport(
  runners: Runner[],
  loaded: Array<{ family: Family; year: Year; rows: Row[]; directory: string; coverage: string; generatedAt: string }>,
  caseStudyCheck: Array<Record<string, unknown>> | null,
): Report {
  const groupSummaries: Report["groupSummaries"] = {};
  const splitSummaries: Report["splitSummaries"] = {};
  for (const family of FAMILIES.map((item) => item.family)) {
    const familyRows = runners.filter((runner) => runner.family === family);
    groupSummaries[family] = summarizeGroups(familyRows);
    for (const year of YEARS) splitSummaries[`${family} ${year}`] = summarizeGroups(familyRows.filter((runner) => runner.year === year));
    if (family === "jump") {
      for (const subtype of ["hurdle", "chase", "nh_flat"] as const) {
        splitSummaries[`${family} ${subtype}`] = summarizeGroups(familyRows.filter((runner) => classifyJumpRaceSubtype(runner.row.features) === subtype));
      }
    } else {
      for (const status of ["handicap", "non_handicap"] as const) {
        splitSummaries[`${family} ${status}`] = summarizeGroups(familyRows.filter((runner) => classifyHandicapStatus(runner.row.features) === status));
      }
    }
  }
  const g3 = runners.filter((runner) => matchesGroup(runner, "G3"));
  const g4 = runners.filter((runner) => matchesGroup(runner, "G4"));
  return {
    generatedAt: new Date().toISOString(),
    featureDefinitions: [
      "Average L3 speed rank is a within-current-field competition rank of cached chronology-safe averageSpeedLast3; highest value ranks 1; non-runners are excluded.",
      "Class movement uses canonical races.race_class only. Lower class number is stronger. A move from Class 3 to Class 4 is a drop by 1; Class 4 to Class 3 is a rise. Missing current or previous canonical class is unknown.",
      "Latest speed improvement is exactly latestSpeedRating > previousSpeedRating. Equal or lower is reported as flat/declined; missing latest or previous is unavailable.",
      "Final SP is used only after selection for settlement, market expected winners, market rank, and price-band diagnostics.",
    ],
    coverage: loaded.map((item) => ({
      family: item.family,
      year: item.year,
      coverage: item.coverage,
      rows: item.rows.length,
      cache: item.directory,
      generatedAt: item.generatedAt,
    })),
    groupSummaries,
    splitSummaries,
    latestSpeedSplit: summarizeBy(g3, (runner) => runner.latestSpeedMovement),
    classDropSizeSplit: summarizeBy(g3, (runner) => runner.classDropSize === null ? "unknown/no-drop" : runner.classDropSize === 1 ? "drop by 1 class" : "drop by 2+ classes"),
    marketRankSplit: summarizeBy([...g3, ...g4], (runner) => `${matchesGroup(runner, "G4") ? "G4" : "G3"} ${marketRankBand(runner.marketRank)}`),
    priceBandSplit: summarizeBy(g3, (runner) => priceBand(sp(runner.row))),
    modelRankSplit: summarizeModelRanks(g3, g4),
    classifications: Object.fromEntries(FAMILIES.map(({ family }) => [
      family,
      {
        g3: classifySignal(splitSummaries[`${family} 2025`]?.G3, splitSummaries[`${family} 2026`]?.G3, groupSummaries[family]?.G3),
        g4: classifySignal(splitSummaries[`${family} 2025`]?.G4, splitSummaries[`${family} 2026`]?.G4, groupSummaries[family]?.G4),
      },
    ])),
    threeWinnerCheck: caseStudyCheck ?? threeWinnerCheck(runners),
    notes: [
      "Tissue-model ranks are reported as unavailable because broad immutable historical tissue-rank archives are not present in the normalized schema/cache used here.",
      caseStudyCheck
        ? "Three-winner reconstruction uses /tmp/three-winner-case-study.json because the broad backtest caches used for this diagnostic stop before 2026-10-08."
        : "Three-winner reconstruction fell back to broad-cache horse-name matches; if the target winners are outside cache coverage, run scripts/diagnose-three-winners.ts first.",
      "This is a retrospective robustness diagnostic on already inspected 2025 and 2026 data; neither year is described as pristine holdout.",
    ],
  };
}

function summarizeGroups(runners: Runner[]): Record<GroupId, Summary> {
  return Object.fromEntries(GROUPS.map((groupId) => [groupId, summarize(runners.filter((runner) => matchesGroup(runner, groupId)))])) as Record<GroupId, Summary>;
}

function matchesGroup(runner: Runner, groupId: GroupId): boolean {
  switch (groupId) {
    case "G0": return true;
    case "G1": return (runner.avgL3SpeedRank ?? Infinity) <= 3;
    case "G2": return runner.classMovement === "drop";
    case "G3": return (runner.avgL3SpeedRank ?? Infinity) <= 3 && runner.classMovement === "drop";
    case "G4": return (runner.avgL3SpeedRank ?? Infinity) <= 3 && runner.classMovement === "drop" && runner.latestSpeedMovement === "improved";
    case "G5": return runner.avgL3SpeedRank === 1 && runner.classMovement === "drop";
    case "G6": return runner.avgL3SpeedRank !== null && runner.avgL3SpeedRank >= 2 && runner.avgL3SpeedRank <= 3 && runner.classMovement === "drop";
  }
}

function summarize(runners: Runner[]): Summary {
  const settled = runners.filter((runner) => sp(runner.row) !== null);
  const winners = settled.filter((runner) => runner.row.outcome.won === true);
  const returns = winners.map((runner) => sp(runner.row)!).sort((a, b) => b - a);
  const grossReturn = returns.reduce((sum, value) => sum + value, 0);
  const expectedWinners = settled.reduce((sum, runner) => sum + 1 / sp(runner.row)!, 0);
  const races = distinct(settled, (runner) => runner.row.features.targetRaceId);
  return {
    runners: settled.length,
    races,
    winners: winners.length,
    strike: rate(winners.length, settled.length),
    averageRunnersPerRace: rate(settled.length, races),
    expectedWinners,
    ae: expectedWinners > 0 ? winners.length / expectedWinners : null,
    profitLoss: grossReturn - settled.length,
    roi: rate(grossReturn - settled.length, settled.length),
    averageSp: average(settled.map((runner) => sp(runner.row)!).filter(valid)),
    largestWinnerReturn: returns[0] ?? null,
    profitLossExLargestWinner: returns.length ? grossReturn - returns[0]! - (settled.length - 1) : null,
    profitLossExTop3WinnerReturns: returns.length ? grossReturn - returns.slice(0, 3).reduce((sum, value) => sum + value, 0) - Math.max(0, settled.length - Math.min(3, returns.length)) : null,
  };
}

function summarizeBy(runners: Runner[], key: (runner: Runner) => string): Record<string, Summary> {
  return Object.fromEntries([...group(runners, key)].map(([label, values]) => [label, summarize(values)]));
}

function summarizeModelRanks(g3: Runner[], g4: Runner[]): Record<string, Summary> {
  const result: Record<string, Summary> = {};
  for (const [profile, rows] of [["G3", g3], ["G4", g4]] as const) {
    for (const model of [...new Set(rows.flatMap((runner) => Object.keys(runner.models)))]) {
      for (const band of ["rank 1", "rank 2-3", "rank 4+", "unranked"]) {
        result[`${profile} ${model} ${band}`] = summarize(rows.filter((runner) => rankBand(runner.models[model] ?? null) === band));
      }
    }
  }
  return result;
}

function renderMarkdown(report: Report): string {
  const lines = ["# Top-3 Speed + Class-Drop Diagnostic", ""];
  lines.push("## Executive Summary", "");
  for (const family of FAMILIES) {
    const g3 = report.groupSummaries[family.family]!.G3;
    const g4 = report.groupSummaries[family.family]!.G4;
    lines.push(`- ${family.title}: G3 ${summaryText(g3)}; G4 A/E ${num(g4.ae)}, ROI ${pct(g4.roi)}. Classification G3 ${report.classifications[family.family]!.g3}; G4 ${report.classifications[family.family]!.g4}.`);
  }
  lines.push("", "## Feature Definitions", "", ...report.featureDefinitions.map((line) => `- ${line}`), "");
  lines.push("## Data Coverage", ""); table(lines, report.coverage);
  for (const family of FAMILIES) {
    lines.push(`## ${family.title === "AW" ? "AW" : titleCase(family.title.toLowerCase())} Results`, "");
    table(lines, groupRows(report.groupSummaries[family.family]!));
  }
  lines.push("## Rank 1 vs Ranks 2-3", "");
  table(lines, FAMILIES.map(({ family }) => ({ family, "G5 rank1+drop": compact(report.groupSummaries[family]!.G5), "G6 rank2-3+drop": compact(report.groupSummaries[family]!.G6) })));
  lines.push("## Latest-Speed Improvement", ""); table(lines, namedRows(report.latestSpeedSplit));
  lines.push("## Class-Drop Size", ""); table(lines, namedRows(report.classDropSizeSplit));
  lines.push("## Market-Rank Analysis", ""); table(lines, namedRows(report.marketRankSplit));
  lines.push("## Price-Band Analysis", ""); table(lines, namedRows(report.priceBandSplit));
  lines.push("## Current-Model Comparison", "", "Tissue rows show unavailable coverage where no broad immutable historical tissue archive is present.", ""); table(lines, namedRows(report.modelRankSplit));
  lines.push("## 2025 vs 2026", "");
  table(lines, Object.entries(report.splitSummaries).filter(([key]) => /2025|2026/.test(key)).flatMap(([key, value]) => groupRows(value).filter((row) => row.group === "G3" || row.group === "G4").map((row) => ({ split: key, ...row }))));
  lines.push("## Robustness", "");
  table(lines, FAMILIES.flatMap(({ family }) => ["G3", "G4"].map((groupId) => {
    const summary = report.groupSummaries[family]![groupId as GroupId];
    return { family, group: groupId, "largest winner": money(summary.largestWinnerReturn), "P/L": money(summary.profitLoss), "P/L ex largest": money(summary.profitLossExLargestWinner), "P/L ex top3 wins": money(summary.profitLossExTop3WinnerReturns) };
  })));
  lines.push("## Three-Winner Reconstruction", ""); table(lines, report.threeWinnerCheck);
  lines.push("## Signal Classification", ""); table(lines, FAMILIES.map(({ family }) => ({ family, G3: report.classifications[family]!.g3, G4: report.classifications[family]!.g4 })));
  lines.push("## Recommendation", "", recommendation(report), "", ...report.notes.map((note) => `- ${note}`), "");
  return `${lines.join("\n")}\n`;
}

function printTerminalSummary(report: Report) {
  for (const family of FAMILIES) {
    const sums = report.groupSummaries[family.family]!;
    console.log(family.title);
    console.log(`G3 runners/winners/strike: ${sums.G3.runners}/${sums.G3.winners}/${pct(sums.G3.strike)}`);
    console.log(`G3 A/E: ${num(sums.G3.ae)}`);
    console.log(`G3 ROI: ${pct(sums.G3.roi)}`);
    console.log(`G4 A/E: ${num(sums.G4.ae)}`);
    console.log(`Rank1+drop A/E: ${num(sums.G5.ae)}`);
    console.log(`Rank2-3+drop A/E: ${num(sums.G6.ae)}`);
    console.log(`2025 verdict: ${report.classifications[family.family]!.g3} (${num(report.splitSummaries[`${family.family} 2025`]!.G3.ae)} A/E)`);
    console.log(`2026 verdict: ${report.classifications[family.family]!.g3} (${num(report.splitSummaries[`${family.family} 2026`]!.G3.ae)} A/E)`);
    console.log(`Classification: G3 ${report.classifications[family.family]!.g3}; G4 ${report.classifications[family.family]!.g4}`);
    console.log("");
  }
  const interesting = [...FAMILIES].sort((a, b) => (report.groupSummaries[b.family]!.G3.ae ?? -Infinity) - (report.groupSummaries[a.family]!.G3.ae ?? -Infinity))[0]!;
  const latestAdds = FAMILIES.some(({ family }) => (report.groupSummaries[family]!.G4.ae ?? 0) > (report.groupSummaries[family]!.G3.ae ?? Infinity));
  const rank23Better = FAMILIES.some(({ family }) => (report.groupSummaries[family]!.G6.ae ?? 0) > (report.groupSummaries[family]!.G5.ae ?? Infinity));
  const shadow = FAMILIES.some(({ family }) => report.classifications[family]!.g3 === "MODEST REPLICATED SIGNAL" || report.classifications[family]!.g4 === "MODEST REPLICATED SIGNAL" || report.classifications[family]!.g3 === "STRONG REPLICATED SIGNAL" || report.classifications[family]!.g4 === "STRONG REPLICATED SIGNAL");
  console.log(`Most interesting family: ${interesting.title}`);
  console.log(`Most interesting profile: ${interesting.title} G3`);
  console.log(`Does latest-speed improvement add replicated signal: ${latestAdds ? "YES" : "NO"}`);
  console.log(`Do ranks 2-3 outperform rank 1 after market control: ${rank23Better ? "YES" : "NO"}`);
  console.log(`Should this move to a prospective shadow test: ${shadow ? "YES" : "NO"}`);
  console.log(`Wrote ${MARKDOWN}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function familyFor(row: Row): Family | null {
  if (row.features.raceCode === "jump") return "jump";
  if (row.features.raceCode === "turf") return "turf";
  if (row.features.raceCode === "aw") return "aw";
  return null;
}

export function classMovement(currentClass: number | null, previousClass: number | null): ClassMovement {
  if (currentClass === null || previousClass === null) return "unknown";
  if (currentClass > previousClass) return "drop";
  if (currentClass < previousClass) return "rise";
  return "same";
}

export function latestSpeedMovement(row: Pick<Row, "features">): LatestSpeedMovement {
  const latest = row.features.latestSpeedRating;
  const previous = row.features.previousSpeedRating;
  if (!valid(latest) || !valid(previous)) return "unavailable";
  if (latest > previous) return "improved";
  if (latest < previous) return "declined";
  return "flat";
}

function rankWithinRace(rows: Row[], valueFor: (row: Row) => number | null): Map<string, number> {
  const result = new Map<string, number>();
  for (const raceRows of group(rows.filter((row) => row.outcome.resultStatus !== "non_runner"), (row) => row.features.targetRaceId).values()) {
    const sorted = raceRows
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: Row; value: number } => valid(entry.value))
      .sort((a, b) => b.value - a.value || a.row.features.targetRunnerId.localeCompare(b.row.features.targetRunnerId));
    let previousValue: number | null = null;
    let previousRank = 0;
    sorted.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      result.set(entry.row.features.targetRunnerId, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return result;
}

function classifySignal(y2025: Summary | undefined, y2026: Summary | undefined, total: Summary | undefined): SignalClassification {
  if (!y2025 || !y2026 || !total || total.runners < 50) return "NO SIGNAL";
  const ae25 = y2025.ae ?? 0;
  const ae26 = y2026.ae ?? 0;
  const strikeStable = y2025.strike !== null && y2026.strike !== null && Math.min(y2025.strike, y2026.strike) / Math.max(y2025.strike, y2026.strike) >= 0.55;
  if (total.runners >= 250 && ae25 >= 1.05 && ae26 >= 1.05 && strikeStable) return total.ae !== null && total.ae >= 1.15 ? "STRONG REPLICATED SIGNAL" : "MODEST REPLICATED SIGNAL";
  if (ae25 >= 1 || ae26 >= 1 || (total.ae ?? 0) >= 1.05) return "WEAK / UNSTABLE";
  return "NO SIGNAL";
}

function threeWinnerCheck(runners: Runner[]): Array<Record<string, unknown>> {
  return ["Ballygeary", "Stanage", "State Express"].map((horse) => {
    const matches = runners.filter((runner) => normalizeName(runner.row.features.horseName) === normalizeName(horse));
    const best = matches.find((runner) => matchesGroup(runner, "G3")) ?? matches.at(-1);
    return {
      horse,
      found: Boolean(best),
      date: best?.row.features.raceDate ?? "-",
      "Avg L3 top 3": best ? (best.avgL3SpeedRank ?? Infinity) <= 3 : "-",
      "class drop": best ? best.classMovement === "drop" : "-",
      "latest > previous": best ? best.latestSpeedMovement === "improved" : "-",
      "rank": best?.avgL3SpeedRank ?? "-",
      "class movement": best?.classMovement ?? "-",
    };
  });
}

async function loadThreeWinnerCaseStudyCheck(): Promise<Array<Record<string, unknown>> | null> {
  try {
    const parsed = JSON.parse(await readFile("/tmp/three-winner-case-study.json", "utf8")) as {
      date?: unknown;
      cases?: Array<{
        name?: unknown;
        race?: { raceDateTime?: unknown };
        winner?: {
          speedRanks?: { averageL3?: unknown };
          classMove?: unknown;
          speed?: { latest?: unknown; previous?: unknown };
        };
      }>;
    };
    const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
    if (cases.length === 0) return null;
    return ["Ballygeary", "Stanage", "State Express"].map((horse) => {
      const item = cases.find((entry) => entry.name === horse);
      const averageRank = numericValue(item?.winner?.speedRanks?.averageL3);
      const latest = numericValue(item?.winner?.speed?.latest);
      const previous = numericValue(item?.winner?.speed?.previous);
      const classMove = typeof item?.winner?.classMove === "string" ? item.winner.classMove : null;
      return {
        horse,
        found: Boolean(item),
        date: typeof item?.race?.raceDateTime === "string" ? item.race.raceDateTime.slice(0, 10) : "-",
        "Avg L3 top 3": averageRank !== null ? averageRank <= 3 : "-",
        "class drop": classMove?.startsWith("drop") ?? "-",
        "latest > previous": latest !== null && previous !== null ? latest > previous : "-",
        "rank": averageRank ?? "-",
        "class movement": classMove ?? "-",
        source: "/tmp/three-winner-case-study.json",
      };
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function recommendation(report: Report): string {
  const candidates = FAMILIES.flatMap(({ family, title }) => [
    { label: `${title} G3`, classification: report.classifications[family]!.g3, summary: report.groupSummaries[family]!.G3 },
    { label: `${title} G4`, classification: report.classifications[family]!.g4, summary: report.groupSummaries[family]!.G4 },
  ]);
  const positive = candidates.filter((item) => item.classification === "MODEST REPLICATED SIGNAL" || item.classification === "STRONG REPLICATED SIGNAL");
  if (positive.length === 0) return "Do not promote this to a betting system. At most, review the weakest/strongest family splits manually before deciding on any prospective shadow-only monitoring.";
  const best = positive.sort((a, b) => (b.summary.ae ?? 0) - (a.summary.ae ?? 0))[0]!;
  return `${best.label} is the only candidate that clears this diagnostic classification screen. The appropriate next step is prospective shadow monitoring only; do not alter Today, trackers, Tissue, JPR/TPR/AW models, or Forward Value.`;
}

function isStartedSettledWithSp(row: Row) {
  return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null && sp(row) !== null && familyFor(row) !== null;
}
function sp(row: Row) { const value = Number(row.outcome.startingPriceDecimal); return Number.isFinite(value) && value > 0 ? value : null; }
function timeForHistoryRun(run: { raceDateTime: Date | null; raceDate: string }) { return run.raceDateTime?.getTime() ?? new Date(`${run.raceDate}T00:00:00Z`).getTime(); }
function marketRankBand(rank: number | null) { return rank === null ? "unknown" : rank === 1 ? "favourite" : rank <= 3 ? "market rank 2-3" : "market rank 4+"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 3 ? "<2/1" : value < 5 ? "2/1 to <4/1" : value < 9 ? "4/1 to <8/1" : value < 17 ? "8/1 to <16/1" : "16/1+"; }
function rankBand(rank: number | null): "rank 1" | "rank 2-3" | "rank 4+" | "unranked" { return rank === null ? "unranked" : rank === 1 ? "rank 1" : rank <= 3 ? "rank 2-3" : "rank 4+"; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || a.features.targetRunnerId.localeCompare(b.features.targetRunnerId); }
function normalizeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function chunks<T>(values: T[], size: number) { const result: T[][] = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result; }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]); return result; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function numericValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3); }
function money(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2); }
function titleCase(value: string) { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function summaryText(summary: Summary) { return `${summary.runners} runners, ${summary.winners} winners, strike ${pct(summary.strike)}, A/E ${num(summary.ae)}, ROI ${pct(summary.roi)}`; }
function compact(summary: Summary) { return `${summary.runners}/${summary.winners}; A/E ${num(summary.ae)}; ROI ${pct(summary.roi)}; avg SP ${num(summary.averageSp)}`; }
function groupRows(groups: Record<GroupId, Summary>) { return GROUPS.map((group) => ({ group, runners: groups[group].runners, races: groups[group].races, winners: groups[group].winners, strike: pct(groups[group].strike), "exp wins": num(groups[group].expectedWinners), "A/E": num(groups[group].ae), "P/L": money(groups[group].profitLoss), ROI: pct(groups[group].roi), "avg SP": num(groups[group].averageSp) })); }
function namedRows(groups: Record<string, Summary>) { return Object.entries(groups).map(([name, summary]) => ({ name, runners: summary.runners, races: summary.races, winners: summary.winners, strike: pct(summary.strike), "exp wins": num(summary.expectedWinners), "A/E": num(summary.ae), "P/L": money(summary.profitLoss), ROI: pct(summary.roi), "avg SP": num(summary.averageSp) })); }
function table(lines: string[], rows: Record<string, unknown>[]) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

if (process.argv[1]?.endsWith("top3-speed-class-drop-diagnostic.ts")) {
  await main();
}
