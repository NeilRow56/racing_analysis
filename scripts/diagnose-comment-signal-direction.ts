import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { isCurrentAllWeatherRace, isCurrentOrdinaryFlatTurfRace } from "@/lib/racing/current-race-classification";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { JUMP_TISSUE_MODEL_PATH, loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { TISSUE_V2_CONFIG, loadFrozenTissueModel } from "@/lib/racing/tissue-forward";
import { COMMENT_FEATURE_NAMES } from "./diagnose-independent-tissue-feasibility";

const MD_OUTPUT = "/tmp/comment-signal-direction-by-race-family.md";
const JSON_OUTPUT = "/tmp/comment-signal-direction-by-race-family.json";
const YEARS = ["2025", "2026"] as const;
const MIN_MEANINGFUL_PHRASE_SAMPLE = 30;

type Year = typeof YEARS[number];
type RaceFamily = "turf_5_8" | "aw_5_8" | "hurdle" | "chase";
type CommentGroup = "flatExcuseInterference" | "jumpingExecutionNegative" | "performancePressureNegative" | "temperamentStartNegative";
type Direction = "POSITIVE / FORGIVE RUN" | "NEUTRAL" | "NEGATIVE / DOWNGRADE" | "MIXED" | "TOO SMALL";
type Replication = "REPLICATED" | "2025 ONLY" | "2026 ONLY" | "MIXED" | "TOO SMALL";

type DbRun = {
  runnerId: string;
  horseId: string;
  horseName: string;
  raceId: string;
  raceDate: string;
  raceDateTime: Date | string;
  raceName: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  courseName: string | null;
  courseSourceId: string | null;
  going: string | null;
  surface: string | null;
  distanceYards: number | null;
  actualRunnerCount: number | null;
  declaredRunnerCount: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  outcomeCode: string | null;
  comment: string | null;
  startingPriceDecimal: string | number | null;
  officialRating: number | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
};

type Run = DbRun & {
  raceDateTime: Date;
  sp: number | null;
  family: RaceFamily | null;
  year: Year | null;
  marketRank: number | null;
};

type Observation = {
  prior: Run;
  next: Run;
  groupHits: Record<CommentGroup, string[]>;
  phraseHits: string[];
  matchKey: string;
};

type Summary = {
  observations: number;
  priced: number;
  winners: number;
  places: number;
  expectedWins: number;
  winRate: number | null;
  placeRate: number | null;
  ae: number | null;
  roi: number | null;
  finishPercentileChange: number | null;
  rprChange: number | null;
  topspeedChange: number | null;
  officialRatingChange: number | null;
};

type Comparison = {
  family: RaceFamily;
  group: CommentGroup;
  year: Year | "ALL";
  signal: Summary;
  baseline: Summary;
  baselineMode: "matched" | "family_year_fallback" | "none";
  direction: Direction;
};

type PhraseResult = {
  family: RaceFamily;
  group: CommentGroup;
  phrase: string;
  year: Year | "ALL";
  summary: Summary;
  baseline: Summary;
  direction: Direction;
};

type DiagnosticReport = {
  generatedAt: string;
  source: string;
  chronology: string;
  population: {
    loadedRuns: number;
    eligibleObservations: number;
    byFamily: Record<string, number>;
  };
  phraseMapping: ReturnType<typeof phraseMapping>;
  comparisons: Comparison[];
  replication: ReturnType<typeof replicationRows>;
  individualPhraseResults: PhraseResult[];
  coefficientMismatches: Array<Record<string, unknown>>;
  recommendations: ReturnType<typeof recommendations>;
};

const FAMILY_LABELS: Record<RaceFamily, string> = {
  turf_5_8: "FLAT TURF 5f-8f",
  aw_5_8: "ALL WEATHER 5f-8f",
  hurdle: "HURDLES",
  chase: "CHASES",
};

const GROUP_LABELS: Record<CommentGroup, string> = {
  flatExcuseInterference: "Group A: Flat excuse / interference",
  jumpingExecutionNegative: "Group B: Jumping execution negatives",
  performancePressureNegative: "Group C: Performance / pressure negatives",
  temperamentStartNegative: "Group D: Temperament / start negatives",
};

const PHRASES: Array<{
  key: string;
  label: string;
  group: CommentGroup;
  patterns: RegExp[];
  tissueFlags: string[];
}> = [
  { key: "checked", label: "checked", group: "flatExcuseInterference", patterns: [/\bchecked\b/i], tissueFlags: ["checked"] },
  { key: "hampered", label: "hampered", group: "flatExcuseInterference", patterns: [/\bhampered\b/i], tissueFlags: ["hampered"] },
  { key: "deniedClearRun", label: "denied clear run", group: "flatExcuseInterference", patterns: [/\bdenied (?:a )?clear run\b/i, /\bno clear run\b/i, /\bnot clear run\b/i], tissueFlags: ["deniedRoom"] },
  { key: "blocked", label: "blocked / boxed in", group: "flatExcuseInterference", patterns: [/\bblocked\b/i, /\bboxed in\b/i], tissueFlags: ["deniedRoom", "shortRoom"] },
  { key: "shortOfRoom", label: "short of room / not much room", group: "flatExcuseInterference", patterns: [/\bshort of room\b/i, /\bnot much room\b/i], tissueFlags: ["shortRoom"] },
  { key: "slowlyAway", label: "slowly away / dwelt", group: "flatExcuseInterference", patterns: [/\bslow(?:ly)? away\b/i, /\bdwelt\b/i, /\bslow(?:ly)? into stride\b/i], tissueFlags: ["slowlyAway"] },
  { key: "unlucky", label: "unlucky in running", group: "flatExcuseInterference", patterns: [/\bunlucky(?: in running)?\b/i], tissueFlags: [] },

  { key: "didNotJumpWell", label: "did not jump well", group: "jumpingExecutionNegative", patterns: [/\bdid(?:n't| not) jump (?:well|fluently)\b/i, /\bjumped poorly\b/i], tissueFlags: [] },
  { key: "poorJumping", label: "poor jumping", group: "jumpingExecutionNegative", patterns: [/\bpoor jumping\b/i, /\bjumping was poor\b/i], tissueFlags: [] },
  { key: "madeMistakes", label: "made mistakes", group: "jumpingExecutionNegative", patterns: [/\bmade (?:several |a few |some )?mistakes?\b/i, /\bmistake\b/i], tissueFlags: [] },
  { key: "blundered", label: "blundered", group: "jumpingExecutionNegative", patterns: [/\bblunder(?:ed)?\b/i], tissueFlags: [] },
  { key: "hitObstacle", label: "hit fence/hurdle", group: "jumpingExecutionNegative", patterns: [/\bhit (?:the )?(?:fence|hurdle|[0-9](?:st|nd|rd|th))\b/i], tissueFlags: [] },
  { key: "jumpedRight", label: "jumped right", group: "jumpingExecutionNegative", patterns: [/\bjumped right\b/i], tissueFlags: [] },
  { key: "jumpedLeft", label: "jumped left", group: "jumpingExecutionNegative", patterns: [/\bjumped left\b/i], tissueFlags: [] },
  { key: "hesitant", label: "hesitant at obstacles", group: "jumpingExecutionNegative", patterns: [/\bhesitant\b/i, /\bnot fluent\b/i], tissueFlags: [] },

  { key: "soonFaded", label: "soon faded", group: "performancePressureNegative", patterns: [/\bsoon faded\b/i, /\bfaded (?:quickly|soon)\b/i], tissueFlags: ["faded"] },
  { key: "weakenedQuickly", label: "weakened quickly", group: "performancePressureNegative", patterns: [/\bweakened (?:quickly|rapidly|tamely)\b/i, /\bweakened\b/i], tissueFlags: ["weakened"] },
  { key: "quicklyUnderPressure", label: "quickly under pressure", group: "performancePressureNegative", patterns: [/\b(?:quickly|soon) under pressure\b/i, /\bunder pressure (?:early|soon)\b/i], tissueFlags: [] },
  { key: "neverTravelling", label: "never travelling", group: "performancePressureNegative", patterns: [/\bnever travelling\b/i, /\bnever traveled\b/i], tissueFlags: ["neverDangerous"] },
  { key: "strugglingEarly", label: "struggling early", group: "performancePressureNegative", patterns: [/\bstruggling (?:early|from halfway|after)\b/i], tissueFlags: ["lostTouch"] },
  { key: "unableToQuicken", label: "unable to quicken", group: "performancePressureNegative", patterns: [/\b(?:unable|failed) to quicken\b/i, /\bno extra\b/i], tissueFlags: [] },

  { key: "unrulyStart", label: "unruly at start", group: "temperamentStartNegative", patterns: [/\bunruly (?:at )?(?:the )?start\b/i], tissueFlags: ["awkwardStart"] },
  { key: "reluctant", label: "reluctant", group: "temperamentStartNegative", patterns: [/\breluctant\b/i], tissueFlags: [] },
  { key: "refused", label: "refused", group: "temperamentStartNegative", patterns: [/\brefused\b/i], tissueFlags: [] },
  { key: "planted", label: "planted", group: "temperamentStartNegative", patterns: [/\bplanted\b/i], tissueFlags: [] },
  { key: "difficultToLoad", label: "difficult to load", group: "temperamentStartNegative", patterns: [/\bdifficult to load\b/i, /\bloaded (?:late|reluctantly)\b/i], tissueFlags: [] },
  { key: "reared", label: "reared", group: "temperamentStartNegative", patterns: [/\breared\b/i], tissueFlags: ["awkwardStart"] },
];

async function main() {
  const connection = createDbConnection();
  let rows: DbRun[];
  try {
    rows = await connection.client<DbRun[]>`
      select rr.id as "runnerId", rr.horse_id as "horseId", h.display_name as "horseName",
             r.id as "raceId", r.race_date::text as "raceDate", r.race_datetime as "raceDateTime",
             r.race_name as "raceName", r.race_type as "raceType", r.race_type_code as "raceTypeCode",
             c.display_name as "courseName", c.source_id as "courseSourceId", r.going,
             coalesce(
               si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}',
               si.payload #>> '{props,pageProps,race,race_summary,surface}'
             ) as surface,
             r.distance_yards as "distanceYards", r.actual_runner_count as "actualRunnerCount",
             r.declared_runner_count as "declaredRunnerCount", rr.finishing_position as "finishingPosition",
             rr.result_status as "resultStatus", rr.outcome_code as "outcomeCode", rr.runner_comment as comment,
             rr.starting_price_decimal as "startingPriceDecimal", rr.official_rating as "officialRating",
             rr.racing_post_rating as "racingPostRating", rr.topspeed_rating as "topspeedRating"
      from race_runners rr
      join races r on r.id = rr.race_id
      join horses h on h.id = rr.horse_id
      join courses c on c.id = r.course_id
      left join source_imports si on si.source = r.source
        and si.source_id = r.source_id
        and si.source_type = 'full-result-next-data'
      where r.source = 'sporting_life'
        and r.race_datetime is not null
        and r.race_date >= '2024-01-01'
        and r.race_date < '2027-01-01'
      order by rr.horse_id, r.race_datetime, rr.id
    `;
  } finally {
    await connection.client.end();
  }

  const runs = withMarketRanks(rows.map(normalizeRun));
  const observations = buildObservations(runs);
  const phraseCounts = phraseMapping(observations);
  const comparisons = buildComparisons(observations);
  const phraseResults = buildPhraseResults(observations);
  const mismatches = await coefficientMismatches(comparisons, phraseResults);
  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    source: "Sporting Life historical result comments in race_runners.runner_comment; diagnostic SELECT-only query.",
    chronology: "Each observation uses a completed prior-run comment to evaluate the same horse's next strictly later run. Same-race and future comments are not used.",
    population: {
      loadedRuns: runs.length,
      eligibleObservations: observations.length,
      byFamily: Object.fromEntries(families().map((family) => [family, observations.filter((o) => o.prior.family === family).length])),
    },
    phraseMapping: phraseCounts,
    comparisons,
    replication: replicationRows(comparisons),
    individualPhraseResults: phraseResults,
    coefficientMismatches: mismatches,
    recommendations: recommendations(comparisons, mismatches),
  };

  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MD_OUTPUT, markdown(report), "utf8");
  printTerminalSummary(comparisons, mismatches, report.recommendations.overall);
}

function normalizeRun(row: DbRun): Run {
  const raceDateTime = new Date(row.raceDateTime);
  return {
    ...row,
    raceDateTime,
    sp: decimal(row.startingPriceDecimal),
    family: classifyFamily(row),
    year: row.raceDate.startsWith("2025") ? "2025" : row.raceDate.startsWith("2026") ? "2026" : null,
    marketRank: null,
  };
}

function classifyFamily(row: Pick<DbRun, "raceName" | "raceType" | "raceTypeCode" | "courseName" | "courseSourceId" | "going" | "surface" | "distanceYards">): RaceFamily | null {
  const jumpSubtype = classifyJumpRaceSubtype(row);
  if (jumpSubtype === "hurdle") return "hurdle";
  if (jumpSubtype === "chase") return "chase";
  const furlongs = row.distanceYards === null ? null : row.distanceYards / 220;
  if (furlongs === null || furlongs < 5 || furlongs > 8) return null;
  if (isCurrentAllWeatherRace(row)) return "aw_5_8";
  if (isCurrentOrdinaryFlatTurfRace(row) || (!isCurrentAllWeatherRace(row) && !/^standard/i.test(row.going ?? ""))) return "turf_5_8";
  return null;
}

function withMarketRanks(runs: Run[]) {
  const byRace = groupBy(runs, (run) => run.raceId);
  for (const race of byRace.values()) {
    const ranked = race.filter((run) => run.sp !== null).sort((a, b) => a.sp! - b.sp! || a.runnerId.localeCompare(b.runnerId));
    let previous: number | null = null;
    let previousRank = 0;
    ranked.forEach((run, index) => {
      const rank = run.sp === previous ? previousRank : index + 1;
      run.marketRank = rank;
      previous = run.sp;
      previousRank = rank;
    });
  }
  return runs;
}

function buildObservations(runs: Run[]): Observation[] {
  const byHorse = groupBy(runs.filter((run) => run.resultStatus !== "non_runner"), (run) => run.horseId);
  const observations: Observation[] = [];
  for (const horseRuns of byHorse.values()) {
    const sorted = [...horseRuns].sort((a, b) => a.raceDateTime.getTime() - b.raceDateTime.getTime() || a.runnerId.localeCompare(b.runnerId));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const prior = sorted[index]!;
      const next = sorted[index + 1]!;
      if (prior.year === null || prior.family === null || !prior.comment?.trim()) continue;
      if (prior.finishingPosition === null || next.finishingPosition === null) continue;
      const groupHits = groupHitsFor(prior.comment);
      const phraseHits = Object.values(groupHits).flat();
      observations.push({ prior, next, groupHits, phraseHits, matchKey: matchKey(prior) });
    }
  }
  return observations;
}

function groupHitsFor(comment: string): Record<CommentGroup, string[]> {
  const result: Record<CommentGroup, string[]> = {
    flatExcuseInterference: [],
    jumpingExecutionNegative: [],
    performancePressureNegative: [],
    temperamentStartNegative: [],
  };
  for (const phrase of PHRASES) {
    if (phrase.patterns.some((pattern) => pattern.test(comment))) result[phrase.group].push(phrase.key);
  }
  return result;
}

function phraseMapping(observations: Observation[]) {
  return PHRASES.map((phrase) => {
    const matched = observations.filter((observation) => observation.phraseHits.includes(phrase.key));
    return {
      key: phrase.key,
      label: phrase.label,
      group: phrase.group,
      patterns: phrase.patterns.map((pattern) => pattern.source),
      tissueFlags: phrase.tissueFlags,
      observations: matched.length,
      families: Object.fromEntries(families().map((family) => [family, matched.filter((o) => o.prior.family === family).length])),
    };
  }).filter((row) => row.observations > 0);
}

function buildComparisons(observations: Observation[]): Comparison[] {
  const output: Comparison[] = [];
  for (const family of families()) {
    for (const group of groups()) {
      output.push(compare(observations, family, group, "ALL"));
      for (const year of YEARS) output.push(compare(observations, family, group, year));
    }
  }
  return output;
}

function compare(observations: Observation[], family: RaceFamily, group: CommentGroup, year: Year | "ALL"): Comparison {
  const cohort = observations.filter((observation) => observation.prior.family === family && (year === "ALL" || observation.prior.year === year));
  const signal = cohort.filter((observation) => observation.groupHits[group].length > 0);
  const signalKeys = new Set(signal.map((observation) => observation.matchKey));
  let baseline = cohort.filter((observation) => observation.groupHits[group].length === 0 && signalKeys.has(observation.matchKey));
  let baselineMode: Comparison["baselineMode"] = "matched";
  if (baseline.length < Math.min(50, signal.length)) {
    baseline = cohort.filter((observation) => observation.groupHits[group].length === 0);
    baselineMode = baseline.length ? "family_year_fallback" : "none";
  }
  const signalSummary = summarize(signal);
  const baselineSummary = summarize(baseline);
  return { family, group, year, signal: signalSummary, baseline: baselineSummary, baselineMode, direction: classifyDirection(signalSummary, baselineSummary) };
}

function buildPhraseResults(observations: Observation[]): PhraseResult[] {
  const output: PhraseResult[] = [];
  for (const phrase of PHRASES) {
    for (const family of families()) {
      const all = phraseCompare(observations, family, phrase.group, phrase.key, "ALL");
      if (all.summary.observations >= MIN_MEANINGFUL_PHRASE_SAMPLE) output.push(all);
      for (const year of YEARS) {
        const row = phraseCompare(observations, family, phrase.group, phrase.key, year);
        if (row.summary.observations >= MIN_MEANINGFUL_PHRASE_SAMPLE) output.push(row);
      }
    }
  }
  return output;
}

function phraseCompare(observations: Observation[], family: RaceFamily, group: CommentGroup, phrase: string, year: Year | "ALL"): PhraseResult {
  const cohort = observations.filter((observation) => observation.prior.family === family && (year === "ALL" || observation.prior.year === year));
  const signal = cohort.filter((observation) => observation.phraseHits.includes(phrase));
  const baseline = cohort.filter((observation) => !observation.phraseHits.includes(phrase));
  const summary = summarize(signal);
  const base = summarize(baseline);
  return { family, group, phrase, year, summary, baseline: base, direction: classifyDirection(summary, base) };
}

function summarize(rows: Observation[]): Summary {
  const priced = rows.filter((row) => row.next.sp !== null);
  const winners = priced.filter((row) => row.next.finishingPosition === 1);
  const places = priced.filter((row) => row.next.finishingPosition !== null && row.next.finishingPosition <= Math.min(3, fieldSize(row.next) ?? 3));
  const expectedWins = sum(priced.map((row) => 1 / row.next.sp!));
  const returns = sum(winners.map((row) => row.next.sp!));
  return {
    observations: rows.length,
    priced: priced.length,
    winners: winners.length,
    places: places.length,
    expectedWins,
    winRate: rate(winners.length, priced.length),
    placeRate: rate(places.length, priced.length),
    ae: expectedWins > 0 ? winners.length / expectedWins : null,
    roi: priced.length ? (returns - priced.length) / priced.length : null,
    finishPercentileChange: average(rows.map((row) => percentile(row.next) - percentile(row.prior)).filter(valid)),
    rprChange: average(rows.map((row) => diff(row.next.racingPostRating, row.prior.racingPostRating)).filter(valid)),
    topspeedChange: average(rows.map((row) => diff(row.next.topspeedRating, row.prior.topspeedRating)).filter(valid)),
    officialRatingChange: average(rows.map((row) => diff(row.next.officialRating, row.prior.officialRating)).filter(valid)),
  };
}

function classifyDirection(signal: Summary, baseline: Summary): Direction {
  if (signal.observations < 30 || signal.expectedWins < 3) return "TOO SMALL";
  const aeDelta = nullableDiff(signal.ae, baseline.ae);
  const winDelta = nullableDiff(signal.winRate, baseline.winRate);
  const roiDelta = nullableDiff(signal.roi, baseline.roi);
  const ratingDelta = nullableDiff(signal.rprChange ?? signal.topspeedChange, baseline.rprChange ?? baseline.topspeedChange);
  const positive = countTruthy([
    signal.ae !== null && signal.ae >= 1.05,
    aeDelta !== null && aeDelta >= 0.05,
    winDelta !== null && winDelta >= 0.01,
    roiDelta !== null && roiDelta >= 0,
    ratingDelta !== null && ratingDelta > 0,
  ]);
  const negative = countTruthy([
    signal.ae !== null && signal.ae <= 0.95,
    aeDelta !== null && aeDelta <= -0.05,
    winDelta !== null && winDelta <= -0.01,
    roiDelta !== null && roiDelta < 0,
    ratingDelta !== null && ratingDelta < 0,
  ]);
  if (positive >= 3 && negative <= 1) return "POSITIVE / FORGIVE RUN";
  if (negative >= 3 && positive <= 1) return "NEGATIVE / DOWNGRADE";
  if (Math.abs(aeDelta ?? 0) < 0.05 && Math.abs(winDelta ?? 0) < 0.01 && Math.abs(roiDelta ?? 0) < 0.05) return "NEUTRAL";
  return "MIXED";
}

function replicationRows(comparisons: Comparison[]) {
  return families().flatMap((family) => groups().map((group) => {
    const all = comparisons.find((row) => row.family === family && row.group === group && row.year === "ALL")!;
    const y2025 = comparisons.find((row) => row.family === family && row.group === group && row.year === "2025")!;
    const y2026 = comparisons.find((row) => row.family === family && row.group === group && row.year === "2026")!;
    return { family, group, direction: all.direction, replication: replication(y2025.direction, y2026.direction), y2025: y2025.direction, y2026: y2026.direction };
  }));
}

function replication(a: Direction, b: Direction): Replication {
  if (a === "TOO SMALL" || b === "TOO SMALL") return "TOO SMALL";
  if (a === b && a !== "MIXED") return "REPLICATED";
  if (a !== "NEUTRAL" && b === "NEUTRAL") return "2025 ONLY";
  if (a === "NEUTRAL" && b !== "NEUTRAL") return "2026 ONLY";
  return "MIXED";
}

async function coefficientMismatches(comparisons: Comparison[], phraseResults: PhraseResult[]) {
  const [jumpModel, turfModel] = await Promise.all([
    loadJumpTissueModel(JUMP_TISSUE_MODEL_PATH),
    loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion),
  ]);
  const models = { turf_5_8: turfModel.model, hurdle: jumpModel.model, chase: jumpModel.model };
  const rows: Array<Record<string, unknown>> = [];
  for (const phrase of PHRASES) {
    for (const family of ["turf_5_8", "hurdle", "chase"] as const) {
      const empirical = phraseResults.find((row) => row.family === family && row.phrase === phrase.key && row.year === "ALL") ??
        comparisons.find((row) => row.family === family && row.group === phrase.group && row.year === "ALL");
      if (!empirical || empirical.direction === "TOO SMALL") continue;
      const coefficients = phrase.tissueFlags.flatMap((flag) => [`last_${flag}`, `last3_${flag}_count`])
        .filter((name) => COMMENT_FEATURE_NAMES.includes(name))
        .map((name) => ({ name, coefficient: coefficient(models[family], name) }));
      if (coefficients.length === 0) continue;
      const meanCoefficient = average(coefficients.map((row) => row.coefficient).filter(valid));
      const modelDirection = meanCoefficient === null ? "none" : meanCoefficient > 0 ? "MODEL REWARDS" : meanCoefficient < 0 ? "MODEL PENALIZES" : "MODEL NEUTRAL";
      const empiricalDirection = empirical.direction;
      const mismatch = (modelDirection === "MODEL REWARDS" && empiricalDirection === "NEGATIVE / DOWNGRADE") ||
        (modelDirection === "MODEL PENALIZES" && empiricalDirection === "POSITIVE / FORGIVE RUN");
      if (mismatch) {
        rows.push({
          family,
          phrase: phrase.key,
          feature: coefficients.map((row) => row.name).join(", "),
          coefficients,
          modelDirection,
          empiricalDirection,
          empiricalAE: "summary" in empirical ? empirical.summary.ae : empirical.signal.ae,
          mismatch: true,
        });
      }
    }
  }
  return rows;
}

