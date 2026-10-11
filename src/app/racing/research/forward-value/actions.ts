"use server";

import { revalidatePath } from "next/cache";
import {
  RACE_EVENT_REVIEW_TAGS,
  PRE_RACE_REVIEW_TAGS,
  saveTissueValueReview,
  type CouldHaveBeenIdentifiedPreRace,
  type OutcomeSummary,
  type ReviewStatus,
  type ReviewTag,
  type TissueValueReviewFamily,
} from "@/lib/racing/tissue-value-review";

const TAGS = new Set<string>([...PRE_RACE_REVIEW_TAGS, ...RACE_EVENT_REVIEW_TAGS]);

export async function saveTissueValueReviewAction(formData: FormData) {
  const family = stringValue(formData, "family");
  const raceId = stringValue(formData, "raceId");
  const runnerId = stringValue(formData, "runnerId");
  const status = stringValue(formData, "status");
  const outcomeSummary = stringValue(formData, "outcomeSummary");
  const identified = optionalStringValue(formData, "couldHaveBeenIdentifiedPreRace");
  const note = stringValue(formData, "note", "");
  const tags = formData.getAll("tags").map(String).filter((tag): tag is ReviewTag => TAGS.has(tag));

  await saveTissueValueReview({
    family: assertFamily(family),
    raceId,
    runnerId,
    status: assertStatus(status),
    outcomeSummary: assertOutcomeSummary(outcomeSummary),
    tags,
    couldHaveBeenIdentifiedPreRace: assertCouldHaveBeenIdentifiedPreRace(identified),
    note,
  });
  revalidatePath("/racing/research/forward-value");
}

function stringValue(formData: FormData, key: string, fallback?: string) {
  const value = formData.get(key);
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing ${key}`);
}

function optionalStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function assertFamily(value: string): TissueValueReviewFamily {
  if (value === "turf" || value === "aw" || value === "jump") return value;
  throw new Error(`Unsupported Tissue VALUE review family: ${value}`);
}

function assertStatus(value: string): ReviewStatus {
  if (value === "not_reviewed" || value === "reviewed") return value;
  throw new Error(`Unsupported review status: ${value}`);
}

function assertOutcomeSummary(value: string): OutcomeSummary {
  if (value === "winner" || value === "placed_non_winner" || value === "unplaced" || value === "non_runner") return value;
  throw new Error(`Unsupported outcome summary: ${value}`);
}

function assertCouldHaveBeenIdentifiedPreRace(value: string | null): CouldHaveBeenIdentifiedPreRace {
  if (value === null || value === "yes" || value === "no" || value === "unclear") return value;
  throw new Error(`Unsupported pre-race identifiable value: ${value}`);
}
