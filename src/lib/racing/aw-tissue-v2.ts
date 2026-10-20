import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AW_TISSUE_V2_EPOCH, AW_TISSUE_V2_ACTIVE } from "./aw-tissue-v2-activation";
import { AW_TISSUE_V2_SCHEMA, AW_V2_NAMES, AW_SURFACE_FEATURE_POLICY, awV2Vector, type AwSurfaceFeatures } from "./aw-tissue-v2-features";
import { AW_SURFACE_MAPPING_VERSION, AW_SURFACE_REGISTRY, resolveAwMaterial } from "./aw-surface-material";
import { featureInput } from "./tissue-forward";
import { score, raceSoftmax, priorCommentsForTarget, type Model, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { summarizeBookmakerMarket, FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION } from "./forward-value";
import { calculateAwDRatingCoverage, calculateAwRaceRatings } from "./aw-performance-rating";
import { loadAwTissueForward, captureAwTissueRaces, type AwTissueRace, type AwTissueForwardData } from "./aw-tissue-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { isCurrentAllWeatherRace } from "./current-race-classification";

export const AW_TISSUE_V2_VERSION = "AW_TISSUE_V2";
export const AW_TISSUE_V2_CHECKSUM = "ba7d2ea42a87d4ce432288d57a02cee8528217fafa04efa37723446924bdab82";
export const AW_TISSUE_V2_SCORER = "AW_TISSUE_V2_TURF_V3_CORE_PRERACE";
export const AW_TISSUE_V2_MODEL_PATH = "data/research/aw-tissue-model-v2.json";
export const AW_TISSUE_V2_FORWARD_PATH = "data/research/aw-tissue-forward-v2.json";
export type AwV2Model = { version: typeof AW_TISSUE_V2_VERSION; family: "AW"; trainedAt: string; checksum: string; featureSchemaVersion: typeof AW_TISSUE_V2_SCHEMA; surfaceMappingVersion: typeof AW_SURFACE_MAPPING_VERSION; specification: Record<string, unknown>; model: Model };
export type AwV2Context = { historyCutoffAt: string; surfaceByRunner: ReadonlyMap<string, AwSurfaceFeatures>; comments: Map<string, HistoricalComment[]> };
const mappingContents = { version: AW_SURFACE_MAPPING_VERSION, entries: AW_SURFACE_REGISTRY, conflictPolicy: "unknown_explicit_conflict", earliestPolytrackCorpusBoundaryIsNotInstallationDate: true };
export const AW_MAPPING_CHECKSUM = createHash("sha256").update(JSON.stringify(mappingContents)).digest("hex");
export async function loadAwV2Model(path = AW_TISSUE_V2_MODEL_PATH): Promise<AwV2Model> {
  const m = JSON.parse(await readFile(path, "utf8")) as AwV2Model;
  if (m.version !== AW_TISSUE_V2_VERSION || m.family !== "AW" || m.checksum !== AW_TISSUE_V2_CHECKSUM || m.featureSchemaVersion !== AW_TISSUE_V2_SCHEMA || m.surfaceMappingVersion !== AW_SURFACE_MAPPING_VERSION ||
      !Number.isFinite(Date.parse(m.trainedAt)) || JSON.stringify(m.model.names) !== JSON.stringify(AW_V2_NAMES) ||
      [m.model.means, m.model.scales, m.model.weights].some(vs => vs.length !== 95 || vs.some(v => !Number.isFinite(v))) || m.model.scales.some(s => s <= 0) ||
      m.specification.surfaceMappingChecksum !== AW_MAPPING_CHECKSUM || m.specification.epochs !== 90 || m.specification.l2 !== .02 || m.specification.numericMissingImputation !== "zero_plus_missing_flags" || m.specification.scaling !== "training_population_sd_floor_1e-6" || m.specification.calibration !== "none" ||
      JSON.stringify(m.specification.surfacePolicy) !== JSON.stringify(AW_SURFACE_FEATURE_POLICY) || m.specification.prospectiveHistoryCutoff !== "capture_datetime" || m.specification.targetOutcomeFeatures !== false || m.specification.fieldSizeSource !== "declared_runner_count_only" || m.specification.drawFractionDenominator !== "declared_runner_count_only" ||
      createHash("sha256").update(JSON.stringify({ specification: m.specification, model: m.model })).digest("hex") !== m.checksum) throw new Error("Invalid frozen AW v2 artifact/schema/mapping/checksum");
  return m;
}
export function emptyAwV2Forward(epoch = AW_TISSUE_V2_EPOCH): AwTissueForwardData {
  return { version: "aw_tissue_forward_v2", modelVersion: AW_TISSUE_V2_VERSION, featureSchemaVersion: AW_TISSUE_V2_SCHEMA, implementedAt: epoch, races: [] };
}
export function loadAwV2Forward(path = AW_TISSUE_V2_FORWARD_PATH) { return loadAwTissueForward(path, emptyAwV2Forward()); }
export function loadActiveAwTissueForward() { return AW_TISSUE_V2_ACTIVE ? loadAwV2Forward() : loadAwTissueForward(); }
export function captureAwV2Races(data: AwTissueForwardData, races: AwTissueRace[]) {
  if (data.modelVersion !== AW_TISSUE_V2_VERSION || data.featureSchemaVersion !== AW_TISSUE_V2_SCHEMA) throw new Error("AW v2 tracker mismatch");
  return captureAwTissueRaces(data, races.filter(r => r.modelVersion === AW_TISSUE_V2_VERSION && r.modelHash === AW_TISSUE_V2_CHECKSUM && r.liveSemanticsVersion === AW_TISSUE_V2_SCORER && r.liveSemanticsEffectiveAt === data.implementedAt && r.raceDate >= data.implementedAt.slice(0, 10) && r.recordedAt >= data.implementedAt &&
    Number.isFinite(Date.parse(r.featureCutoffAt ?? "")) && r.featureCutoffAt! <= r.recordedAt && r.runners.every(p => p.modelInputs?.length === 95 && p.modelInputs.every(Number.isFinite))));
}
export function awV2LiveFeatureInput(race: TodayRace, runner: TodayRunner) {
  const f = featureInput(race, runner), m = runner.metrics;
  return { ...f, latestPerformanceRating: m?.latestAwPerformanceRating ?? null, bestPerformanceLast3: m?.bestAwPerformanceLast3 ?? null, averagePerformanceLast3: m?.averageAwPerformanceLast3 ?? null,
    latestTodaysRating: m?.latestAwTodaysRating ?? null, bestTodaysRatingLast3: m?.bestAwTodaysRatingLast3 ?? null, averageTodaysRatingLast3: m?.averageAwTodaysRatingLast3 ?? null,
    latestAwSpeedRating: m?.latestAwSpeedRating ?? null, bestAwSpeedLast3: m?.bestAwSpeedLast3 ?? null, averageAwSpeedLast3: m?.averageAwSpeedLast3 ?? null };
}
export function buildAwV2Race(race: TodayRace, course: string, raceDate: string, model: AwV2Model, context: AwV2Context, capturedAt = new Date(), epoch = AW_TISSUE_V2_EPOCH): AwTissueRace | null {
  const cutoff = new Date(context.historyCutoffAt), off = race.raceDateTime;
  if (model.version !== AW_TISSUE_V2_VERSION) throw new Error("AW model/config version mismatch");
  // Same v3 timing/result/declaration/finite-vector contract; no result-count fallback.
  if (raceDate < epoch.slice(0, 10) || !isCurrentAllWeatherRace(race) || !off || !Number.isFinite(off.getTime()) || !race.scheduledTime || !Number.isFinite(capturedAt.getTime()) || capturedAt >= off || capturedAt < new Date(epoch) || capturedAt < new Date(model.trainedAt) ||
      !Number.isFinite(cutoff.getTime()) || cutoff > capturedAt || !hasCompleteProspectiveField({ ...race, actualRunnerCount: null }) || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")) ||
      resolveAwMaterial({ course, raceDate, surface: race.surface, aw: true }).material === "UNKNOWN") return null;
  const active = race.runners.filter(r => r.resultStatus !== "non_runner");
  if (active.length < 2 || active.some(r => !context.surfaceByRunner.has(r.runnerId))) return null;
  const scored = active.map(runner => {
    const surface = context.surfaceByRunner.get(runner.runnerId)!;
    const priors = priorCommentsForTarget(context.comments.get(runner.horseId) ?? [], cutoff);
    const inputs = awV2Vector(awV2LiveFeatureInput(race, runner), surface, priors);
    return { runner, inputs, score: score(model.model, inputs), surface };
  });
  if (scored.some(s => s.inputs.length !== 95 || s.inputs.some(v => !Number.isFinite(v)) || !Number.isFinite(s.score))) return null;
  const probabilities = raceSoftmax(scored.map(s => s.score));
  const sorted = [...probabilities].sort((a, b) => b - a), ranks = probabilities.map(p => sorted.indexOf(p) + 1);
  const top = [...active.keys()].sort((a, b) => ranks[a]! - ranks[b]! || active[a]!.runnerId.localeCompare(active[b]!.runnerId));
  const quotes = active.map(r => summarizeBookmakerMarket(r.bookmakerQuotes));
  const completeMarket = quotes.every(q => q.decimalPrice !== null), overround = quotes.reduce((s, q) => s + (q.decimalPrice === null ? 0 : 1 / q.decimalPrice), 0);
  const ratingInputs = active.map(r => ({ runnerId: r.runnerId, resultStatus: r.resultStatus, averageAwSpeedLast3: r.metrics?.averageAwSpeedLast3 ?? null, trainerPriorStrikeRate: r.trainerMetrics?.trainerPriorWinRate ?? null, jockeyPriorStrikeRate: r.jockeyMetrics?.jockeyPriorWinRate ?? null }));
  const ratings = calculateAwRaceRatings(ratingInputs), awDCoverage = calculateAwDRatingCoverage(ratingInputs, ratings);
  const leader = (kind: "awD" | "awA") => [...ratings].filter(([, r]) => r[kind] !== null).sort((a, b) => a[1][kind]!.score - b[1][kind]!.score || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return { raceId: race.raceId, sourceId: race.sourceId, raceDate, course, raceName: race.raceName, scheduledTime: race.scheduledTime, scheduledOffAt: off.toISOString(), currentOffAt: off.toISOString(), fieldSize: active.length,
    recordedAt: capturedAt.toISOString(), recordedPreRace: true, modelVersion: model.version, featureSchemaVersion: AW_TISSUE_V2_SCHEMA, modelHash: model.checksum, featureCutoffAt: cutoff.toISOString(), liveSemanticsVersion: AW_TISSUE_V2_SCORER, liveSemanticsEffectiveAt: epoch, surfaceMappingVersion: AW_SURFACE_MAPPING_VERSION,
    activeRunnerCount: active.length, predictedRunnerCount: active.length, predictionCoverage: 1,
    runners: scored.map((s, i) => ({ runnerId: s.runner.runnerId, horseId: s.runner.horseId, horseName: s.runner.horseName, probability: probabilities[i]!, rank: ranks[i]!, predictionAvailable: true, unavailableReason: null,
      zeroHistoryRunner: s.runner.metrics?.priorRuns === 0, priorAwStarts: s.runner.metrics?.priorAwStarts ?? null, rawInputs: s.inputs.slice(0, 26), modelInputs: [...s.inputs], modelVersion: model.version, featureSchemaVersion: AW_TISSUE_V2_SCHEMA, outcome: null })),
    surfaceFeatureEvidence: Object.fromEntries(scored.map(s => [s.runner.runnerId, { ...s.surface, selectedPriorRunnerIds: [...s.surface.selectedPriorRunnerIds] }])),
    firstCaptureMarket: active.map((r, i) => ({ runnerId: r.runnerId, price: quotes[i]!.decimalPrice, normalizedProbability: completeMarket ? (1 / quotes[i]!.decimalPrice!) / overround : null, rank: completeMarket ? 1 + quotes.filter(q => q.decimalPrice! < quotes[i]!.decimalPrice!).length : null })),
    top1: active[top[0]!]!.runnerId, top2: top.filter(i => ranks[i]! <= 2).map(i => active[i]!.runnerId), top3: top.filter(i => ranks[i]! <= 3).map(i => active[i]!.runnerId), awDLeader: awDCoverage.ratingCoverageStatus === "eligible" ? leader("awD") : null, awALeader: leader("awA"), awDCoverage,
    winners: [], settledAt: null, excludedReason: null, marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    prices: { early: null, t180: null, t60: null }, selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null } };
}