function recommendations(comparisons: Comparison[], mismatches: Array<Record<string, unknown>>) {
  const jumpRows = comparisons.filter((row) => (row.family === "hurdle" || row.family === "chase") && row.year === "ALL");
  const jumpNegative = jumpRows.filter((row) => row.group !== "flatExcuseInterference" && row.direction === "NEGATIVE / DOWNGRADE").length;
  const flatExcuse = comparisons.filter((row) => (row.family === "turf_5_8" || row.family === "aw_5_8") && row.group === "flatExcuseInterference" && row.year === "ALL");
  const flatPositive = flatExcuse.filter((row) => row.direction === "POSITIVE / FORGIVE RUN").length;
  const overall = jumpNegative >= 2 ? "D" : mismatches.length ? "B" : jumpNegative ? "C" : "A";
  return {
    hurdleChaseTissue2: overall === "D" ? "D. Use race-family-specific comment treatment" : overall === "C" ? "C. Add negative penalties for jump adverse families" : overall === "B" ? "B. Neutralize specific adverse-excuse features" : "A. Keep current comment handling",
    flatAwTissue: flatPositive > 0 ? "Flat/AW excuse-interference comments show positive evidence in at least one short-flat family; do not blindly reverse them because of Jump evidence." : "Short-flat excuse-interference evidence is not clearly positive in this run.",
    overall,
  };
}

