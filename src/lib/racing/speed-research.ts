export const BEATEN_DISTANCE_ASSUMPTIONS = {
  nse: 0.05,
  sh: 0.1,
  hd: 0.2,
  nk: 0.3,
  dh: 0,
} as const;

export const SECONDS_PER_LENGTH_ASSUMPTIONS = {
  fixed: 0.2,
  raceType: {
    flat: 0.2,
    allWeather: 0.2,
    jumps: 0.25,
    unknown: 0.2,
  },
  distanceBands: {
    sprintMaxYards: 1320,
    mileMaxYards: 1760,
    middleMaxYards: 2640,
    sprint: 0.18,
    mile: 0.19,
    middle: 0.2,
    staying: 0.22,
    jumps: 0.25,
  },
  speedBased: {
    horseLengthYards: 8 / 3,
  },
} as const;

const FRACTION_LENGTHS = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
} as const;

export type RaceCategory = "flat" | "all_weather" | "jumps" | "unknown";

export type SecondsPerLengthModel =
  | "fixed"
  | "distance_band"
  | "race_category"
  | "speed_based";

export type LengthConversionContext = {
  distanceYards?: number | null;
  winnerTimeSeconds?: number | null;
  raceCategory?: RaceCategory | null;
};

export type RunnerMarginInput = {
  id: string;
  finishingPosition: number | null;
  resultStatus?: string | null;
  beatenDistance?: string | null;
};

export type RunnerCumulativeMargin = RunnerMarginInput & {
  parsedMarginLengths: number | null;
  cumulativeBeatenLengths: number | null;
  ambiguous: boolean;
};

export function parseWinningTimeSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const secondsOnly = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
  if (secondsOnly) {
    return Number(secondsOnly[1]);
  }

  const minutesAndSeconds = trimmed.match(/^(\d+)m (\d+(?:\.\d+)?)s$/);
  if (!minutesAndSeconds) {
    return null;
  }

  return Number(minutesAndSeconds[1]) * 60 + Number(minutesAndSeconds[2]);
}

export function parseBeatenDistanceLengths(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized in BEATEN_DISTANCE_ASSUMPTIONS) {
    return BEATEN_DISTANCE_ASSUMPTIONS[
      normalized as keyof typeof BEATEN_DISTANCE_ASSUMPTIONS
    ];
  }

  if (normalized in FRACTION_LENGTHS) {
    return FRACTION_LENGTHS[normalized as keyof typeof FRACTION_LENGTHS];
  }

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }

  const mixed = normalized.match(/^(\d+(?:\.\d+)?) ([¼½¾])$/);
  if (!mixed) {
    return null;
  }

  return Number(mixed[1]) + FRACTION_LENGTHS[mixed[2] as keyof typeof FRACTION_LENGTHS];
}

export function classifyRaceCategory(context: {
  distanceYards?: number | null;
  raceName?: string | null;
  raceType?: string | null;
  surface?: string | null;
}): RaceCategory {
  const raceName = context.raceName?.toLowerCase() ?? "";
  const raceType = context.raceType?.toLowerCase() ?? "";
  const surface = context.surface?.toLowerCase() ?? "";
  const jumpText = `${raceName} ${raceType}`;

  if (
    jumpText.includes("chase") ||
    jumpText.includes("hurdle") ||
    jumpText.includes("nh flat") ||
    jumpText.includes("national hunt")
  ) {
    return "jumps";
  }

  if (surface === "allweather" || surface === "polytrack") {
    return "all_weather";
  }

  if (surface === "turf") {
    return "flat";
  }

  return "unknown";
}

