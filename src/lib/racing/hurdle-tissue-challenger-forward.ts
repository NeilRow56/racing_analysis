import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus } from "./backtest";
import { buildJumpTissueRace, enrichJumpTissuePrices, settleJumpTissueRace, type JumpTissueRace } from "./jump-tissue-forward";
import { JUMP_TISSUE_VERSION, jumpTissueSubtype, type JumpTissueModel } from "./jump-tissue-model";
import { frozenTissueRankOneEdge } from "./tissue-rank-one-edge";
import { formatRaceTimeForDisplay, getLocalRacingDate, type TodayRace } from "./todays-racing";
import { raceSoftmax, score, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";

export const HURDLE_PAIR_VERSION = "HURDLE_TISSUE_EXCUSE_HALF_SHADOW_V1" as const;
export const HURDLE_PAIR_EPOCH = "2026-10-12T18:44:47.000Z" as const;
export const HURDLE_PAIR_PATH = "data/research/hurdle-tissue-challenger-forward-v1.json";
// Exact adverse_excuse family from run-hurdle-tissue-v2-comment-experiment.ts.
export const HURDLE_EXCUSE_FEATURES = [
  "slowlyAway", "awkwardStart", "racedFreely", "hampered", "bumped", "checked", "deniedRoom", "shortRoom",
  "switched", "racedWide", "weakened", "faded", "eased", "neverDangerous", "lostTouch",
].flatMap((name) => [`last_${name}`, `last3_${name}_count`]);

export type HurdlePairModel = JumpTissueRace & { valueQualified: boolean | null };
export type HurdlePairRace = {
  raceId: string;
  raceDate: string;
  course: string;
  firstCapturedAt: string;
  challengerVersion: typeof HURDLE_PAIR_VERSION;
  control: HurdlePairModel;
  challenger: HurdlePairModel;
  classification: "AGREE" | "DISAGREE";
  settledAt: string | null;
};
export type HurdlePairData = {
  version: typeof HURDLE_PAIR_VERSION;
  epoch: typeof HURDLE_PAIR_EPOCH;
  controlVersion: typeof JUMP_TISSUE_VERSION;
  excuseContributionMultiplier: 0.5;
  excuseFeatures: string[];
  races: HurdlePairRace[];
};
export function emptyHurdlePair(): HurdlePairData {
  return { version: HURDLE_PAIR_VERSION, epoch: HURDLE_PAIR_EPOCH, controlVersion: JUMP_TISSUE_VERSION,
    excuseContributionMultiplier: 0.5, excuseFeatures: [...HURDLE_EXCUSE_FEATURES], races: [] };
}
export async function loadHurdlePair(path = HURDLE_PAIR_PATH): Promise<HurdlePairData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as HurdlePairData;
    if (data.version !== HURDLE_PAIR_VERSION || data.epoch !== HURDLE_PAIR_EPOCH || data.controlVersion !== JUMP_TISSUE_VERSION ||
        data.excuseContributionMultiplier !== 0.5 || JSON.stringify(data.excuseFeatures) !== JSON.stringify(HURDLE_EXCUSE_FEATURES)) {
      throw new Error("Unsupported Hurdle challenger tracker");
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHurdlePair();
    throw error;
  }
}
export async function mutateHurdlePair(mutation: (data: HurdlePairData) => HurdlePairData | Promise<HurdlePairData>, path = HURDLE_PAIR_PATH) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((wait) => setTimeout(wait, 10));
    }
  }
  try {
    const original = await loadHurdlePair(path);
    const updated = await mutation(original);
    if (JSON.stringify(updated) !== JSON.stringify(original)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return updated;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export function buildHurdlePair(input: {
  raceDate: string; course: string; race: TodayRace; model: JumpTissueModel;
  commentsByHorse: ReadonlyMap<string, HistoricalComment[]>; recordedAt?: Date;
}): HurdlePairRace | null {
  const now = input.recordedAt ?? new Date();
  if (now.toISOString() < HURDLE_PAIR_EPOCH || input.raceDate !== getLocalRacingDate(now) ||
      !input.race.raceDateTime || getLocalRacingDate(input.race.raceDateTime) !== input.raceDate ||
      jumpTissueSubtype(input.race).code !== "hurdle") return null;
  const built = buildJumpTissueRace({ ...input, recordedAt: now });
  if (!built || built.predictedRunnerCount !== built.activeRunnerCount || built.excludedReason) return null;
  // This paired model experiment retains its own uncapped VALUE semantics.
  const base = { ...built };
  delete base.hurdleValueRule;
  const indexes = HURDLE_EXCUSE_FEATURES.map((name) => {
    const index = input.model.model.names.indexOf(name);
    if (index < 0) throw new Error(`Missing frozen excuse feature: ${name}`);
    return index;
  });
  const model = input.model.model;
  const probabilities = raceSoftmax(base.runners.map((runner) => {
    const values = runner.modelInputs!;
    const excuse = indexes.reduce((total, index) => total + model.weights[index]! * (values[index]! - model.means[index]!) / model.scales[index]!, 0);
    return score(model, values) - 0.5 * excuse;
  }));
  const order = [...base.runners.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || base.runners[a]!.runnerId.localeCompare(base.runners[b]!.runnerId));
  const challengerBase: JumpTissueRace = { ...base,
    runners: base.runners.map((runner, index) => ({ ...runner, probability: probabilities[index]!, rank: order.indexOf(index) + 1 })),
    top1: base.runners[order[0]!]!.runnerId,
    top2: order.slice(0, 2).map((index) => base.runners[index]!.runnerId),
    top3: order.slice(0, 3).map((index) => base.runners[index]!.runnerId),
  };
  const control = captureFirstPrice({ ...base, valueQualified: null }, input.race, now);
  const challenger = captureFirstPrice({ ...challengerBase, valueQualified: null }, input.race, now);
  return { raceId: base.raceId, raceDate: base.raceDate, course: base.course, firstCapturedAt: base.recordedAt,
    challengerVersion: HURDLE_PAIR_VERSION, control, challenger,
    classification: control.top1 === challenger.top1 ? "AGREE" : "DISAGREE", settledAt: null };
}
export function captureHurdlePairs(data: HurdlePairData, additions: HurdlePairRace[]): HurdlePairData {
  const known = new Set(data.races.map((race) => race.raceId));
  const fresh = additions.filter((race) => {
    if (known.has(race.raceId) || race.firstCapturedAt < data.epoch || race.firstCapturedAt >= race.control.scheduledOffAt ||
        race.raceDate !== getLocalRacingDate(new Date(race.firstCapturedAt)) || race.settledAt !== null ||
        race.control.subtype !== "Hurdle" || race.challengerVersion !== data.version) return false;
    known.add(race.raceId);
    return true;
  });
  return fresh.length ? { ...data, races: [...data.races, ...fresh] } : data;
}

function captureFirstPrice(model: HurdlePairModel, race: TodayRace, now: Date): HurdlePairModel {
  if (model.prices.early || race.winningTime || race.runners.some((runner) => runner.finishingPosition !== null || (runner.resultStatus !== null && runner.resultStatus !== "non_runner"))) return model;
  const priced = enrichJumpTissuePrices(model, race, now);
  if (priced === model) return model;
  const leader = priced.runners.find((runner) => runner.runnerId === priced.top1)!;
  const edge = frozenTissueRankOneEdge(leader.probability, priced.raceId, leader.runnerId, priced.prices, null);
  return { ...priced, valueQualified: edge ? edge.edge > 0 : null };
}
export function updateHurdlePairs(data: HurdlePairData, current: ReadonlyMap<string, TodayRace>, now = new Date(), settleOnly = false): HurdlePairData {
  const races = data.races.map((record) => {
    const race = current.get(record.raceId);
    if (!race || record.settledAt !== null) return record;
    const update = (model: HurdlePairModel): HurdlePairModel => {
      const priced = settleOnly ? model : captureFirstPrice(model, race, now);
      let settled = settleJumpTissueRace(priced, race, now);
      // Canonical voids carry no bet settlement. Retain a race outcome and zero return for a priced void.
      if (!settled.settledAt && race.runners.length > 0 && race.runners.every((runner) => isVoidBetResultStatus(runner.resultStatus)) &&
          priced.runners.every((runner) => race.runners.some((current) => current.runnerId === runner.runnerId))) {
        const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
        settled = { ...priced, settledAt: now.toISOString(), winners: [], runners: priced.runners.map((runner) => ({ ...runner,
          outcome: { resultStatus: byId.get(runner.runnerId)!.resultStatus, finishingPosition: null, won: null, finalSp: null, deadHeatDivisor: 1, finalSpProfitLoss: null } })) };
      }
      if (settled === priced) return priced;
      const voided = hurdlePairLeader({ ...settled, valueQualified: priced.valueQualified }).outcome?.won === null;
      return { ...settled, valueQualified: priced.valueQualified,
        selectedPriceProfitLoss: voided && priced.prices.early ? { ...settled.selectedPriceProfitLoss, early: 0 } : settled.selectedPriceProfitLoss };
    };
    const control = update(record.control), challenger = update(record.challenger);
    if (control === record.control && challenger === record.challenger) return record;
    return { ...record, control, challenger, settledAt: control.settledAt && challenger.settledAt ? control.settledAt : null };
  });
  return races.every((race, index) => race === data.races[index]) ? data : { ...data, races };
}
export function hurdlePairLeader(model: HurdlePairModel) { return model.runners.find((runner) => runner.runnerId === model.top1)!; }
export function hurdlePairOutcome(model: HurdlePairModel) {
  const outcome = hurdlePairLeader(model).outcome;
  return !outcome ? "Pending" : outcome.won === null ? "Void" : outcome.won ? "Winner" : "Loss";
}
type ModelKey = "control" | "challenger";
function modelMetrics(models: HurdlePairModel[], context: "captured" | "finalSp" = "captured") {
  const active = models.filter((model) => hurdlePairLeader(model).outcome?.won !== null);
  const winners = active.filter((model) => hurdlePairLeader(model).outcome?.won === true).length;
  const expectedWinners = active.reduce((sum, model) => sum + hurdlePairLeader(model).probability!, 0);
  const priced = active.filter((model) => priceFor(model, context) !== null);
  const marketExpectedWinners = priced.reduce((sum, model) => sum + 1 / priceFor(model, context)!, 0);
  const pricedWinners = priced.filter((model) => hurdlePairLeader(model).outcome?.won).length;
  const profits = models.map((model) => model.selectedPriceProfitLoss.early).filter((value): value is number => value !== null);
  const profitLoss = profits.length ? profits.reduce((sum, value) => sum + value, 0) : null;
  const valueModels = models.filter((model) => model.valueQualified === true);
  const valueProfits = valueModels.map((model) => model.selectedPriceProfitLoss.early).filter((value): value is number => value !== null);
  const valueProfitLoss = valueProfits.length ? valueProfits.reduce((sum, value) => sum + value, 0) : null;
  const valueStakes = valueModels.filter((model) => hurdlePairLeader(model).outcome?.won !== null).length;
  return { selections: active.length, voids: models.length - active.length, winners, strike: ratio(winners, active.length), expectedWinners,
    calibration: ratio(winners, expectedWinners), marketExpectedWinners, ae: ratio(pricedWinners, marketExpectedWinners),
    pricedSelections: profits.length, profitLoss,
    roi: profits.length === models.length && active.length > 0 && profitLoss !== null ? profitLoss / active.length : null,
    valueSelections: valueModels.length, valueWinners: valueModels.filter((model) => hurdlePairLeader(model).outcome?.won).length,
    valueProfitLoss, valueRoi: valueProfits.length === valueModels.length && valueStakes > 0 && valueProfitLoss !== null ? valueProfitLoss / valueStakes : null };
}
function priceFor(model: HurdlePairModel, context: "captured" | "finalSp") {
  const price = context === "captured" ? model.prices.early?.decimalPrice : hurdlePairLeader(model).outcome?.finalSp;
  return price != null && Number.isFinite(price) && price > 1 ? price : null;
}
export function summarizeHurdlePairs(data: HurdlePairData) {
  const settled = data.races.filter((race) => race.settledAt !== null && !race.control.excludedReason && !race.challenger.excludedReason);
  const disagreements = settled.filter((race) => race.classification === "DISAGREE");
  const outcomeCount = (controlWon: boolean, challengerWon: boolean) => disagreements.filter((race) => hurdlePairLeader(race.control).outcome?.won === controlWon && hurdlePairLeader(race.challenger).outcome?.won === challengerWon).length;
  const models = (key: ModelKey) => settled.map((race) => race[key]);
  return { tracked: data.races.length, settled: data.races.filter((race) => race.settledAt !== null).length, cleanSettled: settled.length,
    excluded: data.races.filter((race) => race.control.excludedReason || race.challenger.excludedReason).length,
    agree: data.races.filter((race) => race.classification === "AGREE").length,
    disagree: data.races.filter((race) => race.classification === "DISAGREE").length,
    control: modelMetrics(models("control")), challenger: modelMetrics(models("challenger")),
    disagreement: { challengerWins: outcomeCount(false, true), controlWins: outcomeCount(true, false), bothLose: outcomeCount(false, false), bothWin: outcomeCount(true, true),
      voidPairs: disagreements.filter((race) => hurdlePairLeader(race.control).outcome?.won === null || hurdlePairLeader(race.challenger).outcome?.won === null).length },
    longPrice: (["captured", "finalSp"] as const).flatMap((context) => (["control", "challenger"] as const).flatMap((key) => ([false, true] as const).map((long) => ({
      context, model: key, band: long ? ">14/1" : "<=14/1",
      ...modelMetrics(models(key).filter((model) => { const price = priceFor(model, context); return price !== null && (price > 15) === long; }), context),
    })))) };
}
function ratio(a: number, b: number) { return b > 0 ? a / b : null; }
function n(value: number | null) { return value === null ? "-" : value.toFixed(4); }
export function renderHurdlePairSummary(data: HurdlePairData) {
  const s = summarizeHurdlePairs(data);
  const line = (label: string, m: ReturnType<typeof modelMetrics>) => `${label}: selections ${m.selections} | void ${m.voids} | winners ${m.winners} | strike ${n(m.strike)} | expected ${m.expectedWinners.toFixed(2)} | calibration ${n(m.calibration)} | A/E ${n(m.ae)} | qualifying-price GBP1 P/L ${n(m.profitLoss)} (${m.pricedSelections} priced) | ROI ${n(m.roi)} | VALUE selections ${m.valueSelections} | VALUE winners ${m.valueWinners} | VALUE P/L ${n(m.valueProfitLoss)} | VALUE ROI ${n(m.valueRoi)}`;
  return ["HURDLE TISSUE CHALLENGER - Prospective shadow only", `Version: ${data.version} | Epoch: ${data.epoch}`,
    `Tracked races: ${s.tracked} | Settled races: ${s.settled} | Clean settled: ${s.cleanSettled} | Agree: ${s.agree} | Disagree: ${s.disagree} | Excluded: ${s.excluded}`,
    "Model performance below uses clean settled pairs; pending races and void rank-1 stakes are excluded from strike/calibration.",
    line("CONTROL Jump Tissue V1", s.control), line("CHALLENGER Hurdle Tissue - Excuse Half", s.challenger),
    `Disagreement: challenger winner / control loser ${s.disagreement.challengerWins} | control winner / challenger loser ${s.disagreement.controlWins} | both lose ${s.disagreement.bothLose} | both win ${s.disagreement.bothWin} | void pairs ${s.disagreement.voidPairs}`,
    ...s.longPrice.map((band) => line(`${band.context} ${band.model} ${band.band}`, band)),
    "No automatic promotion. Reconsider only after a meaningful prospective sample; historical gains were modest and did not solve long-price calibration.",
  ].join("\n");
}
export function renderHurdlePairDay(data: HurdlePairData, date: string, results = false) {
  const rows = data.races.filter((race) => race.raceDate === date && (!results || race.settledAt !== null)).sort((a, b) => a.control.scheduledOffAt.localeCompare(b.control.scheduledOffAt));
  const modelLine = (model: HurdlePairModel) => `${hurdlePairLeader(model).horseName} p=${n(hurdlePairLeader(model).probability)} VALUE=${model.valueQualified === null ? "-" : model.valueQualified ? "yes" : "no"} price=${n(model.prices.early?.decimalPrice ?? null)} ${hurdlePairOutcome(model)} GBP1 P/L=${n(model.selectedPriceProfitLoss.early)}`;
  return [`HURDLE TISSUE CHALLENGER ${results ? "results" : "today"} - ${date} - Prospective shadow only`,
    ...rows.map((race) => `${formatRaceTimeForDisplay({ raceDateTime: new Date(race.control.scheduledOffAt), scheduledTime: race.control.scheduledTime })} ${race.course} | CONTROL ${modelLine(race.control)} | CHALLENGER ${modelLine(race.challenger)} | ${race.classification}${race.control.excludedReason ? ` | excluded: ${race.control.excludedReason}` : ""}`),
    ...(!rows.length ? ["No prospective Hurdle pairs for this date."] : []),
  ].join("\n");
}
