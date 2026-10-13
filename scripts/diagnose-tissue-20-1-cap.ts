import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadHistoricalTissueDiagnostic, protectedHashes, sanity, summarize, type Entry, type Summary } from "./diagnose-tissue-very-long-price-calibration";

const MD_PATH = "/tmp/tissue-20-1-cap-diagnostic.md";
const JSON_PATH = "/tmp/tissue-20-1-cap-diagnostic.json";
const FAMILIES = ["CHASE", "ALL WEATHER", "FLAT TURF"] as const;
const PERIODS = ["2025", "2026", "combined"] as const;
const PRICE_BANDS = [["<=14/1", 1, 15], [">14/1 to 20/1", 15, 21], [">20/1 to 25/1", 21, 26],
  [">25/1 to 33/1", 26, 34], [">33/1 to 50/1", 34, 51], [">50/1", 51, Infinity]] as const;

export function isAbove20(sp: number) { return sp > 21; }
export function isIntermediate(sp: number) { return sp > 21 && sp <= 26; }

function valueSummary(rows: Entry[]) {
  const priced = rows.filter((row) => row.qualifyingProfit !== null && Number.isFinite(row.qualifyingProfit));
  const profit = priced.length ? priced.reduce((sum, row) => sum + row.qualifyingProfit!, 0) : null;
  return { ...summarize(rows), qualifyingPricedSelections: priced.length, qualifyingPriceProfitLoss: profit,
    qualifyingPriceRoi: rows.length > 0 && priced.length === rows.length && profit !== null ? profit / rows.length : null,
    availability: !rows.length ? "No retained eligible qualifying-price VALUE observations in this cohort; not evidence of zero historical selections."
      : !priced.length ? "Actual qualifying-price records retained, but their qualifying-price returns are not stored. No returns reconstructed."
      : "Sparse actual prospective qualifying-price subset; not a complete historical VALUE sample." };
}

function buildFamilyPeriods(family: typeof FAMILIES[number], entries: Entry[], actualValue: Entry[]) {
  return PERIODS.map((period) => {
    const rows = entries.filter((row) => row.family === family && (period === "combined" || row.year === period));
    const rank1 = rows.filter((row) => row.rank === 1);
    const above20 = rank1.filter((row) => isAbove20(row.sp));
    const above25 = rank1.filter((row) => row.sp > 26);
    const intermediate = rank1.filter((row) => isIntermediate(row.sp));
    return { period,
      populationAbove20: summarize(rows.filter((row) => isAbove20(row.sp))),
      rank1Above20: summarize(above20), rank1Above25: summarize(above25), intermediate: summarize(intermediate),
      rank1AtMost20: summarize(rank1.filter((row) => row.sp <= 21)),
      incrementalExclusions: { selections: intermediate.length, fractionOfAbove20: above20.length ? intermediate.length / above20.length : null,
        expectedWinners: summarize(intermediate).tissueExpected, actualWinners: intermediate.filter((row) => row.won).length },
      rank1Bands: PRICE_BANDS.map(([band, low, high]) => ({ band, ...summarize(rank1.filter((row) => row.sp > low && row.sp <= high)) })),
      actualValueAbove20: valueSummary(actualValue.filter((row) => row.family === family && isAbove20(row.sp) && (period === "combined" || row.year === period))),
      marketDisagreement: { above20: sanity(above20), intermediate: sanity(intermediate), above25: sanity(above25) },
    };
  });
}
type FamilyPeriod = ReturnType<typeof buildFamilyPeriods>[number];
const materiallyPoor = (summary: Summary) => summary.calibrationRatio !== null && summary.calibrationRatio < 0.75;

function replication(a: Summary, b: Summary) {
  if (!a.selections || !b.selections) return "TOO SMALL";
  if (materiallyPoor(a) && materiallyPoor(b)) return "REPLICATED POOR CALIBRATION";
  if (materiallyPoor(a)) return "2025 ONLY";
  if (materiallyPoor(b)) return "2026 ONLY";
  if (a.calibrationRatio !== null && b.calibrationRatio !== null && ((a.calibrationRatio < 1) !== (b.calibrationRatio < 1))) return "MIXED";
  return "NO PROBLEM";
}

