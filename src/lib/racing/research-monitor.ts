import { cleanAwTissueRace, currentPositiveAwTissueRankOneEdges, type AwTissueForwardData } from "./aw-tissue-forward";
import { cleanJumpTissueRace, currentPositiveJumpTissueRankOneEdges, type JumpTissueForwardData } from "./jump-tissue-forward";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";
import { summarizeJumpG4Forward, type JumpG4ForwardData } from "./jump-g4-forward";
import { currentPositiveTurfTissueRankOneEdges, type TissueForwardData } from "./tissue-forward";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice } from "./todays-racing";

export type ResearchSignalKind = "turf_tissue" | "jump_tissue" | "aw_tissue" | "jump_g4";
export type ResearchSignalCategory = "VALUE" | "SHADOW" | "DISAGREEMENT";
export const RESEARCH_SIGNALS: Record<ResearchSignalKind, { name: string; category: ResearchSignalCategory }> = {
  turf_tissue: { name: "Turf Tissue", category: "VALUE" },
  jump_tissue: { name: "Jump Tissue", category: "VALUE" },
  aw_tissue: { name: "AW Tissue", category: "VALUE" },
  jump_g4: { name: "Jump G4", category: "SHADOW" },
};
export const RESEARCH_STATUS = [
  ["Turf Tissue", "Frozen — prospective monitoring"],
  ["Jump Tissue", "Frozen model — prospective monitoring"],
  ["AW Tissue", "Frozen model — prospective monitoring"],
  ["Jump G4", "New prospective shadow"],
  ["Historical Jump trainer form", "Closed — weak / unstable"],
  ["AW feature expansion", "Closed — no replicated improvement"],
  ["Residual models", "Closed — weak / unstable"],
] as const;

export type ResearchSignal = { kind: ResearchSignalKind; reason: string; context: string; movement: string | null };
export type DailyResearchHorse = {
  raceId: string; runnerId: string; horseId: string; horseName: string; course: string;
  time: string; sortTime: string; price: number | null; priceSource: "imported_card" | "g4_capture" | null; signals: ResearchSignal[];
};
export type ProspectiveMonitor = {
  name: string; status: "FROZEN" | "MONITORING" | "SHADOW";
  tracked: number; settled: number; winners: number; strike: number | null;
  ae: number | null; roi: number | null; roiBasis: "median" | "final_sp"; pricedSettled: number; cohort: string;
};
export type ResearchDashboard = { date: string; horses: DailyResearchHorse[]; emptyMessage: string | null; monitors: ProspectiveMonitor[] };

export function mergeResearchSignals(rows: DailyResearchHorse[]): DailyResearchHorse[] {
  const unique = new Map<string, DailyResearchHorse>();
  for (const row of rows) {
    const key = `${row.raceId}|${row.runnerId}`;
    const previous = unique.get(key);
    if (!previous) unique.set(key, { ...row, signals: [...row.signals] });
    else {
      if (previous.price === null && row.price !== null) {
        previous.price = row.price;
        previous.priceSource = row.priceSource;
      }
      for (const signal of row.signals) if (!previous.signals.some((entry) => entry.kind === signal.kind)) previous.signals.push(signal);
    }
  }
  return [...unique.values()].sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course) || a.horseName.localeCompare(b.horseName));
}

export function buildResearchDashboard(input: {
  date: string; prices: SportingLifeCurrentPrice[]; turf: TissueForwardData;
  jump: JumpTissueForwardData; aw: AwTissueForwardData; g4: JumpG4ForwardData;
  ratings: ForwardValueRecord[];
}): ResearchDashboard {
  const { date, prices, turf, jump, aw, g4, ratings } = input;
  const current = new Set(prices.map((row) => `${row.raceId}|${row.runnerId}`));
  const rows: DailyResearchHorse[] = [];
  const addTissue = (kind: ResearchSignalKind, race: { raceId: string; course: string }, runner: { runnerId: string; horseId: string; horseName: string }, probability: number, price: SportingLifeCurrentPrice, edge: number, off: string, movement: string) => {
    rows.push({ raceId: race.raceId, runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName, course: race.course,
      time: price.displayRaceTime, sortTime: off, price: price.marketDecimalOdds, priceSource: "imported_card",
      signals: [{ kind, reason: `Tissue ${percent(probability)} · market ${percent(1 / price.marketDecimalOdds!)} · +${(edge * 100).toFixed(1)}pp`, context: "Tissue rank #1", movement }],
    });
  };
  const turfToday = turf.races.filter((race) => race.raceDate === date && race.recordedPreRace === true);
  for (const { race, runner, comparison } of currentPositiveTurfTissueRankOneEdges(turfToday, prices).selections) {
    const record = ratings.find((entry) => entry.raceId === race.raceId && entry.tissueRunnerId === runner.runnerId);
    addTissue("turf_tissue", race, runner, runner.probability, comparison.price, comparison.edge,
      record?.raceDateTime ?? `${date}T${comparison.price.displayRaceTime}:00`,
      priceMovement({ early: record?.tissueEarlyPriceSnapshot, t180: record?.tissueT180PriceSnapshot, t60: record?.tissueT60PriceSnapshot }));
  }
  for (const [kind, selections] of [
    ["jump_tissue", currentPositiveJumpTissueRankOneEdges(jump.races.filter((race) => race.raceDate === date && cleanJumpTissueRace(race) && race.settledAt === null), prices).selections],
    ["aw_tissue", currentPositiveAwTissueRankOneEdges(aw.races.filter((race) => race.raceDate === date && cleanAwTissueRace(race) && race.settledAt === null), prices).selections],
  ] as const) {
    for (const { race, runner, comparison } of selections) addTissue(kind, race, runner, runner.probability!, comparison.price, comparison.edge, race.scheduledOffAt, priceMovement(race.prices));
  }
  for (const row of g4.observations.filter((row) => row.raceDate === date && row.recordedPreRace && row.recordedAt >= g4.epoch && row.recordedAt < row.scheduledOff && row.outcome?.won !== null && current.has(`${row.raceId}|${row.runnerId}`))) {
    const c = row.components;
    rows.push({ raceId: row.raceId, runnerId: row.runnerId, horseId: row.horseId, horseName: row.horseName, course: row.course,
      time: formatRaceTimeForDisplay({ raceDateTime: new Date(row.scheduledOff), scheduledTime: row.scheduledTime }), sortTime: row.scheduledOff,
      price: row.market.medianBookmakerDecimal,
      priceSource: row.market.medianBookmakerDecimal === null ? null : "g4_capture",
      signals: [{ kind: "jump_g4", reason: `Avg L3 #${c.averageL3JumpSpeedRank} · class drop ${c.previousClass}→${c.currentClass} · latest speed ${number(c.latestJumpSpeed)} > ${number(c.previousJumpSpeed)}`,
        context: [`OR ${rank(row.context.officialRatingRank)}`, `JPR-A ${rank(row.context.jprARank)}`, `Jump Tissue ${rank(row.context.jumpTissueRank)}`,
          ...(row.market.medianBookmakerDecimal === null ? [] : [`Captured median ${row.market.medianBookmakerDecimal.toFixed(2)}`]),
        ].join(" · "), movement: null }],
    });
  }
  const horses = mergeResearchSignals(rows);
  return { date, horses, emptyMessage: prices.length === 0 ? `No racecards imported for ${date}.` : horses.length === 0 ? "No research signals today." : null,
    monitors: buildProspectiveMonitors(turf, jump, aw, g4) };
}

