import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const TISSUE_VALUE_REVIEW_VERSION = "tissue_value_review_v1" as const;
export const TISSUE_VALUE_REVIEW_PATH = "data/research/tissue-value-reviews.json" as const;

export const PRE_RACE_REVIEW_TAGS = [
  "draw_concern",
  "going_concern",
  "distance_trip_concern",
  "class_concern",
  "pace_setup_concern",
  "long_absence_fitness_concern",
  "weight_handicap_concern",
  "course_suitability_concern",
  "other_pre_race_concern",
] as const;

export const RACE_EVENT_REVIEW_TAGS = [
  "poor_start",
  "trouble_in_running",
  "wide_trip",
  "unsuitable_pace",
  "pulled_hard",
  "never_travelled",
  "possible_physical_issue",
  "other_race_day_factor",
] as const;

export const REVIEW_TAG_LABELS = {
  draw_concern: "Draw concern",
  going_concern: "Going concern",
  distance_trip_concern: "Distance/trip concern",
  class_concern: "Class concern",
  pace_setup_concern: "Pace/setup concern",
  long_absence_fitness_concern: "Long absence / fitness concern",
  weight_handicap_concern: "Weight/handicap concern",
  course_suitability_concern: "Course suitability concern",
  other_pre_race_concern: "Other pre-race concern",
  poor_start: "Poor start",
  trouble_in_running: "Trouble in running",
  wide_trip: "Wide trip",
  unsuitable_pace: "Unsuitable pace",
  pulled_hard: "Pulled hard",
  never_travelled: "Never travelled",
  possible_physical_issue: "Possible physical issue",
  other_race_day_factor: "Other race-day factor",
} satisfies Record<ReviewTag, string>;

export type TissueValueReviewFamily = "turf" | "aw" | "jump";
export type ReviewStatus = "not_reviewed" | "reviewed";
export type OutcomeSummary = "winner" | "placed_non_winner" | "unplaced" | "non_runner";
export type CouldHaveBeenIdentifiedPreRace = "yes" | "no" | "unclear" | null;
export type ReviewTag = typeof PRE_RACE_REVIEW_TAGS[number] | typeof RACE_EVENT_REVIEW_TAGS[number];

export type TissueValueReview = {
  family: TissueValueReviewFamily;
  raceId: string;
  runnerId: string;
  status: ReviewStatus;
  outcomeSummary: OutcomeSummary;
  tags: ReviewTag[];
  couldHaveBeenIdentifiedPreRace: CouldHaveBeenIdentifiedPreRace;
  note: string;
  reviewedAt: string | null;
  updatedAt: string;
};

export type TissueValueReviewData = {
  version: typeof TISSUE_VALUE_REVIEW_VERSION;
  reviews: TissueValueReview[];
};

export type SaveTissueValueReviewInput = Omit<TissueValueReview, "reviewedAt" | "updatedAt"> & {
  reviewedAt?: string | null;
  updatedAt?: string;
};

export function emptyTissueValueReviewData(): TissueValueReviewData {
  return { version: TISSUE_VALUE_REVIEW_VERSION, reviews: [] };
}

export async function loadTissueValueReviews(path: string = TISSUE_VALUE_REVIEW_PATH): Promise<TissueValueReviewData> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as TissueValueReviewData;
    if (parsed.version !== TISSUE_VALUE_REVIEW_VERSION || !Array.isArray(parsed.reviews)) throw new Error("Unsupported Tissue VALUE review data");
    return { version: TISSUE_VALUE_REVIEW_VERSION, reviews: parsed.reviews.map(normalizeReview) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTissueValueReviewData();
    throw error;
  }
}