function decide(periods: FamilyPeriod[]) {
  const [a, b, all] = [periods[0]!, periods[1]!, periods[2]!];
  const above20Replication = replication(a.rank1Above20, b.rank1Above20);
  const intermediateReplication = replication(a.intermediate, b.intermediate);
  const above25Replication = replication(a.rank1Above25, b.rank1Above25);
  const worse = (row: FamilyPeriod, cohort: Summary) => cohort.calibrationRatio !== null && row.rank1AtMost20.calibrationRatio !== null && cohort.calibrationRatio < row.rank1AtMost20.calibrationRatio;
  const uncertainBothYears = (key: "rank1Above20" | "rank1Above25" | "intermediate") => [a, b].every((p) => {
    const upper = p[key].calibrationWilson95?.upper;
    return upper === undefined || p.rank1AtMost20.calibrationRatio === null || upper >= p.rank1AtMost20.calibrationRatio;
  });
  const populationReplicated = materiallyPoor(a.populationAbove20) && materiallyPoor(b.populationAbove20);
  const primarySupported = above20Replication === "REPLICATED POOR CALIBRATION" && populationReplicated && worse(a, a.rank1Above20) && worse(b, b.rank1Above20);
  const intermediateSupported = intermediateReplication === "REPLICATED POOR CALIBRATION" && worse(a, a.intermediate) && worse(b, b.intermediate);
  const lowerCapSupported = primarySupported && intermediateSupported && !uncertainBothYears("rank1Above20") && !uncertainBothYears("intermediate");
  const intermediateHealthier = !materiallyPoor(all.intermediate) || intermediateReplication !== "REPLICATED POOR CALIBRATION";
  const higherCapSupported = above25Replication === "REPLICATED POOR CALIBRATION" && worse(a, a.rank1Above25) && worse(b, b.rank1Above25) && !uncertainBothYears("rank1Above25");
  const decision = above20Replication === "TOO SMALL" ? "INSUFFICIENT DATA"
    : lowerCapSupported ? "20/1 CAP JUSTIFIED"
    : higherCapSupported && intermediateHealthier ? "25/1 CAP PREFERRED"
    : materiallyPoor(all.rank1Above20) || materiallyPoor(all.populationAbove20) || above20Replication !== "NO PROBLEM" ? "MONITOR ONLY" : "NO CAP";
  const recommendation = decision === "20/1 CAP JUSTIFIED" ? "20/1" : decision === "25/1 CAP PREFERRED" ? "25/1" : decision === "NO CAP" ? "NO CAP" : "MONITOR";
  return { decision, recommendation, above20Replication, intermediateReplication, above25Replication,
    uncertainty: { primaryUncertainBothYears: uncertainBothYears("rank1Above20"), intermediateUncertainBothYears: uncertainBothYears("intermediate"), above25UncertainBothYears: uncertainBothYears("rank1Above25") },
    answers: {
      A: `Rank-1 SP >20/1 calibration ${fmt(all.rank1Above20.calibrationRatio)}; population ${fmt(all.populationAbove20.calibrationRatio)}; <=20/1 rank-1 control ${fmt(all.rank1AtMost20.calibrationRatio)}. ${materiallyPoor(all.rank1Above20) ? "Materially overpredicted." : "No material rank-1 overprediction at the unchanged descriptive convention."}`,
      B: `${above20Replication}. Rank-1 2025 ${a.rank1Above20.selections} selections/${a.rank1Above20.winners} wins, calibration ${fmt(a.rank1Above20.calibrationRatio)}; 2026 ${b.rank1Above20.selections}/${b.rank1Above20.winners}, calibration ${fmt(b.rank1Above20.calibrationRatio)}. 2025 is training-period evidence, 2026 partial-year holdout.`,
      C: `Intermediate >20/1 to <=25/1: ${all.intermediate.selections} selections, ${all.intermediate.winners} wins, ${fmt(all.intermediate.tissueExpected)} expected, calibration ${fmt(all.intermediate.calibrationRatio)}. ${intermediateReplication}; annual calibration ${fmt(a.intermediate.calibrationRatio)} / ${fmt(b.intermediate.calibrationRatio)}.`,
      D: lowerCapSupported ? "20/1 is better supported for probability reliability: the added intermediate band is materially poor in each year, with clearer separation from the control in at least one annual sample. No ROI criterion was used."
        : decision === "25/1 CAP PREFERRED" ? "25/1 is preferred: the added intermediate band is materially healthier or does not replicate the poor direction."
          : "The fixed 20/1 test shows concerning point estimates, but annual selected-horse uncertainty does not support lowering an actionable cap now. Monitor the broader >20/1 group and the intermediate band prospectively.",
      E: `Moving 25/1 down to 20/1 adds ${all.intermediate.selections} excluded rank-1 selections (${pct(all.incrementalExclusions.fractionOfAbove20)} of >20/1). Intermediate calibration ${fmt(all.intermediate.calibrationRatio)} versus >25/1 ${fmt(all.rank1Above25.calibrationRatio)}. ${materiallyPoor(all.intermediate) ? "The added group is not well calibrated on these point estimates" : "The added group is materially healthier"}${uncertainBothYears("intermediate") ? "; both annual intervals also admit control-like calibration, so avoid treating sparse losses as conclusive." : "; the deterioration is not confined to >25/1."}`,
    },
    marketCaveat: `Rank-1 SP >20/1 market A/E ${fmt(all.rank1Above20.marketAe)}; intermediate A/E ${fmt(all.intermediate.marketAe)}. Calibration shortfall versus Tissue expectations does not establish a negative edge against the market. Final-SP ROI is context only and was not used to choose a cap.` };
}

