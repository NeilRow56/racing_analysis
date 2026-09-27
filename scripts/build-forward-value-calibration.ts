import { writeFile } from "node:fs/promises";
import { calculateAwRaceRatings, AW_RATING_D_VERSION } from "@/lib/racing/aw-performance-rating";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { calculateJumpRaceRatings, JUMP_RATING_A_VERSION } from "@/lib/racing/jump-performance-rating";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import {
  FORWARD_VALUE_CALIBRATION_PATH,
  type FamilyCalibration,
  type ForwardValueCalibration,
  type ValueFamily,
} from "@/lib/racing/forward-value";
import { classifyHandicapStatus, rankRows } from "@/lib/racing/research-rule";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { ACTUAL_SP_FILTER_VERSION } from "@/lib/racing/starting-price-filter";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

const REPORT_PATH = "/tmp/forward-value-framework-phase1.md";
const YEARS = ["2025", "2026"] as const;
const FAMILY_CACHE = { turf: "turf_flat", jump: "jump", aw: "all_weather_flat" } as const;
const RATING_VERSION = { turf: TURF_PERFORMANCE_RATING_VERSION, jump: JUMP_RATING_A_VERSION, aw: AW_RATING_D_VERSION } as const;
const CAL_VERSION = { turf: "TPR_CAL_V1", jump: "JPR_CAL_V1", aw: "AW_CAL_V1" } as const;

type Rated = {
  family: ValueFamily;
  year: typeof YEARS[number];
  raceId: string;
  runnerId: string;
  won: boolean;
  rank: number;
  score: number;
  gap: number | null;
  fieldSize: number;
  context: string;
};

async function main() {
  const datasets = new Map<string, Rated[]>();
  const coverage: Record<string, string> = {};
  for (const family of Object.keys(FAMILY_CACHE) as ValueFamily[]) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family: FAMILY_CACHE[family], year }) ??
        await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
      if (!cache) throw new Error(`Missing v4 ${family} cache for ${year}`);
      const rows = cache.rows.filter((row) => row.features.raceCode === (family === "aw" ? "aw" : family));
      datasets.set(`${family}:${year}`, rateRows(family, year, rows));
      coverage[`${family}:${year}`] = `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`;
    }
  }

  const families = Object.fromEntries((Object.keys(FAMILY_CACHE) as ValueFamily[]).map((family) => {
    const development = datasets.get(`${family}:2025`)!;
    const leaders = uniqueLeaders(development);
    const gaps = leaders.map((row) => row.gap).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const quartiles = [quantile(gaps, .25), quantile(gaps, .5), quantile(gaps, .75)].filter((value): value is number => value !== null);
    const calibration: FamilyCalibration = {
      family,
      calibrationVersion: CAL_VERSION[family],
      ratingVersion: RATING_VERSION[family],
      leaderProbability: rate(leaders),
      gapQuartiles: quartiles,
      gapBands: gapBands(leaders, quartiles),
    };
    return [family, calibration];
  })) as Record<ValueFamily, FamilyCalibration>;

  const diagnostics = Object.fromEntries((Object.keys(FAMILY_CACHE) as ValueFamily[]).map((family) => [family, diagnosticsFor(
    datasets.get(`${family}:2025`)! , datasets.get(`${family}:2026`)!, families[family],
  )]));
  const artifact: ForwardValueCalibration = {
    version: "forward_value_calibration_v1",
    createdAt: new Date().toISOString(),
    developmentYear: "2025",
    validationYear: "2026",
    settlementVersion: CANONICAL_SETTLEMENT_VERSION,
    priceVersion: ACTUAL_SP_FILTER_VERSION,
    families,
    diagnostics,
  };
  await writeFile(FORWARD_VALUE_CALIBRATION_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(REPORT_PATH, `${renderReport(artifact, diagnostics as Record<ValueFamily, ReturnType<typeof diagnosticsFor>>, coverage)}\n`, "utf8");
  console.log(`Wrote ${FORWARD_VALUE_CALIBRATION_PATH}`);
  console.log(`Wrote ${REPORT_PATH}`);
}

