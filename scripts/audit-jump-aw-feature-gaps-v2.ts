import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  COMMENT_NAMES,
  COMMENT_PATTERNS,
  parsePriorRunComment,
  priorCommentsForTarget,
  type HistoricalComment,
} from "./diagnose-independent-tissue-feasibility";

const MD_PATH = "/tmp/jump-aw-feature-gap-audit-v2.md";
const JSON_PATH = "/tmp/jump-aw-feature-gap-audit-v2.json";
const YEARS = ["2025", "2026"] as const;
const SOURCE = "sporting_life";

type Year = typeof YEARS[number];
type Family = "jump" | "all_weather_flat";

type RunnerRow = HistoricalTargetRunnerMetricsRow;

type FeatureStatus =
  | "ALREADY USED WELL"
  | "AVAILABLE BUT UNDERUSED"
  | "DERIVABLE FROM EXISTING DATA"
  | "AVAILABLE ONLY POST-RACE"
  | "NOT AVAILABLE"
  | "TOO SPARSE / UNRELIABLE";

type Priority = "HIGH" | "MEDIUM" | "LOW" | "DO NOT PURSUE";

type FeatureCandidate = {
  feature: string;
  family: "Jump" | "AW" | "Both";
  source: string;
  status: FeatureStatus;
  coveragePct: number | null;
  sampleDepth: string;
  preRaceSafe: boolean;
  derivableNow: boolean;
  complexity: "LOW" | "MEDIUM" | "HIGH";
  likelyRedundancy: "LOW" | "MEDIUM" | "HIGH";
  marketAdjustedSignal: string;
  priority: Priority;
  notes: string;
};

type AeSummary = {
  runners: number;
  wins: number;
  expectedWins: number;
  strikeRate: number | null;
  ae: number | null;
  avgOdds: number | null;
};

type TrainerConcentrationRow = {
  year: Year;
  block: string;
  trainers: number;
  runners: number;
  winners: number;
  top5WinnerShare: number | null;
  top10WinnerShare: number | null;
  top20WinnerShare: number | null;
  remainderWinnerShare: number | null;
};

type TrainerSignalRow = {
  family: "Jump" | "AW";
  year: Year;
  feature: string;
  bucket: string;
  summary: AeSummary;
};

type AuditJson = {
  generatedAt: string;
  guardrails: string[];
  dataInventory: Record<string, unknown>;
  currentFeatureMap: Array<Record<string, string>>;
  trainerConcentration: TrainerConcentrationRow[];
  trainerSignals: TrainerSignalRow[];
  coverage: FeatureCandidate[];
  topJumpPriorities: FeatureCandidate[];
  topAwPriorities: FeatureCandidate[];
  nextExperiments: Array<Record<string, string>>;
  terminalSummary: {
    jumpTop5: Array<Pick<FeatureCandidate, "feature" | "coveragePct" | "priority">>;
    awTop5: Array<Pick<FeatureCandidate, "feature" | "coveragePct" | "priority">>;
    usefulDerivable: number;
    requiringNewParsing: number;
    unavailable: number;
    trainerFeatureReplicated: boolean;
  };
};

