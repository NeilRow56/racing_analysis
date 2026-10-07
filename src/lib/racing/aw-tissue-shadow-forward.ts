import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AW_TISSUE_ARTIFACT_HASH, awTissueModelInputs, awTissueProbabilities, awTissueRawInputs, type AwTissueModel } from "./aw-tissue-model";
import { cleanAwTissueRace, type AwTissueRace } from "./aw-tissue-forward";
import { settleSelection } from "./backtest";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, FORWARD_VALUE_SETTLEMENT_VERSION, forwardValuePriceSnapshot, isCleanPhase2Observation, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";
import { AW_SHADOW_CHECKSUM, AW_SHADOW_IMPLEMENTED_AT, AW_SHADOW_VERSION, shadowInputs, shadowProbabilities, type AwShadowExtras, type AwShadowModel } from "./aw-tissue-shadow-model";
import type { TodayRace } from "./todays-racing";

export const AW_SHADOW_FORWARD_PATH = "data/research/aw-tissue-parity-shadow-forward-v1.json";
const VERSION = "aw_tissue_parity_shadow_forward_v1";
export const SHADOW_PRICE_STAGES = ["early", "t180", "t60"] as const;
type Stage = typeof SHADOW_PRICE_STAGES[number];
export type ShadowPrice = { source: "aw_tissue" | "forward_value"; snapshot: ForwardValuePriceSnapshot };
export type ShadowRunner = {
  runnerId: string; horseName: string; v1Probability: number; candidateProbability: number; v1Rank: number; candidateRank: number;
  baseInputs: Array<number | null>; extras: AwShadowExtras; candidateInputs: Array<number | null>;
  prices: Partial<Record<Stage, ShadowPrice>>; outcome: AwTissueRace["runners"][number]["outcome"];
};
export type ShadowRace = {
  raceId: string; raceDate: string; course: string; scheduledOffAt: string; capturedAt: string; v1RecordedAt: string;
  captureMode: "live_sync" | "retrospective_or_imported"; modelHash: string; v1ModelHash: string;
  runners: ShadowRunner[]; settledAt: string | null; winners: string[]; excludedReason: string | null;
};
export type ShadowData = { version: string; modelVersion: string; modelHash: string; implementedAt: string; races: ShadowRace[] };
export const emptyAwShadow = (): ShadowData => ({ version: VERSION, modelVersion: AW_SHADOW_VERSION, modelHash: AW_SHADOW_CHECKSUM, implementedAt: AW_SHADOW_IMPLEMENTED_AT, races: [] });

export async function loadAwShadowForward(path = AW_SHADOW_FORWARD_PATH): Promise<ShadowData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as ShadowData;
    if (data.version !== VERSION || data.modelVersion !== AW_SHADOW_VERSION || data.modelHash !== AW_SHADOW_CHECKSUM || data.implementedAt !== AW_SHADOW_IMPLEMENTED_AT) throw new Error("Unsupported AW shadow tracker");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAwShadow();
    throw error;
  }
}

export async function mutateAwShadow(mutation: (data: ShadowData) => ShadowData | Promise<ShadowData>, path = AW_SHADOW_FORWARD_PATH): Promise<ShadowData> {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise(wait => setTimeout(wait, 10));
    }
  }
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    const original = await loadAwShadowForward(path), updated = await mutation(original);
    if (JSON.stringify(updated) !== JSON.stringify(original)) {
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
      await rename(temporary, path);
    }
    return updated;
  } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
}

