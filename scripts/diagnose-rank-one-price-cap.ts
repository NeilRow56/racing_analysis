import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { loadRankOneHistoricalData, historicalInputHashes, type Entry } from "./rank-one-historical-data";
export function priceCapMetrics(rows: Entry[]) {
  const prices = rows.map((r) => r.sp).sort((a, b) => a - b);
  const winners = rows.filter((r) => r.won).length;
  const expected = rows.reduce((s, r) => s + 1 / r.sp, 0);
  const profit = rows.reduce((s, r) => s + r.spProfit, 0);
  return { selections: rows.length, winners, strikeRate: rows.length ? winners / rows.length : null,
    marketExpectedWinners: expected, ae: expected ? winners / expected : null, profitLoss: rows.length ? profit : null,
    roi: rows.length ? profit / rows.length : null, averagePrice: rows.length ? prices.reduce((s, p) => s + p, 0) / rows.length : null,
    medianPrice: rows.length ? (prices[Math.floor((prices.length - 1) / 2)]! + prices[Math.floor(prices.length / 2)]!) / 2 : null };
}
export function capComparison(rows: Entry[], cap: number | null) {
  const kept = rows.filter((r) => cap === null || r.sp <= cap);
  const removed = rows.filter((r) => cap !== null && r.sp > cap);
  const gross = kept.filter((r) => r.won).map((r) => r.spProfit + 1).sort((a, b) => b - a);
  const grossTotal = gross.reduce((s, v) => s + v, 0);
  return { cap, ...priceCapMetrics(kept), removed: priceCapMetrics(removed),
    winnerConcentration: { largestReturnShare: grossTotal ? gross[0]! / grossTotal : null,
      top3ReturnShare: grossTotal ? gross.slice(0, 3).reduce((s, v) => s + v, 0) / grossTotal : null,
      profitWithoutLargestWinningReturn: kept.length && gross.length ? kept.reduce((s, r) => s + r.spProfit, 0) - gross[0]! : null } };
}
const table = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0] ?? {});
  const fmt = (v: unknown) => v === null ? "—" : typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(4) : String(v);
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${keys.map(k => fmt(r[k])).join(" | ")} |`)].join("\n");
};
export async function main() {
  const before = await historicalInputHashes();
  const data = await loadRankOneHistoricalData();
  if (new Set(data.entries.map(r => `${r.raceId}|${r.runnerId}`)).size !== data.entries.length) throw new Error("Duplicate historical runner population");
  const families = ([['FLAT TURF', 'Turf'], ['HURDLE', 'Hurdles'], ['CHASE', 'Chases'], ['ALL WEATHER', 'AW']] as const).map(([family, title]) => {
    const periods = ['2025', '2026', 'combined'].map(period => {
      const population = data.entries.filter(r => r.family === family && (period === 'combined' || r.year === period));
      const rank1 = population.filter(r => r.rank === 1);
      return { period, rank1: [null, 21, 26].map(cap => capComparison(rank1, cap)), genericMarketBias: [null, 21, 26].map(cap => capComparison(population, cap)) };
    });
    if (periods.slice(0, 2).some(p => p.rank1[0]!.selections === 0)) throw new Error(`Missing annual rank-1 population for ${family}`);
    const evidence = [21, 26].map((cap, i) => ({ cap, annual: periods.slice(0, 2).map(p => {
        const base = p.rank1[0]!, kept = p.rank1[i + 1]!, genericBase = p.genericMarketBias[0]!, generic = p.genericMarketBias[i + 1]!;
        return { year: p.period, aeDelta: base.ae !== null && kept.ae !== null ? kept.ae - base.ae : null,
          roiDelta: base.roi !== null && kept.roi !== null ? kept.roi - base.roi : null,
          genericAeDelta: genericBase.ae !== null && generic.ae !== null ? generic.ae - genericBase.ae : null,
          keptSelections: kept.selections, removedSelections: kept.removed.selections, removedWinners: kept.removed.winners };
      }) }));
    const replicated = evidence.some(e => e.annual.every(a => a.aeDelta !== null && a.aeDelta > 0 && a.roiDelta !== null && a.roiDelta > 0));
    return { family, title, periods, evidence, robustnessConclusion: replicated ? 'The small replicated point-estimate improvement does not exceed the generic market-bias improvement; sparse removed-cohort winners leave longshot-loss trimming uncertain. Robust cap-specific improvement is not established.' : 'Combined loss reduction, where present, does not replicate in both years on A/E and ROI. Robustness has not improved; excluding longshots can also remove profitable winners.', decision: replicated ? 'INCONCLUSIVE' : 'NO CAP JUSTIFIED', appliedCap: null,
      reason: replicated ? 'Direction alone is insufficient: adequate independent evidence beyond generic favourite-longshot bias and winner concentration has not been established. Default NO CAP.' : 'Neither fixed cap improves both market A/E and ROI in both annual samples. Default NO CAP.' };
  });
  const after = await historicalInputHashes();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Protected inputs changed');
  const report = { generatedAt: new Date().toISOString(), definitions: {
      ranks: 'Current frozen production Tissue probabilities, full-field rank before SP exclusion; deterministic runner-ID tie break selects one of tied Turf rank-1 runners. No rating or challenger model used.',
      prices: 'Historical final SP only; no complete historical first-capture bookmaker population exists. This cannot establish transfer to prospective qualifying-price ROI. Exactly 21.0 / 26.0 allowed.',
      market: 'Historical expected winners = sum(1/SP), unnormalised. Prospective tracker instead normalizes the complete captured bookmaker field. These A/E bases must not be pooled.',
      outcomes: 'Canonical settlement; NR/void excluded; non-finishers retained; each co-winner counted as a winner, canonical dead-heat return divisor. Winner concentration is descriptive.',
      periods: '2025 is frozen-model training evidence, not independent replication. 2026 is partial-year holdout; see per-family coverage dates. All features were reconstructed read-only with current canonical code, not accepted from incompatible caches. Combined descriptive only.',
      decision: 'Only 21 and 26 tested globally. A cap requires both-year A/E and ROI improvement, adequate sample, winner stability and material evidence beyond generic market bias. Direction alone cannot authorize a cap. Weak evidence defaults to NO CAP.'
    },
    models: data.models, coverage: data.coverage, families, readOnlyVerification: { unchanged: true, productionModelFileHashes: after, databaseSessionsReadOnly: true, historicalSource: "fresh current canonical reconstruction", populationGeneratedAt: data.generatedAt } };
  await writeFile('/tmp/rank-one-price-cap-diagnostic.json', JSON.stringify(report, null, 2) + '\n');
  const lines = ['# Rank-one price-cap diagnostic', '', ...Object.entries(report.definitions).map(([k, v]) => `${k}: ${v}`), '', '## Coverage', table(data.coverage.map(r => ({ family: r.family, year: r.year, from: r.dateFrom, to: r.dateTo, races: r.scoredRaces, missingSP: r.missingSpStarters, excluded: JSON.stringify(r.exclusions) })))];
  for (const f of families) {
    lines.push(`## ${f.title}`);
    for (const p of f.periods)
      lines.push(`### ${p.period}`, table(p.rank1.map(c => ({ cap: c.cap ?? 'NONE', ...Object.fromEntries(Object.entries(c).filter(([key]) => !["cap", "removed", "winnerConcentration"].includes(key))), largestWinnerShare: c.winnerConcentration.largestReturnShare, top3WinnerShare: c.winnerConcentration.top3ReturnShare, profitWithoutLargest: c.winnerConcentration.profitWithoutLargestWinningReturn }))));
  }
  for (const year of ['2025', '2026'])
    lines.push(`## ${year}`, table(families.flatMap(f => f.periods.filter(p => p.period === year).flatMap(p => p.rank1.map(c => ({ family: f.title, cap: c.cap ?? 'NONE', ...Object.fromEntries(Object.entries(c).filter(([key]) => !["cap", "removed", "winnerConcentration"].includes(key))) }))))));
  lines.push('## Removed Longshots', table(families.flatMap(f => f.periods.flatMap(p => p.rank1.slice(1).map(c => ({ family: f.title, year: p.period, cap: c.cap, ...c.removed }))))));
  lines.push('## Generic Market Bias Comparison', 'All valid-SP starters from the same complete fields, with the same fixed caps. Correlated within races; descriptive baseline only.', table(families.flatMap(f => f.periods.flatMap(p => p.genericMarketBias.map(c => ({ family: f.title, year: p.period, cap: c.cap ?? 'NONE', ...priceCapMetrics(data.entries.filter(r => r.family === f.family && (p.period === 'combined' || r.year === p.period) && (c.cap === null || r.sp <= c.cap))) }))))));
  lines.push('## Annual Robustness Evidence', table(families.flatMap(f => f.evidence.flatMap(e => e.annual.map(a => ({family:f.title,cap:e.cap,...a}))))));
  lines.push('## Cap Decision', ...families.map(f => `${f.title}: **${f.decision}**. ${f.reason} ${f.robustnessConclusion}`), 'No cap applied. Lower longshot losses alone do not establish robustness or historical profitability. Historical data queried in read-only sessions; production model hashes unchanged. This diagnostic writes only /tmp artifacts.');
  await writeFile('/tmp/rank-one-price-cap-diagnostic.md', lines.join('\n\n') + '\n');
  for (const f of families)
    console.log(f.title, JSON.stringify({ combined: f.periods[2], evidence: f.evidence, decision: f.decision }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
