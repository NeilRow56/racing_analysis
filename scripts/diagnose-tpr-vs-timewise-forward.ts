import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { winGrossReturn } from "../src/lib/racing/win-settlement";
import type { CanonicalTurfPerformanceRatingInput } from "../src/lib/racing/turf-performance-rating";

export const TRACKER_VERSION = "tpr_timewise_forward_v4" as const;
export const DEFAULT_DATA_PATH = "data/research/tpr-vs-timewise-forward.json";
export const DEFAULT_REPORT_PATH = "/tmp/tpr-vs-timewise-forward.md";

export type ForwardRaceInput = {
  family?: "turf" | "all_weather";
  raceDate: string;
  course: string;
  raceTime: string;
  winner: string | null;
  winnerSp: number | null;
  winners?: ForwardWinner[];
  tprRank1: string | null;
  tprRank2: string | null;
  tprRank1NonRunner?: boolean;
  tprRank2NonRunner?: boolean;
  timewiseRank1: string | null;
  timewiseRank2: string | null;
  timewiseRank1NonRunner?: boolean;
  timewiseRank2NonRunner?: boolean;
  w50Rank1: string | null;
  w50Rank1NonRunner?: boolean;
  tprInputSnapshot?: ForwardTprInputSnapshot | null;
  awBestL3SpeedRank1?: string | null;
  awBestL3PerformanceRank1?: string | null;
  orRank1: string | null;
  winnerOrRank: number | null;
  timewiseRecordedAt?: string | null;
  timewiseRecordedPreRace?: boolean | null;
  timewiseUpdatedAt?: string | null;
};

export type ForwardTprInputSnapshot = {
  version: "tpr_forward_snapshot_v1";
  runners: Array<{
    runnerId: string;
    horseName: string;
    input: CanonicalTurfPerformanceRatingInput;
    w100Rating: number | null;
    w100RawRating: number | null;
    w100Rank: number | null;
    w100RelativeWeightContribution: number | null;
    w50Rating: number | null;
    w50RawRating: number | null;
    w50Rank: number | null;
    w50RelativeWeightContribution: number | null;
  }>;
};

export type ForwardWinner = { horseName: string; decimalOdds: number | null };

export type ForwardRaceRecord = Omit<ForwardRaceInput, "winners" | "family" | "awBestL3SpeedRank1" | "awBestL3PerformanceRank1"> & {
  family: "turf" | "all_weather";
  winners: ForwardWinner[];
  awBestL3SpeedRank1: string | null;
  awBestL3PerformanceRank1: string | null;
  winnerWasTprRank1: boolean | null;
  winnerWasTprTop2: boolean | null;
  winnerWasTimewiseRank1: boolean | null;
  winnerWasTimewiseTop2: boolean | null;
  rank1Agree: boolean | null;
  winnerWasTprOnlyTop2: boolean | null;
  winnerWasTimewiseOnlyTop2: boolean | null;
  bothTop2CapturedWinner: boolean | null;
  neitherTop2CapturedWinner: boolean | null;
  tpr1AgreesWithOr1: boolean | null;
  w50AgreesWithOr1: boolean | null;
  timewise1AgreesWithOr1: boolean | null;
  winnerIsOr1: boolean | null;
};

export type TrackerData = {
  version: typeof TRACKER_VERSION;
  races: ForwardRaceRecord[];
};

export type TrackerMutationTiming = {
  lockWaitMs: number;
  fileReadMs: number;
  mutationMs: number;
  atomicWriteMs: number;
};

