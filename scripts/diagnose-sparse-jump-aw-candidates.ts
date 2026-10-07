import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDbConnection } from "@/db";
import { deriveBacktestFeatureValues, settleSelection } from "@/lib/racing/backtest";
import {
  loadLatestBacktestFeatureCacheForYear,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";
import type { AwTissueRace } from "@/lib/racing/aw-tissue-forward";
import type { JumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import { classifyHandicapStatus, defaultResearchRule, rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { getTrainerCohortForRule, trainerCohortRule, type ResolvedTrainerCohort } from "@/lib/racing/trainer-cohorts";

type Family = "jump" | "all_weather_flat";
type Year = "2025" | "2026";
type CandidateId =
  | "jump-handicap-anchor-rating"
  | "jump-handicap-anchor-or-top2"
  | "jump-nonhandicap-structural-rating"
  | "jump-nonhandicap-class-rating"
  | "aw-handicap-rating"
  | "aw-nonhandicap-small-field-rating"
  | "aw-handicap-trainer-jockey-rating";
type CandidateDefinition = {
  id: CandidateId;
  family: Family;
  label: string;
  description: string;
  retrospectiveSpNote?: string;
  eligible: (row: RankedResearchRow, context: Context) => boolean;
  score: (row: RankedResearchRow, context: Context) => number | null;
};
type Context = {
  family: Family;
  year: Year;
  coverage: string;
  rows: RankedResearchRow[];
  totalRaces: number;
  trainerCohort20: ResolvedTrainerCohort | null;
  trainerCohortSource: string;
};
export type CandidateSelection = {
  definitionId: CandidateId;
  row: RankedResearchRow;
  score: number;
  ratingTop1: boolean;
  officialRatingTop1: boolean;
  tissueTop1: boolean | null;
  marketTop1: boolean | null;
};
export type MetricSummary = {
  eligibleRaces: number;
  selections: number;
  racingDays: number;
  selectionsPerDay: number | null;
  noSelectionRate: number | null;
  winners: number;
  strikeRate: number | null;
  averageOdds: number | null;
  ae: number | null;
  profitLoss: number;
  roi: number | null;
  maxLosingSequence: number;
  maxDrawdown: number;
  ratingTop1Overlap: number | null;
  officialTop1Overlap: number | null;
  tissueTop1Overlap: number | null;
  marketTop1Overlap: number | null;
  notRatingTop1: Pick<MetricSummary, "selections" | "winners" | "strikeRate" | "profitLoss" | "roi" | "ae">;
};
type TissueRecord = { top1: string | null; probabilities: Map<string, number>; clean: boolean };
type MarketRecord = { top1: string | null; probabilities: Map<string, number>; clean: boolean; capturedAt: string };
type TrackerRace = JumpTissueRace | AwTissueRace;
type Ride = { ride_reference: { id: number }; ride_status: string; finish_position?: number; bookmakerOdds?: Array<{ bookmakerId: number; decimalOdds: number }> };
type Archive = { sourceId: string; fetchedAt: Date; payload: { props?: { pageProps?: { race?: { rides?: Ride[]; race_summary?: { date?: string; race_stage?: string } } } } } };

const OUTPUT = "/tmp/sparse-jump-aw-candidate-diagnostic.md";
const EVIDENCE = "/tmp/sparse-jump-aw-candidate-evidence.json";
const YEARS: Year[] = ["2025", "2026"];
const FAMILIES: Family[] = ["jump", "all_weather_flat"];
const BOOKMAKER_ID = 4;

export const CANDIDATES: CandidateDefinition[] = [
  {
    id: "jump-handicap-anchor-rating",
    family: "jump",
    label: "Jump handicap anchor + Best L3 rank 1",
    description: "Handicap; trainer in top-20 prior-calendar-year Jump wins; 11-0 to 11-9; days since run >=14; trainer prior strike >=14%; primary candidate is highest Best L3 speed, restricted to rank 1.",
    eligible: (row, context) => isHandicap(row) && inTop20Trainer(row, context) && between(row.features.weightCarriedLbs, 154, 163) && (row.features.daysSinceLastRun ?? -Infinity) >= 14 && (row.features.trainerPriorWinRate ?? -Infinity) >= 14 && row.ranks.bestSpeedLast3 === 1,
    score: ratingScore,
  },
  {
    id: "jump-handicap-anchor-or-top2",
    family: "jump",
    label: "Jump handicap anchor + OR rank 1-2",
    description: "Same pre-race handicap anchor, but restricts to official-rating rank 1-2 before selecting by Best L3 speed.",
    eligible: (row, context) => isHandicap(row) && inTop20Trainer(row, context) && between(row.features.weightCarriedLbs, 154, 163) && (row.features.daysSinceLastRun ?? -Infinity) >= 14 && (row.features.trainerPriorWinRate ?? -Infinity) >= 14 && (row.ranks.officialRating ?? Infinity) <= 2,
    score: ratingScore,
  },
  {
    id: "jump-nonhandicap-structural-rating",
    family: "jump",
    label: "Jump non-handicap anchor + Best L3 rank 1",
    description: "Non-handicap; field size 2-7; jockey prior strike >=18%; primary candidate is highest Best L3 speed, restricted to rank 1.",
    retrospectiveSpNote: "The historical SP 1/1-7/1 descriptor is reported separately and is not used as a candidate input.",
    eligible: (row) => isNonHandicap(row) && between(fieldSize(row), 2, 7) && (row.features.jockeyPriorWinRate ?? -Infinity) >= 18 && row.ranks.bestSpeedLast3 === 1,
    score: ratingScore,
  },
  {
    id: "jump-nonhandicap-class-rating",
    family: "jump",
    label: "Jump non-handicap anchor + Class 1-4",
    description: "Non-handicap; field size 2-7; jockey prior strike >=18%; Class 1-4; primary candidate is highest Best L3 speed.",
    retrospectiveSpNote: "No SP band is used prospectively.",
    eligible: (row) => isNonHandicap(row) && between(fieldSize(row), 2, 7) && (row.features.jockeyPriorWinRate ?? -Infinity) >= 18 && between(raceClassNumber(row.features.raceClass), 1, 4),
    score: ratingScore,
  },
  {
    id: "aw-handicap-rating",
    family: "all_weather_flat",
    label: "AW handicap + Best L3 rank 1",
    description: "Handicap; field size 4-9; trainer prior strike >=12%; days since run 7-90; primary candidate is highest AW/current Best L3 speed, restricted to rank 1.",
    eligible: (row) => isHandicap(row) && between(fieldSize(row), 4, 9) && (row.features.trainerPriorWinRate ?? -Infinity) >= 12 && between(row.features.daysSinceLastRun, 7, 90) && row.ranks.bestSpeedLast3 === 1,
    score: ratingScore,
  },
  {
    id: "aw-nonhandicap-small-field-rating",
    family: "all_weather_flat",
    label: "AW non-handicap small-field + Best L3 rank 1",
    description: "Non-handicap; field size 2-7; jockey prior strike >=16%; primary candidate is highest AW/current Best L3 speed, restricted to rank 1.",
    eligible: (row) => isNonHandicap(row) && between(fieldSize(row), 2, 7) && (row.features.jockeyPriorWinRate ?? -Infinity) >= 16 && row.ranks.bestSpeedLast3 === 1,
    score: ratingScore,
  },
  {
    id: "aw-handicap-trainer-jockey-rating",
    family: "all_weather_flat",
    label: "AW handicap trainer+jockey + rating rank 1-2",
    description: "Handicap; field size 4-10; trainer prior strike >=14%; jockey prior strike >=14%; days since run 7-60; primary candidate is highest AW/current Best L3 speed, restricted to rank 1-2.",
    eligible: (row) => isHandicap(row) && between(fieldSize(row), 4, 10) && (row.features.trainerPriorWinRate ?? -Infinity) >= 14 && (row.features.jockeyPriorWinRate ?? -Infinity) >= 14 && between(row.features.daysSinceLastRun, 7, 60) && (row.ranks.bestSpeedLast3 ?? Infinity) <= 2,
    score: ratingScore,
  },
];

export async function main() {
  const before = await fingerprints();
  const contexts = await loadContexts();
  const trackerMaps = await loadForwardMaps();
  const marketAudit = await loadMarketAudit(trackerMaps.raceIds);
  const lines = buildReport(contexts, trackerMaps.tissue, marketAudit.market, marketAudit.coverage, marketAudit.note);
  const after = await fingerprints();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected production/research JSON fingerprints changed during diagnostic");
  lines.push("## Integrity", "");
  lines.push(`SHA-256 verified unchanged for ${Object.keys(before).length} protected files: all src files and top-level data/research JSON artifacts. The diagnostic wrote only ${OUTPUT} and ${EVIDENCE}.`);
  lines.push("", "## Reproduction", "", "```sh", "bun --env-file=.env.local run scripts/diagnose-sparse-jump-aw-candidates.ts", "bun test scripts/diagnose-sparse-jump-aw-candidates.test.ts scripts/diagnose-market-residual.test.ts", "bun run typecheck", "bun run lint scripts/diagnose-sparse-jump-aw-candidates.ts scripts/diagnose-sparse-jump-aw-candidates.test.ts", "git diff --check", "```", "");
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  await writeFile(EVIDENCE, `${JSON.stringify(evidence(contexts, trackerMaps.tissue, marketAudit.market, marketAudit.coverage), null, 2)}\n`, "utf8");
  console.log(`Report: ${OUTPUT}`);
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family: family as BacktestCacheFamily, year });
      const rows = cache ? rankRows(cache.rows.filter((row) => row.features.raceCode === raceCodeForFamily(family))).sort(compareRows) : [];
      contexts.push({
        family,
        year,
        coverage: cache ? `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` : "missing cache",
        rows,
        totalRaces: distinct(rows, raceId),
        trainerCohort20: null,
        trainerCohortSource: "not required",
      });
    }
  }
  await attachTrainerCohorts(contexts);
  return contexts;
}

