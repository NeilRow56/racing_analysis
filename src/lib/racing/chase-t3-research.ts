import { latestPreOffCaptures } from "./frozen-capture-selection";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { BADGE_PRICE_BANDS, tissueBadgePriceBand } from "./tissue-positive-neutral-method";
import type { GenerationData, GenerationRace } from "./tissue-generation-forward";
import { normalizeCompleteMarket, valueCompetitionRanks, VALUE_MARKET_RANK_BANDS, valueMarketRankBand } from "./tissue-value-metrics";

export const CHASE_T3_REVIEW_CUTOFF = "2026-11-18T16:05:44.000Z";
export const CHASE_T3_VALIDATION_START = "2026-11-19";
type Runner = GenerationRace["runners"][number];
type Selection = { book: GenerationRace; runner: Runner; market: number | null; marketRank: number | null };

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const mean = (values: number[]) => values.length ? sum(values) / values.length : null;
export const winnerCredit = (outcome: Runner["outcome"]) => outcome?.status === "settled" && outcome.winner ? 1 / outcome.deadHeatDivisor : 0;

export function frozenFeature(book: { featureNames: string[] }, runner: { modelInputs: number[] }, name: string) {
  const index = book.featureNames.indexOf(name);
  const missing = book.featureNames.indexOf(`${name}_missing`);
  const value = runner.modelInputs[index];
  return Number.isFinite(value) && missing >= 0 && runner.modelInputs[missing] === 0 ? value : null;
}

