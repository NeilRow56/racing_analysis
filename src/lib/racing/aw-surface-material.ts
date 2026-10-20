/** Frozen, conservative course-era registry. Dates are inclusive/exclusive.
 * The 2024 starts below bound verified corpus coverage, not installation dates.
 * UNKNOWN is never inferred to be a particular synthetic material.
 */
export const AW_SURFACE_MAPPING_VERSION = "aw_surface_material_v1";
export type AwMaterial = "TAPETA" | "POLYTRACK" | "FIBRESAND" | "UNKNOWN";
export const AW_SURFACE_REGISTRY = [
  { course: "Newcastle", validFrom: "2016-05-17", validTo: null, material: "TAPETA", provenance: "https://www.arenaracingcompany.co.uk/media-centre/news/racing/new-era-for-newcastle-with-successful-first-tapeta-aw-raceday" },
  { course: "Southwell", validFrom: "2020-08-31", validTo: "2020-09-01", material: "FIBRESAND", provenance: "Sporting Life full-result source labels on 2020-08-31; no unverified transition interval filled" },
  { course: "Southwell", validFrom: "2021-12-07", validTo: null, material: "TAPETA", provenance: "https://www.southwell-racecourse.co.uk/news/racing/southwell-s-tapeta-track-celebrates-first-anniversary" },
  { course: "Wolverhampton", validFrom: "2014-09-01", validTo: null, material: "TAPETA", provenance: "https://www.awchampionships.co.uk/participating-racecourses/wolverhampton — August 2014 conversion; first complete month is a conservative supported boundary" },
  ...["Kempton", "Lingfield", "Chelmsford City", "Dundalk"].map(course => ({ course, validFrom: "2024-01-01", validTo: null, material: "POLYTRACK" as const, provenance: ({
    Kempton: "https://www.thejockeyclub.co.uk/kempton/media/news/2021/08/champion-jockey-oisin-murphy-gives-thumbs-up-to-refurbished-surface-at-kempton-park/",
    Lingfield: "https://www.lingfieldpark.co.uk/lingfield-park/history",
    "Chelmsford City": "https://chelmsfordcityracecourse.com/uploads/2021/12/Commercial-Brochure-2020.pdf",
    Dundalk: "https://air.ie/racecourses/dundalk/",
  } as Record<string, string>)[course]! })),
] as const;

export function resolveAwMaterial(input: { course: string; raceDate: string; surface: string | null; aw: boolean }): { material: AwMaterial; reason: string | null } {
  if (!input.aw || !/^\d{4}-\d{2}-\d{2}$/.test(input.raceDate) || !Number.isFinite(Date.parse(input.raceDate)) || new Date(input.raceDate).toISOString().slice(0, 10) !== input.raceDate) return { material: "UNKNOWN", reason: "unsupported_or_undated" };
  const raw = input.surface?.trim().toUpperCase();
  const era = AW_SURFACE_REGISTRY.find(row => row.course.toLowerCase() === input.course.trim().toLowerCase() && input.raceDate >= row.validFrom && (row.validTo === null || input.raceDate < row.validTo));
  const explicit = raw === "TAPETA" || raw === "POLYTRACK" || raw === "FIBRESAND" ? raw : null;
  if (raw && raw !== "ALLWEATHER" && !explicit) return { material: "UNKNOWN", reason: "unsupported_raw_surface" };
  if (explicit && era && explicit !== era.material) return { material: "UNKNOWN", reason: "raw_registry_conflict" };
  // A positive, unconflicted material label can identify eras outside the registry.
  if (explicit) return { material: explicit, reason: null };
  if (era) return { material: era.material, reason: null };
  return { material: "UNKNOWN", reason: "no_verified_material" };
}
