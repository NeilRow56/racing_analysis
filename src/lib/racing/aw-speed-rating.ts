import {
  distanceYardsToFurlongs,
  equivalentFinishingTimeSeconds,
  goingAdjustedStandardSeconds,
  sanityCheckWinningTime,
  secondsPerLength,
} from "./speed-research";

export const AW_SPEED_RATING_CALCULATION_VERSION = "aw_speed_v1";

export const SUPPORTED_AW_SURFACES = ["ALLWEATHER", "POLYTRACK"] as const;

export type SupportedAwSurface = (typeof SUPPORTED_AW_SURFACES)[number];

export const AW_SPEED_RATING_POLICY = {
  baseFigure: 100,
  minimumStandardSampleSize: 2,
  conservativeSameDayMinimumPeers: 3,
  conservativeSameDayMaximumStdevSecondsPerFurlong: 0.3,
  highConfidenceMinimumStandardSampleSize: 40,
  mediumConfidenceMinimumStandardSampleSize: 10,
  highConfidenceMaximumBeatenLengths: 20,
  mediumConfidenceMaximumBeatenLengths: 50,
} as const;

export type AwSpeedRatingMethod = "same_day" | "base" | "unavailable" | "withheld";

export type AwSpeedRatingConfidence = "high" | "medium" | "low" | "unavailable";

export type AwSpeedRating = {
  rating: number | null;
  method: AwSpeedRatingMethod;
  confidence: AwSpeedRatingConfidence;
  baseRating: number | null;
  sameDayAdjustedRating: number | null;
  cumulativeBeatenLengths: number | null;
  standardSampleSize: number | null;
  sameDaySampleSize: number | null;
  unavailableReason: string | null;
  withheldReason: string | null;
  standardSeconds: number | null;
  equivalentTimeSeconds: number | null;
  secondsPerLength: number | null;
  calculationVersion: typeof AW_SPEED_RATING_CALCULATION_VERSION;
};

export type AwSpeedRatingInput = {
  raceName?: string | null;
  raceType?: string | null;
  courseName?: string | null;
  going?: string | null;
  surface?: string | null;
  distanceYards: number | null;
  winningTime: string | null;
  baseStandardSeconds: number | null;
  standardSampleSize: number | null;
  cumulativeBeatenLengths: number | null;
  sameDayAdjustmentSecondsPerFurlong?: number | null;
  sameDayPeerCount?: number | null;
  sameDayStdevSecondsPerFurlong?: number | null;
};

const POLYTRACK_COURSES = new Set([
  "chelmsford city",
  "dundalk",
  "kempton",
  "lingfield",
]);

const ALLWEATHER_COURSES = new Set([
  "newcastle",
  "southwell",
  "wolverhampton",
]);

export function calculateAwSpeedRating(input: AwSpeedRatingInput): AwSpeedRating {
  const unavailable = (reason: string): AwSpeedRating => ({
    rating: null,
    method: "unavailable",
    confidence: "unavailable",
    baseRating: null,
    sameDayAdjustedRating: null,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    unavailableReason: reason,
    withheldReason: null,
    standardSeconds: input.baseStandardSeconds,
    equivalentTimeSeconds: null,
    secondsPerLength: null,
    calculationVersion: AW_SPEED_RATING_CALCULATION_VERSION,
  });

  if (!isSupportedAllWeatherRace(input)) {
    return unavailable("not_all_weather_flat");
  }

  const winningTimeSeconds = sanityCheckWinningTime({
    winningTime: input.winningTime,
    distanceYards: input.distanceYards,
  }).usableSeconds;
  const distanceFurlongs = distanceYardsToFurlongs(input.distanceYards);

  if (
    winningTimeSeconds === null ||
    distanceFurlongs === null ||
    input.baseStandardSeconds === null ||
    input.standardSampleSize === null ||
    input.standardSampleSize < AW_SPEED_RATING_POLICY.minimumStandardSampleSize ||
    input.cumulativeBeatenLengths === null
  ) {
    return unavailable("insufficient_timing_or_standard");
  }

  const base = currentLengthRatingForStandard({
    standardSeconds: input.baseStandardSeconds,
    winningTimeSeconds,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    distanceYards: input.distanceYards,
  });
  if (base.rating === null) {
    return unavailable("insufficient_timing_or_standard");
  }

  const sameDayEligible = isConservativeSameDayEligible(input);
  const sameDayStandardSeconds = sameDayEligible
    ? goingAdjustedStandardSeconds({
        baseStandardSeconds: input.baseStandardSeconds,
        adjustmentSecondsPerFurlong: input.sameDayAdjustmentSecondsPerFurlong ?? null,
        distanceYards: input.distanceYards,
      })
    : null;
  const sameDay =
    sameDayStandardSeconds === null
      ? null
      : currentLengthRatingForStandard({
          standardSeconds: sameDayStandardSeconds,
          winningTimeSeconds,
          cumulativeBeatenLengths: input.cumulativeBeatenLengths,
          distanceYards: input.distanceYards,
        });

  const sameDayAdjustedRating = sameDay?.rating ?? null;
  const rating = sameDayAdjustedRating ?? base.rating;

  return {
    rating,
    method: sameDayAdjustedRating === null ? "base" : "same_day",
    confidence: confidenceFor(input, sameDayAdjustedRating !== null),
    baseRating: base.rating,
    sameDayAdjustedRating,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    unavailableReason: null,
    withheldReason: null,
    standardSeconds: sameDayAdjustedRating === null ? input.baseStandardSeconds : sameDayStandardSeconds,
    equivalentTimeSeconds: base.equivalentTimeSeconds,
    secondsPerLength: base.secondsPerLength,
    calculationVersion: AW_SPEED_RATING_CALCULATION_VERSION,
  };
}