export function createRecord(input: ForwardRaceInput): ForwardRaceRecord {
  validateInput(input);
  const family = input.family ?? "turf";
  const winners = winnerEntries(input);
  const timewiseRank1Active = input.timewiseRank1 !== null && !input.timewiseRank1NonRunner;
  const timewiseRank2Active = input.timewiseRank2 !== null && !input.timewiseRank2NonRunner;
  const timewiseTop2Available = timewiseRank1Active || timewiseRank2Active;
  const tprRank1Active = input.tprRank1 !== null && !input.tprRank1NonRunner;
  const tprRank2Active = input.tprRank2 !== null && !input.tprRank2NonRunner;
  const tprTop2Available = tprRank1Active || tprRank2Active;
  const winnerWasTprRank1 = winners.length === 0 || !tprRank1Active ? null : hasWinner(winners, input.tprRank1);
  const winnerWasTprTop2 = winners.length === 0 || !tprTop2Available
    ? null
    : (tprRank1Active && hasWinner(winners, input.tprRank1)) ||
      (tprRank2Active && hasWinner(winners, input.tprRank2));
  const winnerWasTimewiseRank1 = winners.length === 0 || !timewiseRank1Active ? null : hasWinner(winners, input.timewiseRank1);
  const winnerWasTimewiseTop2 = winners.length === 0 || !timewiseTop2Available
    ? null
    : (timewiseRank1Active && hasWinner(winners, input.timewiseRank1)) ||
      (timewiseRank2Active && hasWinner(winners, input.timewiseRank2));
  return {
    ...input,
    family,
    awBestL3SpeedRank1: input.awBestL3SpeedRank1 ?? null,
    awBestL3PerformanceRank1: input.awBestL3PerformanceRank1 ?? null,
    winners,
    winnerWasTprRank1,
    winnerWasTprTop2,
    winnerWasTimewiseRank1,
    winnerWasTimewiseTop2,
    rank1Agree: !tprRank1Active || !timewiseRank1Active ? null : sameHorse(input.tprRank1, input.timewiseRank1),
    winnerWasTprOnlyTop2: winners.length === 0 || !tprTop2Available || !timewiseTop2Available ? null : winnerWasTprTop2! && !winnerWasTimewiseTop2,
    winnerWasTimewiseOnlyTop2: winners.length === 0 || !tprTop2Available || !timewiseTop2Available ? null : winnerWasTimewiseTop2! && !winnerWasTprTop2,
    bothTop2CapturedWinner: winners.length === 0 || !tprTop2Available || !timewiseTop2Available ? null : winnerWasTprTop2! && winnerWasTimewiseTop2!,
    neitherTop2CapturedWinner: winners.length === 0 || !tprTop2Available || !timewiseTop2Available ? null : !winnerWasTprTop2 && !winnerWasTimewiseTop2,
    tpr1AgreesWithOr1: !tprRank1Active ? null : agreement(input.tprRank1, input.orRank1),
    w50AgreesWithOr1: input.w50Rank1NonRunner ? null : agreement(input.w50Rank1, input.orRank1),
    timewise1AgreesWithOr1: !timewiseRank1Active ? null : agreement(input.timewiseRank1, input.orRank1),
    winnerIsOr1: agreement(input.winner, input.orRank1),
  };
}

export function summarize(races: ForwardRaceRecord[]) {
  const cleanRaces = cleanComparisonRaces(races);
  const settled = cleanRaces.filter((race) => race.winners.length > 0);
  const tprRank1Races = settled.filter(hasActiveTprRank1);
  const tprTop2Races = settled.filter(hasActiveTprTop2);
  const timewiseRank1Races = settled.filter(hasActiveTimewiseRank1);
  const timewiseTop2Races = settled.filter(hasActiveTimewiseTop2);
  const disagreement = timewiseRank1Races.filter((race) => race.rank1Agree === false);
  const priced = tprRank1Races.filter(hasPricedResult);
  const timewisePriced = timewiseRank1Races.filter(hasPricedResult);
  const tprWinningPrices = priced.map((race) => winningPriceFor(race, race.tprRank1)).filter((value): value is number => value !== null);
  const timewiseWinningPrices = timewisePriced.map((race) => winningPriceFor(race, race.timewiseRank1)).filter((value): value is number => value !== null);
  return {
    racesTracked: races.length,
    comparisonRaces: cleanRaces.length,
    preRaceEntries: count(races, (race) => race.timewiseRecordedPreRace === true),
    postRaceEntries: count(races, (race) => race.timewiseRecordedPreRace === false),
    timingUnknownEntries: count(races, (race) => race.timewiseRecordedPreRace == null),
    timewiseRank1NonRunners: count(races, (race) => race.timewiseRank1NonRunner === true),
    timewiseRank2NonRunners: count(races, (race) => race.timewiseRank2NonRunner === true),
    timewiseBothNonRunners: count(races, (race) => race.timewiseRank1NonRunner === true && race.timewiseRank2NonRunner === true),
    tprRank1NonRunners: count(races, (race) => race.tprRank1NonRunner === true),
    tprRank2NonRunners: count(races, (race) => race.tprRank2NonRunner === true),
    w50Rank1NonRunners: count(races, (race) => race.w50Rank1NonRunner === true),
    tprRank1Races: tprRank1Races.length,
    tprTop2Races: tprTop2Races.length,
    tprRank1Winners: count(tprRank1Races, (race) => race.winnerWasTprRank1 === true),
    tprRank1Strike: rate(count(tprRank1Races, (race) => race.winnerWasTprRank1 === true), tprRank1Races.length),
    tprTop2Capture: rate(count(tprTop2Races, (race) => race.winnerWasTprTop2 === true), tprTop2Races.length),
    timewiseRank1Races: timewiseRank1Races.length,
    timewiseTop2Races: timewiseTop2Races.length,
    timewiseRank1Winners: count(timewiseRank1Races, (race) => race.winnerWasTimewiseRank1 === true),
    timewiseRank1Strike: rate(count(timewiseRank1Races, (race) => race.winnerWasTimewiseRank1 === true), timewiseRank1Races.length),
    timewiseTop2Capture: rate(count(timewiseTop2Races, (race) => race.winnerWasTimewiseTop2 === true), timewiseTop2Races.length),
    rank1AgreementRaces: timewiseRank1Races.length - disagreement.length,
    rank1DisagreementRaces: disagreement.length,
    tprWinnersInDisagreement: count(disagreement, (race) => race.winnerWasTprRank1),
    timewiseWinnersInDisagreement: count(disagreement, (race) => race.winnerWasTimewiseRank1),
    neitherInDisagreement: count(disagreement, (race) => !race.winnerWasTprRank1 && !race.winnerWasTimewiseRank1),
    pricedRaces: priced.length,
    timewisePricedRaces: timewisePriced.length,
    tprLevelStakeReturn: levelStakeReturn(priced, "tpr"),
    timewiseLevelStakeReturn: levelStakeReturn(timewisePriced, "timewise"),
    tprAverageWinnerSp: average(tprWinningPrices),
    timewiseAverageWinnerSp: average(timewiseWinningPrices),
  };
}

