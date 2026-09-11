import {
  distanceYardsToFurlongs,
  equivalentFinishingTimeSeconds,
  goingAdjustedStandardSeconds,
  sanityCheckWinningTime,
} from "./speed-research";

export const TURF_SPEED_RATING_CALCULATION_VERSION = "turf_speed_v1";

export const TURF_SPEED_RATING_POLICY = {
  baseFigure: 100,
  secondsPerFurlongPoints: 37.76,
  minimumStandardSampleSize: 2,
  sameDayMinimumPeers: 3,
  sameDayMaximumStdevSecondsPerFurlong: 0.3,
  highConfidenceMinimumStandardSampleSize: 5,
  mediumConfidenceMinimumStandardSampleSize: 5,
  highTimingSpreadSecondsPerFurlong: 0.75,
} as const;

export type TurfSpeedRatingMethod = "same_day" | "base" | "unavailable" | "withheld";

export type TurfSpeedRatingConfidence = "high" | "medium" | "low" | "unavailable";

export type TurfSpeedRating = {
  rating: number | null;
  method: TurfSpeedRatingMethod;
  confidence: TurfSpeedRatingConfidence;
  baseRating: number | null;
  sameDayAdjustedRating: number | null;
  standardSampleSize: number | null;
  sameDaySampleSize: number | null;
  cumulativeBeatenLengths: number | null;
  unavailableReason: string | null;
  withheldReason: string | null;
  standardSeconds: number | null;
  equivalentTimeSeconds: number | null;
  calculationVersion: typeof TURF_SPEED_RATING_CALCULATION_VERSION;
};

export type TurfSpeedRatingInput = {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
  surface?: string | null;
  distanceYards: number | null;
  winningTime: string | null;
  baseStandardSeconds: number | null;
  standardSampleSize: number | null;
  standardTimingSpreadSecondsPerFurlong?: number | null;
  cumulativeBeatenLengths: number | null;
  sameDayAdjustmentSecondsPerFurlong?: number | null;
  sameDayPeerCount?: number | null;
  sameDayStdevSecondsPerFurlong?: number | null;
  sourceTimingIssue?: boolean;
};

export function calculateTurfSpeedRating(input: TurfSpeedRatingInput): TurfSpeedRating {
  const unavailable = (reason: string): TurfSpeedRating => ({
    rating: null,
    method: "unavailable",
    confidence: "unavailable",
    baseRating: null,
    sameDayAdjustedRating: null,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    unavailableReason: reason,
    withheldReason: null,
    standardSeconds: input.baseStandardSeconds,
    equivalentTimeSeconds: null,
    calculationVersion: TURF_SPEED_RATING_CALCULATION_VERSION,
  });

  if (!isOrdinaryFlatTurfRace(input)) {
    return unavailable("not_ordinary_flat_turf");
  }

  const winningTimeSeconds = sanityCheckWinningTime({
    winningTime: input.winningTime,
    distanceYards: input.distanceYards,
  }).usableSeconds;

  if (
    winningTimeSeconds === null ||
    input.baseStandardSeconds === null ||
    input.standardSampleSize === null ||
    input.standardSampleSize < TURF_SPEED_RATING_POLICY.minimumStandardSampleSize ||
    input.cumulativeBeatenLengths === null
  ) {
    return unavailable("insufficient_timing_or_standard");
  }

  const base = ratingForStandard({
    standardSeconds: input.baseStandardSeconds,
    winningTimeSeconds,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    distanceYards: input.distanceYards,
  });
  if (base.rating === null) {
    return unavailable("insufficient_timing_or_standard");
  }

  const sameDayEligible = isSameDayEligible(input);
  const sameDayStandardSeconds = sameDayEligible
    ? goingAdjustedStandardSeconds({
        baseStandardSeconds: input.baseStandardSeconds,
        adjustmentSecondsPerFurlong: input.sameDayAdjustmentSecondsPerFurlong ?? null,
        distanceYards: input.distanceYards,
      })
    : null;
  const sameDay = sameDayStandardSeconds === null
    ? null
    : ratingForStandard({
        standardSeconds: sameDayStandardSeconds,
        winningTimeSeconds,
        cumulativeBeatenLengths: input.cumulativeBeatenLengths,
        distanceYards: input.distanceYards,
      });
  const sameDayAdjustedRating = sameDay?.rating ?? null;

  if (input.sourceTimingIssue) {
    return {
      rating: null,
      method: "withheld",
      confidence: "low",
      baseRating: base.rating,
      sameDayAdjustedRating,
      standardSampleSize: input.standardSampleSize,
      sameDaySampleSize: input.sameDayPeerCount ?? null,
      cumulativeBeatenLengths: input.cumulativeBeatenLengths,
      unavailableReason: null,
      withheldReason: "source_timing_outlier",
      standardSeconds: sameDayAdjustedRating === null ? input.baseStandardSeconds : sameDayStandardSeconds,
      equivalentTimeSeconds: base.equivalentTimeSeconds,
      calculationVersion: TURF_SPEED_RATING_CALCULATION_VERSION,
    };
  }

  return {
    rating: sameDayAdjustedRating ?? base.rating,
    method: sameDayAdjustedRating === null ? "base" : "same_day",
    confidence: confidenceFor(input, sameDayAdjustedRating !== null),
    baseRating: base.rating,
    sameDayAdjustedRating,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    unavailableReason: null,
    withheldReason: null,
    standardSeconds: sameDayAdjustedRating === null ? input.baseStandardSeconds : sameDayStandardSeconds,
    equivalentTimeSeconds: base.equivalentTimeSeconds,
    calculationVersion: TURF_SPEED_RATING_CALCULATION_VERSION,
  };
}