function buildReport(data: Awaited<ReturnType<typeof loadHistoricalTissueDiagnostic>>) {
  const families = FAMILIES.map((family) => {
    const periods = buildFamilyPeriods(family, data.entries, data.actualValue);
    return { family, periods, decision: decide(periods) };
  });
  return { generatedAt: new Date().toISOString(), models: data.models, coverage: data.coverage,
    definitions: {
      primary: "Final SP >20/1 means decimal strictly >21.0. Exactly 21.0 belongs to the <=20/1 control.",
      comparison: "Only the fixed 20/1 and 25/1 candidate thresholds are compared. Intermediate band is decimal >21.0 and <=26.0; exactly 26.0 belongs in that band, not >25/1.",
      population: "Same frozen-model scoring and verified complete-field population as the prior 25/1 diagnostic. Genuine canonical starters only, NR/void excluded, started non-finishers retained as losses. Full-field probabilities and ranks precede any SP filtering; missing-SP starters are not removed from the model book.",
      outcomes: "Dead heats count each co-winner as a winner and use canonical settlement divisors for retrospective SP returns. Coverage identifies dead-heat races and exclusions.",
      market: "Market expected = sum(1/final decimal SP), unnormalised. Probability gaps are absolute proportions; ratios are Tissue probability / SP-implied probability.",
      replication: "2025 was the models' training period and is not independent holdout replication. 2026 is partial-year holdout with family-specific cached end dates. Direction-based replication uses the same descriptive material-overprediction convention actual/expected <0.75.",
      decisions: "Prefer 20/1 only when >20/1 and its added intermediate band are materially poor in both years and worse than <=20/1 controls. If both annual intervals admit control-like calibration in a relevant selected-horse cohort, monitor rather than infer conclusive collapse. Wilson intervals are descriptive fixed-prediction intervals, not an odds optimisation or arbitrary sample-count/p-value test. Population runners within a race are correlated.",
      value: "Actual stored pre-race qualifying-price rank-1 VALUE records only, with captured probabilities and stored qualifying returns. Not an SP-positive-edge proxy. No missing prices or returns reconstructed. No retained 2025 VALUE price population; the small later prospective subset is reported separately. Turf VALUE requires a stored finishing position because its Tissue tracker does not retain runner status.",
      liveUse: "Any future 20/1 cap must use captured qualifying bookmaker decimal <=21.0 for main VALUE and >21.0 for retained research shadow, not SP, forecast, reconstructed or later latest prices. Nothing is implemented here.",
      safety: "Only diagnostic code and the two requested /tmp report artifacts are written. Protected models and prospective trackers are SHA-256 checked before and after. No data, racecard, settlement, VALUE or UI mutation.",
    }, families,
    valueCoverage: FAMILIES.map((family) => { const rows = data.actualValue.filter((row) => row.family === family); return { family, retainedSelectionsAllSp: rows.length,
      dateFrom: rows.map((row) => row.raceDate).sort()[0] ?? null, dateTo: rows.map((row) => row.raceDate).sort().at(-1) ?? null }; }),
  };
}
type Report = ReturnType<typeof buildReport>;