export function orAgreementSummaries(races: ForwardRaceRecord[]) {
  races = cleanComparisonRaces(races);
  return [
    agreementSummary(races, "TPR W100", true, (race) => race.tpr1AgreesWithOr1, (race) => race.winnerWasTprRank1),
    agreementSummary(races, "TPR W100", false, (race) => race.tpr1AgreesWithOr1, (race) => race.winnerWasTprRank1),
    agreementSummary(races, "W50", true, (race) => race.w50AgreesWithOr1, (race) => hasActiveW50Rank1(race) && hasWinner(race.winners, race.w50Rank1)),
    agreementSummary(races, "W50", false, (race) => race.w50AgreesWithOr1, (race) => hasActiveW50Rank1(race) && hasWinner(race.winners, race.w50Rank1)),
  ];
}

export function disagreementByOrContext(races: ForwardRaceRecord[]) {
  races = cleanComparisonRaces(races);
  return [true, false].map((agrees) => {
    const rows = races.filter((race) => race.winners.length > 0 && race.rank1Agree === false && race.tpr1AgreesWithOr1 === agrees);
    return {
      context: agrees ? "TPR agrees with OR" : "TPR does not agree with OR",
      races: rows.length,
      tprWinners: count(rows, (race) => race.winnerWasTprRank1),
      timewiseWinners: count(rows, (race) => race.winnerWasTimewiseRank1),
      neither: count(rows, (race) => !race.winnerWasTprRank1 && !race.winnerWasTimewiseRank1),
      netWinnerDifference: count(rows, (race) => race.winnerWasTprRank1) - count(rows, (race) => race.winnerWasTimewiseRank1),
    };
  });
}