export function priceMovement(prices: { early?: ForwardValuePriceSnapshot | null; t180?: ForwardValuePriceSnapshot | null; t60?: ForwardValuePriceSnapshot | null }): string {
  const early = medianSnapshot(prices.early);
  const late = medianSnapshot(prices.t60) ?? medianSnapshot(prices.t180);
  return early && late ? `Early ${early.decimalPrice.toFixed(2)} → ${prices.t60 && medianSnapshot(prices.t60) ? "T-60" : "T-180"} ${late.decimalPrice.toFixed(2)}` : "No later snapshot";
}
function medianSnapshot(snapshot: ForwardValuePriceSnapshot | null | undefined) {
  return snapshot?.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION && (snapshot.bookmakerQuoteCount ?? 0) > 0 ? snapshot : null;
}

function buildProspectiveMonitors(turf: TissueForwardData, jump: JumpTissueForwardData, aw: AwTissueForwardData, g4: JumpG4ForwardData): ProspectiveMonitor[] {
  const turfRows = turf.races.filter((race) => race.recordedPreRace === true).flatMap((race) => {
    const leader = race.runners.find((runner) => runner.tissueRank === 1);
    return leader ? [{ won: race.winners.length ? race.winners.includes(leader.horseName) : null, probability: leader.probability, profit: null }] : [];
  });
  const tissueMonitor = (name: string, races: Array<JumpTissueForwardData["races"][number] | AwTissueForwardData["races"][number]>) => summarizeMonitor(name, "MONITORING", races.flatMap((race) => {
    const leader = race.runners.find((runner) => runner.runnerId === race.top1);
    const stage = medianSnapshot(race.prices.t60) ? "t60" : medianSnapshot(race.prices.t180) ? "t180" : medianSnapshot(race.prices.early) ? "early" : null;
    return leader ? [{ won: leader.outcome?.won ?? null, probability: leader.probability, profit: stage ? race.selectedPriceProfitLoss[stage] : null }] : [];
  }), "Clean rank-one model observations");
  const g4Summary = summarizeJumpG4Forward(g4);
  return [summarizeMonitor("Turf Tissue", "FROZEN", turfRows, "Clean rank-one model observations"),
    tissueMonitor("Jump Tissue", jump.races.filter(cleanJumpTissueRace)), tissueMonitor("AW Tissue", aw.races.filter(cleanAwTissueRace)),
    { name: "Jump G4", status: "SHADOW", tracked: g4Summary.tracked, settled: g4Summary.settled, winners: g4Summary.winners, strike: g4Summary.strike,
      ae: g4Summary.ae, roi: g4Summary.roi, roiBasis: "final_sp", pricedSettled: g4.observations.filter((row) => row.outcome?.won != null && row.outcome.profitLoss != null).length, cohort: "Prospective G4 qualifiers" }];
}
function summarizeMonitor(name: string, status: ProspectiveMonitor["status"], rows: Array<{ won: boolean | null; probability: number | null; profit: number | null }>, cohort: string): ProspectiveMonitor {
  const settled = rows.filter((row) => row.won !== null);
  const winners = settled.filter((row) => row.won).length;
  const comparable = settled.filter((row) => row.probability !== null);
  const expected = comparable.reduce((sum, row) => sum + row.probability!, 0);
  const priced = settled.filter((row) => row.profit !== null);
  return { name, status, tracked: rows.length, settled: settled.length, winners, strike: settled.length ? winners / settled.length : null,
    ae: expected ? comparable.filter((row) => row.won).length / expected : null,
    roi: priced.length ? priced.reduce((sum, row) => sum + row.profit!, 0) / priced.length : null, roiBasis: "median", pricedSettled: priced.length, cohort };
}
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function number(value: number) { return Number(value.toFixed(1)).toString(); }
function rank(value: number | null) { return value === null ? "unavailable" : `#${value}`; }
