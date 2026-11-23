import { raceSoftmax } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { normalizeCompleteMarket } from "./tissue-value-metrics";

export type HistoryFamily = "CHASE" | "HURDLE" | "AW" | "TURF";
export type HistoryRunner = { id: string; horse: string; trainer: string | null; jockey: string | null; age: number | null; weight: number | null };
export type HistoryRace = { id: string; date: string; family: HistoryFamily; class: number | null; yards: number | null;
  going: string | null; handicap: boolean | null; runners: readonly HistoryRunner[] };
type Prior = { date: string; family: HistoryFamily; class: number | null; yards: number | null; going: string | null;
  performance: number; or: number | null; speed: number | null };
type Start = { day: number; credit: number };
type Outcome = { performance: number; credit: number; or: number | null; speed: number | null };
const clip = (x: number) => Math.max(-1, Math.min(1, x));
const average = (numbers: readonly number[]) => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
const centred = (p: number | null) => p === null ? 0 : 2 * p - 1;
const day = (date: string) => Date.parse(date) / 86_400_000;

function rank(value: number | null, field: readonly (number | null)[]) {
  const available = field.filter((x): x is number => x !== null);
  if (value === null || available.length < 2) return 0;
  return available.reduce((sum, x) => sum + Math.sign(value - x), 0) / (available.length - 1);
}

export const FULL_HISTORY_V1 = {
  A: { id: "INDEPENDENT_RELATIVE_ABILITY_V1", features: ["prior OR field rank", "prior speed field rank", "same-family last-three form field rank",
    "latest same-family finish", "distance-matched form", "going-matched form", "latest class drop", "experience", "weight field rank",
    "no same-family form", "no prior speed"] },
  B: { id: "INDEPENDENT_PLACEMENT_V1", features: ["trainer family 365-day rate", "jockey family 365-day rate",
    "horse-trainer 365-day rate", "layoff suitability", "latest class drop", "latest same-family finish", "handicap by class drop",
    "no same-family form", "no trainer starts", "no jockey starts"] },
  D: { id: "INDEPENDENT_CAPPED_RETURN_V1", capDecimal: 21, minimumNet: 0, maxBets: 2,
    additionalFeatures: ["intercept", "field size", "handicap"] },
  market: { minimumEdge: 0.05, maxBets: 2, ownWeight: 0.5 },
  fit: { chronologicalCutoff: "2025-09-30", l2: 0.025, steps: 72, stepSize: 0.6, returnSteps: 240, returnStepSize: 0.08 },
} as const;

export class IndependentRaceHistory {
  private readonly horse = new Map<string, Prior[]>();
  private readonly participant = new Map<string, Start[]>();
  private latestDate = "";

  prepare(race: HistoryRace) {
    if (race.date <= this.latestDate) throw new Error("Prepare every race on a date before recording that date’s results");
    const targetDay = day(race.date);
    const rows = race.runners.map(runner => {
      const runs = (this.horse.get(runner.horse) ?? []).filter(run => run.date < race.date);
      const same = runs.filter(run => run.family === race.family);
      const latest = same.at(-1);
      const last3 = same.slice(-3);
      const form = average(last3.map(run => run.performance));
      const speed = average(last3.flatMap(run => run.speed === null ? [] : [run.speed]));
      const lastOr = latest?.or ?? null;
      const classDrop = latest?.class != null && race.class !== null ? clip((race.class - latest.class) / 3) : 0;
      const layoff = runs.length ? targetDay - day(runs.at(-1)!.date) : null;
      const window = (key: string | null) => {
        const starts = key === null ? [] : this.participant.get(key) ?? [];
        let n = 0, credit = 0;
        for (let i = starts.length - 1; i >= 0 && starts[i].day >= targetDay - 365; i--) {
          n++;
          credit += starts[i].credit;
        }
        return { n, credit };
      };
      const trainer = window(runner.trainer && `t|${race.family}|${runner.trainer}`);
      const jockey = window(runner.jockey && `j|${race.family}|${runner.jockey}`);
      const combination = window(runner.trainer && `h|${runner.horse}|${runner.trainer}`);
      const rate = (starts: { n: number; credit: number }) => clip((starts.credit - 0.1 * starts.n) * 5 / (starts.n + 12));
      const distanceForm = average(same.slice(-8).filter(run => race.yards && run.yards && Math.abs(run.yards - race.yards) <= race.yards * 0.15)
        .map(run => run.performance));
      const goingForm = average(same.slice(-8).filter(run => race.going && run.going === race.going).map(run => run.performance));
      return { runner, runs: runs.length, same: same.length, latest, form, speed, lastOr, classDrop, layoff, trainer, jockey,
        rates: [rate(trainer), rate(jockey), rate(combination)], distanceForm, goingForm };
    });
    const orField = rows.map(row => row.lastOr), speedField = rows.map(row => row.speed);
    const formField = rows.map(row => row.form), weightField = rows.map(row => row.runner.weight);
    return rows.map(row => {
      const last = centred(row.latest?.performance ?? null);
      const A = [rank(row.lastOr, orField), rank(row.speed, speedField), rank(row.form, formField), last,
        centred(row.distanceForm), centred(row.goingForm), row.classDrop, Math.min(row.same, 12) / 12,
        rank(row.runner.weight, weightField), Number(!row.latest), Number(row.speed === null)];
      const layoff = row.layoff === null ? 0 : clip(1 - Math.abs(Math.log(row.layoff / 28)));
      const B = [...row.rates, layoff, row.classDrop, last, Number(race.handicap === true) * row.classDrop,
        Number(!row.latest), Number(!row.trainer.n), Number(!row.jockey.n)];
      const D = [1, clip((race.runners.length - 10) / 10), Number(race.handicap === true), ...A, ...B];
      return { id: row.runner.id, A, B, D, coverage: { history: row.runs > 0, form: row.form !== null, speed: row.speed !== null,
        priorOR: row.lastOr !== null, trainerHistory: row.trainer.n > 0, jockeyHistory: row.jockey.n > 0 } };
    });
  }