export function renderReport(data: TrackerData, dataPath = DEFAULT_DATA_PATH): string {
  const summary = summarize(data.races);
  const lines = [
    "# TPR vs Timewise Forward Tracker", "",
    `Manual diagnostic tracker. Data: \`${dataPath}\`. TPR and Timewise rankings are entered independently; no rating is inferred.`, "",
    "## Cumulative summary", "",
  ];
  table(lines, [{
    "races tracked": summary.racesTracked,
    "clean comparison races": summary.comparisonRaces,
    "pre-race entries": summary.preRaceEntries,
    "post-race/backfilled entries": summary.postRaceEntries,
    "timing unknown": summary.timingUnknownEntries,
    "Timewise R1 non-runners": summary.timewiseRank1NonRunners,
    "Timewise R2 non-runners": summary.timewiseRank2NonRunners,
    "both Timewise selections NR": summary.timewiseBothNonRunners,
    "TPR R1 non-runners": summary.tprRank1NonRunners,
    "TPR R2 non-runners": summary.tprRank2NonRunners,
    "W50 R1 non-runners": summary.w50Rank1NonRunners,
    "TPR rank-1 winners": summary.tprRank1Winners,
    "TPR rank-1 strike": pct(summary.tprRank1Strike),
    "TPR top-2 capture": pct(summary.tprTop2Capture),
    "Timewise rank-1 winners": summary.timewiseRank1Winners,
    "Timewise rank-1 strike": pct(summary.timewiseRank1Strike),
    "Timewise top-2 capture": pct(summary.timewiseTop2Capture),
    "rank-1 agreement races": summary.rank1AgreementRaces,
    "rank-1 disagreement races": summary.rank1DisagreementRaces,
    "TPR winners in disagreements": summary.tprWinnersInDisagreement,
    "Timewise winners in disagreements": summary.timewiseWinnersInDisagreement,
    "neither in disagreements": summary.neitherInDisagreement,
  }]);
  lines.push("## Official Rating agreement splits", "");
  table(lines, orAgreementSummaries(data.races).map((value) => ({
    rating: value.rating,
    "OR agreement": value.agrees ? "yes" : "no",
    races: value.races,
    "rank-1 winners": value.winners,
    strike: pct(value.strike),
    "average winner SP": number(value.averageWinnerSp),
    "priced races": value.pricedRaces,
    "£1 level-stake return": money(value.levelStakeReturn),
    ROI: pct(value.roi),
  })));
  lines.push("## TPR vs Timewise disagreements by OR context", "");
  table(lines, disagreementByOrContext(data.races).map((value) => ({
    context: value.context,
    races: value.races,
    "TPR winners": value.tprWinners,
    "Timewise winners": value.timewiseWinners,
    neither: value.neither,
    "net winner difference (TPR-Timewise)": value.netWinnerDifference,
  })));
  lines.push("## SP returns", "");
  table(lines, [{
    "TPR priced races": summary.pricedRaces,
    "Timewise rank-1 priced races": summary.timewisePricedRaces,
    "TPR £1 level-stake return": money(summary.tprLevelStakeReturn),
    "Timewise £1 level-stake return": money(summary.timewiseLevelStakeReturn),
    "TPR average winner SP": number(summary.tprAverageWinnerSp),
    "Timewise average winner SP": number(summary.timewiseAverageWinnerSp),
  }]);
  lines.push("Returns use one £1 stake in each race with winner final SP/BSP recorded. A winning rank-1 selection returns the recorded decimal winner price; otherwise it returns zero. Missing W100 context is unavailable rather than a loss, and W100 top-two capture uses whichever score-ordered selections exist. Timewise rank-1 non-runners are unavailable and excluded from rank-1 and disagreement denominators; top-two capture uses only surviving published selections without promotion.", "", "## Races", "");
  table(lines, [...data.races].sort(compareRaces).map((race) => ({
    family: race.family,
    date: race.raceDate,
    course: race.course,
    time: race.raceTime,
    winner: race.winner,
    "winner SP": number(race.winnerSp),
    "TPR 1": timewiseSlotLabel(race.tprRank1, race.tprRank1NonRunner),
    "TPR 2": timewiseSlotLabel(race.tprRank2, race.tprRank2NonRunner),
    "TPR R1 won": yesNo(race.winnerWasTprRank1),
    "TPR top2 won": yesNo(race.winnerWasTprTop2),
    "Timewise 1": timewiseSlotLabel(race.timewiseRank1, race.timewiseRank1NonRunner),
    "Timewise 2": timewiseSlotLabel(race.timewiseRank2, race.timewiseRank2NonRunner),
    "W50 1": timewiseSlotLabel(race.w50Rank1, race.w50Rank1NonRunner),
    "OR 1": race.orRank1 ?? "-",
    "winner OR rank": race.winnerOrRank ?? "-",
    "Timewise recorded at": race.timewiseRecordedAt ?? "-",
    "recorded pre-race": yesNoMissing(race.timewiseRecordedPreRace ?? null),
    "Timewise updated at": race.timewiseUpdatedAt ?? "-",
    "TPR=OR": yesNoMissing(race.tpr1AgreesWithOr1),
    "W50=OR": yesNoMissing(race.w50AgreesWithOr1),
    "TW=OR": yesNoMissing(race.timewise1AgreesWithOr1),
    "winner=OR1": yesNoMissing(race.winnerIsOr1),
    "TW R1 won": yesNo(race.winnerWasTimewiseRank1),
    "TW top2 won": yesNo(race.winnerWasTimewiseTop2),
    "R1 agree": yesNo(race.rank1Agree),
    "TPR-only top2": yesNo(race.winnerWasTprOnlyTop2),
    "TW-only top2": yesNo(race.winnerWasTimewiseOnlyTop2),
    "both top2": yesNo(race.bothTop2CapturedWinner),
    "neither top2": yesNo(race.neitherTop2CapturedWinner),
  })));
  return `${lines.join("\n")}\n`;
}

export function renderSummary(data: TrackerData): string {
  const turf = renderFamilySummary(data.races.filter((race) => race.family === "turf"), "turf");
  const allWeather = renderFamilySummary(data.races.filter((race) => race.family === "all_weather"), "all_weather");
  return ["## Turf", "", turf, "", "## All Weather", "", allWeather].join("\n");
}

