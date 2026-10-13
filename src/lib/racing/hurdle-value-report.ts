import { cleanJumpTissueRace, currentPositiveJumpTissueRankOneEdges, type JumpTissueForwardData } from "./jump-tissue-forward";
import { HURDLE_VALUE_RULE_EPOCH, jumpTissueValueCategory } from "./hurdle-value-rule";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice } from "./todays-racing";

export function hurdleValueRows(data: JumpTissueForwardData, prices: SportingLifeCurrentPrice[] = [], date?: string) {
  return currentPositiveJumpTissueRankOneEdges(data.races.filter((race) => race.subtype === "Hurdle" && cleanJumpTissueRace(race) && (!date || race.raceDate === date)), prices).selections.map((selection) => {
    const { race, runner, comparison } = selection;
    const settled = race.settledAt !== null && runner.outcome !== null;
    const voided = settled && runner.outcome?.won === null;
    const category = jumpTissueValueCategory(race);
    return { ...selection, category,
      time: formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime }),
      settled, outcome: !settled ? "Pending" : voided ? "Void" : runner.outcome?.won ? "Winner" : "Loss",
      profitLoss: !settled ? null : voided ? 0 : category === "PRE_CAP" ? race.selectedPriceProfitLoss[comparison.qualificationStage] : race.hurdleValueRule?.qualifyingPriceProfitLoss ?? null,
    };
  }).sort((a, b) => a.race.currentOffAt.localeCompare(b.race.currentOffAt));
}
export type HurdleValueRow = ReturnType<typeof hurdleValueRows>[number];
export function summarizeHurdleValueRows(rows: HurdleValueRow[]) {
  const settled = rows.filter((row) => row.settled);
  const bets = settled.filter((row) => row.outcome !== "Void");
  const priced = bets.filter((row) => row.profitLoss !== null && Number.isFinite(row.profitLoss));
  const profitLoss = priced.length === 0 && bets.length > 0 ? null : priced.reduce((sum, row) => sum + row.profitLoss!, 0);
  return { selections: rows.length, settled: settled.length, winners: bets.filter((row) => row.outcome === "Winner").length,
    voids: settled.length - bets.length, profitLoss, pricedSettled: priced.length,
    unavailableReturns: bets.length - priced.length, roi: bets.length > 0 && priced.length === bets.length && profitLoss !== null ? profitLoss / bets.length : null };
}
export function renderHurdleValueReport(data: JumpTissueForwardData, date?: string, prices: SportingLifeCurrentPrice[] = []) {
  const rows = hurdleValueRows(data, prices, date);
  const lines = [`Hurdle VALUE rule epoch: ${HURDLE_VALUE_RULE_EPOCH} | maximum qualifying decimal price 15.0`];
  for (const [category, title] of [["MAIN", "HURDLE TISSUE VALUE (POST-CAP)"], ["LONG_PRICE_SHADOW", "HURDLE LONG-PRICE SHADOW"], ["PRE_CAP", "HURDLE TISSUE VALUE HISTORY (PRE-CAP)"]] as const) {
    const selected = rows.filter((row) => row.category === category);
    const summary = summarizeHurdleValueRows(selected);
    lines.push("", title, `Count: ${summary.selections} | Settled: ${summary.settled} | Winners: ${summary.winners} | Voids: ${summary.voids} | GBP1 P/L: ${summary.profitLoss === null ? "-" : summary.profitLoss.toFixed(2)} | ROI: ${summary.roi === null ? "-" : `${(summary.roi * 100).toFixed(1)}%`}${summary.unavailableReturns ? ` | returns unavailable: ${summary.unavailableReturns}` : ""}`);
    if (category === "LONG_PRICE_SHADOW") lines.push("Research only - excluded from main VALUE because qualifying price >14/1");
    if (date) for (const row of selected) lines.push(`${row.time} ${row.race.course} | Horse: ${row.runner.horseName} | Qualifying price: ${row.comparison.qualificationPrice.decimalPrice.toFixed(2)} | Tissue probability: ${(row.runner.probability! * 100).toFixed(1)}% | Market: ${(row.comparison.impliedProbability * 100).toFixed(1)}% | ${row.outcome} | GBP1 P/L: ${row.profitLoss === null ? "-" : row.profitLoss.toFixed(2)}`);
  }
  return lines.join("\n");
}