function markdown(report: DiagnosticReport) {
  const lines: string[] = [
    "# Comment Signal Direction By Race Family",
    "",
    "Diagnostic only. No production model, coefficient, tracker, UI, VALUE rule, settlement logic, or historical data was changed.",
    "",
    "## Executive Summary",
    "",
    `Eligible prior-comment observations with a next run: ${report.population.eligibleObservations}.`,
    `Overall recommendation: ${report.recommendations.overall} (${report.recommendations.hurdleChaseTissue2}).`,
    report.recommendations.flatAwTissue,
    "",
    "## Comment Family Definitions",
    "",
    ...definitionTable(report.phraseMapping),
    "",
    "## Turf 5f-8f",
    "",
    ...familySection(report.comparisons, "turf_5_8"),
    "## AW 5f-8f",
    "",
    ...familySection(report.comparisons, "aw_5_8"),
    "## Hurdles",
    "",
    ...familySection(report.comparisons, "hurdle"),
    "## Chases",
    "",
    ...familySection(report.comparisons, "chase"),
    "## 2025 vs 2026",
    "",
    ...table(["Family", "Group", "All", "2025", "2026", "Replication"], report.replication.map((row) => [FAMILY_LABELS[row.family], GROUP_LABELS[row.group], row.direction, row.y2025, row.y2026, row.replication])),
    "## Individual Phrase Results",
    "",
    ...table(["Family", "Phrase", "Year", "Obs", "Wins", "Exp wins", "A/E", "ROI", "Direction"], report.individualPhraseResults.map((row) => [FAMILY_LABELS[row.family], row.phrase, row.year, row.summary.observations, row.summary.winners, fmt(row.summary.expectedWins), fmt(row.summary.ae), pct(row.summary.roi), row.direction])),
    "## Tissue Coefficient Mismatches",
    "",
    report.coefficientMismatches.length ? "" : "No material model/empirical mismatches were found under the minimum phrase-sample screen.",
    ...table(["Family", "Phrase", "Feature", "Model direction", "Empirical direction", "Empirical A/E"], report.coefficientMismatches.map((row) => [FAMILY_LABELS[row.family as RaceFamily], row.phrase, row.feature, row.modelDirection, row.empiricalDirection, fmt(row.empiricalAE as number | null)])),
    "## Implications for Hurdle Tissue 2",
    "",
    report.recommendations.hurdleChaseTissue2,
    "",
    "## Implications for Flat/AW Tissue",
    "",
    report.recommendations.flatAwTissue,
    "",
    "## Recommendation",
    "",
    `Overall recommendation: ${report.recommendations.overall}.`,
    "",
    "## Reproducibility And Safety",
    "",
    "- Source comments: `race_runners.runner_comment` from completed Sporting Life historical results.",
    "- Chronology: comment race datetime must be strictly before the evaluated next run because the next run is selected later in the same horse's ordered history.",
    "- Family split is based on the prior/comment race, restricted to Turf 5f-8f, AW 5f-8f, Hurdles, and Chases.",
    "- Baseline is same family/year and matched on prior SP band, market-rank band, OR band, and finish-position band when sample allows; otherwise the row is labelled as a family/year fallback.",
    "- Final SP is used only for next-run evaluation metrics, not for phrase detection.",
  ];
  return `${lines.join("\n")}\n`;
}