function renderFamilySummary(records: ForwardRaceRecord[], family: "turf" | "all_weather"): string {
  const overall = summarize(records);
  const settledRaces = cleanComparisonRaces(records).filter((race) => race.winners.length > 0);
  const w50Races = settledRaces.filter(hasActiveW50Rank1);
  const w50Winners = count(w50Races, (race) => hasWinner(race.winners, race.w50Rank1!));
  const w50Priced = w50Races.filter(hasPricedResult);
  const w50Return = rank1Return(w50Priced, (race) => race.w50Rank1);
  const tprReturn = overall.pricedRaces === 0 ? null : overall.tprLevelStakeReturn;
  const timewiseReturn = overall.timewisePricedRaces === 0 ? null : overall.timewiseLevelStakeReturn;
  const timewiseRoi = timewiseReturn === null ? null : rate(timewiseReturn, overall.timewisePricedRaces);
  const tprRoi = tprReturn === null ? null : rate(tprReturn, overall.pricedRaces);
  const w50Roi = w50Return === null ? null : rate(w50Return, w50Priced.length);
  const w100Timewise = pairwiseDisagreement(settledRaces.filter(hasActiveTimewiseRank1), (race) => race.tprRank1, (race) => race.timewiseRank1);
  const w50W100 = pairwiseDisagreement(w50Races, (race) => race.w50Rank1!, (race) => race.tprRank1);
  const orSplits = orAgreementSummaries(records);
  const split = (rating: "TPR W100" | "W50", agrees: boolean) => orSplits.find((value) => value.rating === rating && value.agrees === agrees)!;
  const common = [
    `Races tracked: ${overall.racesTracked}`,
    `Timing: ${overall.preRaceEntries} pre-race | ${overall.postRaceEntries} post-race/backfilled | ${overall.timingUnknownEntries} unknown`,
    `Clean comparison sample: ${overall.comparisonRaces}`,
    `Timewise non-runners: R1 ${overall.timewiseRank1NonRunners} | R2 ${overall.timewiseRank2NonRunners} | both ${overall.timewiseBothNonRunners}`,
    `TPR non-runners: W100 R1 ${overall.tprRank1NonRunners} | W100 R2 ${overall.tprRank2NonRunners} | W50 R1 ${overall.w50Rank1NonRunners}`,
    "",
    "W100",
    `  Rank-1 winners: ${overall.tprRank1Winners}`,
    `  Strike: ${pct(overall.tprRank1Strike)}`,
    `  £1 return / ROI (${overall.pricedRaces} priced): ${money(tprReturn)} / ${pct(tprRoi)}`,
    "",
    "W50",
    `  Rank-1 winners: ${w50Winners}`,
    `  Strike: ${pct(rate(w50Winners, w50Races.length))}`,
    `  £1 return / ROI (${w50Priced.length} priced): ${money(w50Return)} / ${pct(w50Roi)}`,
    "",
    "Timewise",
    `  Rank-1 winners: ${overall.timewiseRank1Winners}`,
    `  Strike: ${pct(overall.timewiseRank1Strike)}`,
    `  Top-2 capture: ${pct(overall.timewiseTop2Capture)}`,
    `  £1 return / ROI (${overall.timewisePricedRaces} priced): ${money(timewiseReturn)} / ${pct(timewiseRoi)}`,
    `  Average winning SP: ${number(overall.timewiseAverageWinnerSp)}`,
    "  A/E: unavailable (losing selections' final SP is not persisted)",
  ];
  if (family === "all_weather") {
    return [
      ...common.slice(0, 4),
      `Pending: ${records.filter((race) => race.winners.length === 0).length}`,
      "",
      ...common.slice(common.indexOf("Timewise")),
      "",
      awComparisonLine("Best L3 Speed", settledRaces, (race) => race.awBestL3SpeedRank1 ?? null),
      awComparisonLine("Best L3 Performance", settledRaces, (race) => race.awBestL3PerformanceRank1 ?? null),
      awComparisonLine("OR", settledRaces, (race) => race.orRank1),
    ].join("\n");
  }
  return [
    ...common,
    "",
    "W100 vs Timewise disagreements",
    `  Races: ${w100Timewise.races} | W100 winners: ${w100Timewise.leftWinners} | Timewise winners: ${w100Timewise.rightWinners} | Neither: ${w100Timewise.neither}`,
    "",
    "W50 vs W100 disagreements",
    `  Races: ${w50W100.races} | W50 winners: ${w50W100.leftWinners} | W100 winners: ${w50W100.rightWinners} | Neither: ${w50W100.neither}`,
    "",
    "OR agreement",
    `  W100 + OR: ${split("TPR W100", true).races} races / ${pct(split("TPR W100", true).strike)}`,
    `  W100 without OR: ${split("TPR W100", false).races} races / ${pct(split("TPR W100", false).strike)}`,
    `  W50 + OR: ${split("W50", true).races} races / ${pct(split("W50", true).strike)}`,
    "",
    "Exclusive top-two capture",
    `  TPR-only: ${count(settledRaces, (race) => race.winnerWasTprOnlyTop2)} | Timewise-only: ${count(settledRaces, (race) => race.winnerWasTimewiseOnlyTop2)} | Both: ${count(settledRaces, (race) => race.bothTop2CapturedWinner)} | Neither: ${count(settledRaces, (race) => race.neitherTop2CapturedWinner)}`,
  ].join("\n");
}

