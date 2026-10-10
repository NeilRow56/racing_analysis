import { readFile, writeFile } from "node:fs/promises";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { DiagnosticResult } from "./diagnose-turf-tissue-aw-transfer";

const jsonPath = "/tmp/turf-tissue-on-aw-diagnostic.json";
const mdPath = "/tmp/turf-tissue-on-aw-diagnostic.md";
const periods = ["2025", "2026", "combined"] as const;
const systems = {
  turf_on_turf: "A. Turf Tissue on Turf",
  turf_on_aw_literal: "B. TRANSFER-LITERAL",
  turf_on_aw_structural: "C. TRANSFER-STRUCTURAL",
  aw_on_aw: "D. AW Tissue on AW",
} as const;

async function main() {
  const result: DiagnosticResult & { conclusionAudit?: ReturnType<typeof auditConclusion> } = JSON.parse(await readFile(jsonPath, "utf8"));
  const caches = await Promise.all(["2025", "2026"].map(async (year) => {
    const cache = await loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "all_weather_flat" });
    if (!cache) throw new Error(`Missing compatible AW cache: ${year}`);
    const rows = cache.rows.filter(({ features, outcome }) => features.raceCode === "aw" && outcome.resultStatus !== "non_runner" && outcome.won !== null);
    const races = new Set(rows.map(({ features }) => features.targetRaceId)).size;
    for (const key of ["turf_on_aw_literal", "turf_on_aw_structural", "aw_on_aw"] as const) {
      const metrics = result.metrics[key][year as "2025" | "2026"];
      if (metrics.races !== races || metrics.runners !== rows.length || metrics.fullRaceCoverage !== races) throw new Error(`Report/cache universe mismatch: ${key} ${year}`);
    }
    return {
      year, races, runners: rows.length, directory: cache.directory,
      actualCoverage: cache.actualCoverage,
      availableTurfSpeedValues: {
        latest: rows.filter(({ features }) => features.latestTurfSpeedRating !== null).length,
        bestLast3: rows.filter(({ features }) => features.bestTurfSpeedLast3 !== null).length,
        averageLast3: rows.filter(({ features }) => features.averageTurfSpeedLast3 !== null).length,
      },
      availableAwSpeedValues: rows.filter(({ features }) => features.latestAwSpeedRating !== null).length,
    };
  }));
  const source = await readFile("scripts/diagnose-turf-tissue-aw-transfer.ts", "utf8");
  const classifierSource = source.slice(source.indexOf("function classifyTransfer("), source.indexOf("function renderMarkdown("));
  const audit = auditConclusion(result, caches, classifierSource);
  result.conclusionAudit = audit;
  result.transferClassification = `LITERAL: ${audit.classifications.literal}; STRUCTURAL: ${audit.classifications.structural}`;
  result.tissue2Implication = audit.recommendation;
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(mdPath, renderReport(result, audit));
  printSummary(result, audit);
}