async function attachTrainerCohorts(contexts: Context[]) {
  const { db, client } = createDbConnection();
  try {
    for (const context of contexts.filter((item) => item.family === "jump")) {
      const rule = defaultResearchRule("jump");
      rule.runner.trainerCohort = trainerCohortRule(20);
      context.trainerCohort20 = await getTrainerCohortForRule(db, rule, Number(context.year));
      context.trainerCohortSource = `database prior-calendar-year ${Number(context.year) - 1}`;
    }
  } catch (error) {
    for (const context of contexts.filter((item) => item.family === "jump")) {
      const fallback = cacheDerivedJumpTrainerCohort(contexts, Number(context.year));
      context.trainerCohort20 = fallback;
      context.trainerCohortSource = fallback
        ? `cache-derived prior-calendar-year ${Number(context.year) - 1}`
        : `unavailable: ${shortError(error)}`;
    }
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

function cacheDerivedJumpTrainerCohort(contexts: Context[], cohortYear: number): ResolvedTrainerCohort | null {
  const referenceYear = cohortYear - 1;
  const source = contexts.find((context) => context.family === "jump" && context.year === String(referenceYear))?.rows;
  if (!source?.length) return null;
  const standings = new Map<string, { trainerId: string; trainerName: string; runs: number; wins: number }>();
  for (const row of source) {
    if (!row.features.trainerId || !row.features.trainerName || row.outcome.resultStatus === "non_runner" || row.outcome.finishingPosition === null) continue;
    const current = standings.get(row.features.trainerId) ?? { trainerId: row.features.trainerId, trainerName: row.features.trainerName, runs: 0, wins: 0 };
    current.runs += 1;
    if (row.outcome.finishingPosition === 1) current.wins += 1;
    standings.set(current.trainerId, current);
  }
  const members = [...standings.values()]
    .filter((row) => row.runs >= 50)
    .sort((left, right) => right.wins - left.wins || right.runs - left.runs || left.trainerName.localeCompare(right.trainerName) || left.trainerId.localeCompare(right.trainerId))
    .slice(0, 20)
    .map((row, index) => ({ cohortYear, referenceYear, family: "jump" as const, rank: index + 1, trainerId: row.trainerId, trainerName: row.trainerName, priorYearRuns: row.runs, priorYearWins: row.wins, priorYearWinRate: (row.wins / row.runs) * 100 }));
  return { definition: trainerCohortRule(20), cohortYear, referenceYear, family: "jump", qualifiedTrainerCount: standings.size, members, trainerIds: new Set(members.map((member) => member.trainerId)) };
}

function buildReport(contexts: Context[], tissue: ReadonlyMap<string, TissueRecord>, market: ReadonlyMap<string, MarketRecord>, marketCoverage: MarketCoverage[], marketNote: string | null): string[] {
  const lines = [
    "# Sparse Jump / AW Candidate Diagnostic",
    "",
    "Diagnostic only. Turf Tissue, Jump/AW TPR, Tissue, Forward Value and the frozen AW shadow are unchanged. No production candidate is written, no model is fitted, and no SP, reconstructed price or later market information is used as a candidate input.",
    "",
    "## Candidate Variables Vs Evaluation Prices",
    "",
    "Candidate variables: handicap status, field size, trainer top-20 prior-calendar-year Jump cohort, trainer/jockey prior strike rates, days since run, carried weight, race class, and existing cached recent/relative rating ranks. Candidate selection permits no runner in a race and then at most one primary runner from each structurally eligible race.",
    "",
    "Settlement/evaluation prices: final decimal SP from canonical settlement only. SP is used for P/L, ROI, average settled odds and A/E after selection, never to qualify or rank a candidate. The old Jump non-handicap SP 1/1-7/1 rule is therefore retrospective description only.",
    "",
    "## Structural Conditions",
    "",
  ];
  lines.push(...table(["Candidate", "Prospective structural gates", "Retrospective-only descriptors"], CANDIDATES.map((candidate) => [candidate.label, candidate.description, candidate.retrospectiveSpNote ?? "none"])));
  lines.push("### Data Availability Notes", "");
  lines.push(...table(["Period", "Trainer top-20 source"], contexts.filter((context) => context.family === "jump").map((context) => [label(context), context.trainerCohortSource])));
  lines.push("### Retrospective SP Descriptor Check", "");
  lines.push("The old Jump non-handicap SP 1/1-7/1 condition is recomputed below as an after-the-fact profile only. It is not used by any candidate definition or ranking step.", "");
  lines.push(...table(["Period", "Structural rows", "Rows also SP 2.0-8.0", "SP-band share", "SP-band wins", "SP-band strike", "SP-band A/E", "SP-band P/L", "SP-band ROI"], YEARS.map((year) => {
    const context = contextFor(contexts, "jump", year);
    const structural = context.rows.filter((row) => isNonHandicap(row) && between(fieldSize(row), 2, 7) && (row.features.jockeyPriorWinRate ?? -Infinity) >= 18);
    const spBand = structural.filter((row) => between(settleSelection(row.outcome)?.settlementOddsDecimal, 2, 8));
    const metric = summarizeRows(spBand);
    return [label(context), structural.length, spBand.length, pct(rate(spBand.length, structural.length)), metric.winners, pct(metric.strikeRate), num(metric.ae), money(metric.profitLoss), pct(metric.roi)];
  })));
  lines.push("## Development / Holdout Candidate Results", "");
  for (const candidate of CANDIDATES) {
    lines.push(`### ${candidate.label}`, "");
    lines.push(...table(["Period", "Cache coverage", "Family races", "Eligible races", "Selections", "Selections/day", "No-selection races", "Wins", "Strike", "Avg settled odds", "A/E", "P/L", "ROI", "Max losing", "Max drawdown", "Rating Top-1 overlap", "OR Top-1 overlap", "Tissue Top-1 overlap", "Market Top-1 overlap"], YEARS.map((year) => {
      const context = contextFor(contexts, candidate.family, year);
      const selections = selectCandidates(context, candidate, tissue, market);
      const metric = summarizeCandidateSelections(selections, context.totalRaces);
      return [label(context), context.coverage, context.totalRaces, metric.eligibleRaces, metric.selections, num(metric.selectionsPerDay, 2), pct(metric.noSelectionRate), metric.winners, pct(metric.strikeRate), num(metric.averageOdds, 2), num(metric.ae), money(metric.profitLoss), pct(metric.roi), metric.maxLosingSequence, money(metric.maxDrawdown), pct(metric.ratingTop1Overlap), pct(metric.officialTop1Overlap), pct(metric.tissueTop1Overlap), pct(metric.marketTop1Overlap)];
    })));
    lines.push(...table(["Period", "When not rating Top-1", "Selections", "Wins", "Strike", "A/E", "P/L", "ROI"], YEARS.map((year) => {
      const context = contextFor(contexts, candidate.family, year);
      const metric = summarizeCandidateSelections(selectCandidates(context, candidate, tissue, market), context.totalRaces).notRatingTop1;
      return [label(context), "candidate rank differs from cached Best L3 Top-1", metric.selections, metric.winners, pct(metric.strikeRate), num(metric.ae), money(metric.profitLoss), pct(metric.roi)];
    })));
  }
  lines.push("## Ranking Inside Forward-Tracked Eligible Cohorts", "");
  lines.push("Tissue and clean pre-race market comparisons are only available where the existing forward tracker and retained timestamped racecard can be safely joined. Missing clean market rows are reported as unavailable, not replaced with SP.");
  for (const family of FAMILIES) {
    const familyCandidates = CANDIDATES.filter((candidate) => candidate.family === family);
    const context = contextFor(contexts, family, "2026");
    lines.push(`### ${familyLabel(family)} 2026 forward subset`, "");
    lines.push(...table(["Candidate", "Selections", "With Tissue", "Tissue Top-1 overlap", "With clean market", "Market Top-1 overlap"], familyCandidates.map((candidate) => {
      const selections = selectCandidates(context, candidate, tissue, market);
      const withTissue = selections.filter((selection) => selection.tissueTop1 !== null);
      const withMarket = selections.filter((selection) => selection.marketTop1 !== null);
      return [candidate.label, selections.length, withTissue.length, pct(rate(withTissue.filter((selection) => selection.tissueTop1).length, withTissue.length)), withMarket.length, pct(rate(withMarket.filter((selection) => selection.marketTop1).length, withMarket.length))];
    })));
  }
  lines.push("## Timestamped Bookmaker Archive Readiness", "");
  lines.push(...table(["Year", "Archived racecards", "Complete Betfair RUNNER books before timing checks", "Race-date coverage"], marketCoverage.map((row) => [row.year, row.races, row.priced, row.races ? `${row.first} to ${row.last}` : "none"])));
  if (marketNote) lines.push(`Archive audit note: ${marketNote}`, "");
  const recent = marketCoverage.find((row) => row.year === "2026" && row.races > 0);
  const coverageStart = recent?.first || "not re-audited in this run; preceding market-residual diagnostic established 2026-09-09";
  lines.push(`Clean archived pre-race bookmaker coverage begins on ${coverageStart} in the retained Sporting Life racecard archive. There is no 2025 development-period market-book history in this archive, so a learned market-residual model remains unfitted. The current collection process is directionally sufficient only if it continues retaining immutable timestamped pre-race full-field books; a residual experiment should wait for at least roughly 500 clean Jump/AW races for development and a later 250+ clean races for evaluation, with 1,000+/500+ preferable before threshold or subgroup claims.`, "");
  lines.push("## Decision", "");
  const decisionRows = decision(contexts, tissue, market);
  lines.push(...table(["Family", "Answer"], decisionRows));
  lines.push("The learned market-residual hypothesis remains deferred until enough clean timestamped bookmaker history exists. No SP, retrospectively reconstructed price or later market information should be used to bring that experiment forward.", "");
  return lines;
}

export function selectCandidates(
  context: Context,
  definition: CandidateDefinition,
  tissue: ReadonlyMap<string, TissueRecord> = new Map(),
  market: ReadonlyMap<string, MarketRecord> = new Map(),
): CandidateSelection[] {
  const byRace = group(context.rows.filter((row) => definition.eligible(row, context)), raceId);
  const selections: CandidateSelection[] = [];
  for (const rows of byRace.values()) {
    const scored = rows
      .map((row) => ({ row, score: definition.score(row, context) }))
      .filter((item): item is { row: RankedResearchRow; score: number } => item.score !== null && Number.isFinite(item.score))
      .sort((left, right) => right.score - left.score || compareRows(left.row, right.row));
    const leader = scored[0];
    if (!leader) continue;
    const t = tissue.get(raceId(leader.row));
    const m = market.get(raceId(leader.row));
    selections.push({
      definitionId: definition.id,
      row: leader.row,
      score: leader.score,
      ratingTop1: leader.row.ranks.bestSpeedLast3 === 1,
      officialRatingTop1: leader.row.ranks.officialRating === 1,
      tissueTop1: t?.clean ? t.top1 === runnerId(leader.row) : null,
      marketTop1: m?.clean ? m.top1 === runnerId(leader.row) : null,
    });
  }
  return selections.sort((left, right) => compareRows(left.row, right.row));
}

export function summarizeCandidateSelections(selections: CandidateSelection[], totalRaces: number): MetricSummary {
  const settled = selections.map((selection) => ({ selection, settlement: settleSelection(selection.row.outcome) })).filter((item) => item.settlement !== null);
  const wins = settled.filter((item) => item.selection.row.outcome.won).length;
  const odds = settled.map((item) => item.settlement!.settlementOddsDecimal);
  const stakes = settled.length;
  const profitLoss = settled.reduce((sum, item) => sum + item.settlement!.profitLoss, 0);
  const expectedWins = odds.reduce((sum, odd) => sum + 1 / odd, 0);
  const racingDays = new Set(selections.map((selection) => selection.row.features.raceDate)).size;
  const top1Known = settled.filter((item) => item.selection.tissueTop1 !== null);
  const marketKnown = settled.filter((item) => item.selection.marketTop1 !== null);
  const base = {
    eligibleRaces: distinct(selections.map((selection) => selection.row), raceId),
    selections: settled.length,
    racingDays,
    selectionsPerDay: rate(settled.length, racingDays),
    noSelectionRate: rate(Math.max(0, totalRaces - distinct(selections.map((selection) => selection.row), raceId)), totalRaces),
    winners: wins,
    strikeRate: rate(wins, settled.length),
    averageOdds: average(odds),
    ae: rate(wins, expectedWins),
    profitLoss,
    roi: rate(profitLoss, stakes),
    maxLosingSequence: maxLosing(settled.map((item) => Boolean(item.selection.row.outcome.won))),
    maxDrawdown: maxDrawdown(settled.map((item) => item.settlement!.profitLoss)),
    ratingTop1Overlap: rate(settled.filter((item) => item.selection.ratingTop1).length, settled.length),
    officialTop1Overlap: rate(settled.filter((item) => item.selection.officialRatingTop1).length, settled.length),
    tissueTop1Overlap: rate(top1Known.filter((item) => item.selection.tissueTop1).length, top1Known.length),
    marketTop1Overlap: rate(marketKnown.filter((item) => item.selection.marketTop1).length, marketKnown.length),
  };
  const notRatingTop1Rows = selections.filter((selection) => !selection.ratingTop1);
  const notRatingTop1 = summarizeCandidateSelectionsFlat(notRatingTop1Rows);
  return { ...base, notRatingTop1 };
}

function summarizeCandidateSelectionsFlat(selections: CandidateSelection[]): MetricSummary["notRatingTop1"] {
  const settled = selections.map((selection) => ({ selection, settlement: settleSelection(selection.row.outcome) })).filter((item) => item.settlement !== null);
  const wins = settled.filter((item) => item.selection.row.outcome.won).length;
  const profitLoss = settled.reduce((sum, item) => sum + item.settlement!.profitLoss, 0);
  const expectedWins = settled.reduce((sum, item) => sum + 1 / item.settlement!.settlementOddsDecimal, 0);
  return { selections: settled.length, winners: wins, strikeRate: rate(wins, settled.length), profitLoss, roi: rate(profitLoss, settled.length), ae: rate(wins, expectedWins) };
}

function summarizeRows(rows: RankedResearchRow[]) {
  const settled = rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((item) => item.settlement !== null);
  const winners = settled.filter((item) => item.row.outcome.won).length;
  const profitLoss = settled.reduce((sum, item) => sum + item.settlement!.profitLoss, 0);
  const expectedWins = settled.reduce((sum, item) => sum + 1 / item.settlement!.settlementOddsDecimal, 0);
  return { winners, strikeRate: rate(winners, settled.length), ae: rate(winners, expectedWins), profitLoss, roi: rate(profitLoss, settled.length) };
}

async function loadForwardMaps(): Promise<{ tissue: Map<string, TissueRecord>; raceIds: Map<string, TrackerRace> }> {
  const tissue = new Map<string, TissueRecord>();
  const raceIds = new Map<string, TrackerRace>();
  for (const path of ["data/research/jump-tissue-forward-v1.json", "data/research/aw-tissue-forward-v1.json"]) {
    const data = JSON.parse(await readFile(path, "utf8")) as { races: TrackerRace[] };
    for (const race of data.races) {
      const clean = race.recordedPreRace && race.excludedReason === null && race.settledAt !== null;
      tissue.set(race.raceId, { top1: race.top1, clean, probabilities: new Map(race.runners.map((runner) => [runner.runnerId, runner.probability ?? 0])) });
      raceIds.set(race.raceId, race);
    }
  }
  return { tissue, raceIds };
}

type MarketCoverage = { year: string; races: number; priced: number; first: string; last: string };
async function loadMarketAudit(trackerRaces: ReadonlyMap<string, TrackerRace>): Promise<{ market: Map<string, MarketRecord>; coverage: MarketCoverage[]; note: string | null }> {
  const { client } = createDbConnection();
  try {
    const [archives, ids] = await client.begin("read only", async (sql) => {
      await sql`set local statement_timeout = 30000`;
      const cards = await sql<Archive[]>`select source_id as "sourceId", fetched_at as "fetchedAt", payload from source_imports where source = ${"sporting_life"} and source_type = ${"racecard-next-data"}`;
      const runners = await sql<Array<{ id: string; sourceId: string }>>`select id, source_id as "sourceId" from race_runners where race_id = any(${[...trackerRaces.keys()]}::uuid[])`;
      return [cards, runners] as const;
    });
    const coverage = marketCoverage(archives);
    const bySource = new Map(archives.map((archive) => [archive.sourceId, archive]));
    const sourceById = new Map(ids.map((row) => [row.id, row.sourceId]));
    const market = new Map<string, MarketRecord>();
    for (const race of trackerRaces.values()) {
      const archive = bySource.get(race.sourceId ?? "");
      if (!archive || !timestampsSafe(new Date(archive.fetchedAt).toISOString(), race.recordedAt, race.scheduledOffAt, race.currentOffAt)) continue;
      const rides = archive.payload.props?.pageProps?.race?.rides ?? [];
      if (rides.some((ride) => (ride.finish_position ?? 0) > 0)) continue;
      const active = rides.filter((ride) => ride.ride_status === "RUNNER");
      const quotes = race.runners.map((runner) => active.find((ride) => String(ride.ride_reference.id) === sourceById.get(runner.runnerId))?.bookmakerOdds?.filter((quote) => quote.bookmakerId === BOOKMAKER_ID) ?? []);
      if (quotes.length < 2 || quotes.some((quote) => quote.length !== 1 || quote[0]!.decimalOdds <= 1)) continue;
      const odds = quotes.map((quote) => quote[0]!.decimalOdds);
      const probabilities = marketBook(odds);
      const pairs = race.runners.map((runner, index) => [runner.runnerId, probabilities[index]!] as const);
      const top1 = [...pairs].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
      market.set(race.raceId, { top1, clean: true, capturedAt: new Date(archive.fetchedAt).toISOString(), probabilities: new Map(pairs) });
    }
    return { market, coverage, note: null };
  } catch (error) {
    return {
      market: new Map(),
      coverage: [
        { year: "2025", races: 0, priced: 0, first: "", last: "" },
        { year: "2026", races: 0, priced: 0, first: "", last: "" },
      ],
      note: `database audit unavailable in this run (${shortError(error)}). No market values were substituted from SP.`,
    };
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

function marketCoverage(archives: Archive[]): MarketCoverage[] {
  const years = new Map<string, MarketCoverage>();
  for (const archive of archives) {
    const card = archive.payload.props?.pageProps?.race;
    const date = card?.race_summary?.date ?? "unknown";
    const year = date.slice(0, 4);
    const row = years.get(year) ?? { year, races: 0, priced: 0, first: date, last: date };
    row.races += 1;
    row.first = row.first < date ? row.first : date;
    row.last = row.last > date ? row.last : date;
    const rides = card?.rides?.filter((ride) => ride.ride_status === "RUNNER") ?? [];
    if (rides.length >= 2 && rides.every((ride) => (ride.bookmakerOdds ?? []).some((quote) => quote.bookmakerId === BOOKMAKER_ID && quote.decimalOdds > 1))) row.priced += 1;
    years.set(year, row);
  }
  if (!years.has("2025")) years.set("2025", { year: "2025", races: 0, priced: 0, first: "", last: "" });
  return [...years.values()].sort((left, right) => left.year.localeCompare(right.year));
}

function decision(contexts: Context[], tissue: ReadonlyMap<string, TissueRecord>, market: ReadonlyMap<string, MarketRecord>): string[][] {
  return FAMILIES.map((family) => {
    const candidates = CANDIDATES.filter((candidate) => candidate.family === family);
    const rows = candidates.map((candidate) => {
      const dev = summarizeCandidateSelections(selectCandidates(contextFor(contexts, family, "2025"), candidate, tissue, market), contextFor(contexts, family, "2025").totalRaces);
      const holdout = summarizeCandidateSelections(selectCandidates(contextFor(contexts, family, "2026"), candidate, tissue, market), contextFor(contexts, family, "2026").totalRaces);
      return { candidate, dev, holdout };
    });
    const viable = rows.filter((row) => row.dev.selections >= 25 && row.holdout.selections >= 25 && (row.dev.ae ?? 0) >= 1 && (row.holdout.ae ?? 0) >= 1 && row.dev.profitLoss > 0 && row.holdout.profitLoss > 0);
    if (!viable.length) return [familyLabel(family), "No. The sparse structural gates produce interesting diagnostics, but none clears a deliberately simple development/holdout credibility bar without retrospective market information. Do not expand the parameter search."];
    const simplest = viable.sort((left, right) => left.candidate.description.length - right.candidate.description.length)[0]!;
    return [familyLabel(family), `Yes, cautiously. Simplest prospective shadow definition: ${simplest.candidate.label}. Keep it as a shadow shortlist only, with the stated pre-race structural/rating inputs and no market-residual fitting.`];
  });
}

function evidence(contexts: Context[], tissue: ReadonlyMap<string, TissueRecord>, market: ReadonlyMap<string, MarketRecord>, coverage: MarketCoverage[]) {
  return {
    marketCoverage: coverage,
    candidates: CANDIDATES.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      yearly: YEARS.map((year) => {
        const context = contextFor(contexts, candidate.family, year);
        return { year, ...summarizeCandidateSelections(selectCandidates(context, candidate, tissue, market), context.totalRaces) };
      }),
    })),
  };
}

async function fingerprints() {
  const paths: string[] = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) paths.push(full);
    }
  }
  await walk("src");
  for (const entry of await readdir("data/research")) if (entry.endsWith(".json")) paths.push(join("data/research", entry));
  return Object.fromEntries(await Promise.all(paths.sort().map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
}

function ratingScore(row: RankedResearchRow): number | null {
  const derived = deriveBacktestFeatureValues(row.features);
  const value = row.features.bestJumpSpeedLast3 ?? row.features.bestAwSpeedLast3 ?? row.features.bestSpeedLast3 ?? row.features.averageJumpSpeedLast3 ?? row.features.averageAwSpeedLast3 ?? row.features.averageSpeedLast3;
  if (value === null || value === undefined) return null;
  return value + (derived.bestL3SpeedMinusOR ?? 0) * 0.05;
}

function isHandicap(row: RankedResearchRow) { return classifyHandicapStatus(row.features) === "handicap"; }
function isNonHandicap(row: RankedResearchRow) { return classifyHandicapStatus(row.features) === "non_handicap"; }
function inTop20Trainer(row: RankedResearchRow, context: Context) { return !!row.features.trainerId && !!context.trainerCohort20?.trainerIds.has(row.features.trainerId); }
function fieldSize(row: RankedResearchRow) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function raceId(row: RankedResearchRow) { return row.features.targetRaceId; }
function runnerId(row: RankedResearchRow) { return row.features.targetRunnerId; }
function raceCodeForFamily(family: Family) { return family === "all_weather_flat" ? "aw" : "jump"; }
function familyLabel(family: Family) { return family === "all_weather_flat" ? "AW" : "Jump"; }
function label(context: Context) { return `${familyLabel(context.family)} ${context.year}`; }
function contextFor(contexts: Context[], family: Family, year: Year) { const context = contexts.find((item) => item.family === family && item.year === year); if (!context) throw new Error(`Missing ${family} ${year}`); return context; }
function compareRows(left: RankedResearchRow, right: RankedResearchRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.courseName.localeCompare(right.features.courseName) ||
    raceId(left).localeCompare(raceId(right)) ||
    runnerId(left).localeCompare(runnerId(right));
}
function between(value: number | null | undefined, min: number, max: number) { return value !== null && value !== undefined && Number.isFinite(value) && value >= min && value <= max; }
function group<T>(values: T[], key: (value: T) => string) {
  const map = new Map<string, T[]>();
  for (const value of values) map.set(key(value), [...(map.get(key(value)) ?? []), value]);
  return map;
}
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function maxLosing(wins: boolean[]) {
  let current = 0, maximum = 0;
  for (const won of wins) { current = won ? 0 : current + 1; maximum = Math.max(maximum, current); }
  return maximum;
}
function maxDrawdown(returns: number[]) {
  let equity = 0, peak = 0, maximum = 0;
  for (const value of returns) { equity += value; peak = Math.max(peak, equity); maximum = Math.max(maximum, peak - equity); }
  return maximum;
}
function marketBook(odds: number[]) {
  const total = odds.reduce((sum, odd) => sum + 1 / odd, 0);
  return odds.map((odd) => 1 / odd / total);
}
function timestampsSafe(capturedAt: string, predictedAt: string, scheduledOff: string, currentOff: string): boolean {
  const [capture, prediction, scheduled, current] = [capturedAt, predictedAt, scheduledOff, currentOff].map(Date.parse);
  return [capture, prediction, scheduled, current].every(Number.isFinite) && capture! <= prediction! && prediction! < Math.min(scheduled!, current!);
}
function pct(value: number | null) { return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null, digits = 3) { return value === null ? "N/A" : value.toFixed(digits); }
function money(value: number | null) { return value === null ? "N/A" : value.toFixed(2); }
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];
}
function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ECONNREFUSED") || message.startsWith("Failed query:")) return "connect ECONNREFUSED 127.0.0.1:5432";
  return message.split("\n")[0]!.slice(0, 180);
}

if (process.argv[1]?.endsWith("diagnose-sparse-jump-aw-candidates.ts")) await main();
