/** Offline diagnostic. Reads frozen ledgers and prints a Markdown report to stdout. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { HURDLE_V3_SHADOW_PATH, loadHurdleV3Shadow } from "../src/lib/racing/hurdle-v3-shadow";
import { EPOCH_MANIFEST, EPOCHS } from "../src/lib/racing/prospective-epoch-config";
import { assertEpochSources, loadEpochManifest, sha256 } from "../src/lib/racing/prospective-epoch-integrity";
import { CANONICAL_SETTLEMENT_VERSION, type SettlementVersionedSnapshot } from "../src/lib/racing/research-settlement-version";
import { loadTissueGeneration, TISSUE_GENERATION_FORWARD_PATH, type GenerationRace } from "../src/lib/racing/tissue-generation-forward";
import { generationModelPath, loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";
import { BADGE_PRICE_BANDS, tissueBadgePriceBand } from "../src/lib/racing/tissue-positive-neutral-method";
import { VALUE_COHORTS } from "../src/lib/racing/tissue-value-config";
import { loadValueForward, type TissueValueRace } from "../src/lib/racing/tissue-value-forward";
import { normalizeCompleteMarket, TISSUE_VALUE_FAMILIES, valueCompetitionRanks, valueMarketRankBand, type TissueValueFamily, type ValueOutcome } from "../src/lib/racing/tissue-value-metrics";

const ranks = [1, 2, 3, 4, 5] as const;
const families = TISSUE_VALUE_FAMILIES;
const manifestPath = "data/research/tissue-generation-2026-11-manifest.json";
const developmentPath = "data/research/tissue-generation-development-2026-11.json";
const referencePath = "data/research/tissue-generation-chase-promotion-2026-11.json";
const legacyModelPaths = {
  TURF: "data/research/tissue-model-v3.json",
  AW: "data/research/aw-tissue-model-v2.json",
  HURDLE: "data/research/jump-tissue-model-v1.json",
  CHASE: "data/research/jump-tissue-model-v1.json",
};
type Outcome = ValueOutcome & SettlementVersionedSnapshot;
export type Pick = {
  rank: number; probability: number; price: number | null; market: number | null; marketRank: number | null;
  outcome: Outcome | null; raceDate: string; raceId: string; runnerId: string; course: string; horseName: string;
};
export type Book = {
  family: TissueValueFamily; model: string; raceId: string; raceDate: string; capturedAt: string; scheduledOff: string;
  picks: Pick[];
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : null;
const hasPrice = <T extends Pick>(p: T): p is T & { price: number } => p.price !== null && Number.isFinite(p.price) && p.price > 1;
const settled = (p: Pick): p is Pick & { outcome: Outcome } => p.outcome?.status === "settled";
const won = (p: Pick) => p.outcome?.winner === true;
const credit = (p: Pick) => won(p) ? 1 / p.outcome!.deadHeatDivisor : 0;

function placedStakes(rows: Pick[]) {
  return rows.filter(settled).filter(p => hasPrice(p) &&
    p.outcome.settlementVersion === CANONICAL_SETTLEMENT_VERSION &&
    p.outcome.profitLoss !== null && Number.isFinite(p.outcome.profitLoss));
}
function pnl(rows: ReturnType<typeof placedStakes>) {
  return rows.length ? sum(rows.map(p => p.outcome.profitLoss!)) : null;
}
export function metrics(rows: Pick[]) {
  const results = rows.filter(settled);
  const market = results.filter(p => p.market !== null);
  const price = results.filter(hasPrice);
  const stakes = placedStakes(rows);
  const modelExpected = sum(results.map(p => p.probability));
  const marketExpected = sum(market.map(p => p.market!));
  const odds = price.map(p => p.price).sort((a, b) => a - b);
  const middle = Math.floor(odds.length / 2);
  const profit = pnl(stakes);
  return {
    captured: rows.length, settled: results.length, winners: results.filter(won).length, strike: mean(results.map(p => Number(won(p)))),
    credit: sum(results.map(credit)), modelExpected: results.length ? modelExpected : null,
    modelAE: modelExpected > 0 ? sum(results.map(credit)) / modelExpected : null,
    marketN: market.length, marketWinners: sum(market.map(credit)), marketExpected: market.length ? marketExpected : null,
    marketAE: marketExpected > 0 ? sum(market.map(credit)) / marketExpected : null,
    capturePriceN: rows.filter(hasPrice).length, priced: price.length, stakes: stakes.length, profit, roi: profit === null ? null : profit / stakes.length,
    averageOdds: mean(odds), medianOdds: odds.length ? (odds[Math.floor((odds.length - 1) / 2)] + odds[middle]) / 2 : null,
  };
}

export function robustness(rows: Pick[]) {
  const stakes = placedStakes(rows);
  const wins = stakes.filter(won).sort((a, b) => (b.outcome.grossReturn ?? 0) - (a.outcome.grossReturn ?? 0));
  const winningRaces = [...Map.groupBy(wins, p => p.raceId).values()].map(picks => picks[0]);
  const less = (n: number) => {
    const removed = new Set(winningRaces.slice(0, n).map(p => p.raceId));
    const remaining = stakes.filter(p => !removed.has(p.raceId));
    const profit = pnl(remaining);
    return remaining.length && profit !== null ? { profit, roi: profit / remaining.length } : null;
  };
  const courses = Map.groupBy(stakes, p => p.course);
  const course = [...courses].sort((a, b) => (pnl(b[1]) ?? 0) - (pnl(a[1]) ?? 0))[0];
  return {
    dates: new Set(stakes.map(p => p.raceDate)).size, winners: wins.length, largest: winningRaces[0], second: winningRaces[1],
    afterOne: less(1), afterTwo: less(2), course: course ? { name: course[0], stakes: course[1].length, profit: pnl(course[1]) } : null,
    periods: ["Before 5 November", "5–11 November", "12 November onward"].map(label => {
      const rows = stakes.filter(p => period(p.raceDate) === label);
      return { label, stakes: rows.length, profit: pnl(rows) };
    }),
  };
}

export const hasAllRanks = (book: Book) => ranks.every(rank => book.picks.some(p => p.rank === rank));
export function matchedRaces(books: Book[]) {
  assert.equal(new Set(books.map(b => b.raceId)).size, books.length);
  const available = books.filter(hasAllRanks);
  const final = available.filter(b => b.picks.every(p => p.outcome !== null) && b.picks.some(p => settled(p) && won(p)));
  const priced = final.filter(b => b.picks.every(p => p.marketRank !== null));
  const winners = (b: Book) => b.picks.filter(p => settled(p) && won(p));
  const best = (b: Book) => Math.min(...winners(b).map(p => p.rank));
  const bestMarket = (b: Book) => Math.min(...winners(b).map(p => p.marketRank!));
  const hits = (bs: Book[], rank: (b: Book) => number) => [1, 2, 3, 5].map(k => bs.filter(b => rank(b) <= k).length);
  return {
    available: available.length, final: final.length, priced: priced.length, fullSettled: final.filter(b => b.picks.filter(p => p.rank <= 5).every(settled)),
    distribution: [...ranks.map(r => final.filter(b => best(b) === r).length), final.filter(b => best(b) > 5).length],
    hits: hits(final, best), tissueMarketMatched: hits(priced, best), marketHits: hits(priced, bestMarket),
    longMarketWinners: priced.filter(b => winners(b).some(p => p.rank >= 3 && p.rank <= 5 && p.marketRank! > 5)).length,
    deadHeats: final.filter(b => winners(b).length > 1).length,
    tiedBooks: available.filter(b => b.picks.length !== new Set(b.picks.map(p => p.rank)).size).length,
  };
}

function productionBook(r: GenerationRace): Book {
  const market = r.completeMarket ? normalizeCompleteMarket(r.runners.map(p => p.capturedPrice)) : null;
  const marketRanks = market ? valueCompetitionRanks(market.probabilities) : null;
  return {
    family: r.family, model: r.modelVersion, raceId: r.raceId, raceDate: r.raceDate, capturedAt: r.capturedAt, scheduledOff: r.scheduledOff,
    picks: r.runners.map((p, i) => ({
      rank: p.rank, probability: p.probability, price: p.capturedPrice, market: market ? p.marketProbability ?? market.probabilities[i] : null,
      marketRank: marketRanks?.[i] ?? null, outcome: p.outcome, raceDate: r.raceDate, raceId: r.raceId, runnerId: p.runnerId, course: r.course, horseName: p.horseName,
    })),
  };
}
function valueBook(r: TissueValueRace): Book {
  return {
    family: r.family, model: r.modelVersion, raceId: r.raceId, raceDate: r.raceDate, capturedAt: r.capturedAt, scheduledOff: r.scheduledOff,
    picks: r.runners.map(p => ({
      rank: p.tissueRank, probability: p.probability, price: p.marketPrice, market: p.marketProbability, marketRank: p.marketRank,
      outcome: p.outcome, raceDate: r.raceDate, raceId: r.raceId, runnerId: p.runnerId, course: r.course, horseName: p.horseName,
    })),
  };
}
const byRank = (books: Book[], rank: number) => books.flatMap(b => b.picks.filter(p => p.rank === rank));
const num = (n: number | null, d = 2) => n === null ? "—" : n.toFixed(d);
const pct = (n: number | null) => n === null ? "—" : `${(100 * n).toFixed(1)}%`;
const md = (cols: string[], rows: (string | number)[][]) => [cols, cols.map(() => "---"), ...rows]
  .map(row => `| ${row.join(" | ")} |`).join("\n");
const rankHeaders = ["Family / model", "Rank", "Captured", "Settled", "Winners", "Strike", "Model E", "A/Model", "Market n", "Market E", "A/Market", "Capture odds n", "Settled priced", "V3 stakes", "P/L £", "ROI", "Mean odds", "Median odds"];
function rankRow(family: string, rank: number, m: ReturnType<typeof metrics>) {
  return [family, `T${rank}`, m.captured, m.settled, m.winners, pct(m.strike), num(m.modelExpected), num(m.modelAE),
    m.marketN, num(m.marketExpected), num(m.marketAE), m.capturePriceN, m.priced, m.stakes, num(m.profit), pct(m.roi), num(m.averageOdds), num(m.medianOdds)];
}
const groups = (books: Book[]) => families.map(family => ({ family, books: books.filter(b => b.family === family) }));
const rankedTable = (books: Book[]) => md(rankHeaders, groups(books).flatMap(g => ranks.map(r => rankRow(g.family, r, metrics(byRank(g.books, r))))));
const period = (date: string) => date < "2026-11-05" ? "Before 5 November" : date < "2026-11-12" ? "5–11 November" : "12 November onward";
const popRange = (books: Book[]) => {
  const dates = [...new Set(books.map(b => b.raceDate))].sort();
  return dates.length ? `${dates[0]} to ${dates.at(-1)} (${dates.length} dates)` : "—";
};
function comparableMarket(books: Book[]) {
  const eligible = books.flatMap(b => b.picks).filter(p => settled(p) && p.rank <= 5 && p.market !== null && p.marketRank !== null && hasPrice(p));
  const joined = Map.groupBy(eligible, p => `${tissueBadgePriceBand(p.price!)} / ${valueMarketRankBand(p.marketRank!)}`);
  const cells = [...joined].flatMap(([key, rows]) => {
    const upper = rows.filter(p => p.rank <= 2), lower = rows.filter(p => p.rank >= 3);
    return upper.length && lower.length ? [{ key, upper, lower, n: rows.length }] : [];
  });
  const balanced = sum(cells.map(c => c.n));
  const rate = (group: "upper" | "lower", statistic: (p: Pick) => number) => balanced
    ? sum(cells.map(c => c.n * mean(c[group].map(statistic))!)) / balanced : null;
  return {
    total: eligible.length, balanced, cells: cells.length, upper: sum(cells.map(c => c.upper.length)), lower: sum(cells.map(c => c.lower.length)),
    upperModel: rate("upper", p => p.probability), lowerModel: rate("lower", p => p.probability),
    upperMarket: rate("upper", p => p.market!), lowerMarket: rate("lower", p => p.market!),
    upperObserved: rate("upper", credit), lowerObserved: rate("lower", credit),
  };
}
function commonFields(current: Book[], older: Book[]) {
  const byId = new Map(older.map(b => [b.raceId, b]));
  const pairs = current.flatMap(live => {
    const old = byId.get(live.raceId);
    const runners = new Set(live.picks.map(p => p.runnerId));
    if (!old || !hasAllRanks(live) || !hasAllRanks(old) || old.picks.length !== runners.size ||
      old.picks.some(p => !runners.has(p.runnerId)) || live.picks.some(p => p.outcome === null)) return [];
    const winners = new Set(live.picks.filter(p => settled(p) && won(p)).map(p => p.runnerId));
    if (!winners.size) return [];
    const best = (book: Book) => Math.min(...book.picks.filter(p => winners.has(p.runnerId)).map(p => p.rank));
    return [{ live: best(live), old: best(old) }];
  });
  const counts = (key: "live" | "old") => [1, 2, 3, 5].map(r => pairs.filter(p => p[key] <= r).length);
  return { n: pairs.length, live: counts("live"), old: counts("old") };
}
const adjustedGap = (c: ReturnType<typeof comparableMarket>) => c.balanced
  ? (c.lowerObserved! - c.lowerMarket!) - (c.upperObserved! - c.upperMarket!) : null;
type ProfitGroup = { group: string; picks: Pick[] };
function profitableRanks(books: Book[], label: string): ProfitGroup[] {
  return groups(books).flatMap(({ family, books }) => ranks.flatMap(rank => {
    const picks = byRank(books, rank);
    return (metrics(picks).profit ?? 0) > 0 ? [{ group: `${label} · ${family} T${rank}`, picks }] : [];
  }));
}
function robustnessTable(groups: ProfitGroup[]) {
  return md(["Positive cohort", "V3 stakes / dates / wins", "Stake A/Market", "P/L £ / ROI", "Largest winner (gross / net £)", "Second gross £",
    "Drop largest £ / ROI", "Drop two £ / ROI", "Before 5 Nov stakes / £", "5–11 Nov stakes / £", "12 Nov onward stakes / £", "Top track stakes / £"], groups.map(({ group, picks }) => {
    const m = metrics(picks), s = robustness(picks);
    const removal = (x: typeof s.afterOne) => x ? `${num(x.profit)} / ${pct(x.roi)}` : "—";
    const amounts = s.periods.map(p => `${p.stakes} / ${num(p.profit)}`);
    return [group, `${m.stakes} / ${s.dates} / ${s.winners}`, num(metrics(placedStakes(picks)).marketAE), `${num(m.profit)} / ${pct(m.roi)}`,
      s.largest ? `${s.largest.horseName} at ${num(s.largest.price)} (${num(s.largest.outcome.grossReturn)} / ${num(s.largest.outcome.profitLoss)})` : "—",
      num(s.second?.outcome.grossReturn ?? null), removal(s.afterOne), removal(s.afterTwo), ...amounts,
      s.course ? `${s.course.name} ${s.course.stakes} / ${num(s.course.profit)}` : "—"];
  }));
}

async function report() {
  const started = new Date().toISOString();
  const frozen = await loadEpochManifest();
  assert(frozen);
  const paths = [...new Set([
    TISSUE_GENERATION_FORWARD_PATH, manifestPath, developmentPath, referencePath, HURDLE_V3_SHADOW_PATH, EPOCH_MANIFEST,
    ...Object.values(EPOCHS).map(e => e.ledger),
    ...families.map(generationModelPath), ...Object.values(legacyModelPaths), ...VALUE_COHORTS.map(c => c.path), ...Object.keys(frozen.originalEvidenceHashes),
  ])];
  const hashes = Object.fromEntries(await Promise.all(paths.map(async p => [p, sha256(await readFile(p))] as const)));
  for (const [p, hash] of Object.entries(frozen.originalEvidenceHashes)) assert.equal(hashes[p], hash, p);
  const [generation, models, legacy, shadows, developmentText, manifestText, referenceText] = await Promise.all([
    loadTissueGeneration(), loadTissueGenerationModels(), Promise.all(VALUE_COHORTS.map(c => loadValueForward(c))),
    Promise.all([loadHurdleV3Shadow(), loadHurdleV3Shadow(EPOCHS.shadow.ledger)]), readFile(developmentPath, "utf8"),
    readFile(manifestPath, "utf8"), readFile(referencePath, "utf8"), assertEpochSources(frozen),
  ]);
  const manifest = JSON.parse(manifestText) as { models: Record<TissueValueFamily, string>; auditDatasets: { path: string; sha256: string }[] };
  assert.equal(manifest.auditDatasets.length, 2);
  for (const { path, sha256: hash } of manifest.auditDatasets) assert.equal(hashes[path], hash, path);
  for (const family of families) assert.equal(models[family].checksum, manifest.models[family]);
  const development = (JSON.parse(developmentText) as { races: TissueValueRace[] }).races;
  for (const [i, config] of VALUE_COHORTS.entries()) {
    const model = JSON.parse(await readFile(legacyModelPaths[config.family], "utf8")) as { checksum: string; version: string };
    assert.equal(config.modelVersion, model.version);
    for (const book of [...legacy[i].races, ...development.filter(b => b.family === config.family)]) {
      assert.equal(book.modelVersion, model.version);
      assert.equal(book.modelChecksum, model.checksum);
    }
  }
  const dev = development.map(valueBook);
  const referenceCount = (JSON.parse(referenceText) as { races: unknown[] }).races.length;
  const current = latestPreOffCaptures(generation.races).map(productionBook);
  const retired = legacy.flatMap(data => latestPreOffCaptures(data.races).map(valueBook));
  assert(current.length && retired.length);
  assert.equal(new Set(dev.map(b => b.raceId)).size, dev.length);
  assert.equal(new Set(retired.map(b => b.raceId)).size, retired.length);
  const devIds = new Set(dev.map(b => b.raceId));
  const liveIds = new Set(current.map(b => b.raceId));
  const currentDates = new Set(current.map(b => b.raceDate)).size;
  const reportBlocks = [
    "## Data coverage and provenance",
    `Snapshot read at ${started}. Current cohort \`${generation.version}\` begins ${generation.epoch}. There are ${current.length} unique races across ${currentDates} dates (${generation.races.length} stored captures, using the latest genuine pre-off whole book per race). Each outcome stays with its exact book. The report reads local frozen artifacts only.`,
    md(["Family", "Current frozen model", "Model checksum", "Current races / dates", "Older Value races / model", "Development races", "Current races with a market"], groups(current).map(({ family, books }) => {
      const old = retired.filter(b => b.family === family);
      return [family, models[family].version, `\`${models[family].checksum}\``, `${books.length} / ${popRange(books)}`,
        `${old.length} / ${old[0]?.model ?? "—"}`, dev.filter(b => b.family === family).length, books.filter(b => b.picks[0].market !== null).length];
    })),
    `**Historical development.** The 305-book development export contains stored **older** ranks and normalized markets. The chronological tuning split informed model selection and the final fit reused all eligible development races. The separate ${referenceCount}-race Chase promotion reference retains paired probabilities and winner flags, without stored rank positions or captured prices. It informed model choice and is left outside the rank tables.`,
    `**Historical holdout.** The 2025/2026 racing caches and holdout snapshots retain race features and results, such as finishing positions and SP, and prior reports contain selected aggregate evaluations. The inspected holdout artifacts lack a saved per-runner current-generation Tissue rank/probability book with matching model ID and as-of capture lineage. The older Jump model points to a temporary stage-one prediction export that is absent. There is no auditable untouched T1–T5 historical holdout for these models here. No ranks were reconstructed.`,
    `**Earlier prospective records.** The older Value ledgers provide complete captured price/probability books; all stored Tissue ranks are used, without applying Value 1 selection rules. ${retired.filter(b => devIds.has(b.raceId)).length} of those race IDs also appear in the development export and ${retired.filter(b => liveIds.has(b.raceId)).length} also appear in the current generation. These populations are shown independently and are never added together. Older standalone Turf/AW/Jump or experimental paired ledgers retain some full ranks too, but use separate timing, partial prediction coverage, selected-only price/P&L or result-time SP. The consistent legacy comparison uses the full-field Value books and the exact Hurdle shadow pairs. The Positive/Neutral ledgers store T1/T2 only; the Market Edge monitor's featured cohorts likewise target T1/T2.`,
    "## Current prospective performance by family and rank",
    "T1–T5 are positions in the unchanged stored Tissue ordering. Capture odds are Sporting Life median bookmaker decimal odds, recorded pre-off. Market expectation uses the recorded normalized full-book probability, or the existing full-book normalization of the same frozen prices when the stored probability is absent. The market denominator includes only settled selections with market probabilities. Expected winners sum frozen probabilities without renormalizing after withdrawals, and A/E uses fractional dead-heat credit. Winners and strike count recorded winning selections. Pending, NR and void are outside settled denominators. Capture odds n counts valid odds across captures. Settled priced and odds averages cover settled selections with valid captured odds. P/L and ROI use only finite recorded canonical-v3 returns and one £1 per qualifying stake. Unversioned/older outcomes remain visible in recorded result counts, with their monetary returns excluded. A dash means no eligible denominator.",
    rankedTable(current),
    md(["Family", "T1–T5 pending", "NR", "Void", "Settled canonical v3", "Settled unversioned/older", "Settled without captured odds"], groups(current).map(({ family, books }) => {
      const picks = books.flatMap(b => b.picks.filter(p => p.rank <= 5));
      return [family, picks.filter(p => !p.outcome).length, picks.filter(p => p.outcome?.status === "NR").length, picks.filter(p => p.outcome?.status === "void").length,
        picks.filter(p => settled(p) && p.outcome.settlementVersion === CANONICAL_SETTLEMENT_VERSION).length,
        picks.filter(p => settled(p) && p.outcome.settlementVersion !== CANONICAL_SETTLEMENT_VERSION).length,
        picks.filter(p => settled(p) && !hasPrice(p)).length];
    })),
    "## Captured-price breakdown",
    "The project's four existing badge price bands serve as fixed bins. Unpriced observations are outside the bands. Winners in each band include all recorded settled outcomes; £1 P/L uses the separate v3 stakes column.",
  ];
  const profitable: ProfitGroup[] = [];
  for (const g of groups(current)) {
    const bands = ranks.flatMap(rank => {
      const picks = byRank(g.books, rank);
      if ((metrics(picks).profit ?? 0) > 0) profitable.push({ group: `${g.family} T${rank}, all prices`, picks });
      return BADGE_PRICE_BANDS.map(band => {
        const selection = picks.filter(p => hasPrice(p) && tissueBadgePriceBand(p.price) === band);
        const m = metrics(selection);
        if ((m.profit ?? 0) > 0) profitable.push({ group: `${g.family} T${rank}, ${band}`, picks: selection });
        return [`T${rank}`, band, m.captured, m.settled, m.priced, m.winners, num(m.marketExpected), num(m.marketAE), m.stakes, num(m.profit), pct(m.roi)];
      });
    });
    reportBlocks.push(`### ${g.family}`, md(["Rank", "Decimal odds", "Captured", "Settled", "Priced", "Winners", "Market E", "A/Market", "V3 stakes", "P/L £", "ROI"], bands));
  }
  const matched = groups(current).map(g => ({ ...g, match: matchedRaces(g.books) }));
  const matchedBooks = matched.flatMap(g => g.match.fullSettled);
  const hitText = (xs: number[], n: number) => xs.map(x => n ? `${x} (${pct(x / n)})` : "—").join(" / ");
  reportBlocks.push(
    "## Same-race winner capture",
    "Each race contributes at most once to a hit. The distribution uses the best rank of the recorded winner or co-winners. For both orderings Top k means frozen rank ≤ k, including all tied selections and preserving skipped positions. Final means every original runner has a recorded outcome and at least one settled winner. Market and Tissue hit rates are compared only in the same complete-market races. The last column identifies races with a T3–T5 winner whose market rank was outside five.",
    md(["Family", "All ranks captured", "Final", "Dead heats / tied books", "Best winner rank 1 / 2 / 3 / 4 / 5 / >5", "Top 1 / 2 / 3 / 5", "Outside 5"], matched.map(({ family, match: m }) => [
      family, m.available, m.final, `${m.deadHeats} / ${m.tiedBooks}`, m.distribution.join(" / "), hitText(m.hits, m.final), hitText([m.distribution[5]], m.final),
    ])),
    md(["Family", "Matched market races", "Tissue Top 1 / 2 / 3 / 5", "Market Top 1 / 2 / 3 / 5", "T3–T5 winner / market >5"], matched.map(({ family, match: m }) => [
      family, m.priced, hitText(m.tissueMarketMatched, m.priced), hitText(m.marketHits, m.priced), m.longMarketWinners,
    ])),
    "### T1–T5 on identical settled fields",
    "Here all frozen T1–T5 selections must have settled as starters. This stricter cohort removes races with a withdrawal at an evaluated rank; market and ROI still apply their own coverage conditions.",
    rankedTable(matchedBooks),
    "## Market-adjusted comparison",
    "On those same fully settled fields, compare T3–T5 with T1–T2 within fixed joint price/market-rank bins. Only cells containing both groups are retained. Each cell is weighted by its pooled selection count. Rates are descriptive, with fractional winner credit. The omit-one-date range recomputes all cells and weights after dropping each date in turn. It measures sensitivity to a single date. Differences in win rate, model probability, and market probability can remain within a bin. Sparse cells, shared races and dates, and the small number of winners limit inference.",
    md(["Family", "Common n / eligible", "Cells", "T1–2 n / T3–5 n", "T1–2 model / market / realised", "T3–5 model / market / realised", "T3–5 residual minus T1–2", "Omit one date range"], matched.map(({ family, match }) => {
      const c = comparableMarket(match.fullSettled);
      const delta = adjustedGap(c);
      const dates = [...new Set(match.fullSettled.filter(b => b.picks[0].market !== null).map(b => b.raceDate))];
      const gaps = dates.map(date => adjustedGap(comparableMarket(match.fullSettled.filter(b => b.raceDate !== date))))
        .filter((gap): gap is number => gap !== null);
      return [family, `${c.balanced} / ${c.total}`, c.cells, `${c.upper} / ${c.lower}`,
        [c.upperModel, c.upperMarket, c.upperObserved].map(pct).join(" / "), [c.lowerModel, c.lowerMarket, c.lowerObserved].map(pct).join(" / "),
        delta === null ? "—" : `${num(100 * delta, 1)} pp`,
        gaps.length ? `${num(100 * Math.min(...gaps), 1)} to ${num(100 * Math.max(...gaps), 1)} pp` : "—"];
    })),
    "## Profit robustness",
    "Every positive current rank or price-band cell is shown. Stake A/Market uses the same canonical-priced selections as ROI. Largest winners are ordered by recorded gross return. Removal drops the entire associated race from the subgroup, including any tied selections, and recomputes stakes and net ROI. Removing two winners uses two distinct races where available. Race dates are distinct dates, with no statistical independence assumed. Calendar blocks show period sensitivity; the strongest track is the one contributing the greatest net P/L. Trainer identity is absent from these frozen books, and no mutable trainer lookup was used.",
    robustnessTable([...profitable, ...profitableRanks(matchedBooks, "Current matched")]),
    md(["Family / period", "Rank", "Settled", "Winners", "Market E", "A/Market", "V3 stakes", "P/L £", "ROI"], groups(current).flatMap(({ family, books }) =>
      ["5–11 November", "12 November onward"].flatMap(label => ranks.slice(2).map(r => {
        const m = metrics(byRank(books.filter(b => period(b.raceDate) === label), r));
        return [`${family} ${label}`, `T${r}`, m.settled, m.winners, num(m.marketExpected), num(m.marketAE), m.stakes, num(m.profit), pct(m.roi)];
      })))),
    "## Earlier model versions and historical comparison",
    "Earlier Value-era and development rows use the captured ranks of the older model shown in the coverage table. The development rows are a subset of the older books, and none of their recorded outcomes is canonical v3. Old-to-new comparisons across time also change field composition and pricing coverage.",
    "### Prior prospective Value-era books", rankedTable(retired),
    "### Frozen development subset", rankedTable(dev),
    "### Shared races across family model versions",
    "For the race-capture comparison below, both versions must preserve the identical runner ID set and ranks 1–5. Each model is scored against the same recorded winner or co-winners in the current book. Both books were frozen pre-off, but may have been captured at different times. Their odds and returns are not pooled.",
    md(["Family", "Common final races", "Current Top 1 / 2 / 3 / 5", "Older Top 1 / 2 / 3 / 5"], groups(current).map(({ family, books }) => {
      const m = commonFields(books, retired.filter(b => b.family === family));
      return [family, m.n, hitText(m.live, m.n), hitText(m.old, m.n)];
    })),
    "### Hurdle V2 versus V3 on identical books",
    "The two Hurdle shadow collection epochs remain separate. The full official shadow ordering is used, with no LED counterfactual. The matched sample requires ranks 1–5 present and settled in both model orderings, with the same archived production field, market probabilities and recorded outcomes.",
  );
  const historicalProfit = profitableRanks(retired, "Earlier Value");
  for (const [index, shadow] of shadows.entries()) {
    assert(shadow);
    const pairs = shadow.observations.map(o => {
      const live = productionBook(o.production);
      const originals = new Map(o.production.runners.map((r, i) => [r.runnerId, live.picks[i]]));
      const challenger: Book = { ...live, model: shadow.v3Version, picks: o.runners.map(r => ({
        ...originals.get(r.official.runnerId)!, rank: r.official.rank, probability: r.official.probability,
      })) };
      return { live, challenger };
    });
    const matchedPairs = pairs.filter(({ live, challenger }) => [live, challenger].every(b =>
      hasAllRanks(b) && b.picks.filter(p => p.rank <= 5).every(settled)));
    const modelBooks = [matchedPairs.map(p => p.live), matchedPairs.map(p => p.challenger)];
    const label = index === 0 ? shadow.version : EPOCHS.shadow.id;
    historicalProfit.push(...modelBooks.flatMap(books => profitableRanks(books, `Shadow epoch V${index + 1} ${books[0]?.model ?? ""}`)));
    reportBlocks.push(`**${label}** · ${matchedPairs.length}/${pairs.length} matched races (${popRange(matchedPairs.map(p => p.live))}).`,
      md(rankHeaders, modelBooks.flatMap(books =>
        ranks.map(r => rankRow(books[0]?.model ?? "—", r, metrics(byRank(books, r)))))));
  }
  reportBlocks.push("### Sensitivity of positive older-model and shadow rows", robustnessTable(historicalProfit));
  reportBlocks.push("## Integrity and reproducibility",
    "Reproduce the tables with `bun scripts/diagnose-tissue-ranks-3-5.ts`. The script prints to stdout, validates model metadata and ledger schemas, checks the active epoch source pins and confirms the source bytes still match the start of the run. It never scrapes, settles, fits, backfills or connects to the database.",
    md(["Source checked", "SHA-256"], Object.entries(hashes).map(([p, hash]) => [`\`${p}\``, `\`${hash}\``])));
  for (const [p, hash] of Object.entries(hashes)) assert.equal(sha256(await readFile(p)), hash, `Concurrent change detected in ${p}; retry the read-only analysis`);
  await assertEpochSources(frozen);
  console.log(reportBlocks.join("\n\n"));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await report();