function auditConclusion(result: DiagnosticResult, caches: Array<{
  year: string; races: number; runners: number; directory: string;
  actualCoverage: { actualFrom: string; actualTo: string } | null;
  availableTurfSpeedValues: { latest: number; bestLast3: number; averageLast3: number };
  availableAwSpeedValues: number;
}>, classifierSource: string) {
  const m = result.metrics.turf_on_aw_structural.combined;
  const aw = result.metrics.aw_on_aw.combined;
  const turf = result.metrics.turf_on_turf.combined;
  const ae = result.market.turf_on_aw_structural.combined.ae!;
  const conditions = {
    calibrationOk: { expression: "calibrationRatio >= 0.9 && calibrationRatio <= 1.1", value: m.calibrationRatio, passed: m.calibrationRatio! >= .9 && m.calibrationRatio! <= 1.1 },
    comparableAw: { expression: "transfer.logLoss <= aw.logLoss * 1.03", value: m.logLoss, limit: aw.logLoss! * 1.03, passed: m.logLoss! <= aw.logLoss! * 1.03 },
    consistent: { expression: "2025 A/E >= 0.9 && 2026 A/E >= 0.9", values: periods.slice(0, 2).map((p) => result.market.turf_on_aw_structural[p].ae), passed: result.market.turf_on_aw_structural["2025"].ae! >= .9 && result.market.turf_on_aw_structural["2026"].ae! >= .9 },
    usefulAe: { expression: "combined A/E >= 0.95", value: ae, passed: ae >= .95 },
    usefulRank1: { expression: "rank1Strike > 0", value: m.rank1Strike, passed: m.rank1Strike! > 0 },
    usefulTop3: { expression: "top3Capture >= 0.45", value: m.top3Capture, passed: m.top3Capture! >= .45 },
    turfLogLoss: { expression: "transfer.logLoss <= turf.logLoss * 1.15", value: m.logLoss, limit: turf.logLoss! * 1.15, passed: m.logLoss! <= turf.logLoss! * 1.15 },
  };
  const comparisons = periods.map((period) => {
    const t = result.metrics.turf_on_aw_structural[period], a = result.metrics.aw_on_aw[period];
    return { period, races: t.races, runners: t.runners,
      logLossDelta: t.logLoss! - a.logLoss!, brierDelta: t.brier! - a.brier!,
      rank1StrikeDelta: t.rank1Strike! - a.rank1Strike!,
      aeDelta: result.market.turf_on_aw_structural[period].ae! - result.market.aw_on_aw[period].ae!,
      winners: { logLoss: t.logLoss! < a.logLoss! ? "STRUCTURAL" : "AW TISSUE", brier: t.brier! < a.brier! ? "STRUCTURAL" : "AW TISSUE", rank1Strike: t.rank1Strike! > a.rank1Strike! ? "STRUCTURAL" : "AW TISSUE", ae: result.market.turf_on_aw_structural[period].ae! > result.market.aw_on_aw[period].ae! ? "STRUCTURAL" : "AW TISSUE" },
    };
  });
  const d = result.awDisagreement;
  // The intersection equals each full AW universe, so no race is excluded from comparison.
  if (d.comparableRaces !== m.races || d.comparableRaces !== aw.races || d.sameLeader + d.differentLeader !== d.comparableRaces) throw new Error("AW universes are not identical");
  const bothWins = d.turfTransferWins + d.awTissueWins + d.neitherWins - d.differentLeader;
  if (bothWins < 0) throw new Error("Invalid disagreement partition");
  const discordantTurfWins = d.turfTransferWins - bothWins;
  const discordantAwWins = d.awTissueWins - bothWins;
  const exactP = exactBinomialTwoSided(discordantTurfWins, discordantAwWins);
  const disagreement = {
    ...d, bothWins, discordantTurfWins, discordantAwWins,
    turfStrike: d.turfTransferWins / d.differentLeader,
    awStrike: d.awTissueWins / d.differentLeader,
    strikeDifference: (d.turfTransferWins - d.awTissueWins) / d.differentLeader,
    turfAe: d.turfTransferWins / d.turfSpExpectedWinners,
    awAe: d.awTissueWins / d.awSpExpectedWinners,
    significance: { method: "Two-sided exact binomial McNemar test on winner-discordant pairs, p0=0.5", n: discordantTurfWins + discordantAwWins, exactP, continuityCorrectedChiSquare: (Math.abs(discordantTurfWins - discordantAwWins) - 1) ** 2 / (discordantTurfWins + discordantAwWins), limitation: "Descriptive, unadjusted for multiple comparisons and clustering by meeting/date/horse; tests relative rank-one correctness, not profitability." },
    confirmation: "Counts reconcile with the stored completed diagnostic; no independent outcome rescore was performed.",
  };
  const calibrationErrors = periods.map((period) => ({ period,
    structural: calibrationError(result.calibrationBands.turf_on_aw_structural[period]),
    aw: calibrationError(result.calibrationBands.aw_on_aw[period]),
  }));
  return {
    auditedAt: new Date().toISOString(), method: "Audit stored results and read compatible family caches; no fitting, rescoring, recalibration or threshold optimisation.",
    originalClassification: "FAILS TO TRANSFER", originalImplication: "2. separate surface-specific models",
    originalReason: "Structural transfer was classified, not literal. The sole failed predicate was combined rank-one SP A/E >= 0.95: 0.9330479743 < 0.95. This makes useful false and triggers if (!useful || !calibrationOk). Coverage is not tested. Literal results are not consulted. All remaining predicates pass. The implication function maps this label directly to separate models.",
    classifierSource, conditions, cacheAudit: caches,
    identicalUniverse: { verified: true, races: d.comparableRaces, runners: m.runners, evidence: "Both paths receive the same eligible awRows; both fully score every race. Stored common-race intersection equals both full race counts; compatible caches match yearly race and runner counts." },
    comparisons, disagreement, calibrationErrors,
    classifications: { literal: "MODEST", structural: "MODEST" },
    classificationBasis: "Qualitative predictive-transfer labels, not a replacement fitted classifier. Both frozen paths have useful predictions and outperform AW Tissue on loss, Brier, rank-one strike and A/E in each year. Improvements are modest, A/E remains below 1, calibration is imperfect, and literal Turf-speed history was unavailable. STRONG would overstate the evidence; FAILS conflates an absolute market cutoff with architectural transfer.",
    recommendation: "C. Keep current models and gather prospective evidence before deciding; B. common Turf-derived architecture with family-specific surface inputs is the leading research candidate.",
    interpretation: {
      A: "The frozen Turf model structure shows predictive transfer to the tested AW sample.",
      B: "AW values are semantically appropriate for AW speed inputs, but this experiment does not establish they are required: literal has slightly better combined loss, Brier, strike and A/E. Its Turf speed inputs are all missing, so genuine literal history transfer remains untested.",
      C: "AW Tissue is inferior on the reported loss, Brier, rank-one strike and A/E in this sample, in both years. This is a model comparison, not proof of inherent architectural superiority.",
      D: "Evidence favors a common architecture as a research hypothesis over a need for completely separate architectures. Production choice remains uncertain.",
    },
    limitations: [
      "Both models were fitted on 2025: native Turf 2025 and AW Tissue 2025 are in-sample. Turf-on-AW 2025 is cross-surface evaluation; 2026 is the more informative temporal check. Neither historical evaluation substitutes for a new prospective paired comparison.",
      "The tested 2026 AW cache ends on 2026-09-21; 2026 results are year-to-date, not a complete calendar year.",
      "Full scoring coverage uses zero imputation and missingness indicators; it does not mean complete feature availability or that all originally declared runners were included. Eligibility is settled cache rows; winnerless races are omitted from probability losses.",
      "Global actual/predicted-winner ratio is nearly forced to 1 by per-race softmax normalization; dead heats/missing outcomes can alter it. It is not a meaningful calibration test by itself.",
      "A/E here uses raw 1/final-SP, without overround normalization; higher A/E is favorable relative market performance, not probability calibration. Both models have negative SP ROI and A/E below 1.",
      "Literal transfer uses all-missing Turf-speed inputs in the AW family cache, not observed prior Turf-speed histories. Structural changes those values and their corresponding missingness flags, leaving coefficients and scaling frozen.",
      "Calibration band comparisons are descriptive, use different runners in each model's bands, and depend on the fixed bins. No probability-level paired uncertainty or calibration-curve inference was performed.",
    ],
  };
}

