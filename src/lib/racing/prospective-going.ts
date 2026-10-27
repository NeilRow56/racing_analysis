/** Additive research metadata only. Never an input to a scorer or settlement. */
export const EXACT_GOING_CAPTURE_EPOCH = "2026-10-25T16:34:47.000Z";

export type ProspectiveGoing = {
  // Absent on legacy captures; never default these fields into persisted old rows.
  goingRaw?: string | null;
  goingCanonical?: string | null;
};

/** Lexical canonicalisation, not a ground-severity bucket. Preserve every word,
 * including Irish terms and mixed/in-places qualifiers; never map these to Soft.
 */
export function canonicalGoing(raw: string | null | undefined): string | null {
  const value = raw?.trim().toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  return value || null;
}

export function captureProspectiveGoing(raw: string | null | undefined, capturedAt: Date, allWeather = false): ProspectiveGoing {
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt < new Date(EXACT_GOING_CAPTURE_EPOCH)) return {};
  const goingRaw = allWeather ? null : raw ?? null;
  return { goingRaw, goingCanonical: canonicalGoing(goingRaw) };
}

/** Project this capture's own metadata, never another book's or current going. */
export function prospectiveGoingFields(record: ProspectiveGoing): ProspectiveGoing {
  return { goingRaw: record.goingRaw ?? null, goingCanonical: record.goingCanonical ?? null };
}
