/** Read-only diagnostic. Prints JSON to stdout and never saves or validates a rule in the database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDbConnection } from "../src/db";
import { settleSelection, settledWinValue } from "../src/lib/racing/backtest";
import { loadBacktestFeatureCache, type LoadedBacktestFeatureCache } from "../src/lib/racing/backtest-cache";
import { dateClusterInterval, mean, sum } from "../src/lib/racing/chase-t3-research";
import { ISOLATED_JUMP_CANDIDATE, readIsolatedJumpCandidate } from "../src/lib/racing/jump-candidate-reader";
import { classifyJumpRaceSubtype } from "../src/lib/racing/jump-speed-rating";
import { normalizedSpMarkets, observationKey, validSp } from "../src/lib/racing/research-model-comparison";
import { raceClassNumber } from "../src/lib/racing/research-rule-classes";
import {
  classifyHandicapStatus, evaluateResearchRule, matchesCalendarPeriod, matchesRaceConditions,
  matchesRankConditions, matchesRatingConditions, matchesRelativeConditions, matchesRunnerConditions,
  matchesStartingPriceCondition, matchesTurfPerformanceConditions, parseResearchRule, rankRows,
  type RankedResearchRow, type ResearchRuleV1, type NumericCondition,
} from "../src/lib/racing/research-rule";
import { listSavedResearchRulesWithDb } from "../src/lib/racing/saved-research-rules";
import { isVoidRaceOutcome } from "../src/lib/racing/settlement-outcome";
import { getTrainerCohortForRule, type ResolvedTrainerCohort } from "../src/lib/racing/trainer-cohorts";

type Row = LoadedBacktestFeatureCache["rows"][number];
type Cohort = ResolvedTrainerCohort | null;
type Study = Awaited<ReturnType<typeof prepareYear>>;
type Bet = { row: Row; settlement: ReturnType<typeof settleSelection>; won: ReturnType<typeof settledWinValue>; market: number | null };
type Variant = { label: string; rule: ResearchRuleV1 };
const priceBand = (sp: number | null) => sp === null ? "Missing" : sp < 3 ? "<3" : sp < 5 ? "3–<5" : sp < 11 ? "5–<11" : sp < 21 ? "11–<21" : "21+";
const fieldBand = (n: number | null) => n === null ? "Unknown" : n < 8 ? "2–7" : n < 12 ? "8–11" : "12+";
const classBand = (n: number | null) => n === null ? "Unknown" : n <= 3 ? "1–3" : n <= 5 ? "4–5" : "6+";
const key = ({ features }: Row) => observationKey(features.targetRaceId, features.targetRunnerId);
const subtype = ({ features }: Row) => features.raceCode === "jump" ? classifyJumpRaceSubtype(features) ?? "other jump" : "turf flat";
const field = ({ features }: Row) => features.actualRunnerCount;
const classNumber = ({ features }: Row) => raceClassNumber(features.raceClass);
const month = ({ features }: Row) => features.raceDate.slice(5, 7);
const date = ({ features }: Row) => features.raceDate;
type Priced = Bet & { settlement: NonNullable<Bet["settlement"]> };
const isPriced = (bet: Bet): bet is Priced => bet.settlement !== null;

function metrics(bets: Bet[], uncertainty = false) {
  const decided = bets.filter(b => b.won !== null);
  const priced = bets.filter(isPriced);
  const winners = priced.filter(b => b.won);
  const benchmark = priced.filter(b => b.market !== null);
  const observed = sum(benchmark.map(b => b.won ? 1 / (b.row.outcome.deadHeatDivisor ?? 1) : 0));
  const expected = sum(benchmark.map(b => b.market!));
  const profit = sum(priced.map(b => b.settlement.profitLoss));
  const gross = sum(priced.map(b => b.settlement.grossReturn));
  const sorted = [...winners].sort((a, b) => b.settlement.grossReturn - a.settlement.grossReturn || key(a.row).localeCompare(key(b.row)));
  // Remove all stakes in the highest-return winning races, including any other selected runners.
  const topRaces = [...new Set(sorted.map(b => b.row.features.targetRaceId))].slice(0, 2);
  const remove = (n: number) => {
    if (topRaces.length < n) return null;
    const excluded = new Set(topRaces.slice(0, n));
    const remaining = priced.filter(b => !excluded.has(b.row.features.targetRaceId));
    return { n: remaining.length, profit: sum(remaining.map(b => b.settlement.profitLoss)), roi: mean(remaining.map(b => b.settlement.profitLoss)) };
  };
  return {
    selections: bets.length, resultsKnown: decided.length, settled: priced.length, winners: winners.length,
    strike: priced.length ? winners.length / priced.length : null,
    resultsOnlyWinners: decided.filter(b => b.won).length,
    resultsOnlyStrike: decided.length ? decided.filter(b => b.won).length / decided.length : null,
    races: new Set(priced.map(b => b.row.features.targetRaceId)).size,
    dates: new Set(priced.map(b => date(b.row))).size,
    meanSp: mean(priced.map(b => b.settlement.settlementOddsDecimal)), winnerGross: mean(winners.map(b => b.settlement.grossReturn)),
    benchmarkN: benchmark.length, expected, observed, ae: expected ? observed / expected : null,
    profit: priced.length ? profit : null, roi: priced.length ? profit / priced.length : null,
    topRaces: topRaces.map(id => {
      const b = sorted.find(b => b.row.features.targetRaceId === id)!;
      return { raceId: id, horse: b.row.features.horseName, date: date(b.row), odds: b.settlement.settlementOddsDecimal, gross: b.settlement.grossReturn,
        grossShare: gross ? b.settlement.grossReturn / gross : null };
    }),
    afterOne: remove(1), afterTwo: remove(2),
    aeInterval: uncertainty ? dateClusterInterval(benchmark.map(b => ({
      date: date(b.row), value: b.won ? 1 / (b.row.outcome.deadHeatDivisor ?? 1) : 0, denominator: b.market!,
    }))) : null,
    roiInterval: uncertainty ? dateClusterInterval(priced.map(b => ({ date: date(b.row), value: b.settlement.profitLoss, denominator: 1 }))) : null,
  };
}

async function prepareYear(family: "jump" | "turf_flat", year: number) {
  const reconstructed = family === "jump" && year === 2026;
  const from = `${year}-01-01`, to = reconstructed ? "2026-10-14" : `${year}-12-31`;
  const [cache, isolated] = await Promise.all([
    loadBacktestFeatureCache({ from, to, family, outputDir: reconstructed ? join(ISOLATED_JUMP_CANDIDATE, "cache") : undefined }),
    reconstructed ? readIsolatedJumpCandidate() : null,
  ]);
  assert(cache?.actualCoverage, `Missing ${family} ${year}`);
  const verified = isolated ? new Set(isolated.fieldProofs.map(r => r.raceId)) : null;
  const rows = verified ? cache.rows.filter(r => verified.has(r.features.targetRaceId)) : cache.rows;
  assert.equal(new Set(rows.map(key)).size, rows.length, "Duplicate runner");
  const markets = normalizedSpMarkets(rows);
  const ranked = rankRows(rows.filter(r => !isVoidRaceOutcome(r.outcome)));
  const annotate = (row: Row): Bet => ({
    row, settlement: settleSelection(row.outcome), won: settledWinValue(row.outcome), market: markets.get(key(row)) ?? null,
  });
  const hashes = Object.fromEntries(await Promise.all(["manifest.json", cache.manifest.featuresFile, cache.manifest.outcomesFile].map(async file =>
    [file, createHash("sha256").update(await readFile(join(cache.directory, file))).digest("hex")] as const)));
  return {
    cache, ranked, annotate, bets: rows.map(annotate), rows, year,
    provenance: { directory: cache.directory, coverage: cache.actualCoverage, hashes, usedRows: rows.length, failedFields: isolated?.fieldFailures ?? null },
    isolated,
  };
}

function matches(row: RankedResearchRow, rule: ResearchRuleV1, cohort: Cohort) {
  return date(row) >= rule.dateRange.from && date(row) <= rule.dateRange.to &&
    matchesCalendarPeriod(date(row), rule.calendarPeriod) && matchesRaceConditions(row.features, rule) &&
    matchesRunnerConditions(row.features, rule, cohort) && matchesRatingConditions(row.features, rule) &&
    matchesRelativeConditions(row.features, rule) && matchesRankConditions(row, rule) &&
    matchesTurfPerformanceConditions(row, rule) && matchesStartingPriceCondition(row, rule);
}
const selections = (study: Study, rule: ResearchRuleV1, cohort: Cohort) =>
  study.ranked.filter(row => matches(row, rule, cohort)).map(study.annotate);

function breakdown(bets: Bet[], group: (b: Bet) => string) {
  return Object.fromEntries([...Map.groupBy(bets, group)].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => [name, metrics(rows)]));
}

function describe(study: Study, bets: Bet[], rule: ResearchRuleV1) {
  const completeMarketRaces = new Set(bets.filter(b => b.market !== null).map(b => b.row.features.targetRaceId));
  const markets = Map.groupBy(study.bets.filter(b => b.market !== null && completeMarketRaces.has(b.row.features.targetRaceId)), b => b.row.features.targetRaceId);
  const favourites = [...markets.values()].map(race => [...race].sort((a, b) => b.market! - a.market! || key(a.row).localeCompare(key(b.row)))[0]);
  const universe = study.bets.filter(b => matchesRaceConditions(b.row.features, rule) &&
    date(b.row) >= rule.dateRange.from && date(b.row) <= rule.dateRange.to && matchesCalendarPeriod(date(b.row), rule.calendarPeriod));
  const fewGroups = bets.filter(isPriced);
  return {
    main: metrics(bets, true),
    marketCoveredSelections: metrics(bets.filter(b => b.market !== null)),
    favourite: metrics(favourites, true),
    universe: { settled: universe.filter(isPriced).length, uniqueRaces: new Set(universe.map(b => b.row.features.targetRaceId)).size },
    context: { averageField: mean(fewGroups.map(b => field(b.row)).filter(n => n !== null)),
      averageClass: mean(fewGroups.map(b => classNumber(b.row)).filter(n => n !== null)) },
    months: breakdown(bets, b => month(b.row)), subtype: breakdown(bets, b => subtype(b.row)),
    fields: breakdown(bets, b => fieldBand(field(b.row))), classes: breakdown(bets, b => classBand(classNumber(b.row))),
    handicap: breakdown(bets, b => classifyHandicapStatus(b.row.features)), odds: breakdown(bets, b => priceBand(validSp(b.row.outcome))),
  };
}

function matched(left: Bet[], right: Bet[], keyFor: (b: Priced) => string) {
  const first = Map.groupBy(left.filter(isPriced), keyFor), second = Map.groupBy(right.filter(isPriced), keyFor);
  const cells = [...first].flatMap(([key, a]) => {
    const b = second.get(key);
    return b ? [{ a, b, weight: Math.min(a.length, b.length) }] : [];
  });
  const total = sum(cells.map(c => c.weight));
  const summarize = (side: "a" | "b") => {
    const weighted = cells.flatMap(c => c[side].map(b => ({ b, weight: c.weight / c[side].length })));
    const market = weighted.filter(({ b }) => b.market !== null);
    const expected = sum(market.map(({ b, weight }) => b.market! * weight));
    const actual = sum(market.map(({ b, weight }) => b.won ? weight / (b.row.outcome.deadHeatDivisor ?? 1) : 0));
    return {
      actualRows: weighted.length, effectiveCount: sum(weighted.map(({ weight }) => weight)) ** 2 / sum(weighted.map(({ weight }) => weight ** 2)) || 0,
      strike: total ? sum(weighted.map(({ b, weight }) => b.won ? weight : 0)) / total : null,
      meanSp: total ? sum(weighted.map(({ b, weight }) => b.settlement.settlementOddsDecimal * weight)) / total : null,
      roi: total ? sum(weighted.map(({ b, weight }) => b.settlement.profitLoss * weight)) / total : null,
      marketWeight: sum(market.map(({ weight }) => weight)), expected, actual, ae: expected ? actual / expected : null,
    };
  };
  return { cells: cells.length, total, first: summarize("a"), second: summarize("b") };
}

function contextKey({ row }: Bet) {
  return [month(row), subtype(row), fieldBand(field(row)), classBand(classNumber(row))].join("/");
}

const steps = { daysSinceRun: 5, priorRuns: 1, trainerPriorWinRate: 1, jockeyPriorWinRate: 1, weightCarriedLbs: 2 } as const;
function edgeVariants(range: NumericCondition, step: number, minimum: number, label: string, update: (next: NumericCondition) => ResearchRuleV1) {
  return (["min", "max"] as const).flatMap(edge => {
    const value = range[edge];
    if (value === undefined) return [];
    return [-step, step].flatMap(delta => {
      const changed = value + delta;
      if (changed < minimum || (edge === "min" && range.max !== undefined && changed > range.max) ||
        (edge === "max" && range.min !== undefined && changed < range.min)) return [];
      return [{ label: `${label} ${edge} ${value} → ${changed}`, rule: update({ ...range, [edge]: changed }) }];
    });
  });
}
function variants(rule: ResearchRuleV1) {
  const drops: Variant[] = [];
  const neighbours: Variant[] = [];
  if (rule.runner.trainerCohort) {
    const { trainerCohort } = rule.runner;
    drops.push({ label: "Trainer cohort", rule: { ...rule, runner: { ...rule.runner, trainerCohort: undefined } } });
    for (const top of [10, 20, 30] as const) {
      if (Math.abs(top - trainerCohort.top) === 10) neighbours.push({ label: `Trainer cohort top ${top}`, rule: { ...rule, runner: { ...rule.runner, trainerCohort: { ...trainerCohort, top } } } });
    }
  }
  for (const [label, step] of Object.entries(steps) as [keyof typeof steps, number][]) {
    const range = rule.runner[label];
    if (!range) continue;
    const update = (next: NumericCondition | undefined) => ({ ...rule, runner: { ...rule.runner, [label]: next } });
    drops.push({ label, rule: update(undefined) });
    neighbours.push(...edgeVariants(range, step, 0, label, update));
  }
  if (rule.race.handicapStatus) drops.push({ label: "Handicap", rule: { ...rule, race: { ...rule.race, handicapStatus: undefined } } });
  if (rule.race.jumpSubtype) drops.push({ label: "Chase subtype", rule: { ...rule, race: { ...rule.race, jumpSubtype: undefined } } });
  for (const [index, rank] of rule.ranks.entries()) {
    const label = rank.metric;
    drops.push({ label, rule: { ...rule, ranks: rule.ranks.filter((_, i) => i !== index) } });
    neighbours.push(...edgeVariants(rank.range, 1, 1, label, range => ({ ...rule, ranks: rule.ranks.map((r, i) => i === index ? { ...r, range } : r) })));
  }
  if (rule.turfPerformance) {
    const condition = rule.turfPerformance;
    drops.push({ label: "TPR rank", rule: { ...rule, turfPerformance: undefined } });
    if (condition.rank) neighbours.push(...edgeVariants(condition.rank, 1, 1, "TPR rank", rank => ({ ...rule, turfPerformance: { ...condition, rank } })));
  }
  return { drops, neighbours };
}

function narrowJumpHistory(study: Study, rule: ResearchRuleV1, bets: Bet[]) {
  if (!study.isolated) return null;
  const supported = [ ...(rule.runner.daysSinceRun ? ["daysSinceLastRun" as const] : []),
    ...(rule.runner.priorRuns ? ["priorRuns" as const] : []), ...(rule.ranks.some(r => r.metric === "officialRating") ? ["officialRating" as const] : []) ];
  const maps = supported.map(feature => new Set(study.isolated!.analyze(feature).races.flatMap(race =>
    race.observations.filter(row => row.eligibility.eligible && (feature !== "officialRating" || row.rank.wholeFieldRank !== null)).map(row => row.runnerId))));
  return metrics(bets.filter(b => maps.every(allowed => allowed.has(b.row.features.targetRunnerId))), true);
}

async function main() {
  const sourceBefore = JSON.stringify(await getSavedRules());
  const saved = JSON.parse(sourceBefore) as Awaited<ReturnType<typeof getSavedRules>>;
  assert(saved.length > 0);
  const unique = [...Map.groupBy(saved, r => r.ruleIdentity).values()];
  const families = [...new Set(unique.map(([r]) => r.family))];
  const studies = new Map<string, Study>();
  for (const family of families) {
    assert(family === "jump" || family === "turf_flat", `Unreviewed family ${family}`);
    for (const year of [2025, 2026]) studies.set(`${family}/${year}`, await prepareYear(family, year));
  }
  const connection = createDbConnection();
  const cohorts = new Map<string, Promise<Cohort>>();
  const cohortFor = (rule: ResearchRuleV1, year: number) => {
    const key = JSON.stringify([rule.family, year, rule.runner.trainerCohort]);
    const existing = cohorts.get(key);
    if (existing) return existing;
    const pending = getTrainerCohortForRule(connection.db, rule, year);
    cohorts.set(key, pending);
    return pending;
  };
  try {
    const comparisons = [];
    for (const group of unique) {
      const original = parseResearchRule(JSON.stringify(group[0].canonicalRule));
      assert(original && !original.startingPrice, "SP-conditioned rules require separate interpretation");
      const years = await Promise.all([2025, 2026].map(async year => {
        const study = studies.get(`${original.family}/${year}`)!;
        const coverage = study.cache.actualCoverage!;
        const rule = { ...original, dateRange: year === 2025 ? original.dateRange : { from: coverage.actualFrom, to: coverage.actualTo } };
        const cohort = await cohortFor(rule, year);
        const bets = selections(study, rule, cohort);
        const exact = evaluateResearchRule({ rows: study.rows, rule, trainerCohort: cohort });
        assert.deepEqual(bets.map(b => key(b.row)).sort(), exact.selectedRunners.map(key).sort(), "Saved-rule replay drift");
        assert.equal(metrics(bets).settled, exact.summary.settledSelections);
        assert(Math.abs((metrics(bets).profit ?? 0) - exact.summary.profitLoss) < 1e-8);
        const { drops, neighbours } = variants(rule);
        const selectedKeys = new Set(bets.map(b => key(b.row)));
        const [dropping, moving] = await Promise.all([drops, neighbours].map(list => Promise.all(list.map(async v => {
          const picked = selections(study, v.rule, await cohortFor(v.rule, year));
          return { label: v.label, rule: v.rule, metrics: metrics(picked), added: metrics(picked.filter(b => !selectedKeys.has(key(b.row)))) };
        }))));
        const pair = rule.family === "turf_flat" ? ["latestPerformanceRating", "TPR rank"] : rule.race.jumpSubtype ? ["trainerPriorWinRate", "jockeyPriorWinRate"] : ["weightCarriedLbs", "trainerPriorWinRate"];
        const dropped = pair.map(label => drops.find(d => d.label === label)!);
        assert(dropped.every(Boolean));
        const dropBoth = rule.family === "turf_flat" ? { ...rule, ranks: [], turfPerformance: undefined } :
          { ...rule, runner: { ...rule.runner, [pair[0]]: undefined, [pair[1]]: undefined } };
        const onlyFirst = new Set(selections(study, dropped[1].rule, cohort).map(b => key(b.row)));
        const onlySecond = new Set(selections(study, dropped[0].rule, cohort).map(b => key(b.row)));
        const interactions = breakdown(selections(study, dropBoth, cohort), b => {
          const id = key(b.row);
          return `${Number(onlyFirst.has(id))}${Number(onlySecond.has(id))}`;
        });
        return { year, bets, rule, cohort, context: describe(study, bets, rule), dropping, moving, pair, interactions, historySensitivity: narrowJumpHistory(study, rule, bets) };
      }));
      const [left, right] = years;
      const sharedTrainerIds = new Set([...(left.cohort?.trainerIds ?? [])].filter(id => right.cohort?.trainerIds.has(id)));
      const overlap = { from: [left.rule.dateRange.from.slice(5), studies.get(`${original.family}/2025`)!.cache.actualCoverage!.actualFrom.slice(5),
        right.rule.dateRange.from.slice(5)].sort().at(-1)!,
        to: [studies.get(`${original.family}/2025`)!.cache.actualCoverage!.actualTo.slice(5), right.rule.dateRange.to.slice(5)].sort()[0] };
      const sameSeason = years.map(y => y.bets.filter(b => date(b.row).slice(5) >= overlap.from && date(b.row).slice(5) <= overlap.to));
      const afterTopTwo = sameSeason.map(bets => {
        const top = metrics(bets).topRaces;
        return bets.filter(bet => !top.some(race => race.raceId === bet.row.features.targetRaceId));
      });
      comparisons.push({
        saved: group, overlap,
        matchedRaceMix: matched(sameSeason[0], sameSeason[1], contextKey),
        matchedRaceMixAndPrice: matched(sameSeason[0], sameSeason[1], b => `${contextKey(b)}/${priceBand(b.settlement.settlementOddsDecimal)}`),
        matchedWithoutTopTwo: matched(afterTopTwo[0], afterTopTwo[1], contextKey),
        years: years.map(({ bets, cohort, ...row }) => ({
          ...row, trainers: cohort?.members.map(m => m.trainerName), sharedTrainers: sharedTrainerIds.size,
          sharedTrainerResults: metrics(bets.filter(b => b.row.features.trainerId !== null && sharedTrainerIds.has(b.row.features.trainerId))),
          sameSeason: metrics(sameSeason[row.year - 2025], true),
        })),
      });
    }
    assert.equal(JSON.stringify(await getSavedRules()), sourceBefore, "Saved rule inputs changed during the diagnostic");
    for (const { cache, provenance } of studies.values()) {
      for (const [file, hash] of Object.entries(provenance.hashes)) {
        assert.equal(createHash("sha256").update(await readFile(join(cache.directory, file))).digest("hex"), hash, file);
      }
    }
    process.stdout.write(JSON.stringify({
      provenance: Object.fromEntries([...studies].map(([key, study]) => [key, study.provenance])), comparisons,
    }, null, 2) + "\n");
  } finally { await connection.client.end(); }
}

async function getSavedRules() {
  const connection = createDbConnection();
  try { return await listSavedResearchRulesWithDb(connection.db); }
  finally { await connection.client.end(); }
}

await main();