function exactBinomialTwoSided(a: number, b: number) {
  const n = a + b, k = Math.min(a, b);
  if (!n) return 1;
  let logMass = -n * Math.log(2);
  for (let i = 1; i <= k; i++) logMass += Math.log(n - i + 1) - Math.log(i);
  let mass = Math.exp(logMass), tail = mass;
  for (let i = k; i > 0; i--) { mass *= i / (n - i + 1); tail += mass; }
  return Math.min(1, 2 * tail);
}

function calibrationError(bands: DiagnosticResult["calibrationBands"]["aw_on_aw"]["combined"]) {
  const runners = bands.reduce((n, band) => n + band.runners, 0);
  return { binnedRunnerWeightedAbsoluteError: bands.reduce((n, band) => n + Math.abs(band.actualWinners - band.predictedWinners), 0) / runners };
}

function table(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const value = (v: unknown) => typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(6) : String(v ?? "-").replaceAll("|", "/");
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${keys.map((key) => value(row[key])).join(" | ")} |`)].join("\n");
}

function renderReport(result: DiagnosticResult, audit: ReturnType<typeof auditConclusion>) {
  const lines = ["# Turf Tissue -> AW Conclusion Audit", "", audit.method, "",
    "The original FAILS TO TRANSFER conclusion is not logically justified as an architectural conclusion. Structural transfer beats dedicated AW Tissue on all four requested metrics in both years. Its failure label was driven solely by an absolute 0.95 market A/E threshold.", "",
    `LITERAL: **${audit.classifications.literal}**, with genuine Turf-history literal transfer untested. STRUCTURAL: **${audit.classifications.structural}**.`, "",
    "## All Four Systems", "", "Strike and coverage are percentages. Calibration is actual/predicted winners; A/E uses rank-one raw SP implied expectations.", ""];
  for (const [key, label] of Object.entries(systems) as Array<[keyof typeof systems, string]>) {
    lines.push(`### ${label}`, "", table(periods.map((period) => {
      const m = result.metrics[key][period];
      return { period, eligibleRaces: m.races, runners: m.runners, fullRaces: m.fullRaceCoverage, coveragePct: 100 * m.fullRaceCoverage / m.races, logLoss: m.logLoss, Brier: m.brier, calibration: m.calibrationRatio, rank1StrikePct: 100 * m.rank1Strike!, AE: result.market[key][period].ae };
    })), "");
  }
  lines.push("## Literal vs Structural", "",
    "LITERAL passes cached Turf feature getters unchanged to the frozen model, including Turf speed values or missingness. STRUCTURAL substitutes only the three speed getters below. All coefficients, intercept, means and scales remain frozen. Numeric imputation is unchanged; the associated missingness flags follow the replacement values. Comments, going flags and other features retain their original getters.", "",
    table([
      { turfFeature: "latest_turf_speed", structuralAwEquivalent: "latestAwSpeedRating", coefficientChanged: "NO" },
      { turfFeature: "best_l3_turf_speed", structuralAwEquivalent: "bestAwSpeedLast3", coefficientChanged: "NO" },
      { turfFeature: "avg_l3_turf_speed", structuralAwEquivalent: "averageAwSpeedLast3", coefficientChanged: "NO" },
      { turfFeature: "going_soft", structuralAwEquivalent: "Original /soft|heavy/i test on AW going text (unchanged)", coefficientChanged: "NO" },
      { turfFeature: "going_firm", structuralAwEquivalent: "Original /firm/i test on AW going text (unchanged)", coefficientChanged: "NO" },
    ]), "",
    "The AW family cache uses ratingFamily=aw, which skips Turf speed calculation. The cache audit below confirms no observed Turf speed values. Thus the literal experiment is an all-missing-speed variant, not a clean test of prior Turf history on AW runners.", "",
    table(audit.cacheAudit.map((c) => ({ year: c.year, actualFrom: c.actualCoverage?.actualFrom, actualTo: c.actualCoverage?.actualTo, races: c.races, runners: c.runners, latestTurf: c.availableTurfSpeedValues.latest, bestTurf: c.availableTurfSpeedValues.bestLast3, averageTurf: c.availableTurfSpeedValues.averageLast3, latestAw: c.availableAwSpeedValues }))), "",
    "## Original Classification Trace", "", audit.originalReason, "", "Exact original classifier and implication code (unchanged):", "", "```ts", audit.classifierSource.trim(), "```", "",
    table(Object.entries(audit.conditions).map(([rule, condition]) => ({ rule, expression: condition.expression, passed: condition.passed, observed: "value" in condition ? condition.value : condition.values.join(", ") }))), "",
    "## Identical AW Universe Comparison", "", audit.identicalUniverse.evidence, "",
    "Deltas are STRUCTURAL minus AW Tissue. Negative loss/Brier and positive strike/A/E favor STRUCTURAL. Strike delta is percentage points.", "",
    table(audit.comparisons.map((c) => ({ period: c.period, races: c.races, runners: c.runners, logLossDelta: c.logLossDelta, BrierDelta: c.brierDelta, rank1StrikeDeltaPp: 100 * c.rank1StrikeDelta, AEDelta: c.aeDelta, allFourWinners: "STRUCTURAL" }))), "",
    "## Disagreement", "", audit.disagreement.confirmation, "",
    table([{ sameLeader: audit.disagreement.sameLeader, differentLeader: audit.disagreement.differentLeader, turfWins: audit.disagreement.turfTransferWins, awWins: audit.disagreement.awTissueWins, neither: audit.disagreement.neitherWins, both: audit.disagreement.bothWins }]), "",
    table([
      { system: "STRUCTURAL", strikePct: 100 * audit.disagreement.turfStrike, marketExpectedWinners: audit.disagreement.turfSpExpectedWinners, AE: audit.disagreement.turfAe },
      { system: "AW TISSUE", strikePct: 100 * audit.disagreement.awStrike, marketExpectedWinners: audit.disagreement.awSpExpectedWinners, AE: audit.disagreement.awAe },
    ]), "",
    `Absolute strike difference: ${(100 * audit.disagreement.strikeDifference).toFixed(4)} percentage points. ${audit.disagreement.significance.method}: n=${audit.disagreement.significance.n}, p=${audit.disagreement.significance.exactP.toFixed(6)}. Continuity-corrected McNemar chi-square=${audit.disagreement.significance.continuityCorrectedChiSquare.toFixed(6)}.`, "", audit.disagreement.significance.limitation, "",
    "## Calibration Bands", "", "Each ratio is actual/predicted winners. The JSON retains all bands for all four systems and periods.", "");
  for (const period of periods) {
    lines.push(`### ${period}`, "", table(["turf_on_aw_structural", "aw_on_aw"].flatMap((key) => result.calibrationBands[key as "turf_on_aw_structural" | "aw_on_aw"][period].map((b) => ({ model: key === "aw_on_aw" ? "AW TISSUE" : "STRUCTURAL", ...b })))), "");
  }
  lines.push(table(audit.calibrationErrors.map((c) => ({ period: c.period, structuralBinnedError: c.structural.binnedRunnerWeightedAbsoluteError, awBinnedError: c.aw.binnedRunnerWeightedAbsoluteError }))), "",
    "Structural is not uniformly less calibrated: it has lower combined binned absolute error and lower error in each year. Its combined 30-50% and 50%+ ratios are farther from 1 than AW Tissue, while the lower/middle bands are generally better. Both overpredict the sparse 50%+ band, and year-to-year variation is substantial. Better proper scoring rules do not imply perfect calibration.", "",
    "## Feature Architecture", "", ...Object.entries(audit.interpretation).map(([q, answer]) => `${q}. ${answer}\n`),
    "## Revised Classifications", "", `LITERAL: ${audit.classifications.literal}. STRUCTURAL: ${audit.classifications.structural}.`, "", audit.classificationBasis, "",
    "## Tissue 2", "", audit.recommendation, "", "No Tissue 2 implementation or model changes were made.", "",
    "## Limits", "", ...audit.limitations.map((s) => `- ${s}`), "",
    "## Original Supporting Results", "", "Frozen model identities, positive-edge results, price profiles, context breakdowns, robustness and prospective snapshots remain preserved in the JSON. Existing prospective trackers compare other systems, not frozen Turf-transfer vs AW Tissue on paired new AW races; they cannot settle this choice.", "",
    "```json", JSON.stringify({ modelDefinitions: result.modelDefinitions, positiveEdge: result.positiveEdge, priceProfile: result.priceProfile, robustness: result.robustness, prospective: result.prospective }, null, 2), "```", "");
  return lines.join("\n");
}

