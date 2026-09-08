import { mkdir, readFile, writeFile } from "node:fs/promises";

const YEAR = process.argv[2] ?? "2025";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const RACE_CSV = `data/research/going-adjustment-races-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/jump-subtype-classification-diagnostic-${YEAR}.txt`;

type JumpSubtype = "hurdle" | "chase" | "nh_flat" | "unknown_other";

type RaceRow = {
  race_source_id: string;
  course: string;
  race_name: string;
  race_type: string;
  race_class: string;
  segment: string;
};

async function main() {
  const races = parseRaceRows(await readFile(RACE_CSV, "utf8")).filter(
    (race) => race.segment === "jumps",
  );
  const unknownCurrent = races.filter((race) => currentSubtype(race) === "unknown_other");
  const unknownCorrected = races.filter((race) => correctedSubtype(race) === "unknown_other");
  const structuredClassified = races.filter(
    (race) => subtypeFromText(race.race_type) !== null,
  );

  const lines: string[] = [];
  lines.push(`# Jump Subtype Classification Diagnostic ${YEAR}`);
  lines.push("");
  lines.push("## Scope");
  lines.push(`race_csv=${RACE_CSV}`);
  lines.push("production_changes=false");
  lines.push("");
  lines.push("## Distinct Race Type Values");
  lines.push(...raceTypeCountLines(races));
  lines.push("");
  lines.push("## Race Name Samples By Race Type");
  lines.push(...raceNameSampleLines(races));
  lines.push("");
  lines.push("## Current Classifier Counts");
  lines.push(...subtypeCountLines(races, currentSubtype));
  lines.push("");
  lines.push("## Corrected Classifier Counts");
  lines.push(...subtypeCountLines(races, correctedSubtype));
  lines.push("");
  lines.push("## Structured Race Type Coverage");
  lines.push(
    `structured_type_classified=${structuredClassified.length}/${races.length} (${percent(structuredClassified.length, races.length)})`,
  );
  lines.push(
    `structured_type_reliable=false; race_type is usually generic, so race_name is required as a conservative fallback`,
  );
  lines.push("");
  lines.push("## Current Unknown Other Sample");
  lines.push("race_id | course | race_name | race_type | race_class | current_subtype");
  lines.push(
    ...unknownCurrent.slice(0, 40).map((race) =>
      [
        race.race_source_id,
        race.course,
        quote(race.race_name),
        race.race_type || "-",
        race.race_class || "-",
        currentSubtype(race),
      ].join(" | "),
    ),
  );
  lines.push("");
  lines.push("## Corrected Unknown Other Rows");
  lines.push("race_id | course | race_name | race_type | race_class | corrected_subtype");
  lines.push(
    ...unknownCorrected.map((race) =>
      [
        race.race_source_id,
        race.course,
        quote(race.race_name),
        race.race_type || "-",
        race.race_class || "-",
        correctedSubtype(race),
      ].join(" | "),
    ),
  );
  lines.push("");
  lines.push("## Extreme Example Classification");
  for (const raceId of ["856826", "891843", "836815"]) {
    const race = races.find((row) => row.race_source_id === raceId);
    lines.push(
      race
        ? [
            "example",
            `race=${raceId}`,
            `course=${race.course}`,
            `race_type=${race.race_type || "-"}`,
            `race_class=${race.race_class || "-"}`,
            `current_subtype=${currentSubtype(race)}`,
            `corrected_subtype=${correctedSubtype(race)}`,
            `race_name=${quote(race.race_name)}`,
          ].join(" | ")
        : `example | race=${raceId} | status=missing`,
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
}

function currentSubtype(race: Pick<RaceRow, "race_type" | "race_name">): JumpSubtype {
  const raceType = normalize(race.race_type);
  const raceName = normalize(race.race_name);
  const source = raceType || raceName;
  return subtypeFromText(source) ?? "unknown_other";
}

function correctedSubtype(race: Pick<RaceRow, "race_type" | "race_name">): JumpSubtype {
  return subtypeFromText(race.race_name) ?? subtypeFromText(race.race_type) ?? "unknown_other";
}

function subtypeFromText(value: string): Exclude<JumpSubtype, "unknown_other"> | null {
  const text = normalize(value);
  if (!text) {
    return null;
  }
  if (
    /\bnh flat\b/.test(text) ||
    /\bnational hunt flat\b/.test(text) ||
    /\bbumper\b/.test(text)
  ) {
    return "nh_flat";
  }
  if (/\bhurdles?\b/.test(text)) {
    return "hurdle";
  }
  if (/\bchase\b/.test(text) || /\bsteeplechase\b/.test(text)) {
    return "chase";
  }
  return null;
}

function raceTypeCountLines(races: RaceRow[]): string[] {
  return sortedCountEntries(groupBy(races, (race) => race.race_type || "(blank)")).map(
    ([raceType, rows]) => `race_type_count | race_type=${quote(raceType)} | races=${rows.length}`,
  );
}

function raceNameSampleLines(races: RaceRow[]): string[] {
  return sortedCountEntries(groupBy(races, (race) => race.race_type || "(blank)")).map(
    ([raceType, rows]) => {
      const samples = unique(rows.map((race) => race.race_name)).slice(0, 6);
      return `race_type_sample | race_type=${quote(raceType)} | samples=${samples.map(quote).join("; ")}`;
    },
  );
}

function subtypeCountLines(
  races: RaceRow[],
  classify: (race: RaceRow) => JumpSubtype,
): string[] {
  const grouped = groupBy(races, classify);
  return subtypeOrder().map((subtype) => {
    const rows = grouped.get(subtype) ?? [];
    return `subtype_count | subtype=${subtype} | races=${rows.length} | pct=${percent(rows.length, races.length)}`;
  });
}

function parseRaceRows(text: string): RaceRow[] {
  const records = parseCsv(text);
  return records.map((row) => ({
    race_source_id: row.race_source_id,
    course: row.course,
    race_name: row.race_name,
    race_type: row.race_type,
    race_class: row.race_class,
    segment: row.segment,
  }));
}

function parseCsv(text: string): Array<Record<string, string>> {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
}

function subtypeOrder(): JumpSubtype[] {
  return ["hurdle", "chase", "nh_flat", "unknown_other"];
}

function groupBy<T>(rows: T[], keyForRow: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function sortedCountEntries<T>(map: Map<string, T[]>): Array<[string, T[]]> {
  return [...map.entries()].sort(([, aRows], [, bRows]) => bRows.length - aRows.length);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function percent(count: number, total: number): string {
  return total === 0 ? "0.00%" : `${((count / total) * 100).toFixed(2)}%`;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