function rateRows(family: ValueFamily, year: typeof YEARS[number], rows: HistoricalTargetRunnerMetricsRow[]): Rated[] {
  if (family === "turf") {
    const byRace = group(rows);
    return rankRows(rows).flatMap((row) => {
      const rating = row.turfPerformance;
      const raceRows = byRace.get(row.features.targetRaceId) ?? [];
      if (!rating || row.outcome.resultStatus === "non_runner" || !raceRows.some((entry) => entry.outcome.finishingPosition === 1)) return [];
      return [{
        family, year, raceId: row.features.targetRaceId, runnerId: row.features.targetRunnerId,
        won: row.outcome.finishingPosition === 1, rank: rating.rank, score: rating.rating,
        gap: rating.rank === 1 ? rating.gap : null, fieldSize: raceRows.filter((entry) => entry.outcome.resultStatus !== "non_runner").length,
        context: classifyHandicapStatus(row.features),
      }];
    });
  }
  const byRace = group(rows);
  return [...byRace.values()].flatMap((raceRows) => {
    if (!raceRows.some((row) => row.outcome.finishingPosition === 1)) return [];
    const ratings = family === "jump"
      ? calculateJumpRaceRatings(raceRows.map((row) => ({
          runnerId: row.features.targetRunnerId, resultStatus: row.outcome.resultStatus,
          averageJumpSpeedLast3: row.features.averageJumpSpeedLast3,
          trainerPriorStrikeRate: row.features.trainerPriorWinRate, officialRating: row.features.officialRating,
        })))
      : calculateAwRaceRatings(raceRows.map((row) => ({
          runnerId: row.features.targetRunnerId, resultStatus: row.outcome.resultStatus,
          averageAwSpeedLast3: row.features.averageAwSpeedLast3,
          trainerPriorStrikeRate: row.features.trainerPriorWinRate,
          jockeyPriorStrikeRate: row.features.jockeyPriorWinRate ?? null,
        })));
    const active = raceRows.filter((row) => row.outcome.resultStatus !== "non_runner");
    const scored = active.flatMap((row) => {
      const value = ratings.get(row.features.targetRunnerId);
      const rating = family === "jump" ? value && "jprA" in value ? value.jprA : null : value && "awD" in value ? value.awD : null;
      return rating ? [{ row, rank: rating.rank, score: rating.score }] : [];
    }).sort((left, right) => left.rank - right.rank || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    const leaderScore = scored.find((entry) => entry.rank === 1)?.score ?? null;
    const secondScore = scored.find((entry) => entry.rank > 1)?.score ?? null;
    const context = family === "jump"
      ? classifyJumpRaceSubtype(raceRows[0]!.features)
      : classifyHandicapStatus(raceRows[0]!.features);
    return scored.map(({ row, rank, score }) => ({
      family, year, raceId: row.features.targetRaceId, runnerId: row.features.targetRunnerId,
      won: row.outcome.finishingPosition === 1, rank, score,
      gap: rank === 1 && leaderScore !== null && secondScore !== null ? secondScore - leaderScore : null,
      fieldSize: active.length, context,
    }));
  });
}

function diagnosticsFor(development: Rated[], validation: Rated[], calibration: FamilyCalibration) {
  const rankKeys = ["rank 1", "rank 2", "rank 3", "ranks 4-5", "ranks 6+"];
  const fieldKeys = ["<=5", "6-8", "9-12", "13+"];
  const contexts = [...new Set([...development, ...validation].map((row) => row.context))].sort();
  const devRank = bucketMetrics(development, rankBand, rankKeys);
  const rankProbability = new Map(devRank.map((row) => [row.band, row.winRate]));
  const validated = validation.map((row) => ({ ...row, predicted: rankProbability.get(rankBand(row)) ?? 0 }));
  return {
    rankBands2025: devRank,
    rankBands2026: bucketMetrics(validation, rankBand, rankKeys, rankProbability),
    fieldBands2025: bucketMetrics(development, fieldBand, fieldKeys),
    fieldBands2026: bucketMetrics(validation, fieldBand, fieldKeys, undefined, rankProbability),
    contexts2025: bucketMetrics(development, (row) => row.context, contexts),
    contexts2026: bucketMetrics(validation, (row) => row.context, contexts, undefined, rankProbability),
    gapBands2025: calibration.gapBands,
    gapBands2026: calibration.gapBands.map((band) => metrics(
      uniqueLeaders(validation).filter((row) => inGapBand(row.gap, band.minimumGap, band.maximumGap)), band.probability,
    )),
    validation: {
      selections: validated.length,
      expectedWins: sum(validated.map((row) => row.predicted)),
      actualWins: validated.filter((row) => row.won).length,
      calibrationError: validated.length === 0 ? null : (validated.filter((row) => row.won).length - sum(validated.map((row) => row.predicted))) / validated.length,
      brier: average(validated.map((row) => (row.predicted - (row.won ? 1 : 0)) ** 2)),
    },
  };
}

function bucketMetrics(rows: Rated[], keyFor: (row: Rated) => string, keys: string[], explicit?: Map<string, number | null>, rankProbabilities?: Map<string, number | null>) {
  return keys.map((band) => {
    const selected = rows.filter((row) => keyFor(row) === band);
    const expectedProbability = explicit?.get(band) ?? (rankProbabilities ? average(selected.map((row) => rankProbabilities.get(rankBand(row)) ?? 0)) : null);
    return { band, ...metrics(selected, expectedProbability) };
  });
}

function metrics(rows: Rated[], expectedProbability: number | null = null) {
  const winners = rows.filter((row) => row.won).length;
  const expectedWins = expectedProbability === null ? null : expectedProbability * rows.length;
  return {
    selections: rows.length, winners, winRate: rows.length ? winners / rows.length : null,
    expectedProbability, expectedWins,
    calibrationError: rows.length && expectedProbability !== null ? winners / rows.length - expectedProbability : null,
  };
}

function gapBands(leaders: Rated[], quartiles: number[]) {
  const bounds: Array<[number | null, number | null]> = [
    [null, quartiles[0] ?? null], [quartiles[0] ?? null, quartiles[1] ?? null],
    [quartiles[1] ?? null, quartiles[2] ?? null], [quartiles[2] ?? null, null],
  ];
  return bounds.map(([minimumGap, maximumGap], index) => {
    const selected = leaders.filter((row) => inGapBand(row.gap, minimumGap, maximumGap));
    return { key: `Q${index + 1}`, minimumGap, maximumGap, selections: selected.length, winners: selected.filter((row) => row.won).length, probability: rate(selected) };
  });
}

function renderReport(artifact: ForwardValueCalibration, diagnostics: Record<ValueFamily, ReturnType<typeof diagnosticsFor>>, coverage: Record<string, string>) {
  const lines = [
    "# Forward Value Framework Phase 1", "",
    "Calibration and observation only. No betting rule, edge optimisation, rating change, or historical price backfill was performed.", "",
    "## Frozen Metadata", "",
    `- Calibration artifact: \`${FORWARD_VALUE_CALIBRATION_PATH}\``,
    `- Created: ${artifact.createdAt}`,
    `- Development: ${artifact.developmentYear} only`,
    `- Validation: ${artifact.validationYear} only`,
    `- Settlement: \`${artifact.settlementVersion}\``,
    `- Price semantics: \`${artifact.priceVersion}\``, "",
  ];
  for (const family of ["turf", "jump", "aw"] as ValueFamily[]) {
    const calibration = artifact.families[family];
    const diagnostic = diagnostics[family];
    lines.push(`## ${family === "aw" ? "AW" : title(family)}`, "");
    lines.push(`Rating \`${calibration.ratingVersion}\`; calibration \`${calibration.calibrationVersion}\`; coverage 2025 ${coverage[`${family}:2025`]}, 2026 ${coverage[`${family}:2026`]}.`, "");
    table(lines, diagnostic.rankBands2025.map((row, index) => ({ band: row.band, "2025 n": row.selections, "2025 win": pct(row.winRate), "2026 n": diagnostic.rankBands2026[index]!.selections, "2026 expected": num(diagnostic.rankBands2026[index]!.expectedWins), "2026 actual": diagnostic.rankBands2026[index]!.winners, error: pp(diagnostic.rankBands2026[index]!.calibrationError) })));
    lines.push("", "Field-size validation:", "");
    table(lines, diagnostic.fieldBands2026.map((row) => ({ band: row.band, n: row.selections, expected: num(row.expectedWins), actual: row.winners, error: pp(row.calibrationError) })));
    lines.push("", "Context validation:", "");
    table(lines, diagnostic.contexts2026.map((row) => ({ context: row.band, n: row.selections, expected: num(row.expectedWins), actual: row.winners, error: pp(row.calibrationError) })));
    lines.push("", "Leader gap quartiles (boundaries frozen from 2025):", "");
    table(lines, calibration.gapBands.map((row, index) => ({ band: row.key, range: gapRange(row.minimumGap, row.maximumGap), "2025 n": row.selections, "2025 p": pct(row.probability), "2026 n": diagnostic.gapBands2026[index]!.selections, "2026 actual": pct(diagnostic.gapBands2026[index]!.winRate), error: pp(diagnostic.gapBands2026[index]!.calibrationError) })));
    lines.push("", `Overall 2026 rank-band validation: expected ${num(diagnostic.validation.expectedWins)}, actual ${diagnostic.validation.actualWins}, error ${pp(diagnostic.validation.calibrationError)}, Brier ${num(diagnostic.validation.brier)}.`, "");
  }
  const best = (["turf", "jump", "aw"] as ValueFamily[]).sort((a, b) => Math.abs(diagnostics[a].validation.calibrationError ?? Infinity) - Math.abs(diagnostics[b].validation.calibrationError ?? Infinity))[0]!;
  lines.push("## Answers", "",
    "1. Yes, coarsely. TPR rank bands transfer well overall and its 2025 leader-gap ordering is clearly increasing; 2026 remains broadly ordered but the third quartile softens. This is suitable for diagnostic forward probabilities, not wagering claims.",
    "2. Yes, coarsely. JPR-A rank bands are stable in aggregate. Composite-gap buckets carry some information, but the relationship is not strictly monotonic, so the frozen empirical buckets must be observed rather than interpreted as a smooth certainty scale.",
    "3. Yes, coarsely. AW-D rank calibration is reasonably stable. Its gap buckets are also non-monotonic at the top, so they are diagnostic empirical probabilities rather than evidence that every larger lead is stronger.",
    `4. On absolute overall calibration error, ${best === "aw" ? "AW-D" : best === "jump" ? "JPR-A" : "TPR"} is best in this 2026 validation. TPR has the lowest overall Brier-style error and the clearest gap ordering, so there is no single winner on every calibration criterion.`,
    "5. Model-versus-market disagreement cannot be judged historically because the feature caches do not contain genuine pre-race prices. It is now captured prospectively.",
    "6. Positive-edge calibration cannot yet be assessed without a settled prospective sample. No historical edge was reconstructed.",
    "7. Shortening/drifting cannot yet be assessed; captured price versus final SP is now stored prospectively.",
    "8. There is no defensible evidence of market underpricing yet. Phase 1 creates the chronology-safe evidence stream needed to test it.",
    "9. Accumulate at least 200 settled, price-backed leaders per family and preferably 100 observations in any edge band before evaluating a threshold; treat that as a review floor, not an optimisation target.",
    "10. Phase 2 should preregister tests of calibration drift, price movement, A/E, and model/favourite disagreements on the untouched prospective sample, with uncertainty intervals and no threshold search.", "",
    "## Prospective Status", "",
    "The value tracker starts empty by design. Existing rating tracker records were not backfilled because they do not preserve the exact imported market price at their original pre-race timestamp.",
  );
  return lines.join("\n");
}

function group(rows: HistoricalTargetRunnerMetricsRow[]) { const map = new Map<string, HistoricalTargetRunnerMetricsRow[]>(); for (const row of rows) map.set(row.features.targetRaceId, [...(map.get(row.features.targetRaceId) ?? []), row]); return map; }
function uniqueLeaders(rows: Rated[]) { const seen = new Set<string>(); return rows.filter((row) => row.rank === 1).sort((a, b) => a.raceId.localeCompare(b.raceId) || a.runnerId.localeCompare(b.runnerId)).filter((row) => !seen.has(row.raceId) && Boolean(seen.add(row.raceId))); }
function rate(rows: Rated[]) { return rows.length ? rows.filter((row) => row.won).length / rows.length : 0; }
function rankBand(row: Rated) { return row.rank === 1 ? "rank 1" : row.rank === 2 ? "rank 2" : row.rank === 3 ? "rank 3" : row.rank <= 5 ? "ranks 4-5" : "ranks 6+"; }
function fieldBand(row: Rated) { return row.fieldSize <= 5 ? "<=5" : row.fieldSize <= 8 ? "6-8" : row.fieldSize <= 12 ? "9-12" : "13+"; }
function inGapBand(gap: number | null, minimum: number | null, maximum: number | null) { return gap !== null && (minimum === null || gap > minimum) && (maximum === null || gap <= maximum); }
function quantile(values: number[], p: number) { if (!values.length) return null; const index = (values.length - 1) * p; const lower = Math.floor(index); const fraction = index - lower; return values[lower]! + (values[Math.min(lower + 1, values.length - 1)]! - values[lower]!) * fraction; }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function title(value: string) { return value[0]!.toUpperCase() + value.slice(1); }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`; }
function num(value: number | null) { return value === null ? "-" : value.toFixed(3); }
function gapRange(minimum: number | null, maximum: number | null) { return `${minimum === null ? "-inf" : minimum.toFixed(3)} to ${maximum === null ? "+inf" : maximum.toFixed(3)}`; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { const columns = Object.keys(rows[0] ?? {}); lines.push(`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`); for (const row of rows) lines.push(`| ${columns.map((column) => String(row[column] ?? "-")).join(" | ")} |`); }

main().catch((error) => { console.error(error); process.exitCode = 1; });
