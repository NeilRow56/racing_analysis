import registry from "../../../data/corrections/sporting-life-winning-times.json";

export const winningTimeCorrections = registry.corrections;
export const WINNING_TIME_CORRECTION_VERSION = registry.version;

/** Resolves only audited original/corrected values; disagreement needs fresh review. */
export function correctedWinningTime(sourceId: string, raceDate: string, winningTime: string | null): string | null {
  const correction = winningTimeCorrections.find((c) => c.sourceId === sourceId && c.raceDate === raceDate);
  if (!correction) return winningTime;
  if (winningTime !== correction.original && winningTime !== correction.corrected) {
    throw new Error(`Winning time conflicts with audited correction: ${sourceId}`);
  }
  return correction.corrected;
}
