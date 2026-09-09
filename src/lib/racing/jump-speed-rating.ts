import {
  distanceYardsToFurlongs,
  equivalentFinishingTimeSeconds,
  goingAdjustedStandardSeconds,
  sanityCheckWinningTime,
  secondsPerLength,
} from "./speed-research";

export const JUMP_SPEED_RATING_CALCULATION_VERSION = "jump_speed_v1";

export const JUMP_SPEED_RATING_POLICY = {
  baseFigure: 100,
  secondsPerFurlongPoints: 37.76,
  minimumStandardSampleSize: 2,
  conservativeSameDayMinimumPeers: 4,
  conservativeSameDayMaximumStdevSecondsPerFurlong: 0.3,
  withheldCumulativeBeatenLengths: 75,
  highConfidenceMinimumStandardSampleSize: 10,
  highConfidenceMaximumBeatenLengths: 30,
  mediumConfidenceMinimumStandardSampleSize: 5,
} as const;

export type JumpSpeedRatingMethod =
  | "same_day"
  | "base"
  | "withheld"
  | "unavailable";

export type JumpSpeedRatingConfidence =
  | "high"
  | "medium"
  | "low"
  | "unavailable";

export type JumpRaceSubtype =
  | "hurdle"
  | "chase"
  | "nh_flat"
  | "unknown_other";

export type JumpSpeedRating = {
  rating: number | null;
  method: JumpSpeedRatingMethod;
  confidence: JumpSpeedRatingConfidence;
  baseRating: number | null;
  sameDayAdjustedRating: number | null;
  cumulativeBeatenLengths: number | null;
  standardSampleSize: number | null;
  sameDaySampleSize: number | null;
  withheldReason: string | null;
  calculationVersion: typeof JUMP_SPEED_RATING_CALCULATION_VERSION;
};

export type JumpSpeedRatingInput = {
  raceName?: string | null;
  raceType?: string | null;
  distanceYards: number | null;
  winningTime: string | null;
  baseStandardSeconds: number | null;
  standardSampleSize: number | null;
  cumulativeBeatenLengths: number | null;
  sameDayAdjustmentSecondsPerFurlong?: number | null;
  sameDayPeerCount?: number | null;
  sameDayStdevSecondsPerFurlong?: number | null;
};

export function calculateJumpSpeedRating(
  input: JumpSpeedRatingInput,
): JumpSpeedRating {
  const unavailable = (withheldReason: string | null = null): JumpSpeedRating => ({
    rating: null,
    method: "unavailable",
    confidence: "unavailable",
    baseRating: null,
    sameDayAdjustedRating: null,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    withheldReason,
    calculationVersion: JUMP_SPEED_RATING_CALCULATION_VERSION,
  });

  if (!isJumpRace(input)) {
    return unavailable("not_jump_race");
  }

  const winningTime = sanityCheckWinningTime({
    winningTime: input.winningTime,
    distanceYards: input.distanceYards,
  }).usableSeconds;
  const distanceFurlongs = distanceYardsToFurlongs(input.distanceYards);

  if (
    winningTime === null ||
    distanceFurlongs === null ||
    input.baseStandardSeconds === null ||
    input.standardSampleSize === null ||
    input.standardSampleSize < JUMP_SPEED_RATING_POLICY.minimumStandardSampleSize ||
    input.cumulativeBeatenLengths === null
  ) {
    return unavailable("insufficient_timing_or_standard");
  }

  const baseRating = ratingForStandard({
    standardSeconds: input.baseStandardSeconds,
    winningTimeSeconds: winningTime,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    distanceYards: input.distanceYards,
  });
  const sameDayEligible = isConservativeSameDayEligible(input);
  const sameDayStandardSeconds = sameDayEligible
    ? goingAdjustedStandardSeconds({
        baseStandardSeconds: input.baseStandardSeconds,
        adjustmentSecondsPerFurlong: input.sameDayAdjustmentSecondsPerFurlong ?? null,
        distanceYards: input.distanceYards,
      })
    : null;
  const sameDayAdjustedRating =
    sameDayStandardSeconds === null
      ? null
      : ratingForStandard({
          standardSeconds: sameDayStandardSeconds,
          winningTimeSeconds: winningTime,
          cumulativeBeatenLengths: input.cumulativeBeatenLengths,
          distanceYards: input.distanceYards,
        });

  if (input.cumulativeBeatenLengths > JUMP_SPEED_RATING_POLICY.withheldCumulativeBeatenLengths) {
    return {
      rating: null,
      method: "withheld",
      confidence: "low",
      baseRating,
      sameDayAdjustedRating,
      cumulativeBeatenLengths: input.cumulativeBeatenLengths,
      standardSampleSize: input.standardSampleSize,
      sameDaySampleSize: input.sameDayPeerCount ?? null,
      withheldReason: "beaten_distance_gt_75_lengths",
      calculationVersion: JUMP_SPEED_RATING_CALCULATION_VERSION,
    };
  }

  const rating = sameDayAdjustedRating ?? baseRating;
  if (rating === null) {
    return unavailable("insufficient_timing_or_standard");
  }

  return {
    rating,
    method: sameDayAdjustedRating === null ? "base" : "same_day",
    confidence: confidenceFor(input, sameDayAdjustedRating !== null),
    baseRating,
    sameDayAdjustedRating,
    cumulativeBeatenLengths: input.cumulativeBeatenLengths,
    standardSampleSize: input.standardSampleSize,
    sameDaySampleSize: input.sameDayPeerCount ?? null,
    withheldReason: null,
    calculationVersion: JUMP_SPEED_RATING_CALCULATION_VERSION,
  };
}