export function upsertRace(data: TrackerData, record: ForwardRaceRecord, replace = false): TrackerData {
  const index = data.races.findIndex((race) => forwardRaceKey(race) === forwardRaceKey(record));
  if (index >= 0 && !replace) throw new Error(`Race already tracked: ${forwardRaceKey(record)}. Pass --replace to correct it.`);
  const races = [...data.races];
  if (index >= 0) races[index] = record;
  else races.push(record);
  return { version: TRACKER_VERSION, races: races.sort(compareRaces) };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "report";
  const dataPath = valueAfter(args, "--data") ?? DEFAULT_DATA_PATH;
  const reportPath = valueAfter(args, "--output") ?? DEFAULT_REPORT_PATH;
  const data = await loadTrackerData(dataPath);
  if (command === "summary") {
    console.log(renderSummary(data));
    return;
  }
  if (command === "add") {
    const input: ForwardRaceInput = {
      raceDate: required(args, "--date"),
      course: required(args, "--course"),
      raceTime: required(args, "--time"),
      winner: required(args, "--winner"),
      winnerSp: optionalNumber(valueAfter(args, "--winner-sp")),
      tprRank1: required(args, "--tpr1"),
      tprRank2: required(args, "--tpr2"),
      timewiseRank1: required(args, "--timewise1"),
      timewiseRank2: required(args, "--timewise2"),
      timewiseRank1NonRunner: false,
      timewiseRank2NonRunner: false,
      w50Rank1: optionalText(valueAfter(args, "--w50") ?? valueAfter(args, "--w50-1")),
      orRank1: optionalText(valueAfter(args, "--or1")),
      winnerOrRank: optionalPositiveInteger(valueAfter(args, "--winner-or-rank")),
      timewiseRecordedAt: null,
      timewiseRecordedPreRace: null,
      timewiseUpdatedAt: null,
    };
    const replace = args.includes("--replace");
    let record: ForwardRaceRecord | null = null;
    const updated = await mutateTrackerData((latest) => {
      const existing = replace
        ? latest.races.find((race) => forwardRaceKey(race) === forwardRaceKey(input))
        : undefined;
      const currentRecord = createRecord({
        ...input,
        timewiseRecordedAt: existing?.timewiseRecordedAt ?? input.timewiseRecordedAt,
        timewiseRecordedPreRace: existing?.timewiseRecordedPreRace ?? input.timewiseRecordedPreRace,
        timewiseUpdatedAt: existing ? new Date().toISOString() : input.timewiseUpdatedAt,
      });
      record = currentRecord;
      return upsertRace(latest, currentRecord, replace);
    }, dataPath);
    await writeReport(reportPath, renderReport(updated, dataPath));
    console.log(`Tracked ${forwardRaceKey(record!)}; wrote ${dataPath} and ${reportPath}`);
    return;
  }
  if (command !== "report") throw new Error(`Unknown command: ${command}. Use add, report, or summary.`);
  await writeReport(reportPath, renderReport(data, dataPath));
  console.log(`Wrote ${reportPath} from ${dataPath} (${data.races.length} races)`);
}

export async function loadTrackerData(path = DEFAULT_DATA_PATH): Promise<TrackerData> {
  try {
    return parseTrackerData(JSON.parse(await readFile(path, "utf8")), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: TRACKER_VERSION, races: [] };
    throw error;
  }
}

export async function saveTrackerRace(record: ForwardRaceRecord, replace = false, path = DEFAULT_DATA_PATH): Promise<TrackerData> {
  return mutateTrackerData((data) => upsertRace(data, record, replace), path);
}

export async function mutateTrackerData(
  mutation: (latest: TrackerData) => TrackerData | Promise<TrackerData>,
  path = DEFAULT_DATA_PATH,
  onTiming?: (timing: TrackerMutationTiming) => void,
): Promise<TrackerData> {
  const lockStartedAt = performance.now();
  return withTrackerLock(path, async () => {
    const lockWaitMs = performance.now() - lockStartedAt;
    const readStartedAt = performance.now();
    const latest = await loadTrackerData(path);
    const fileReadMs = performance.now() - readStartedAt;
    const mutationStartedAt = performance.now();
    const updated = await mutation(latest);
    const mutationMs = performance.now() - mutationStartedAt;
    const writeStartedAt = performance.now();
    await writeData(path, updated);
    const atomicWriteMs = performance.now() - writeStartedAt;
    onTiming?.({ lockWaitMs, fileReadMs, mutationMs, atomicWriteMs });
    return updated;
  });
}