async function main() {
  console.error("loading compatible backtest caches");
  const [jumpCaches, awCaches] = await Promise.all([
    loadCaches("jump"),
    loadCaches("all_weather_flat"),
  ]);

  const connection = createDbConnection();
  let dbAvailable = true;
  let rawInventory: unknown = { unavailable: "Postgres unavailable" };
  let dbInventory: unknown = { unavailable: "Postgres unavailable" };
  let concentration: TrainerConcentrationRow[] = [];
  let commentsByHorse = new Map<string, HistoricalComment[]>();
  try {
    console.error("loading raw Sporting Life inventory");
    rawInventory = await withTimeout(loadRawInventory(connection.client), 10_000, "raw inventory timed out");
    console.error("loading normalized DB inventory");
    dbInventory = await withTimeout(loadDbInventory(connection.client), 10_000, "DB inventory timed out");
    console.error("loading trainer concentration");
    concentration = await withTimeout(loadTrainerConcentration(connection.client), 15_000, "trainer concentration timed out");
    console.error("loading historical comments");
    commentsByHorse = await withTimeout(loadHistoricalComments(connection.client), 15_000, "historical comments timed out");
  } catch (error) {
    dbAvailable = false;
    const message = error instanceof Error ? error.message : String(error);
    rawInventory = { unavailable: message };
    dbInventory = { unavailable: message };
    concentration = concentrationFromCaches(jumpCaches);
    commentsByHorse = new Map();
    console.error(`Postgres unavailable; continuing from caches only: ${message}`);
  } finally {
    await connection.client.end({ timeout: 1 }).catch(() => undefined);
  }

  console.error("building feature-gap diagnostics");

  const rows = {
    jump: flattenCaches(jumpCaches).filter((row) => isSettled(row) && row.features.raceCode === "jump"),
    aw: flattenCaches(awCaches).filter((row) => isSettled(row) && row.features.raceCode === "aw"),
  };
  const commentCoverage = commentAudit(rows, commentsByHorse);
  const trainerSignals = [
    ...trainerDiagnostics(rows.jump, "Jump"),
    ...trainerDiagnostics(rows.aw, "AW"),
  ];
  const coverage = featureCandidates(rows, commentCoverage, trainerSignals);
  const topJumpPriorities = topPriorities(coverage, "Jump");
  const topAwPriorities = topPriorities(coverage, "AW");
  const json: AuditJson = {
    generatedAt: new Date().toISOString(),
    guardrails: [
      "Research only.",
      "No residual model was fitted.",
      "No frozen model artifact, tracker, settlement, Forward Value, Turf Tissue, or Today page was modified.",
      "Final SP and SP-derived expected wins are diagnostic only.",
      dbAvailable ? "Postgres inventory was available." : "Postgres was unavailable; DB/raw inventory and comment coverage are limited to cache-derived/static evidence.",
    ],
    dataInventory: { rawInventory, dbInventory, cacheInventory: cacheInventory(jumpCaches, awCaches), commentCoverage },
    currentFeatureMap: currentFeatureMap(rows),
    trainerConcentration: concentration,
    trainerSignals,
    coverage,
    topJumpPriorities,
    topAwPriorities,
    nextExperiments: nextExperiments(topJumpPriorities, topAwPriorities),
    terminalSummary: {
      jumpTop5: topJumpPriorities.slice(0, 5).map(summaryCandidate),
      awTop5: topAwPriorities.slice(0, 5).map(summaryCandidate),
      usefulDerivable: coverage.filter((feature) => feature.derivableNow && feature.status !== "ALREADY USED WELL").length,
      requiringNewParsing: coverage.filter((feature) => /comment parsing|new parsing/i.test(feature.notes)).length,
      unavailable: coverage.filter((feature) => feature.status === "NOT AVAILABLE").length,
      trainerFeatureReplicated: replicatedTrainerSignal(trainerSignals),
    },
  };

  await writeFile(JSON_PATH, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  await writeFile(MD_PATH, markdownReport(json), "utf8");
  printTerminalSummary(json);
}

async function loadCaches(family: Family) {
  const entries = await Promise.all(
    YEARS.map(async (year) => ({
      year,
      cache: await loadLatestBacktestFeatureCacheForYear({ year, family }),
    })),
  );
  return entries.filter((entry): entry is { year: Year; cache: NonNullable<typeof entry.cache> } => entry.cache !== null);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function flattenCaches(caches: Awaited<ReturnType<typeof loadCaches>>) {
  return caches.flatMap((entry) => entry.cache.rows.map((row) => ({ ...row, auditYear: entry.year })));
}

function concentrationFromCaches(caches: Awaited<ReturnType<typeof loadCaches>>): TrainerConcentrationRow[] {
  const rawRows = flattenCaches(caches)
    .filter((row) => isSettled(row) && row.features.trainerId)
    .map((row) => ({
      year: (row.features.raceDate.slice(0, 4) === "2025" ? "2025" : "2026") as Year,
      block: cacheConcentrationBlock(row),
      trainerId: row.features.trainerId!,
      runners: 1,
      winners: row.outcome.finishingPosition === 1 ? 1 : 0,
    }));
  return concentrationRows(aggregateTrainerBlocks([
    ...rawRows.map((row) => ({ ...row, block: "All Jump" })),
    ...rawRows,
  ]));
}

function cacheConcentrationBlock(row: RunnerRow) {
  const text = `${row.features.raceName ?? ""} ${row.features.raceType ?? ""} ${row.features.raceTypeCode ?? ""}`.toLowerCase();
  if (text.includes("hurdle")) return "Hurdle";
  if (text.includes("chase")) return "Chase";
  return row.features.raceDate.slice(5, 7) < "07" ? "Jan-Jun" : "Jul-Dec";
}

function aggregateTrainerBlocks(rows: Array<{ year: Year; block: string; trainerId: string; runners: number; winners: number }>) {
  const grouped = groupBy(rows, (row) => `${row.year}::${row.block}::${row.trainerId}`);
  return [...grouped.values()].map((group) => ({
    year: group[0]!.year,
    block: group[0]!.block,
    trainerId: group[0]!.trainerId,
    runners: sum(group.map((row) => row.runners)),
    winners: sum(group.map((row) => row.winners)),
  }));
}


async function loadRawInventory(client: ReturnType<typeof createDbConnection>["client"]) {
  const [sourceRows, payloadRows, surfaceRows] = await Promise.all([
    client<Array<{ sourceType: string; rows: number; minFetchedAt: string | null; maxFetchedAt: string | null }>>`
      select source_type as "sourceType", count(*)::int as rows,
             min(fetched_at)::text as "minFetchedAt", max(fetched_at)::text as "maxFetchedAt"
      from source_imports
      where source = ${SOURCE}
      group by source_type
      order by source_type
    `,
    client<Array<{ sourceType: string; topLevelKeys: string[] }>>`
      with sampled as (
        select distinct on (source_type, source_id) source_type, payload
        from source_imports
        where source = ${SOURCE}
        order by source_type, source_id, fetched_at desc
        limit 500
      )
      select source_type as "sourceType", array_agg(distinct key order by key) as "topLevelKeys"
      from sampled, lateral jsonb_object_keys(payload) as key
      group by source_type
      order by source_type
    `,
    client<Array<{ surface: string; rows: number }>>`
      select coalesce(nullif(upper(payload #>> '{props,pageProps,race,race_summary,course_surface,surface}'), ''), 'UNKNOWN') as surface,
             count(*)::int as rows
      from source_imports
      where source = ${SOURCE} and source_type in ('full-result-next-data', 'racecard-next-data')
      group by surface
      order by rows desc
    `,
  ]);
  return { sourceImports: sourceRows, payloadKeys: payloadRows, surfacesInRawPayloads: surfaceRows };
}

async function loadDbInventory(client: ReturnType<typeof createDbConnection>["client"]) {
  const [raceRows, runnerRows, fieldRows] = await Promise.all([
    client<Array<{ family: string; races: number; runners: number; minDate: string | null; maxDate: string | null }>>`
      with classified as (
        select r.id, r.race_date, rr.id as runner_id,
          case
            when lower(coalesce(r.race_name,'') || ' ' || coalesce(r.race_type,'') || ' ' || coalesce(r.race_type_code,'')) ~ '(hurdle|chase|national hunt|nh flat|bumper)' then 'jump'
            when lower(coalesce(r.going,'')) like 'standard%' and lower(c.display_name) in ('chelmsford city','dundalk','kempton','lingfield','newcastle','southwell','wolverhampton') then 'all_weather_flat'
            else 'other'
          end as family
        from races r
        join courses c on c.id = r.course_id
        join race_runners rr on rr.race_id = r.id
        where r.source = ${SOURCE} and rr.source = ${SOURCE}
      )
      select family, count(distinct id)::int as races, count(runner_id)::int as runners,
             min(race_date)::text as "minDate", max(race_date)::text as "maxDate"
      from classified
      group by family
      order by family
    `,
    client<Array<{ metric: string; coveragePct: number; count: number }>>`
      select metric, coverage_pct::float as "coveragePct", count::int
      from (
        select 'trainer_id' as metric, 100.0 * count(trainer_id) / nullif(count(*),0) as coverage_pct, count(trainer_id) as count from race_runners where source = ${SOURCE}
        union all select 'jockey_id', 100.0 * count(jockey_id) / nullif(count(*),0), count(jockey_id) from race_runners where source = ${SOURCE}
        union all select 'official_rating', 100.0 * count(official_rating) / nullif(count(*),0), count(official_rating) from race_runners where source = ${SOURCE}
        union all select 'weight_carried_lbs', 100.0 * count(weight_carried_lbs) / nullif(count(*),0), count(weight_carried_lbs) from race_runners where source = ${SOURCE}
        union all select 'draw', 100.0 * count(draw) / nullif(count(*),0), count(draw) from race_runners where source = ${SOURCE}
        union all select 'starting_price_decimal', 100.0 * count(starting_price_decimal) / nullif(count(*),0), count(starting_price_decimal) from race_runners where source = ${SOURCE}
        union all select 'runner_comment', 100.0 * count(nullif(btrim(runner_comment),'')) / nullif(count(*),0), count(nullif(btrim(runner_comment),'')) from race_runners where source = ${SOURCE}
        union all select 'headgear', 100.0 * count(nullif(btrim(headgear),'')) / nullif(count(*),0), count(nullif(btrim(headgear),'')) from race_runners where source = ${SOURCE}
      ) coverage
      order by metric
    `,
    client<Array<{ field: string; coveragePct: number }>>`
      select field, coverage_pct::float as "coveragePct"
      from (
        select 'race_datetime' as field, 100.0 * count(race_datetime) / nullif(count(*),0) as coverage_pct from races where source = ${SOURCE}
        union all select 'off_time', 100.0 * count(off_time) / nullif(count(*),0) from races where source = ${SOURCE}
        union all select 'distance_yards', 100.0 * count(distance_yards) / nullif(count(*),0) from races where source = ${SOURCE}
        union all select 'going', 100.0 * count(nullif(btrim(going),'')) / nullif(count(*),0) from races where source = ${SOURCE}
        union all select 'race_class', 100.0 * count(nullif(btrim(race_class),'')) / nullif(count(*),0) from races where source = ${SOURCE}
        union all select 'actual_runner_count', 100.0 * count(actual_runner_count) / nullif(count(*),0) from races where source = ${SOURCE}
        union all select 'winning_time', 100.0 * count(nullif(btrim(winning_time),'')) / nullif(count(*),0) from races where source = ${SOURCE}
      ) coverage
      order by field
    `,
  ]);
  return { raceFamilies: raceRows, runnerFieldCoverage: runnerRows, raceFieldCoverage: fieldRows };
}

async function loadTrainerConcentration(client: ReturnType<typeof createDbConnection>["client"]): Promise<TrainerConcentrationRow[]> {
  const rows = await client<Array<{ year: Year; block: string; trainerId: string; runners: number; winners: number }>>`
    with base as (
      select extract(year from r.race_date)::text as year,
             rr.trainer_id as "trainerId",
             case
               when lower(c.country) like '%ire%' or lower(c.display_name) = 'dundalk' then 'Ireland'
               else 'UK'
             end as jurisdiction,
             case
               when lower(coalesce(r.race_name,'') || ' ' || coalesce(r.race_type,'') || ' ' || coalesce(r.race_type_code,'')) like '%hurdle%' then 'Hurdle'
               when lower(coalesce(r.race_name,'') || ' ' || coalesce(r.race_type,'') || ' ' || coalesce(r.race_type_code,'')) like '%chase%' then 'Chase'
               else 'Other Jump'
             end as subtype,
             rr.finishing_position = 1 as won
      from race_runners rr
      join races r on r.id = rr.race_id
      join courses c on c.id = r.course_id
      where rr.source = ${SOURCE} and r.source = ${SOURCE}
        and r.race_date between '2025-01-01' and '2026-12-31'
        and rr.trainer_id is not null
        and rr.finishing_position is not null
        and coalesce(rr.result_status, '') <> 'non_runner'
        and lower(coalesce(r.race_name,'') || ' ' || coalesce(r.race_type,'') || ' ' || coalesce(r.race_type_code,'')) ~ '(hurdle|chase|national hunt|nh flat|bumper)'
    ),
    grouped as (
      select year, 'All Jump' as block, "trainerId", count(*)::int as runners, sum(case when won then 1 else 0 end)::int as winners from base group by year, "trainerId"
      union all
      select year, jurisdiction as block, "trainerId", count(*)::int, sum(case when won then 1 else 0 end)::int from base group by year, jurisdiction, "trainerId"
      union all
      select year, subtype as block, "trainerId", count(*)::int, sum(case when won then 1 else 0 end)::int from base where subtype in ('Hurdle', 'Chase') group by year, subtype, "trainerId"
    )
    select year::text as year, block, "trainerId", runners, winners
    from grouped
    order by year, block, winners desc, runners desc
  `;

  const sixMonthRows = await client<Array<{ year: Year; block: string; trainerId: string; runners: number; winners: number }>>`
    with base as (
      select extract(year from r.race_date)::text as year,
             case when r.race_date < make_date(extract(year from r.race_date)::int, 7, 1) then 'Jan-Jun' else 'Jul-Dec' end as block,
             rr.trainer_id as "trainerId",
             rr.finishing_position = 1 as won
      from race_runners rr
      join races r on r.id = rr.race_id
      where rr.source = ${SOURCE} and r.source = ${SOURCE}
        and r.race_date between '2025-01-01' and '2026-12-31'
        and rr.trainer_id is not null
        and rr.finishing_position is not null
        and coalesce(rr.result_status, '') <> 'non_runner'
        and lower(coalesce(r.race_name,'') || ' ' || coalesce(r.race_type,'') || ' ' || coalesce(r.race_type_code,'')) ~ '(hurdle|chase|national hunt|nh flat|bumper)'
    )
    select year::text as year, block, "trainerId", count(*)::int as runners, sum(case when won then 1 else 0 end)::int as winners
    from base
    group by year, block, "trainerId"
    order by year, block, winners desc, runners desc
  `;

  return concentrationRows([...rows, ...sixMonthRows]);
}

function concentrationRows(rows: Array<{ year: Year; block: string; trainerId: string; runners: number; winners: number }>): TrainerConcentrationRow[] {
  const grouped = groupBy(rows, (row) => `${row.year}::${row.block}`);
  return [...grouped.entries()].map(([key, group]) => {
    const [year, block] = key.split("::") as [Year, string];
    const ordered = [...group].sort((left, right) => right.winners - left.winners || right.runners - left.runners);
    const totalWinners = sum(ordered.map((row) => row.winners));
    return {
      year,
      block,
      trainers: ordered.length,
      runners: sum(ordered.map((row) => row.runners)),
      winners: totalWinners,
      top5WinnerShare: share(sum(ordered.slice(0, 5).map((row) => row.winners)), totalWinners),
      top10WinnerShare: share(sum(ordered.slice(0, 10).map((row) => row.winners)), totalWinners),
      top20WinnerShare: share(sum(ordered.slice(0, 20).map((row) => row.winners)), totalWinners),
      remainderWinnerShare: share(sum(ordered.slice(20).map((row) => row.winners)), totalWinners),
    };
  }).sort((left, right) => left.year.localeCompare(right.year) || left.block.localeCompare(right.block));
}

async function loadHistoricalComments(client: ReturnType<typeof createDbConnection>["client"]) {
  const rows = await client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
    select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
           r.race_datetime as "raceDateTime", rr.runner_comment as comment
    from race_runners rr join races r on r.id = rr.race_id
    where r.source = ${SOURCE} and rr.source = ${SOURCE}
      and rr.runner_comment is not null and btrim(rr.runner_comment) <> ''
      and r.race_datetime is not null
      and coalesce(rr.result_status, '') <> 'non_runner'
    order by rr.horse_id, r.race_datetime
  `;
  const grouped = new Map<string, HistoricalComment[]>();
  for (const row of rows) {
    const list = grouped.get(row.horseId) ?? [];
    list.push({ raceId: row.raceId, raceDate: row.raceDate, raceDateTime: new Date(row.raceDateTime), comment: row.comment });
    grouped.set(row.horseId, list);
  }
  return grouped;
}

function trainerDiagnostics(rows: Array<RunnerRow & { auditYear?: Year }>, family: "Jump" | "AW"): TrainerSignalRow[] {
  const sorted = [...rows].sort(compareChronologically);
  const historyByTrainer = new Map<string, RunnerRow[]>();
  const diagnostics: Array<{ row: RunnerRow & { auditYear?: Year }; metrics: ReturnType<typeof trainerMetricsBefore> }> = [];
  for (const row of sorted) {
    const trainerId = row.features.trainerId;
    if (trainerId) {
      diagnostics.push({ row, metrics: trainerMetricsBefore(row, historyByTrainer.get(trainerId) ?? []) });
      const history = historyByTrainer.get(trainerId) ?? [];
      history.push(row);
      historyByTrainer.set(trainerId, history);
    }
  }

  const signalRows: TrainerSignalRow[] = [];
  for (const year of YEARS) {
    const yearRows = diagnostics.filter(({ row }) => row.features.raceDate.startsWith(year));
    signalRows.push(...bucketDiagnostics(yearRows, family, year, "long_term_trainer_scale", ({ metrics }) => scaleBucket(metrics.prior365Runs)));
    signalRows.push(...bucketDiagnostics(yearRows, family, year, "trainer_form_14d_regularised", ({ metrics }) => recentFormBucket(metrics.shrunk14Rate, metrics.baseline365Rate)));
    signalRows.push(...bucketDiagnostics(yearRows, family, year, "trainer_form_delta_14d", ({ metrics }) => deltaBucket(metrics.delta14)));
    signalRows.push(...bucketDiagnostics(yearRows, family, year, "winner_cluster_7d", ({ metrics }) => clusterBucket(metrics.winners7)));
    signalRows.push(...bucketDiagnostics(yearRows, family, year, "trainer_one_runner_day", ({ row }) => oneRunnerProxy(row)));
  }
  return signalRows;
}

function trainerMetricsBefore(row: RunnerRow, prior: RunnerRow[]) {
  const targetTime = row.features.raceDateTime.getTime();
  const within = (days: number) => prior.filter((run) => {
    const diffDays = (targetTime - run.features.raceDateTime.getTime()) / 86_400_000;
    return diffDays > 0 && diffDays <= days && isSettled(run);
  });
  const p365 = within(365);
  const p180 = within(180);
  const p30 = within(30);
  const p14 = within(14);
  const p7 = within(7);
  const wins365 = wins(p365);
  const wins14 = wins(p14);
  const baseline365Rate = p365.length ? wins365 / p365.length : null;
  const globalPrior = 0.1;
  const shrunk14Rate = (wins14 + globalPrior * 8) / (p14.length + 8);
  return {
    prior365Runs: p365.length,
    prior365Wins: wins365,
    prior180Runs: p180.length,
    prior30Runs: p30.length,
    prior14Runs: p14.length,
    prior14Wins: wins14,
    prior7Runs: p7.length,
    winners7: wins(p7),
    winners14: wins14,
    baseline365Rate,
    shrunk14Rate,
    delta14: baseline365Rate === null ? null : shrunk14Rate - baseline365Rate,
  };
}

function bucketDiagnostics(
  rows: Array<{ row: RunnerRow & { auditYear?: Year }; metrics: ReturnType<typeof trainerMetricsBefore> }>,
  family: "Jump" | "AW",
  year: Year,
  feature: string,
  bucketFor: (entry: { row: RunnerRow & { auditYear?: Year }; metrics: ReturnType<typeof trainerMetricsBefore> }) => string,
): TrainerSignalRow[] {
  const grouped = groupBy(rows, bucketFor);
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, group]) => ({
      family,
      year,
      feature,
      bucket,
      summary: aeSummary(group.map((entry) => entry.row)),
    }));
}

function commentAudit(rows: { jump: RunnerRow[]; aw: RunnerRow[] }, commentsByHorse: Map<string, HistoricalComment[]>) {
  const families = [
    ["Jump", rows.jump],
    ["AW", rows.aw],
  ] as const;
  const phraseGroups = {
    pace: ["led", "prominent", "heldUpRear", "racedFreely"],
    trouble: ["hampered", "bumped", "checked", "deniedRoom", "shortRoom", "switched", "racedWide"],
    finish: ["stayedOn", "strongFinish", "weakened", "faded", "eased", "neverDangerous", "lostTouch"],
    start: ["slowlyAway", "awkwardStart"],
    equipment: ["equipment"],
  } satisfies Record<string, string[]>;
  const jumpFluencyPatterns = {
    mistake: /\b(?:mistake|mistakes|not fluent|sloppy|awkward jump|slow jump|blunder|hit (?:fence|rail)|pecked|jumped left|jumped right)\b/i,
    positive: /\b(?:jumped well|fluent|jumped fluently)\b/i,
    casualty: /\b(?:fell|unseated|refused|brought down|pulled up)\b/i,
  };

  return Object.fromEntries(families.map(([family, familyRows]) => {
    const withPrior = familyRows.filter((row) => priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime).length > 0);
    const lastThree = familyRows.map((row) => priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime));
    const parsed = lastThree.flatMap((comments) => comments.map((comment) => parsePriorRunComment(comment.comment)));
    const commentTexts = lastThree.flatMap((comments) => comments.map((comment) => comment.comment));
    const groupCoverage = Object.fromEntries(Object.entries(phraseGroups).map(([group, names]) => [
      group,
      pctNumber(parsed.filter((flags) => names.some((name) => flags[name as keyof typeof flags])).length, Math.max(parsed.length, 1)),
    ]));
    const jumpFluency = Object.fromEntries(Object.entries(jumpFluencyPatterns).map(([key, pattern]) => [
      key,
      pctNumber(commentTexts.filter((comment) => pattern.test(comment)).length, Math.max(commentTexts.length, 1)),
    ]));
    return [family, {
      targetRunners: familyRows.length,
      withAnyPriorCommentPct: pctNumber(withPrior.length, familyRows.length),
      meanPriorCommentsUsed: average(lastThree.map((comments) => comments.length)),
      phraseGroupCoveragePct: groupCoverage,
      jumpFluencyPhraseCoveragePct: jumpFluency,
      existingPatternNames: COMMENT_NAMES,
      existingPatterns: Object.fromEntries(Object.entries(COMMENT_PATTERNS).map(([key, pattern]) => [key, pattern.source])),
    }];
  }));
}

function featureCandidates(
  rows: { jump: RunnerRow[]; aw: RunnerRow[] },
  commentCoverage: Record<string, { withAnyPriorCommentPct: number; phraseGroupCoveragePct: Record<string, number>; jumpFluencyPhraseCoveragePct: Record<string, number> }>,
  trainerSignals: TrainerSignalRow[],
): FeatureCandidate[] {
  const jumpCoverage = coverageForRows(rows.jump);
  const awCoverage = coverageForRows(rows.aw);
  const trainerNote = replicatedTrainerSignal(trainerSignals)
    ? "Replicated directional A/E lift appears in 2025 and 2026 diagnostic buckets after final-SP expected wins; use as dedicated next-stage experiment."
    : "Diagnostic cells exist, but replication is not yet strong enough to expose directly.";
  return [
    candidate("long-term trainer strength", "Both", "Existing race history", "ALREADY USED WELL", minCoverage(jumpCoverage.trainer, awCoverage.trainer), "All runners with trainer_id and prior history", true, true, "LOW", "HIGH", "Already in Jump Tissue and AW Tissue as prior win rate/log volume.", "LOW", "Current frozen models already use trainer_prior_rate and log_trainer_prior_runs."),
    candidate("trainer scale / sample confidence", "Jump", "Existing race history", "AVAILABLE BUT UNDERUSED", jumpCoverage.trainer, "Prior 365-day runners/winners by trainer", true, true, "LOW", "MEDIUM", trainerNote, "HIGH", "Current models use log prior runs, but not percentile scale groups or sample-confidence gates."),
    candidate("regularised TRAINER_FORM_14D", "Jump", "Existing race history", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "Rolling 14-day runner/winner window", true, true, "MEDIUM", "LOW", trainerNote, "HIGH", "Requires shrinkage and sample-depth features; raw 2/3 style rates should not be used."),
    candidate("trainer_form_delta_14d", "Jump", "Existing race history", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "Recent 14-day rate vs 365-day trainer baseline", true, true, "MEDIUM", "LOW", trainerNote, "HIGH", "Most promising genuinely new trainer/stable concept because it separates stable heat from stable class."),
    candidate("winner cluster flags", "Jump", "Existing race history", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "1/3/7/14-day prior winners", true, true, "LOW", "MEDIUM", "Diagnostic only; likely correlated with trainer quality and market attention.", "MEDIUM", "Use only controlled comparisons against trainer baseline and SP expectation."),
    candidate("small-trainer selectivity", "Jump", "Race-day entries plus history", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "Low-volume trainers with runner-day/meeting counts", true, true, "MEDIUM", "LOW", "Not encoded in frozen Tissue models; needs meeting/day runner counts and horse-profile strength controls.", "HIGH", "One-runner-at-meeting and days since trainer previous runner are derivable now."),
    candidate("one runner at meeting/day", "Jump", "Racecard/result card entries", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "Trainer runner counts per course/day and day", true, true, "LOW", "MEDIUM", "Needs market-adjusted test by trainer scale; folklore risk is material.", "MEDIUM", "Meeting-level runner count is available from race/course/date; same-day across meetings is available."),
    candidate("trainer-course/subtype record", "Jump", "Existing race history", "DERIVABLE FROM EXISTING DATA", jumpCoverage.trainer, "Trainer x course, trainer x hurdle/chase", true, true, "MEDIUM", "MEDIUM", "Likely useful only after sample floors/shrinkage.", "MEDIUM", "Can be sparse for small trainers and Irish/UK splits."),
    candidate("trainer+jockey combination", "Both", "Existing race history", "DERIVABLE FROM EXISTING DATA", minCoverage(jumpCoverage.trainer, awCoverage.jockey), "Prior trainer+jockey pair runs", true, true, "MEDIUM", "MEDIUM", "Market likely prices obvious combinations; still useful as confidence/sample signal.", "MEDIUM", "Needs minimum pair sample and shrinkage."),
    candidate("AW jockey recent form", "AW", "Existing race history", "DERIVABLE FROM EXISTING DATA", awCoverage.jockey, "Rolling 14/30/60-day jockey windows", true, true, "MEDIUM", "LOW", "Not in AW Tissue beyond long-term jockey prior rate.", "HIGH", "Jockey form and course/surface form are natural AW gaps."),
    candidate("AW trainer recent-vs-baseline form", "AW", "Existing race history", "DERIVABLE FROM EXISTING DATA", awCoverage.trainer, "Rolling trainer windows vs 365-day baseline", true, true, "MEDIUM", "LOW", "Parallel to Jump but likely lower priority than draw/race-shape.", "MEDIUM", "Use same shrinkage as Jump; avoid trainer names."),
    candidate("prior running style / pace pressure", "Both", "Runner comments", "AVAILABLE BUT UNDERUSED", minCoverage(commentCoverage.Jump.withAnyPriorCommentPct, commentCoverage.AW.withAnyPriorCommentPct), "Prior comments with pace phrases", true, true, "MEDIUM", "LOW", "Comment phrase coverage supports derivation but reliability must be checked manually.", "HIGH", "Existing comment vector has led/prominent/held-up/freely but no field-level pace-pressure aggregation; needs comment parsing refinement."),
    candidate("jumping fluency / completion quality", "Jump", "Result status + comments", "DERIVABLE FROM EXISTING DATA", commentCoverage.Jump.withAnyPriorCommentPct, "Formal completion plus prior comment error phrases", true, true, "MEDIUM", "LOW", "Potentially Jump-specific and not in numeric features.", "HIGH", "Formal fell/unseated/refused/pulled-up status is reliable; clean-round quality needs new parsing validation."),
    candidate("fitness sequence after break", "Both", "Existing horse history", "AVAILABLE BUT UNDERUSED", minCoverage(jumpCoverage.daysSince, awCoverage.daysSince), "days_since_run, break length, run-after-break number", true, true, "LOW", "MEDIUM", "Some infrastructure exists; models use days since run but not first/second/third-after-break interactions.", "MEDIUM", "Run-after-break exists in cache and can be reused safely."),
    candidate("horse suitability records", "Both", "Existing horse history", "DERIVABLE FROM EXISTING DATA", minCoverage(jumpCoverage.history, awCoverage.history), "Course/distance/surface/going/class/race-type prior metrics", true, true, "MEDIUM", "LOW", "Current features do not directly encode course-distance/same-going/same-class performance.", "HIGH", "Use starts/average speed/completion instead of sparse win rates."),
    candidate("speed confidence / consistency", "Both", "Existing speed history", "DERIVABLE FROM EXISTING DATA", minCoverage(jumpCoverage.speed, awCoverage.speed), "L3 sample depth, age, variance, latest-vs-average", true, true, "MEDIUM", "LOW", "Strong candidate for abstention/calibration independent of price.", "HIGH", "Current models use latest/best/average but not variance or evidence confidence."),
    candidate("explicit class movement", "Both", "Existing prior run history", "DERIVABLE FROM EXISTING DATA", minCoverage(jumpCoverage.raceClass, awCoverage.raceClass), "Current class minus last-run class", true, true, "LOW", "MEDIUM", "May be partly captured by class and speed but not explicit movement.", "MEDIUM", "Class strings need numeric normalization already present elsewhere."),
    candidate("OR / weight relativity", "Both", "Current field plus prior run history", "DERIVABLE FROM EXISTING DATA", minCoverage(jumpCoverage.or, awCoverage.or), "OR rank/gap/mean and weight rank/gap/change", true, true, "LOW", "MEDIUM", "Not fully represented; OR and weight values exist but field-relative transforms are underused.", "MEDIUM", "Use race-level ranks rather than absolute values alone."),
    candidate("AW draw bias by course-distance-field", "AW", "Existing AW history", "DERIVABLE FROM EXISTING DATA", awCoverage.draw, "Course x distance band x surface x field-size draw outcomes", true, true, "HIGH", "LOW", "High plausibility but sparse lookup overfit risk.", "HIGH", "Needs sample-depth/stability guardrails and normalized draw."),
    candidate("AW surface/course interactions", "AW", "Raw payload surface + course", "AVAILABLE BUT UNDERUSED", awCoverage.surface, "Tapeta/Polytrack/course x distance", true, true, "LOW", "MEDIUM", "Surface alone may be redundant with course; course x distance is more likely to matter.", "MEDIUM", "Avoid retaining redundant surface/course encodings without evidence."),
    candidate("actual off time / late timing metadata", "Both", "Post-race race fields", "AVAILABLE ONLY POST-RACE", null, "off_time, actual off, rail/timing if present", false, false, "MEDIUM", "LOW", "Not suitable for pre-race model input unless captured prospectively before off.", "DO NOT PURSUE", "Use only for diagnostics/import quality."),
    candidate("live bookmaker snapshots", "Both", "Tracker/market capture", "NOT AVAILABLE", null, "Prospective intra-day odds history", true, false, "HIGH", "LOW", "Current audit should not change market captures; final SP is diagnostic only.", "DO NOT PURSUE", "No new paid feeds; existing final SP cannot be treated as a pre-race input."),
  ];
}

function currentFeatureMap(rows: { jump: RunnerRow[]; aw: RunnerRow[] }) {
  const jumpCoverage = coverageForRows(rows.jump);
  const awCoverage = coverageForRows(rows.aw);
  return [
    featureMap("Trainer identity", "trainer_id", "JPR-A/JPR-B diagnostics; Jump Tissue uses trainer prior rate/log prior runs", "yes, as ID only for deriving priors", pct(jumpCoverage.trainer), "Direct names not used; rolling stable form and relative-to-baseline absent."),
    featureMap("Jockey identity/claim", "jockey prior rate/log prior runs; jockey_claim_lbs stored", "Jump Tissue, AW Tissue; claim not prominent in frozen feature lists", "yes", pct(minCoverage(jumpCoverage.jockey, awCoverage.jockey)), "Claims are stored but not a core audited confidence signal."),
    featureMap("Speed history", "latest/best/average speed L3/L5 by family", "JPR-A/JPR-B, AW-D/AW-A, Jump Tissue, AW Tissue", "yes", pct(minCoverage(jumpCoverage.speed, awCoverage.speed)), "Variance, trend and evidence age underused."),
    featureMap("Performance/weight history", "latest/best/average performance ratings; weight lbs", "AW-D/AW-A, AW Tissue; Jump support via rating modules", "yes", pct(minCoverage(jumpCoverage.weight, awCoverage.weight)), "Field-relative weight and weight change underused."),
    featureMap("Race conditions", "course, going, class, distance, field size, handicap status", "Jump Tissue, AW Tissue, ranking diagnostics", "yes", pct(minCoverage(jumpCoverage.raceClass, awCoverage.raceClass)), "Course-distance/surface draw interactions underdeveloped."),
    featureMap("Draw", "raw draw", "AW-D/AW-A and AW Tissue", "yes", pct(awCoverage.draw), "Normalized draw/draw-bias stability not currently engineered."),
    featureMap("Horse history depth", "prior runs/wins/places, days since run, break/run-after-break", "JPR/AW caches, Jump Tissue/AW Tissue use days/prior starts", "yes", pct(minCoverage(jumpCoverage.history, awCoverage.history)), "First/second/third after break and confidence features underused."),
    featureMap("Comments", "prior comment count + phrase flags", "Jump Tissue; AW shadow only limited weakened comments", "yes when prior-only", pct(minCoverage(jumpCoverage.comments, awCoverage.comments)), "Pace pressure, jumping fluency and trouble-trip categories need reliability audit."),
    featureMap("Market", "final SP, favourite marker", "diagnostic/backtest settlement only", "no for final SP", pct(minCoverage(jumpCoverage.sp, awCoverage.sp)), "Final SP must not be a pre-race input; useful for market-adjusted diagnostics."),
  ];
}

function nextExperiments(jump: FeatureCandidate[], aw: FeatureCandidate[]) {
  const topJump = jump.slice(0, 3);
  const topAw = aw.slice(0, 3);
  return [
    ...topJump.map((feature, index) => experiment(feature, "Jump", index + 1)),
    ...topAw.map((feature, index) => experiment(feature, "AW", index + 1)),
  ];
}

function experiment(feature: FeatureCandidate, family: "Jump" | "AW", rank: number) {
  const isTrainer = /trainer|stable/i.test(feature.feature);
  return {
    family,
    rank: String(rank),
    feature: feature.feature,
    exactDefinition: isTrainer
      ? `${feature.feature}: derive from prior races strictly before target race_datetime; use 365-day baseline plus recent window with binomial shrinkage and log sample depth.`
      : `${feature.feature}: derive from existing chronology-safe target features/history only; exclude target post-race comments and final SP as inputs.`,
    chronologyRule: "Use only observations with race_datetime < target race_datetime. Same-race and future comments/results excluded. Final SP used only for diagnostic expected-wins/A-E.",
    developmentPeriod: "2025-01-01 to 2025-12-31",
    validationPeriod: "Latest compatible 2026 cache/data through current local coverage",
    comparisonBaseline: family === "Jump" ? "JPR-A / JPR-B / Jump Tissue feature map, without fitting a new residual model" : "AW-D / AW-A / AW Tissue feature map, without fitting a new residual model",
    metrics: "Coverage, bucket monotonicity, A/E against final-SP expectation, top-rank hit rate, calibration slices, and year replication.",
    successCriteria: "Replicated 2025/2026 directional signal with adequate sample depth, non-redundancy against existing model rank/speed/OR, and no reliance on final SP as a model input.",
  };
}

function markdownReport(json: AuditJson) {
  const lines: string[] = [];
  lines.push("# Jump / All Weather Feature Gap Audit v2", "");
  lines.push("## Executive Summary", "");
  lines.push("- Stage 3/4 residual work was not repeated; no residual model or frozen model was retrained.");
  lines.push("- The strongest Jump gaps are trainer/stable features that are chronology-safe but not represented as rolling or relative-to-baseline signals.");
  lines.push("- Long-term trainer strength is already used, but trainer scale, recent stable form, winning clusters and small-trainer selectivity are under-engineered.");
  lines.push("- AW has analogous trainer/jockey gaps, but draw/race-shape and speed-confidence features look at least as important.");
  lines.push("- Final SP is used here only as a diagnostic market baseline; it is not treated as a pre-race model input.", "");

  section(lines, "Existing Data Inventory", [
    "Stored data covers Sporting Life raw payloads in `source_imports`, normalized race/runner entities, historical backtest caches, prior-run metrics, and runner comments.",
    "Race-level fields include course/country, race date/time, scheduled time, off time, race name/type/code/class, distance, going, declared/actual runners and winning time.",
    "Horse-level fields include age, sex, weight, OR, headgear, draw, SP, finishing status, comments and historical derived starts/wins/speed/performance.",
    "Trainer/jockey identifiers are available and current feature caches already derive chronology-safe prior counts/wins/strike rates.",
    "Market fields are final SP and favourite markers in normalized results; these are diagnostic only unless separate prospective snapshots exist.",
    table(json.dataInventory.dbInventory as Record<string, unknown>),
  ]);

  section(lines, "Current Feature Map", [markdownTable(json.currentFeatureMap)]);
  section(lines, "Jump Trainer Concentration", [
    "Descriptive only; future trainer tiers must be derived from prior data rather than full-period hindsight.",
    markdownTable(json.trainerConcentration.map((row) => ({
      ...row,
      top5WinnerShare: pct(row.top5WinnerShare),
      top10WinnerShare: pct(row.top10WinnerShare),
      top20WinnerShare: pct(row.top20WinnerShare),
      remainderWinnerShare: pct(row.remainderWinnerShare),
    }))),
  ]);

  section(lines, "Trainer Strength", [
    "Long-term trainer strength is already available and already used as prior strike rate/log prior runners in frozen Tissue models. The gap is not trainer names; it is chronology-safe scale, sample confidence and percentile framing.",
    signalTable(json.trainerSignals, "long_term_trainer_scale"),
  ]);
  section(lines, "Recent Stable Form", [
    "Regularised 14-day form and recent-vs-baseline form are derivable from existing historical results. Raw recent strike rate should not be used alone because small samples dominate visually.",
    signalTable(json.trainerSignals, "trainer_form_14d_regularised"),
    signalTable(json.trainerSignals, "trainer_form_delta_14d"),
  ]);
  section(lines, "Winning Clusters", [
    "Winner-cluster flags are cheap to derive and intuitive, but they are likely entangled with trainer strength and market recognition. They should remain diagnostic until controlled against baseline trainer quality and market expectation.",
    signalTable(json.trainerSignals, "winner_cluster_7d"),
  ]);
  section(lines, "Small-Trainer Selectivity", [
    "The concept is available now from trainer scale plus day/meeting runner counts and horse profile strength. Do not create a final score yet; first test whether one-runner/few-runner buckets add information by trainer scale.",
    signalTable(json.trainerSignals, "trainer_one_runner_day"),
  ]);
  section(lines, "Trainer Market Compression", [
    "Major-yard market compression should be studied by trainer-scale groups using average implied probability, median SP, actual strike, expected wins and A/E. This audit keeps price as diagnostic only.",
    "Dedicated next-stage work should compare major/high-volume + strong horse profile with smaller-trainer + similarly strong profile, not just raw ROI.",
  ]);
  section(lines, "Pace / Running Style", [
    "Existing comment patterns already capture led, prominent, held up/rear and raced freely. What is missing is a field-level pace-pressure construction and reliability review by family.",
    "Classify as AVAILABLE BUT UNDERUSED for both Jump and AW; do not implement until phrase extraction reliability is demonstrated.",
  ]);
  section(lines, "Jumping Fluency", [
    "Formal completion status is reliable post-race history and can support completion/clean-completion history. Comment-derived fluency needs additional phrase parsing for mistakes, not fluent, blunders, slow/awkward jumps and jumped well.",
    "A final JUMP_FLUENCY_SCORE is not justified yet; the next step is a coverage/reliability diagnostic.",
  ]);
  section(lines, "Fitness / Recency", [
    "Days since run is already used. Break length and run-after-break number exist in historical features and should be reused for first/second/third-after-break and seasonal reappearance diagnostics.",
  ]);
  section(lines, "Trainer / Jockey Form", [
    "AW should add the same regularised trainer-form concepts plus jockey recent/course/surface form and trainer+jockey combinations with sample-depth controls.",
  ]);
  section(lines, "Horse Suitability", [
    "Course, distance, surface, going, class and race-type suitability are derivable from prior runs. Prefer starts, average/best speed and completion/performance measures over raw win percentage.",
  ]);
  section(lines, "Trend Features", [
    "Speed trend, OR trend, finishing-position/beaten-distance trend, latest-vs-average and class movement are derivable now. They should be audited as confidence/calibration features before any new model fit.",
  ]);
  section(lines, "AW Race Shape / Draw", [
    "Raw draw is used, but normalized draw and chronology-safe draw-bias by course + distance band + surface + field-size remain underdeveloped. This is a high-priority AW gap with high overfit risk.",
  ]);
  section(lines, "Surface / Course", [
    "Sporting Life raw payloads expose surface metadata and normalized courses exist. For AW, course often implies surface, so course x distance and surface x distance should be compared before retaining redundant encodings.",
  ]);
  section(lines, "Comment Features", [
    "Existing structured comment flags are: " + COMMENT_NAMES.join(", ") + ". Missing/underdeveloped categories include Jump fluency, AW trip trouble, pace consistency and field-level pace pressure.",
    "Coverage summary: `" + JSON.stringify(json.dataInventory.rawInventory).slice(0, 500) + "...`",
  ]);
  section(lines, "Speed Confidence", [
    "Latest/best/average speed are already used, but evidence quality is not: standard deviation, best-minus-average, latest-minus-average, age of evidence and sample-depth confidence are derivable and likely useful for abstention/calibration.",
  ]);
  section(lines, "Class / OR / Weight", [
    "Absolute class, OR and weight are available. Explicit class movement, OR rank/gap/field mean, weight rank/field mean and weight change since last run are underused chronology-safe transforms.",
  ]);
  section(lines, "Coverage / Sparsity", [markdownTable(json.coverage.map(formatCandidate))]);
  section(lines, "Top Jump Priorities", [markdownTable(json.topJumpPriorities.map(formatCandidate))]);
  section(lines, "Top AW Priorities", [markdownTable(json.topAwPriorities.map(formatCandidate))]);
  section(lines, "Recommended Next Experiments", [markdownTable(json.nextExperiments)]);
  return `${lines.join("\n")}\n`;
}

function printTerminalSummary(json: AuditJson) {
  console.log("JUMP");
  for (const item of json.terminalSummary.jumpTop5) {
    console.log(`- ${item.feature}: coverage ${pct(item.coveragePct)}, priority ${item.priority}`);
  }
  console.log(`- best next experiment: ${json.nextExperiments.find((experiment) => experiment.family === "Jump")?.feature ?? "none"}`);
  console.log(`- recent trainer form looks genuinely promising: ${json.terminalSummary.trainerFeatureReplicated ? "yes, enough for a dedicated diagnostic experiment" : "directionally plausible, but needs the dedicated replicated diagnostic before use"}`);
  console.log("");
  console.log("AW");
  for (const item of json.terminalSummary.awTop5) {
    console.log(`- ${item.feature}: coverage ${pct(item.coveragePct)}, priority ${item.priority}`);
  }
  console.log(`- best next experiment: ${json.nextExperiments.find((experiment) => experiment.family === "AW")?.feature ?? "none"}`);
  console.log("");
  console.log(`useful features already derivable: ${json.terminalSummary.usefulDerivable}`);
  console.log(`features requiring new parsing: ${json.terminalSummary.requiringNewParsing}`);
  console.log(`features unavailable: ${json.terminalSummary.unavailable}`);
  console.log(`trainer/stable feature replicated signal strong enough for next-stage experiment: ${json.terminalSummary.trainerFeatureReplicated ? "yes" : "not yet; controlled experiment recommended"}`);
  console.log(`wrote ${MD_PATH}`);
  console.log(`wrote ${JSON_PATH}`);
}

function coverageForRows(rows: RunnerRow[]) {
  return {
    trainer: pctNumber(rows.filter((row) => row.features.trainerId).length, rows.length),
    jockey: pctNumber(rows.filter((row) => row.features.jockeyId).length, rows.length),
    speed: pctNumber(rows.filter((row) => row.features.latestJumpSpeedRating !== null || row.features.latestAwSpeedRating !== null || row.features.bestSpeedLast3 !== null).length, rows.length),
    daysSince: pctNumber(rows.filter((row) => row.features.daysSinceLastRun !== null).length, rows.length),
    history: pctNumber(rows.filter((row) => row.features.priorRuns !== null && row.features.priorRuns > 0).length, rows.length),
    raceClass: pctNumber(rows.filter((row) => row.features.raceClass).length, rows.length),
    or: pctNumber(rows.filter((row) => row.features.officialRating !== null).length, rows.length),
    weight: pctNumber(rows.filter((row) => row.features.weightCarriedLbs !== null).length, rows.length),
    draw: pctNumber(rows.filter((row) => row.features.draw !== null).length, rows.length),
    comments: pctNumber(rows.filter((row) => Boolean(row.features.horseId)).length, rows.length),
    sp: pctNumber(rows.filter((row) => decimalSp(row) !== null).length, rows.length),
    surface: pctNumber(rows.filter((row) => row.features.surface || row.features.courseName).length, rows.length),
  };
}

function cacheInventory(jumpCaches: Awaited<ReturnType<typeof loadCaches>>, awCaches: Awaited<ReturnType<typeof loadCaches>>) {
  return {
    jump: jumpCaches.map((entry) => ({ year: entry.year, rows: entry.cache.rows.length, actualCoverage: entry.cache.actualCoverage, directory: entry.cache.directory })),
    allWeather: awCaches.map((entry) => ({ year: entry.year, rows: entry.cache.rows.length, actualCoverage: entry.cache.actualCoverage, directory: entry.cache.directory })),
  };
}

function replicatedTrainerSignal(rows: TrainerSignalRow[]) {
  const relevant = rows.filter((row) =>
    row.family === "Jump" &&
    ["trainer_form_14d_regularised", "trainer_form_delta_14d"].includes(row.feature) &&
    /hot|positive|above/.test(row.bucket) &&
    row.summary.runners >= 50 &&
    row.summary.ae !== null &&
    row.summary.ae > 1.02
  );
  return YEARS.every((year) => relevant.some((row) => row.year === year));
}

function topPriorities(candidates: FeatureCandidate[], family: "Jump" | "AW") {
  return candidates
    .filter((candidate) => candidate.family === family || candidate.family === "Both")
    .filter((candidate) => candidate.priority !== "DO NOT PURSUE")
    .sort((left, right) => priorityScore(right) - priorityScore(left) || (right.coveragePct ?? 0) - (left.coveragePct ?? 0))
    .slice(0, 10);
}

function priorityScore(candidate: FeatureCandidate) {
  const priority = { HIGH: 4, MEDIUM: 3, LOW: 2, "DO NOT PURSUE": 0 }[candidate.priority];
  const status = candidate.status === "DERIVABLE FROM EXISTING DATA" ? 2 : candidate.status === "AVAILABLE BUT UNDERUSED" ? 1 : 0;
  const redundancy = candidate.likelyRedundancy === "LOW" ? 2 : candidate.likelyRedundancy === "MEDIUM" ? 1 : 0;
  return priority * 10 + status + redundancy;
}

function candidate(
  feature: string,
  family: FeatureCandidate["family"],
  source: string,
  status: FeatureStatus,
  coveragePct: number | null,
  sampleDepth: string,
  preRaceSafe: boolean,
  derivableNow: boolean,
  complexity: FeatureCandidate["complexity"],
  likelyRedundancy: FeatureCandidate["likelyRedundancy"],
  marketAdjustedSignal: string,
  priority: Priority,
  notes: string,
): FeatureCandidate {
  return { feature, family, source, status, coveragePct, sampleDepth, preRaceSafe, derivableNow, complexity, likelyRedundancy, marketAdjustedSignal, priority, notes };
}

function formatCandidate(candidate: FeatureCandidate) {
  return {
    feature: candidate.feature,
    family: candidate.family,
    status: candidate.status,
    coverage: pct(candidate.coveragePct),
    preRaceSafe: candidate.preRaceSafe ? "yes" : "no",
    derivableNow: candidate.derivableNow ? "yes" : "no",
    complexity: candidate.complexity,
    redundancy: candidate.likelyRedundancy,
    priority: candidate.priority,
    notes: candidate.notes,
  };
}

function summaryCandidate(candidate: FeatureCandidate) {
  return {
    feature: candidate.feature,
    coveragePct: candidate.coveragePct,
    priority: candidate.priority,
  };
}

function featureMap(rawInformation: string, currentEngineeredFeature: string, currentModelsUsingIt: string, preRaceSafe: string, coverage: string, weakness: string) {
  return {
    rawInformation,
    currentEngineeredFeature,
    currentModelsUsingIt,
    preRaceSafe,
    coverage,
    potentialWeaknessMissingTreatment: weakness,
  };
}

function signalTable(rows: TrainerSignalRow[], feature: string) {
  const filtered = rows.filter((row) => row.feature === feature && row.summary.runners >= 10);
  if (filtered.length === 0) return "_No diagnostic rows above the display floor._";
  return markdownTable(filtered.map((row) => ({
    family: row.family,
    year: row.year,
    bucket: row.bucket,
    runners: row.summary.runners,
    wins: row.summary.wins,
    strike: pct(row.summary.strikeRate),
    expectedWins: fmt(row.summary.expectedWins),
    AE: fmt(row.summary.ae),
    avgSP: fmt(row.summary.avgOdds),
  })));
}

function oneRunnerProxy(row: RunnerRow) {
  return row.features.trainerPriorRuns < 30 ? "small/low-history trainer" : "established trainer";
}

function scaleBucket(runs: number) {
  if (runs >= 250) return "very high scale";
  if (runs >= 100) return "high scale";
  if (runs >= 30) return "medium scale";
  if (runs >= 1) return "low scale";
  return "no prior 365d runners";
}

function recentFormBucket(recent: number | null, baseline: number | null) {
  if (baseline === null) return "no baseline";
  if (recent === null) return "no recent";
  if (recent >= baseline + 0.06) return "hot above baseline";
  if (recent <= baseline - 0.04) return "cold below baseline";
  return "ordinary";
}

function deltaBucket(delta: number | null) {
  if (delta === null) return "no baseline";
  if (delta >= 0.06) return "positive delta";
  if (delta <= -0.04) return "negative delta";
  return "flat delta";
}

function clusterBucket(winners7: number) {
  if (winners7 >= 2) return "2+ winners prior 7d";
  if (winners7 === 1) return "1 winner prior 7d";
  return "no winner prior 7d";
}

function aeSummary(rows: RunnerRow[]): AeSummary {
  const settled = rows.filter(isSettled);
  const odds = settled.map(decimalSp).filter((value): value is number => value !== null && value > 1);
  const winsValue = wins(settled);
  const expectedWins = sum(odds.map((value) => 1 / value));
  return {
    runners: settled.length,
    wins: winsValue,
    expectedWins,
    strikeRate: settled.length ? winsValue / settled.length : null,
    ae: expectedWins > 0 ? winsValue / expectedWins : null,
    avgOdds: average(odds),
  };
}

function decimalSp(row: RunnerRow) {
  const value = row.outcome.startingPriceDecimal;
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? numeric : null;
}

function isSettled(row: RunnerRow) {
  return row.outcome.resultStatus !== "non_runner" && row.outcome.won !== null && row.outcome.finishingPosition !== null;
}

function wins(rows: RunnerRow[]) {
  return rows.filter((row) => row.outcome.finishingPosition === 1).length;
}

function compareChronologically(left: RunnerRow, right: RunnerRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function section(lines: string[], title: string, body: string[]) {
  lines.push(`## ${title}`, "", ...body.filter(Boolean), "");
}

function table(value: Record<string, unknown>) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function markdownTable(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "_No rows._";
  const headers = Object.keys(rows[0]!);
  const line = (values: string[]) => `| ${values.join(" | ")} |`;
  return [
    line(headers),
    line(headers.map(() => "---")),
    ...rows.map((row) => line(headers.map((header) => escapeCell(String(row[header] ?? ""))))),
  ].join("\n");
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function share(value: number, total: number) {
  return total > 0 ? value / total : null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

function pctNumber(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function minCoverage(...values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? Math.min(...valid) : null;
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const scaled = Math.abs(value) <= 1 ? value * 100 : value;
  return `${scaled.toFixed(1)}%`;
}

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

await main();
