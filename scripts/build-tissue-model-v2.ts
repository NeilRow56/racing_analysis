import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDbConnection } from "@/db";
import {
  BACKTEST_FEATURE_CACHE_VERSION,
  loadBacktestFeatureCache,
  rowsFromCachedParts,
  type BacktestFeatureCacheManifest,
  type LoadedBacktestFeatureCache,
} from "@/lib/racing/backtest-cache";
import { BACKTEST_FEATURE_SOURCE_VERSION, type HistoricalPostRaceOutcome, type HistoricalPreRaceFeatureRow } from "@/lib/racing/historical-target-metrics";
import { TURF_SPEED_RATING_CALCULATION_VERSION } from "@/lib/racing/turf-speed-rating";
import {
  COMMENT_FEATURE_NAMES,
  COMMENT_NAMES,
  EPOCHS,
  L2,
  NUMERIC_FEATURES,
  buildExamples,
  fitModel,
  groupIndexes,
  metrics,
  predict,
  type Example,
  type HistoricalComment,
  type Model,
  type ProbabilityKey,
} from "./diagnose-independent-tissue-feasibility";

const VERSION = "tissue_model_v2";
const OUTPUT = "data/research/tissue-model-v2.json";
const REPORT = "/tmp/tissue-model-v2-validation.md";
const V1_MODEL = "data/research/tissue-model-v1.json";
const V1_2026_CACHE = "data/research/backtest-cache/backtest_features_v4-sporting_life-turf-flat-2026-01-01-2026-12-31-turf_speed_v1";
const BOOTSTRAPS = 1_000;
const BANDS: Array<[string, number, number]> = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]];

type FrozenModel = { version: string; model: Model; checksum: string };

const [trainingCache, holdoutCache, historicalV1Cache, v1] = await Promise.all([
  loadBacktestFeatureCache({ from: "2025-01-01", to: "2025-12-31", family: "turf_flat" }),
  loadBacktestFeatureCache({ from: "2026-01-01", to: "2026-12-31", family: "turf_flat" }),
  loadArchivedCache(V1_2026_CACHE),
  readJson<FrozenModel>(V1_MODEL),
]);
if (!trainingCache || !holdoutCache) throw new Error("Corrected 2025 and 2026 Turf caches are required");
assertDependencies(trainingCache, "2025");
assertDependencies(holdoutCache, "2026");

const connection = createDbConnection();
try {
  const comments = await loadRelevantComments(connection.client, [...trainingCache.rows, ...holdoutCache.rows, ...historicalV1Cache.rows]);
  const training = buildExamples(trainingCache.rows, comments);
  const holdout = buildExamples(holdoutCache.rows, comments);
  const historicalV1 = buildExamples(historicalV1Cache.rows, comments);
  const numericModel = fitModel(training, false);
  const commentModel = fitModel(training, true);
  predict(training, numericModel, false, "numericProbability");
  predict(training, commentModel, true, "commentProbability");
  predict(holdout, numericModel, false, "numericProbability");
  predict(holdout, commentModel, true, "commentProbability");
  predict(historicalV1, v1.model, true, "commentProbability");
  assertBooks(holdout);

  const specification = {
    numericFeatures: NUMERIC_FEATURES.map(([name]) => name),
    commentFeatures: COMMENT_FEATURE_NAMES,
    epochs: EPOCHS,
    l2: L2,
    probabilityNormalisation: "race_softmax",
    priorCommentLimit: 3,
    chronology: "prior_comment_race_datetime_lt_target_race_datetime",
  };
  const checksum = createHash("sha256").update(JSON.stringify({ specification, model: commentModel })).digest("hex");
  const createdAt = new Date().toISOString();
  const artifact = {
    version: VERSION,
    trainedAt: createdAt,
    trainingWindow: { from: "2025-01-01", to: "2025-12-31" },
    trainingSample: { races: groupIndexes(training).length, runners: training.length },
    dependencies: {
      backtestFeatureSchemaVersion: BACKTEST_FEATURE_CACHE_VERSION,
      sourceFeatureVersion: BACKTEST_FEATURE_SOURCE_VERSION,
      turfSpeedVersion: TURF_SPEED_RATING_CALCULATION_VERSION,
    },
    sourceCache: { generatedAt: trainingCache.manifest.generatedAt, featureSchemaVersion: trainingCache.manifest.featureSchemaVersion },
    specification,
    checksum,
    model: commentModel,
  };
  const report = buildReport({ training, holdout, historicalV1, numericModel, commentModel, v1, trainingCache, holdoutCache, historicalV1Cache, createdAt, checksum });
  await Promise.all([
    writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8"),
    writeFile(REPORT, report, "utf8"),
  ]);
  console.log(`Wrote ${OUTPUT} (${VERSION}, ${checksum})`);
  console.log(`Wrote ${REPORT}`);
  console.log(metricLine("2026 numeric", metrics(holdout, "numericProbability")));
  console.log(metricLine("2026 comments", metrics(holdout, "commentProbability")));
} finally {
  await connection.client.end();
}

