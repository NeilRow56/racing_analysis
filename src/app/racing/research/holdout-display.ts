import type { SavedResearchRule } from "@/lib/racing/saved-research-rules";

export function holdoutRangeText(snapshot: NonNullable<SavedResearchRule["holdoutSnapshot"]>): string {
  return `${snapshot.holdoutFrom} to ${snapshot.holdoutTo}`;
}