function definitionTable(rows: ReturnType<typeof phraseMapping>) {
  return table(["Group", "Phrase", "Patterns", "Tissue flags", "Observations"], rows.map((row) => [GROUP_LABELS[row.group], row.label, row.patterns.join("<br>"), row.tissueFlags.join(", ") || "-", row.observations]));
}

function familySection(comparisons: Comparison[], family: RaceFamily) {
  const rows = comparisons.filter((row) => row.family === family && row.year === "ALL");
  return table(["Group", "Obs", "Wins", "Expected", "A/E", "ROI", "Baseline win", "Baseline A/E", "Rating delta", "Baseline", "Direction"], rows.map((row) => [
    GROUP_LABELS[row.group],
    row.signal.observations,
    row.signal.winners,
    fmt(row.signal.expectedWins),
    fmt(row.signal.ae),
    pct(row.signal.roi),
    pct(row.baseline.winRate),
    fmt(row.baseline.ae),
    fmt(row.signal.rprChange ?? row.signal.topspeedChange),
    row.baselineMode,
    row.direction,
  ]));
}

function printTerminalSummary(comparisons: Comparison[], mismatches: Array<Record<string, unknown>>, overall: string) {
  const line = (family: RaceFamily, group: CommentGroup) => {
    const row = comparisons.find((item) => item.family === family && item.group === group && item.year === "ALL")!;
    const rep = replicationRows(comparisons).find((item) => item.family === family && item.group === group)!;
    console.log(`${GROUP_LABELS[group]}:`);
    console.log(`Direction: ${row.direction}`);
    console.log(`A/E: ${fmt(row.signal.ae)}`);
    console.log(`Replication: ${rep.replication}`);
  };
  console.log("FLAT TURF 5f-8f");
  console.log("Excuse/interference comments:");
  line("turf_5_8", "flatExcuseInterference");
  console.log("");
  console.log("AW 5f-8f");
  console.log("Excuse/interference comments:");
  line("aw_5_8", "flatExcuseInterference");
  console.log("");
  for (const family of ["hurdle", "chase"] as const) {
    console.log(FAMILY_LABELS[family]);
    console.log("Jumping negatives:");
    line(family, "jumpingExecutionNegative");
    console.log("Performance/pressure negatives:");
    line(family, "performancePressureNegative");
    console.log("Temperament/start negatives:");
    line(family, "temperamentStartNegative");
    console.log("");
  }
  console.log("MODEL/EMPIRICAL MISMATCHES:");
  if (!mismatches.length) console.log("- none under the minimum sample screen");
  for (const row of mismatches) {
    console.log(`- feature: ${row.feature}`);
    console.log(`  model direction: ${row.modelDirection}`);
    console.log(`  empirical next-run direction: ${row.empiricalDirection}`);
  }
  console.log("");
  console.log(`Overall recommendation: ${overall}`);
  console.log(`Wrote ${MD_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function matchKey(run: Run) {
  return [run.family, run.year, spBand(run.sp), rankBand(run.marketRank), orBand(run.officialRating), finishBand(run.finishingPosition, fieldSize(run))].join("|");
}

function spBand(value: number | null) {
  if (value === null) return "sp_missing";
  if (value < 3) return "sp_<3";
  if (value < 6) return "sp_3_5.99";
  if (value < 11) return "sp_6_10.99";
  if (value < 21) return "sp_11_20.99";
  return "sp_21+";
}

function rankBand(value: number | null) {
  if (value === null) return "rank_missing";
  if (value === 1) return "fav";
  if (value <= 3) return "rank_2_3";
  return "rank_4+";
}

function orBand(value: number | null) {
  if (value === null) return "or_missing";
  return `or_${Math.floor(value / 10) * 10}`;
}

function finishBand(position: number | null, field: number | null) {
  if (position === null || field === null || field <= 1) return "finish_missing";
  const p = percentile({ finishingPosition: position, actualRunnerCount: field, declaredRunnerCount: field });
  if (p >= 0.75) return "finish_top_quarter";
  if (p >= 0.5) return "finish_q2";
  if (p >= 0.25) return "finish_q3";
  return "finish_bottom_quarter";
}

function percentile(run: Pick<Run, "finishingPosition" | "actualRunnerCount" | "declaredRunnerCount">) {
  const field = fieldSize(run);
  if (run.finishingPosition === null || field === null || field <= 1) return NaN;
  return (field - run.finishingPosition) / (field - 1);
}

function fieldSize(run: Pick<Run, "actualRunnerCount" | "declaredRunnerCount">) {
  return run.actualRunnerCount ?? run.declaredRunnerCount;
}

function coefficient(model: { names: string[]; weights: number[] }, name: string) {
  const index = model.names.indexOf(name);
  return index < 0 ? 0 : model.weights[index]!;
}

function decimal(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function diff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function nullableDiff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function families(): RaceFamily[] {
  return ["turf_5_8", "aw_5_8", "hurdle", "chase"];
}

function groups(): CommentGroup[] {
  return ["flatExcuseInterference", "jumpingExecutionNegative", "performancePressureNegative", "temperamentStartNegative"];
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const k = key(value);
    result.set(k, [...(result.get(k) ?? []), value]);
  }
  return result;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : null;
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function valid(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function countTruthy(values: boolean[]) {
  return values.filter(Boolean).length;
}

function fmt(value: number | null, digits = 3) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`;
}

function table(headers: string[], rows: unknown[][]) {
  if (rows.length === 0) return ["No rows.", ""];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`),
    "",
  ];
}

await main();