export function currentLengthRatingForStandard(input: {
  standardSeconds: number | null;
  winningTimeSeconds: number;
  cumulativeBeatenLengths: number;
  distanceYards: number | null;
}): {
  rating: number | null;
  equivalentTimeSeconds: number | null;
  secondsPerLength: number | null;
} {
  if (input.standardSeconds === null) {
    return { rating: null, equivalentTimeSeconds: null, secondsPerLength: null };
  }

  const secondsPerLengthValue = secondsPerLength("speed_based", {
    distanceYards: input.distanceYards,
    winnerTimeSeconds: input.winningTimeSeconds,
    raceCategory: "all_weather",
  });
  const equivalentTimeSeconds = equivalentFinishingTimeSeconds(
    input.winningTimeSeconds,
    input.cumulativeBeatenLengths,
    "speed_based",
    {
      distanceYards: input.distanceYards,
      winnerTimeSeconds: input.winningTimeSeconds,
      raceCategory: "all_weather",
    },
  );
  if (
    equivalentTimeSeconds === null ||
    !Number.isFinite(secondsPerLengthValue) ||
    secondsPerLengthValue <= 0
  ) {
    return { rating: null, equivalentTimeSeconds, secondsPerLength: null };
  }

  const lengthsFasterThanStandard =
    (input.standardSeconds - equivalentTimeSeconds) / secondsPerLengthValue;
  return {
    rating: AW_SPEED_RATING_POLICY.baseFigure + lengthsFasterThanStandard,
    equivalentTimeSeconds,
    secondsPerLength: secondsPerLengthValue,
  };
}

export function isSupportedAllWeatherRace(input: {
  raceName?: string | null;
  raceType?: string | null;
  courseName?: string | null;
  going?: string | null;
  surface?: string | null;
}): boolean {
  return supportedAwSurface(input) !== null && !isJumpText(input);
}

export function supportedAwSurface(input: {
  courseName?: string | null;
  going?: string | null;
  surface?: string | null;
}): SupportedAwSurface | null {
  const explicitSurface = input.surface?.trim().toUpperCase();
  if (explicitSurface === "ALLWEATHER" || explicitSurface === "POLYTRACK") {
    return explicitSurface;
  }
  if (explicitSurface) {
    return null;
  }
  if (!isStandardGoing(input.going)) {
    return null;
  }
  const course = input.courseName?.trim().toLowerCase() ?? "";
  if (POLYTRACK_COURSES.has(course)) {
    return "POLYTRACK";
  }
  if (ALLWEATHER_COURSES.has(course)) {
    return "ALLWEATHER";
  }
  return null;
}

function isStandardGoing(going: string | null | undefined): boolean {
  return (going ?? "").trim().toLowerCase().startsWith("standard");
}

function isJumpText(input: {
  raceName?: string | null;
  raceType?: string | null;
}): boolean {
  const text = `${input.raceName ?? ""} ${input.raceType ?? ""}`.toLowerCase();
  return (
    text.includes("hurdle") ||
    text.includes("chase") ||
    text.includes("national hunt") ||
    text.includes("nh flat") ||
    text.includes("bumper")
  );
}

function isConservativeSameDayEligible(input: AwSpeedRatingInput): boolean {
  return (
    input.sameDayAdjustmentSecondsPerFurlong !== null &&
    input.sameDayAdjustmentSecondsPerFurlong !== undefined &&
    input.sameDayPeerCount !== null &&
    input.sameDayPeerCount !== undefined &&
    input.sameDayPeerCount >= AW_SPEED_RATING_POLICY.conservativeSameDayMinimumPeers &&
    input.sameDayStdevSecondsPerFurlong !== null &&
    input.sameDayStdevSecondsPerFurlong !== undefined &&
    input.sameDayStdevSecondsPerFurlong <=
      AW_SPEED_RATING_POLICY.conservativeSameDayMaximumStdevSecondsPerFurlong
  );
}

function confidenceFor(
  input: AwSpeedRatingInput,
  sameDayAdjusted: boolean,
): AwSpeedRatingConfidence {
  if (
    input.standardSampleSize !== null &&
    input.standardSampleSize !== undefined &&
    input.standardSampleSize >= AW_SPEED_RATING_POLICY.highConfidenceMinimumStandardSampleSize &&
    input.cumulativeBeatenLengths !== null &&
    input.cumulativeBeatenLengths <= AW_SPEED_RATING_POLICY.highConfidenceMaximumBeatenLengths &&
    (!sameDayAdjusted ||
      (input.sameDayPeerCount ?? 0) >= AW_SPEED_RATING_POLICY.conservativeSameDayMinimumPeers)
  ) {
    return "high";
  }
  if (
    input.standardSampleSize !== null &&
    input.standardSampleSize !== undefined &&
    input.standardSampleSize >= AW_SPEED_RATING_POLICY.mediumConfidenceMinimumStandardSampleSize &&
    input.cumulativeBeatenLengths !== null &&
    input.cumulativeBeatenLengths <= AW_SPEED_RATING_POLICY.mediumConfidenceMaximumBeatenLengths
  ) {
    return "medium";
  }
  return "low";
}
