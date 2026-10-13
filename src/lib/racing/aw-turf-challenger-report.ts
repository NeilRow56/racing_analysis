import type { AwTissuePairedForwardData } from "./aw-tissue-paired-forward";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice } from "./todays-racing";

const price = (value: number | null) => value?.toFixed(2) ?? "-";
const adjustedRunnerSummary = (runners: Array<{ horseName: string; firstCapturedPriceDecimal: number | null }>) =>
  runners.length ? runners.map((runner) => `${runner.horseName} ${price(runner.firstCapturedPriceDecimal)}`).join(", ") : "-";

export function buildAwTurfChallengerReport(data: AwTissuePairedForwardData, date: string, prices: SportingLifeCurrentPrice[] = []) {
  const latest = new Map(prices.map((price) => [`${price.raceId}|${price.runnerId}`, price]));
  const rows = data.races
    .filter((race) => race.raceDate === date && race.excludedReason === null)
    .sort((a, b) => a.currentOffAt.localeCompare(b.currentOffAt) || a.raceId.localeCompare(b.raceId))
    .map((race) => {
      const model = race.longshotTjZero;
      // Match the paired tracker's existing qualification-price precedence.
      const market = race.prices.finalPreRace.longshotTjZero ?? race.prices.late.longshotTjZero ?? race.prices.earlyMorning.longshotTjZero ?? race.prices.firstAvailable.longshotTjZero;
      const outcome = model.probabilities.find((runner) => runner.runnerId === model.rank1RunnerId)?.outcome;
      const current = latest.get(`${race.raceId}|${model.rank1RunnerId}`);
      const result = !race.settledAt || !outcome ? "Pending" : outcome.won === true ? "Winner" : outcome.won === null ? "Void" : outcome.finishingPosition !== null ? `Finished ${outcome.finishingPosition}` : outcome.resultStatus ?? "Settled";
      const suppressed = model.probabilities.filter((runner) => runner.longshotTrainerJockeyAdjusted);
      return {
        raceId: race.raceId,
        time: formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime }),
        course: race.course,
        horse: model.rank1HorseName,
        probability: model.rank1Probability,
        marketProbability: market?.impliedProbability ?? null,
        capturedPrice: market?.medianDecimalPrice ?? null,
        latestPrice: current?.marketDecimalOdds ?? null,
        result,
        agrees: race.rank1Agreement,
        awHorse: race.awTissue.rank1HorseName,
        awProbability: race.awTissue.rank1Probability,
        value: model.valueQualified === true,
        settled: race.settledAt !== null,
        won: outcome?.won === true,
        suppressed,
        suppressedCount: suppressed.length,
        marketConditioned: true,
      };
    });
  return {
    rows,
    summary: {
      tracked: rows.length,
      agree: rows.filter((row) => row.agrees).length,
      disagree: rows.filter((row) => !row.agrees).length,
      value: rows.filter((row) => row.value).length,
      settled: rows.filter((row) => row.settled).length,
      winners: rows.filter((row) => row.settled && row.won).length,
      suppressed: rows.reduce((sum, row) => sum + row.suppressedCount, 0),
    },
  };
}

export function renderAwTurfChallengerToday(data: AwTissuePairedForwardData, date: string) {
  const { rows, summary } = buildAwTurfChallengerReport(data, date);
  return [
    "AW LONGSHOT TRAINER/JOCKEY CHALLENGER",
    "Market-conditioned research shadow: runners above 20/1 at first capture have trainer/jockey influence removed. The table shows the resulting challenger #1 horse, which may itself be priced below 20/1. The AW VALUE cap remains unchanged.",
    `Tracked today: ${summary.tracked} | Agree: ${summary.agree} | Disagree: ${summary.disagree} | Challenger edge: ${summary.value} | >20/1 runners adjusted: ${summary.suppressed} | Settled: ${summary.settled} | Winners: ${summary.winners}`,
    rows.some((row) => !row.agrees)
      ? "time | course | LONGSHOT_TJ_ZERO | challenger p | CONTROL #1 | control p | >20/1 runners adjusted | adjusted runners | agree/disagree"
      : "time | course | LONGSHOT_TJ_ZERO | challenger p | >20/1 runners adjusted | adjusted runners | agree/disagree",
    ...rows.map((row) => row.agrees
      ? `${row.time} | ${row.course} | ${row.horse} | ${(row.probability * 100).toFixed(1)}% | ${row.suppressedCount} | ${adjustedRunnerSummary(row.suppressed)} | AGREE`
      : `${row.time} | ${row.course} | ${row.horse} | ${(row.probability * 100).toFixed(1)}% | ${row.awHorse} | ${(row.awProbability * 100).toFixed(1)}% | ${row.suppressedCount} | ${adjustedRunnerSummary(row.suppressed)} | DISAGREE`),
    ...(rows.length ? [] : ["No challenger selections recorded for this date."]),
  ].join("\n");
}
