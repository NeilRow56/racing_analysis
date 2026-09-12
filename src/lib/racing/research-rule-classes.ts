export function normalizeRaceClasses(values: Iterable<unknown> | undefined): number[] | undefined {
  if (!values) return undefined;
  const classes = [...values]
    .map(raceClassNumber)
    .filter((value): value is number => value !== null);
  const unique = [...new Set(classes)].sort((left, right) => left - right);
  return unique.length > 0 ? unique : undefined;
}

export function raceClassNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const match = /^\s*(?:class\s*)?(\d+)\s*$/i.exec(value);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
