import type { AwTissuePairedForwardData } from "./aw-tissue-paired-forward";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice } from "./todays-racing";

export function buildAwTurfChallengerReport(data: AwTissuePairedForwardData, date: string, prices: SportingLifeCurrentPrice[] = []) {
  const latest = new Map(prices.map((price) => [`${price.raceId}|${price.runnerId}`, price]));
  const rows = data.races
    .filter((race) => race.raceDate === date && race.excludedReason === null)
    .sort((a, b) => a.currentOffAt.localeCompare(b.currentOffAt) || a.raceId.localeCompare(b.raceId))
    .map((race) => {
      const model = race.turfArch;
      // Match the paired tracker's existing qualification-price precedence.
      const market = race.prices.finalPreRace.turfArch ?? race.prices.late.turfArch ?? race.prices.earlyMorning.turfArch ?? race.prices.firstAvailable.turfArch;
      const outcome = model.probabilities.find((runner) => runner.runnerId === model.rank1RunnerId)?.outcome;
      const current = latest.get(`${race.raceId}|${model.rank1RunnerId}`);
      const result = !race.settledAt || !outcome ? "Pending" : outcome.won === true ? "Winner" : outcome.won === null ? "Void" : outcome.finishingPosition !== null ? `Finished ${outcome.finishingPosition}` : outcome.resultStatus ?? "Settled";
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
        value: model.valueQualified === true,
        settled: race.settledAt !== null,
        won: outcome?.won === true,
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
    },
  };
}

export function renderAwTurfChallengerToday(data: AwTissuePairedForwardData, date: string) {
  const { rows, summary } = buildAwTurfChallengerReport(data, date);
  return [
    "AW TURF-ARCHITECTURE CHALLENGER",
    `Tracked today: ${summary.tracked} | Agree: ${summary.agree} | Disagree: ${summary.disagree} | Challenger VALUE: ${summary.value} | Settled: ${summary.settled} | Winners: ${summary.winners}`,
    "time | course | horse | probability | price | agree/disagree",
    ...rows.map((row) => `${row.time} | ${row.course} | ${row.horse} | ${(row.probability * 100).toFixed(1)}% | ${row.capturedPrice?.toFixed(2) ?? "-"} | ${row.agrees ? "AGREE" : "DISAGREE"}`),
    ...(rows.length ? [] : ["No challenger selections recorded for this date."]),
  ].join("\n");
}