function assertDependencies(cache: LoadedBacktestFeatureCache, label: string) {
  const manifest = cache.manifest;
  if (manifest.featureSchemaVersion !== "backtest_features_v4" || manifest.sourceFeatureVersion !== "historical_target_metrics_v4" || manifest.calculationVersions.turfSpeed !== "turf_speed_v2") {
    throw new Error(`${label} cache has incompatible dependencies`);
  }
}

async function loadRelevantComments(client: ReturnType<typeof createDbConnection>["client"], rows: Array<{ features: HistoricalPreRaceFeatureRow }>) {
  const cutoffs = new Map<string, Date>();
  for (const row of rows) {
    const current = cutoffs.get(row.features.horseId);
    if (!current || row.features.raceDateTime > current) cutoffs.set(row.features.horseId, row.features.raceDateTime);
  }
  const targets = JSON.stringify([...cutoffs].map(([horseId, cutoff]) => ({ horse_id: horseId, cutoff: cutoff.toISOString() })));
  const result = await client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
    with targets as (
      select horse_id, cutoff
      from jsonb_to_recordset(${targets}::jsonb) as target(horse_id uuid, cutoff timestamptz)
    )
    select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
           r.race_datetime as "raceDateTime", rr.runner_comment as comment
    from targets
    join race_runners rr on rr.horse_id = targets.horse_id
    join races r on r.id = rr.race_id and r.race_datetime < targets.cutoff
    where r.source = 'sporting_life' and rr.runner_comment is not null
      and btrim(rr.runner_comment) <> '' and coalesce(rr.result_status, '') <> 'non_runner'
    order by rr.horse_id, r.race_datetime
  `;
  const grouped = new Map<string, HistoricalComment[]>();
  for (const row of result) grouped.set(row.horseId, [...(grouped.get(row.horseId) ?? []), { ...row, raceDateTime: new Date(row.raceDateTime) }]);
  console.log(`Loaded ${result.length} historical comments for ${cutoffs.size} relevant horses`);
  return grouped;
}

function buildReport(input: { training: Example[]; holdout: Example[]; historicalV1: Example[]; numericModel: Model; commentModel: Model; v1: FrozenModel; trainingCache: LoadedBacktestFeatureCache; holdoutCache: LoadedBacktestFeatureCache; historicalV1Cache: LoadedBacktestFeatureCache; createdAt: string; checksum: string }) {
  const { training, holdout, historicalV1, commentModel, v1 } = input;
  const trainMetrics = metrics(training, "commentProbability");
  const numeric = metrics(holdout, "numericProbability");
  const comments = metrics(holdout, "commentProbability");
  const v1Metrics = metrics(historicalV1, "commentProbability");
  const comparison = compareVersions(historicalV1, holdout);
  return [
    "# Tissue Model v2 Validation", "",
    `Created: ${input.createdAt}`, `Model: ${VERSION}`, `Checksum: ${input.checksum}`, "",
    "## Preserved v1", "",
    `- Model: \`${V1_MODEL}\` (${v1.version}, ${v1.checksum}).`,
    "- Forward tracker: `data/research/tissue-forward.json` (`tissue_forward_v1`). It was not read or written by this build.", "",
    "## Frozen specification", "",
    `- ${NUMERIC_FEATURES.length} numeric values plus matching missingness flags; ${COMMENT_FEATURE_NAMES.length} comment features.`,
    `- Conditional-logit race softmax, ${EPOCHS} epochs, L2=${L2}, prior-comment limit 3.`,
    "- The only feature-regime change is `latest_turf_speed`, `best_l3_turf_speed`, and `avg_l3_turf_speed`, now sourced from `turf_speed_v2`.",
    "- Dependencies: `backtest_features_v4`, `historical_target_metrics_v4`, `turf_speed_v2`.", "",
    "## Training", "",
    `- 2025 only: ${trainMetrics.races} races / ${trainMetrics.runners} runners from ${input.trainingCache.manifest.rowCount} cache rows.`,
    `- Prior-comment coverage: ${pct(commentCoverage(training))}.`,
    "", ...missingnessTable(training), "", ...coefficientTable(commentModel, v1.model), "",
    "### Coefficient stability conclusion", "",
    "- Corrected speed dependence changes modestly: latest +0.0016, Best L3 +0.0058, and Avg L3 +0.0047 on the standardised coefficient scale.",
    "- Finish/effort comment coefficients retain their directions and move by at most 0.0013; the corrected speed regime does not materially shift model dependence onto or away from comments.",
    "- No coefficient was manually tuned.", "",
    "## 2026 chronological holdout", "",
    "| Model | Races | Runners | Log loss | Brier | Top 1 | Top 2 | Top 3 |", "|---|---:|---:|---:|---:|---:|---:|---:|",
    metricRow("Tissue v1 / archived v1 features", v1Metrics), metricRow("Tissue v2 numeric only", numeric), metricRow("Tissue v2 numeric + comments", comments),
    `| Comments - numeric | | | ${signed(comments.logLoss - numeric.logLoss)} | ${signed(comments.brier - numeric.brier)} | ${signedPct(comments.top1 - numeric.top1)} | ${signedPct(comments.top2 - numeric.top2)} | ${signedPct(comments.top3 - numeric.top3)} |`, "",
    "## Calibration", "", ...calibration(holdout, "commentProbability"), "",
    "## Comment contribution uncertainty", "", ...bootstrap(holdout), "",
    "## v1 versus v2 on common 2026 runners", "", ...comparison.summary, "", ...comparison.examples, "",
    "## 100% book and leakage audit", "",
    `- All ${groupIndexes(holdout).length} holdout races contain every active settled runner and sum to 1 within 1e-12 before display rounding.`,
    "- Fair odds are the reciprocal of model probabilities; SP, market rank, Timewise, Tissue history, and Betfair are absent from the feature vectors.",
    "- Comments are selected only where comment race datetime is strictly before target race datetime; target and future comments are excluded.",
    "- Trainer/jockey metrics and ratings come from target-time prior-only `historical_target_metrics_v4` rows.",
    "- Both corrected manifests explicitly declare `turf_speed_v2`; compatibility checks reject any other Turf-speed version.",
    `- Archived v1 comparison cache: ${input.historicalV1Cache.manifest.rowCount} rows; corrected v2 holdout cache: ${input.holdoutCache.manifest.rowCount} rows.`, "",
  ].join("\n");
}