  record(race: HistoryRace, results: readonly Outcome[]) {
    if (race.date < this.latestDate || results.length !== race.runners.length) throw new Error("Out-of-order or incomplete history");
    this.latestDate = race.date;
    const raceDay = day(race.date);
    race.runners.forEach((runner, i) => {
      const { credit, ...prior } = results[i];
      const rows = this.horse.get(runner.horse) ?? [];
      rows.push({ ...prior, date: race.date, family: race.family, class: race.class, yards: race.yards, going: race.going });
      this.horse.set(runner.horse, rows);
      const keys = [
        runner.trainer && `t|${race.family}|${runner.trainer}`, runner.jockey && `j|${race.family}|${runner.jockey}`,
        runner.trainer && `h|${runner.horse}|${runner.trainer}`,
      ];
      for (const key of keys) {
        if (key === null) continue;
        const starts = this.participant.get(key) ?? [];
        starts.push({ day: raceDay, credit });
        this.participant.set(key, starts);
      }
    });
  }
}

export type IndependentFeatures = ReturnType<IndependentRaceHistory["prepare"]>[number];
export type IndependentParameters = { A: readonly number[]; B: readonly number[]; D: readonly number[] };
const dot = (features: readonly number[], weights: readonly number[]) => features.reduce((sum, value, i) => sum + value * weights[i], 0);
const abstention = (reason: string) => ({ status: "no-selection" as const, reason, selections: [] });
const selection = <T>(selections: T[]) => selections.length ? { status: "selection" as const, selections } : abstention("insufficient-edge");

export function independentProbabilities(features: readonly IndependentFeatures[], weights: readonly number[], key: "A" | "B") {
  return raceSoftmax(features.map(row => dot(row[key], weights)));
}

/** Forecast the whole field. Quote-conditioned decisions require an explicit pre-off price book. */
export function predictFullHistoryV1(features: readonly IndependentFeatures[], weights: IndependentParameters, quotes?: readonly number[]) {
  const valid = features.length >= 2 && new Set(features.map(row => row.id)).size === features.length &&
    (["A", "B", "D"] as const).every(key => weights[key].length > 0 && weights[key].every(Number.isFinite) &&
      features.every(row => row[key].length === weights[key].length && row[key].every(Number.isFinite)));
  if (!valid) return { A: abstention("invalid-field"), B: abstention("invalid-field"), D: abstention("invalid-field"),
    C: abstention("invalid-field"), probabilities: null };
  const A = independentProbabilities(features, weights.A, "A"), B = independentProbabilities(features, weights.B, "B");
  const D = selection(features.map(row => ({ id: row.id, expectedCappedNet: dot(row.D, weights.D) }))
    .filter(row => row.expectedCappedNet > FULL_HISTORY_V1.D.minimumNet)
    .sort((a, b) => b.expectedCappedNet - a.expectedCappedNet || a.id.localeCompare(b.id)).slice(0, FULL_HISTORY_V1.D.maxBets));
  const market = quotes?.length === features.length ? normalizeCompleteMarket(quotes) : null;
  const quoteDecision = (probabilities: readonly number[]) => market && quotes ? selection(features.map((row, i) => ({
    id: row.id, probability: probabilities[i], quote: quotes[i], edge: probabilities[i] * quotes[i] - 1,
  })).filter(row => row.edge >= FULL_HISTORY_V1.market.minimumEdge)
    .sort((a, b) => b.edge - a.edge || a.id.localeCompare(b.id)).slice(0, FULL_HISTORY_V1.market.maxBets)) : abstention("no-complete-pre-off-quotes");
  const C = market ? raceSoftmax(A.map((p, i) => (1 - FULL_HISTORY_V1.market.ownWeight) * Math.log(market.probabilities[i]) +
    FULL_HISTORY_V1.market.ownWeight * Math.log((p + B[i]) / 2))) : null;
  return { A: quoteDecision(A), B: quoteDecision(B), D, C: C ? quoteDecision(C) : abstention("no-complete-pre-off-quotes"),
    probabilities: { A, B, C } };
}