async function main() {
  const before = await protectedHashes();
  const data = await loadHistoricalTissueDiagnostic();
  const report = buildReport(data);
  const after = await protectedHashes();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected inputs changed during diagnostic; read-only verification failed");
  await writeFile(JSON_PATH, `${JSON.stringify({ ...report, readOnlyVerification: { unchanged: true, fileHashes: after } }, null, 2)}\n`, "utf8");
  await writeFile(MD_PATH, renderMarkdown(report), "utf8");
  console.log(`Wrote ${MD_PATH}\nWrote ${JSON_PATH}`);
  for (const f of report.families) {
    const combined = f.periods[2]!;
    console.log(`\n${f.family} >20/1\nSelections: ${combined.rank1Above20.selections}\nWins: ${combined.rank1Above20.winners}\nTissue expected: ${fmt(combined.rank1Above20.tissueExpected)}\nCalibration: ${fmt(combined.rank1Above20.calibrationRatio)}\n2025: ${fmt(f.periods[0]!.rank1Above20.calibrationRatio)}\n2026: ${fmt(f.periods[1]!.rank1Above20.calibrationRatio)}`);
    console.log(`\n${shortLabel(f.family)} 20/1-25/1\nSelections: ${combined.intermediate.selections}\nWins: ${combined.intermediate.winners}\nCalibration: ${fmt(combined.intermediate.calibrationRatio)}\n\nDecision: ${f.decision.recommendation}`);
  }
  console.log("\nFinal recommendation:");
  for (const f of report.families) console.log(`${shortLabel(f.family)}: ${f.decision.recommendation}`);
}