export function dateClusterInterval(rows: { date: string; value: number; denominator: number }[]) {
  const dates = [...Map.groupBy(rows, row => row.date).values()].map(group => ({
    value: sum(group.map(row => row.value)), denominator: sum(group.map(row => row.denominator)),
  }));
  if (dates.length < 2) return null;
  let seed = 42;
  const samples = Array.from({ length: 2000 }, () => {
    let numerator = 0, denominator = 0;
    for (let i = 0; i < dates.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const date = dates[Math.floor(seed / 2 ** 32 * dates.length)];
      numerator += date.value;
      denominator += date.denominator;
    }
    return denominator > 0 ? numerator / denominator : NaN;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  return samples.length ? [samples[Math.floor(samples.length * .025)], samples[Math.floor(samples.length * .975)]] as const : null;
}

export function recordedStake(runner: Pick<Runner, "capturedPrice" | "outcome">) {
  const outcome = runner.outcome;
  return runner.capturedPrice !== null && Number.isFinite(runner.capturedPrice) && runner.capturedPrice > 1 &&
    outcome?.status === "settled" &&
    outcome.settlementVersion === CANONICAL_SETTLEMENT_VERSION && outcome.profitLoss !== null &&
    outcome.grossReturn !== null && Number.isFinite(outcome.profitLoss) && Number.isFinite(outcome.grossReturn)
    ? { profit: outcome.profitLoss, gross: outcome.grossReturn, winner: outcome.winner === true } : null;
}

export function stakeSensitivity(stakes: NonNullable<ReturnType<typeof recordedStake>>[]) {
  const winning = stakes.filter(stake => stake.winner).sort((a, b) => b.gross - a.gross);
  const summarize = (excluded: number) => {
    const removed = winning.slice(0, excluded);
    const n = stakes.length - removed.length;
    const profit = n ? sum(stakes.map(s => s.profit)) - sum(removed.map(s => s.profit)) : null;
    return { n, profit, roi: profit === null ? null : profit / n };
  };
  return { ...summarize(0), afterOne: winning.length ? summarize(1) : null, afterTwo: winning.length >= 2 ? summarize(2) : null };
}

function summarize(picks: Selection[], uncertainty = false) {
  const settled = picks.filter(pick => pick.runner.outcome?.status === "settled");
  const market = settled.filter(pick => pick.market !== null);
  const expected = market.length ? sum(market.map(pick => pick.market!)) : null;
  const wins = sum(market.map(pick => winnerCredit(pick.runner.outcome)));
  const winners = settled.filter(pick => pick.runner.outcome?.winner === true).length;
  const staked = settled.flatMap(({ book, runner }) => {
    const stake = recordedStake(runner);
    return stake ? [{ ...stake, date: book.raceDate }] : [];
  });
  return {
    captured: picks.length, settled: settled.length, winners, strike: settled.length ? winners / settled.length : null,
    dates: new Set(settled.map(pick => pick.book.raceDate)).size,
    modelExpected: settled.length ? sum(settled.map(pick => pick.runner.probability)) : null,
    marketN: market.length, marketExpected: expected, marketWins: wins, ae: expected ? wins / expected : null,
    priced: picks.filter(pick => pick.runner.capturedPrice !== null).length,
    settledPriced: settled.filter(pick => pick.runner.capturedPrice !== null).length,
    ...stakeSensitivity(staked), stakeDates: new Set(staked.map(stake => stake.date)).size,
    aeInterval: uncertainty ? dateClusterInterval(market.map(pick => ({
      date: pick.book.raceDate, value: winnerCredit(pick.runner.outcome), denominator: pick.market!,
    }))) : null,
    roiInterval: uncertainty ? dateClusterInterval(staked.map(s => ({ date: s.date, value: s.profit, denominator: 1 }))) : null,
  };
}

function picksForBook(book: GenerationRace): Selection[] {
  const market = book.completeMarket ? normalizeCompleteMarket(book.runners.map(row => row.capturedPrice)) : null;
  const marketRanks = market && valueCompetitionRanks(market.probabilities);
  return book.runners.map((runner, i) => ({ book, runner, market: market?.probabilities[i] ?? null, marketRank: marketRanks?.[i] ?? null }));
}

function report(books: GenerationRace[]) {
  const picks = books.flatMap(book => picksForBook(book).filter(pick => pick.runner.rank === 3));
  const byDate = [...Map.groupBy(picks, pick => pick.book.raceDate)].sort(([left], [right]) => right.localeCompare(left));
  return {
    headline: summarize(picks, true),
    periods: [...Map.groupBy(picks, pick => pick.book.raceDate.slice(0, 7))].sort(([left], [right]) => left.localeCompare(right))
      .map(([month, rows]) => [month, summarize(rows)] as const),
    odds: BADGE_PRICE_BANDS.map(band => [band, summarize(picks.filter(({ runner }) => runner.capturedPrice !== null && tissueBadgePriceBand(runner.capturedPrice) === band))] as const),
    marketRanks: VALUE_MARKET_RANK_BANDS.map(band => [band, summarize(picks.filter(pick => pick.marketRank !== null && valueMarketRankBand(pick.marketRank) === band))] as const),
    dates: byDate.map(([date, rows]) => [date, summarize(rows)] as const),
  };
}

export function chaseT3Books(data: GenerationData) {
  const chase = data.races.filter(race => race.family === "CHASE");
  const historical = latestPreOffCaptures(chase.filter(race => race.raceDate < CHASE_T3_VALIDATION_START &&
    Date.parse(race.capturedAt) <= Date.parse(CHASE_T3_REVIEW_CUTOFF))).map(book => ({
    ...book, runners: book.runners.map(runner => ({
      ...runner, outcome: runner.outcome && Date.parse(runner.outcome.settledAt) <= Date.parse(CHASE_T3_REVIEW_CUTOFF) ? runner.outcome : null,
    })),
  }));
  // Keep the first recorded book fixed even when a manual refresh later changes the field.
  const first = new Map<string, GenerationRace>();
  const known = new Set(chase.filter(book => book.raceDate < CHASE_T3_VALIDATION_START).map(book => book.raceId));
  for (const book of chase.filter(book => book.raceDate >= CHASE_T3_VALIDATION_START &&
    book.capturedAt.slice(0, 10) >= CHASE_T3_VALIDATION_START && Date.parse(book.capturedAt) < Date.parse(book.scheduledOff))) {
    const previous = first.get(book.raceId);
    if (!known.has(book.raceId) && (!previous || Date.parse(book.capturedAt) < Date.parse(previous.capturedAt))) first.set(book.raceId, book);
  }
  return { historical, prospective: [...first.values()] };
}

export function describeMatchedChase(books: GenerationRace[]) {
  const groups = [[], [], [], []] as Selection[][];
  for (const book of books) {
    const picks = picksForBook(book);
    if (picks.some(pick => pick.runner.outcome?.status !== "settled") || !picks.some(pick => winnerCredit(pick.runner.outcome) > 0)) continue;
    const favourite = picks.filter(pick => pick.marketRank === 1).sort((a, b) => a.runner.runnerId.localeCompare(b.runner.runnerId))[0];
    const matched = [1, 2, 3].map(rank => picks.find(pick => pick.runner.rank === rank));
    if (!favourite || !matched.every(pick => pick !== undefined)) continue;
    [...matched, favourite].forEach((pick, i) => groups[i].push(pick!));
  }
  const observed = (rows: Selection[], measure: (p: Selection) => number | null) => {
    const values = rows.map(measure).filter((value): value is number => value !== null);
    return { mean: mean(values), n: values.length };
  };
  return groups.map((rows, i) => {
    const feature = (name: string) => observed(rows, ({ book, runner }) => frozenFeature(book, runner, name));
    const position = (name: string, gap = false) => observed(rows, ({ book, runner, marketRank }) => {
      const value = frozenFeature(book, runner, name);
      if (value === null) return null;
      const rank = 1 + book.runners.filter(r => (frozenFeature(book, r, name) ?? -Infinity) > value).length;
      return gap && marketRank !== null ? marketRank - rank : rank;
    });
    return {
      label: ["T1", "T2", "T3", "Market favourite"][i], ...summarize(rows, true),
      marketRank: observed(rows, pick => pick.marketRank), decimalOdds: observed(rows, pick => pick.runner.capturedPrice),
      officialRatingRank: position("official_rating"), speedRank: position("best_l3_jump_speed"),
      ratingMarketGap: position("official_rating", true), speedMarketGap: position("best_l3_jump_speed", true),
      bestRecentSpeed: feature("best_l3_jump_speed"), priorJumpStarts: observed(rows, ({ book, runner }) => {
        const logStarts = frozenFeature(book, runner, "log_prior_jump_starts");
        return logStarts === null ? null : Math.round(Math.expm1(logStarts));
      }),
      weight: feature("weight_lbs"), fieldSize: observed(rows, pick => pick.book.runners.length), handicap: feature("handicap"),
      class: feature("class"), distance: feature("distance_furlongs"),
      fieldRating: observed(rows, ({ book }) => mean(book.runners.flatMap(runner => {
        const rating = frozenFeature(book, runner, "official_rating");
        return rating === null ? [] : [rating];
      }))),
    };
  });
}

export function describeChaseRaceContexts(books: GenerationRace[]) {
  const picks = books.flatMap(book => picksForBook(book).filter(pick => pick.runner.rank === 3));
  const feature = ({ book, runner }: Selection, name: string) => frozenFeature(book, runner, name);
  const classify = (value: number | null, cut: number, lower: string, upper: string) =>
    value === null ? "Missing" : value < cut ? lower : upper;
  const groups = [
    { label: "Field size", value: (p: Selection) => classify(p.book.runners.length, 8, "2–7", "8+") },
    { label: "Handicap", value: (p: Selection) => classify(feature(p, "handicap"), 1, "Non-handicap", "Handicap") },
    { label: "Distance", value: (p: Selection) => classify(feature(p, "distance_furlongs"), 20, "<20 furlongs", "20+ furlongs") },
    { label: "Class", value: (p: Selection) => classify(feature(p, "class"), 4, "Class 1–3", "Class 4 or higher number") },
    { label: "Mean observed field rating", value: ({ book }: Selection) => {
      const ratings = book.runners.map(runner => frozenFeature(book, runner, "official_rating")).filter(rating => rating !== null);
      return classify(mean(ratings), 120, "<120", "120+");
    } },
  ];
  return groups.map(({ label, value }) => ({
    label, bands: [...Map.groupBy(picks, value)].map(([band, rows]) => ({ band, ...summarize(rows, true) })),
  }));
}

export function chaseT3Research(data: GenerationData) {
  const { historical, prospective } = chaseT3Books(data);
  const historicalReport = report(historical);
  const early = historical.filter(book => book.raceDate <= "2026-11-11");
  const late = historical.filter(book => book.raceDate >= "2026-11-12");
  return {
    historical: { ...historicalReport, periods: [
      ["5–11 November 2026", report(early).headline],
      ["12–18 November 2026", report(late).headline],
    ] as const },
    prospective: report(prospective),
  };
}
