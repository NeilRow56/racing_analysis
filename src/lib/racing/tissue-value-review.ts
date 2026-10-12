import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const TISSUE_VALUE_REVIEW_VERSION = "tissue_value_review_v1" as const;
export const TISSUE_VALUE_REVIEW_PATH = "data/research/tissue-value-reviews.json" as const;
export const TISSUE_VALUE_REVIEW_NOTE_MAX_LENGTH = 1000 as const;

export const POST_RACE_REVIEW_TAGS = [
  "NO_OBVIOUS_EXCUSE",
  "HAMPERED",
  "DENIED_CLEAR_RUN",
  "RACED_KEENLY",
  "POOR_JUMP_OR_MISTAKE",
  "PACE_UNSUITABLE",
  "GROUND_UNSUITABLE",
  "TRIP_TOO_SHORT",
  "DID_NOT_STAY",
  "HELD_UP_TOO_FAR_BACK",
  "BAD_DRAW_OR_WIDE_TRIP",
  "WEAKENED_QUICKLY",
  "NEVER_TRAVELLED",
  "NON_COMPLETION",
  "WORTH_FOLLOWING",
  "OTHER",
] as const;

export const REVIEW_TAG_LABELS = {
  NO_OBVIOUS_EXCUSE: "No obvious excuse",
  HAMPERED: "Hampered",
  DENIED_CLEAR_RUN: "Denied clear run",
  RACED_KEENLY: "Raced keenly",
  POOR_JUMP_OR_MISTAKE: "Poor jump / mistake",
  PACE_UNSUITABLE: "Pace unsuitable",
  GROUND_UNSUITABLE: "Ground unsuitable",
  TRIP_TOO_SHORT: "Trip too short",
  DID_NOT_STAY: "Did not stay",
  HELD_UP_TOO_FAR_BACK: "Held up too far back",
  BAD_DRAW_OR_WIDE_TRIP: "Bad draw / wide trip",
  WEAKENED_QUICKLY: "Weakened quickly",
  NEVER_TRAVELLED: "Never travelled",
  NON_COMPLETION: "Non-completion",
  WORTH_FOLLOWING: "Worth following",
  OTHER: "Other",
} satisfies Record<ReviewTag, string>;

export type TissueValueReviewFamily = "turf" | "aw" | "jump";
export type ReviewStatus = "not_reviewed" | "reviewed";
export type OutcomeSummary = "winner" | "placed_non_winner" | "unplaced" | "non_runner";
export type CouldHaveBeenIdentifiedPreRace = "yes" | "no" | "unclear" | null;
export type ReviewTag = typeof POST_RACE_REVIEW_TAGS[number];

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
    note: cleanNote(input.note),
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
    taggedReviews: reviewed.filter((review) => review.tags.length > 0).length,
    tagCounts,
    resultsByTag,
  };
}

type OutcomeCounts = Record<OutcomeSummary, number>;

function emptyOutcomeCounts(): OutcomeCounts {
  return { winner: 0, placed_non_winner: 0, unplaced: 0, non_runner: 0 };
}

function normalizeReview(input: TissueValueReview): TissueValueReview {
  const tags = [...new Set(input.tags.map(normalizeReviewTag).filter(isReviewTag))];
  return {
    family: assertFamily(input.family),
    raceId: input.raceId,
    runnerId: input.runnerId,
    status: input.status === "reviewed" ? "reviewed" : "not_reviewed",
    outcomeSummary: assertOutcomeSummary(input.outcomeSummary),
    tags,
    couldHaveBeenIdentifiedPreRace: assertCouldHaveBeenIdentifiedPreRace(input.couldHaveBeenIdentifiedPreRace),
    note: cleanNote(input.note),
    reviewedAt: input.status === "reviewed" ? input.reviewedAt : null,
    updatedAt: input.updatedAt,
  };
}

function compareReviews(left: TissueValueReview, right: TissueValueReview) {
  return tissueValueReviewKey(left).localeCompare(tissueValueReviewKey(right));
}

function allTags(): ReviewTag[] {
  return [...POST_RACE_REVIEW_TAGS];
}

function isReviewTag(value: string): value is ReviewTag {
  return (allTags() as string[]).includes(value);
}

function cleanNote(value: string) {
  return value.trim().slice(0, TISSUE_VALUE_REVIEW_NOTE_MAX_LENGTH);
}

function normalizeReviewTag(value: string): string {
  return LEGACY_REVIEW_TAG_MAP[value] ?? value;
}

const LEGACY_REVIEW_TAG_MAP: Record<string, ReviewTag> = {
  draw_concern: "BAD_DRAW_OR_WIDE_TRIP",
  going_concern: "GROUND_UNSUITABLE",
  distance_trip_concern: "DID_NOT_STAY",
  class_concern: "OTHER",
  pace_setup_concern: "PACE_UNSUITABLE",
  long_absence_fitness_concern: "OTHER",
  weight_handicap_concern: "OTHER",
  course_suitability_concern: "OTHER",
  other_pre_race_concern: "OTHER",
  poor_start: "OTHER",
  trouble_in_running: "DENIED_CLEAR_RUN",
  wide_trip: "BAD_DRAW_OR_WIDE_TRIP",
  unsuitable_pace: "PACE_UNSUITABLE",
  pulled_hard: "RACED_KEENLY",
  never_travelled: "NEVER_TRAVELLED",
  possible_physical_issue: "OTHER",
  other_race_day_factor: "OTHER",
};

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