export async function mutateTissueValueReviews(
  mutation: (data: TissueValueReviewData) => TissueValueReviewData | Promise<TissueValueReviewData>,
  path: string = TISSUE_VALUE_REVIEW_PATH,
) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((wait) => setTimeout(wait, 10));
    }
  }
  try {
    const original = await loadTissueValueReviews(path);
    const updated = await mutation(original);
    if (JSON.stringify(updated) !== JSON.stringify(original)) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return updated;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function saveTissueValueReview(input: SaveTissueValueReviewInput, path: string = TISSUE_VALUE_REVIEW_PATH) {
  return mutateTissueValueReviews((data) => upsertTissueValueReview(data, input), path);
}

export function upsertTissueValueReview(data: TissueValueReviewData, input: SaveTissueValueReviewInput): TissueValueReviewData {
  const now = input.updatedAt ?? new Date().toISOString();
  const review = normalizeReview({
    ...input,
    note: input.note.trim(),
    reviewedAt: input.status === "reviewed" ? input.reviewedAt ?? now : null,
    updatedAt: now,
  });
  const key = tissueValueReviewKey(review);
  const reviews = data.reviews.filter((candidate) => tissueValueReviewKey(candidate) !== key);
  return { version: TISSUE_VALUE_REVIEW_VERSION, reviews: [...reviews, review].sort(compareReviews) };
}

export function tissueValueReviewKey(input: Pick<TissueValueReview, "family" | "raceId" | "runnerId">) {
  return `${input.family}:${input.raceId}:${input.runnerId}`;
}

export function tissueValueReviewMap(data: TissueValueReviewData): ReadonlyMap<string, TissueValueReview> {
  return new Map(data.reviews.map((review) => [tissueValueReviewKey(review), review]));
}

export function summarizeTissueValueReviews(data: TissueValueReviewData) {
  const reviewed = data.reviews.filter((review) => review.status === "reviewed");
  const reviewedLosers = reviewed.filter((review) => review.outcomeSummary === "placed_non_winner" || review.outcomeSummary === "unplaced");
  const tagCounts = Object.fromEntries(allTags().map((tag) => [tag, 0])) as Record<ReviewTag, number>;
  const resultsByTag = Object.fromEntries(allTags().map((tag) => [tag, emptyOutcomeCounts()])) as Record<ReviewTag, OutcomeCounts>;
  for (const review of reviewed) {
    for (const tag of review.tags) {
      tagCounts[tag] += 1;
      resultsByTag[tag][review.outcomeSummary] += 1;
    }
  }
  return {
    reviewed: reviewed.length,
    reviewedLosers: reviewedLosers.length,
    preRaceTaggedReviews: reviewed.filter((review) => review.tags.some(isPreRaceReviewTag)).length,
    identifiedBeforeRaceYes: reviewed.filter((review) => review.couldHaveBeenIdentifiedPreRace === "yes").length,
    tagCounts,
    resultsByTag,
  };
}

type OutcomeCounts = Record<OutcomeSummary, number>;

function emptyOutcomeCounts(): OutcomeCounts {
  return { winner: 0, placed_non_winner: 0, unplaced: 0, non_runner: 0 };
}

function normalizeReview(input: TissueValueReview): TissueValueReview {
  const tags = [...new Set(input.tags)].filter(isReviewTag);
  return {
    family: assertFamily(input.family),
    raceId: input.raceId,
    runnerId: input.runnerId,
    status: input.status === "reviewed" ? "reviewed" : "not_reviewed",
    outcomeSummary: assertOutcomeSummary(input.outcomeSummary),
    tags,
    couldHaveBeenIdentifiedPreRace: assertCouldHaveBeenIdentifiedPreRace(input.couldHaveBeenIdentifiedPreRace),
    note: input.note,
    reviewedAt: input.status === "reviewed" ? input.reviewedAt : null,
    updatedAt: input.updatedAt,
  };
}

function compareReviews(left: TissueValueReview, right: TissueValueReview) {
  return tissueValueReviewKey(left).localeCompare(tissueValueReviewKey(right));
}

function allTags(): ReviewTag[] {
  return [...PRE_RACE_REVIEW_TAGS, ...RACE_EVENT_REVIEW_TAGS];
}

function isPreRaceReviewTag(value: ReviewTag) {
  return (PRE_RACE_REVIEW_TAGS as readonly string[]).includes(value);
}

function isReviewTag(value: string): value is ReviewTag {
  return (allTags() as string[]).includes(value);
}

function assertFamily(value: string): TissueValueReviewFamily {
  if (value === "turf" || value === "aw" || value === "jump") return value;
  throw new Error(`Unsupported Tissue VALUE review family: ${value}`);
}

function assertOutcomeSummary(value: string): OutcomeSummary {
  if (value === "winner" || value === "placed_non_winner" || value === "unplaced" || value === "non_runner") return value;
  throw new Error(`Unsupported Tissue VALUE review outcome: ${value}`);
}

function assertCouldHaveBeenIdentifiedPreRace(value: string | null): CouldHaveBeenIdentifiedPreRace {
  if (value === null || value === "yes" || value === "no" || value === "unclear") return value;
  throw new Error(`Unsupported pre-race identifiable value: ${value}`);
}
