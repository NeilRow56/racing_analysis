import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDbConnection } from "@/db";
import { calculateAwRaceRatings, calculateAwDRatingCoverage } from "@/lib/racing/aw-performance-rating";
import { AW_SPEED_RATING_CALCULATION_VERSION, isSupportedAllWeatherRace } from "@/lib/racing/aw-speed-rating";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear, type LoadedBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow as Features, HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { COMMENT_FEATURE_NAMES, COMMENT_PATTERNS, EPOCHS, L2, commentVector, priorCommentsForTarget, raceSoftmax, type HistoricalComment, type Model } from "./diagnose-independent-tissue-feasibility";
const REPORT = "/tmp/aw-tissue-stage1.md";
const ARTIFACT = "/tmp/aw-tissue-stage1-artifact.json";
const PREDICTIONS = "/tmp/aw-tissue-stage1-predictions.json";
export const SCHEMA = "aw_tissue_stage1_features_v1";
export const CANDIDATES = ["AW-T0", "AW-T1", "AW-T2"] as const;
type Candidate = typeof CANDIDATES[number];
type Definition = [
    string,
    (f: Features, priorAwStarts: number) => number | null
];
const CORE: Definition[] = [
    ["avg_l3_aw_speed", (f) => f.averageAwSpeedLast3],
    ["trainer_prior_rate", (f) => f.trainerPriorWinRate],
    ["jockey_prior_rate", (f) => f.jockeyPriorWinRate ?? null],
    ["declared_field_size", (f) => f.declaredRunnerCount],
    [
        "class", (f) => { const match = f.raceClass?.match(/\d+/); return match ? Number(match[0]) : null; }
    ],
    ["distance_furlongs", (f) => f.distanceYards === null ? null : f.distanceYards / 220],
    [
        "handicap", (f) => {
            const status = classifyHandicapStatus(f);
            return status === "unknown" ? null : status === "handicap" ? 1 : 0;
        }
    ],
];
const FULL: Definition[] = [
    ...CORE,
    ["latest_aw_speed", (f) => f.latestAwSpeedRating],
    ["best_l3_aw_speed", (f) => f.bestAwSpeedLast3],
    ["avg_l3_aw_performance", (f) => f.averagePerformanceLast3],
    ["latest_aw_performance", (f) => f.latestPerformanceRating],
    ["official_rating", (f) => f.officialRating],
    ["prior_aw_starts", (_, count) => count],
    ["age", (f) => f.horseAge],
    ["draw", (f) => f.draw],
    ["days_since_run", (f) => f.daysSinceLastRun],
];
const BANDS: Array<[
    string,
    number,
    number
]> = [
    ["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]
];
export type PriorRun = HistoricalComment & {
    aw: boolean;
    comment: string;
};
export type Example = {
    row: Row;
    raceId: string;
    won: boolean;
    priorAwStarts: number;
    priorComments: HistoricalComment[];
    probabilities: Partial<Record<Candidate, number>>;
};
type Population = ReturnType<typeof buildPopulation>;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const fmt = (n: number, digits = 4) => Number.isFinite(n) ? n.toFixed(digits) : "-";
const pct = (n: number) => Number.isFinite(n) ? `${(100 * n).toFixed(2)}%` : "-";
const id = (e: Example) => e.row.features.targetRunnerId;
export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const k = key(row);
        const group = groups.get(k) ?? [];
        group.push(row);
        groups.set(k, group);
    }
    return groups;
}
export function buildPopulation(rows: Row[], history: Map<string, PriorRun[]>) {
    const aw = rows.filter((r) => r.features.raceCode === "aw" && isSupportedAllWeatherRace(r.features));
    const all = groupBy(aw, (r) => r.features.targetRaceId);
    const excluded = new Map<string, number>();
    const examples: Example[] = [];
    let starters = 0;
    for (const [raceId, raceRows] of all) {
        const active = raceRows.filter((r) => !isVoidBetResultStatus(r.outcome.resultStatus));
        starters += active.length;
        // Synthetic odds invoke canonical starter/label semantics without requiring or using SP.
        const labels = active.map((r) => settleSelection({ ...r.outcome, startingPriceDecimal: "2" }));
        const expected = active[0]?.features.actualRunnerCount;
        const reason = active.length < 2 ? "fewer than two starters" :
            new Set(active.map((r) => r.features.targetRunnerId)).size !== active.length ? "duplicate runner" :
                raceRows.some((r) => r.features.targetRunnerId !== r.outcome.targetRunnerId || r.features.targetRaceId !== r.outcome.targetRaceId) ? "feature/outcome mismatch" :
                    expected == null || raceRows.some((r) => r.features.actualRunnerCount !== expected) || (expected !== active.length && expected !== raceRows.length) ? "incomplete/unverified field" :
                        labels.some((label) => label === null) ? "unresolved starter outcome" :
                            labels.filter((label) => label!.grossReturn > 0).length !== 1 ? "not single-winner (including dead heats)" : null;
        if (reason) {
            excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
            continue;
        }
        active.forEach((row, index) => {
            const f = row.features;
            if (f.odds !== null || f.oddsDecimal !== null)
                throw new Error("Market data present in pre-race feature cache");
            if (f.latestRunDate !== null && f.latestRunDate >= f.raceDate)
                throw new Error(`Non-prior history date: ${f.targetRunnerId}`);
            const runs = (history.get(f.horseId) ?? []).filter((r) => r.raceDateTime < f.raceDateTime && r.raceId !== raceId);
            const priorComments = priorCommentsForTarget(runs.filter((r) => r.comment.trim().length > 0), f.raceDateTime);
            examples.push({
                row, raceId, won: labels[index]!.grossReturn > 0, priorAwStarts: runs.filter((r) => r.aw).length, priorComments, probabilities: {}
            });
        });
    }
    examples.sort((a, b) => a.row.features.raceDateTime.getTime() - b.row.features.raceDateTime.getTime() || a.raceId.localeCompare(b.raceId) || id(a).localeCompare(id(b)));
    return { examples, inputRaces: all.size, inputRunners: aw.length, starters, excluded };
}
export function featureValues(e: Example, candidate: Candidate) {
    const values = (candidate === "AW-T2" ? CORE : FULL).map(([, getter]) => getter(e.row.features, e.priorAwStarts));
    return [
        ...values.map((v) => v !== null && Number.isFinite(v) ? v : null), ...values.map((v) => v === null || !Number.isFinite(v) ? 1 : 0), ...(candidate === "AW-T1" ? commentVector(e.priorComments) : [])
    ];
}
function featureNames(candidate: Candidate) {
    const names = (candidate === "AW-T2" ? CORE : FULL).map(([name]) => name);
    return [
        ...names, ...names.map((name) => `${name}_missing`), ...(candidate === "AW-T1" ? COMMENT_FEATURE_NAMES : [])
    ];
}
export function fit(examples: Example[], candidate: Candidate): Model {
    if (!examples.length)
        throw new Error("Empty training sample");
    const names = featureNames(candidate), raw = examples.map((e) => featureValues(e, candidate));
    const means = names.map((_, j) => {
        const mean = average(raw.flatMap((r) => r[j] === null ? [] : [r[j]!]));
        return Number.isFinite(mean) ? mean : 0;
    });
    const scales = names.map((_, j) => Math.max(Math.sqrt(average(raw.map((r) => ((r[j] ?? means[j]!) - means[j]!) ** 2))), 1e-6));
    const matrix = raw.map((r) => r.map((v, j) => ((v ?? means[j]!) - means[j]!) / scales[j]!));
    const groups = [...groupBy(examples.map((_, i) => i), (i) => examples[i]!.raceId).values()];
    const weights: number[] = Array(names.length).fill(0);
    for (let epoch = 0; epoch < EPOCHS; epoch++) {
        const gradient: number[] = Array(names.length).fill(0);
        for (const indexes of groups) {
            const probabilities = raceSoftmax(indexes.map((i) => dot(weights, matrix[i]!)));
            indexes.forEach((i, k) => {
                const residual = (examples[i]!.won ? 1 : 0) - probabilities[k]!;
                for (let j = 0; j < weights.length; j++)
                    gradient[j]! += residual * matrix[i]![j]!;
            });
        }
        const rate = .12 / Math.sqrt(1 + epoch / 10);
        weights.forEach((_, j) => { weights[j]! += rate * (gradient[j]! / groups.length - L2 * weights[j]!); });
    }
    return { names, means, scales, weights };
}
export function predict(examples: Example[], candidate: Candidate, model: Model) {
    if (JSON.stringify(model.names) !== JSON.stringify(featureNames(candidate)))
        throw new Error("Feature schema mismatch");
    for (const group of groupBy(examples, (e) => e.raceId).values()) {
        const p = raceSoftmax(group.map((e) => dot(model.weights, featureValues(e, candidate).map((v, j) => ((v ?? model.means[j]!) - model.means[j]!) / model.scales[j]!))));
        if (p.some((value) => !Number.isFinite(value) || value <= 0) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-12)
            throw new Error("Invalid probability book");
        group.forEach((e, i) => { e.probabilities[candidate] = p[i]!; });
    }
}
function dot(a: number[], b: number[]) { return a.reduce((sum, v, i) => sum + v * b[i]!, 0); }
function ordered(group: Example[], value: (e: Example) => number) { return [...group].sort((a, b) => value(b) - value(a) || id(a).localeCompare(id(b))); }
function probability(e: Example, candidate: Candidate) {
    const p = e.probabilities[candidate];
    if (p === undefined)
        throw new Error("Prediction missing");
    return p;
}
export function quality(examples: Example[], candidate: Candidate) {
    const groups = [...groupBy(examples, (e) => e.raceId).values()];
    if (groups.some((g) => g.filter((e) => e.won).length !== 1 || Math.abs(g.reduce((sum, e) => sum + probability(e, candidate), 0) - 1) > 1e-12)) {
        throw new Error("Race probability quality requires complete single-winner fields");
    }
    const captures = [1, 2, 3].map((n) => average(groups.map((g) => ordered(g, (e) => probability(e, candidate)).slice(0, n).some((e) => e.won) ? 1 : 0)));
    return {
        races: groups.length, runners: examples.length, logLoss: -average(examples.filter((e) => e.won).map((e) => Math.log(probability(e, candidate)))), brier: average(groups.map((g) => g.reduce((sum, e) => sum + (probability(e, candidate) - (e.won ? 1 : 0)) ** 2, 0))), top1: captures[0]!, top2: captures[1]!, top3: captures[2]!
    };
}
function metricRow(sample: string, name: string, m: ReturnType<typeof quality>) {
    return [
        sample, name, m.races, m.runners, fmt(m.logLoss), fmt(m.brier), pct(m.top1), pct(m.top2), pct(m.top3)
    ];
}
function table(headers: string[], rows: Array<Array<string | number>>) {
    return [
        `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((v) => String(v).replaceAll("|", "\\|")).join(" | ")} |`), ""
    ];
}
const metricHeaders = ["Sample", "Candidate", "Races", "Runners", "Log loss", "Race Brier", "Top 1", "Top 2", "Top 3"];
export async function loadHistory(rows: Row[]) {
    const targets = new Map<string, Date>();
    for (const { features: f } of rows)
        if (!targets.has(f.horseId) || targets.get(f.horseId)! < f.raceDateTime)
            targets.set(f.horseId, f.raceDateTime);
    const { client } = createDbConnection();
    const history = new Map<string, PriorRun[]>();
    try {
        await client `set statement_timeout = '120s'`;
        const entries = [...targets];
        for (let start = 0; start < entries.length; start += 500) {
            const payload = JSON.stringify(entries.slice(start, start + 500).map(([horseId, cutoff]) => ({ horse_id: horseId, cutoff: cutoff.toISOString() })));
            const result = await client<Array<{
                horseId: string;
                raceId: string;
                raceDate: string;
                raceDateTime: Date;
                comment: string | null;
                courseName: string;
                raceName: string | null;
                raceType: string | null;
                going: string | null;
                surface: string | null;
            }>> `
        with targets as (select * from jsonb_to_recordset(${payload}::jsonb) as t(horse_id uuid, cutoff timestamptz))
        select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate", r.race_datetime as "raceDateTime",
          rr.runner_comment as comment, c.display_name as "courseName", r.race_name as "raceName", r.race_type as "raceType", r.going,
          si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface
        from targets t join race_runners rr on rr.horse_id = t.horse_id
        join races r on r.id = rr.race_id and r.race_datetime < t.cutoff
        join courses c on c.id = r.course_id
        left join source_imports si on si.source = r.source and si.source_id = r.source_id and si.source_type = 'full-result-next-data'
        where r.source = 'sporting_life' and rr.source = 'sporting_life'
          and (rr.result_status is not null or rr.finishing_position is not null)
          and lower(coalesce(rr.result_status, '')) not in ('non_runner','abandoned','cancelled','canceled','no_race','race_void','void','void_race')
        order by rr.horse_id, r.race_datetime
      `;
            for (const r of result) {
                const runs = history.get(r.horseId) ?? [];
                runs.push({
                    raceId: r.raceId, raceDate: r.raceDate, raceDateTime: new Date(r.raceDateTime), comment: r.comment ?? "", aw: isSupportedAllWeatherRace(r)
                });
                history.set(r.horseId, runs);
            }
            console.log(`Historical metadata: ${Math.min(start + 500, entries.length)}/${entries.length} horses, ${[...history.values()].reduce((n, r) => n + r.length, 0)} runs`);
        }
        // Field counts verify cache completeness without recalculating a single rating.
        const raceIds = [...new Set(rows.map((r) => r.features.targetRaceId))];
        const counts = await client<Array<{
            raceId: string;
            count: number;
        }>> `
      select race_id as "raceId", count(*)::int as count from race_runners
      where race_id = any(${raceIds}::uuid[]) and source = 'sporting_life'
        and lower(coalesce(result_status, '')) not in ('non_runner','abandoned','cancelled','canceled','no_race','race_void','void','void_race')
      group by race_id
    `;
        const countMap = new Map(counts.map((r) => [r.raceId, r.count]));
        for (const [raceId, group] of groupBy(rows, (r) => r.features.targetRaceId)) {
            if (countMap.get(raceId) !== group.filter((r) => !isVoidBetResultStatus(r.outcome.resultStatus)).length)
                throw new Error(`Cache/DB starter count differs: ${raceId}`);
        }
        return history;
    }
    finally {
        await client.end();
    }
}
export function baselineOrder(group: Example[], name: string) {
    if (name === "AW_D_V1" || name === "AW_A_V1") {
        const inputs = group.map((e) => ({
            runnerId: id(e), resultStatus: e.row.outcome.resultStatus, averageAwSpeedLast3: e.row.features.averageAwSpeedLast3, trainerPriorStrikeRate: e.row.features.trainerPriorWinRate, jockeyPriorStrikeRate: e.row.features.jockeyPriorWinRate ?? null
        }));
        const ratings = calculateAwRaceRatings(inputs);
        if (name === "AW_D_V1" && calculateAwDRatingCoverage(inputs, ratings).ratingCoverageStatus !== "eligible")
            return [];
        const score = (e: Example) => { const r = ratings.get(id(e)); return (name === "AW_D_V1" ? r?.awD : r?.awA)?.score ?? null; };
        return ordered(group.filter((e) => score(e) !== null), (e) => -score(e)!);
    }
    const getter = name === "Average L3 AW Speed" ? (f: Features) => f.averageAwSpeedLast3 : name === "Trainer SR" ? (f: Features) => f.trainerPriorWinRate : name === "Jockey SR" ? (f: Features) => f.jockeyPriorWinRate ?? null : (f: Features) => f.officialRating;
    return ordered(group.filter((e) => getter(e.row.features) !== null), (e) => getter(e.row.features)!);
}
const BASELINES = ["AW_D_V1", "AW_A_V1", "Average L3 AW Speed", "Trainer SR", "Jockey SR", "OR"];
function calibration(examples: Example[], candidate: Candidate) {
    return table(["Band", "Runners", "Mean predicted", "Actual strike", "Actual - predicted"], BANDS.map(([label, lo, hi]) => {
        const rows = examples.filter((e) => probability(e, candidate) >= lo && probability(e, candidate) < hi);
        const mean = average(rows.map((e) => probability(e, candidate))), actual = average(rows.map((e) => e.won ? 1 : 0));
        return [label, rows.length, pct(mean), pct(actual), pct(actual - mean)];
    }));
}
function ranking(examples: Example[], candidate: Candidate, year: string) {
    const groups = [...groupBy(examples, (e) => e.raceId).values()];
    return BASELINES.map((name) => {
        const available = groups.map((g) => ({ g, ranked: baselineOrder(g, name) })).filter(({ ranked }) => ranked.length >= 2);
        const capture = (n: number) => average(available.map(({ ranked }) => ranked.slice(0, n).some((e) => e.won) ? 1 : 0));
        const tissue = (n: number) => average(available.map(({ g }) => ordered(g, (e) => probability(e, candidate)).slice(0, n).some((e) => e.won) ? 1 : 0));
        const associations = available.map(({ ranked }) => {
            const finishers = ranked.filter((e) => e.row.outcome.finishingPosition !== null);
            return correlation(finishers.map((e) => ranked.indexOf(e) + 1), finishers.map((e) => e.row.outcome.finishingPosition!));
        }).filter(Number.isFinite);
        return [
            year, name, available.length, available.reduce((sum, { ranked }) => sum + ranked.length, 0), available.filter(({ ranked, g }) => ranked.length === g.length).length, pct(capture(1)), pct(capture(2)), pct(capture(3)), pct(tissue(1)), pct(tissue(2)), pct(tissue(3)), fmt(average(associations))
        ];
    });
}
function correlation(a: number[], b: number[]) {
    const ma = average(a), mb = average(b);
    const cross = a.reduce((sum, v, i) => sum + (v - ma) * (b[i]! - mb), 0);
    return cross / Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0));
}
function agreement(examples: Example[], candidate: Candidate) {
    const groups = [...groupBy(examples, (e) => e.raceId).values()].map((g) => ({ g, aw: baselineOrder(g, "AW_D_V1"), tissue: ordered(g, (e) => probability(e, candidate)) })).filter(({ aw }) => aw.length >= 2);
    return [true, false].map((agree) => {
        const rows = groups.filter(({ aw, tissue }) => (id(aw[0]!) === id(tissue[0]!)) === agree);
        const t = rows.map(({ tissue }) => tissue[0]!), a = rows.map(({ aw }) => aw[0]!);
        return [
            agree ? "Agree" : "Disagree", rows.length, pct(average(t.map((e) => e.won ? 1 : 0))), pct(average(a.map((e) => e.won ? 1 : 0))), pct(average(rows.map(({ tissue, aw }) => tissue[0]!.won || aw[0]!.won ? 1 : 0))), ...marketSummary(t), ...marketSummary(a)
        ];
    });
}
function marketSummary(examples: Example[]) {
    const priced = examples.flatMap((e) => { const settlement = settleSelection(e.row.outcome); return settlement ? [{ e, settlement }] : []; });
    const expected = priced.reduce((sum, r) => sum + 1 / r.settlement.settlementOddsDecimal, 0);
    return [
        priced.length, fmt(priced.filter((r) => r.e.won).length / expected), pct(priced.reduce((sum, r) => sum + r.settlement.profitLoss, 0) / priced.length)
    ];
}
function coverage(label: string, p: Population) {
    const groups = [...groupBy(p.examples, (e) => e.raceId).values()];
    const rows: Array<Array<string | number>> = [
        [
            label, "all eligible", p.examples.length, p.examples.filter((e) => e.won).length, pct(1), groups.length, groups.length, groups.length
        ]
    ];
    for (const band of ["0", "1", "2", "3+"]) {
        const subset = p.examples.filter((e) => historyBand(e) === band);
        rows.push([
            label, `${band} prior AW starts`, subset.length, subset.filter((e) => e.won).length, pct(subset.length ? 1 : NaN), new Set(subset.map((e) => e.raceId)).size, "-", "-"
        ]);
    }
    return rows;
}
function historyBand(e: Example) { return e.priorAwStarts >= 3 ? "3+" : String(e.priorAwStarts); }
function zeroHistory(label: string, examples: Example[]) {
    const rows = examples.filter((e) => e.priorAwStarts === 0);
    return [
        label, rows.length, rows.filter((e) => e.won).length, pct(average(rows.map((e) => e.won ? 1 : 0))), pct(rows.filter((e) => e.won).length / examples.filter((e) => e.won).length), pct(average(rows.map((e) => e.row.features.trainerPriorWinRate !== null ? 1 : 0))), pct(average(rows.map((e) => e.row.features.jockeyPriorWinRate != null ? 1 : 0))), pct(average(rows.map((e) => e.row.features.officialRating !== null ? 1 : 0))), pct(average(rows.map((e) => e.priorComments.length > 0 ? 1 : 0)))
    ];
}
function distance(e: Example) {
    const yards = e.row.features.distanceYards;
    return yards === null ? "unknown" : yards <= 1540 ? "sprint (<=7f)" : yards <= 2640 ? "middle (>7-12f)" : "staying (>12f)";
}
function contextRows(examples: Example[], candidate: Candidate, year: string, supportedCourses: Set<string>) {
    const dimensions: Array<[
        string,
        (e: Example) => string
    ]> = [
        ["distance", distance], ["handicap", (e) => classifyHandicapStatus(e.row.features)], [
            "course", (e) => supportedCourses.has(e.row.features.courseName) ? e.row.features.courseName : "other (<100 development races)"
        ]
    ];
    return dimensions.flatMap(([dimension, get]) => [...groupBy(examples, get)].map(([band, rows]) => {
        const groups = [...groupBy(rows, (e) => e.raceId).values()];
        const uniform = average(groups.map((g) => Math.log(g.length)));
        const q = quality(rows, candidate);
        return [dimension, ...metricRow(year, band, q), fmt(uniform), fmt(uniform - q.logLoss)];
    }));
}