export function parseTrackerData(value: unknown, source = "tracker data"): TrackerData {
  const parsed = value as Partial<TrackerData> & { version?: string; races?: Array<Partial<ForwardRaceInput>> };
  if (![TRACKER_VERSION, "tpr_timewise_forward_v3", "tpr_timewise_forward_v2", "tpr_timewise_forward_v1"].includes(parsed.version ?? "") || !Array.isArray(parsed.races)) throw new Error(`Unsupported tracker data in ${source}`);
  return { version: TRACKER_VERSION, races: parsed.races.map((race) => createRecord({ ...(race as ForwardRaceInput), family: race.family ?? "turf", timewiseRank1NonRunner: race.timewiseRank1NonRunner ?? false, timewiseRank2NonRunner: race.timewiseRank2NonRunner ?? false, w50Rank1: race.w50Rank1 ?? null, awBestL3SpeedRank1: race.awBestL3SpeedRank1 ?? null, awBestL3PerformanceRank1: race.awBestL3PerformanceRank1 ?? null, orRank1: race.orRank1 ?? null, winnerOrRank: race.winnerOrRank ?? null, timewiseRecordedAt: race.timewiseRecordedAt ?? null, timewiseRecordedPreRace: race.timewiseRecordedPreRace ?? null, timewiseUpdatedAt: race.timewiseUpdatedAt ?? null })) };
}

