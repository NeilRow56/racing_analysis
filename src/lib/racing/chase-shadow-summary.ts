import { settleSelection } from "./backtest";
import { cleanJumpTissueRace } from "./jump-tissue-forward";
import { chaseExperienceGroup } from "./chase-shadow-context";
import type { ChaseShadowData, ChaseShadowRace, ShadowRunner } from "./chase-shadow-forward";

type ModelKey = "current" | "shadow";
type Row = ShadowRunner & { race: ChaseShadowRace; probability: number; rank: number; won: boolean | null; profit: number | null };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]) => values.length ? sum(values) / values.length : null;
const clip = (p: number) => Math.min(1 - 1e-12, Math.max(1e-12, p));
export const CHASE_CALIBRATION_BANDS = ["<10%", "10–<15%", "15–<20%", "20–<30%", "30%+"];
const band = (p: number) => p < .1 ? 0 : p < .15 ? 1 : p < .2 ? 2 : p < .3 ? 3 : 4;

function rows(races: ChaseShadowRace[], model: ModelKey): Row[] {
  return races.flatMap(race => race.runners.flatMap(r => {
    const current = race.current.runners.find(t => t.runnerId === r.runnerId)!;
    const prediction = model === "current" ? current : r;
    if (prediction.probability === null || prediction.rank === null) return [];
    const outcome = race.current.settledAt !== null && race.current.excludedReason === null ? current.outcome : null;
    const profit = outcome && outcome.won !== null && r.price ? settleSelection({
      targetRaceId: race.raceId, targetRunnerId: r.runnerId, ...outcome, placed: null,
      startingPrice: null, startingPriceDecimal: String(r.price.decimal),
    })?.profitLoss ?? null : null;
    return [{ ...r, race, probability: prediction.probability, rank: prediction.rank, won: outcome?.won ?? null, profit }];
  }));
}
function metrics(rows: Row[]) {
  const settled = rows.filter(r => r.won !== null), winners = settled.filter(r => r.won).length;
  const expected = sum(settled.map(r => r.probability)), priced = settled.filter(r => r.profit !== null);
  const profit = priced.length ? sum(priced.map(r => r.profit!)) : null;
  const calibration = CHASE_CALIBRATION_BANDS.map((label, i) => {
    const runners = settled.filter(r => band(r.probability) === i), actual = runners.filter(r => r.won).length, expected = sum(runners.map(r => r.probability));
    return { band: label, runners: runners.length, expected, winners: actual, actualModel: expected ? actual / expected : null };
  });
  return { captured: rows.length, settled: settled.length, winners, strike: settled.length ? winners / settled.length : null,
    expected, actualModel: expected ? winners / expected : null,
    logLoss: mean(settled.map(r => -(r.won ? Math.log(clip(r.probability)) : Math.log1p(-clip(r.probability))))),
    calibrationError: settled.length ? sum(calibration.map(b => Math.abs(b.winners - b.expected))) / settled.length : null,
    calibration, priceN: priced.length, profit, roi: profit === null ? null : profit / priced.length };
}
export type ChaseShadowMetrics = ReturnType<typeof metrics>;
function modelMetrics(races: ChaseShadowRace[], model: ModelKey) {
  const all = rows(races, model), settled = races.filter(r => r.current.settledAt !== null && r.current.excludedReason === null);
  return { races: settled.length, ...metrics(all),
    logLoss: mean(settled.map(r => sum(rows([r], model).filter(t => t.won).map(t => -Math.log(clip(t.probability)) / (r.current.runners.find(c => c.runnerId === t.runnerId)!.outcome?.deadHeatDivisor ?? 1))))),
    top1: metrics(all.filter(r => r.rank === 1)), rank2: metrics(all.filter(r => r.rank === 2)), top2: metrics(all.filter(r => r.rank <= 2)),
    top2RaceStrike: settled.length ? settled.filter(r => rows([r], model).some(t => t.rank <= 2 && t.won)).length / settled.length : null,
    longerPrice: metrics(all.filter(r => r.rank <= 2 && r.price !== null && r.price.decimal > 6)),
  };
}
export function summarizeChaseShadow(data: ChaseShadowData) {
  const paired = data.races.filter(r => r.coverage === "complete" && cleanJumpTissueRace(r.current));
  const pair = (races: ChaseShadowRace[]) => ({ current: modelMetrics(races, "current"), shadow: modelMetrics(races, "shadow") });
  const currentRows = rows(paired, "current"), shadowRows = rows(paired, "shadow");
  const groups = (labels: readonly string[], key: (r: Row) => string) => labels.map(label => ({ label,
    current: metrics(currentRows.filter(r => key(r) === label)), shadow: metrics(shadowRows.filter(r => key(r) === label)) }));
  const settled = paired.filter(r => r.current.settledAt !== null);
  return { epoch: data.epoch, capturedRaces: data.races.length, pairedRaces: paired.length, settledRaces: settled.length,
    unavailableRaces: data.races.filter(r => r.coverage !== "complete").length,
    excludedRaces: data.races.filter(r => r.current.excludedReason !== null).length,
    coverage: { currentRunners: data.races.reduce((n, r) => n + r.current.predictedRunnerCount, 0), shadowRunners: data.races.reduce((n, r) => n + r.runners.filter(t => t.probability !== null).length, 0), totalRunners: data.races.reduce((n, r) => n + r.runners.length, 0) },
    ...pair(paired),
    disagreement: [true, false].map(disagree => {
      const races = paired.filter(r => (r.current.top1 !== r.runners.find(t => t.rank === 1)?.runnerId) === disagree);
      return { label: disagree ? "Disagreement" : "Agreement", races: races.filter(r => r.current.settledAt !== null).length, ...pair(races) };
    }),
    newChasers: groups(["0", "1–2", "3+", "unavailable"], r => chaseExperienceGroup(r.priorChaseStarts)),
    completion: groups(["completed", "non_completion", "unavailable"], r => r.latestCompletion),
    reliability: [...groups(["HIGH", "MEDIUM", "LOW", "unavailable"], r => r.reliability?.level ?? "unavailable"),
      { label: "MEDIUM/LOW", current: metrics(currentRows.filter(r => r.reliability?.level === "MEDIUM" || r.reliability?.level === "LOW")), shadow: metrics(shadowRows.filter(r => r.reliability?.level === "MEDIUM" || r.reliability?.level === "LOW")) }],
    handicap: groups(["handicap", "non_handicap", "unknown"], r => r.race.handicap),
    chronology: [...new Set(settled.map(r => r.current.raceDate.slice(0, 7)))].sort().map(month => ({ month, ...pair(settled.filter(r => r.current.raceDate.startsWith(month))) })),
    checkpoints: [50, 100, 200].map(target => {
      const checkpoint = data.checkpoints.find(c => c.target === target);
      const ids = new Set(checkpoint?.raceIds ?? []);
      return { target, reached: !!checkpoint, recordedAt: checkpoint?.recordedAt ?? null, ...pair(paired.filter(r => ids.has(r.raceId))) };
    }),
  };
}
export type ChaseShadowSummary = ReturnType<typeof summarizeChaseShadow>;