function historyCalibration(examples: Example[], candidate: Candidate, year: string) {
    return ["0", "1", "2", "3+"].map((band) => {
        const rows = examples.filter((e) => historyBand(e) === band);
        return [year, band, rows.length, rows.filter((e) => e.won).length,
            pct(average(rows.map((e) => probability(e, candidate)))),
            pct(average(rows.map((e) => e.won ? 1 : 0))),
            fmt(average(rows.map((e) => (probability(e, candidate) - (e.won ? 1 : 0)) ** 2)))];
    });
}
async function protectedHashes() {
    const files = (await readdir("data/research")).filter((f) => /forward|tissue-model|rules/.test(f));
    return Object.fromEntries(await Promise.all(files.map(async (f) => [f, createHash("sha256").update(await readFile(join("data/research", f))).digest("hex")])));
}
function assertCache(cache: LoadedBacktestFeatureCache, year: string) {
    const m = cache.manifest;
    if (m.featureSchemaVersion !== "backtest_features_v4" || m.sourceFeatureVersion !== "historical_target_metrics_v4" || m.calculationVersions.awSpeed !== AW_SPEED_RATING_CALCULATION_VERSION || m.source !== "sporting_life" || m.family !== "all_weather_flat" || m.from !== `${year}-01-01`)
        throw new Error(`Incompatible ${year} AW cache`);
    if (cache.rows.some((r) => !r.features.raceDate.startsWith(year)))
        throw new Error("Year split mismatch");
}
async function main() {
    const before = await protectedHashes();
    const [trainCache, testCache] = await Promise.all([
        loadLatestBacktestFeatureCacheForYear({ year: "2025", family: "all_weather_flat" }), loadLatestBacktestFeatureCacheForYear({ year: "2026", family: "all_weather_flat" })
    ]);
    if (!trainCache || !testCache)
        throw new Error("Authoritative AW caches required");
    assertCache(trainCache, "2025");
    assertCache(testCache, "2026");
    console.log(`Authoritative cache rows: 2025=${trainCache.rows.length}, 2026=${testCache.rows.length}; no pipeline rebuild`);
    const history = await loadHistory([...trainCache.rows, ...testCache.rows]);
    const train = buildPopulation(trainCache.rows, history), test = buildPopulation(testCache.rows, history);
    console.log(`Eligible: 2025=${groupBy(train.examples, (e) => e.raceId).size} races/${train.examples.length} runners; 2026=${groupBy(test.examples, (e) => e.raceId).size} races/${test.examples.length} runners`);
    const early = train.examples.filter((e) => e.row.features.raceDate < "2025-10-01").map((e) => ({ ...e, probabilities: {} }));
    const validation = train.examples.filter((e) => e.row.features.raceDate >= "2025-10-01").map((e) => ({ ...e, probabilities: {} }));
    if (!early.length || !validation.length)
        throw new Error("2025 chronological validation unavailable");
    const internal: Partial<Record<Candidate, ReturnType<typeof quality>>> = {};
    const models: Partial<Record<Candidate, Model>> = {};
    for (const candidate of CANDIDATES) {
        console.log(`Fitting ${candidate}: 2025 internal then full development, ${EPOCHS} deterministic epochs each`);
        predict(validation, candidate, fit(early, candidate));
        internal[candidate] = quality(validation, candidate);
        models[candidate] = fit(train.examples, candidate);
        predict(train.examples, candidate, models[candidate]!);
    }
    const nomination = [...CANDIDATES].sort((a, b) => internal[a]!.logLoss - internal[b]!.logLoss || internal[a]!.brier - internal[b]!.brier)[0]!;
    const specification = {
        commentPatterns: Object.fromEntries(Object.entries(COMMENT_PATTERNS).map(([name, pattern]) => [name, { source: pattern.source, flags: pattern.flags }])),
        featureDefinitions: Object.fromEntries(FULL.map(([name]) => [name, featureDefinition(name)])),
        schema: SCHEMA, candidates: Object.fromEntries(CANDIDATES.map((c) => [c, featureNames(c)])), epochs: EPOCHS, l2: L2, learningRate: ".12/sqrt(1+epoch/10)", missingValues: "2025 available-value mean imputation plus missingness flags", normalization: "race_softmax", comments: "existing Turf phrase flags, latest and last-three counts; strictly earlier race datetime", nomination: "lowest 2025 Q4 validation log loss; Brier tie-break", course: "omitted; audit only", settlement: CANONICAL_SETTLEMENT_VERSION, speed: AW_SPEED_RATING_CALCULATION_VERSION
    };
    const checksum = createHash("sha256").update(JSON.stringify({ specification, nomination, models })).digest("hex");
    await writeFile(ARTIFACT, `${JSON.stringify({
        diagnosticOnly: true, checksum, nomination, specification, models, cacheManifests: [trainCache.manifest, testCache.manifest], internal
    }, null, 2)}\n`);
    for (const candidate of CANDIDATES)
        predict(test.examples, candidate, models[candidate]!);
    const frozen = test.examples.map((e) => ({
        raceId: e.raceId, runnerId: id(e), raceDate: e.row.features.raceDate, probabilities: e.probabilities
    }));
    const predictionChecksum = createHash("sha256").update(JSON.stringify(frozen)).digest("hex");
    await writeFile(PREDICTIONS, `${JSON.stringify({ schema: SCHEMA, modelChecksum: checksum, predictionChecksum, rows: frozen }, null, 2)}\n`);
    // All market descriptions occur only after parameters and holdout predictions are frozen.
    const lines = buildReport({ train, test, trainCache, testCache, internal, nomination, models, checksum, predictionChecksum });
    const after = await protectedHashes();
    if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Protected research artifacts changed during diagnostic");
    lines.push("## Mutation audit", "", `SHA-256 unchanged for ${Object.keys(before).length} existing forward/rule/model files. Diagnostic outputs are confined to /tmp; no SQL writes or historical pipeline rebuilds.`, "");
    await writeFile(REPORT, `${lines.join("\n")}\n`);
    console.log(`Wrote ${REPORT}; nomination ${nomination}; checksum ${checksum}`);
    for (const candidate of CANDIDATES)
        console.log(JSON.stringify({ candidate, holdout: quality(test.examples, candidate) }));
}
function buildReport(input: {
    train: Population;
    test: Population;
    trainCache: LoadedBacktestFeatureCache;
    testCache: LoadedBacktestFeatureCache;
    internal: Partial<Record<Candidate, ReturnType<typeof quality>>>;
    nomination: Candidate;
    models: Partial<Record<Candidate, Model>>;
    checksum: string;
    predictionChecksum: string;
}) {
    const { train, test, nomination, models, internal } = input;
    const samples = [["2025 train-fit", train.examples], ["2026 holdout", test.examples]] as const;
    const n = quality(test.examples, "AW-T0"), c = quality(test.examples, "AW-T1"), chosen = quality(test.examples, nomination);
    const bestHoldout = [...CANDIDATES].sort((a, b) => quality(test.examples, a).logLoss - quality(test.examples, b).logLoss)[0]!;
    const replicatedComments = internal["AW-T1"]!.logLoss < internal["AW-T0"]!.logLoss && internal["AW-T1"]!.brier < internal["AW-T0"]!.brier && c.logLoss < n.logLoss && c.brier < n.brier;
    const courseGroups = groupBy(train.examples, (e) => e.row.features.courseName);
    const supportedCourses = new Set([...courseGroups].filter(([, rows]) => groupBy(rows, (e) => e.raceId).size >= 100).map(([name]) => name));
    const lines = [
        "# All Weather Tissue Stage 1", "", `Generated ${new Date().toISOString()}. Diagnostic research only. Model selection uses 2025 validation; 2026 is a single untouched holdout. No ROI optimisation.`, "", "## Population and chronology", ""
    ];
    lines.push(...table([
        "Sample", "Cache rows", "AW races", "Starters", "Eligible races", "Eligible runners", "Actual dates", "Cache generated"
    ], [["2025 development", train, input.trainCache], ["2026 holdout", test, input.testCache]].map((entry) => {
        const [label, population, cache] = entry as [
            string,
            Population,
            LoadedBacktestFeatureCache
        ];
        return [
            label, cache.manifest.rowCount, population.inputRaces, population.starters, groupBy(population.examples, (e) => e.raceId).size, population.examples.length, `${cache.actualCoverage?.actualFrom} to ${cache.actualCoverage?.actualTo}`, cache.manifest.generatedAt
        ];
    })));
    lines.push("Inputs: `backtest_features_v4`, `historical_target_metrics_v4`, `aw_speed_v1`, AW-family `weight_performance_v1`, `canonical_settlement_v2`. Complete fields are verified against cached actual starter count and bounded current DB starter counts. Actual field size is used only for eligibility, never as a predictor. All started non-finishers remain losses under the canonical settlement function, independent of whether SP exists. Dead-heat/multi-winner races are excluded because this single-winner conditional logit assumes one winner.", "", ...table(["Year", "Race exclusion", "Races"], [["2025", train], ["2026", test]].flatMap((entry) => {
        const [year, p] = entry as [
            string,
            Population
        ];
        return [...p.excluded].map(([reason, count]) => [year, reason, count]);
    })), "Chronology: cached ratings and trainer/jockey rates are target-time prior-only. Historical metadata is queried only for target horses before their latest target time, then filtered again per target: prior datetime strictly less than target, target race ID excluded. Comments from both earlier Turf and AW runs use the existing representation. No target/future comments, SP, odds, market rank, favourite status or finish-derived predictors enter vectors. Retrospective comments are chronology-safe by race time; the DB does not prove that the text existed unchanged before the target, so forward recording is required for operational replication.", "", "No compatible authoritative 2024 AW feature cache exists. Earlier walk-forward validation was omitted without reconstruction. An additional 2025 Jan-Sep -> Oct-Dec split nominates a candidate without consulting 2026. The available 2026 cache ends before today; this report does not claim coverage through 2 October.", "", "## Feature definitions and architecture", "", `Versioned feature schema: ${SCHEMA}. AW-T0 uses the full numeric list below; AW-T1 adds the existing ${COMMENT_FEATURE_NAMES.length} comment features; AW-T2 uses only the seven core values.`, "", ...table(["Feature", "Reduced core", "Definition"], FULL.map(([name]) => [name, CORE.some(([n]) => n === name) ? "yes" : "no", featureDefinition(name)])), "Same broad family as Turf Tissue: conditional-logit runner scores normalised by race softmax to a 100% book. AW parameters are trained independently, with available-value training-mean imputation, matching missingness flags, training-only standardisation, zero-initialised coefficients, 90 deterministic batch-gradient epochs and L2=0.02. No neural network, interaction engineering, price training or hyperparameter search.", "", "Pure race-level context (declared field size, class, distance and handicap) is constant within a race and cancels from softmax. It has zero discriminatory effect in this architecture; it is retained transparently in the schema, not claimed as useful signal. Context is audited in fixed groups below. Course categorical effects would also cancel; no course-specific model is created. Draw and age are already canonical. Weight and Turf-only predictors were deliberately omitted from this prespecified AW set.", "", "Prior AW starts count supported, started AW races in the loaded source history, including non-finishers, not merely races with usable speed. It is a source-history count, not a guaranteed complete lifetime count. Cached L3 speed/performance follow canonical last-three prior-run window semantics; missing AW ratings are not rebuilt or replaced.", "", `Comments: prior-comment count (max 3), most recent flags and last-three counts: ${COMMENT_FEATURE_NAMES.join(", ")}. Phrase patterns are reused unchanged from the existing diagnostic module.`, "", "## Candidate nomination and probability quality", "", ...table(metricHeaders, CANDIDATES.map((candidate) => metricRow("2025 Q4 chronological validation", candidate, internal[candidate]!))), `Development-only nominee: **${nomination}**, lowest 2025 Q4 log loss, with Brier as deterministic tie-break. All three candidates then refit using all 2025. Best 2026 log loss is **${bestHoldout}**; this does not alter the development nomination.`, "", ...table(metricHeaders, samples.flatMap(([year, rows]) => CANDIDATES.map((candidate) => metricRow(year, candidate, quality(rows, candidate))))), "Log loss is mean negative log probability of the single winner per race. Brier is mean race sum of runner squared errors. Top-k chooses exactly k runners (or the whole smaller field), ties resolved by runner UUID. These are race-weighted capture measures. Train-fit performance is descriptive and optimistic.", "");
    lines.push(...table(["Sample", "Uniform log loss", "Uniform race Brier"], samples.map(([year, rows]) => {
        const groups = [...groupBy(rows, (e) => e.raceId).values()];
        return [
            year, fmt(average(groups.map((g) => Math.log(g.length)))), fmt(average(groups.map((g) => 1 - 1 / g.length)))
        ];
    })));
    lines.push("## Calibration", "");
    for (const [year, rows] of samples)
        for (const candidate of CANDIDATES)
            lines.push(`### ${year}: ${candidate}`, "", ...calibration(rows, candidate));
    lines.push("## Ranking comparisons", "", "AW-D/A use the existing production calculation functions without modification; the existing AW-D minimum two rated runners and 20% coverage guard is applied. Other baselines require at least two rated runners. Each comparison uses the same races for Tissue and baseline; missing baseline runners stay in the Tissue field and can still win. Exact top-k with UUID tie breaks gives comparable selection counts; it differs from betting every tied rank 1. Races/coverage differ across comparators. Rank/finish association is mean within-race Pearson correlation of selection order against finish position among classified finishers; non-finishers remain losses for strike/capture but have no numeric finish association. Rank-only baselines do not provide calibrated probabilities, so their log loss/Brier are undefined; no arbitrary rank-to-probability mapping is fabricated.", "", ...table([
        "Year", "Baseline", "Comparable races", "Rated runners", "Complete fields", "Baseline top1", "Baseline top2", "Baseline top3", `${nomination} top1`, "Tissue top2", "Tissue top3", "Mean rank/finish r"
    ], samples.flatMap(([year, rows]) => ranking(rows, nomination, year))), "## Comments contribution", "", ...table(["Sample", "Log loss delta", "Brier delta", "Top1 delta", "Top2 delta", "Top3 delta"], [["2025 Q4", internal["AW-T0"]!, internal["AW-T1"]!], ["2026", n, c]].map((entry) => {
        const [year, a, b] = entry as [
            string,
            ReturnType<typeof quality>,
            ReturnType<typeof quality>
        ];
        return [
            year, fmt(b.logLoss - a.logLoss), fmt(b.brier - a.brier), pct(b.top1 - a.top1), pct(b.top2 - a.top2), pct(b.top3 - a.top3)
        ];
    })), `Comments ${replicatedComments ? "improve both probability metrics in 2025 internal validation and 2026 holdout" : "do not improve both probability metrics in both chronological checks"}. This is evidence from two time periods, not a causal statement or independent multi-year replication. No comment phrase was selected using 2026.`, "", ...table(["Year", "With >=1 prior comment", "With 3 prior comments"], samples.map(([year, rows]) => [
        year, pct(average(rows.map((e) => e.priorComments.length > 0 ? 1 : 0))), pct(average(rows.map((e) => e.priorComments.length === 3 ? 1 : 0)))
    ])), "## Coverage", "", ...table([
        "Year", "Group", "Eligible runners", "Winners", "Prediction coverage", "Races with prediction", "Complete prediction fields", "Near complete (>=90%)"
    ], [...coverage("2025", train), ...coverage("2026", test)]), "All candidates predict every starter in each eligible field through native missing-value handling. This is not an implemented separate zero-history fallback. Prediction coverage is 100% of eligible runners, not 100% of all input rows; incomplete/unresolved races are excluded. Complete fields are also counted in the inclusive >=90% column. AW-D coverage is lower and is shown independently in ranking comparisons.", "", "## Zero-history analysis", "", ...table([
        "Year", "Zero-history runners", "Winners", "Strike", "Share of all winners", "Trainer SR coverage", "Jockey SR coverage", "OR coverage", "Comment coverage"
    ], samples.map(([year, rows]) => zeroHistory(year, rows))), ...table(["Year", "Feature", "Zero-history available", "All runners available"], samples.flatMap(([year, rows]) => FULL.map(([name, get]) => {
        const zero = rows.filter((e) => e.priorAwStarts === 0);
        return [
            year, name, pct(average(zero.map((e) => get(e.row.features, e.priorAwStarts) != null ? 1 : 0))), pct(average(rows.map((e) => get(e.row.features, e.priorAwStarts) != null ? 1 : 0)))
        ];
    }))), ...table(["Year", "Prior AW starts", "Runners", "Winners", "Mean predicted", "Actual strike", "Runner Brier"], samples.flatMap(([year, rows]) => historyCalibration(rows, nomination, year))), "History-group metrics are runner-level: each subgroup retains its original full-field probabilities. Race log loss, race Brier and top-k are not computed on partial history subfields.", "", "Zero prior AW starts does not necessarily mean debutant: earlier Turf history/comments may remain. Source-history incompleteness can also produce zero. A separate fallback is a later research question; no fallback model or rating was implemented.", "", "## Fixed context stability", "", `Quality below is for development-nominated ${nomination}. Courses require >=100 development races, chosen without holdout results; smaller courses are pooled. Distances: sprint <=7f, middle >7f to 12f, staying >12f. All context labels are pre-race metadata. Small groups are descriptive and do not justify specialist models. Gain versus uniform accounts for field size, but remaining subtype/course differences also reflect composition; raw log loss alone does not isolate model weakness.`, "", ...table(["Dimension", ...metricHeaders, "Uniform log loss", "Gain versus uniform"], samples.flatMap(([year, rows]) => contextRows(rows, nomination, year, supportedCourses))), "## Numeric redundancy and coefficient stability", "", "Pairwise complete-case Pearson correlations; availability/sample counts are shown. Correlated coefficients are conditional associations, not individual causal importance.", "");
    const pairs: Array<[
        string,
        string
    ]> = [
        ["avg_l3_aw_speed", "best_l3_aw_speed"], ["avg_l3_aw_speed", "official_rating"], ["trainer_prior_rate", "jockey_prior_rate"], ["avg_l3_aw_speed", "trainer_prior_rate"], ["avg_l3_aw_speed", "jockey_prior_rate"]
    ];
    lines.push(...table(["Year", "A", "B", "Pairs", "Pearson r"], samples.flatMap(([year, rows]) => pairs.map(([a, b]) => {
        const ga = FULL.find(([name]) => name === a)![1], gb = FULL.find(([name]) => name === b)![1];
        const values = rows.map((e) => [ga(e.row.features, e.priorAwStarts), gb(e.row.features, e.priorAwStarts)]).filter((v): v is [
            number,
            number
        ] => v[0] !== null && v[1] !== null);
        return [year, a, b, values.length, fmt(correlation(values.map((v) => v[0]), values.map((v) => v[1])))];
    }))));
    const half = train.examples.filter((e) => e.row.features.raceDate < "2025-07-01");
    const late = train.examples.filter((e) => e.row.features.raceDate >= "2025-07-01");
    const a = fit(half, nomination), b = fit(late, nomination), model = models[nomination]!;
    lines.push("2025 H1/H2 fits audit coefficient direction within development; 2026 is not refitted. Values are per training-standard-deviation; half-year scales differ, so magnitude differences are approximate. Constant race context and constant missingness flags are non-identifiable and remain zero. Feature distributions/availability below audit the 2026 shift without tuning.", "", ...table(["Feature", "2025 full coefficient", "H1 coefficient", "H2 coefficient", "Same nonzero sign"], model.names.map((name, j) => [
        name, fmt(model.weights[j]!), fmt(a.weights[j]!), fmt(b.weights[j]!), Math.abs(a.weights[j]!) > 1e-8 && Math.abs(b.weights[j]!) > 1e-8 ? Math.sign(a.weights[j]!) === Math.sign(b.weights[j]!) ? "yes" : "no" : "not identified"
    ])), ...table(["Feature", "2025 n", "2025 mean", "2026 n", "2026 mean"], FULL.map(([name, get]) => {
        const av = train.examples.flatMap((e) => { const v = get(e.row.features, e.priorAwStarts); return v === null ? [] : [v]; });
        const bv = test.examples.flatMap((e) => { const v = get(e.row.features, e.priorAwStarts); return v === null ? [] : [v]; });
        return [name, av.length, fmt(average(av)), bv.length, fmt(average(bv))];
    })), "## AW-D agreement and secondary market descriptions", "", `For ${nomination}, leaders are resolved with the same deterministic UUID tie convention. Winner capture is the union of the two leaders; agreeing groups necessarily have equal strikes. Final SP descriptions are uncapped canonical settlement, after prediction freeze; A/E is priced actual winners / sum(1/SP), with overround retained. No forward edge or rule is created.`, "", ...table([
        "Group", "Races", "Tissue strike", "AW-D strike", "Either leader winner", "Tissue priced", "Tissue A/E", "Tissue ROI", "AW-D priced", "AW-D A/E", "AW-D ROI"
    ], agreement(test.examples, nomination)), "## Conclusions and Stage 2", "");
    const uniform = average([...groupBy(test.examples, (e) => e.raceId).values()].map((g) => Math.log(g.length)));
    const awGroups = [...groupBy(test.examples, (e) => e.raceId).values()].filter((g) => baselineOrder(g, "AW_D_V1").length >= 2);
    const awStrike = average(awGroups.map((g) => baselineOrder(g, "AW_D_V1")[0]!.won ? 1 : 0));
    const tissueStrike = average(awGroups.map((g) => ordered(g, (e) => probability(e, nomination))[0]!.won ? 1 : 0));
    const high = test.examples.filter((e) => probability(e, nomination) >= .3);
    const highP = average(high.map((e) => probability(e, nomination))), highActual = average(high.map((e) => e.won ? 1 : 0));
    const calibrationError = BANDS.reduce((sum, [, lo, hi]) => {
        const rows = test.examples.filter((e) => probability(e, nomination) >= lo && probability(e, nomination) < hi);
        return rows.length ? sum + rows.length / test.examples.length * Math.abs(average(rows.map((e) => probability(e, nomination))) - average(rows.map((e) => e.won ? 1 : 0))) : sum;
    }, 0);
    lines.push(`1. ${chosen.logLoss < uniform ? "Yes, enough market-independent signal exists to justify a separate AW Tissue research model" : "The nominated model does not beat the uniform probability reference; Stage 2 needs further development validation"}. Holdout log loss ${fmt(chosen.logLoss)} versus uniform ${fmt(uniform)}. This is probability/ranking evidence, not a profitable betting-rule finding.`, `2. Best 2026 holdout log loss: ${bestHoldout} (${fmt(quality(test.examples, bestHoldout).logLoss)}; Brier ${fmt(quality(test.examples, bestHoldout).brier)}). Development-only nominee remains ${nomination}.`, `3. Comments ${replicatedComments ? "add replicated directional value across the two chronological checks" : "do not establish replicated probability value"}; 2026 log-loss delta ${fmt(c.logLoss - n.logLoss)}, Brier delta ${fmt(c.brier - n.brier)}. Top-k changes are tabulated separately.`, `4. On ${awGroups.length} common eligible AW-D races: ${nomination} top1 ${pct(tissueStrike)} versus AW-D ${pct(awStrike)}. Full top2/top3 and rated-field coverage comparisons are above.`, `5. Calibration is suitable for shadow research, with prospective confirmation required before production use. Fixed-band weighted absolute error ${pct(calibrationError)}; 30%+ band ${high.length} runners, mean prediction ${pct(highP)}, actual ${pct(highActual)}. Fixed-band tables expose where probabilities over/understate strike; no 2026 calibration adjustment is fitted.`, `6. Zero-history runners are ${pct(test.examples.filter((e) => e.priorAwStarts === 0).length / test.examples.length)} of the holdout and supply ${pct(test.examples.filter((e) => e.priorAwStarts === 0 && e.won).length / test.examples.filter((e) => e.won).length)} of winners. Structural speed availability remains a serious limitation even though native missingness yields a complete probability book. Separate fallback research may be warranted; it is not part of Stage 1.`, `7. ${chosen.logLoss < uniform ? "Stage 2 should build a prospective shadow AW Tissue tracker" : "Defer a forward tracker until development-only probability quality improves"}, with full-field pre-race feature snapshots, comment text/source timestamps, 100% probability books, eligibility reasons, non-runner handling and immutable prediction time. Production AW-D/A and Forward Value should remain unchanged. No tracker was built here.`, `8. Exact frozen candidate: ${nomination}, ${SCHEMA}, 2025-only parameters in ${ARTIFACT}, SHA-256 ${input.checksum}. Stage 2 should freeze these values and the existing comment parser, use the same canonical AW versions and missingness/normalisation, and pre-register probability, calibration, coverage and top-k monitoring. Do not switch to the 2026 winner or add a fallback/recalibration without a new development-only specification.`, "", "## Reproducibility", "", `Report: ${REPORT}. Diagnostic candidate parameters: ${ARTIFACT}. Frozen 2026 predictions: ${PREDICTIONS}; SHA-256 ${input.predictionChecksum}. All candidates were predefined before fitting; 2026 data was not used for feature, coefficient, hyperparameter, candidate or calibration selection. SQL is SELECT plus a session statement timeout only. Report is cached-population research, not a claim of prospective historical price availability.`, "");
    return lines;
}
function featureDefinition(name: string) {
    const definitions: Record<string, string> = {
        avg_l3_aw_speed: "Canonical AW speed average within last-three prior-run window",
        latest_aw_speed: "Latest available canonical prior AW speed",
        best_l3_aw_speed: "Canonical AW speed maximum within last-three prior-run window",
        avg_l3_aw_performance: "Canonical AW-family weight-performance average in prior L3 window",
        latest_aw_performance: "Latest available canonical AW-family weight-performance",
        trainer_prior_rate: "Prior-only trainer wins / starts, canonical cache rate",
        jockey_prior_rate: "Prior-only jockey wins / starts, canonical cache rate",
        declared_field_size: "Pre-race declaredRunnerCount; never actual/result runner count",
        class: "Number parsed from canonical pre-race raceClass",
        distance_furlongs: "Canonical distanceYards / 220",
        handicap: "Existing classifyHandicapStatus; unknown is missing",
        official_rating: "Target pre-race Official Rating",
        prior_aw_starts: "Count supported source AW starters strictly before target datetime",
        age: "Canonical target horseAge",
        draw: "Canonical target pre-race draw",
        days_since_run: "Canonical prior-only daysSinceLastRun",
    };
    return definitions[name]!;
}
if (process.argv[1]?.endsWith("diagnose-aw-tissue-stage1.ts"))
    await main();