export function secondsPerLength(
  model: SecondsPerLengthModel,
  context: LengthConversionContext = {},
): number {
  const raceCategory = context.raceCategory ?? "unknown";
  const distanceYards = context.distanceYards ?? null;
  const winnerTimeSeconds = context.winnerTimeSeconds ?? null;

  if (model === "fixed") {
    return SECONDS_PER_LENGTH_ASSUMPTIONS.fixed;
  }

  if (model === "race_category") {
    if (raceCategory === "all_weather") {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.raceType.allWeather;
    }
    return SECONDS_PER_LENGTH_ASSUMPTIONS.raceType[raceCategory];
  }

  if (model === "distance_band") {
    if (raceCategory === "jumps") {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.jumps;
    }
    if (distanceYards === null) {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.fixed;
    }
    if (distanceYards <= SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.sprintMaxYards) {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.sprint;
    }
    if (distanceYards <= SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.mileMaxYards) {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.mile;
    }
    if (distanceYards <= SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.middleMaxYards) {
      return SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.middle;
    }
    return SECONDS_PER_LENGTH_ASSUMPTIONS.distanceBands.staying;
  }

  if (
    distanceYards === null ||
    winnerTimeSeconds === null ||
    distanceYards <= 0 ||
    winnerTimeSeconds <= 0
  ) {
    return SECONDS_PER_LENGTH_ASSUMPTIONS.fixed;
  }

  return (
    SECONDS_PER_LENGTH_ASSUMPTIONS.speedBased.horseLengthYards /
    (distanceYards / winnerTimeSeconds)
  );
}

export function beatenLengthsToSeconds(
  beatenLengths: number | null,
  model: SecondsPerLengthModel,
  context: LengthConversionContext = {},
): number | null {
  if (beatenLengths === null || beatenLengths < 0) {
    return null;
  }
  return beatenLengths * secondsPerLength(model, context);
}

export function equivalentFinishingTimeSeconds(
  winnerTimeSeconds: number | null,
  cumulativeBeatenLengths: number | null,
  model: SecondsPerLengthModel,
  context: LengthConversionContext = {},
): number | null {
  if (winnerTimeSeconds === null || cumulativeBeatenLengths === null) {
    return null;
  }
  const beatenSeconds = beatenLengthsToSeconds(cumulativeBeatenLengths, model, {
    ...context,
    winnerTimeSeconds,
  });
  return beatenSeconds === null ? null : winnerTimeSeconds + beatenSeconds;
}

export function reconstructCumulativeBeatenLengths(
  runners: RunnerMarginInput[],
): RunnerCumulativeMargin[] {
  const finished = runners
    .filter((runner) => runner.resultStatus !== "non_runner")
    .filter((runner) => runner.resultStatus === undefined || runner.resultStatus === null || runner.resultStatus === "finished")
    .filter((runner) => runner.finishingPosition !== null)
    .sort((a, b) => (a.finishingPosition ?? 0) - (b.finishingPosition ?? 0));

  const cumulativeById = new Map<string, RunnerCumulativeMargin>();
  let previousPosition: number | null = null;
  let previousCumulative: number | null = null;
  let ambiguous = false;

  for (const runner of finished) {
    const parsedMargin = parseBeatenDistanceLengths(runner.beatenDistance ?? null);
    let cumulative: number | null;
    const position = runner.finishingPosition;

    if (position === 1) {
      cumulative = 0;
    } else if (position !== null && previousPosition === position) {
      cumulative = previousCumulative;
    } else if (parsedMargin === null || previousCumulative === null || ambiguous) {
      cumulative = null;
      ambiguous = true;
    } else {
      cumulative = previousCumulative + parsedMargin;
    }

    const row = {
      ...runner,
      parsedMarginLengths: position === 1 ? 0 : parsedMargin,
      cumulativeBeatenLengths: cumulative,
      ambiguous,
    };
    cumulativeById.set(runner.id, row);

    previousPosition = position;
    previousCumulative = cumulative;
  }

  return runners.map((runner) => {
    const cumulative = cumulativeById.get(runner.id);
    if (cumulative) {
      return cumulative;
    }
    return {
      ...runner,
      parsedMarginLengths: parseBeatenDistanceLengths(runner.beatenDistance ?? null),
      cumulativeBeatenLengths: null,
      ambiguous: false,
    };
  });
}

export function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function standardDeviation(values: number[]): number | null {
  const average = mean(values);
  if (average === null || values.length < 2) {
    return null;
  }
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function sampleLabel(sampleSize: number): string {
  if (sampleSize <= 1) {
    return "insufficient";
  }
  if (sampleSize === 2) {
    return "very weak";
  }
  if (sampleSize <= 4) {
    return "weak";
  }
  return "preliminary";
}

export function formatSeconds(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}