export function captureAwShadow(source: AwTissueRace, current: TodayRace, extras: ReadonlyMap<string, AwShadowExtras>, v1: AwTissueModel, candidate: AwShadowModel, now = new Date()): ShadowRace | null {
  const capturedAt = now.toISOString();
  if (!cleanAwTissueRace(source) || source.modelHash !== v1.checksum || source.settledAt || source.recordedAt > capturedAt ||
      capturedAt < AW_SHADOW_IMPLEMENTED_AT || !current.raceDateTime || current.raceId !== source.raceId ||
      current.raceDateTime.toISOString() !== source.scheduledOffAt || now >= current.raceDateTime ||
      current.winningTime || current.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  const active = current.runners.filter(r => r.resultStatus !== "non_runner");
  if (active.length !== source.runners.length || new Set(active.map(r => r.runnerId)).size !== active.length) return null;
  const inputs: Array<Array<number | null>> = [];
  for (const frozen of source.runners) {
    const runner = active.find(r => r.runnerId === frozen.runnerId), extra = extras.get(frozen.runnerId);
    if (!runner || runner.metrics === null || !extra || frozen.priorAwStarts === null || !frozen.probability || frozen.rank === null ||
        JSON.stringify(awTissueRawInputs(current, runner, frozen.priorAwStarts)) !== JSON.stringify(frozen.rawInputs)) return null;
    inputs.push(shadowInputs(frozen.rawInputs, extra, source.raceId, source.scheduledOffAt, capturedAt));
  }
  const baseline = awTissueProbabilities(source.runners.map(r => awTissueModelInputs(r.rawInputs, v1)), v1);
  if (baseline.some((p, i) => Math.abs(p - source.runners[i]!.probability!) > 1e-12)) throw new Error("V1 source probabilities do not match frozen inputs");
  const probabilities = shadowProbabilities(inputs, candidate);
  const order = [...source.runners.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || source.runners[a]!.runnerId.localeCompare(source.runners[b]!.runnerId));
  return {
    raceId: source.raceId, raceDate: source.raceDate, course: source.course, scheduledOffAt: source.scheduledOffAt,
    capturedAt, v1RecordedAt: source.recordedAt, captureMode: "live_sync", modelHash: candidate.checksum, v1ModelHash: v1.checksum,
    runners: source.runners.map((r, i) => ({ runnerId: r.runnerId, horseName: r.horseName, v1Probability: r.probability!,
      candidateProbability: probabilities[i]!, v1Rank: r.rank!, candidateRank: order.indexOf(i) + 1,
      baseInputs: structuredClone(r.rawInputs), extras: structuredClone(extras.get(r.runnerId)!), candidateInputs: inputs[i]!, prices: {}, outcome: null })),
    settledAt: null, winners: [], excludedReason: null,
  };
}

export function isProspectiveShadow(r: ShadowRace): boolean {
  return r.captureMode === "live_sync" && r.modelHash === AW_SHADOW_CHECKSUM && r.v1ModelHash === AW_TISSUE_ARTIFACT_HASH && Number.isFinite(Date.parse(r.capturedAt)) &&
    Number.isFinite(Date.parse(r.scheduledOffAt)) && r.capturedAt >= AW_SHADOW_IMPLEMENTED_AT && r.capturedAt < r.scheduledOffAt && r.excludedReason === null;
}

export function updateAwShadow(record: ShadowRace, source: AwTissueRace | undefined, forward: ForwardValueRecord[]): ShadowRace {
  const updated = structuredClone(record);
  if (!isProspectiveShadow(record)) return record;
  if (source?.settledAt && !record.settledAt) {
    if (source.excludedReason || source.runners.length !== record.runners.length || source.runners.some(r => !record.runners.some(s => s.runnerId === r.runnerId))) {
      updated.excludedReason = source.excludedReason ?? "source_field_changed";
    } else {
      updated.settledAt = source.settledAt; updated.winners = [...source.winners];
      for (const runner of updated.runners) runner.outcome = structuredClone(source.runners.find(r => r.runnerId === runner.runnerId)!.outcome);
    }
  }
  function attach(id: string | null, stage: Stage, snapshot: ForwardValuePriceSnapshot | null, origin: ShadowPrice["source"]) {
    const runner = updated.runners.find(r => r.runnerId === id);
    if (!runner || runner.prices[stage] || !snapshot || snapshot.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ||
        !Number.isFinite(snapshot.decimalPrice) || snapshot.decimalPrice <= 1 || !Number.isFinite(snapshot.impliedProbability) || !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
        snapshot.capturedAt < record.capturedAt || snapshot.capturedAt >= record.scheduledOffAt ||
        Math.abs(snapshot.impliedProbability - 1 / snapshot.decimalPrice) > 1e-12) return;
    runner.prices[stage] = { source: origin, snapshot: structuredClone(snapshot) };
  }
  if (source && cleanAwTissueRace(source)) for (const stage of SHADOW_PRICE_STAGES) attach(source.top1, stage, source.prices[stage], "aw_tissue");
  for (const fv of forward.filter(f => f.raceId === record.raceId && f.family === "aw" && isCleanPhase2Observation(f))) {
    for (const stage of SHADOW_PRICE_STAGES) {
      attach(fv.leaderRunnerId, stage, forwardValuePriceSnapshot(fv, stage), "forward_value");
      const tissue = stage === "early" ? fv.tissueEarlyPriceSnapshot : stage === "t180" ? fv.tissueT180PriceSnapshot : fv.tissueT60PriceSnapshot;
      attach(fv.tissueRunnerId, stage, tissue ?? null, "forward_value");
    }
  }
  return updated;
}

// Adapt diagnostic runner observations to the existing Forward Value cleanliness predicate.
export function cleanShadowValue(race: ShadowRace, runner: ShadowRunner, stage: Stage, probability: number): { price: number; implied: number; edgePp: number; profit: number | null } | null {
  const snapshot = runner.prices[stage]?.snapshot;
  if (!isProspectiveShadow(race) || !snapshot || snapshot.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ||
      !Number.isFinite(snapshot.decimalPrice) || snapshot.decimalPrice <= 1 || !Number.isFinite(snapshot.impliedProbability) ||
      Math.abs(snapshot.impliedProbability - 1 / snapshot.decimalPrice) > 1e-12 || !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
      snapshot.capturedAt < race.capturedAt || snapshot.capturedAt >= race.scheduledOffAt) return null;
  const outcome = runner.outcome;
  const settlement = outcome ? settleSelection({ targetRaceId: race.raceId, targetRunnerId: runner.runnerId,
    resultStatus: outcome.resultStatus, finishingPosition: outcome.finishingPosition, won: outcome.won, placed: null,
    startingPrice: null, startingPriceDecimal: String(snapshot.decimalPrice), deadHeatDivisor: outcome.deadHeatDivisor }) : null;
  const observation = {
    recordedPreRace: true, captureMode: "live_sync", raceDateTime: race.scheduledOffAt, recordedAt: race.capturedAt,
    priceCapturedAt: snapshot.capturedAt, calibratedProbability: probability, capturedDecimalOdds: snapshot.decimalPrice,
    settlementVersion: FORWARD_VALUE_SETTLEMENT_VERSION, leaderResultStatus: outcome?.resultStatus ?? null,
    leaderWon: outcome?.won ?? null, settledAt: race.settledAt, capturedPriceProfitLoss: settlement?.profitLoss ?? null,
  } as ForwardValueRecord;
  if (!isCleanPhase2Observation(observation)) return null;
  return { price: snapshot.decimalPrice, implied: snapshot.impliedProbability, edgePp: (probability - snapshot.impliedProbability) * 100, profit: settlement?.profitLoss ?? null };
}