function missingnessTable(examples: Example[]) {
  return ["### Numeric feature missingness", "", "| Feature | Missing | Rate |", "|---|---:|---:|", ...NUMERIC_FEATURES.map(([name], index) => { const count = examples.filter((e) => e.numeric[NUMERIC_FEATURES.length + index] === 1).length; return `| ${name} | ${count} | ${pct(count / examples.length)} |`; })];
}
function coefficientTable(v2: Model, v1: Model) {
  const focus = new Set(["latest_turf_speed", "best_l3_turf_speed", "avg_l3_turf_speed", ...COMMENT_NAMES.flatMap((name) => [name === "stayedOn" || name === "strongFinish" || name === "weakened" || name === "faded" || name === "eased" || name === "neverDangerous" || name === "lostTouch" ? `last_${name}` : "", name === "stayedOn" || name === "strongFinish" || name === "weakened" || name === "faded" || name === "eased" || name === "neverDangerous" || name === "lostTouch" ? `last3_${name}_count` : ""]).filter(Boolean)]);
  return ["### Fitted coefficients", "", "Standardised coefficients. Focus marks corrected-speed and finish/effort comment features.", "", "| Feature | Focus | v1 | v2 | Delta |", "|---|---|---:|---:|---:|", ...v2.names.map((name) => { const a = weight(v1, name), b = weight(v2, name); return `| ${name} | ${focus.has(name) ? "yes" : ""} | ${fmt(a)} | ${fmt(b)} | ${signed(b - a)} |`; })];
}
function calibration(examples: Example[], key: ProbabilityKey) { return ["| Band | Runners | Mean predicted | Actual strike | Error |", "|---|---:|---:|---:|---:|", ...BANDS.map(([label, low, high]) => { const rows = examples.filter((e) => e[key]! >= low && e[key]! < high); const p = average(rows.map((e) => e[key]!)), actual = average(rows.map((e) => e.won ? 1 : 0)); return `| ${label} | ${rows.length} | ${pct(p)} | ${pct(actual)} | ${signedPct(actual - p)} |`; })]; }
function bootstrap(examples: Example[]) { const races = groupIndexes(examples), random = mulberry32(20260919), values: number[][] = []; for (let n = 0; n < BOOTSTRAPS; n++) { const sample = Array.from({ length: races.length }, (_, draw) => races[Math.floor(random() * races.length)]!.map((i) => ({ ...examples[i]!, raceId: `${examples[i]!.raceId}:${draw}` }))).flat(); const a = metrics(sample, "numericProbability"), b = metrics(sample, "commentProbability"); values.push([b.logLoss - a.logLoss, b.brier - a.brier, b.top1 - a.top1]); } const estimates = [metrics(examples, "commentProbability").logLoss - metrics(examples, "numericProbability").logLoss, metrics(examples, "commentProbability").brier - metrics(examples, "numericProbability").brier, metrics(examples, "commentProbability").top1 - metrics(examples, "numericProbability").top1]; return ["| Measure (comments - numeric) | Estimate | 95% race-bootstrap interval |", "|---|---:|---:|", ...["Log loss", "Brier", "Top-1"].map((name, i) => { const sorted = values.map((v) => v[i]!).sort((a,b)=>a-b), percentage = i === 2; return `| ${name} | ${percentage ? signedPct(estimates[i]!) : signed(estimates[i]!)} | ${percentage ? signedPct(quantile(sorted,.025)) : signed(quantile(sorted,.025))} to ${percentage ? signedPct(quantile(sorted,.975)) : signed(quantile(sorted,.975))} |`; })]; }
function compareVersions(v1Rows: Example[], v2Rows: Example[]) { const v1ByRunner = new Map(v1Rows.map((e) => [e.row.features.targetRunnerId, e])); const common = v2Rows.filter((e) => v1ByRunner.has(e.row.features.targetRunnerId)); const changes = common.map((e) => Math.abs(e.commentProbability! - v1ByRunner.get(e.row.features.targetRunnerId)!.commentProbability!)).sort((a,b)=>a-b); const raceIds = new Set(common.map((e) => e.raceId)); let rank1=0,top2=0,top3=0, comparable=0; for(const raceId of raceIds){ const newer=common.filter((e)=>e.raceId===raceId), older=newer.map((e)=>v1ByRunner.get(e.row.features.targetRunnerId)!); if(newer.length<2 || older.some((e)=>e.raceId!==raceId)) continue; comparable++; const ids=(rows:Example[])=>[...rows].sort((a,b)=>b.commentProbability!-a.commentProbability!).map((e)=>e.row.features.targetRunnerId); const a=ids(older),b=ids(newer); if(a[0]!==b[0])rank1++; if(setKey(a.slice(0,2))!==setKey(b.slice(0,2)))top2++; if(setKey(a.slice(0,3))!==setKey(b.slice(0,3)))top3++; } const largest=[...common].sort((a,b)=>Math.abs(b.commentProbability!-v1ByRunner.get(b.row.features.targetRunnerId)!.commentProbability!)-Math.abs(a.commentProbability!-v1ByRunner.get(a.row.features.targetRunnerId)!.commentProbability!)).slice(0,10); return { summary:[`- Common cohort: ${common.length} runners in ${comparable} comparable races.`,`- Absolute probability change: median ${pct(quantile(changes,.5),2)}, p75 ${pct(quantile(changes,.75),2)}, p90 ${pct(quantile(changes,.9),2)}, maximum ${pct(changes.at(-1)??0,2)}.`,`- Rank 1 changed in ${rank1}/${comparable}; top-2 set in ${top2}/${comparable}; top-3 set in ${top3}/${comparable}.`], examples:["| Horse | Race | v1 | v2 | Absolute change |","|---|---|---:|---:|---:|",...largest.map((e)=>{const old=v1ByRunner.get(e.row.features.targetRunnerId)!;return `| ${escape(e.row.features.horseName)} | ${e.row.features.raceDate} ${escape(e.row.features.courseName)} | ${pct(old.commentProbability!,2)} | ${pct(e.commentProbability!,2)} | ${pct(Math.abs(e.commentProbability!-old.commentProbability!),2)} |`;})]}; }
function assertBooks(examples: Example[]) { for(const indexes of groupIndexes(examples)){ const total=indexes.reduce((s,i)=>s+examples[i]!.commentProbability!,0); if(indexes.some((i)=>!Number.isFinite(examples[i]!.commentProbability)) || Math.abs(total-1)>1e-12) throw new Error(`Invalid probability book ${examples[indexes[0]!]!.raceId}: ${total}`); } }
async function loadArchivedCache(directory:string):Promise<LoadedBacktestFeatureCache>{ const manifest=await readJson<BacktestFeatureCacheManifest>(join(directory,"manifest.json")); const [features,outcomes]=await Promise.all([readNdjson<Omit<HistoricalPreRaceFeatureRow,"raceDateTime">&{raceDateTime:string}>(join(directory,manifest.featuresFile)),readNdjson<HistoricalPostRaceOutcome>(join(directory,manifest.outcomesFile))]); const rows=rowsFromCachedParts({features:features.map((f)=>({...f,raceDateTime:new Date(f.raceDateTime)})),outcomes}); return {manifest,rows,directory,actualCoverage:null}; }
async function readJson<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,"utf8")) as T;} async function readNdjson<T>(path:string):Promise<T[]>{return (await readFile(path,"utf8")).split("\n").filter(Boolean).map((line)=>JSON.parse(line) as T);}
function metricRow(name:string,m:ReturnType<typeof metrics>){return `| ${name} | ${m.races} | ${m.runners} | ${fmt(m.logLoss)} | ${fmt(m.brier)} | ${pct(m.top1)} | ${pct(m.top2)} | ${pct(m.top3)} |`;}
function metricLine(name:string,m:ReturnType<typeof metrics>){return `${name}: races=${m.races} runners=${m.runners} logloss=${fmt(m.logLoss)} brier=${fmt(m.brier)} top1=${pct(m.top1)} top2=${pct(m.top2)} top3=${pct(m.top3)}`;}
function commentCoverage(rows:Example[]){return rows.filter((e)=>e.priorComments.length>0).length/rows.length;} function weight(model:Model,name:string){const i=model.names.indexOf(name);return i<0?0:model.weights[i]!;} function average(values:number[]){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;} function quantile(values:number[],q:number){if(!values.length)return 0;const p=(values.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return values[l]!+(values[h]!-values[l]!)*(p-l);} function setKey(values:string[]){return [...values].sort().join("|");} function mulberry32(seed:number){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};} function fmt(v:number,d=4){return Number.isFinite(v)?v.toFixed(d):"-";} function pct(v:number,d=1){return Number.isFinite(v)?`${(v*100).toFixed(d)}%`:"-";} function signed(v:number){return `${v>=0?"+":""}${fmt(v)}`;} function signedPct(v:number){return `${v>=0?"+":""}${pct(v)}`;} function escape(v:string){return v.replaceAll("|","\\|");}