export function ratingForStandard(input: {
  standardSeconds: number | null;
  winningTimeSeconds: number;
  cumulativeBeatenLengths: number;
  distanceYards: number | null;
}): { rating: number | null; equivalentTimeSeconds: number | null } {
  const distanceFurlongs = distanceYardsToFurlongs(input.distanceYards);
  if (input.standardSeconds === null || distanceFurlongs === null) {
    return { rating: null, equivalentTimeSeconds: null };
  }
  const equivalentTimeSeconds = equivalentFinishingTimeSeconds(
    input.winningTimeSeconds,
    input.cumulativeBeatenLengths,
    "speed_based",
    {
      distanceYards: input.distanceYards,
      winnerTimeSeconds: input.winningTimeSeconds,
      raceCategory: "flat",
    },
  );
  if (equivalentTimeSeconds === null) {
    return { rating: null, equivalentTimeSeconds };
  }
  return {
    rating: TURF_SPEED_RATING_POLICY.baseFigure +
      TURF_SPEED_RATING_POLICY.secondsPerFurlongPoints *
        ((input.standardSeconds - equivalentTimeSeconds) / distanceFurlongs),
    equivalentTimeSeconds,
  };
}

export function isOrdinaryFlatTurfRace(input: {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
  surface?: string | null;
}): boolean {
  return normalizedSurface(input.surface) === "TURF" &&
    !isJumpRaceText(input) &&
    !isNhFlatOrBumperStyle(input);
}

export function isNhFlatOrBumperStyle(input: {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
}): boolean {
  const text = `${input.raceName ?? ""} ${input.raceType ?? ""} ${input.raceTypeCode ?? ""}`
    .toLowerCase()
    .replaceAll(".", "");
  return /\binh\b/.test(text) ||
    text.includes("bumper") ||
    text.includes("national hunt flat") ||
    text.includes("point-to-point flat race") ||
    text.includes("(pro/am) flat race") ||
    text.includes("(ladies pro/am) flat race") ||
    /\bflat race(?:\b|\s|\()/.test(text);
}

function normalizedSurface(surface: string | null | undefined): string | null {
  const value = surface?.trim().toUpperCase();
  return value || null;
}

function isJumpRaceText(input: {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
}): boolean {
  const text = `${input.raceName ?? ""} ${input.raceType ?? ""} ${input.raceTypeCode ?? ""}`.toLowerCase();
  return text.includes("hurdle") ||
    text.includes("chase") ||
    text.includes("steeplechase") ||
    text.includes("national hunt");
}

function isSameDayEligible(input: TurfSpeedRatingInput): boolean {
  return input.sameDayAdjustmentSecondsPerFurlong !== null &&
    input.sameDayAdjustmentSecondsPerFurlong !== undefined &&
    input.sameDayPeerCount !== null &&
    input.sameDayPeerCount !== undefined &&
    input.sameDayPeerCount >= TURF_SPEED_RATING_POLICY.sameDayMinimumPeers &&
    input.sameDayStdevSecondsPerFurlong !== null &&
    input.sameDayStdevSecondsPerFurlong !== undefined &&
    input.sameDayStdevSecondsPerFurlong <=
      TURF_SPEED_RATING_POLICY.sameDayMaximumStdevSecondsPerFurlong;
}

function confidenceFor(
  input: TurfSpeedRatingInput,
  sameDayAdjusted: boolean,
): TurfSpeedRatingConfidence {
  const standardSample = input.standardSampleSize ?? 0;
  const highSpread =
    input.standardTimingSpreadSecondsPerFurlong !== null &&
    input.standardTimingSpreadSecondsPerFurlong !== undefined &&
    input.standardTimingSpreadSecondsPerFurlong >
      TURF_SPEED_RATING_POLICY.highTimingSpreadSecondsPerFurlong;

  if (
    sameDayAdjusted &&
    standardSample >= TURF_SPEED_RATING_POLICY.highConfidenceMinimumStandardSampleSize &&
    !highSpread
  ) {
    return "high";
  }

  if (
    standardSample >= TURF_SPEED_RATING_POLICY.mediumConfidenceMinimumStandardSampleSize &&
    !highSpread
  ) {
    return "medium";
  }

  return "low";
}