export function isJumpRace(input: {
  raceName?: string | null;
  raceType?: string | null;
}): boolean {
  const subtype = classifyJumpRaceSubtype(input);
  if (subtype !== "unknown_other") {
    return true;
  }
  const text = `${input.raceName ?? ""} ${input.raceType ?? ""}`.toLowerCase();
  return text.includes("hurdle") || text.includes("chase") || text.includes("national hunt");
}

export function classifyJumpRaceSubtype(input: {
  raceName?: string | null;
  raceType?: string | null;
}): JumpRaceSubtype {
  const raceType = input.raceType?.toLowerCase() ?? "";
  const raceName = input.raceName?.toLowerCase() ?? "";
  const text = `${raceType} ${raceName}`;

  if (text.includes("hurdle")) {
    return "hurdle";
  }
  if (text.includes("steeplechase") || text.includes("chase")) {
    return "chase";
  }
  if (
    text.includes("nh flat") ||
    text.includes("national hunt flat") ||
    text.includes("bumper")
  ) {
    return "nh_flat";
  }
  return "unknown_other";
}

export function ratingForStandard(input: {
  standardSeconds: number | null;
  winningTimeSeconds: number;
  cumulativeBeatenLengths: number;
  distanceYards: number | null;
}): number | null {
  const distanceFurlongs = distanceYardsToFurlongs(input.distanceYards);
  if (input.standardSeconds === null || distanceFurlongs === null) {
    return null;
  }
  const equivalentTime = equivalentFinishingTimeSeconds(
    input.winningTimeSeconds,
    input.cumulativeBeatenLengths,
    "speed_based",
    {
      distanceYards: input.distanceYards,
      winnerTimeSeconds: input.winningTimeSeconds,
      raceCategory: "jumps",
    },
  );
  if (equivalentTime === null) {
    return null;
  }
  return (
    JUMP_SPEED_RATING_POLICY.baseFigure +
    JUMP_SPEED_RATING_POLICY.secondsPerFurlongPoints *
      ((input.standardSeconds - equivalentTime) / distanceFurlongs)
  );
}

export function reconstructBeatenSecondsAsLengths(input: {
  equivalentTimeSeconds: number;
  winningTimeSeconds: number;
  distanceYards: number | null;
}): number | null {
  const secondsPerLengthValue = secondsPerLength("speed_based", {
    distanceYards: input.distanceYards,
    winnerTimeSeconds: input.winningTimeSeconds,
    raceCategory: "jumps",
  });
  if (secondsPerLengthValue <= 0) {
    return null;
  }
  return (input.equivalentTimeSeconds - input.winningTimeSeconds) / secondsPerLengthValue;
}

function isConservativeSameDayEligible(input: JumpSpeedRatingInput): boolean {
  return (
    input.sameDayAdjustmentSecondsPerFurlong !== null &&
    input.sameDayAdjustmentSecondsPerFurlong !== undefined &&
    input.sameDayPeerCount !== null &&
    input.sameDayPeerCount !== undefined &&
    input.sameDayPeerCount >= JUMP_SPEED_RATING_POLICY.conservativeSameDayMinimumPeers &&
    input.sameDayStdevSecondsPerFurlong !== null &&
    input.sameDayStdevSecondsPerFurlong !== undefined &&
    input.sameDayStdevSecondsPerFurlong <=
      JUMP_SPEED_RATING_POLICY.conservativeSameDayMaximumStdevSecondsPerFurlong
  );
}

function confidenceFor(
  input: JumpSpeedRatingInput,
  sameDayAdjusted: boolean,
): JumpSpeedRatingConfidence {
  const subtype = classifyJumpRaceSubtype(input);
  if (
    sameDayAdjusted &&
    input.standardSampleSize !== null &&
    input.standardSampleSize !== undefined &&
    input.standardSampleSize >=
      JUMP_SPEED_RATING_POLICY.highConfidenceMinimumStandardSampleSize &&
    input.cumulativeBeatenLengths !== null &&
    input.cumulativeBeatenLengths <=
      JUMP_SPEED_RATING_POLICY.highConfidenceMaximumBeatenLengths &&
    subtype !== "unknown_other"
  ) {
    return "high";
  }

  if (
    input.standardSampleSize !== null &&
    input.standardSampleSize !== undefined &&
    input.standardSampleSize >=
      JUMP_SPEED_RATING_POLICY.mediumConfidenceMinimumStandardSampleSize &&
    input.cumulativeBeatenLengths !== null &&
    input.cumulativeBeatenLengths <=
      JUMP_SPEED_RATING_POLICY.withheldCumulativeBeatenLengths &&
    subtype !== "unknown_other"
  ) {
    return "medium";
  }

  return "low";
}