function renderMarkdown(r: Report) {
  const lines = ["# Tissue 20/1 Cap Diagnostic", "", "## Executive Summary", "",
    "Fixed primary SP >20/1 test with a direct >25/1 comparison. Exactly 20/1 is allowed in the control. Hurdles excluded. No model fitting, threshold search or cap implementation.", "",
    table(r.families.map((f) => ({ family: f.family, selectionsAbove20: f.periods[2]!.rank1Above20.selections, winsAbove20: f.periods[2]!.rank1Above20.winners,
      expectedAbove20: f.periods[2]!.rank1Above20.tissueExpected, calibrationAbove20: f.periods[2]!.rank1Above20.calibrationRatio,
      intermediateSelections: f.periods[2]!.intermediate.selections, intermediateWins: f.periods[2]!.intermediate.winners,
      intermediateCalibration: f.periods[2]!.intermediate.calibrationRatio, decision: f.decision.decision }))),
    "2025 is training-period evidence; 2026 is partial-year holdout. Stored VALUE qualifying-price evidence is sparse and is not rebuilt from SP.", "",
    "## Data And Definitions", "", ...Object.entries(r.definitions).map(([key, value]) => `- ${key}: ${value}`), "",
    "Protected model/tracker hashes remained unchanged; hashes are recorded in JSON.", "", table(r.models), table(r.coverage),
  ];
  for (const f of r.families) lines.push(`## ${title(f.family)}`, "All genuine starters with SP >20/1:", "",
    metrics(f.periods.map((p) => ({ label: p.period, ...p.populationAbove20 }))), "Rank-1 SP >20/1:",
    metrics(f.periods.map((p) => ({ label: p.period, ...p.rank1Above20 }))), f.decision.marketCaveat, "");
  lines.push("## 20/1 vs 25/1", "The >20/1 cohort is exactly the disjoint union of the intermediate band and >25/1. No other candidate cutoffs were searched.", "");
  for (const f of r.families) lines.push(`### ${f.family}`, metrics(f.periods.flatMap((p) => [{ label: `${p.period} >20/1`, ...p.rank1Above20 }, { label: `${p.period} >25/1`, ...p.rank1Above25 }, { label: `${p.period} <=20/1 control`, ...p.rank1AtMost20 }])), "");
  lines.push("## 20/1 to 25/1 Intermediate Band", "Strictly >21.0 to inclusive 26.0 decimal. This is the extra group removed by lowering the candidate cap.", "");
  for (const f of r.families) lines.push(`### ${f.family}`, metrics(f.periods.map((p) => ({ label: p.period, ...p.intermediate }))),
    "Descriptive rank-1 calibration intervals (95% Wilson):", table(f.periods.map((p) => ({ period: p.period,
      selectionsAbove20: p.rank1Above20.selections, above20Lower: p.rank1Above20.calibrationWilson95?.lower ?? null, above20Upper: p.rank1Above20.calibrationWilson95?.upper ?? null,
      intermediateSelections: p.intermediate.selections, intermediateLower: p.intermediate.calibrationWilson95?.lower ?? null, intermediateUpper: p.intermediate.calibrationWilson95?.upper ?? null }))), "");
  lines.push("## Price Bands", "Fixed rank-1 bands, inclusive upper boundaries; percentages are labelled and model probabilities are proportions.", "");
  for (const f of r.families) lines.push(`### ${f.family}`, metrics(f.periods.flatMap((p) => p.rank1Bands.map((band) => ({ label: `${p.period} ${band.band}`, ...band })))), "");
  lines.push("## 2025 vs 2026", table(r.families.map((f) => ({ family: f.family, above20: f.decision.above20Replication,
    intermediate: f.decision.intermediateReplication, calibration2025: f.periods[0]!.rank1Above20.calibrationRatio,
    calibration2026: f.periods[1]!.rank1Above20.calibrationRatio, intermediate2025: f.periods[0]!.intermediate.calibrationRatio, intermediate2026: f.periods[1]!.intermediate.calibrationRatio }))));
  lines.push("## VALUE Evidence", "Actual retained qualifying-price VALUE selections only. Missing qualifying returns are unavailable, not priced at SP or reconstructed.", table(r.valueCoverage));
  for (const f of r.families) lines.push(`### ${f.family}`, metrics(f.periods.map((p) => ({ label: p.period, ...p.actualValueAbove20 }))),
    table(f.periods.map((p) => ({ period: p.period, selections: p.actualValueAbove20.selections, qualifyingPriced: p.actualValueAbove20.qualifyingPricedSelections,
      qualifyingPriceProfitLoss: p.actualValueAbove20.qualifyingPriceProfitLoss, qualifyingPriceRoi: p.actualValueAbove20.qualifyingPriceRoi, availability: p.actualValueAbove20.availability }))), "");
  lines.push("## Market Disagreement", "Model and market probabilities and absolute gaps are proportions; each metric has a mean and median.", "");
  for (const f of r.families) lines.push(`### ${f.family}`, table(f.periods.flatMap((p) => Object.entries(p.marketDisagreement).flatMap(([cohort, s]) =>
    Object.entries(s).flatMap(([metric, value]) => typeof value === "number" ? [] : [{ period: p.period, cohort, selections: s.selections, metric, ...value }])))), "");
  lines.push("## Family Decisions", "");
  for (const f of r.families) lines.push(`### ${f.family}: ${f.decision.decision}`, ...Object.entries(f.decision.answers).map(([key, value]) => `${key}. ${value}`), f.decision.marketCaveat, "");
  lines.push("## Recommendation", "");
  for (const f of r.families) lines.push(`- ${f.family}: **${f.decision.decision}**. ${f.decision.recommendation === "20/1" ? "Any future rule should use captured qualifying bookmaker <=21.0 for main VALUE, with >21.0 retained in a settled research shadow."
    : f.decision.recommendation === "25/1" ? "Any future 25/1 rule should use captured qualifying bookmaker <=26.0, retaining higher prices in a settled shadow." : "Retain current live semantics; monitor where evidence is uncertain."}`);
  lines.push("", "No cap implemented. Final SP was used only for retrospective diagnosis. Market A/E and SP returns can remain positive despite model overprediction; this is not evidence that a cap will improve returns. Any prospective rule must be evaluated alongside the retained shadow.", "");
  return lines.join("\n");
}
function metrics(rows: Array<Summary & { label: string }>) {
  return table(rows.map((s) => ({ cohort: s.label, "runners/selections": s.selections, winners: s.winners, "strike %": s.actualWinnerPercent,
    tissueExpected: s.tissueExpected, calibration: s.calibrationRatio, marketExpected: s.marketExpected, marketAe: s.marketAe,
    meanTissueP: s.meanTissueProbability, medianTissueP: s.medianTissueProbability, "SP ROI % (context)": s.spRoi === null ? null : s.spRoi * 100 })));
}
function table(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "No rows.\n";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => (v == null ? "-" : typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(4) : typeof v === "object" ? JSON.stringify(v) : String(v)).replaceAll("|", "\\|");
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${keys.map((key) => cell(row[key])).join(" | ")} |`), ""].join("\n");
}
function shortLabel(family: string) { return family === "ALL WEATHER" ? "AW" : family === "FLAT TURF" ? "TURF" : family; }
function title(family: string) { return family === "ALL WEATHER" ? "All Weather" : family === "FLAT TURF" ? "Flat Turf" : "Chase"; }
function fmt(v: number | null) { return v === null ? "-" : v.toFixed(4); }
function pct(v: number | null) { return v === null ? "-" : `${(v * 100).toFixed(1)}%`; }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