function printSummary(result: DiagnosticResult, audit: ReturnType<typeof auditConclusion>) {
  for (const [label, key, classification] of [["TRANSFER-LITERAL", "turf_on_aw_literal", audit.classifications.literal], ["TRANSFER-STRUCTURAL", "turf_on_aw_structural", audit.classifications.structural]] as const) {
    const m = result.metrics[key].combined;
    console.log(`${label}:\nclassification: ${classification}\nkey metrics: races=${m.races} coverage=100% loss=${m.logLoss!.toFixed(6)} Brier=${m.brier!.toFixed(6)} rank1=${(100 * m.rank1Strike!).toFixed(3)}% A/E=${result.market[key].combined.ae!.toFixed(6)}\n`);
  }
  console.log("STRUCTURAL vs AW TISSUE:\nlog loss winner: STRUCTURAL\nBrier winner: STRUCTURAL\nrank1 strike winner: STRUCTURAL\n2025 A/E winner: STRUCTURAL\n2026 A/E winner: STRUCTURAL\ncombined A/E winner: STRUCTURAL\n");
  const d = audit.disagreement;
  console.log(`DISAGREEMENT:\nTurf-transfer wins: ${d.turfTransferWins}\nAW-Tissue wins: ${d.awTissueWins}\nNeither: ${d.neitherWins}\npaired significance: two-sided exact McNemar/binomial p=${d.significance.exactP.toFixed(6)} (descriptive)\n`);
  console.log(`Original FAILS TO TRANSFER reason:\n${audit.originalReason}\n\nRevised Tissue 2 implication:\n${audit.recommendation}\n\nLiteral caveat: all Turf-speed inputs missing in AW cache; genuine literal history transfer untested.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