async function writeData(path: string, data: TrackerData) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function withTrackerLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(path)}.lock`;
  const deadline = Date.now() + 30_000;
  await mkdir(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}
async function writeReport(path: string, report: string) { await mkdir(dirname(resolve(path)), { recursive: true }); await writeFile(path, report, "utf8"); }
function validateInput(input: ForwardRaceInput) { if (input.family !== undefined && input.family !== "turf" && input.family !== "all_weather") throw new Error("family must be turf or all_weather"); if (!/^\d{4}-\d{2}-\d{2}$/.test(input.raceDate)) throw new Error("--date must be YYYY-MM-DD"); if (!/^\d{1,2}:\d{2}$/.test(input.raceTime)) throw new Error("--time must be HH:MM"); for (const [field, value] of Object.entries(input)) if (!["winner", "winnerSp", "timewiseRank1", "timewiseRank2", "w50Rank1", "orRank1", "winnerOrRank"].includes(field) && typeof value === "string" && !value.trim()) throw new Error(`${field} is required`); if (input.winnerSp !== null && (!Number.isFinite(input.winnerSp) || input.winnerSp <= 1)) throw new Error("--winner-sp must be decimal odds greater than 1"); if (input.winnerOrRank !== null && (!Number.isInteger(input.winnerOrRank) || input.winnerOrRank < 1)) throw new Error("--winner-or-rank must be a positive integer"); if (sameHorse(input.tprRank1, input.tprRank2)) throw new Error("TPR rank 1 and rank 2 must differ"); if (sameHorse(input.timewiseRank1, input.timewiseRank2)) throw new Error("Timewise rank 1 and rank 2 must differ"); }
function sameHorse(left: string | null, right: string | null) { return left !== null && right !== null && normalize(left) === normalize(right); }
function agreement(left: string | null, right: string | null) { return left === null || right === null ? null : sameHorse(left, right); }
function normalize(value: string) { return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " "); }
export function cleanComparisonRaces(races: ForwardRaceRecord[]) { return races.filter((race) => race.timewiseRecordedPreRace !== false); }
function hasActiveTimewiseRank1(race: ForwardRaceRecord) { return race.timewiseRank1 !== null && race.timewiseRank1NonRunner !== true; }
function hasActiveTimewiseTop2(race: ForwardRaceRecord) { return hasActiveTimewiseRank1(race) || (race.timewiseRank2 !== null && race.timewiseRank2NonRunner !== true); }
function hasActiveTprRank1(race: ForwardRaceRecord) { return race.tprRank1 !== null && race.tprRank1NonRunner !== true; }
function hasActiveTprTop2(race: ForwardRaceRecord) { return hasActiveTprRank1(race) || (race.tprRank2 !== null && race.tprRank2NonRunner !== true); }
function hasActiveW50Rank1(race: ForwardRaceRecord) { return race.w50Rank1 !== null && race.w50Rank1NonRunner !== true; }
function timewiseSlotLabel(horse: string | null, nonRunner: boolean | undefined) { return nonRunner ? "Non-runner" : horse ?? "-"; }
export function forwardRaceKey(race: Pick<ForwardRaceInput, "raceDate" | "course" | "raceTime">) { return `${race.raceDate}|${normalize(race.course)}|${race.raceTime}`; }
function compareRaces(left: ForwardRaceInput, right: ForwardRaceInput) { return left.raceDate.localeCompare(right.raceDate) || left.raceTime.localeCompare(right.raceTime) || left.course.localeCompare(right.course); }
function levelStakeReturn(races: ForwardRaceRecord[], source: "tpr" | "timewise") { return races.reduce((sum, race) => sum + selectionReturn(race, source === "tpr" ? race.tprRank1 : race.timewiseRank1), 0) - races.length; }
function rank1Return(races: ForwardRaceRecord[], selection: (race: ForwardRaceRecord) => string | null) { return races.length === 0 ? null : races.reduce((sum, race) => sum + selectionReturn(race, selection(race)), 0) - races.length; }
function pairwiseDisagreement(races: ForwardRaceRecord[], left: (race: ForwardRaceRecord) => string | null, right: (race: ForwardRaceRecord) => string | null) { const rows = races.filter((race) => left(race) !== null && right(race) !== null && !sameHorse(left(race), right(race))); return { races: rows.length, leftWinners: count(rows, (race) => hasWinner(race.winners, left(race))), rightWinners: count(rows, (race) => hasWinner(race.winners, right(race))), neither: count(rows, (race) => !hasWinner(race.winners, left(race)) && !hasWinner(race.winners, right(race))) }; }
function awComparisonLine(label: string, races: ForwardRaceRecord[], comparison: (race: ForwardRaceRecord) => string | null) { const available = races.filter((race) => comparison(race) !== null && race.timewiseRank1 !== null), agreements = available.filter((race) => sameHorse(comparison(race), race.timewiseRank1)).length, disagreement = pairwiseDisagreement(available, comparison, (race) => race.timewiseRank1); return `${label} vs Timewise R1: agreement ${agreements} | disagreement ${disagreement.races} | Timewise only ${disagreement.rightWinners} | ${label} only ${disagreement.leftWinners} | neither ${disagreement.neither}`; }
function count<T>(values: T[], predicate: (value: T) => boolean | null) { return values.filter((value) => predicate(value) === true).length; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function optionalNumber(value: string | undefined) { if (value === undefined) return null; const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`); return parsed; }
function optionalPositiveInteger(value: string | undefined) { if (value === undefined) return null; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`); return parsed; }
function optionalText(value: string | undefined) { return value?.trim() || null; }
function valueAfter(args: string[], key: string) { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; }
function required(args: string[], key: string) { const value = valueAfter(args, key); if (!value) throw new Error(`Missing ${key}`); return value; }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(2)}%`; }
function money(value: number | null) { return value === null ? "-" : `${value < 0 ? "-" : ""}£${Math.abs(value).toFixed(2)}`; }
function number(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function yesNo(value: boolean | null) { return value === null ? "-" : value ? "yes" : "no"; }
function yesNoMissing(value: boolean | null) { return value === null ? "-" : yesNo(value); }
function agreementSummary(races: ForwardRaceRecord[], rating: "TPR W100" | "W50", agrees: boolean, context: (race: ForwardRaceRecord) => boolean | null, won: (race: ForwardRaceRecord) => boolean | null) { const rows = races.filter((race) => race.winners.length > 0 && context(race) === agrees), winners = rows.filter((race) => won(race) === true), priced = rows.filter(hasPricedResult), selection = (race: ForwardRaceRecord) => rating === "W50" ? race.w50Rank1 : race.tprRank1, levelStakeReturn = priced.length === 0 ? null : rank1Return(priced, selection); return { rating, agrees, races: rows.length, winners: winners.length, strike: rate(winners.length, rows.length), averageWinnerSp: average(winners.map((race) => winningPriceFor(race, selection(race))).filter((value): value is number => value !== null)), pricedRaces: priced.length, levelStakeReturn, roi: levelStakeReturn === null ? null : rate(levelStakeReturn, priced.length) }; }
function winnerEntries(input: ForwardRaceInput): ForwardWinner[] { return input.winners?.length ? input.winners : input.winner === null ? [] : [{ horseName: input.winner, decimalOdds: input.winnerSp }]; }
function hasWinner(winners: ForwardWinner[], horse: string | null) { return horse !== null && winners.some((winner) => sameHorse(winner.horseName, horse)); }
function winningPriceFor(race: ForwardRaceRecord, horse: string | null) { return horse === null ? null : race.winners.find((winner) => sameHorse(winner.horseName, horse))?.decimalOdds ?? null; }
function hasPricedResult(race: ForwardRaceRecord) { return race.winners.length > 0 && race.winners.every((winner) => winner.decimalOdds !== null); }
function selectionReturn(race: ForwardRaceRecord, horse: string | null) { const decimalOdds = winningPriceFor(race, horse); return decimalOdds === null ? 0 : winGrossReturn({ won: true, decimalOdds, deadHeatDivisor: race.winners.length }); }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No races tracked.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
